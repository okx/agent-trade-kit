import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { publicRateLimit } from "./common.js";
import { ValidationError } from "../utils/errors.js";

/* ------------------------------------------------------------------ */
/*  API path constants                                                 */
/*  Uses privateGet (requires API key) to drive user conversion —      */
/*  users must connect credentials before accessing smart money data.  */
/* ------------------------------------------------------------------ */
const PATH_LEADERBOARD = "/api/v5/orbit/public/leaderboard";
const PATH_POSITION_CURRENT = "/api/v5/orbit/public/position-current";
const PATH_POSITION_HISTORY = "/api/v5/orbit/public/position-history";
const PATH_TRADE_RECORDS = "/api/v5/orbit/public/trade-records";
const PATH_OVERVIEW = "/api/v5/journal/smartmoney/overview";
const PATH_SIGNAL = "/api/v5/journal/smartmoney/signal";
const PATH_SIGNAL_HISTORY = "/api/v5/journal/smartmoney/signal-history";

/* ------------------------------------------------------------------ */
/*  Shared trader-pool filter properties & reader                      */
/* ------------------------------------------------------------------ */

const PERIOD_DAYS = ["3", "7", "30", "90"] as const;

/**
 * Signal endpoints use enum-based tiers for pool filters.
 * Public param names are explicit (`*Tier` suffix, AUM/Drawdown industry terms,
 * disjoint from response field names like `pnl`/`winRatio`) to keep AI callers
 * from confusing tier filters with raw return values. Mapped to upstream API
 * keys by `readSignalPoolFilters`.
 */
const SIGNAL_POOL_FILTER_PROPS = {
  sortBy: {
    type: "string" as const,
    enum: ["pnl", "pnlRatio"],
    default: "pnl",
    description: "Pool ranking key.",
  },
  pnlTier: {
    type: "string" as const,
    enum: ["PNL_ANY", "PNL_TOP50", "PNL_TOP20", "PNL_TOP5"],
    default: "PNL_ANY",
    description: "Top N% of pool by PnL.",
  },
  winRateTier: {
    type: "string" as const,
    enum: ["WR_ANY", "WR_GE_50", "WR_GE_80"],
    default: "WR_ANY",
    description: "Minimum win-rate tier.",
  },
  maxDrawdownTier: {
    type: "string" as const,
    enum: ["MR_ANY", "MR_LE_20", "MR_LE_50"],
    default: "MR_ANY",
    description: "Maximum drawdown tier.",
  },
  aumTier: {
    type: "string" as const,
    enum: ["AUM_ANY", "AUM_TOP50", "AUM_TOP20", "AUM_TOP5"],
    default: "AUM_ANY",
    description: "Top N% of pool by AUM (Assets Under Management).",
  },
};

/** Map public signal-filter names → upstream API field names. */
const SIGNAL_POOL_FILTER_API_KEY: Record<string, string> = {
  sortBy: "sortType",
  pnlTier: "pnl",
  winRateTier: "winRatio",
  maxDrawdownTier: "maxRetreat",
  aumTier: "asset",
  period: "period",
};

/** Leaderboard endpoint uses numeric thresholds (free-form) for pool filters. */
const LEADERBOARD_POOL_FILTER_PROPS = {
  sortType: {
    type: "string" as const,
    enum: ["pnl", "pnl_ratio"], // 改驼峰
    default: "pnl",
    description: "Sort key.",
  },
  period: {
    type: "string" as const,
    enum: PERIOD_DAYS,
    description: "Performance window in days; omit for all-time.",
  },
  pnl: {
    type: "string" as const,
    description: "Minimum PnL in USD (e.g. 10000).",
  }, // pnlAss
  winRatio: {
    type: "string" as const,
    description: "Minimum win-rate as decimal (e.g. 0.8 = 80%).",
  }, // 
  maxRetreat: {
    type: "string" as const,
    description: "Maximum drawdown as decimal (e.g. 0.1 = 10%).",
  },
  asset: {
    type: "string" as const,
    description: "Minimum AUM in USD.",
  },
};

const POOL_FILTER_KEYS = ["sortType", "period", "pnl", "winRatio", "maxRetreat", "asset"] as const;

/** Leaderboard pool filters use raw upstream names (numeric thresholds). */
function readPoolFilters(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of POOL_FILTER_KEYS) {
    const val = readString(args, key);
    if (val) result[key] = val;
  }
  return result;
}

/** Signal pool filters: read public names, write upstream API names. */
function readSignalPoolFilters(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [publicKey, apiKey] of Object.entries(SIGNAL_POOL_FILTER_API_KEY)) {
    const val = readString(args, publicKey);
    if (val) result[apiKey] = val;
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

/** Position-current API returns `data: [{ posData: [...] }]` — flatten to posData array. */
function extractPositionData(data: unknown): unknown[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  const first = data[0];
  if (first && typeof first === "object") {
    const posData = (first as Record<string, unknown>).posData;
    if (Array.isArray(posData)) return posData;
  }
  return [];
}

/** Build cursor-pagination metadata from a list response. */
function buildPagination(
  data: unknown[],
  effectiveLimit: number,
  cursorField: string,
): Record<string, unknown> {
  const hasMore = data.length >= effectiveLimit;
  const last = data.length > 0 ? data[data.length - 1] : undefined;
  const nextAfter =
    hasMore && last && typeof last === "object" && last !== null
      ? (last as Record<string, unknown>)[cursorField]
      : undefined;
  return compactObject({ hasMore, nextAfter });
}

/* ------------------------------------------------------------------ */
/*  Reusable schema fragments                                          */
/* ------------------------------------------------------------------ */

const TS_PROP = {
  type: "string" as const,
  description: "Snapshot timestamp in ms (e.g. Date.now()). Wins over dataVersion when both set.",
};

const DATA_VERSION_PROP = {
  type: "string" as const,
  description: "Snapshot key in yyyyMMddHHmm UTC. Provide ts OR dataVersion.",
};

/* ------------------------------------------------------------------ */
/*  Output-schema helpers                                              */
/* ------------------------------------------------------------------ */

/** Wrap a `data` schema into the standard `{ endpoint, requestTime, data }` envelope. */
function envelope(
  dataSchema: Record<string, unknown>,
  extras: Record<string, unknown> = {},
) {
  return {
    type: "object" as const,
    properties: {
      endpoint: { type: "string" },
      requestTime: { type: "string", description: "ISO-8601 timestamp." },
      data: dataSchema,
      ...extras,
    },
    required: ["endpoint", "data"],
  };
}

const PAGINATION_PROP = {
  type: "object" as const,
  description: "Cursor pagination metadata (present only on list tools).",
  properties: {
    hasMore: { type: "boolean", description: "True when more results may follow." },
    nextAfter: { type: "string", description: "Pass as `after` in the next call." },
  },
};

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
        "Multi-asset smart-money snapshot ranked by tradersWithPosition DESC (most-watched first). " +
        "Use for cross-asset overview; for single-asset detail use smartmoney_get_signal.",
      isWrite: false,
      outputSchema: envelope({
        type: "array",
        description: "Per-instrument snapshot (sorted by tradersWithPosition DESC).",
        items: {
          type: "object",
          properties: {
            instId: { type: "string" },
            longRatio: { type: "string", description: "Decimal 0~1." },
            weightedLongRatio: { type: "string", description: "Capital-weighted long ratio." },
            tradersWithPosition: { type: "integer" },
            netNotionalUsdt: { type: "string", description: "Long − short notional, USDT." },
            vs24h: { type: "string", description: "longRatio delta vs 24h." },
            ts: { type: "integer", description: "Snapshot UTC ms." },
            tradersTotal: { type: "integer", description: "Candidate pool size." },
            tradersQualified: { type: "integer", description: "Filtered pool size." },
            topNUsed: { type: "integer", description: "Final result count." },
            dataVersion: { type: "string" },
          },
        },
      }),
      inputSchema: {
        type: "object",
        properties: {
          ts: TS_PROP,  // 需要删除一个，改名
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            default: 100,
            description: "Trader pool size.",
          },
          topInstruments: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
            description: "Top N instruments to return.",
          },
        },
      }, // 拆两个tool， 一个查 by coins, check top overview
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
            ...readSignalPoolFilters(args),
            lmtNum: readNumber(args, "lmtNum"),
            instCcyList: readString(args, "instCcyList"),
            instCcy: readString(args, "instCcy"),
            topInstruments: readNumber(args, "topInstruments"),
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
        "Single-asset consensus signal: long/short ratio, entry prices, trend, capital flow. " +
        "Use when you have a target asset; for cross-asset overview use smartmoney_get_overview, " +
        "for time-series use smartmoney_get_signal_history.",
      isWrite: false,
      outputSchema: envelope({
        type: "array",
        description: "Single-element array; consume data[0].",
        items: {
          type: "object",
          properties: {
            instId: { type: "string" },
            instType: { type: "string", description: "SPOT|MARGIN|FUTURES|SWAP|OPTION; empty when called via instCcy." },
            longRatio: { type: "string", description: "Decimal 0~1." },
            weightedLongRatio: { type: "string" },
            avgLongWinRatio: { type: "string", description: "Mean winRatio of long-holders over period." },
            avgShortWinRatio: { type: "string" },
            longTraders: { type: "integer" },
            shortTraders: { type: "integer" },
            tradersWithPosition: { type: "integer" },
            tradersTotal: { type: "integer" },
            longNotionalUsdt: { type: "string" },
            shortNotionalUsdt: { type: "string" },
            netNotionalUsdt: { type: "string" },
            totalNotionalVs24h: { type: "string", description: "Total notional change ratio vs 24h (decimal); use for capital-flow trend." },
            smartMoneyLongAvgEntry: { type: "string" },
            smartMoneyShortAvgEntry: { type: "string" },
            vs1h: { type: "string", description: "longRatio delta vs 1h." },
            vs24h: { type: "string" },
            vs7d: { type: "string" },
            ts: { type: "integer", description: "Snapshot UTC ms." },
            timestamp: { type: "string", description: "ISO-8601 form of ts." },
            dataVersion: { type: "string" },
          },
        },
      }),
      inputSchema: {
        type: "object",
        properties: {
          // instId: {
          //   type: "string",
          //   description: "Instrument ID e.g. BTC-USDT-SWAP. Wins over instCcy when both set.",
          // }, 
          instCcy: {
            type: "string",
            description: "Currency code e.g. BTC (SPOT/SWAP only). Provide instId OR instCcy.",
          },
          ts: TS_PROP,
          dataVersion: DATA_VERSION_PROP,
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            default: 100,
            description: "Trader pool size.",
          },
          authorIds: {
            type: "string",
            description: "Comma-separated user IDs (e.g. 1001,1002); restricts the trader pool to these IDs only.",
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
            ...readSignalPoolFilters(args),
            lmtNum: readNumber(args, "lmtNum"),
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
        "Signal-history timeline (sorted by ts DESC) for trend analysis on a single asset. " +
        "For the latest snapshot use smartmoney_get_signal.",
      isWrite: false,
      outputSchema: envelope({
        type: "array",
        description: "Time buckets, sorted by ts DESC.",
        items: {
          type: "object",
          properties: {
            instId: { type: "string" },
            longRatio: { type: "string" },
            weightedLongRatio: { type: "string" },
            tradersWithPosition: { type: "integer" },
            netNotionalUsdt: { type: "string" },
            totalNotionalUsdt: { type: "string" },
            tradersTotal: { type: "integer" },
            tradersQualified: { type: "integer" },
            dataVersion: { type: "string" },
          },
        },
      }),
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID e.g. BTC-USDT-SWAP.",
          },
          ts: TS_PROP,
          dataVersion: DATA_VERSION_PROP,
          granularity: {
            type: "string",
            enum: ["1h", "1d"],
            default: "1h",
            description: "Sample interval.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            default: 24,
            description: "Number of data points.",
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
            limit: readNumber(args, "limit"),
            ...readSignalPoolFilters(args),
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
        "List and filter leaderboard traders. For a single trader's full portrait use smartmoney_get_trader_detail.",
      isWrite: false,
      outputSchema: envelope(
        {
          type: "array",
          items: {
            type: "object",
            properties: {
              authorId: { type: "string", description: "Trader unique ID." },
              nickName: { type: "string" },
              pnl: { type: "string", description: "Absolute PnL." },
              pnlRatio: { type: "string", description: "Decimal." },
              asset: { type: "string", description: "Total AUM." },
              winRatio: { type: "string" },
              maxRetreat: { type: "string", description: "Max drawdown." },
              onboardDuration: { type: "string", description: "Days onboarded." },
              dataVersion: { type: "string" },
              portrait: { type: "string", description: "Avatar URL." },
              rates: {
                type: "array",
                description: "PnL rate time series.",
                items: {
                  type: "object",
                  properties: {
                    statTime: { type: "string", description: "YYMMDD (e.g. 240726)." },
                    value: { type: "string", description: "Decimal rate at that day." },
                  },
                },
              },
            },
          },
        },
        { pagination: PAGINATION_PROP },
      ),
      inputSchema: {
        type: "object",
        properties: {
          dataVersion: {
            type: "string",
            description: "Snapshot key in yyyyMMddHHmm UTC+8; omit for latest.",
          },
          ...LEADERBOARD_POOL_FILTER_PROPS,
          authorIds: {
            type: "string",
            description: "Comma-separated author IDs.",
          },
          after: {
            type: "string",
            description: "Cursor: return traders after this authorId.",
          },
          before: {
            type: "string",
            description: "Cursor: return traders before this authorId.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "Max results per page.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const limit = readNumber(args, "limit");
        const response = await context.client.privateGet(
          PATH_LEADERBOARD,
          compactObject({
            dataVersion: readString(args, "dataVersion"),
            ...readPoolFilters(args),
            authorIds: readString(args, "authorIds"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit,
          }),
          publicRateLimit("smartmoney_get_traders", 5),
        );
        // Leaderboard API may nest data inside { data: [...], dataVersion } — unwrap to flat array
        const normalized = normalizeResponse(response);
        const data = extractLeaderboardData(normalized.data);
        return {
          ...normalized,
          data,
          pagination: buildPagination(data, limit ?? 100, "authorId"),
        };
      },
    },

    /* ---------- 5. Trader Positions (atomic) ---------- */
    {
      name: "smartmoney_get_trader_positions",
      module: "smartmoney",
      description:
        "Single trader's current open positions. " +
        "Get authorId from smartmoney_get_traders. For the full portrait (profile + positions + trades) use smartmoney_get_trader_detail.",
      isWrite: false,
      outputSchema: envelope({
        type: "array",
        items: {
          type: "object",
          properties: {
            posId: { type: "string" },
            instId: { type: "string" },
            instType: { type: "string", description: "SWAP|SPOT|FUTURES|MARGIN|OPTION." },
            posSide: { type: "string", description: "long|short|both." },
            posCcy: { type: "string" },
            quoteCcy: { type: "string" },
            pos: { type: "string", description: "Position size." },
            lever: { type: "string" },
            avgPx: { type: "string", description: "Entry average price." },
            last: { type: "string", description: "Latest mark price." },
            notionalUsd: { type: "string" },
            pnl: { type: "string", description: "Realized PnL in quote ccy." },
            cTime: { type: "string", description: "Open time, Unix ms." },
            positionIntensity: { type: "string", description: "notionalUsd / trader.asset — conviction metric." },
          },
        },
      }),
      inputSchema: {
        type: "object",
        properties: {
          authorId: {
            type: "string",
            description: "Trader's author ID (from smartmoney_get_traders).",
          },
          instCcy: {
            type: "string",
            description: "Filter by base currency e.g. BTC (SPOT/FUTURES only).",
          },
        },
        required: ["authorId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          PATH_POSITION_CURRENT,
          compactObject({
            authorId: requireString(args, "authorId"),
            instCcy: readString(args, "instCcy"),
          }),
          publicRateLimit("smartmoney_trader_positions", 5),
        );
        const normalized = normalizeResponse(response);
        return { ...normalized, data: extractPositionData(normalized.data) };
      },
    },

    /* ---------- 6. Trader Trades (atomic, paginated) ---------- */
    {
      name: "smartmoney_get_trader_records",
      module: "smartmoney",
      description:
        "Single trader's recent order/fill records, paginated by ordId cursor. " +
        "Get authorId from smartmoney_get_traders. For the full portrait use smartmoney_get_trader_detail.",
      isWrite: false,
      outputSchema: envelope(
        {
          type: "array",
          items: {
            type: "object",
            properties: {
              ordId: { type: "string" },
              uniqueName: { type: "string" },  //删除
              instId: { type: "string" },
              displayId: { type: "string", description: "Display instrument ID; usually equals instId." },
              instType: { type: "string", description: "SWAP|SPOT." },
              nickName: { type: "string" },  //删除
              baseName: { type: "string", description: "e.g. BTC." },
              quoteName: { type: "string", description: "e.g. USD." },
              tradeQuoteCcy: { type: "string", description: "Actual quote currency for the fill." },
              side: { type: "string", description: "buy|sell." }, 
              posSide: { type: "string", description: "long|short." },  //需确认,买卖模式
              ordType: { type: "string", description: "limit|market." },
              lever: { type: "string" },
              px: { type: "string", description: "Order price." },
              avgPx: { type: "string", description: "Fill average price." },
              sz: { type: "string", description: "Order size (币 spot, 张 contracts)." }, //删除
              value: { type: "string", description: "Notional in quoteName unit." },//需确认
              cTime: { type: "string", description: "Order created, Unix ms." },
              fillTime: { type: "string", description: "Latest fill, Unix ms." },
              uTime: { type: "string", description: "Order updated, Unix ms." },
            },
          },
        },
        { pagination: PAGINATION_PROP },
      ),
      inputSchema: {
        type: "object",
        properties: {
          authorId: {
            type: "string",
            description: "Trader's author ID (from smartmoney_get_traders).",
          },
          instCcy: {
            type: "string",
            description: "Filter by base currency e.g. BTC (SPOT/FUTURES only).",
          },
          after: {
            type: "string",
            description: "Cursor: return trades before this ordId.",
          },
          before: {
            type: "string",
            description: "Cursor: return trades after this ordId.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 10,
            description: "Max trades per page.",
          },
        },
        required: ["authorId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const limit = readNumber(args, "limit");
        const response = await context.client.privateGet(
          PATH_TRADE_RECORDS,
          compactObject({
            authorId: requireString(args, "authorId"),
            instCcy: readString(args, "instCcy"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit,
          }),
          publicRateLimit("smartmoney_trade_records", 5),
        );
        const normalized = normalizeResponse(response);
        const data = Array.isArray(normalized.data) ? normalized.data : [];
        return {
          ...normalized,
          data,
          pagination: buildPagination(data, limit ?? 10, "ordId"),
        };
      },
    },

    /* ---------- 7. Trader Position History (atomic, paginated) ---------- */
    {
      name: "smartmoney_get_trader_position_history",
      module: "smartmoney",
      description:
        "Single trader's closed-position history, paginated by posId cursor. " +
        "Use to study a trader's realized PnL pattern over time. For current open positions use smartmoney_get_trader_positions.",
      isWrite: false,
      outputSchema: envelope(
        {
          type: "array",
          items: {
            type: "object",
            properties: {
              posId: { type: "string" },
              instId: { type: "string" },
              instType: { type: "string" },
              ctVal: { type: "string", description: "Contract value per contract." },
              posSide: { type: "string", description: "long|short." },
              lever: { type: "string" },
              quoteCcy: { type: "string" },
              openAvgPx: { type: "string" },
              closeAvgPx: { type: "string" },
              openMaxAmount: { type: "string", description: "Max position size held (contracts)." },
              closeAmount: { type: "string", description: "Close size (contracts)." },
              realizedPnl: { type: "string" },
              pnl: { type: "string", description: "Close PnL." },
              pnlRatio: { type: "string", description: "Realized PnL ratio (decimal)." },
              closeType: { type: "string", description: "allClose|partClose|liquidateClose|liquidateReceive|adl." },
              cTime: { type: "string", description: "Open time, Unix ms." },
              uTime: { type: "string", description: "Close time, Unix ms." },
            },
          },
        },
        { pagination: PAGINATION_PROP },
      ),
      inputSchema: {
        type: "object",
        properties: {
          authorId: {
            type: "string",
            description: "Trader's author ID (from smartmoney_get_traders).",
          },
          instCcy: {
            type: "string",
            description: "Filter by base currency e.g. BTC.",
          },
          after: {
            type: "string",
            description: "Cursor: return positions before this posId.",
          },
          before: {
            type: "string",
            description: "Cursor: return positions after this posId.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 10,
            description: "Max positions per page.",
          },
        },
        required: ["authorId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const limit = readNumber(args, "limit");
        const response = await context.client.privateGet(
          PATH_POSITION_HISTORY,
          compactObject({
            authorId: requireString(args, "authorId"),
            instCcy: readString(args, "instCcy"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit,
          }),
          publicRateLimit("smartmoney_position_history", 5),
        );
        const normalized = normalizeResponse(response);
        const data = Array.isArray(normalized.data) ? normalized.data : [];
        return {
          ...normalized,
          data,
          pagination: buildPagination(data, limit ?? 10, "posId"),
        };
      },
    },

    /* ---------- 8. Trader Detail (composite) ---------- */
    {
      name: "smartmoney_get_trader_detail", // performance
      module: "smartmoney",
      description:
        "Single trader's full portrait in one call: profile + current positions + recent trades (3 parallel requests). " +
        "Convenience composite — for finer control use the atomic tools: smartmoney_get_trader_positions, smartmoney_get_trader_trades, smartmoney_get_trader_position_history. " +
        "Get authorId from smartmoney_get_traders first.",
      isWrite: false,
      outputSchema: {
        type: "object",
        properties: {
          endpoint: { type: "string" },
          requestTime: { type: "string", description: "ISO-8601 timestamp." },
          data: {
            type: "object",
            description: "Composite payload from 3 parallel API calls.",
            properties: {
              profile: {
                type: "array",
                description: "Single-element trader leaderboard row (same shape as smartmoney_get_traders items).",
              },
              positions: {
                type: "array",
                description: "Current positions; items contain instId, instType, posSide, pos, lever, avgPx, last, notionalUsd, pnl, cTime, positionIntensity.",
              },
              trades: {
                type: "array",
                description: "Recent trade records; items contain ordId, instId, instType, side, posSide, ordType, lever, px, avgPx, sz, value, cTime, fillTime.",
              },
            },
            required: ["profile", "positions", "trades"],
          },
        },
        required: ["endpoint", "data"],
      },
      inputSchema: {
        type: "object",
        properties: {
          authorId: {
            type: "string",
            description: "Trader's author ID (from smartmoney_get_traders).",
          },
          period: {
            type: "string",
            enum: PERIOD_DAYS,
            description: "Performance window in days; omit for all-time.",
          },
          instCcy: {
            type: "string",
            description: "Currency filter e.g. BTC.",
          },
          tradeLimit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "Max recent trades to return.",
          },
        },
        required: ["authorId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const authorId = requireString(args, "authorId");
        const period = readString(args, "period");
        const instCcy = readString(args, "instCcy");
        const tradeLimit = readNumber(args, "tradeLimit");

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
  return tools;
}
