import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
} from "./helpers.js";
import { publicRateLimit } from "./common.js";
import { ValidationError } from "../utils/errors.js";

/** Per-tool RPS cap; lower than the default 20 because upstream journal/smartmoney/* endpoints are heavier than market data. */
const SMARTMONEY_RPS = 5;

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
/*  Shared annotations                                                 */
/* ------------------------------------------------------------------ */

/** All smartmoney tools are read-only; share one annotations object. */
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: true,
  destructiveHint: false,
} as const;

/* ------------------------------------------------------------------ */
/*  Shared trader-pool filter properties & reader                      */
/* ------------------------------------------------------------------ */

const PERIOD_DAYS = ["3", "7", "30", "90"] as const;

/**
 * Signal endpoints use enum-based tiers for pool filters.
 * Public param names are explicit (`*Tier` suffix, AUM/Drawdown industry terms,
 * disjoint from response field names like `pnl`/`winRate`) to keep AI callers
 * from confusing tier filters with raw return values. Mapped to upstream API
 * keys by `readSignalPoolFilters`.
 */
const SIGNAL_POOL_FILTER_PROPS = {
  sortBy: {
    type: "string" as const,
    enum: ["pnl", "pnlRatio"],
    default: "pnl",
    description:
      "Ranking key used to pick traders into the aggregation pool. " +
      "`pnl` = absolute USD profit (favors high-AUM whales); " +
      "`pnlRatio` = percentage return (favors small-but-efficient traders).",
  },
  pnlTier: {
    type: "string" as const,
    enum: ["PNL_ANY", "PNL_TOP50", "PNL_TOP20", "PNL_TOP5"],
    default: "PNL_ANY",
    description:
      "PnL percentile gate applied on top of `sortBy`. " +
      "ANY = no filter; TOP50 = PnL ≥ P50 (median); TOP20 = ≥ P80; TOP5 = ≥ P95. " +
      "PnL distribution is long-tailed — use percentile, not absolute thresholds.",
  },
  winRateTier: {
    type: "string" as const,
    enum: ["WR_ANY", "WR_GE_50", "WR_GE_80"],
    default: "WR_ANY",
    description:
      "Minimum win-rate gate (fixed thresholds). " +
      "ANY = no filter; WR_GE_50 = ≥ 50%; WR_GE_80 = ≥ 80%.",
  },
  maxDrawdownTier: {
    type: "string" as const,
    enum: ["MD_ANY", "MD_LE_20", "MD_LE_50"],
    default: "MD_ANY",
    description:
      "Maximum-drawdown gate (fixed thresholds; smaller drawdown = lower risk). " +
      "ANY = no filter; MD_LE_20 = drawdown ≤ 20%; MD_LE_50 = ≤ 50%.",
  },
  aumTier: {
    type: "string" as const,
    enum: ["AUM_ANY", "AUM_TOP50", "AUM_TOP20", "AUM_TOP5"],
    default: "AUM_ANY",
    description:
      "AUM (Assets Under Management) percentile gate. " +
      "ANY = no filter; TOP50 = AUM ≥ P50; TOP20 = ≥ P80; TOP5 = ≥ P95. " +
      "AUM is long-tailed — use percentile, not absolute USD.",
  },
};

/**
 * Map public signal-filter names → upstream API field names.
 * NOTE: backend has not yet renamed `winRatio`→`winRate` or `maxRetreat`→`maxDrawdown`
 * upstream. Keep upstream values as the legacy names; we only rename on the public
 * (MCP-facing) side to avoid breaking the live API. Update here once backend confirms.
 */
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
  sortBy: {
    type: "string" as const,
    enum: ["pnl", "pnlRatio"],
    default: "pnl",
    description:
      "Leaderboard sort key. `pnl` = absolute USD profit; `pnlRatio` = percentage return.",
  },
  period: {
    type: "string" as const,
    enum: PERIOD_DAYS,
    default: "90",
    description:
      "Performance lookback window in days (3/7/30/90). Default 90 (matches leaderboard UI). " +
      "Filters AND ranks traders by their PnL over that window.",
  },
  pnl: {
    type: "string" as const,
    description:
      "Minimum absolute PnL in USD (numeric string, e.g. \"10000\" → traders with PnL ≥ $10,000).",
  },
  winRate: {
    type: "string" as const,
    description:
      "Minimum win-rate as decimal (e.g. \"0.8\" → traders with win-rate ≥ 80%). Range 0~1.",
  },
  maxDrawdown: {
    type: "string" as const,
    description:
      "Maximum drawdown as decimal (e.g. \"0.1\" → traders with drawdown ≤ 10%). Lower = lower risk.",
  },
  asset: {
    type: "string" as const,
    description:
      "Minimum AUM (Assets Under Management) in USD (numeric string, e.g. \"1000\" → traders with AUM ≥ $1,000).",
  },
};

/**
 * Map leaderboard public filter names → upstream API field names.
 * NOTE: backend still expects `winRatio` and `maxRetreat`; we rename on the public
 * side only. If backend renames upstream, update the right-hand values here.
 */
const LEADERBOARD_POOL_FILTER_API_KEY: Record<string, string> = {
  sortBy: "sortBy",
  period: "period",
  pnl: "pnl",
  winRate: "winRatio",
  maxDrawdown: "maxRetreat",
  asset: "asset",
};

/** Leaderboard pool filters: read public names, write upstream API names. */
function readPoolFilters(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [pub, api] of Object.entries(LEADERBOARD_POOL_FILTER_API_KEY)) {
    const val = readString(args, pub);
    if (val !== undefined && val !== "") result[api] = val;
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
  // `hasMore` is always emitted (even when false) so callers can branch on it
  // unambiguously; `nextAfter` is conditional because an absent cursor is the
  // canonical "no more pages" signal.
  return nextAfter !== undefined ? { hasMore, nextAfter } : { hasMore };
}

/* ------------------------------------------------------------------ */
/*  Time helpers (signal endpoints) — spec §4.5                        */
/* ------------------------------------------------------------------ */

const HOUR_MS = 3_600_000;

/** Floor a UTC ms timestamp to the start of its hour. */
function floorTsToHour(tsMs: number): string {
  return String(Math.floor(tsMs / HOUR_MS) * HOUR_MS);
}

/**
 * Resolve `ts` for signal endpoints.
 * - If user passed a numeric ms string in `args.ts`, floor it to the hour.
 * - Otherwise default to `Date.now()` floored to the hour.
 * Spec §4.5: signal endpoints never accept `dataVersion` as input — only `ts`.
 */
function resolveSignalTs(args: Record<string, unknown>): string {
  const userTs = readString(args, "ts");
  if (userTs === undefined || userTs === "") {
    return floorTsToHour(Date.now());
  }
  const raw = Number(userTs);
  if (!Number.isFinite(raw)) {
    throw actionableError(
      `"ts" must be a numeric UTC ms timestamp; got ${userTs}.`,
      "Pass Date.now() for current time, or a numeric ms timestamp from a prior signal response.",
    );
  }
  return floorTsToHour(raw);
}

/* ------------------------------------------------------------------ */
/*  Error helpers (mcp-builder G2)                                     */
/* ------------------------------------------------------------------ */

/** ValidationError with a "next-step" hint, per mcp-builder actionable-error guideline. */
function actionableError(message: string, hint: string): ValidationError {
  return new ValidationError(`${message} ${hint}`);
}

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
      endpoint: {
        type: "string",
        description: "Upstream API path that produced this payload (debug/audit aid).",
      },
      requestTime: { type: "string", description: "ISO-8601 timestamp when the request was issued." },
      data: dataSchema,
      dataVersion: {
        type: "string",
        description: "Snapshot version key in `yyyyMMddHH` UTC (the canonical time anchor).",
      },
      ...extras,
    },
    required: ["endpoint", "data"],
  };
}

const PAGINATION_PROP = {
  type: "object" as const,
  description: "Cursor pagination metadata. Only emitted on list tools that support paging.",
  properties: {
    hasMore: {
      type: "boolean",
      description:
        "True when `data.length` reached the requested `limit` (more pages likely). " +
        "False guarantees there are no more results after this page.",
    },
    nextAfter: {
      type: "string",
      description:
        "Cursor to pass back as `after` on the next call to fetch the following page. " +
        "Absent/empty when `hasMore` is false.",
    },
  },
};

/* ------------------------------------------------------------------ */
/*  Reusable item shapes                                               */
/* ------------------------------------------------------------------ */

/** Trader leaderboard row — shared by `get_top_traders` and `get_trader_performance`. */
const TRADER_ITEM_PROPS = {
  authorId: { type: "string", description: "Trader's unique ID — pass to other smartmoney_get_trader_* tools." },
  nickName: { type: "string", description: "Display nickname." },
  pnl: { type: "string", description: "Absolute PnL in USD over the requested `period` (numeric string)." },
  pnlRatio: { type: "string", description: "PnL as a decimal ratio over the requested `period` (e.g. \"0.35\" = +35%)." },
  asset: { type: "string", description: "Total AUM (Assets Under Management) in USD." },
  winRate: { type: "string", description: "Lifetime win-rate as a decimal (0~1)." },
  maxDrawdown: { type: "string", description: "Max drawdown as a decimal (e.g. \"0.2\" = 20%). Lower = lower risk." },
  onboardDuration: { type: "string", description: "Days the trader has been onboarded on the leaderboard (numeric string)." },
  updateTime: { type: "string", description: "Last refresh time of this row (ms or yyyyMMddHHmm)." },
  portrait: { type: "string", description: "Avatar image URL." },
  rates: {
    type: "array",
    description: "Equity-curve / PnL-rate time series (one entry per day).",
    items: {
      type: "object",
      properties: {
        statTime: { type: "string", description: "Date stamp in `YYMMDD` (e.g. \"240726\" = 2024-07-26)." },
        value: { type: "string", description: "Cumulative PnL ratio at that day (decimal)." },
      },
    },
  },
};

/** Per-instrument signal item — `get_top_coin_signals` payload. */
const TOP_COIN_SIGNAL_ITEM_PROPS = {
  instId: { type: "string", description: "Instrument ID e.g. BTC-USDT-SWAP." },
  longRatio: {
    type: "string",
    description:
      "Headcount-based long ratio = longTraders / (longTraders + shortTraders). " +
      "Decimal 0~1; 0.5 = balanced, >0.5 = long bias.",
  },
  weightedLongRatio: {
    type: "string",
    description:
      "Notional-weighted long ratio = Σ(notionalUsd × isLong) / Σ(notionalUsd). " +
      "Decimal 0~1; reflects capital tilt rather than headcount tilt.",
  },
  tradersWithPosition: {
    type: "integer",
    description:
      "Number of traders in the qualified pool currently holding this instrument. Higher = stronger consensus signal.",
  },
  netNotionalUsdt: {
    type: "string",
    description:
      "Net directional exposure in USDT = long notional − short notional. " +
      "Positive = net long, negative = net short.",
  },
  vs24h: {
    type: "string",
    description: "longRatio delta vs the 24h-ago snapshot (current − snapshot_24h_ago).",
  },
  tradersTotal: { type: "integer", description: "Total leaderboard pool size before filtering." },
  tradersQualified: { type: "integer", description: "Pool size after applying tier filters." },
  dataVersion: { type: "string", description: "Snapshot version key in `yyyyMMddHH` UTC." },
};

/** Single-asset signal item — shared by `get_signal_by_coin` / `get_signal_by_traders`. */
const SIGNAL_ITEM_PROPS = {
  instId: { type: "string", description: "Instrument ID e.g. BTC-USDT-SWAP." },
  longRatio: {
    type: "string",
    description: "Headcount long ratio = longTraders / (longTraders + shortTraders). Decimal 0~1.",
  },
  weightedLongRatio: {
    type: "string",
    description:
      "Notional-weighted long ratio = Σ(notionalUsd × isLong) / Σ(notionalUsd). " +
      "Reflects capital tilt (where the money is), not just headcount tilt.",
  },
  avgLongWinRate: {
    type: "string",
    description:
      "Mean lifetime win-rate of long-side holders. " +
      "Higher = the longs holding this coin are historically skilled.",
  },
  avgShortWinRate: {
    type: "string",
    description: "Mean lifetime win-rate of short-side holders.",
  },
  longTraders: { type: "integer", description: "Number of pool traders currently long this asset." },
  shortTraders: { type: "integer", description: "Number of pool traders currently short this asset." },
  tradersWithPosition: {
    type: "integer",
    description: "Total traders holding this asset (long + short). Higher = stronger consensus.",
  },
  tradersTotal: {
    type: "integer",
    description: "Total qualified pool size after tier filters (denominator context).",
  },
  longNotionalUsdt: { type: "string", description: "Sum of long-side notional in USDT." },
  shortNotionalUsdt: { type: "string", description: "Sum of short-side notional in USDT." },
  netNotionalUsdt: {
    type: "string",
    description: "Net directional notional in USDT = longNotionalUsdt − shortNotionalUsdt.",
  },
  totalNotionalVs24h: {
    type: "string",
    description:
      "Capital-flow change ratio vs 24h (decimal): (T_now − T_24h) / T_24h. " +
      "Positive = smart money adding exposure; negative = retreating.",
  },
  smartMoneyLongAvgEntry: {
    type: "string",
    description:
      "Notional-weighted average entry price of all current long positions. " +
      "Compare to current price to judge whether following the longs is cheap/expensive now.",
  },
  smartMoneyShortAvgEntry: {
    type: "string",
    description:
      "Notional-weighted average entry price of all current short positions (same formula on short side).",
  },
  vs1h: { type: "string", description: "longRatio delta vs the 1h-ago snapshot." },
  vs24h: { type: "string", description: "longRatio delta vs the 24h-ago snapshot." },
  vs7d: { type: "string", description: "longRatio delta vs the 7d-ago snapshot." },
  dataVersion: { type: "string", description: "Snapshot version key in `yyyyMMddHH` UTC." },
};

/** Time-bucket signal item — shared by both signal-history tools. */
const SIGNAL_HISTORY_ITEM_PROPS = {
  instId: { type: "string", description: "Instrument ID e.g. BTC-USDT-SWAP." },
  longRatio: {
    type: "string",
    description: "Headcount long ratio at this bucket. Decimal 0~1.",
  },
  weightedLongRatio: {
    type: "string",
    description: "Notional-weighted long ratio at this bucket. Decimal 0~1.",
  },
  tradersWithPosition: {
    type: "integer",
    description: "Pool traders holding this asset at this bucket. Few traders = unreliable signal.",
  },
  netNotionalUsdt: {
    type: "string",
    description: "Net directional notional in USDT at this bucket = long notional − short notional.",
  },
  totalNotionalUsdt: {
    type: "string",
    description:
      "Gross notional in USDT at this bucket = long notional + short notional. " +
      "Tracks total capital deployed (rising = adding, falling = retreating).",
  },
  tradersTotal: { type: "integer", description: "Leaderboard pool size before filtering." },
  tradersQualified: { type: "integer", description: "Pool size after applying tier filters." },
  dataVersion: { type: "string", description: "Snapshot version key in `yyyyMMddHH` UTC." },
};

/* ------------------------------------------------------------------ */
/*  Tool registration                                                  */
/* ------------------------------------------------------------------ */

export function registerSmartmoneyTools(): ToolSpec[] {
  const tools: ToolSpec[] = [
    /* ===================================================== */
    /*  Trader family (5)                                     */
    /* ===================================================== */

    /* ---------- T1. Top traders (leaderboard rank) ---------- */
    {
      name: "smartmoney_get_top_traders",
      module: "smartmoney",
      description:
        "Leaderboard ranking of OKX smart-money traders, filtered by pool conditions " +
        "(PnL / win-rate / drawdown / AUM thresholds) and ranked by `sortBy`. " +
        "Use to discover top performers. " +
        "For a specific trader's profile by ID use `smartmoney_get_trader_performance`.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope(
        { type: "array", items: { type: "object", properties: TRADER_ITEM_PROPS } },
        { pagination: PAGINATION_PROP },
      ),
      inputSchema: {
        type: "object",
        properties: {
          updateTime: {
            type: "string",
            description:
              "Snapshot version key in `yyyyMMddHHmm` (UTC+8). " +
              "Omit to query the latest snapshot (refreshed every ~5 min).",
          },
          ...LEADERBOARD_POOL_FILTER_PROPS,
          after: {
            type: "string",
            description: "Cursor: returns traders with `authorId` AFTER this value (older).",
          },
          before: {
            type: "string",
            description: "Cursor: returns traders with `authorId` BEFORE this value (newer).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "Max results per page (default 100, max 100).",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const limit = readNumber(args, "limit");
        const response = await context.client.privateGet(
          PATH_LEADERBOARD,
          compactObject({
            updateTime: readString(args, "updateTime"),
            ...readPoolFilters(args),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit,
          }),
          publicRateLimit("smartmoney_get_top_traders", SMARTMONEY_RPS),
        );
        const normalized = normalizeResponse(response);
        const data = extractLeaderboardData(normalized.data);
        return {
          ...normalized,
          data,
          pagination: buildPagination(data, limit ?? 100, "authorId"),
        };
      },
    },

    /* ---------- T2. Trader performance (by authorIds) ---------- */
    {
      name: "smartmoney_get_trader_performance",
      module: "smartmoney",
      description:
        "PnL / win-rate / drawdown profile for one or more traders looked up by `authorIds` " +
        "(comma-separated for batch). " +
        "Use `smartmoney_get_top_traders` to discover authorIds first.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        items: { type: "object", properties: TRADER_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          authorIds: {
            type: "string",
            description:
              "Comma-separated trader IDs (e.g. \"1001,1002\"). Required.",
          },
          period: {
            type: "string",
            enum: PERIOD_DAYS,
            default: "90",
            description:
              "Performance lookback window in days (3/7/30/90). Default 90.",
          },
        },
        required: ["authorIds"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const authorIds = readString(args, "authorIds");
        if (!authorIds) {
          throw actionableError(
            '"authorIds" is required.',
            "Discover trader IDs via `smartmoney_get_top_traders`, " +
              "then pass them comma-separated (e.g. \"1001,1002\").",
          );
        }
        const response = await context.client.privateGet(
          PATH_LEADERBOARD,
          compactObject({
            authorIds,
            period: readString(args, "period"),
          }),
          publicRateLimit("smartmoney_get_trader_performance", SMARTMONEY_RPS),
        );
        const normalized = normalizeResponse(response);
        return { ...normalized, data: extractLeaderboardData(normalized.data) };
      },
    },

    /* ---------- T3. Trader current positions ---------- */
    {
      name: "smartmoney_get_trader_positions",
      module: "smartmoney",
      description:
        "Currently-open positions held by a single trader. Use to see what a top trader is holding RIGHT NOW " +
        "(direction, size, leverage, entry, conviction). " +
        "Get `authorId` from `smartmoney_get_top_traders` first. " +
        "For closed-position history use `smartmoney_get_trader_position_history`.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        items: {
          type: "object",
          properties: {
            posId: { type: "string", description: "Unique position ID. Stable across the position's lifetime." },
            instId: { type: "string", description: "Instrument ID e.g. BTC-USDT-SWAP." },
            instType: {
              type: "string",
              description:
                "Instrument business line: `SWAP` (perpetual) | `SPOT` | `FUTURES` (delivery) | `MARGIN` | `OPTION`.",
            },
            posSide: {
              type: "string",
              description:
                "Position direction. " +
                "`long` = long-side position (buy-to-open); " +
                "`short` = short-side position (sell-to-open); " +
                "`both` = net/one-way position mode where the sign of `pos` encodes direction.",
            },
            posCcy: { type: "string", description: "Position currency — the asset being held, e.g. \"BTC\"." },
            quoteCcy: { type: "string", description: "Quote currency the position is priced/settled in, e.g. \"USDT\"." },
            pos: {
              type: "string",
              description:
                "Position size (numeric string). Unit depends on instType: " +
                "coins for SPOT/MARGIN, contracts (张) for SWAP/FUTURES/OPTION.",
            },
            lever: { type: "string", description: "Leverage multiplier (numeric string; \"1\" for spot)." },
            avgPx: { type: "string", description: "Volume-weighted average entry price (numeric string)." },
            last: { type: "string", description: "Latest market/mark price for the instrument (numeric string)." },
            notionalUsd: { type: "string", description: "Current position notional value in USD." },
            upl: { type: "string", description: "Unrealized (floating) PnL, denominated in `quoteCcy`." },
            pnl: { type: "string", description: "Realized PnL accrued on this position so far, denominated in `quoteCcy`." },
            cTime: { type: "string", description: "Position open time as Unix milliseconds (numeric string)." },
            positionIntensity: {
              type: "string",
              description:
                "Conviction metric = notionalUsd / trader.asset (this position's notional as a share of the trader's AUM). " +
                "Higher = the trader is betting a larger fraction of their book on this position.",
            },
          },
        },
      }),
      inputSchema: {
        type: "object",
        properties: {
          authorId: {
            type: "string",
            description: "Trader's unique ID (obtain from `smartmoney_get_top_traders`).",
          },
          instCcy: {
            type: "string",
            description:
              "Optional base-currency filter, e.g. \"BTC\" or \"ETH\". " +
              "Endpoint filters by base currency (not full instId) — pass \"BTC\" not \"BTC-USDT-SWAP\".",
          },
        },
        required: ["authorId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const authorId = readString(args, "authorId");
        if (!authorId) {
          throw actionableError(
            '"authorId" is required.',
            "Discover trader IDs via `smartmoney_get_top_traders` and pass one ID here.",
          );
        }
        const response = await context.client.privateGet(
          PATH_POSITION_CURRENT,
          compactObject({
            authorId,
            instCcy: readString(args, "instCcy"),
          }),
          publicRateLimit("smartmoney_get_trader_positions", SMARTMONEY_RPS),
        );
        const normalized = normalizeResponse(response);
        return { ...normalized, data: extractPositionData(normalized.data) };
      },
    },

    /* ---------- T4. Trader closed-position history ---------- */
    {
      name: "smartmoney_get_trader_position_history",
      module: "smartmoney",
      description:
        "Closed-position history of a single trader (paginated by `posId` cursor). " +
        "Use to study realized PnL pattern, holding duration, win/loss streaks, and how positions ended (closed vs liquidated). " +
        "For currently-open positions use `smartmoney_get_trader_positions`.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope(
        {
          type: "array",
          items: {
            type: "object",
            properties: {
              posId: { type: "string", description: "Unique closed-position ID. Use as the `after` / `before` cursor when paginating." },
              instId: { type: "string", description: "Instrument ID e.g. BTC-USDT-SWAP." },
              instType: {
                type: "string",
                description:
                  "Instrument business line: `SWAP` (perpetual) | `FUTURES` (delivery) | `MARGIN` | `SPOT`.",
              },
              ctVal: {
                type: "string",
                description:
                  "Contract face value — USD value of a single contract (张). Numeric string. Empty/0 for non-contract instruments.",
              },
              posSide: {
                type: "string",
                description:
                  "Position direction at close. `long` = was long-side; `short` = was short-side.",
              },
              lever: { type: "string", description: "Leverage multiplier used for this position (numeric string)." },
              quoteCcy: { type: "string", description: "Quote currency the position settled in, e.g. \"USDT\"." },
              openAvgPx: { type: "string", description: "Volume-weighted average price across all open fills (numeric string)." },
              closeAvgPx: { type: "string", description: "Volume-weighted average price across all close fills (numeric string)." },
              openMaxAmount: {
                type: "string",
                description: "Peak position size held during the position's lifetime, in contracts (张).",
              },
              closeAmount: { type: "string", description: "Total closed size, in contracts (张)." },
              realizedPnl: { type: "string", description: "Cumulative realized PnL during the position's lifetime, in `quoteCcy` units." },
              pnl: { type: "string", description: "Final close PnL on this position, in `quoteCcy` units." },
              pnlRatio: {
                type: "string",
                description:
                  "Realized PnL as a decimal ratio of cost basis (e.g. \"0.15\" = +15%, \"-0.20\" = −20%).",
              },
              closeType: {
                type: "string",
                description:
                  "How the position ended. " +
                  "`allClose` = trader closed the full size; " +
                  "`partClose` = trader closed only part (uncommon as a final state); " +
                  "`liquidateClose` = forced liquidation by the exchange; " +
                  "`liquidateReceive` = forced reduction (counter-side of liquidation cascade); " +
                  "`adl` = auto-deleveraging (insurance fund triggered).",
              },
              cTime: { type: "string", description: "Position open time as Unix milliseconds (numeric string)." },
              uTime: { type: "string", description: "Position close time as Unix milliseconds (numeric string)." },
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
            description: "Trader's unique ID (obtain from `smartmoney_get_top_traders`).",
          },
          instCcy: {
            type: "string",
            description:
              "Optional base-currency filter, e.g. \"BTC\" or \"ETH\". " +
              "Endpoint filters by base currency (not full instId).",
          },
          after: {
            type: "string",
            description: "Cursor: returns positions with `posId` BEFORE this value (older — paginate backwards).",
          },
          before: {
            type: "string",
            description: "Cursor: returns positions with `posId` AFTER this value (newer — paginate forwards).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 10,
            description: "Max positions per page (default 10, max 100).",
          },
        },
        required: ["authorId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const authorId = readString(args, "authorId");
        if (!authorId) {
          throw actionableError(
            '"authorId" is required.',
            "Discover trader IDs via `smartmoney_get_top_traders`.",
          );
        }
        const limit = readNumber(args, "limit");
        const response = await context.client.privateGet(
          PATH_POSITION_HISTORY,
          compactObject({
            authorId,
            instCcy: readString(args, "instCcy"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit,
          }),
          publicRateLimit("smartmoney_get_trader_position_history", SMARTMONEY_RPS),
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

    /* ---------- T5. Trader order history ---------- */
    {
      name: "smartmoney_get_trader_order_history",
      module: "smartmoney",
      description:
        "Recent orders/fills placed by a single trader (latest activity log), paginated by `ordId` cursor. " +
        "Aligned with the cross-module `*_get_orders` family. " +
        "Use to see what trades a top trader has been making lately — direction, size, price, leverage. " +
        "Get `authorId` from `smartmoney_get_top_traders`.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope(
        {
          type: "array",
          items: {
            type: "object",
            properties: {
              ordId: { type: "string", description: "Unique order ID. Use as the `after` / `before` cursor when paginating." },
              instId: { type: "string", description: "Instrument ID e.g. BTC-USDT-SWAP." },
              displayId: { type: "string", description: "Display-form instrument ID used in OKX UI." },
              instType: {
                type: "string",
                description: "Instrument business line: `SWAP` (perpetual contract) | `SPOT`.",
              },
              baseName: { type: "string", description: "Base currency symbol, e.g. \"BTC\"." },
              quoteName: { type: "string", description: "Quote currency symbol, e.g. \"USD\"." },
              tradeQuoteCcy: { type: "string", description: "Quote currency the fill actually settled in." },
              side: {
                type: "string",
                description: "Order side. `buy` = open long / close short; `sell` = open short / close long.",
              },
              posSide: {
                type: "string",
                description:
                  "Position direction the order applies to: `long` | `short`. " +
                  "Indicates whether the trader was opening/closing a long-side or short-side position.",
              },
              ordType: {
                type: "string",
                description: "Order type. `limit` = price-protected limit order; `market` = immediate at best available price.",
              },
              lever: { type: "string", description: "Leverage multiplier used for this order (numeric string; \"1\" for spot)." },
              px: { type: "string", description: "Submitted order price (numeric string). For market orders this may be empty/0." },
              avgPx: { type: "string", description: "Volume-weighted average fill price (numeric string)." },
              sz: {
                type: "string",
                description:
                  "Order size. Unit depends on instType: " +
                  "coins (币) for SPOT, contracts (张) for SWAP/FUTURES.",
              },
              value: {
                type: "string",
                description: "Order notional value, denominated in `quoteName` units.",
              },
              cTime: { type: "string", description: "Order creation time as Unix milliseconds (numeric string)." },
              fillTime: { type: "string", description: "Most recent fill time as Unix milliseconds." },
              uTime: { type: "string", description: "Order last-update time as Unix milliseconds." },
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
            description: "Trader's unique ID (obtain from `smartmoney_get_top_traders`).",
          },
          instCcy: {
            type: "string",
            description:
              "Optional base-currency filter, e.g. \"BTC\" or \"ETH\". " +
              "Endpoint filters by base currency (not full instId).",
          },
          after: {
            type: "string",
            description: "Cursor: returns trades with `ordId` BEFORE this value (older — paginate backwards).",
          },
          before: {
            type: "string",
            description: "Cursor: returns trades with `ordId` AFTER this value (newer — paginate forwards).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 10,
            description: "Max trades per page (default 10, max 100).",
          },
        },
        required: ["authorId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const authorId = readString(args, "authorId");
        if (!authorId) {
          throw actionableError(
            '"authorId" is required.',
            "Discover trader IDs via `smartmoney_get_top_traders`.",
          );
        }
        const limit = readNumber(args, "limit");
        const response = await context.client.privateGet(
          PATH_TRADE_RECORDS,
          compactObject({
            authorId,
            instCcy: readString(args, "instCcy"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit,
          }),
          publicRateLimit("smartmoney_get_trader_order_history", SMARTMONEY_RPS),
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

    /* ===================================================== */
    /*  Signal/Coin family (5)                                */
    /* ===================================================== */

    /* ---------- S1. Top coin signals (overview) ---------- */
    {
      name: "smartmoney_get_top_coin_signals",
      module: "smartmoney",
      description:
        "Top N most-watched-by-smart-money instruments (SWAP-only) ranked by `tradersWithPosition` DESC. " +
        "Answers: \"which coins are smart-money paying attention to right now?\" " +
        "For single-asset detail use `smartmoney_get_signal_by_coin`; " +
        "for time-series of one asset use `smartmoney_get_signal_history_by_coin`.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        description:
          "Per-instrument snapshot, sorted by `tradersWithPosition` DESC. " +
          "Each item answers: how many smart-money traders hold this coin, which side they lean, and how that lean changed in 24h.",
        items: { type: "object", properties: TOP_COIN_SIGNAL_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          ts: {
            type: "string",
            description:
              "Snapshot UTC ms timestamp (numeric string). Floored to the start of its hour. " +
              "Omit to use the current hour (latest snapshot).",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            default: 100,
            description:
              "Top-N traders to pull into the aggregation pool, ranked by `sortBy` (DESC). " +
              "Larger pool = stronger signal but slower; default 100 is fine for most cases.",
          },
          topInstruments: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
            description:
              "Cap on how many instruments to return (sorted by `tradersWithPosition` DESC). Default 20.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const ts = resolveSignalTs(args);
        const response = await context.client.privateGet(
          PATH_OVERVIEW,
          compactObject({
            ts,
            ...readSignalPoolFilters(args),
            lmtNum: readNumber(args, "lmtNum"),
            topInstruments: readNumber(args, "topInstruments"),
          }),
          publicRateLimit("smartmoney_get_top_coin_signals", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- S2. Signal by coin (single-asset, pool-filter) ---------- */
    {
      name: "smartmoney_get_signal_by_coin",
      module: "smartmoney",
      description:
        "Single-asset smart-money consensus signal, aggregated over a pool of traders matching the given tier filters " +
        "(PnL / win-rate / drawdown / AUM). " +
        "Bundles long/short ratio, weighted entry prices, capital flow, and trend deltas vs 1h/24h/7d. " +
        "For an authorIds-restricted view use `smartmoney_get_signal_by_traders`; " +
        "for time-series use `smartmoney_get_signal_history_by_coin`. " +
        "Snapshot time is auto-resolved to the current hour.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        description: "Single-element array; consume `data[0]`.",
        items: { type: "object", properties: SIGNAL_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID e.g. \"BTC-USDT-SWAP\". Required.",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            default: 100,
            description:
              "Top-N traders to pull into the aggregation pool, ranked by `sortBy` (DESC). " +
              "Larger pool = stronger signal but slower. Default 100 is fine for most cases.",
          },
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = readString(args, "instId");
        if (!instId) {
          throw actionableError(
            '"instId" is required.',
            "Pass a full instrument ID e.g. \"BTC-USDT-SWAP\". " +
              "Discover trending IDs via `smartmoney_get_top_coin_signals`.",
          );
        }
        const response = await context.client.privateGet(
          PATH_SIGNAL,
          compactObject({
            instId,
            ts: resolveSignalTs(args),
            ...readSignalPoolFilters(args),
            lmtNum: readNumber(args, "lmtNum"),
          }),
          publicRateLimit("smartmoney_get_signal_by_coin", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- S3. Signal by traders (single-asset, authorIds) ---------- */
    {
      name: "smartmoney_get_signal_by_traders",
      module: "smartmoney",
      description:
        "Single-asset smart-money signal restricted to a hand-picked set of traders (`authorIds`). " +
        "Use to compute a consensus signal from a specific group rather than a tier-filtered pool. " +
        "For a pool-filter view use `smartmoney_get_signal_by_coin`. " +
        "Snapshot time is auto-resolved to the current hour.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        description: "Single-element array; consume `data[0]`.",
        items: { type: "object", properties: SIGNAL_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID e.g. \"BTC-USDT-SWAP\". Required.",
          },
          authorIds: {
            type: "string",
            description:
              "Comma-separated trader IDs (e.g. \"1001,1002\") to restrict the aggregation. Required.",
          },
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            default: 100,
            description:
              "Cap on how many traders from `authorIds` to include in the aggregation. Default 100.",
          },
        },
        required: ["instId", "authorIds"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = readString(args, "instId");
        const authorIds = readString(args, "authorIds");
        if (!instId) {
          throw actionableError(
            '"instId" is required.',
            "Pass a full instrument ID e.g. \"BTC-USDT-SWAP\".",
          );
        }
        if (!authorIds) {
          throw actionableError(
            '"authorIds" is required.',
            "Comma-separated IDs from `smartmoney_get_top_traders` (e.g. \"1001,1002\").",
          );
        }
        const response = await context.client.privateGet(
          PATH_SIGNAL,
          compactObject({
            instId,
            ts: resolveSignalTs(args),
            authorIds,
            lmtNum: readNumber(args, "lmtNum"),
          }),
          publicRateLimit("smartmoney_get_signal_by_traders", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- S4. Signal history by coin (pool-filter time-series) ---------- */
    {
      name: "smartmoney_get_signal_history_by_coin",
      module: "smartmoney",
      description:
        "Time-series of single-asset smart-money signal across hourly/daily buckets, " +
        "aggregated over a pool of traders matching the given tier filters. " +
        "Use to track how long/short conviction and capital evolve over time " +
        "(is smart money adding exposure or pulling out?). " +
        "For the latest snapshot only, use `smartmoney_get_signal_by_coin`. " +
        "For an authorIds-restricted time-series, use `smartmoney_get_signal_history_by_traders`.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        description: "Time-bucket series for the requested instrument, sorted by time DESC (newest first).",
        items: { type: "object", properties: SIGNAL_HISTORY_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID e.g. \"BTC-USDT-SWAP\". Required.",
          },
          ts: {
            type: "string",
            description:
              "Anchor UTC ms timestamp (numeric string). Floored to the start of its hour. Required.",
          },
          granularity: {
            type: "string",
            enum: ["1h", "1d"],
            default: "1h",
            description:
              "Time-bucket size. `1h` = hourly snapshots (intraday/short-term trend), `1d` = daily snapshots (multi-day trend).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            default: 24,
            description:
              "Number of buckets to return (newest first). Default 24 ≈ last 24h at `1h` granularity, or 24 days at `1d`.",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
        },
        required: ["instId", "ts"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = readString(args, "instId");
        if (!instId) {
          throw actionableError(
            '"instId" is required.',
            "Pass a full instrument ID e.g. \"BTC-USDT-SWAP\".",
          );
        }
        const ts = readString(args, "ts");
        if (!ts) {
          throw actionableError(
            '"ts" is required.',
            "Pass a UTC ms timestamp anchor (e.g. `Date.now()`); the handler floors it to the hour.",
          );
        }
        // ts is validated above; resolveSignalTs floor-aligns it to the hour.
        const response = await context.client.privateGet(
          PATH_SIGNAL_HISTORY,
          compactObject({
            instId,
            ts: resolveSignalTs(args),
            granularity: readString(args, "granularity"),
            limit: readNumber(args, "limit"),
            ...readSignalPoolFilters(args),
          }),
          publicRateLimit("smartmoney_get_signal_history_by_coin", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- S5. Signal history by traders (authorIds time-series) ---------- */
    {
      name: "smartmoney_get_signal_history_by_traders",
      module: "smartmoney",
      description:
        "Time-series of single-asset smart-money signal restricted to a hand-picked set of traders (`authorIds`). " +
        "Use to track how a specific group of traders has evolved their long/short consensus over time. " +
        "For pool-filter time-series, use `smartmoney_get_signal_history_by_coin`.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        description: "Time-bucket series for the requested instrument, sorted by time DESC (newest first).",
        items: { type: "object", properties: SIGNAL_HISTORY_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID e.g. \"BTC-USDT-SWAP\". Required.",
          },
          authorIds: {
            type: "string",
            description:
              "Comma-separated trader IDs (e.g. \"1001,1002\") to restrict the aggregation. Required.",
          },
          ts: {
            type: "string",
            description:
              "Anchor UTC ms timestamp (numeric string). Floored to the start of its hour. Required.",
          },
          granularity: {
            type: "string",
            enum: ["1h", "1d"],
            default: "1h",
            description:
              "Time-bucket size. `1h` = hourly snapshots (intraday/short-term trend), `1d` = daily snapshots (multi-day trend).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            default: 24,
            description: "Number of buckets to return (newest first). Default 24.",
          },
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            default: 100,
            description: "Cap on how many traders from `authorIds` to include per bucket. Default 100.",
          },
        },
        required: ["instId", "authorIds", "ts"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = readString(args, "instId");
        const authorIds = readString(args, "authorIds");
        if (!instId) {
          throw actionableError(
            '"instId" is required.',
            "Pass a full instrument ID e.g. \"BTC-USDT-SWAP\".",
          );
        }
        if (!authorIds) {
          throw actionableError(
            '"authorIds" is required.',
            "Comma-separated IDs from `smartmoney_get_top_traders` (e.g. \"1001,1002\").",
          );
        }
        const ts = readString(args, "ts");
        if (!ts) {
          throw actionableError(
            '"ts" is required.',
            "Pass a UTC ms timestamp anchor; the handler floors it to the hour.",
          );
        }
        // ts is validated above; resolveSignalTs floor-aligns it to the hour.
        // TODO(smartmoney): pending backend confirmation that authorIds is honored on /signal-history — see docs/designs/smartmoney-tool-redesign-2026-04-28.md §3.1 row 11.
        const response = await context.client.privateGet(
          PATH_SIGNAL_HISTORY,
          compactObject({
            instId,
            ts: resolveSignalTs(args),
            authorIds,
            granularity: readString(args, "granularity"),
            limit: readNumber(args, "limit"),
            lmtNum: readNumber(args, "lmtNum"),
          }),
          publicRateLimit("smartmoney_get_signal_history_by_traders", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },
  ];
  return tools;
}
