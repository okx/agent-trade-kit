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
const PATH_TOP_TRADER_SEARCH = "/api/v5/orbit/top-trader-search";
const PATH_OVERVIEW = "/api/v5/journal/smartmoney/overview";
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
 * Signal endpoints (`/overview`, `/signal-history`) use enum-based tiers
 * for pool filters. Public names == upstream API names — no rename layer.
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
  period: {
    type: "string" as const,
    enum: PERIOD_DAYS,
    default: "7",
    description:
      "Lookback window in days for capability metrics (avgLongWinRate / avgShortWinRate) " +
      "and the `winRateTier` filter. Does NOT affect signal fields (which always use the latest snapshot).",
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
    enum: ["MR_ANY", "MR_LE_20", "MR_LE_50"],
    default: "MR_ANY",
    description:
      "Maximum-drawdown gate (fixed thresholds; smaller drawdown = lower risk). " +
      "ANY = no filter; MR_LE_20 = drawdown ≤ 20%; MR_LE_50 = ≤ 50%.",
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

/** Leaderboard pool filters: public names == upstream API names; pass through directly. */
function readPoolFilters(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(LEADERBOARD_POOL_FILTER_PROPS)) {
    const val = readString(args, key);
    if (val !== undefined && val !== "") result[key] = val;
  }
  return result;
}

/** Signal pool filters: public names == upstream API names; pass through directly. */
function readSignalPoolFilters(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(SIGNAL_POOL_FILTER_PROPS)) {
    const val = readString(args, key);
    if (val) result[key] = val;
  }
  return result;
}

/**
 * Leaderboard wrapper extraction.
 *
 * Backend returns `data: { updateTime: "yyyyMMddHHmm", data: [...] }` — the snapshot
 * version stamp lives on the wrapper, NOT on each trader row. Returning the items as a
 * flat array would silently drop `updateTime`; we surface it separately so the tool
 * handler can re-attach it at the response top level.
 */
function extractLeaderboardEnvelope(data: unknown): { items: unknown[]; updateTime?: string } {
  if (Array.isArray(data)) return { items: data };
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const inner = obj.data;
    const updateTime = typeof obj.updateTime === "string" ? obj.updateTime : undefined;
    if (Array.isArray(inner)) return { items: inner, updateTime };
  }
  return { items: [] };
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
/*  Instrument helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * Extract the base currency from a full instrument ID.
 * The trader-side endpoints (`position-current`, `position-history`, `trade-records`)
 * filter by base ccy upstream. Public param accepts either form for AI-agent ergonomics:
 * - "BTC-USDT-SWAP" → "BTC"
 * - "BTC-USDT" → "BTC"
 * - "BTC" → "BTC"
 */
function extractBaseCcy(instId: string | undefined): string | undefined {
  if (!instId) return undefined;
  const idx = instId.indexOf("-");
  return idx === -1 ? instId : instId.slice(0, idx);
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
        description: "Snapshot version key in `yyyyMMddHHmm` UTC (the canonical time anchor; minute is always `00` for hourly buckets).",
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

/**
 * Per-instrument overview item — shared by both `_overview_*` tools.
 * Backend response is nested with three groups (`notional`, `longShortRatio`, `winRate`),
 * matching the `/overview` spec from the SmartMoney OpenAPI doc.
 */
const SIGNAL_ITEM_PROPS = {
  ccy: { type: "string", description: "Instrument ID e.g. BTC-USDT-SWAP (outer identifier; the field name is `ccy`, not `instId`)." },
  dataVersion: {
    type: "string",
    description: "Snapshot version key in `yyyyMMddHH` UTC (10 digits, e.g. `2026043014` = 2026-04-30 14:00 UTC; floored to the hour).",
  },
  tradersWithPosition: {
    type: "integer",
    description: "Pool traders holding this asset at latest_snap (double-sided counted once). Higher = stronger consensus.",
  },
  tradersQualified: {
    type: "integer",
    description: "Pool size after applying tier filters (incl. those without positions on this instrument).",
  },
  longTraders: { type: "integer", description: "Number of pool traders currently long this asset (incl. double-sided)." },
  shortTraders: { type: "integer", description: "Number of pool traders currently short this asset (incl. double-sided)." },
  notional: {
    type: "object",
    description: "Notional / capital-flow group.",
    properties: {
      longNotionalUsdt: { type: "string", description: "Sum of long-side notional in USDT." },
      shortNotionalUsdt: { type: "string", description: "Sum of short-side notional in USDT." },
      netNotionalUsdt: { type: "string", description: "Net directional notional in USDT = long − short." },
      totalNotionalUsdt: { type: "string", description: "Gross notional in USDT = long + short." },
      totalNotionalVs24h: {
        type: "string",
        description:
          "Capital-flow change ratio vs 24h: (curr − hist_24h) / hist_24h. " +
          "Positive = smart money adding exposure; negative = retreating. NULL when hist=0.",
      },
      smartMoneyLongAvgEntry: {
        type: "string",
        description:
          "Long-side notional-weighted average entry price (USDT). NULL when no long. " +
          "Compare to current price to judge whether following the longs is cheap/expensive now.",
      },
      smartMoneyShortAvgEntry: {
        type: "string",
        description: "Short-side notional-weighted average entry price (USDT). NULL when no short.",
      },
    },
  },
  longShortRatio: {
    type: "object",
    description: "Long/short ratio + historical-delta group.",
    properties: {
      longRatioVs1h: { type: "string", description: "longRatio − hist_1h.longRatio. NULL when no hist." },
      longRatioVs24h: { type: "string", description: "longRatio − hist_24h.longRatio. NULL when no hist." },
      longRatioVs7d: { type: "string", description: "longRatio − hist_7d.longRatio. NULL when no hist." },
      longRatio: { type: "string", description: "Headcount long ratio = longTraders / tradersWithPosition. NULL when no traders." },
      shortRatio: { type: "string", description: "1 − longRatio. NULL when no traders." },
      weightedLongRatio: {
        type: "string",
        description: "Notional-weighted long ratio = Σ(long_notional) / Σ(notional). NULL when no notional.",
      },
      weightedShortRatio: {
        type: "string",
        description: "Notional-weighted short ratio = Σ(short_notional) / Σ(notional). NULL when no notional.",
      },
    },
  },
  winRate: {
    type: "object",
    description: "Capability (historical performance) group; driven by the `period` window.",
    properties: {
      avgLongWinRate: {
        type: "string",
        description:
          "Mean closed-position win-rate (full-market) over `period` days for users currently long. " +
          "NULL when closed-position sample size is below the configured minimum.",
      },
      avgShortWinRate: {
        type: "string",
        description: "Mean closed-position win-rate (full-market) over `period` days for users currently short. NULL when sample is below threshold.",
      },
    },
  },
};

/** Time-bucket signal item — shared by both signal-history tools. */
const SIGNAL_HISTORY_ITEM_PROPS = {
  ccy: { type: "string", description: "Base currency / instrument key for this bucket." },
  longRatio: {
    type: "string",
    description: "Headcount long ratio at this bucket. Decimal 0~1.",
  },
  shortRatio: {
    type: "string",
    description: "Headcount short ratio at this bucket = 1 − longRatio. Decimal 0~1.",
  },
  weightedLongRatio: {
    type: "string",
    description: "Notional-weighted long ratio at this bucket. Decimal 0~1.",
  },
  weightedShortRatio: {
    type: "string",
    description: "Notional-weighted short ratio at this bucket. Decimal 0~1.",
  },
  longTraders: {
    type: "integer",
    description: "Number of traders with long exposure at this bucket (includes dual-side traders).",
  },
  shortTraders: {
    type: "integer",
    description: "Number of traders with short exposure at this bucket (includes dual-side traders).",
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
  tradersQualified: { type: "integer", description: "Pool size after applying tier filters (includes traders without a position)." },
  dataVersion: { type: "string", description: "Snapshot version key in `yyyyMMddHH` UTC (10-digit, e.g. `2026042820`)." },
};

/* ------------------------------------------------------------------ */
/*  Tool registration                                                  */
/* ------------------------------------------------------------------ */

export function registerSmartmoneyTools(): ToolSpec[] {
  const tools: ToolSpec[] = [
    /* ===================================================== */
    /*  Trader family (6)                                     */
    /* ===================================================== */

    /* ---------- T1. Top traders (leaderboard rank) ---------- */
    {
      name: "smartmoney_get_traders_by_filter",
      module: "smartmoney",
      description:
        "Leaderboard ranking of OKX smart-money traders, filtered by pool conditions " +
        "(PnL / win-rate / drawdown / AUM thresholds) and ranked by `sortBy`. " +
        "Use to discover top performers. " +
        "For a specific trader's profile by ID use `smartmoney_get_performance_by_trader`.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope(
        { type: "array", items: { type: "object", properties: TRADER_ITEM_PROPS } },
        {
          updateTime: {
            type: "string",
            description:
              "Snapshot version of the leaderboard, in `yyyyMMddHHmm` (UTC+8, e.g. `202604301815`). " +
              "Lives at the response top level (shared by every item in `data`), NOT inside each trader row. " +
              "Refreshed approximately every 5 minutes.",
          },
          pagination: PAGINATION_PROP,
        },
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
            description: "Cursor: returns traders with `authorId` smaller than this value (older — paginate backwards).",
          },
          before: {
            type: "string",
            description: "Cursor: returns traders with `authorId` greater than this value (newer — paginate forwards).",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 10,
            description: "Max results per page (default 10, max 100).",
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
          publicRateLimit("smartmoney_get_traders_by_filter", SMARTMONEY_RPS),
        );
        const normalized = normalizeResponse(response);
        const { items, updateTime } = extractLeaderboardEnvelope(normalized.data);
        return {
          ...normalized,
          data: items,
          ...(updateTime ? { updateTime } : {}),
          pagination: buildPagination(items, limit ?? 10, "authorId"),
        };
      },
    },

    /* ---------- T2. Trader performance (by authorIds) ---------- */
    {
      name: "smartmoney_get_performance_by_trader",
      module: "smartmoney",
      description:
        "PnL / win-rate / drawdown profile for one or more traders looked up by `authorIds` " +
        "(comma-separated for batch). " +
        "Use `smartmoney_get_traders_by_filter` to discover authorIds first.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope(
        { type: "array", items: { type: "object", properties: TRADER_ITEM_PROPS } },
        {
          updateTime: {
            type: "string",
            description:
              "Snapshot version of the leaderboard, in `yyyyMMddHHmm` (UTC+8, e.g. `202604301815`). " +
              "Lives at the response top level (shared by every item in `data`), NOT inside each trader row.",
          },
        },
      ),
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
            "Discover trader IDs via `smartmoney_get_traders_by_filter`, " +
              "then pass them comma-separated (e.g. \"1001,1002\").",
          );
        }
        const response = await context.client.privateGet(
          PATH_LEADERBOARD,
          compactObject({
            authorIds,
            period: readString(args, "period"),
          }),
          publicRateLimit("smartmoney_get_performance_by_trader", SMARTMONEY_RPS),
        );
        const normalized = normalizeResponse(response);
        const { items, updateTime } = extractLeaderboardEnvelope(normalized.data);
        return {
          ...normalized,
          data: items,
          ...(updateTime ? { updateTime } : {}),
        };
      },
    },

    /* ---------- T3. Trader current positions ---------- */
    {
      name: "smartmoney_get_trader_positions",
      module: "smartmoney",
      description:
        "Currently-open positions held by a single trader. Use to see what a top trader is holding RIGHT NOW " +
        "(direction, size, leverage, entry, conviction). " +
        "Get `authorId` from `smartmoney_get_traders_by_filter` first. " +
        "For closed-position history use `smartmoney_get_trader_positions_history`.",
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
            description: "Trader's unique ID (obtain from `smartmoney_get_traders_by_filter`).",
          },
          instId: {
            type: "string",
            description:
              "Optional instrument filter. Accepts either full instId (e.g. \"BTC-USDT-SWAP\") or bare base currency (e.g. \"BTC\") — the handler extracts the base currency for the upstream filter.",
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
            "Discover trader IDs via `smartmoney_get_traders_by_filter` and pass one ID here.",
          );
        }
        const response = await context.client.privateGet(
          PATH_POSITION_CURRENT,
          compactObject({
            authorId,
            instCcy: extractBaseCcy(readString(args, "instId")),
          }),
          publicRateLimit("smartmoney_get_trader_positions", SMARTMONEY_RPS),
        );
        const normalized = normalizeResponse(response);
        return { ...normalized, data: extractPositionData(normalized.data) };
      },
    },

    /* ---------- T4. Trader closed-position history ---------- */
    {
      name: "smartmoney_get_trader_positions_history",
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
              mgnMode: {
                type: "string",
                description:
                  "Margin mode used for this position. `cross` = cross-margin (shared collateral pool); `isolated` = isolated-margin (per-position collateral).",
              },
              marginCcy: {
                type: "string",
                description: "Margin currency held as collateral for this position, e.g. \"BTC\" or \"USDT\".",
              },
              quoteCcy: { type: "string", description: "Quote currency the position settled in, e.g. \"USDT\"." },
              openAvgPx: { type: "string", description: "Volume-weighted average price across all open fills (numeric string)." },
              closeAvgPx: { type: "string", description: "Volume-weighted average price across all close fills (numeric string)." },
              openMaxAmount: {
                type: "string",
                description: "Peak position size held during the position's lifetime, in contracts (张).",
              },
              closeAmount: {
                type: "string",
                description:
                  "Total amount closed across all close fills, in contracts for SWAP/FUTURES or in base currency for SPOT/MARGIN (numeric string).",
              },
              realizedPnl: { type: "string", description: "Cumulative realized PnL during the position's lifetime, in `quoteCcy` units." },
              pnl: {
                type: "string",
                description:
                  "Total realized PnL for this position including fees and funding, denominated in quoteCcy (numeric string). Differs from `realizedPnl` which may exclude fees.",
              },
              pnlRatio: {
                type: "string",
                description:
                  "Realized PnL as a decimal ratio of cost basis (e.g. \"0.15\" = +15%, \"-0.20\" = −20%).",
              },
              fee: {
                type: "string",
                description:
                  "Cumulative trading fee paid over the position's lifetime, denominated in quoteCcy (numeric string, negative = cost).",
              },
              fundingFee: {
                type: "string",
                description:
                  "Cumulative funding fee paid or received over the position's lifetime, denominated in quoteCcy (numeric string; negative = paid, positive = received).",
              },
              liquidationStatus: {
                type: "string",
                description:
                  "Whether the position was liquidated. `0` = normal close (not liquidated); `1` = liquidated.",
              },
              closeType: {
                type: "string",
                description:
                  "How the position was closed. `allClose` = entire position closed in one action; `partClose` = partially closed (position reduced but not fully exited).",
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
            description: "Trader's unique ID (obtain from `smartmoney_get_traders_by_filter`).",
          },
          instId: {
            type: "string",
            description:
              "Optional instrument filter. Accepts either full instId (e.g. \"BTC-USDT-SWAP\") or bare base currency (e.g. \"BTC\") — the handler extracts the base currency for the upstream filter.",
          },
          after: {
            type: "string",
            description: "Cursor: returns positions with `posId` smaller than this value (older — paginate backwards).",
          },
          before: {
            type: "string",
            description: "Cursor: returns positions with `posId` greater than this value (newer — paginate forwards).",
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
            "Discover trader IDs via `smartmoney_get_traders_by_filter`.",
          );
        }
        const limit = readNumber(args, "limit");
        const response = await context.client.privateGet(
          PATH_POSITION_HISTORY,
          compactObject({
            authorId,
            instCcy: extractBaseCcy(readString(args, "instId")),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit,
          }),
          publicRateLimit("smartmoney_get_trader_positions_history", SMARTMONEY_RPS),
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
      name: "smartmoney_get_trader_orders_history",
      module: "smartmoney",
      description:
        "Recent orders/fills placed by a single trader (latest activity log), paginated by `ordId` cursor. " +
        "Aligned with the cross-module `*_get_orders` family. " +
        "Use to see what trades a top trader has been making lately — direction, size, price, leverage. " +
        "Get `authorId` from `smartmoney_get_traders_by_filter`.",
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
              fillTime: {
                type: "string",
                description: "Timestamp when the order was last filled, as Unix milliseconds (numeric string).",
              },
              uTime: {
                type: "string",
                description: "Timestamp when the order record was last updated, as Unix milliseconds (numeric string).",
              },
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
            description: "Trader's unique ID (obtain from `smartmoney_get_traders_by_filter`).",
          },
          instId: {
            type: "string",
            description:
              "Optional instrument filter. Accepts either full instId (e.g. \"BTC-USDT-SWAP\") or bare base currency (e.g. \"BTC\") — the handler extracts the base currency for the upstream filter.",
          },
          after: {
            type: "string",
            description: "Cursor: returns trades with `ordId` smaller than this value (older — paginate backwards).",
          },
          before: {
            type: "string",
            description: "Cursor: returns trades with `ordId` greater than this value (newer — paginate forwards).",
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
            "Discover trader IDs via `smartmoney_get_traders_by_filter`.",
          );
        }
        const limit = readNumber(args, "limit");
        const response = await context.client.privateGet(
          PATH_TRADE_RECORDS,
          compactObject({
            authorId,
            instCcy: extractBaseCcy(readString(args, "instId")),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit,
          }),
          publicRateLimit("smartmoney_get_trader_orders_history", SMARTMONEY_RPS),
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

    /* ---------- T6. Search top traders by nickname keyword ---------- */
    {
      name: "smartmoney_search_trader",
      module: "smartmoney",
      description:
        "Search Top Traders (profitable leaderboard traders) by nickname keyword, ranked by OKX-platform follower count DESC. " +
        "Returns up to 10 matches; intersects the KOL full-text recall set with the Top Trader set. " +
        "Use when the user supplies a nickname or partial name and you need to resolve it to one or more `authorId`s before calling other `smartmoney_get_trader_*` tools. " +
        "Do NOT use to discover top performers by performance — use `smartmoney_get_traders_by_filter` instead. " +
        "Do NOT use to look up known authorIds — use `smartmoney_get_performance_by_trader` instead.",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        description: "Matched Top Traders (≤10), sorted by `followerCount` DESC. Empty array when no recall intersects the Top Trader set.",
        items: {
          type: "object",
          properties: {
            authorId: { type: "string", description: "Trader's unique ID — pass to other `smartmoney_get_trader_*` tools." },
            nickName: { type: "string", description: "Display nickname matched against the keyword." },
            followerCount: { type: "string", description: "OKX-platform follower count (numeric string; Twitter followers excluded). Sort key." },
          },
        },
      }),
      inputSchema: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description:
              "Nickname search keyword. Required, must be non-empty / non-whitespace. " +
              "Backend performs full-text recall on the keyword, then intersects with the Top Trader set.",
          },
        },
        required: ["keyword"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const keyword = readString(args, "keyword");
        if (!keyword || keyword.trim() === "") {
          throw actionableError(
            '"keyword" is required and must be non-empty.',
            "Pass a nickname fragment (e.g. \"alice\", \"小明\"). For known author IDs use `smartmoney_get_performance_by_trader` instead.",
          );
        }
        const response = await context.client.privateGet(
          PATH_TOP_TRADER_SEARCH,
          compactObject({ keyword }),
          publicRateLimit("smartmoney_search_trader", SMARTMONEY_RPS),
        );
        const normalized = normalizeResponse(response);
        const data = Array.isArray(normalized.data) ? normalized.data : [];
        return { ...normalized, data };
      },
    },

    /* ===================================================== */
    /*  Signal/Coin family (4)                                */
    /* ===================================================== */

    /* ---------- S1. Signal overview by filter (multi-asset, tier-filtered pool) ---------- */
    {
      name: "smartmoney_get_signal_overview_by_filter",
      module: "smartmoney",
      description:
        "Multi-asset smart-money consensus signals, aggregated over a pool of traders matching the given tier filters " +
        "(PnL / win-rate / drawdown / AUM). " +
        "Returns per-instrument long/short ratio, weighted entry prices, capital flow, and trend deltas vs 1h/24h/7d. " +
        "Pick instruments via `topInstruments` (top-N hottest) OR `instCcyList` (specific coins) — exactly one is required. " +
        "Do NOT use to restrict aggregation to specific traders — use `smartmoney_get_signal_overview_by_trader` instead. " +
        "Do NOT use for time-series — use `smartmoney_get_signal_trend_by_filter` instead. " +
        "Snapshot time is auto-resolved to the current hour. " +
        "Note: `instCcyList` mode depends on backend `/overview` re-accepting `instCcyList` (re-introduced 2026-04-30 per design reversal).",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        description: "Per-instrument snapshot, one element per requested coin.",
        items: { type: "object", properties: SIGNAL_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          topInstruments: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
            description:
              "Top-N hottest instruments to aggregate (sorted by `tradersWithPosition` DESC). " +
              "Mutually exclusive with `instCcyList`; one of the two is required (default 20 if neither provided).",
          },
          instCcyList: {
            type: "string",
            description:
              "Comma-separated list of base currencies (e.g. \"BTC,ETH,SOL\") to aggregate. " +
              "Mutually exclusive with `topInstruments`.",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 2000,
            default: 100,
            description:
              "Top-N traders to pull into the aggregation pool, ranked by `sortBy` (DESC). " +
              "Larger pool = stronger signal but slower. Default 100 is fine for most cases.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instCcyList = readString(args, "instCcyList");
        const topInstrumentsRaw = readNumber(args, "topInstruments");
        if (instCcyList && topInstrumentsRaw !== undefined) {
          throw actionableError(
            '"topInstruments" and "instCcyList" are mutually exclusive.',
            "Pass exactly one — `topInstruments` for top-N hottest coins, or `instCcyList` for specific coins.",
          );
        }
        const response = await context.client.privateGet(
          PATH_OVERVIEW,
          compactObject({
            ...(instCcyList
              ? { instCcyList }
              : { topInstruments: topInstrumentsRaw ?? 20 }),
            ...readSignalPoolFilters(args),
            lmtNum: readNumber(args, "lmtNum"),
          }),
          publicRateLimit("smartmoney_get_signal_overview_by_filter", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- S2. Signal overview by trader (multi-asset, authorIds-restricted) ---------- */
    {
      name: "smartmoney_get_signal_overview_by_trader",
      module: "smartmoney",
      description:
        "Multi-asset smart-money signals restricted to a hand-picked set of traders (`authorIds`). " +
        "Use to compute consensus signals from a specific group rather than a tier-filtered pool. " +
        "Pick instruments via `topInstruments` (top-N hottest among the group) OR `instCcyList` (specific coins) — exactly one is required. " +
        "Do NOT use without `authorIds` — use `smartmoney_get_signal_overview_by_filter` for a tier-filtered pool view instead. " +
        "Do NOT use for time-series — use `smartmoney_get_signal_trend_by_trader` instead. " +
        "Discover authorIds first via `smartmoney_get_traders_by_filter`. " +
        "Snapshot time is auto-resolved to the current hour. " +
        "Note: depends on backend `/overview` accepting `authorIds` and `instCcyList` (re-introduced 2026-04-30 per design reversal).",
      isWrite: false,
      annotations: READ_ONLY_ANNOTATIONS,
      outputSchema: envelope({
        type: "array",
        description: "Per-instrument snapshot, one element per requested coin.",
        items: { type: "object", properties: SIGNAL_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          authorIds: {
            type: "string",
            description:
              "Comma-separated trader IDs (e.g. \"1001,1002\") to restrict the aggregation. Required. " +
              "Intersected with the pool selected by the tier filters.",
          },
          topInstruments: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 20,
            description:
              "Top-N hottest instruments held by the given traders (sorted by `tradersWithPosition` DESC). " +
              "Mutually exclusive with `instCcyList`; one of the two is required (default 20 if neither provided).",
          },
          instCcyList: {
            type: "string",
            description:
              "Comma-separated list of base currencies (e.g. \"BTC,ETH,SOL\") to aggregate. " +
              "Mutually exclusive with `topInstruments`.",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 2000,
            default: 100,
            description:
              "Top-N traders to pull into the aggregation pool, ranked by `sortBy` (DESC); " +
              "`authorIds` is intersected with this pool. Larger pool = stronger signal but slower. Default 100.",
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
            "Comma-separated IDs from `smartmoney_get_traders_by_filter` (e.g. \"1001,1002\").",
          );
        }
        const instCcyList = readString(args, "instCcyList");
        const topInstrumentsRaw = readNumber(args, "topInstruments");
        if (instCcyList && topInstrumentsRaw !== undefined) {
          throw actionableError(
            '"topInstruments" and "instCcyList" are mutually exclusive.',
            "Pass exactly one — `topInstruments` for top-N hottest coins, or `instCcyList` for specific coins.",
          );
        }
        const response = await context.client.privateGet(
          PATH_OVERVIEW,
          compactObject({
            authorIds,
            ...(instCcyList
              ? { instCcyList }
              : { topInstruments: topInstrumentsRaw ?? 20 }),
            ...readSignalPoolFilters(args),
            lmtNum: readNumber(args, "lmtNum"),
          }),
          publicRateLimit("smartmoney_get_signal_overview_by_trader", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- S3. Signal trend by filter (single-asset, tier-filtered pool, asOfTime anchor) ---------- */
    {
      name: "smartmoney_get_signal_trend_by_filter",
      module: "smartmoney",
      description:
        "Time-series of single-asset smart-money signal across hourly/daily buckets, " +
        "aggregated over a pool of traders matching the given tier filters. " +
        "Returns the latest `limit` buckets ending at `asOfTime` (defaults to current UTC hour). " +
        "Use to track how long/short conviction and capital evolve over time " +
        "(is smart money adding exposure or pulling out?). " +
        "Do NOT use for the latest single snapshot — use `smartmoney_get_signal_overview_by_filter` instead. " +
        "Do NOT use to restrict aggregation to specific traders — use `smartmoney_get_signal_trend_by_trader` instead.",
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
          instCcy: {
            type: "string",
            description:
              "Base currency to scope the time-series, e.g. \"BTC\". Required.",
          },
          asOfTime: {
            type: "string",
            description:
              "Anchor snapshot time, 10-digit `yyyyMMddHH` UTC (e.g. `2026050100`). " +
              "Returns the latest `limit` buckets ending at this anchor. " +
              "Omit to use the current UTC hour.",
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
              "Number of buckets to return (newest first), ending at `asOfTime`. Default 24, max 500.",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 2000,
            default: 100,
            description:
              "Top-N traders to pull into the aggregation pool, ranked by `sortBy` (DESC). Default 100, max 2000.",
          },
        },
        required: ["instCcy"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instCcy = readString(args, "instCcy");
        if (!instCcy) {
          throw actionableError(
            '"instCcy" is required.',
            "Pass a base currency, e.g. \"BTC\".",
          );
        }
        const response = await context.client.privateGet(
          PATH_SIGNAL_HISTORY,
          compactObject({
            instCcy,
            asOfTime: readString(args, "asOfTime"),
            granularity: readString(args, "granularity"),
            limit: readNumber(args, "limit"),
            ...readSignalPoolFilters(args),
            lmtNum: readNumber(args, "lmtNum"),
          }),
          publicRateLimit("smartmoney_get_signal_trend_by_filter", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- S4. Signal trend by trader (single-asset, authorIds intersected with tier pool) ---------- */
    {
      name: "smartmoney_get_signal_trend_by_trader",
      module: "smartmoney",
      description:
        "Time-series of single-asset smart-money signal restricted to a hand-picked set of traders (`authorIds`), " +
        "intersected with the tier-filtered pool (phase-1 pool). " +
        "Returns the latest `limit` buckets ending at `asOfTime` (defaults to current UTC hour). " +
        "Use to track how a specific group of traders has evolved their long/short consensus over time. " +
        "Do NOT use without `authorIds` — use `smartmoney_get_signal_trend_by_filter` for a tier-filtered pool view instead. " +
        "Do NOT use for the latest single snapshot — use `smartmoney_get_signal_overview_by_trader` instead. " +
        "Discover authorIds first via `smartmoney_get_traders_by_filter`.",
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
          authorIds: {
            type: "string",
            description:
              "Comma-separated trader IDs (e.g. \"1001,1002\") to intersect with the tier-filtered pool. Required.",
          },
          instCcy: {
            type: "string",
            description:
              "Base currency to scope the time-series, e.g. \"BTC\". Required.",
          },
          asOfTime: {
            type: "string",
            description:
              "Anchor snapshot time, 10-digit `yyyyMMddHH` UTC (e.g. `2026050100`). " +
              "Returns the latest `limit` buckets ending at this anchor. " +
              "Omit to use the current UTC hour.",
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
              "Number of buckets to return (newest first), ending at `asOfTime`. Default 24, max 500.",
          },
          ...SIGNAL_POOL_FILTER_PROPS,
          lmtNum: {
            type: "integer",
            minimum: 1,
            maximum: 2000,
            default: 100,
            description:
              "Top-N traders to pull into the phase-1 pool, ranked by `sortBy` (DESC); " +
              "`authorIds` is intersected with this pool. Default 100, max 2000.",
          },
        },
        required: ["authorIds", "instCcy"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const authorIds = readString(args, "authorIds");
        const instCcy = readString(args, "instCcy");
        if (!authorIds) {
          throw actionableError(
            '"authorIds" is required.',
            "Comma-separated IDs from `smartmoney_get_traders_by_filter` (e.g. \"1001,1002\").",
          );
        }
        if (!instCcy) {
          throw actionableError(
            '"instCcy" is required.',
            "Pass a base currency, e.g. \"BTC\".",
          );
        }
        const response = await context.client.privateGet(
          PATH_SIGNAL_HISTORY,
          compactObject({
            authorIds,
            instCcy,
            asOfTime: readString(args, "asOfTime"),
            granularity: readString(args, "granularity"),
            limit: readNumber(args, "limit"),
            ...readSignalPoolFilters(args),
            lmtNum: readNumber(args, "lmtNum"),
          }),
          publicRateLimit("smartmoney_get_signal_trend_by_trader", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },
  ];
  return tools;
}
