import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "../helpers.js";
import { privateRateLimit } from "../common.js";
import { OkxApiError, ValidationError } from "../../utils/errors.js";

const BASE = "/api/v5/tradingBot/smart-portfolio";

/** Validate and truncate deltaRatio: floor(x*100)/100 must be in [0.01, 1). */
function validateDeltaRatio(raw: string, endpoint: string): string {
  const n = Number(raw);
  if (isNaN(n)) {
    throw new ValidationError(`deltaRatio must be a number, got: ${raw}`);
  }
  const truncated = Math.floor(n * 100) / 100;
  if (truncated < 0.01) {
    throw new ValidationError(
      `deltaRatio too small: ${raw} truncates to ${truncated.toFixed(2)}, minimum is 0.01`,
      `Use a deltaRatio >= 0.01 (e.g. "0.05" for 5%)`,
    );
  }
  if (truncated >= 1) {
    throw new ValidationError(
      `deltaRatio too large: ${raw} truncates to ${truncated.toFixed(2)}, must be < 1`,
      `Use a deltaRatio < 1 (e.g. "0.05" for 5%)`,
    );
  }
  return String(truncated);
}

interface PortfolioItem {
  ccy: string;
  ratio: string;
}

/** Validate and normalize portfolioList: trim/uppercase CCY, check dedup, check ratio sum = 1. */
function validateAndNormalizePortfolioList(
  raw: unknown,
  endpoint: string,
): PortfolioItem[] {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new ValidationError(
      `portfolioList must have at least 2 items, got ${Array.isArray(raw) ? raw.length : "non-array"}`,
    );
  }

  const normalized: PortfolioItem[] = (raw as Record<string, unknown>[]).map((item) => {
    const ccy = String(item["ccy"] ?? "").trim().toUpperCase();
    const ratio = String(item["ratio"] ?? "");
    if (!ccy) throw new ValidationError("Each portfolioList item must have a non-empty ccy");
    if (!ratio) throw new ValidationError("Each portfolioList item must have a non-empty ratio");
    return { ccy, ratio };
  });

  // Check for duplicate CCYs
  const seen = new Set<string>();
  for (const item of normalized) {
    if (seen.has(item.ccy)) {
      throw new ValidationError(`Duplicate CCY in portfolioList after normalization: ${item.ccy}`);
    }
    seen.add(item.ccy);
  }

  // Check ratio sum == 1.0 (allow small floating point tolerance)
  const sum = normalized.reduce((acc, item) => acc + Number(item.ratio), 0);
  if (Math.abs(sum - 1.0) > 0.0001) {
    throw new ValidationError(
      `portfolioList ratio values must sum to 1.0, got ${sum.toFixed(6)}`,
      `Ensure the ratio values in portfolioList add up to exactly 1.0`,
    );
  }

  return normalized;
}

/** For tool 1 (create): check outer sCode in data items. */
function normalizeWriteCreate(response: {
  endpoint: string;
  requestTime: string;
  data: unknown;
}): Record<string, unknown> {
  const data = response.data;
  if (Array.isArray(data) && data.length > 0) {
    const failed = data.filter(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        "sCode" in (item as object) &&
        (item as Record<string, unknown>)["sCode"] !== "0",
    ) as Record<string, unknown>[];
    if (failed.length > 0) {
      const messages = failed.map(
        (item) => `[${item["sCode"]}] ${item["sMsg"] ?? "Operation failed"}`,
      );
      throw new OkxApiError(messages.join("; "), {
        code: String(failed[0]!["sCode"] ?? ""),
        endpoint: response.endpoint,
      });
    }
  }
  return {
    endpoint: response.endpoint,
    requestTime: response.requestTime,
    data,
  };
}

/** For tool 5 (stop): pass through as-is (response has no clOrdId or sCode). */
function normalizeWriteStop(response: {
  endpoint: string;
  requestTime: string;
  data: unknown;
}): Record<string, unknown> {
  return {
    endpoint: response.endpoint,
    requestTime: response.requestTime,
    data: response.data,
  };
}

/** For tool 8: strip profitHistory from each item's defaultBacktestYield. */
function stripProfitHistory(data: unknown): unknown {
  if (!Array.isArray(data)) return data;
  return data.map((item: unknown) => {
    if (item !== null && typeof item === "object") {
      const obj = { ...(item as Record<string, unknown>) };
      if (
        obj["defaultBacktestYield"] !== null &&
        typeof obj["defaultBacktestYield"] === "object"
      ) {
        const yield_ = { ...(obj["defaultBacktestYield"] as Record<string, unknown>) };
        delete yield_["profitHistory"];
        obj["defaultBacktestYield"] = yield_;
      }
      return obj;
    }
    return item;
  });
}

export function registerSmartPortfolioTools(): ToolSpec[] {
  return [
    // ── Tool 1: Create ─────────────────────────────────────────────────────────
    {
      name: "smart_portfolio_create_order",
      title: "Smart Portfolio Create",
      module: "bot.smartportfolio",
      description:
        "Create a Smart Portfolio bot. [CAUTION] Real trades. " +
        "Allocate across 2–10 assets with specified ratios summing to 1.0. " +
        "The bot auto-rebalances when allocation drifts beyond deltaRatio. " +
        "investmentCcy is the quote currency (USDT or USDC). " +
        "portfolioList items: {ccy, ratio} — CCY is case-insensitive, must be unique.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          investmentCcy: {
            type: "string",
            description: "Quote currency for valuing the portfolio (USDT or USDC)",
          },
          portfolioList: {
            type: "string",
            description:
              "JSON array of {ccy, ratio} objects. Must have 2–10 items. " +
              "Ratios must sum to 1.0. CCYs must be unique. " +
              'Example: [{\"ccy\":\"BTC\",\"ratio\":\"0.6\"},{\"ccy\":\"ETH\",\"ratio\":\"0.4\"}]',
          },
          deltaRatio: {
            type: "string",
            description: "Rebalance trigger threshold (e.g. '0.05' for 5%). Minimum 0.01, must be < 1.",
          },
          interval: {
            type: "string",
            description: "Periodic rebalance interval in seconds (optional). 0 = disable periodic rebalance.",
          },
        },
        required: ["investmentCcy", "portfolioList", "deltaRatio"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const investmentCcy = requireString(args, "investmentCcy");
        const portfolioListRaw = requireString(args, "portfolioList");
        const deltaRatioRaw = requireString(args, "deltaRatio");

        let portfolioListParsed: unknown;
        try {
          portfolioListParsed = JSON.parse(portfolioListRaw);
        } catch {
          throw new ValidationError(
            `portfolioList is not valid JSON: ${portfolioListRaw}`,
            `Provide portfolioList as a JSON array, e.g. [{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]`,
          );
        }

        const portfolioList = validateAndNormalizePortfolioList(portfolioListParsed, `${BASE}/order-algo`);
        const deltaRatio = validateDeltaRatio(deltaRatioRaw, `${BASE}/order-algo`);
        const interval = readString(args, "interval");

        const response = await context.client.privatePost(
          `${BASE}/order-algo`,
          compactObject({
            investmentCcy,
            portfolioList,
            deltaRatio,
            interval,
            tag: context.config.sourceTag,
          }),
          privateRateLimit("smart_portfolio_create_order", 20),
        );
        return normalizeWriteCreate(response);
      },
    },

    // ── Tool 2: Get Pending Orders ──────────────────────────────────────────────
    {
      name: "smart_portfolio_get_orders",
      title: "Smart Portfolio List Orders",
      module: "bot.smartportfolio",
      description:
        "List pending (running) Smart Portfolio bots. " +
        "Returns algoId, state, investmentCcy, portfolioList, and performance fields.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Filter by algo order ID" },
          after: { type: "string", description: "Pagination cursor (older data)" },
          before: { type: "string", description: "Pagination cursor (newer data)" },
          limit: { type: "number", description: "Number of results (default 20, max 100)" },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-pending`,
          compactObject({
            algoId: readString(args, "algoId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("smart_portfolio_get_orders", 20),
        );
        return normalizeResponse(response);
      },
    },

    // ── Tool 3: Get Orders History ──────────────────────────────────────────────
    {
      name: "smart_portfolio_get_orders_history",
      title: "Smart Portfolio Orders History",
      module: "bot.smartportfolio",
      description:
        "List historical (stopped) Smart Portfolio bots. " +
        "Filter by state: 'stopped' (user stopped) or 'filled' (closed by TP/SL). " +
        "Use instType to filter by instrument type (SPOT, MARGIN, etc.).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          state: {
            type: "string",
            enum: ["stopped", "filled"],
            description: "Filter by terminal state",
          },
          instType: {
            type: "string",
            description: "Instrument type filter (e.g. SPOT)",
          },
          algoId: { type: "string", description: "Filter by algo order ID" },
          after: { type: "string", description: "Pagination cursor (older data)" },
          before: { type: "string", description: "Pagination cursor (newer data)" },
          limit: { type: "number", description: "Number of results (default 20, max 100)" },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-history`,
          compactObject({
            state: readString(args, "state"),
            instType: readString(args, "instType"),
            algoId: readString(args, "algoId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("smart_portfolio_get_orders_history", 20),
        );
        return normalizeResponse(response);
      },
    },

    // ── Tool 4: Get Order Details ───────────────────────────────────────────────
    {
      name: "smart_portfolio_get_order_details",
      title: "Smart Portfolio Get Detail",
      module: "bot.smartportfolio",
      description:
        "Get details of a Smart Portfolio bot by algoId. " +
        "Returns current allocation, unrealized PnL, rebalance history, and bot settings.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Algo order ID" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const response = await context.client.privateGet(
          `${BASE}/order-algo`,
          { algoId },
          privateRateLimit("smart_portfolio_get_order_details", 20),
        );
        return normalizeResponse(response);
      },
    },

    // ── Tool 5: Stop Order ──────────────────────────────────────────────────────
    {
      name: "smart_portfolio_stop_order",
      title: "Smart Portfolio Stop",
      module: "bot.smartportfolio",
      description:
        "[CAUTION] Stop a running Smart Portfolio bot — real trades, irreversible. " +
        "Workflow: (1) Call smart_portfolio_get_orders to confirm the bot is running. " +
        "(2) Call this tool with the algoId to stop it. " +
        "All assets remain in the account after stopping.",
      isWrite: true,
      idempotentHint: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Algo order ID to stop" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const response = await context.client.privatePost(
          `${BASE}/stop-order-algo`,
          { algoId },
          privateRateLimit("smart_portfolio_stop_order", 20),
        );
        return normalizeWriteStop(response);
      },
    },

    // ── Tool 6: Amend Rebalance ─────────────────────────────────────────────────
    {
      name: "smart_portfolio_amend_rebalance",
      title: "Smart Portfolio Amend Rebalance",
      module: "bot.smartportfolio",
      description:
        "Amend the rebalance parameters (target allocation, deltaRatio, or interval) of a running Smart Portfolio bot. " +
        "portfolioList, deltaRatio, and interval are all optional; provide only the fields to change. " +
        "If portfolioList is provided, the same validation rules apply as for create.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Algo order ID to amend" },
          portfolioList: {
            type: "string",
            description:
              "New JSON array of {ccy, ratio} objects (optional). Same validation as create.",
          },
          deltaRatio: {
            type: "string",
            description: "New rebalance trigger threshold (optional).",
          },
          interval: {
            type: "string",
            description: "New periodic rebalance interval in seconds (optional).",
          },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");

        let portfolioList: PortfolioItem[] | undefined;
        const portfolioListRaw = readString(args, "portfolioList");
        if (portfolioListRaw !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(portfolioListRaw);
          } catch {
            throw new ValidationError(`portfolioList is not valid JSON: ${portfolioListRaw}`);
          }
          portfolioList = validateAndNormalizePortfolioList(parsed, `${BASE}/amend-rebalance`);
        }

        let deltaRatio: string | undefined;
        const deltaRatioRaw = readString(args, "deltaRatio");
        if (deltaRatioRaw !== undefined) {
          deltaRatio = validateDeltaRatio(deltaRatioRaw, `${BASE}/amend-rebalance`);
        }

        const interval = readString(args, "interval");

        const response = await context.client.privatePost(
          `${BASE}/amend-rebalance`,
          compactObject({ algoId, portfolioList, deltaRatio, interval }),
          privateRateLimit("smart_portfolio_amend_rebalance", 20),
        );
        // Tool 6: data is always [] — only check outer code (done by normalizeResponse)
        return normalizeResponse(response);
      },
    },

    // ── Tool 7: Instant Rebalance ───────────────────────────────────────────────
    {
      name: "smart_portfolio_instant_rebalance",
      title: "Smart Portfolio Instant Rebalance",
      module: "bot.smartportfolio",
      description:
        "Trigger an immediate rebalance for a running Smart Portfolio bot. " +
        "Returns triggered: true if rebalance was successfully triggered, false if not executed " +
        "(e.g. portfolio already balanced or conditions not met).",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Algo order ID to rebalance" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const response = await context.client.privatePost(
          `${BASE}/instant-rebalance`,
          { algoId },
          privateRateLimit("smart_portfolio_instant_rebalance", 20),
        );
        // Tool 7: triggered is Boolean, pass through as-is
        return {
          endpoint: response.endpoint,
          requestTime: response.requestTime,
          data: response.data,
        };
      },
    },

    // ── Tool 8: Get Recommend Zones ─────────────────────────────────────────────
    {
      name: "smart_portfolio_get_recommend_zones",
      title: "Smart Portfolio Get Recommended Zones",
      module: "bot.smartportfolio",
      description:
        "Browse OKX-recommended Smart Portfolio configurations (zones). " +
        "Each zone has a predefined asset allocation, deltaRatio, and interval. " +
        "Use zoneId from the result to run a backtest with smart_portfolio_get_zones_backtest. " +
        "investCcy is the valuation currency for the portfolio (USDT or USDC).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          investCcy: {
            type: "string",
            description: "Valuation currency for zones (USDT or USDC)",
          },
          ccy: {
            type: "string",
            description: "Filter zones containing a specific asset (optional)",
          },
          limit: {
            type: "number",
            description: "Number of results (default 20, max 100)",
          },
        },
        required: ["investCcy"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const investCcy = requireString(args, "investCcy");
        const response = await context.client.privateGet(
          `${BASE}/recommend-zones`,
          compactObject({
            investCcy,
            ccy: readString(args, "ccy"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("smart_portfolio_get_recommend_zones", 20),
        );
        // Strip profitHistory from each zone's defaultBacktestYield (too large for context)
        const cleaned = stripProfitHistory(response.data);
        return {
          endpoint: response.endpoint,
          requestTime: response.requestTime,
          data: cleaned,
        };
      },
    },

    // ── Tool 9: Get Zones Backtest ──────────────────────────────────────────────
    {
      name: "smart_portfolio_get_zones_backtest",
      title: "Smart Portfolio Get Zones Backtest",
      module: "bot.smartportfolio",
      description:
        "Get historical backtest results for a specific recommended zone. " +
        "Use zoneId from smart_portfolio_get_recommend_zones. " +
        "period controls the backtest window: '1W', '1M', '3M', '6M', '1Y' (case-insensitive). " +
        "Returns annualized yield, max drawdown, and performance vs buy-and-hold.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          investCcy: {
            type: "string",
            description: "Valuation currency (must match the zone's investCcy)",
          },
          zoneId: {
            type: "string",
            description: "Zone ID from smart_portfolio_get_recommend_zones",
          },
          period: {
            type: "string",
            description: "Backtest period: 1W, 1M, 3M, 6M, or 1Y (case-insensitive)",
          },
        },
        required: ["investCcy", "zoneId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const investCcy = requireString(args, "investCcy");
        const zoneId = requireString(args, "zoneId");
        const period = readString(args, "period");

        const response = await context.client.privateGet(
          `${BASE}/zones-backtest`,
          compactObject({
            investCcy,
            zoneId,
            // period is case-insensitive per API; pass through as provided
            period,
          }),
          privateRateLimit("smart_portfolio_get_zones_backtest", 20),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
