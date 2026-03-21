/**
 * Event Contract tools — binary outcome prediction markets.
 *
 * Three product types (settlement.method field in series response):
 *   - price_up_down:    BTC/ETH price UP (rises in period) or DOWN (falls in period)
 *   - price_above:      BTC/ETH price at expiry above strike — YES (1) or NO (2)
 *   - price_once_touch: BTC/ETH price ever touches strike — YES (1) or NO (2)
 *
 * Outcome semantics (input):
 *   UP / YES  → API value "1"
 *   DOWN / NO → API value "2"
 *   Case-insensitive. Invalid values throw a clear error.
 *
 * Outcome semantics (response from markets endpoint):
 *   "0" = not yet settled, "1" = YES won, "2" = NO won
 *
 * Key parameters unique to this module:
 *   outcome   "UP"/"YES" → "1",  "DOWN"/"NO" → "2"
 *   px        probability 0.00~1.00, NOT a regular asset price
 *   slippage  0~1, default "0.05"
 *   tdMode    always "cash" for event contracts
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
import { assertNotDemo, privateRateLimit, publicRateLimit } from "./common.js";
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
 * Convert semantic outcome string to API numeric value.
 * Accepts: UP / YES → "1",  DOWN / NO → "2"  (case-insensitive)
 */
function resolveOutcome(value: string): string {
  const map: Record<string, string> = {
    up: "1",
    yes: "1",
    down: "2",
    no: "2",
  };
  const resolved = map[value.toLowerCase()];
  if (!resolved) {
    throw new Error(
      `Invalid outcome "${value}". Use: UP or YES (outcome 1) for Up/Yes, DOWN or NO (outcome 2) for Down/No.`,
    );
  }
  return resolved;
}

const OUTCOME_SCHEMA = {
  type: "string" as const,
  enum: ["UP", "YES", "DOWN", "NO"],
  description: `Which outcome to trade.
price_up_down series: UP (price rises during the period) or DOWN (price falls).
price_above / price_once_touch series: YES (condition met) or NO (condition not met).
Check the settlement.method field from event_get_series to determine which applies.
NOTE: px is a probability in 0.00~1.00, NOT a regular asset price.`,
};

export function registerEventContractTools(): ToolSpec[] {
  return [
    // -----------------------------------------------------------------------
    // Public — series / events / markets
    // -----------------------------------------------------------------------
    {
      name: "event_get_series",
      module: "event",
      description: `List event contract product series. settlement.method: price_up_down=UP/DOWN bet, price_above=YES/NO bet, price_once_touch=YES/NO bet.
Routing (silent, no explanation to user): orderbook requests → call market_get_orderbook directly; expired-events requests → call event_get_markets(state="expired") directly.
After listing: add "BTC-UPDOWN-15MIN for short-term (15 min); BTC-ABOVE-DAILY for intraday direction."`,
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
      description: "List events within a series. Each event = one expiry. expTime is pre-formatted UTC+8 — show with relative time: '2026-03-20 16:00 UTC+8 (approx X min remaining)'. Omit absent/empty fields.",
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
      description: `List markets within a series. floorStrike = strike price; outcome is pre-translated ("pending"/"YES"/"NO"); all timestamps are UTC+8. For price_above: "BTC ≥ {floorStrike} at expiry → YES wins". For expired results use state=expired.`,
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
        const response = await context.client.publicGet(
          "/api/v5/public/event-contract/markets",
          compactObject({
            seriesId: requireString(args, "seriesId"),
            eventId: readString(args, "eventId"),
            instId: readString(args, "instId"),
            state: readString(args, "state"),
            limit: readNumber(args, "limit"),
            before: readString(args, "before"),
            after: readString(args, "after"),
          }),
          publicRateLimit("event_get_markets", 20),
        );
        const base = normalizeResponse(response);
        const data = Array.isArray(base["data"])
          ? (base["data"] as Record<string, unknown>[]).map((item) => ({
              ...convertTimestamps(item),
              outcome: OUTCOME_LABELS[String(item["outcome"] ?? "")] ?? item["outcome"],
            }))
          : base["data"];
        return { ...base, data };
      },
    },

    // -----------------------------------------------------------------------
    // Private — read
    // -----------------------------------------------------------------------
    {
      name: "event_get_max_size",
      module: "event",
      description: `Get max buy/sell order size for an event contract given current balance.
Returns maxBuySz and maxSellSz (number of contracts).`,
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Event contract instrument ID, e.g. BTC-ABOVE-DAILY-260224-1600-120000",
          },
          outcome: OUTCOME_SCHEMA,
        },
        required: ["instId", "outcome"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/max-size",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: "cash",
            outcome: resolveOutcome(requireString(args, "outcome")),
          }),
          privateRateLimit("event_get_max_size", 20),
        );
        return normalizeResponse(response);
      },
    },

    {
      name: "event_precheck_order",
      module: "event",
      description: `Dry-run an event order (no real trade). Call before event_place_order. px = probability 0~1, not price.
Pre-computed response fields: maxLoss, netMaxWin, riskRewardRatio, feePct (fee % of cost). estFee charged at settlement not upfront.
If feePct > 30: add "⚠️ Fee is {feePct}% of entry cost — limit/post_only order reduces this."`,
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Event contract instrument ID",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
          },
          outcome: OUTCOME_SCHEMA,
          ordType: {
            type: "string",
            enum: ["market", "limit", "post_only"],
            description: "Order type (default market)",
          },
          sz: {
            type: "string",
            description: "Order size (number of contracts)",
          },
          px: {
            type: "string",
            description: "Limit price as probability 0.00~1.00 (e.g. 0.45 = 45% probability). Required when ordType=limit.",
          },
          slippage: {
            type: "string",
            description: "Max slippage ratio for market orders, 0~1 (default 0.05)",
          },
        },
        required: ["instId", "side", "outcome", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/order-precheck",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: "cash",
            side: requireString(args, "side"),
            outcome: resolveOutcome(requireString(args, "outcome")),
            ordType: readString(args, "ordType") ?? "market",
            sz: requireString(args, "sz"),
            px: readString(args, "px"),
            slippage: readString(args, "slippage"),
          }),
          privateRateLimit("event_precheck_order", 10),
        );
        const base = normalizeResponse(response);
        const data = Array.isArray(base["data"])
          ? (base["data"] as Record<string, unknown>[]).map((item) => {
              const cost    = parseFloat(String(item["estCost"]   ?? "0")) || 0;
              const fee     = parseFloat(String(item["estFee"]    ?? "0")) || 0;
              const maxWin  = parseFloat(String(item["estMaxWin"] ?? "0")) || 0;
              const netMaxWin = maxWin - cost - fee;
              const maxLoss   = cost + fee;
              return {
                ...item,
                netMaxWin: netMaxWin.toFixed(4),
                maxLoss:   maxLoss.toFixed(4),
                riskRewardRatio: maxLoss > 0 ? (netMaxWin / maxLoss).toFixed(2) : "N/A",
                feePct: cost > 0 ? Math.round((fee / cost) * 100) : 0,
              };
            })
          : base["data"];
        return { ...base, data };
      },
    },

    {
      name: "event_get_orders",
      module: "event",
      description: "Get event orders. state=live → pending; omit → history. outcome is pre-translated (YES/NO/UP/DOWN). Show most recent 5 first.",
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
        return normalizeResponse(response);
      },
    },

    {
      name: "event_get_fills",
      module: "event",
      description: "Get event fill history. outcome is pre-translated (YES/NO/UP/DOWN). Show most recent 5 by default; summarize if list is long.",
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
          ? (base["data"] as Record<string, unknown>[]).map((item) => ({
              ...item,
              outcome: OUTCOME_LABELS[String(item["outcome"] ?? "")] ?? item["outcome"],
            }))
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
IMPORTANT: Call event_precheck_order first to validate parameters and confirm cost.
- outcome: UP/YES (bet price goes up/condition met) or DOWN/NO (bet price goes down/condition not met)
- For limit orders: px is a probability value 0.00~1.00 (e.g. 0.45 = 45%), NOT a regular asset price
- For market orders: use slippage parameter (not px)
- tdMode is always cash; speedBump is auto-set per exchange requirement — do not pass either
On success: confirm ordId, instId, direction (BUY YES/NO/UP/DOWN), size, ordType, price (if limit). Offer to check fills. sCode and tag are stripped from response.
On failure: tool throws — plain language reason only.`,
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
            description: "Order size (number of contracts)",
          },
          px: {
            type: "string",
            description: "Limit price as probability 0.00~1.00. Required when ordType=limit. Do NOT use for market orders.",
          },
          slippage: {
            type: "string",
            description: "Max slippage ratio for market orders, 0~1 (default 0.05). Do NOT use for limit orders.",
          },
        },
        required: ["instId", "side", "outcome", "sz"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "event_place_order");
        const args = asRecord(rawArgs);
        const ordType = readString(args, "ordType") ?? "market";
        // speedBump is required by the exchange for all non-post_only event contract orders.
        const speedBump = ordType !== "post_only" ? "1" : undefined;
        const response = await context.client.privatePost(
          "/api/v5/trade/order",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: "cash",
            side: requireString(args, "side"),
            outcome: resolveOutcome(requireString(args, "outcome")),
            ordType,
            sz: requireString(args, "sz"),
            px: readString(args, "px"),
            slippage: readString(args, "slippage"),
            speedBump,
            tag: context.config.sourceTag,
          }),
          privateRateLimit("event_place_order", 60),
        );
        const base = normalizeResponse(response);
        // Strip internal fields the user doesn't need to see
        const data = Array.isArray(base["data"])
          ? (base["data"] as Record<string, unknown>[]).map(({ sCode: _s, tag: _t, ...rest }) => rest)
          : base["data"];
        return { ...base, data };
      },
    },

    {
      name: "event_cancel_order",
      module: "event",
      description: `Cancel a pending event contract order. [CAUTION] Cancels a real order. Not supported in demo mode.
On success: "Order {ordId} cancelled." On error (tool throws): plain reason + error code in parentheses. Suggest next action.`,
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
        assertNotDemo(context.config, "event_cancel_order");
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/cancel-order",
          {
            instId: requireString(args, "instId"),
            ordId: requireString(args, "ordId"),
          },
          privateRateLimit("event_cancel_order", 60),
        );
        return normalizeWrite(response);
      },
    },
  ];
}
