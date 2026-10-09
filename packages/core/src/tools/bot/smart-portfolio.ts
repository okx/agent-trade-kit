import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readString,
  requireString,
} from "../helpers.js";
import { privateRateLimit } from "../common.js";
import { OkxApiError, ValidationError } from "../../utils/errors.js";

const BASE = "/api/v5/tradingBot/smart-portfolio";

/** Validate and truncate deltaRatio: floor(x*100)/100 must be in [0.01, 1). */
function validateDeltaRatio(raw: string): string {
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
  return truncated.toFixed(2);
}

interface PortfolioItem {
  ccy: string;
  ratio: string;
}

/** Validate and normalize portfolioList: trim/uppercase CCY, check dedup, check ratio sum = 1. */
function validateAndNormalizePortfolioList(raw: unknown): PortfolioItem[] {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new ValidationError(
      `portfolioList must have at least 2 items, got ${Array.isArray(raw) ? raw.length : "non-array"}`,
    );
  }
  if (raw.length > 10) {
    throw new ValidationError(
      `portfolioList must have at most 10 items, got ${raw.length}`,
      `Provide 2–10 unique assets in portfolioList`,
    );
  }

  const normalized: PortfolioItem[] = (raw as Record<string, unknown>[]).map((item) => {
    const ccy = String(item["ccy"] ?? "").trim().toUpperCase();
    const ratio = String(item["ratio"] ?? "");
    if (!ccy) throw new ValidationError("Each portfolioList item must have a non-empty ccy");
    if (!ratio) throw new ValidationError("Each portfolioList item must have a non-empty ratio");
    if (isNaN(Number(ratio))) {
      throw new ValidationError(`portfolioList ratio "${ratio}" is not a valid number`);
    }
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

/** For write operations that return sCode per item (tools 1 and 5). */
function normalizeWriteScode(response: {
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
        "investmentCcy is the quote/valuation currency (USDT, USDC, or USD). " +
        "portfolioList items: {ccy, ratio} — CCY is case-insensitive, must be unique.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          stgyName: {
            type: "string",
            description: "Strategy name",
          },
          investmentCcy: {
            type: "string",
            description: "Valuation currency (USDT, USDC, or USD). Missing or blank is rejected.",
          },
          initCapital: {
            type: "string",
            description: "Planned initial investment amount (e.g. '3000')",
          },
          portfolioList: {
            type: "string",
            description:
              "JSON array of {ccy, ratio} objects. Must have 2–10 items. " +
              "Ratios must sum to 1.0. CCYs must be unique. " +
              'Example: [{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]',
          },
          interval: {
            type: "string",
            description: "Rebalance interval in minutes (e.g. '20'). Required.",
          },
          deltaRatio: {
            type: "string",
            description: "Rebalance trigger threshold (e.g. '0.05' for 5%). Minimum 0.01, must be < 1.",
          },
          tradeQuoteCcy: {
            type: "string",
            description: "Actual debit currency; defaults to investmentCcy if omitted.",
          },
          investType: {
            type: "string",
            enum: ["simple", "complex"],
            description: "simple (default): invest specified amount in investmentCcy; complex: server calculates asset transfers.",
          },
          algoClOrdId: {
            type: "string",
            description: "Client strategy ID, up to 32 alphanumeric characters (optional).",
          },
        },
        required: ["stgyName", "investmentCcy", "initCapital", "portfolioList", "interval", "deltaRatio"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const stgyName = requireString(args, "stgyName");
        const investmentCcy = requireString(args, "investmentCcy");
        const initCapital = requireString(args, "initCapital");
        const portfolioListRaw = requireString(args, "portfolioList");
        const interval = requireString(args, "interval");
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

        const portfolioList = validateAndNormalizePortfolioList(portfolioListParsed);
        const deltaRatio = validateDeltaRatio(deltaRatioRaw);

        const response = await context.client.privatePost(
          `${BASE}/order-algo`,
          compactObject({
            stgyName,
            investmentCcy,
            initCapital,
            portfolioList,
            interval,
            deltaRatio,
            tradeQuoteCcy: readString(args, "tradeQuoteCcy"),
            investType: readString(args, "investType"),
            algoClOrdId: readString(args, "algoClOrdId"),
            tag: context.config.sourceTag,
          }),
          privateRateLimit("smart_portfolio_create_order", 20),
        );
        return normalizeWriteScode(response);
      },
    },

    // ── Tool 2: Get Pending Orders ──────────────────────────────────────────────
    {
      name: "smart_portfolio_get_orders",
      title: "Smart Portfolio List Orders",
      module: "bot.smartportfolio",
      description:
        "List running Smart Portfolio bots. " +
        "Returns algoId, stgyName, investCcy, portfolioList, totalPnl, pnlRatio, and state. " +
        "Filter by instId (instrument pair) or algoId (strategy ID).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Filter by algo order ID" },
          instId: { type: "string", description: "Filter by instrument (e.g. BTC-USDT)" },
          after: { type: "string", description: "Pagination cursor (older data)" },
          before: { type: "string", description: "Pagination cursor (newer data)" },
          limit: { type: "string", description: "Number of results (1–100, default 100)" },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-pending`,
          compactObject({
            algoId: readString(args, "algoId"),
            instId: readString(args, "instId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readString(args, "limit"),
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
        "Recommended state filter: 'stopped'. " +
        "Filter by instType (e.g. SPOT) or instId.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          state: {
            type: "string",
            description: "Filter by terminal state (e.g. 'stopped')",
          },
          instType: {
            type: "string",
            description: "Instrument type filter (SPOT recommended; omit to get all)",
          },
          algoId: { type: "string", description: "Filter by algo order ID" },
          instId: { type: "string", description: "Filter by instrument" },
          after: { type: "string", description: "Pagination cursor (older data)" },
          before: { type: "string", description: "Pagination cursor (newer data)" },
          limit: { type: "string", description: "Number of results (1–100, default 100)" },
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
            instId: readString(args, "instId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readString(args, "limit"),
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
        "Returns current allocation (portfolioList), investCcy, totalPnl, pnlRatio, interval, deltaRatio, and state. " +
        "Returns a 'not found' result when the strategy does not exist, does not belong to the caller, or is a different type.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Smart Portfolio strategy ID" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-details`,
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
        "stopType is required: '1' = stop and sell all assets; '2' = stop but keep assets. " +
        "Workflow: (1) Call smart_portfolio_get_orders to find the target bot and confirm it is running. " +
        "(2) Confirm stopType with the user before proceeding. " +
        "(3) Call this tool. Assets remain in the account when stopType='2'.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Smart Portfolio strategy ID to stop" },
          stopType: {
            type: "string",
            enum: ["1", "2"],
            description: "1 = stop and sell all assets; 2 = stop but keep assets",
          },
        },
        required: ["algoId", "stopType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const stopType = requireString(args, "stopType");
        const response = await context.client.privatePost(
          `${BASE}/stop-order-algo`,
          { algoId, stopType },
          privateRateLimit("smart_portfolio_stop_order", 20),
        );
        return normalizeWriteScode(response);
      },
    },

    // ── Tool 6: Amend Rebalance ─────────────────────────────────────────────────
    {
      name: "smart_portfolio_amend_rebalance",
      title: "Smart Portfolio Amend Rebalance",
      module: "bot.smartportfolio",
      description:
        "Amend the rebalance parameters of a running Smart Portfolio bot. " +
        "Both deltaRatio and interval are required on every call. " +
        "deltaRatio must be >= 0.01 (1%) and < 1 (100%). " +
        "If both values equal the bot's current settings, the request is rejected (no actual change).",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Smart Portfolio strategy ID to amend" },
          deltaRatio: {
            type: "string",
            description: "New rebalance trigger threshold. Must be >= 0.01 and < 1.",
          },
          interval: {
            type: "string",
            description: "New periodic rebalance interval in minutes.",
          },
        },
        required: ["algoId", "deltaRatio", "interval"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");

        const deltaRatioRaw = requireString(args, "deltaRatio");
        const deltaRatio = validateDeltaRatio(deltaRatioRaw);

        const interval = requireString(args, "interval");

        const response = await context.client.privatePost(
          `${BASE}/amend-rebalance`,
          compactObject({ algoId, deltaRatio, interval }),
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
        "Returns triggered: true if the rebalance event was accepted — this does NOT mean trades have executed. " +
        "Do not update position knowledge based solely on this result.",
      isWrite: true,
      destructiveHint: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Smart Portfolio strategy ID to rebalance" },
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
        // triggered is Boolean in data items; pass through as-is
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
        "Browse OKX-recommended Smart Portfolio configurations. " +
        "Each zone has a predefined asset allocation (stgyParam.portfolioList), deltaRatio, and interval ready to use for create. " +
        "Returns recommendId — pass it to smart_portfolio_get_zones_backtest to get the full backtest curve. " +
        "Filter by assetType: 'Crypto' or 'TradeFi'. Use recommendId to fetch a specific zone.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          recommendId: {
            type: "string",
            description: "Positive integer ID of a specific recommended zone (optional). When provided, assetType filter is ignored.",
          },
          assetType: {
            type: "string",
            description: "Filter by asset type: 'Crypto' or 'TradeFi' (case-insensitive). Omit to get all zones.",
          },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/recommend-zones`,
          compactObject({
            recommendId: readString(args, "recommendId"),
            assetType: readString(args, "assetType"),
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
        "Get full backtest results for a specific recommended zone by recommendId. " +
        "Use recommendId from smart_portfolio_get_recommend_zones. " +
        "period controls the backtest window: 24H, 7D, 1M, 3M, 6M, 1Y, 2Y (case-insensitive). " +
        "Returns pnlRatio, apy, and profitHistory curve. " +
        "The actual returned period may differ from requested when data is unavailable.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          recommendId: {
            type: "string",
            description: "Recommended zone ID from smart_portfolio_get_recommend_zones",
          },
          period: {
            type: "string",
            description: "Backtest period: 24H, 7D, 1M, 3M, 6M, 1Y, 2Y (case-insensitive). Omit to use default period.",
          },
        },
        required: ["recommendId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const recommendId = requireString(args, "recommendId");
        const period = readString(args, "period");

        const response = await context.client.privateGet(
          `${BASE}/zones-backtest`,
          compactObject({ recommendId, period }),
          privateRateLimit("smart_portfolio_get_zones_backtest", 20),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
