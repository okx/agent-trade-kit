/**
 * Internal helpers for event contract tools.
 * Extracted from event-trade.ts to keep the main file focused on tool registration.
 */
import type { ToolContext } from "./types.js";
import { compactObject, normalizeResponse, requireString, asRecord } from "./helpers.js";
import { privateRateLimit, publicRateLimit } from "./common.js";
import { OkxApiError } from "../utils/errors.js";
import { formatDisplayTitle, inferExpiryMsFromInstId, extractSeriesId } from "../utils/event-format.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Translate raw outcome codes to human-readable labels. */
export const OUTCOME_LABELS: Record<string, string> = {
  "0": "pending",
  "1": "YES",
  "2": "NO",
};

/**
 * Translate a raw outcome code to a human-readable label using the instId
 * to distinguish series type.
 * - price_up_down instIds contain "UPDOWN" → "1"=UP, "2"=DOWN
 * - price_above / price_once_touch → "1"=YES, "2"=NO
 * - "0" always → "pending" (same regardless of series type)
 */
export function resolveOutcomeLabel(instId: string, raw: string): string {
  if (raw === "0") return "pending";
  const id = instId.toUpperCase();
  const isUpDown = id.includes("UPDOWN") || id.includes("UP-DOWN");
  if (raw === "1") return isUpDown ? "UP" : "YES";
  if (raw === "2") return isUpDown ? "DOWN" : "NO";
  return OUTCOME_LABELS[raw] ?? raw;
}

/** Order state mapping — aligned with UI design spec. */
const ORDER_STATE_MAP: Record<string, string> = {
  live:             "Unfilled",
  partially_filled: "Partially filled",
  filled:           "Filled",
  canceled:         "Canceled",
  mmp_canceled:     "Canceled",
};

export function mapOrderState(raw: string): string {
  return ORDER_STATE_MAP[raw] ?? raw;
}

/** Known timestamp field names in event contract responses. */
const TIMESTAMP_FIELDS = new Set([
  "expTime", "settleTime", "listTime", "uTime", "cTime", "fixTime",
]);

/** Default settlement currency for event contracts. */
export const DEFAULT_SETTLE_CCY = "USDT";

// ---------------------------------------------------------------------------
// Timestamp conversion
// ---------------------------------------------------------------------------

/**
 * Convert all recognized timestamp fields in an item to "YYYY-MM-DD HH:mm UTC+8".
 * Fields that are missing, zero, or non-numeric are removed (omit empty timestamps).
 */
export function convertTimestamps(item: Record<string, unknown>): Record<string, unknown> {
  const result = { ...item };
  for (const key of TIMESTAMP_FIELDS) {
    if (!(key in result)) continue;
    const v = Number(result[key]);
    if (v > 0) {
      // Shift to UTC+8 by adding 8 hours before extracting UTC fields
      const d = new Date(v + 8 * 60 * 60 * 1000);
      const yyyy = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const hh = String(d.getUTCHours()).padStart(2, "0");
      const mi = String(d.getUTCMinutes()).padStart(2, "0");
      result[key] = `${yyyy}-${mo}-${dd} ${hh}:${mi} UTC+8`;
    } else {
      delete result[key];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Write operation helpers
// ---------------------------------------------------------------------------

/**
 * For write operations: surface any inner sCode/sMsg errors from data items.
 * Mirrors the pattern used in dca.ts and grid.ts.
 */
export function normalizeWrite(response: {
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
  return { endpoint: response.endpoint, requestTime: response.requestTime, data };
}

// ---------------------------------------------------------------------------
// Balance helpers
// ---------------------------------------------------------------------------

export interface BalanceResult {
  balance: string | null;
  ccy: string;
}

/**
 * Extract quote currency from an underlying pair string.
 * e.g. "BTC-USDT" → "USDT", "ETH-USDC" → "USDC"
 * Returns DEFAULT_SETTLE_CCY if extraction fails.
 */
export function extractQuoteCcy(underlying: string | null): string {
  if (!underlying) return DEFAULT_SETTLE_CCY;
  const parts = underlying.split("-");
  return parts.length >= 2 ? parts[parts.length - 1]!.toUpperCase() : DEFAULT_SETTLE_CCY;
}

/**
 * Fetch available balance in the trading account for a given currency.
 * Dynamically resolves the settlement currency from context; falls back to USDT.
 */
export async function fetchAvailableBalance(
  client: ToolContext["client"],
  ccy: string = DEFAULT_SETTLE_CCY,
): Promise<BalanceResult> {
  try {
    const r = await client.privateGet(
      "/api/v5/account/balance",
      { ccy },
    );
    const data = (r as unknown as Record<string, unknown>)["data"];
    if (Array.isArray(data) && data.length > 0) {
      const details = (data[0] as Record<string, unknown>)["details"];
      if (Array.isArray(details) && details.length > 0) {
        const entry = (details as Record<string, unknown>[]).find(
          (d) => String(d["ccy"] ?? "").toUpperCase() === ccy.toUpperCase(),
        );
        if (!entry) return { balance: null, ccy };
        const bal = String(entry["availBal"] ?? "") || null;
        return { balance: bal, ccy };
      }
    }
  } catch { /* non-critical */ }
  return { balance: null, ccy };
}

// ---------------------------------------------------------------------------
// Underlying / outcome resolution
// ---------------------------------------------------------------------------

/**
 * Extract underlying asset from seriesId for known patterns.
 * e.g. "BTC-ABOVE-DAILY" → "BTC", "ETH-UPDOWN-15MIN" → "ETH"
 */
const KNOWN_UNDERLYINGS = /^(BTC|ETH|TRX|EOS|SOL|IOTA|KISHU|SUSHI|BTG|XTZ|SOLVU)/i;

export function extractUnderlying(seriesId: string): string | null {
  const m = seriesId.match(KNOWN_UNDERLYINGS);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Convert semantic outcome string to API value.
 * Accepts: UP / YES → "yes",  DOWN / NO → "no"  (case-insensitive)
 */
export function resolveOutcome(value: string): string {
  const map: Record<string, string> = {
    up: "yes",
    yes: "yes",
    down: "no",
    no: "no",
  };
  const resolved = map[value.toLowerCase()];
  if (!resolved) {
    throw new Error(
      `Invalid outcome "${value}". Use: UP or YES for Up/Yes, DOWN or NO for Down/No.`,
    );
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Browse helpers
// ---------------------------------------------------------------------------

/** Filter series to pick one representative per method:underlying combo, preferring human-readable IDs. */
export function filterBrowseCandidates(
  allSeries: Record<string, unknown>[],
  underlyingFilter: string | undefined,
): Record<string, unknown>[] {
  const isHumanReadable = (id: string) =>
    /^(BTC|ETH|TRX|EOS|SOL|IOTA|KISHU|SUSHI|BTG|XTZ|SOLVU)-/.test(id);

  const seen = new Set<string>();
  const candidates: Record<string, unknown>[] = [];
  for (const s of allSeries) {
    const settlement = s["settlement"] as Record<string, unknown> | undefined;
    const method = String(settlement?.["method"] ?? "");
    const uly = String(settlement?.["underlying"] ?? "");
    if (underlyingFilter && !uly.startsWith(underlyingFilter)) continue;
    const key = `${method}:${uly}`;
    if (!seen.has(key) && isHumanReadable(String(s["seriesId"] ?? ""))) {
      seen.add(key);
      candidates.push(s);
    }
  }
  return candidates;
}

export interface BrowseSeriesResult {
  seriesId: string;
  method: string;
  underlying: string;
  freq: string;
  contracts: Record<string, unknown>[];
}

/** Check whether a market entry is active (not expired and has valid strike for non-updown series). */
export function isActiveMarket(m: Record<string, unknown>, isUpDown: boolean, now: number): boolean {
  if (!isUpDown && (!m["floorStrike"] || m["floorStrike"] === "")) return false;
  const expMs = Number(m["expTime"] ?? 0);
  return expMs <= 0 || expMs > now;
}

/** Map a raw market entry to a compact contract summary. */
export function toContractSummary(m: Record<string, unknown>): Record<string, unknown> {
  const converted = convertTimestamps(m);
  const id = String(m["instId"] ?? "");
  return {
    instId:       id,
    displayTitle: formatDisplayTitle(id),
    expTime:      converted["expTime"],
    floorStrike:  m["floorStrike"],
    px:           m["px"],
    outcome:      resolveOutcomeLabel(id, String(m["outcome"] ?? "")),
  };
}

/** Fetch live markets for a single series candidate and return only active (in-progress) contracts. */
export async function fetchActiveContractsForSeries(
  client: ToolContext["client"],
  s: Record<string, unknown>,
): Promise<BrowseSeriesResult | null> {
  const seriesId = String(s["seriesId"] ?? "");
  const settlement = s["settlement"] as Record<string, unknown> | undefined;
  const method = String(settlement?.["method"] ?? "");
  const isUpDown = method === "price_up_down";
  try {
    const r = await client.privateGet(
      "/api/v5/public/event-contract/markets",
      compactObject({ seriesId, state: "live" }),
      privateRateLimit("event_browse", 20),
    );
    const normalized = normalizeResponse(r);
    const markets = (Array.isArray(normalized["data"])
      ? normalized["data"] as Record<string, unknown>[]
      : []);
    const now = Date.now();
    const active = markets
      .filter(m => isActiveMarket(m, isUpDown, now))
      .map(toContractSummary);
    if (active.length === 0) return null;
    return {
      seriesId,
      method:     String(settlement?.["method"] ?? ""),
      underlying: String(settlement?.["underlying"] ?? ""),
      freq:       String(s["freq"] ?? ""),
      contracts:  active,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Markets helpers
// ---------------------------------------------------------------------------

/** Resolve underlying from a series API response when it could not be inferred from seriesId. */
export function resolveUnderlyingFromSeriesResp(
  seriesResp: unknown,
): string | null {
  if (!seriesResp) return null;
  const sResp = seriesResp as Record<string, unknown>;
  const sData = Array.isArray(sResp["data"])
    ? sResp["data"] as Record<string, unknown>[]
    : [];
  if (sData.length > 0) {
    const settlement = sData[0]!["settlement"] as Record<string, unknown> | undefined;
    return String(settlement?.["underlying"] ?? "") || null;
  }
  return null;
}

/** Sort markets by expTime ascending, slice by limit, and translate outcome labels + timestamps. */
export function translateAndSortMarkets(
  rawData: Record<string, unknown>[],
  limit: number | undefined,
): Record<string, unknown>[] {
  const sorted = [...rawData].sort((a, b) => {
    const tA = Number(a["expTime"] ?? 0);
    const tB = Number(b["expTime"] ?? 0);
    return tA - tB;
  });
  const sliced = limit && limit > 0 ? sorted.slice(0, limit) : sorted;
  return sliced.map(item => {
    const converted = convertTimestamps(item);
    const instId = String(item["instId"] ?? "");
    if (typeof converted["outcome"] === "string") {
      converted["outcome"] = resolveOutcomeLabel(instId, converted["outcome"]);
    }
    converted["displayTitle"] = formatDisplayTitle(instId);
    return converted;
  });
}

// ---------------------------------------------------------------------------
// Fill helpers
// ---------------------------------------------------------------------------

/** Enrich a single fill record with type, settlementResult, and pnl fields. */
export function enrichFill(item: Record<string, unknown>): Record<string, unknown> {
  const subType = String(item["subType"] ?? "");
  const isSettle = subType === "414" || subType === "415";
  const instId = String(item["instId"] ?? "");
  const enriched: Record<string, unknown> = {
    ...item,
    displayTitle: formatDisplayTitle(instId),
    outcome: resolveOutcomeLabel(instId, String(item["outcome"] ?? "")),
    type: isSettle ? "settlement" : "fill",
  };
  if (isSettle) {
    const fillPnl = parseFloat(String(item["fillPnl"] ?? "NaN"));
    const isWin = subType === "414";
    enriched["settlementResult"] = isWin ? "win" : "loss";
    enriched["pnl"] = isNaN(fillPnl) ? undefined : fillPnl;
  }
  return enriched;
}

// ---------------------------------------------------------------------------
// Index price
// ---------------------------------------------------------------------------

/**
 * Fetch current index price for a given underlying (e.g. "BTC-USDT").
 * Used to enrich event_get_markets response with the current spot price.
 */
export async function fetchIdxPx(
  client: ToolContext["client"],
  underlying: string,
): Promise<string | null> {
  try {
    const r = await client.publicGet(
      "/api/v5/market/index-tickers",
      { instId: underlying },
      publicRateLimit("fetchIdxPx", 20),
    );
    const data = (r as unknown as Record<string, unknown>)["data"];
    if (Array.isArray(data) && data.length > 0) {
      return String((data[0] as Record<string, unknown>)["idxPx"] ?? "") || null;
    }
  } catch { /* index price fetch is non-critical, swallow network/timeout errors */ }
  return null;
}

// ---------------------------------------------------------------------------
// Place order error handler
// ---------------------------------------------------------------------------

/** Handle item-level sCode errors from place order response. Throws OkxApiError if error found. */
export function handlePlaceOrderError(
  base: Record<string, unknown>,
  rawArgs: Record<string, unknown>,
  endpoint: string,
): void {
  if (!Array.isArray(base["data"])) return;
  const item = (base["data"] as Record<string, unknown>[])[0];
  const sCode = item && String(item["sCode"] ?? "");
  if (!sCode || sCode === "0") return;

  const sMsg = String(item["sMsg"] ?? "Order failed");
  if (sCode === "51001") {
    const instId = requireString(asRecord(rawArgs), "instId");
    const seriesId = extractSeriesId(instId);
    const expiryMs = inferExpiryMsFromInstId(instId);
    const isExpired = expiryMs !== null && expiryMs < Date.now();
    const reason = isExpired
      ? `The contract (${instId}) has expired.`
      : `The contract (${instId}) was not found — it may not exist or has not started yet.`;
    throw new OkxApiError(
      `${reason} Ask the user if they'd like to place the same order on the next session. ` +
      `If yes, call event_get_markets with seriesId=${seriesId} and state=live to find available contracts.`,
      { code: sCode, endpoint },
    );
  }
  throw new OkxApiError(`[${sCode}] ${sMsg}`, { code: sCode, endpoint });
}
