/**
 * Event Contract tools — binary outcome prediction markets.
 *
 * Three product types (settlement.method field in series response):
 *   - price_up_down:    BTC/ETH price UP (rises in period) or DOWN (falls in period)
 *   - price_above:      BTC/ETH price at expiry above strike — YES or NO
 *   - price_once_touch: BTC/ETH price ever touches strike — YES or NO
 *
 * Outcome semantics (input):
 *   UP / YES  → API value "yes"  (lowercase, case-insensitive input)
 *   DOWN / NO → API value "no"   (lowercase, case-insensitive input)
 *
 * Outcome semantics (response from markets endpoint):
 *   "0" = not yet settled, "1" = YES won, "2" = NO won
 *
 * Key parameters unique to this module:
 *   outcome   "UP"/"YES" → "yes",  "DOWN"/"NO" → "no"
 *   px        probability 0.00~1.00, NOT a regular asset price
 *   tdMode    always "isolated" for event contracts
 *   speedBump auto-set to "1" for non-post_only orders (required by exchange)
 */
import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit, publicRateLimit } from "./common.js";
import { OkxApiError } from "../utils/errors.js";

/** Translate raw outcome codes to human-readable labels. */
const OUTCOME_LABELS: Record<string, string> = {
  "0": "pending",
  "1": "YES",
  "2": "NO",
};

/** Known timestamp field names in event contract responses. */
const TIMESTAMP_FIELDS = new Set([
  "expTime", "settleTime", "listTime", "uTime", "cTime", "fixTime",
]);

/**
 * Convert all recognized timestamp fields in an item to "YYYY-MM-DD HH:mm UTC+8".
 * Fields that are missing, zero, or non-numeric are removed (omit empty timestamps).
 */
function convertTimestamps(item: Record<string, unknown>): Record<string, unknown> {
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

/**
 * For write operations: surface any inner sCode/sMsg errors from data items.
 * Mirrors the pattern used in dca.ts and grid.ts.
 */
function normalizeWrite(response: {
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

/**
 * Fetch current index price for a given underlying (e.g. "BTC-USDT").
 * Used to enrich event_get_markets response with the current spot price.
 */
async function fetchIdxPx(
  client: { privateGet: Function },
  underlying: string,
): Promise<string | null> {
  try {
    const r = await client.privateGet(
      "/api/v5/market/index-tickers",
      { instId: underlying },
    );
    const data = (r as Record<string, unknown>)["data"];
    if (Array.isArray(data) && data.length > 0) {
      return String((data[0] as Record<string, unknown>)["idxPx"] ?? "") || null;
    }
  } catch { /* non-critical */ }
  return null;
}

/**
 * Fetch available USDT balance in the trading account.
 * Used to show available funds alongside market data and after placing orders.
 */
async function fetchAvailableUsdt(
  client: { privateGet: Function },
): Promise<string | null> {
  try {
    const r = await client.privateGet(
      "/api/v5/account/balance",
      { ccy: "USDT" },
    );
    const data = (r as Record<string, unknown>)["data"];
    if (Array.isArray(data) && data.length > 0) {
      const details = (data[0] as Record<string, unknown>)["details"];
      if (Array.isArray(details) && details.length > 0) {
        return String((details[0] as Record<string, unknown>)["availBal"] ?? "") || null;
      }
    }
  } catch { /* non-critical */ }
  return null;
}

/**
 * Extract underlying asset from seriesId for known patterns.
 * e.g. "BTC-ABOVE-DAILY" → "BTC", "ETH-UPDOWN-15MIN" → "ETH"
 */
function extractUnderlying(seriesId: string): string | null {
  const m = seriesId.match(/^(BTC|ETH|SOL)/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Parse instId to infer contract expiry time in UTC ms.
 * Handles UPDOWN (expiry = end time, second time part) and ABOVE/TOUCH (expiry = first time part).
 * Times encoded in instId are UTC+8.
 * Returns null if format is unrecognized.
 */
function inferExpiryMsFromInstId(instId: string): number | null {
  const parts = instId.split("-");
  const upper = instId.toUpperCase();

  let dateIdx = -1;
  for (let i = 1; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i]!)) { dateIdx = i; break; }
  }
  if (dateIdx < 0) return null;

  const dp = parts[dateIdx]!;
  const year  = 2000 + parseInt(dp.slice(0, 2), 10);
  const month = parseInt(dp.slice(2, 4), 10) - 1; // 0-based
  const day   = parseInt(dp.slice(4, 6), 10);

  // UPDOWN: DATE-START-END → expiry is END (parts[dateIdx+2] if 4 digits)
  // ABOVE/TOUCH: DATE-EXPIRY-STRIKE → expiry is parts[dateIdx+1]
  const isUpDown = upper.includes("UPDOWN");
  let timePart: string | undefined;
  if (isUpDown) {
    const candidate = parts[dateIdx + 2];
    timePart = (candidate && /^\d{4}$/.test(candidate)) ? candidate : parts[dateIdx + 1];
  } else {
    timePart = parts[dateIdx + 1];
  }
  if (!timePart || !/^\d{4}$/.test(timePart)) return null;

  const hour = parseInt(timePart.slice(0, 2), 10);
  const min  = parseInt(timePart.slice(2, 4), 10);
  // Shift from UTC+8 to UTC
  return Date.UTC(year, month, day, hour - 8, min, 0, 0);
}

/**
 * Extract series ID from a full event contract instrument ID.
 * e.g. "BTC-UPDOWN-15MIN-260325-1700-1715" → "BTC-UPDOWN-15MIN"
 *      "BTC-ABOVE-DAILY-260320-1600-69700"  → "BTC-ABOVE-DAILY"
 */
function extractSeriesId(instId: string): string {
  const parts = instId.split("-");
  for (let i = 0; i < parts.length; i++) {
    if (/^\d{6}$/.test(parts[i]!)) {
      return parts.slice(0, i).join("-");
    }
  }
  return instId;
}

/**
 * Convert semantic outcome string to API value.
 * Accepts: UP / YES → "yes",  DOWN / NO → "no"  (case-insensitive)
 */
function resolveOutcome(value: string): string {
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

const OUTCOME_SCHEMA = {
  type: "string" as const,
  enum: ["UP", "YES", "DOWN", "NO"],
  description: `Which outcome to trade.
UP/DOWN direction contracts: UP (price rises during the period) or DOWN (price falls).
YES/NO price-target or touch contracts: YES (condition met) or NO (condition not met).
Check the series type from event_get_series to determine which applies.
NOTE: px is a probability in 0.00~1.00, NOT a regular asset price.`,
};

export function registerEventContractTools(): ToolSpec[] {
  return [
    // -----------------------------------------------------------------------
    // Public — browse (user-facing) + series / events / markets (internal)
    // -----------------------------------------------------------------------
    {
      name: "event_browse",
      module: "event",
      description: "Browse currently active (in-progress) event contracts. Call when user asks what event contracts are available to trade. Internally fetches series and live markets in parallel, returns only in-progress contracts (floorStrike set). Grouped by settlement type and underlying.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          underlying: {
            type: "string",
            description: "Filter by underlying asset, e.g. BTC-USD, ETH-USD. Omit for all.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const underlyingFilter = readString(args, "underlying");

        // Step 1: fetch all series
        const seriesResp = await context.client.privateGet(
          "/api/v5/public/event-contract/series",
          compactObject({}),
          privateRateLimit("event_browse", 10),
        );
        const allSeries = (Array.isArray(normalizeResponse(seriesResp)["data"])
          ? normalizeResponse(seriesResp)["data"] as Record<string, unknown>[]
          : []);

        // Step 2: pick representative series — prefer human-readable IDs (no random prefix)
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

        // Step 3: fetch live markets for each candidate in parallel
        const marketResults = await Promise.all(
          candidates.map(async (s) => {
            const seriesId = String(s["seriesId"] ?? "");
            const settlement = s["settlement"] as Record<string, unknown> | undefined;
            try {
              const r = await context.client.privateGet(
                "/api/v5/public/event-contract/markets",
                compactObject({ seriesId, state: "live" }),
                privateRateLimit("event_browse", 20),
              );
              const markets = (Array.isArray(normalizeResponse(r)["data"])
                ? normalizeResponse(r)["data"] as Record<string, unknown>[]
                : []);
              // Only in-progress contracts (floorStrike set, not expired)
              const now = Date.now();
              const active = markets
                .filter(m => {
                  if (!m["floorStrike"] || m["floorStrike"] === "") return false;
                  const expMs = Number(m["expTime"] ?? 0);
                  return expMs <= 0 || expMs > now;
                })
                .map(m => {
                  const converted = convertTimestamps(m);
                  return {
                    instId:      m["instId"],
                    expTime:     converted["expTime"],
                    floorStrike: m["floorStrike"],
                    outcome:     OUTCOME_LABELS[String(m["outcome"] ?? "")] ?? m["outcome"],
                  };
                });
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
          }),
        );

        const results = marketResults.filter(Boolean);
        return {
          data: results,
          total: results.reduce((n, r) => n + (r?.contracts?.length ?? 0), 0),
        };
      },
    },

    {
      name: "event_get_series",
      module: "event",
      description: "List event contract series. Returns all available series with settlement type and underlying. Use event_browse to see currently active contracts.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          seriesId: {
            type: "string",
            description: "Filter by series ID, e.g. BTC-ABOVE-DAILY. Omit for all.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/public/event-contract/series",
          compactObject({ seriesId: readString(args, "seriesId") }),
          privateRateLimit("event_get_series", 20),
        );
        return normalizeResponse(response);
      },
    },

    {
      name: "event_get_events",
      module: "event",
      description: "List expiry periods within a series. state: preopen|live|settling|expired. expTime is pre-formatted UTC+8.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          seriesId: {
            type: "string",
            description: "Series ID, e.g. BTC-ABOVE-DAILY (required)",
          },
          eventId: {
            type: "string",
            description: "Filter by event ID, e.g. BTC-ABOVE-DAILY-260224-1600",
          },
          state: {
            type: "string",
            enum: ["preopen", "live", "settling", "expired"],
            description: "preopen=markets not yet trading; live=active; settling=awaiting settlement; expired=done",
          },
          limit: {
            type: "number",
            description: "Max results (default 100, max 100)",
          },
          before: {
            type: "string",
            description: "Pagination: return records newer than this expTime",
          },
          after: {
            type: "string",
            description: "Pagination: return records older than this expTime",
          },
        },
        required: ["seriesId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/public/event-contract/events",
          compactObject({
            seriesId: requireString(args, "seriesId"),
            eventId: readString(args, "eventId"),
            state: readString(args, "state"),
            limit: readNumber(args, "limit"),
            before: readString(args, "before"),
            after: readString(args, "after"),
          }),
          privateRateLimit("event_get_events", 20),
        );
        const base = normalizeResponse(response);
        const data = Array.isArray(base["data"])
          ? (base["data"] as Record<string, unknown>[]).map(convertTimestamps)
          : base["data"];
        return { ...base, data };
      },
    },

    {
      name: "event_get_markets",
      module: "event",
      description: "List tradeable contracts within a series. state=live for active contracts, state=expired for settlement results. floorStrike=strike price; outcome pre-translated (pending/YES/NO/UP/DOWN); timestamps UTC+8.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          seriesId: {
            type: "string",
            description: "Series ID, e.g. BTC-ABOVE-DAILY (required)",
          },
          eventId: {
            type: "string",
            description: "Filter by event ID, e.g. BTC-ABOVE-DAILY-260224-1600",
          },
          instId: {
            type: "string",
            description: "Filter by instrument ID",
          },
          state: {
            type: "string",
            enum: ["preopen", "live", "settling", "expired"],
            description: "preopen=not yet trading; live=active; settling=awaiting settlement; expired=settled",
          },
          limit: {
            type: "number",
            description: "Max results (default 100, max 100)",
          },
          before: {
            type: "string",
            description: "Pagination: return records newer than this expTime",
          },
          after: {
            type: "string",
            description: "Pagination: return records older than this expTime",
          },
        },
        required: ["seriesId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const seriesId = requireString(args, "seriesId");

        // Extract underlying from seriesId for known patterns
        const knownUnderlying = extractUnderlying(seriesId);

        const [marketsResp, seriesResp, idxPxFromKnown, availableUsdt] = await Promise.all([
          context.client.privateGet(
            "/api/v5/public/event-contract/markets",
            compactObject({
              seriesId,
              eventId: readString(args, "eventId"),
              instId: readString(args, "instId"),
              state: readString(args, "state"),
              before: readString(args, "before"),
              after: readString(args, "after"),
            }),
            publicRateLimit("event_get_markets", 20),
          ),
          // Only fetch series if underlying is unknown
          knownUnderlying
            ? Promise.resolve(null)
            : context.client.privateGet(
                "/api/v5/public/event-contract/series",
                compactObject({ seriesId }),
                publicRateLimit("event_get_series", 20),
              ),
          // Fetch index price if underlying known
          knownUnderlying ? fetchIdxPx(context.client, knownUnderlying + "-USDT") : Promise.resolve(null),
          fetchAvailableUsdt(context.client),
        ]);

        // If underlying was unknown, extract from series response
        let underlying = knownUnderlying ? knownUnderlying + "-USDT" : null;
        if (!underlying && seriesResp) {
          const sResp = seriesResp as unknown as Record<string, unknown>;
          const sData = Array.isArray(sResp["data"])
            ? sResp["data"] as Record<string, unknown>[]
            : [];
          if (sData.length > 0) {
            const settlement = sData[0]!["settlement"] as Record<string, unknown> | undefined;
            underlying = String(settlement?.["underlying"] ?? "") || null;
          }
        }

        // If underlying was fetched from series, now fetch idxPx
        const idxPx = idxPxFromKnown ?? (underlying ? await fetchIdxPx(context.client, underlying) : null);

        const base = normalizeResponse(marketsResp);
        const limit = readNumber(args, "limit");
        const rawData = Array.isArray(base["data"]) ? base["data"] as Record<string, unknown>[] : [];
        // Sort by expTime ascending (nearest first) before slicing
        const sorted = [...rawData].sort((a, b) => {
          const tA = Number(a["expTime"] ?? 0);
          const tB = Number(b["expTime"] ?? 0);
          return tA - tB;
        });
        const sliced = limit && limit > 0 ? sorted.slice(0, limit) : sorted;
        const translated = sliced.map(item => {
          const converted = convertTimestamps(item);
          if (typeof converted["outcome"] === "string") {
            converted["outcome"] = OUTCOME_LABELS[converted["outcome"]] ?? converted["outcome"];
          }
          return converted;
        });
        return {
          ...base,
          data: translated,
          currentIdxPx: idxPx,
          underlying,
          availableUsdt,
        };
      },
    },

    {
      name: "event_get_orders",
      module: "event",
      description: "Query event contract orders. state=live for open orders; omit for history. outcome pre-translated (YES/NO/UP/DOWN).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Event contract instrument ID",
          },
          state: {
            type: "string",
            description: "live=pending orders; omit for history",
          },
          limit: {
            type: "number",
            description: "Max results (default 20)",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const state = readString(args, "state");
        const isPending = state === "live";
        const endpoint = isPending
          ? "/api/v5/trade/orders-pending"
          : "/api/v5/trade/orders-history";
        const response = await context.client.privateGet(
          endpoint,
          compactObject({
            instType: "EVENTS",
            instId: readString(args, "instId"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("event_get_orders", 20),
        );
        const base = normalizeResponse(response);
        const data = Array.isArray(base["data"])
          ? (base["data"] as Record<string, unknown>[]).map((item) => ({
              ...item,
              outcome: OUTCOME_LABELS[String(item["outcome"] ?? "")] ?? item["outcome"],
            }))
          : base["data"];
        return { ...base, data };
      },
    },

    {
      name: "event_get_fills",
      module: "event",
      description: "Get event contract fill history. outcome pre-translated (YES/NO/UP/DOWN). Each record includes a 'type' field: 'fill' (subType 410, opening trade) or 'settlement' (subType 414 win / subType 415 loss, contract expiry payout). Settlement records include 'settlementResult' (win/loss) and 'pnl' fields — no separate market lookup needed to determine outcome.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Event contract instrument ID",
          },
          limit: {
            type: "number",
            description: "Max results (default 20)",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/trade/fills",
          compactObject({
            instType: "EVENTS",
            instId: readString(args, "instId"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("event_get_fills", 20),
        );
        const base = normalizeResponse(response);
        const data = Array.isArray(base["data"])
          ? (base["data"] as Record<string, unknown>[]).map((item) => {
              const subType = String(item["subType"] ?? "");
              // subType 414 = winning settlement, 415 = losing settlement
              const isSettle = subType === "414" || subType === "415";
              const fillPx = parseFloat(String(item["fillPx"] ?? "NaN"));
              const fillPnl = parseFloat(String(item["fillPnl"] ?? "NaN"));
              const enriched: Record<string, unknown> = {
                ...item,
                outcome: OUTCOME_LABELS[String(item["outcome"] ?? "")] ?? item["outcome"],
                type: isSettle ? "settlement" : "fill",
              };
              if (isSettle) {
                const isWin = subType === "414" || (subType !== "415" && fillPx === 1);
                enriched["settlementResult"] = isWin ? "win" : "loss";
                enriched["pnl"] = isNaN(fillPnl) ? undefined : fillPnl;
              }
              return enriched;
            })
          : base["data"];
        return { ...base, data };
      },
    },

    // -----------------------------------------------------------------------
    // Private — write
    // -----------------------------------------------------------------------
    {
      name: "event_place_order",
      module: "event",
      description: `Place an event contract order. [CAUTION] Places a real order. Not supported in demo mode.
- outcome: UP/YES (bet price goes up/condition met) or DOWN/NO (bet price goes down/condition not met)
- For limit orders: px is a probability value 0.00~1.00 (e.g. 0.45 = 45%), NOT a regular asset price
- tdMode is always isolated; speedBump is auto-set per exchange requirement — do not pass either`,
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Event contract instrument ID, e.g. BTC-ABOVE-DAILY-260224-1600-120000",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
            description: "buy=open position, sell=close position",
          },
          outcome: OUTCOME_SCHEMA,
          ordType: {
            type: "string",
            enum: ["market", "limit", "post_only"],
            description: "Order type (default market)",
          },
          sz: {
            type: "string",
            description: "For limit/post_only: number of contracts. For market: quote currency amount (server converts to contracts using best available price; actual fill count may differ).",
          },
          px: {
            type: "string",
            description: "Limit price as probability 0.00~1.00. Required when ordType=limit. Do NOT use for market orders.",
          },
        },
        required: ["instId", "side", "outcome", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const ordType = readString(args, "ordType") ?? "market";
        // speedBump is required by the exchange for all non-post_only event contract orders.
        const speedBump = ordType !== "post_only" ? "1" : undefined;
        const response = await context.client.privatePost(
          "/api/v5/trade/order",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: "isolated",
            side: requireString(args, "side"),
            outcome: resolveOutcome(requireString(args, "outcome")),
            ordType,
            sz: requireString(args, "sz"),
            px: readString(args, "px"),
            speedBump,
            tag: context.config.sourceTag,
          }),
          privateRateLimit("event_place_order", 60),
        );
        const base = normalizeResponse(response);
        // Surface inner item-level errors with AI-friendly messages
        if (Array.isArray(base["data"])) {
          const item = (base["data"] as Record<string, unknown>[])[0];
          const sCode = item && String(item["sCode"] ?? "");
          if (sCode && sCode !== "0") {
            const sMsg = String(item!["sMsg"] ?? "Order failed");
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
                { code: sCode, endpoint: response.endpoint },
              );
            }
            throw new OkxApiError(`[${sCode}] ${sMsg}`, { code: sCode, endpoint: response.endpoint });
          }
        }
        // Strip tag from successful response
        const data = Array.isArray(base["data"])
          ? (base["data"] as Record<string, unknown>[]).map(({ tag: _t, ...rest }) => rest)
          : base["data"];
        // Fetch available USDT after order placement for user context
        const availableUsdt = await fetchAvailableUsdt(context.client);
        const result: Record<string, unknown> = { ...base, data };
        if (availableUsdt) result["availableUsdt"] = availableUsdt;

        // Add note for market orders explaining sz semantics
        if (ordType === "market") {
          result["orderNote"] = "Market order: sz is a quote currency amount. The exchange converts it to contracts based on best available price.";
        }
        return result;
      },
    },

    {
      name: "event_amend_order",
      module: "event",
      description: "Amend a pending event contract order (change price or size). [CAUTION] Modifies a real order. Only limit/post_only orders can be amended.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "Event contract instrument ID" },
          ordId:  { type: "string", description: "Order ID to amend" },
          newPx:  { type: "string", description: "New limit price as probability 0.00~1.00 (omit to keep current)" },
          newSz:  { type: "string", description: "New size in contracts (omit to keep current)" },
        },
        required: ["instId", "ordId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/amend-order",
          compactObject({
            instId:  requireString(args, "instId"),
            ordId:   requireString(args, "ordId"),
            newPx:   readString(args, "newPx"),
            newSz:   readString(args, "newSz"),
            speedBump: "1",
          }),
          privateRateLimit("event_amend_order", 60),
        );
        return normalizeWrite(response);
      },
    },

    {
      name: "event_cancel_order",
      module: "event",
      description: "Cancel a pending event contract order. [CAUTION] Cancels a real order. Not supported in demo mode. instId must be the full event contract instrument ID (e.g. BTC-ABOVE-DAILY-260224-1600-69700), NOT a spot trading pair.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Event contract instrument ID",
          },
          ordId: {
            type: "string",
            description: "Order ID to cancel",
          },
        },
        required: ["instId", "ordId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = requireString(args, "instId");
        const response = await context.client.privatePost(
          "/api/v5/trade/cancel-order",
          { instId, ordId: requireString(args, "ordId") },
          privateRateLimit("event_cancel_order", 60),
        );
        // Intercept 51001 before normalizeWrite to give AI a richer message
        if (Array.isArray(response.data) && response.data.length > 0) {
          const item = (response.data as Record<string, unknown>[])[0];
          const sCode = item && String(item["sCode"] ?? "");
          if (sCode === "51001") {
            const expiryMs = inferExpiryMsFromInstId(instId);
            const isExpired = expiryMs !== null && expiryMs < Date.now();
            const reason = isExpired
              ? `The contract (${instId}) has already expired — the order was auto-cancelled at settlement. Check event_get_fills to confirm the outcome.`
              : `Instrument (${instId}) not found. Verify the instId with event_get_markets before retrying.`;
            throw new OkxApiError(reason, { code: sCode, endpoint: response.endpoint });
          }
        }
        return normalizeWrite(response);
      },
    },
  ];
}
