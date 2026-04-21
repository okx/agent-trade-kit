import type { ToolSpec, ToolArgs, ToolContext } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readString,
  requireString,
} from "./helpers.js";
import { publicRateLimit } from "./common.js";
import { ConfigError, ValidationError } from "../utils/errors.js";

/* ------------------------------------------------------------------ */
/*  API path constants                                                 */
/*  Uses privateGet (requires API key) to drive user conversion —      */
/*  users must connect credentials before accessing smart money data.  */
/* ------------------------------------------------------------------ */
const PATH_LEADERBOARD = "/api/v5/orbit/public/leaderboard";
const PATH_POSITION_CURRENT = "/api/v5/orbit/public/position-current";
const PATH_TRADE_RECORDS = "/api/v5/orbit/public/trade-records";
const PATH_OVERVIEW = "/api/v5/journal/public/smartmoney/overview";
const PATH_SIGNAL = "/api/v5/journal/public/smartmoney/signal";
const PATH_SIGNAL_HISTORY = "/api/v5/journal/public/smartmoney/signal-history";

/* ------------------------------------------------------------------ */
/*  Shared trader-pool filter properties & reader                      */
/* ------------------------------------------------------------------ */

/** Signal endpoints use enum-based tiers for pool filters. */
const SIGNAL_POOL_FILTER_PROPS = {
  sortType: {
    type: "string" as const,
    description: "pnl or pnlRatio",
  },
  period: {
    type: "string" as const,
    description: "3|7|30|90 days",
  },
  pnl: {
    type: "string" as const,
    description: "PNL_ANY|PNL_TOP50|PNL_TOP20|PNL_TOP5",
  },
  winRatio: {
    type: "string" as const,
    description: "WR_ANY|WR_GE_50|WR_GE_80",
  },
  maxRetreat: {
    type: "string" as const,
    description: "MR_ANY|MR_LE_20|MR_LE_50",
  },
  asset: {
    type: "string" as const,
    description: "AUM_ANY|AUM_TOP50|AUM_TOP20|AUM_TOP5",
  },
};

/** Leaderboard endpoint uses numeric thresholds for pool filters. */
const LEADERBOARD_POOL_FILTER_PROPS = {
  sortType: {
    type: "string" as const,
    description: "pnl or pnl_ratio",
  },
  period: {
    type: "string" as const,
    description: "3|7|30|90 days, empty=all",
  },
  pnl: {
    type: "string" as const,
    description: "Min PnL USD",
  },
  winRatio: {
    type: "string" as const,
    description: "Min ratio (0.8=80%)",
  },
  maxRetreat: {
    type: "string" as const,
    description: "Max DD (0.1=10%)",
  },
  asset: {
    type: "string" as const,
    description: "Min AUM USD",
  },
};

const POOL_FILTER_KEYS = ["sortType", "period", "pnl", "winRatio", "maxRetreat", "asset"] as const;

/** Read flat pool-filter params from args and return them for the API request. */
function readPoolFilters(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of POOL_FILTER_KEYS) {
    const val = readString(args, key);
    if (val) result[key] = val;
  }
  return result;
}

/** Ensure leaderboard data is always a flat array. */
function extractLeaderboardData(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  // API returns { data: [...], dataVersion: "..." } — unwrap nested data
  if (data && typeof data === "object") {
    const inner = (data as Record<string, unknown>).data;
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  Demo-mode guard                                                    */
/* ------------------------------------------------------------------ */

const SMARTMONEY_DEMO_MESSAGE =
  "Smart Money features are not available in demo/simulated trading mode.";
const SMARTMONEY_DEMO_SUGGESTION =
  "Switch to a live profile to use Smart Money features.";

function withSmartmoneyDemoGuard(tool: ToolSpec): ToolSpec {
  const originalHandler = tool.handler;
  return {
    ...tool,
    handler: async (args: ToolArgs, context: ToolContext): Promise<unknown> => {
      if (context.config.demo) {
        throw new ConfigError(
          SMARTMONEY_DEMO_MESSAGE,
          SMARTMONEY_DEMO_SUGGESTION,
        );
      }
      return originalHandler(args, context);
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Tool registration                                                  */
/* ------------------------------------------------------------------ */

export function registerSmartmoneyTools(): ToolSpec[] {
  const tools: ToolSpec[] = [
    /* ---------- 1. Overview ---------- */
    {
      name: "smartmoney_get_overview",
      module: "smartmoney",
      description:
        "Multi-currency smart money overview ranked by most-watched currencies. " +
        "Pass ts=Date.now() for latest data, or dataVersion (yyyyMMddHHmm) from a prior call. " +
        "For single-currency signal with entry prices and trend, use smartmoney_get_signal.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          dataVersion: {
            type: "string",
            description: "yyyyMMddHHmm UTC (or use ts)",
          },
          ts: {
            type: "string",
            description: "Timestamp ms (or use dataVersion)",
          },
          instType: {
            type: "string",
            description: "SPOT|MARGIN|FUTURES|SWAP|OPTION",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "string",
            description: "Trader pool size 1-500",
          },
          instCcyList: {
            type: "string",
            description: "Comma-separated e.g. BTC,ETH,SOL",
          },
          instCcy: {
            type: "string",
            description: "Single currency e.g. BTC",
          },
          topInstruments: {
            type: "string",
            description: "Top N instruments 1-100",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const dv = readString(args, "dataVersion");
        const ts = readString(args, "ts");
        if (!dv && !ts) {
          throw new ValidationError('Either "dataVersion" or "ts" is required for smartmoney_get_overview.');
        }
        const response = await context.client.privateGet(
          PATH_OVERVIEW,
          compactObject({
            dataVersion: dv,
            ts,
            instType: readString(args, "instType"),
            ...readPoolFilters(args),
            lmtNum: readString(args, "lmtNum"),
            instCcyList: readString(args, "instCcyList"),
            instCcy: readString(args, "instCcy"),
            topInstruments: readString(args, "topInstruments"),
          }),
          publicRateLimit("smartmoney_get_overview", 5),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- 2. Signal ---------- */
    {
      name: "smartmoney_get_signal",
      module: "smartmoney",
      description:
        "Single-currency consensus signal: long/short ratio, entry prices, trend, capital flow. " +
        "Requires instId or instCcy. Pass ts=Date.now() for latest data, or dataVersion from a prior call. " +
        "For multi-currency overview, use smartmoney_get_overview. For timeline, use smartmoney_get_signal_history.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP (or use instCcy)",
          },
          instCcy: {
            type: "string",
            description: "e.g. BTC, SPOT/SWAP only (or use instId)",
          },
          dataVersion: {
            type: "string",
            description: "yyyyMMddHHmm UTC (or use ts)",
          },
          ts: {
            type: "string",
            description: "Timestamp ms (or use dataVersion)",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "string",
            description: "Trader pool size 1-500",
          },
          authorIds: {
            type: "string",
            description: "Comma-separated user IDs e.g. 1001,1002",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = readString(args, "instId");
        const instCcy = readString(args, "instCcy");
        if (!instId && !instCcy) {
          throw new ValidationError('Either "instId" or "instCcy" is required for smartmoney_get_signal.');
        }
        const dv = readString(args, "dataVersion");
        const ts = readString(args, "ts");
        if (!dv && !ts) {
          throw new ValidationError('Either "dataVersion" or "ts" is required for smartmoney_get_signal.');
        }
        const response = await context.client.privateGet(
          PATH_SIGNAL,
          compactObject({
            instId,
            instCcy,
            dataVersion: dv,
            ts,
            ...readPoolFilters(args),
            lmtNum: readString(args, "lmtNum"),
            authorIds: readString(args, "authorIds"),
          }),
          publicRateLimit("smartmoney_get_signal", 5),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- 3. Signal History ---------- */
    {
      name: "smartmoney_get_signal_history",
      module: "smartmoney",
      description:
        "Signal history timeline sorted by ts DESC for trend analysis. " +
        "Requires instId. Pass ts=Date.now() for latest data, or dataVersion from a prior call. " +
        "For current snapshot, use smartmoney_get_signal.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          dataVersion: {
            type: "string",
            description: "yyyyMMddHHmm UTC (or use ts)",
          },
          ts: {
            type: "string",
            description: "Timestamp ms (or use dataVersion)",
          },
          granularity: {
            type: "string",
            description: "1h or 1d",
          },
          limit: {
            type: "string",
            description: "Data points 1-500",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const dv = readString(args, "dataVersion");
        const ts = readString(args, "ts");
        if (!dv && !ts) {
          throw new ValidationError('Either "dataVersion" or "ts" is required for smartmoney_get_signal_history.');
        }
        const response = await context.client.privateGet(
          PATH_SIGNAL_HISTORY,
          compactObject({
            instId: requireString(args, "instId"),
            dataVersion: dv,
            ts,
            granularity: readString(args, "granularity"),
            limit: readString(args, "limit"),
            ...readPoolFilters(args),
          }),
          publicRateLimit("smartmoney_get_signal_history", 5),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- 4. Traders (list) ---------- */
    {
      name: "smartmoney_get_traders",
      module: "smartmoney",
      description:
        "List/filter leaderboard traders. " +
        "For single trader detail: smartmoney_get_trader_detail.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          dataVersion: {
            type: "string",
            description: "yyyyMMddHHmm, omit=latest",
          },
          ...LEADERBOARD_POOL_FILTER_PROPS,
          authorIds: {
            type: "string",
            description: "Comma-separated author IDs",
          },
          after: {
            type: "string",
            description: "Cursor after this authorId",
          },
          before: {
            type: "string",
            description: "Cursor before this authorId",
          },
          limit: {
            type: "string",
            description: "Max results 1-100",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          PATH_LEADERBOARD,
          compactObject({
            dataVersion: readString(args, "dataVersion"),
            ...readPoolFilters(args),
            authorIds: readString(args, "authorIds"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readString(args, "limit"),
          }),
          publicRateLimit("smartmoney_get_traders", 5),
        );
        // Leaderboard API may nest data inside { data: [...], dataVersion } — unwrap to flat array
        const normalized = normalizeResponse(response);
        return { ...normalized, data: extractLeaderboardData(normalized.data) };
      },
    },

    /* ---------- 5. Trader Detail (composite) ---------- */
    {
      name: "smartmoney_get_trader_detail",
      module: "smartmoney",
      description:
        "Trader portrait: profile + positions + trades. Requires authorId from smartmoney_get_traders. " +
        "Do NOT use for listing — use smartmoney_get_traders.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          authorId: {
            type: "string",
            description: "Trader author ID",
          },
          period: {
            type: "string",
            description: "3|7|30|90 days, omit=all",
          },
          instCcy: {
            type: "string",
            description: "Currency filter e.g. BTC",
          },
          tradeLimit: {
            type: "string",
            description: "Max trades 1-100",
          },
        },
        required: ["authorId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const authorId = requireString(args, "authorId");
        const period = readString(args, "period");
        const instCcy = readString(args, "instCcy");
        const tradeLimit = readString(args, "tradeLimit");

        // Fire all three requests in parallel — leaderboard shares rate-limit key with get_traders (same endpoint)
        const [profileRes, positionsRes, tradesRes] = await Promise.all([
          context.client.privateGet(
            PATH_LEADERBOARD,
            compactObject({ authorIds: authorId, period }),
            publicRateLimit("smartmoney_get_traders", 5),
          ),
          context.client.privateGet(
            PATH_POSITION_CURRENT,
            compactObject({ authorId, instCcy }),
            publicRateLimit("smartmoney_trader_positions", 5),
          ),
          context.client.privateGet(
            PATH_TRADE_RECORDS,
            compactObject({ authorId, instCcy, limit: tradeLimit }),
            publicRateLimit("smartmoney_trade_records", 5),
          ),
        ]);

        const profileNorm = normalizeResponse(profileRes);
        const positionsNorm = normalizeResponse(positionsRes);
        const tradesNorm = normalizeResponse(tradesRes);

        return {
          endpoint: "smartmoney_get_trader_detail (composite)",
          requestTime: new Date().toISOString(),
          data: {
            profile: extractLeaderboardData(profileNorm.data),
            positions: positionsNorm.data,
            trades: tradesNorm.data,
          },
        };
      },
    },
  ];
  return tools.map(withSmartmoneyDemoGuard);
}
