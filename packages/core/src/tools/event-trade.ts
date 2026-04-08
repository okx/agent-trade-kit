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
 *   px        event contract price (0.01–0.99), reflects market-implied probability when actively trading
 *   tdMode    always "isolated" for event contracts
 *   speedBump auto-set to "1" for non-post_only orders (required by exchange)
 */
import type { ToolSpec, ToolContext } from "./types.js";
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
import { formatDisplayTitle, inferExpiryMsFromInstId, extractSeriesId } from "../utils/event-format.js";

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
  client: ToolContext["client"],
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
 * Fetch available balance in the trading account.
 * TODO: event contracts currently settle in USDT only; replace hardcoded ccy if multi-currency support is added.
 */
async function fetchAvailableBalance(
  client: ToolContext["client"],
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
        // Find USDT entry explicitly; API may return multiple currencies in any order
        const usdtEntry = (details as Record<string, unknown>[]).find(
          (d) => String(d["ccy"] ?? "").toUpperCase() === "USDT",
        );
        if (!usdtEntry) return null;
        return String((usdtEntry as Record<string, unknown>)["availBal"] ?? "") || null;
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

/** Filter series to pick one representative per method:underlying combo, preferring human-readable IDs. */
function filterBrowseCandidates(
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

interface BrowseSeriesResult {
  seriesId: string;
  method: string;
  underlying: string;
  freq: string;
  contracts: Record<string, unknown>[];
}

/** Fetch live markets for a single series candidate and return only active (in-progress) contracts. */
async function fetchActiveContractsForSeries(
  client: ToolContext["client"],
  s: Record<string, unknown>,
): Promise<BrowseSeriesResult | null> {
  const seriesId = String(s["seriesId"] ?? "");
  const settlement = s["settlement"] as Record<string, unknown> | undefined;
  const method = String(settlement?.["method"] ?? "");
  const isUpDown = method === "price_up_down";
  try {
    const r = await client.publicGet(
      "/api/v5/public/event-contract/markets",
      compactObject({ seriesId, state: "live" }),
      publicRateLimit("event_browse", 20),
    );
    const markets = (Array.isArray(normalizeResponse(r)["data"])
      ? normalizeResponse(r)["data"] as Record<string, unknown>[]
      : []);
    const now = Date.now();
    const active = markets
      .filter(m => {
        // price_up_down series have floorStrike="" — skip the check for them
        if (!isUpDown && (!m["floorStrike"] || m["floorStrike"] === "")) return false;
        const expMs = Number(m["expTime"] ?? 0);
        return expMs <= 0 || expMs > now;
      })
      .map(m => {
        const converted = convertTimestamps(m);
        const id = String(m["instId"] ?? "");
        return {
          instId:       id,
          displayTitle: formatDisplayTitle(id),
          expTime:      converted["expTime"],
          floorStrike:  m["floorStrike"],
          px:           m["px"],
          outcome:      OUTCOME_LABELS[String(m["outcome"] ?? "")] ?? m["outcome"],
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
}

/** Resolve underlying from a series API response when it could not be inferred from seriesId. */
function resolveUnderlyingFromSeriesResp(
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
function translateAndSortMarkets(
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
    if (typeof converted["outcome"] === "string") {
      converted["outcome"] = OUTCOME_LABELS[converted["outcome"]] ?? converted["outcome"];
    }
    converted["displayTitle"] = formatDisplayTitle(String(item["instId"] ?? ""));
    return converted;
  });
}

/** Enrich a single fill record with type, settlementResult, and pnl fields. */
function enrichFill(item: Record<string, unknown>): Record<string, unknown> {
  const subType = String(item["subType"] ?? "");
  const isSettle = subType === "414" || subType === "415";
  const enriched: Record<string, unknown> = {
    ...item,
    displayTitle: formatDisplayTitle(String(item["instId"] ?? "")),
    outcome: OUTCOME_LABELS[String(item["outcome"] ?? "")] ?? item["outcome"],
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

/** Handle item-level sCode errors from place order response. Throws OkxApiError if error found. */
function handlePlaceOrderError(
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

const OUTCOME_SCHEMA = {
  type: "string" as const,
  enum: ["UP", "YES", "DOWN", "NO"],
  description: `Which outcome to trade.
UP/DOWN direction contracts: UP (price rises during the period) or DOWN (price falls).
YES/NO price-target or touch contracts: YES (condition met) or NO (condition not met).
Check the series type from event_get_series to determine which applies.
NOTE: px is the event contract price (0.01–0.99), NOT the underlying asset price. It reflects market-implied probability when actively trading.`,
};

export function registerEventContractTools(): ToolSpec[] {
  return [
    // -----------------------------------------------------------------------
    // Public — browse (user-facing) + series / events / markets (internal)
    // -----------------------------------------------------------------------
    {
      name: "event_browse",
      module: "event",
      description: "Browse currently active (in-progress) event contracts. Call when user asks what event contracts are available to trade. Internally fetches series and live markets in parallel, returns only in-progress contracts (floorStrike set). If a live quote field px is present, it is the event contract price (0.01–0.99), not the underlying asset price; it reflects the market-implied probability when actively trading. Grouped by settlement type and underlying.",
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

        const seriesResp = await context.client.publicGet(
          "/api/v5/public/event-contract/series",
          compactObject({}),
          publicRateLimit("event_browse", 10),
        );
        const allSeries = (Array.isArray(normalizeResponse(seriesResp)["data"])
          ? normalizeResponse(seriesResp)["data"] as Record<string, unknown>[]
          : []);

        const candidates = filterBrowseCandidates(allSeries, underlyingFilter);

        const marketResults = await Promise.all(
          candidates.map((s) => fetchActiveContractsForSeries(context.client, s)),
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
        const response = await context.client.publicGet(
          "/api/v5/public/event-contract/series",
          compactObject({ seriesId: readString(args, "seriesId") }),
          publicRateLimit("event_get_series", 20),
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
        const response = await context.client.publicGet(
          "/api/v5/public/event-contract/events",
          compactObject({
            seriesId: requireString(args, "seriesId"),
            eventId: readString(args, "eventId"),
            state: readString(args, "state"),
            limit: readNumber(args, "limit"),
            before: readString(args, "before"),
            after: readString(args, "after"),
          }),
          publicRateLimit("event_get_events", 20),
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
      description: "List tradeable contracts within a series. state=live for active contracts, state=expired for settlement results. floorStrike=strike price; px (when present) is the event contract price (0.01–0.99), not the underlying asset price — reflects the market-implied probability when actively trading; outcome pre-translated (pending/YES/NO/UP/DOWN); timestamps UTC+8.",
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

        const knownUnderlying = extractUnderlying(seriesId);

        const [marketsResp, seriesResp, idxPxFromKnown, availableBalance] = await Promise.all([
          context.client.publicGet(
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
          knownUnderlying
            ? Promise.resolve(null)
            : context.client.publicGet(
                "/api/v5/public/event-contract/series",
                compactObject({ seriesId }),
                publicRateLimit("event_get_series", 20),
              ),
          knownUnderlying ? fetchIdxPx(context.client, knownUnderlying + "-USDT") : Promise.resolve(null),
          fetchAvailableBalance(context.client),
        ]);

        let underlying = knownUnderlying ? knownUnderlying + "-USDT" : null;
        if (!underlying) {
          underlying = resolveUnderlyingFromSeriesResp(seriesResp);
        }

        const idxPx = idxPxFromKnown ?? (underlying ? await fetchIdxPx(context.client, underlying) : null);

        const base = normalizeResponse(marketsResp);
        const limit = readNumber(args, "limit");
        const rawData = Array.isArray(base["data"]) ? base["data"] as Record<string, unknown>[] : [];
        const translated = translateAndSortMarkets(rawData, limit);
        return {
          ...base,
          data: translated,
          currentIdxPx: idxPx,
          underlying,
          availableBalance,
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
              displayTitle: formatDisplayTitle(String(item["instId"] ?? "")),
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
          ? (base["data"] as Record<string, unknown>[]).map(enrichFill)
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
      description: `Place an event contract order. [CAUTION] Places a real order.
- outcome: UP/YES (bet price goes up/condition met) or DOWN/NO (bet price goes down/condition not met)
- For limit orders: px is the event contract price (0.01–0.99), NOT the underlying asset price. It reflects market-implied probability when actively trading
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
            description: "Event contract price (0.01–0.99). Required when ordType=limit. Do NOT use for market orders.",
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
        handlePlaceOrderError(base, asRecord(rawArgs), response.endpoint);
        // Strip tag from successful response
        const data = Array.isArray(base["data"])
          ? (base["data"] as Record<string, unknown>[]).map(({ tag: _t, ...rest }) => rest)
          : base["data"];
        // Fetch available balance after order placement for user context
        const availableBalance = await fetchAvailableBalance(context.client);
        const result: Record<string, unknown> = { ...base, data };
        if (availableBalance) result["availableBalance"] = availableBalance;

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
          newPx:  { type: "string", description: "New event contract price (0.01–0.99). Omit to keep current." },
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
      description: "Cancel a pending event contract order. [CAUTION] Cancels a real order. instId must be the full event contract instrument ID (e.g. BTC-ABOVE-DAILY-260224-1600-69700), NOT a spot trading pair.",
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
