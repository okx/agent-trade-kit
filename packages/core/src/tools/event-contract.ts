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
      description: `List all available event contract product series — the top-level product catalog.
Each series groups recurring events of the same underlying asset and frequency.
The settlement.method field indicates the product type:
  - price_up_down: bet whether price rises (UP) or falls (DOWN) within the period
  - price_above: bet whether price is above a strike at expiry (YES/NO)
  - price_once_touch: bet whether price ever touches a strike level (YES/NO)
NOTE: Event contracts use standard market tools for price/orderbook queries:
  - Use market_get_ticker with the event contract instId for current price
  - Use market_get_orderbook with the event contract instId for order depth
  Never tell the user "event_get_orderbook does not exist" — just use market_get_orderbook directly.
HOW TO PRESENT: After listing, briefly guide the user toward a trading style:
  - Daily series (e.g. BTC-ABOVE-DAILY) → intraday directional bet, one settlement per day
  - 15min series (e.g. BTC-UPDOWN-15MIN) → ultra-short-term, settles every 15 minutes
  Recommend the user pick one series and query its live markets next.`,
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
      description: `List events within a series. Each event = one expiry (e.g. BTC-ABOVE-DAILY-260224-1600). States: preopen → live → settling → expired.
HOW TO PRESENT:
  - NEVER show raw millisecond timestamps (e.g. 1774021504465) to users — always convert to human-readable datetime.
  - Express expiry as BOTH absolute UTC and relative: "2026-03-20 16:00 UTC (approx X hours remaining)"
  - Do not show empty/null fields (fixTime, settleValue, etc. when empty) — simply omit them.
  - Highlight the currently live event as the one available for trading.`,
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
        return normalizeResponse(response);
      },
    },

    {
      name: "event_get_markets",
      module: "event",
      description: `List markets (instruments) within an event series. Each market is one strike/outcome pair.
Key response fields:
  - floorStrike: strike price (minimum expiry value that leads to YES settlement)
  - outcome: already translated — "pending" (not settled), "YES" (won), "NO" (lost)
  - settleValue: settlement reference price (only when state=expired)
  - state: preopen → live → settling → expired
For settled results, query with state=expired.
HOW TO PRESENT:
  1. Express settlement condition plainly: "If {underlying} >= {floorStrike} at expiry → YES wins; otherwise NO wins"
  2. For live markets with multiple strikes, characterize each by implied probability (from last price):
     higher floorStrike = lower YES probability = more aggressive bet
     e.g. "69700 (balanced, ~50%) · 69800 (conservative) · 69900 (aggressive)"
  3. Express expiry as absolute UTC + relative time (e.g. "2026-03-20 16:00 UTC, approx 3h 20min remaining")
  4. NEVER show raw timestamps, empty fields (settleValue, fixTime when empty), or internal field names.
  5. End with: recommend calling event_precheck_order before placing any order.`,
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
              ...item,
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
      description: `Dry-run an event contract order: returns estimated cost and risk without placing.
STRONGLY RECOMMENDED: Always call this before event_place_order to validate parameters.
- For limit orders: provide px (probability 0.00~1.00, NOT a regular price)
- For market orders: provide slippage (default 0.05)
Response includes pre-computed derived fields — use them directly:
  maxLoss        = estCost + estFee  (worst case, if bet is wrong)
  netMaxWin      = estMaxWin - estCost - estFee  (net profit if bet is right)
  riskRewardRatio = netMaxWin / maxLoss
  estFee is charged at SETTLEMENT, not upfront.
HOW TO PRESENT — always use this fixed template, in this order:
  Contract:       {instId}
  Win condition:  If {underlying} >= {floorStrike} at expiry → YES wins (or: price rises → UP wins)
  Expires:        {absolute UTC} (approx X hours remaining)
  ──────────────────────────────────────
  Estimated cost: {estCost} USDC
  Max loss:       {maxLoss} USDC  (fee charged at settlement, NOT upfront)
  Net max win:    {netMaxWin} USDC
  Risk/reward:    {riskRewardRatio}
  ──────────────────────────────────────
  [if riskRewardRatio < 0.1]: ⚠️ Fee is high relative to potential gain — consider a limit order to reduce cost
Never show raw field names (estCost/estFee/estMaxWin) or numeric outcome codes to users.`,
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
              };
            })
          : base["data"];
        return { ...base, data };
      },
    },

    {
      name: "event_get_orders",
      module: "event",
      description: `Get event contract orders. When state=live, returns pending orders; otherwise returns order history.
outcome field in response: '1'=YES (or UP for price_up_down), '2'=NO (or DOWN) — always translate; NEVER show "YES(1)" or "NO(2)" style notations.
HOW TO PRESENT: Show the most recent 3–5 orders first. If the user just placed orders in this session, highlight those specifically. Omit internal fields (tdMode, tag, instType, clOrdId) unless user asks. Focus on: ordId, contract, direction (BUY YES/NO/UP/DOWN), price, size, fill status.`,
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
      description: `Get event contract fill (trade) history.
outcome field: '1'=YES/UP, '2'=NO/DOWN — always translate; NEVER show "YES(1)" or "NO(2)" style notations.
HOW TO PRESENT: Default to most recent 3–5 fills. If the list is long (>5), summarize first, then offer to show more. Omit internal fields (tradeId, billId, instType, clOrdId) by default. Fee is negative = paid by user.`,
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
        return normalizeResponse(response);
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
HOW TO PRESENT on success: confirm in plain language — order ID, contract, direction, quantity, price. Never show sCode, tdMode, or tag fields. Always end with an offer to check fill status or view current positions.
On failure: the tool throws an error — explain what went wrong in plain language and whether user should retry.`,
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
        return normalizeResponse(response);
      },
    },

    {
      name: "event_cancel_order",
      module: "event",
      description: `Cancel a pending event contract order. [CAUTION] Cancels a real order. Not supported in demo mode.
HOW TO PRESENT on success: "Order {ordId} cancelled successfully."
On error (tool throws): lead with the plain-language reason, put the error code in parentheses at the end.
  e.g. "Cancel failed: this order no longer exists — it may have already been filled or cancelled. No further action needed. (error 51400)"
  Never put the error code in the headline. Always suggest what the user can do next.`,
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
