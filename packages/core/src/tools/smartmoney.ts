import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  readStringArray,
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
      "Lookback window in days. One of `\"3\"` / `\"7\"` / `\"30\"` / `\"90\"`. " +
      "Drives capability metrics (avgLongWinRate / avgShortWinRate) and the `winRateTier` filter. " +
      "Does NOT affect signal fields (which always use the latest snapshot).",
  },
  pnlTier: {
    type: "string" as const,
    enum: ["PNL_ANY", "PNL_TOP50", "PNL_TOP20", "PNL_TOP5"],
    default: "PNL_ANY",
    description:
      "PnL percentile gate applied on top of `sortBy`. " +
      "Naming: `TOP{N}` = top N% percentile (NOT an absolute PnL value). " +
      "PNL_ANY = no filter; PNL_TOP50 = PnL ≥ P50 (median); PNL_TOP20 = ≥ P80; PNL_TOP5 = ≥ P95. " +
      "PnL distribution is long-tailed — use percentile, not absolute thresholds.",
  },
  winRateTier: {
    type: "string" as const,
    enum: ["WR_ANY", "WR_GE_50", "WR_GE_80"],
    default: "WR_ANY",
    description:
      "Minimum win-rate gate (absolute thresholds, NOT percentile). " +
      "Naming: `GE_{N}` = career win-rate ≥ N% — distinct from `pnlTier`/`aumTier` `TOP{N}` which are percentiles. " +
      "WR_ANY = no filter; WR_GE_50 = ≥ 50%; WR_GE_80 = ≥ 80%.",
  },
  maxDrawdownTier: {
    type: "string" as const,
    enum: ["MR_ANY", "MR_LE_20", "MR_LE_50"],
    default: "MR_ANY",
    description:
      "Maximum-drawdown gate (absolute thresholds, NOT percentile; smaller drawdown = lower risk). " +
      "Naming: `LE_{N}` = drawdown ≤ N% — distinct from `pnlTier`/`aumTier` `TOP{N}` which are percentiles. " +
      "MR_ANY = no filter; MR_LE_20 = drawdown ≤ 20%; MR_LE_50 = ≤ 50%.",
  },
  aumTier: {
    type: "string" as const,
    enum: ["AUM_ANY", "AUM_TOP50", "AUM_TOP20", "AUM_TOP5"],
    default: "AUM_ANY",
    description:
      "AUM (Assets Under Management) percentile gate. " +
      "Naming: `TOP{N}` = top N% percentile (NOT an absolute USD amount). " +
      "AUM_ANY = no filter; AUM_TOP50 = AUM ≥ P50; AUM_TOP20 = ≥ P80; AUM_TOP5 = ≥ P95. " +
      "AUM is long-tailed — use percentile, not absolute USD.",
  },
};

/**
 * Leaderboard endpoint uses numeric thresholds (free-form) for pool filters.
 *
 * Public param names (`minPnl` / `minWinRate` / `minAum` / `maxDrawdown`) are deliberately
 * different from the signal-side enum tier names (`pnlTier` / `winRateTier` / `aumTier` /
 * `maxDrawdownTier`) to prevent AI agents from cross-pollinating values between the two
 * families (e.g. passing `pnl: "10000"` when they meant `pnlTier: "PNL_TOP20"`, or vice versa).
 *
 * Handler maps public names to the upstream `/leaderboard` API names via
 * LEADERBOARD_FILTER_UPSTREAM_NAMES below.
 */
const LEADERBOARD_POOL_FILTER_PROPS = {
  sortBy: {
    type: "string" as const,
    enum: ["pnl", "pnlRatio"],
    default: "pnl",
    description:
      "Required. Leaderboard sort key. `pnl` = absolute USD profit; `pnlRatio` = percentage return. Default `\"pnl\"`.",
  },
  period: {
    type: "string" as const,
    enum: PERIOD_DAYS,
    default: "90",
    description:
      "Required. Performance lookback window in days. One of `\"3\"` / `\"7\"` / `\"30\"` / `\"90\"`. " +
      "Default `\"90\"` (matches leaderboard UI). Filters AND ranks traders by their PnL over that window.",
  },
  minPnl: {
    type: "string" as const,
    description:
      "Minimum absolute PnL in USD as a string, e.g. `\"10000\"` → traders with PnL ≥ $10,000. " +
      "Numeric threshold — distinct from the signal-side `pnlTier` percentile enum.",
  },
  minWinRate: {
    type: "string" as const,
    description:
      "Minimum win-rate as a decimal in 0~1 range, passed as a string, e.g. `\"0.8\"` → traders with win-rate ≥ 80%. " +
      "Numeric threshold — distinct from the signal-side `winRateTier` enum.",
  },
  maxDrawdown: {
    type: "string" as const,
    description:
      "Maximum drawdown as a decimal, passed as a string, e.g. `\"0.1\"` → traders with drawdown ≤ 10%. Lower = lower risk. " +
      "Numeric threshold — distinct from the signal-side `maxDrawdownTier` enum.",
  },
  minAum: {
    type: "string" as const,
    description:
      "Minimum AUM (Assets Under Management) in USD as a string, e.g. `\"1000\"` → traders with AUM ≥ $1,000. " +
      "Numeric threshold — distinct from the signal-side `aumTier` percentile enum.",
  },
};

/** Public param name → upstream `/leaderboard` query-string param name. */
const LEADERBOARD_FILTER_UPSTREAM_NAMES: Record<string, string> = {
  sortBy: "sortBy",
  period: "period",
  minPnl: "pnl",
  minWinRate: "winRate",
  maxDrawdown: "maxDrawdown",
  minAum: "asset",
};

/** Leaderboard pool filters: public name → upstream API name (handler does the rename). */
function readPoolFilters(args: Record<string, unknown>): Record<string, unknown> {
  assertPoolFilterEnums(args, LEADERBOARD_POOL_FILTER_PROPS);
  const result: Record<string, unknown> = {};
  for (const [publicKey, upstreamKey] of Object.entries(LEADERBOARD_FILTER_UPSTREAM_NAMES)) {
    const val = readString(args, publicKey);
    if (val !== undefined && val !== "") result[upstreamKey] = val;
  }
  // Apply schema defaults explicitly so behavior does not depend on upstream defaults
  // (CLI bypasses MCP `required` validation, so handler is the only deterministic layer).
  if (result.sortBy === undefined) result.sortBy = "pnl";
  if (result.period === undefined) result.period = "90";
  return result;
}

/** Signal pool filters: public names == upstream API names; pass through directly. */
function readSignalPoolFilters(args: Record<string, unknown>): Record<string, unknown> {
  assertPoolFilterEnums(args, SIGNAL_POOL_FILTER_PROPS);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(SIGNAL_POOL_FILTER_PROPS)) {
    const val = readString(args, key);
    if (val) result[key] = val;
  }
  // Apply schema defaults explicitly so behavior does not depend on backend defaults
  // (CLI bypasses MCP `required` validation, so handler is the only deterministic layer).
  if (result.sortBy === undefined) result.sortBy = "pnl";
  if (result.period === undefined) result.period = "7";
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

/**
 * Derive a clean `direction` field from upstream `posSide` + `pos` size.
 *
 * Why: upstream `posSide` is `"long" | "short" | "net"` (and historically `"both"`) where
 * `"net"`/`"both"` mean net/one-way position mode with the sign of `pos` (numeric string)
 * encoding the actual direction. AI agents almost always miss the sign-encoded case;
 * surfacing a derived flat `direction: "long" | "short"` lets agents act on direction
 * without the extra branching.
 *
 * Live SWAP responses use `"net"`; `"both"` is kept for defensive forward-compat.
 */
function deriveDirection(posSide: unknown, pos: unknown): "long" | "short" | undefined {
  if (posSide === "long") return "long";
  if (posSide === "short") return "short";
  if ((posSide === "net" || posSide === "both") && typeof pos === "string" && pos !== "") {
    const n = Number(pos);
    if (Number.isFinite(n) && n !== 0) return n > 0 ? "long" : "short";
  }
  return undefined;
}

/**
 * Position-current API returns `data: [{ posData: [...] }]` — flatten to posData array
 * and decorate each row with the derived `direction` field (see deriveDirection).
 */
function extractPositionData(data: unknown): unknown[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  const first = data[0];
  if (first && typeof first === "object") {
    const posData = (first as Record<string, unknown>).posData;
    if (Array.isArray(posData)) {
      return posData.map((row) => {
        if (!row || typeof row !== "object") return row;
        const r = row as Record<string, unknown>;
        const direction = deriveDirection(r.posSide, r.pos);
        return direction ? { ...r, direction } : r;
      });
    }
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
  const base = idx === -1 ? instId : instId.slice(0, idx);
  // Defensive: malformed input like "-USDT-SWAP" yields "" — drop instead of forwarding empty filter.
  return base || undefined;
}

/* ------------------------------------------------------------------ */
/*  Error helpers (mcp-builder G2)                                     */
/* ------------------------------------------------------------------ */

/** ValidationError with a "next-step" hint, per mcp-builder actionable-error guideline. */
function actionableError(message: string, hint: string): ValidationError {
  return new ValidationError(`${message} ${hint}`);
}

/**
 * Reject an arg whose value is not in the schema's `enum` list before it reaches
 * the upstream API. Without this, agents that ignore the schema (e.g. pass a bare
 * `TOP20` instead of `PNL_TOP20`) only see a truncated upstream "Invalid parameter"
 * message — making misuse hard to diagnose. No-op when the field is absent/empty,
 * since enum fields are all optional with server-side defaults.
 */
function assertEnum(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
): void {
  const val = readString(args, key);
  if (val === undefined || val === "") return;
  if (!allowed.includes(val)) {
    throw actionableError(
      `Invalid value for "${key}": ${JSON.stringify(val)}.`,
      `Allowed values: ${allowed.map((v) => JSON.stringify(v)).join(", ")}.`,
    );
  }
}

/** Validate every enum-bearing field in a *_POOL_FILTER_PROPS map against args. */
function assertPoolFilterEnums(
  args: Record<string, unknown>,
  props: Record<string, Record<string, unknown>>,
): void {
  for (const [key, spec] of Object.entries(props)) {
    const enumList = spec.enum;
    if (Array.isArray(enumList)) assertEnum(args, key, enumList as readonly string[]);
  }
}

/**
 * Read a string-array param and serialize to upstream CSV form.
 * Public API uses arrays (mcp-builder best-practice — Zod arrays > comma-joined strings),
 * but the upstream Orbit/Journal endpoints accept CSV in their query string.
 * Returns undefined for empty/missing input so `compactObject` drops the key.
 */
function readArrayAsCsv(args: Record<string, unknown>, key: string): string | undefined {
  const arr = readStringArray(args, key);
  if (!arr || arr.length === 0) return undefined;
  return arr.join(",");
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
  asset: { type: "string", description: "AUM (Assets Under Management) in USD — same field that the input `minAum` filter applies to." },
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
      longNotionalUsdt: {
        type: "string",
        description:
          "Sum of long-side notional in USDT, weighted by each trader's ENTRY PRICE (price_avg), not mark price. " +
          "Moves only when positions are opened / closed / scaled — stays constant when positions are unchanged.",
      },
      shortNotionalUsdt: {
        type: "string",
        description:
          "Sum of short-side notional in USDT, weighted by each trader's ENTRY PRICE (price_avg), not mark price. " +
          "Moves only when positions are opened / closed / scaled — stays constant when positions are unchanged.",
      },
      netNotionalUsdt: {
        type: "string",
        description:
          "Net directional notional in USDT = long − short. Weighted by each trader's ENTRY PRICE (price_avg), " +
          "not mark price — reflects position scaling, not underlying price movement.",
      },
      totalNotionalUsdt: {
        type: "string",
        description:
          "Gross notional in USDT = long + short. Weighted by each trader's ENTRY PRICE (price_avg), not mark price — " +
          "reflects position scaling (open / close / add), not underlying price movement. " +
          "Stays constant across buckets when traders hold positions unchanged.",
      },
      totalNotionalVs24h: {
        type: "string",
        description:
          "Capital-flow change ratio vs 24h: (curr − hist_24h) / hist_24h. " +
          "Positive = smart money adding exposure; negative = retreating. NULL when hist=0.",
      },
      smartMoneyLongAvgEntry: {
        type: "string",
        description:
          "Long-side notional-weighted average entry price (USDT). Empty string `\"\"` when no long. " +
          "Compare to current price to judge whether following the longs is cheap/expensive now.",
      },
      smartMoneyShortAvgEntry: {
        type: "string",
        description: "Short-side notional-weighted average entry price (USDT). Empty string `\"\"` when no short.",
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
      shortRatio: {
        type: "string",
        description: "Headcount short ratio = shortTraders / tradersWithPosition. NULL when no traders.",
      },
      weightedLongRatio: {
        type: "string",
        description:
          "Notional-weighted long ratio = Σ(long_notional) / Σ(notional). " +
          "Notional uses each trader's ENTRY PRICE (price_avg), not mark price — ratio shifts only when positions are scaled. " +
          "NULL when no notional.",
      },
      weightedShortRatio: {
        type: "string",
        description:
          "Notional-weighted short ratio = Σ(short_notional) / Σ(notional). " +
          "Notional uses each trader's ENTRY PRICE (price_avg), not mark price. " +
          "NULL when no notional.",
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
    description: "Headcount short ratio at this bucket = shortTraders / tradersWithPosition. Decimal 0~1.",
  },
  weightedLongRatio: {
    type: "string",
    description:
      "Notional-weighted long ratio at this bucket = Σ(long_notional) / Σ(notional). Decimal 0~1. " +
      "Notional uses each trader's ENTRY PRICE (price_avg), not mark price — ratio shifts only when positions are scaled.",
  },
  weightedShortRatio: {
    type: "string",
    description:
      "Notional-weighted short ratio at this bucket = Σ(short_notional) / Σ(notional). Decimal 0~1. " +
      "Notional uses each trader's ENTRY PRICE (price_avg), not mark price.",
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
    description:
      "Net directional notional in USDT at this bucket = long notional − short notional. " +
      "Weighted by each trader's ENTRY PRICE (price_avg), not mark price — reflects position scaling, not underlying price movement.",
  },
  totalNotionalUsdt: {
    type: "string",
    description:
      "Gross notional in USDT at this bucket = long notional + short notional. " +
      "Weighted by each trader's ENTRY PRICE (price_avg), not mark price — " +
      "tracks capital deployed (rising = adding, falling = retreating). " +
      "Stays constant across buckets when traders hold positions unchanged.",
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
        "Leaderboard ranking of OKX smart-money traders, filtered by pool conditions and ranked by `sortBy`. " +
        "Use when: discovering top performers by criteria (PnL / win-rate / drawdown / AUM). " +
        "See also: `smartmoney_get_performance_by_trader` (lookup by ID), `smartmoney_search_trader` (lookup by nickname). " +
        "Note: `updateTime` is 12-digit `yyyyMMddHHmm` UTC+8, different from signal tools' 10-digit UTC `asOfTime`/`dataVersion` — do not cross-pass.",
      isWrite: false,
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
              "Snapshot version key — 12-digit `yyyyMMddHHmm` (UTC+8) as a string, e.g. `\"202604301815\"`. " +
              "Omit to query the latest snapshot (refreshed every ~5 min).",
          },
          ...LEADERBOARD_POOL_FILTER_PROPS,
          after: {
            type: "string",
            description:
              "Pagination cursor (older page) — pass the `authorId` of the last item from the previous page as a string, e.g. `\"872913470357110787\"`. " +
              "Cursor anchors on `authorId` while preserving the current `sortBy` order.",
          },
          before: {
            type: "string",
            description:
              "Pagination cursor (newer page) — pass the `authorId` of the first item from the previous page as a string, e.g. `\"872913470357110787\"`. " +
              "Cursor anchors on `authorId` while preserving the current `sortBy` order.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            default: 10,
            description: "Max results per page (default 10, max 100).",
          },
        },
        required: ["sortBy", "period"],
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
        "PnL / win-rate / drawdown profile for one or more traders looked up by `authorIds`. " +
        "Use when: caller already has trader IDs and needs their performance metrics. " +
        "See also: `smartmoney_search_trader` (resolve nickname → authorId), `smartmoney_get_traders_by_filter` (criteria-based discovery). " +
        "Note: response `updateTime` is 12-digit `yyyyMMddHHmm` UTC+8 — do not pass to signal-side tools' `asOfTime` (10-digit UTC).",
      isWrite: false,
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
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description:
              "Trader IDs to look up, e.g. `[\"1001\", \"1002\"]`. Required.",
          },
          sortBy: {
            type: "string",
            enum: ["pnl", "pnlRatio"],
            default: "pnl",
            description:
              "Required. Result sort key. `pnl` = absolute USD profit; `pnlRatio` = percentage return. Default `\"pnl\"`.",
          },
          period: {
            type: "string",
            enum: PERIOD_DAYS,
            default: "90",
            description:
              "Required. Performance lookback window in days. One of `\"3\"` / `\"7\"` / `\"30\"` / `\"90\"`. Default `\"90\"`.",
          },
        },
        required: ["authorIds", "sortBy", "period"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        assertEnum(args, "sortBy", ["pnl", "pnlRatio"]);
        assertEnum(args, "period", PERIOD_DAYS);
        const authorIds = readArrayAsCsv(args, "authorIds");
        if (!authorIds) {
          throw actionableError(
            '"authorIds" is required and must be a non-empty array.',
            "Discover trader IDs via `smartmoney_get_traders_by_filter`, " +
              "then pass them as an array (e.g. [\"1001\", \"1002\"]).",
          );
        }
        const response = await context.client.privateGet(
          PATH_LEADERBOARD,
          compactObject({
            authorIds,
            // Apply schema defaults explicitly so behavior does not depend on backend defaults
            // (CLI bypasses MCP `required` validation, so handler is the only deterministic layer).
            sortBy: readString(args, "sortBy") ?? "pnl",
            period: readString(args, "period") ?? "90",
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
        "Currently-open positions held by a single trader (direction, size, leverage, entry, conviction). " +
        "Use when: inspecting what a top trader is holding RIGHT NOW. " +
        "See also: `smartmoney_get_trader_positions_history` (closed positions), `smartmoney_search_trader` (nickname → authorId), `smartmoney_get_traders_by_filter` (discover trader).",
      isWrite: false,
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
                "Raw upstream position direction. " +
                "`long` = long-side position (buy-to-open); " +
                "`short` = short-side position (sell-to-open); " +
                "`net` (or legacy `both`) = net/one-way position mode where the sign of `pos` encodes direction. " +
                "Prefer the derived `direction` field below for agent logic.",
            },
            direction: {
              type: "string",
              enum: ["long", "short"],
              description:
                "Derived clean direction (`long` | `short`) — handler computes this from `posSide` + sign of `pos` " +
                "so agents do not have to branch on the `posSide=\"net\"` net-mode case.",
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
        "Closed-position history of a single trader, paginated by `posId` cursor. " +
        "Use when: studying realized PnL pattern, holding duration, win/loss streaks, or how positions ended (closed vs liquidated). " +
        "See also: `smartmoney_get_trader_positions` (currently-open), `smartmoney_search_trader` (nickname → authorId), `smartmoney_get_traders_by_filter` (discover trader).",
      isWrite: false,
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
                  "Whether the position was liquidated. `\"0\"` = normal close (not liquidated); `\"1\"` = liquidated. " +
                  "Use this dedicated field for liquidation checks; `closeType` may also encode liquidation via the `liquidateClose` / `liquidateReceive` / `adl` values.",
              },
              closeType: {
                type: "string",
                description:
                  "How the position was closed. " +
                  "`allClose` = entire position closed in one action; " +
                  "`partClose` = partially closed (position reduced but not fully exited); " +
                  "`liquidateClose` = forced liquidation; " +
                  "`liquidateReceive` = received liquidation transfer; " +
                  "`adl` = auto-deleveraging.",
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
            description: "Pagination cursor (older) — returns positions with `posId` smaller than this value. Pass the `posId` as a string, e.g. `\"872913470357110787\"`.",
          },
          before: {
            type: "string",
            description: "Pagination cursor (newer) — returns positions with `posId` greater than this value. Pass the `posId` as a string, e.g. `\"872913470357110787\"`.",
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
        "Recent orders/fills placed by a single trader (direction, size, price, leverage), paginated by `ordId` cursor. " +
        "Aligned with the cross-module `*_get_orders` family. " +
        "Use when: tracking a top trader's latest trade activity. " +
        "See also: `smartmoney_search_trader` (nickname → authorId), `smartmoney_get_traders_by_filter` (discover trader).",
      isWrite: false,
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
            description: "Pagination cursor (older) — returns trades with `ordId` smaller than this value. Pass the `ordId` as a string, e.g. `\"872913470357110787\"`.",
          },
          before: {
            type: "string",
            description: "Pagination cursor (newer) — returns trades with `ordId` greater than this value. Pass the `ordId` as a string, e.g. `\"872913470357110787\"`.",
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
        "Search Top Traders by nickname keyword, ranked by OKX-platform follower count DESC. " +
        "Returns up to 10 matches; intersects KOL full-text recall with the Top Trader set. " +
        "Use when: resolving a nickname or partial name to `authorId`(s) before calling other `smartmoney_get_trader_*` tools. " +
        "See also: `smartmoney_get_traders_by_filter` (discover top performers by criteria), `smartmoney_get_performance_by_trader` (lookup by known authorId).",
      isWrite: false,
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
              "Matched candidates are intersected with the Top Trader set.",
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
        "Multi-asset smart-money consensus signals (long/short ratio, weighted entry, capital flow, deltas vs 1h/24h/7d), " +
        "aggregated over a tier-filtered trader pool (PnL / win-rate / drawdown / AUM). " +
        "Pick instruments via `topInstruments` OR `instCcyList` — exactly one. Snapshot time auto-resolved to current hour. " +
        "**Linear (USDT/USDS-margined) contracts only — coin-margined (`-USD-SWAP` / `-USD-DELIVERY`) positions are excluded by upstream and silently omitted from the aggregation.** " +
        "Use when: latest cross-asset consensus from a criteria-defined pool. " +
        "See also: `smartmoney_get_signal_overview_by_trader` (restrict pool to specific traders), `smartmoney_get_signal_trend_by_filter` (time-series instead of latest snapshot).",
      isWrite: false,
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
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description:
              "Base currencies to aggregate, e.g. `[\"BTC\", \"ETH\", \"SOL\"]`. " +
              "Mutually exclusive with `topInstruments`. " +
              "Scope: only USDT-margined and USDS-margined (linear) instruments — e.g. `BTC` covers `BTC-USDT-SWAP` + `BTC-USDS-SWAP`. " +
              "Coin-margined contracts (`BTC-USD-SWAP`, `BTC-USD-DELIVERY`) are NOT included; positions a trader holds in those instruments are silently dropped from the aggregation.",
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
        required: ["sortBy", "period"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instCcyList = readArrayAsCsv(args, "instCcyList");
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
        "Multi-asset smart-money signals aggregated over a hand-picked set of traders (`authorIds`). " +
        "Pick instruments via `topInstruments` OR `instCcyList`. " +
        "Capability tier filters (pnlTier / winRateTier / etc.) not exposed — backend uses defaults for direct-lookup scenarios. " +
        "**Linear (USDT/USDS-margined) contracts only — a trader's coin-margined (`-USD-SWAP` / `-USD-DELIVERY`) positions are silently excluded from the aggregation, even when those positions are large.** Use `smartmoney_get_trader_positions` if the full position book is needed. " +
        "Use when: caller already knows which traders to follow and wants their cross-asset consensus at the latest hour. " +
        "See also: `smartmoney_get_signal_overview_by_filter` (criteria-defined pool), `smartmoney_get_signal_trend_by_trader` (time-series), `smartmoney_get_traders_by_filter` / `smartmoney_search_trader` (discover authorIds).",
      isWrite: false,
      outputSchema: envelope({
        type: "array",
        description: "Per-instrument snapshot, one element per requested coin.",
        items: { type: "object", properties: SIGNAL_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          authorIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description:
              "Trader IDs to aggregate over, e.g. `[\"1001\", \"1002\"]`. Required.",
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
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description:
              "Base currencies to aggregate, e.g. `[\"BTC\", \"ETH\", \"SOL\"]`. " +
              "Mutually exclusive with `topInstruments`. " +
              "Scope: only USDT-margined and USDS-margined (linear) instruments — e.g. `BTC` covers `BTC-USDT-SWAP` + `BTC-USDS-SWAP`. " +
              "Coin-margined contracts (`BTC-USD-SWAP`, `BTC-USD-DELIVERY`) are NOT included; the trader's positions in those instruments are silently dropped.",
          },
          sortBy: {
            type: "string",
            enum: ["pnl", "pnlRatio"],
            default: "pnl",
            description:
              "Required. Ranking key for the trader set. `pnl` = absolute USD profit; `pnlRatio` = percentage return. Default `\"pnl\"`.",
          },
          period: {
            type: "string",
            enum: PERIOD_DAYS,
            default: "7",
            description:
              "Required. Lookback window in days for capability metrics (`winRate.avgLongWinRate` / `avgShortWinRate`). " +
              "One of `\"3\"` / `\"7\"` / `\"30\"` / `\"90\"`. Default `\"7\"`. Does NOT affect signal fields.",
          },
        },
        required: ["authorIds", "sortBy", "period"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        assertEnum(args, "sortBy", ["pnl", "pnlRatio"]);
        assertEnum(args, "period", PERIOD_DAYS);
        const authorIds = readArrayAsCsv(args, "authorIds");
        if (!authorIds) {
          throw actionableError(
            '"authorIds" is required and must be a non-empty array.',
            "Pass IDs from `smartmoney_get_traders_by_filter` as an array (e.g. [\"1001\", \"1002\"]).",
          );
        }
        const instCcyList = readArrayAsCsv(args, "instCcyList");
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
            // Apply schema defaults explicitly so behavior does not depend on backend defaults
            // (CLI bypasses MCP `required` validation, so handler is the only deterministic layer).
            sortBy: readString(args, "sortBy") ?? "pnl",
            period: readString(args, "period") ?? "7",
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
        "Time-series of single-asset smart-money signal across hourly/daily buckets, aggregated over a tier-filtered trader pool. " +
        "Returns the latest `limit` buckets ending at `asOfTime` (defaults to current UTC hour). " +
        "**Linear (USDT/USDS-margined) contracts only — coin-margined (`-USD-SWAP` / `-USD-DELIVERY`) positions are excluded by upstream and silently omitted.** " +
        "Use when: tracking how long/short conviction and capital evolve over time (smart money adding exposure or retreating). " +
        "See also: `smartmoney_get_signal_overview_by_filter` (latest snapshot only), `smartmoney_get_signal_trend_by_trader` (restrict to specific traders). " +
        "Note: `asOfTime` is 10-digit `yyyyMMddHH` UTC, different from leaderboard tools' 12-digit UTC+8 `updateTime` — do not cross-pass.",
      isWrite: false,
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
              "Base currency to scope the time-series, e.g. \"BTC\". Required. " +
              "Scope: USDT-margined and USDS-margined (linear) instruments only — coin-margined (`-USD-SWAP` / `-USD-DELIVERY`) positions are NOT included.",
          },
          asOfTime: {
            type: "string",
            description:
              "Anchor snapshot time — 10-digit `yyyyMMddHH` UTC as a string, e.g. `\"2026050100\"`. " +
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
        required: ["instCcy", "granularity", "sortBy", "period"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        assertEnum(args, "granularity", ["1h", "1d"]);
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
            // Apply schema default explicitly (CLI bypasses MCP `required` validation).
            granularity: readString(args, "granularity") ?? "1h",
            limit: readNumber(args, "limit"),
            ...readSignalPoolFilters(args),
            lmtNum: readNumber(args, "lmtNum"),
          }),
          publicRateLimit("smartmoney_get_signal_trend_by_filter", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },

    /* ---------- S4. Signal trend by trader (single-asset, authorIds-restricted) ---------- */
    {
      name: "smartmoney_get_signal_trend_by_trader",
      module: "smartmoney",
      description:
        "Time-series of single-asset smart-money signal aggregated over a hand-picked set of traders (`authorIds`). " +
        "Returns the latest `limit` buckets ending at `asOfTime` (defaults to current UTC hour). " +
        "Capability tier filters (pnlTier / winRateTier / etc.) not exposed — backend uses defaults for direct-lookup scenarios. " +
        "**Linear (USDT/USDS-margined) contracts only — a trader's coin-margined (`-USD-SWAP` / `-USD-DELIVERY`) positions on the requested base ccy are silently excluded from each bucket.** Use `smartmoney_get_trader_positions` to inspect the full position book. " +
        "Use when: tracking how a specific group of traders has evolved their long/short consensus over time on one coin. " +
        "See also: `smartmoney_get_signal_trend_by_filter` (criteria-defined pool), `smartmoney_get_signal_overview_by_trader` (latest snapshot only), `smartmoney_get_traders_by_filter` / `smartmoney_search_trader` (discover authorIds). " +
        "Note: `asOfTime` is 10-digit `yyyyMMddHH` UTC, different from leaderboard tools' 12-digit UTC+8 `updateTime` — do not cross-pass.",
      isWrite: false,
      outputSchema: envelope({
        type: "array",
        description: "Time-bucket series for the requested instrument, sorted by time DESC (newest first).",
        items: { type: "object", properties: SIGNAL_HISTORY_ITEM_PROPS },
      }),
      inputSchema: {
        type: "object",
        properties: {
          authorIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description:
              "Trader IDs to aggregate over, e.g. `[\"1001\", \"1002\"]`. Required.",
          },
          instCcy: {
            type: "string",
            description:
              "Base currency to scope the time-series, e.g. \"BTC\". Required. " +
              "Scope: USDT-margined and USDS-margined (linear) instruments only — coin-margined (`-USD-SWAP` / `-USD-DELIVERY`) positions held by the trader set are NOT included.",
          },
          asOfTime: {
            type: "string",
            description:
              "Anchor snapshot time — 10-digit `yyyyMMddHH` UTC as a string, e.g. `\"2026050100\"`. " +
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
          sortBy: {
            type: "string",
            enum: ["pnl", "pnlRatio"],
            default: "pnl",
            description:
              "Required. Ranking key for the trader set. `pnl` = absolute USD profit; `pnlRatio` = percentage return. Default `\"pnl\"`.",
          },
          period: {
            type: "string",
            enum: PERIOD_DAYS,
            default: "7",
            description:
              "Required. Lookback window in days. One of `\"3\"` / `\"7\"` / `\"30\"` / `\"90\"`. Default `\"7\"`. " +
              "Does NOT affect signal fields (which always use the latest snapshot).",
          },
        },
        required: ["authorIds", "instCcy", "granularity", "sortBy", "period"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        assertEnum(args, "granularity", ["1h", "1d"]);
        assertEnum(args, "sortBy", ["pnl", "pnlRatio"]);
        assertEnum(args, "period", PERIOD_DAYS);
        const authorIds = readArrayAsCsv(args, "authorIds");
        const instCcy = readString(args, "instCcy");
        if (!authorIds) {
          throw actionableError(
            '"authorIds" is required and must be a non-empty array.',
            "Pass IDs from `smartmoney_get_traders_by_filter` as an array (e.g. [\"1001\", \"1002\"]).",
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
            // Apply schema defaults explicitly so behavior does not depend on backend defaults
            // (CLI bypasses MCP `required` validation, so handler is the only deterministic layer).
            granularity: readString(args, "granularity") ?? "1h",
            limit: readNumber(args, "limit"),
            sortBy: readString(args, "sortBy") ?? "pnl",
            period: readString(args, "period") ?? "7",
          }),
          publicRateLimit("smartmoney_get_signal_trend_by_trader", SMARTMONEY_RPS),
        );
        return normalizeResponse(response);
      },
    },
  ];
  return tools;
}
