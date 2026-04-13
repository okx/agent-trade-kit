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
import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";
import { OkxApiError } from "../utils/errors.js";
import { formatDisplayTitle, inferExpiryMsFromInstId, extractSeriesId } from "../utils/event-format.js";
import {
  resolveOutcomeLabel,
  mapOrderState,
  convertTimestamps,
  normalizeWrite,
  fetchIdxPx,
  extractQuoteCcy,
  fetchAvailableBalance,
  extractUnderlying,
  resolveOutcome,
  filterBrowseCandidates,
  fetchActiveContractsForSeries,
  resolveUnderlyingFromSeriesResp,
  translateAndSortMarkets,
  enrichFill,
  handlePlaceOrderError,
} from "./event-helpers.js";

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
    // Read-only — browse (user-facing) + series / events / markets (internal)
    // -----------------------------------------------------------------------
    {
      name: "event_browse",
      module: "event",
      description: "Browse currently active (in-progress) event contracts. Call when user asks what event contracts are available to trade. Returns only in-progress contracts (floorStrike set). If a live quote field px is present, it is the event contract price (0.01–0.99), not the underlying asset price; it reflects the market-implied probability when actively trading. Grouped by settlement type and underlying. Do NOT use for querying contracts within a specific series — use event_get_markets with seriesId instead.",
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

        const seriesResp = await context.client.privateGet(
          "/api/v5/public/event-contract/series",
          compactObject({}),
          privateRateLimit("event_browse", 10),
        );
        const normalizedSeries = normalizeResponse(seriesResp);
        const allSeries = Array.isArray(normalizedSeries["data"])
          ? normalizedSeries["data"] as Record<string, unknown>[]
          : [];

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
      description: "List tradeable contracts within a series. state=live for active contracts, state=expired for settlement results. floorStrike=strike price; px (when present) is the event contract price (0.01–0.99), not the underlying asset price — reflects the market-implied probability when actively trading; outcome pre-translated (pending/YES/NO/UP/DOWN); timestamps UTC+8. Do NOT use for discovering what series are available across all underlyings — use event_browse instead.",
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

        const [marketsResp, seriesResp, idxPxFromKnown] = await Promise.all([
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
            privateRateLimit("event_get_markets", 20),
          ),
          knownUnderlying
            ? Promise.resolve(null)
            : context.client.privateGet(
                "/api/v5/public/event-contract/series",
                compactObject({ seriesId }),
                privateRateLimit("event_get_series", 20),
              ),
          knownUnderlying ? fetchIdxPx(context.client, knownUnderlying + "-USDT") : Promise.resolve(null),
        ]);

        let underlying = knownUnderlying ? knownUnderlying + "-USDT" : null;
        if (!underlying) {
          underlying = resolveUnderlyingFromSeriesResp(seriesResp);
        }

        const idxPx = idxPxFromKnown ?? (underlying && !knownUnderlying ? await fetchIdxPx(context.client, underlying) : null);

        const base = normalizeResponse(marketsResp);
        const limit = readNumber(args, "limit");
        const rawData = Array.isArray(base["data"]) ? base["data"] as Record<string, unknown>[] : [];
        const translated = translateAndSortMarkets(rawData, limit);
        return {
          ...base,
          data: translated,
          currentIdxPx: idxPx,
          underlying,
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
          ? (base["data"] as Record<string, unknown>[]).map((item) => {
              const instId = String(item["instId"] ?? "");
              return {
                ...item,
                displayTitle: formatDisplayTitle(instId),
                outcome: resolveOutcomeLabel(instId, String(item["outcome"] ?? "")),
                state: String(item["state"] ?? ""),
                stateLabel: mapOrderState(String(item["state"] ?? "")),
              };
            })
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
      description: `Place an event contract order. [CAUTION] Places a real order. Before placing, call event_get_markets(seriesId, state=live) to obtain the instId of the target contract.
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
        const instId = requireString(args, "instId");
        const response = await context.client.privatePost(
          "/api/v5/trade/order",
          compactObject({
            instId,
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
        // Fetch available balance after order placement for user context.
        // Current implementation assumes USDT settlement for all event contracts.
        // When non-USDT event contracts are introduced, replace this with proper
        // settlement currency resolution from series/market metadata.
        const placeSeriesId = extractSeriesId(instId);
        const placeUnderlying = extractUnderlying(placeSeriesId);
        const placeCcy = extractQuoteCcy(placeUnderlying ? placeUnderlying + "-USDT" : null);
        const balResult = await fetchAvailableBalance(context.client, placeCcy);
        const result: Record<string, unknown> = { ...base, data };
        if (balResult.balance) {
          result["availableBalance"] = balResult.balance;
          result["availableBalanceCcy"] = balResult.ccy;
        }

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
      description: "Amend a pending event contract order (change price or size). [CAUTION] Modifies a real order. Before amending, call event_get_orders(state=live) to obtain the ordId and confirm the order is still pending. Only limit/post_only orders can be amended.",
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
      description: "Cancel a pending event contract order. [CAUTION] Cancels a real order. Before cancelling, call event_get_orders(state=live) to obtain the ordId and confirm the order is still pending. instId must be the full event contract instrument ID (e.g. BTC-ABOVE-DAILY-260224-1600-69700), NOT a spot trading pair.",
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
