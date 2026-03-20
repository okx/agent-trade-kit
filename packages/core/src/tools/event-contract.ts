/**
 * Event Contract tools — binary outcome prediction markets.
 *
 * Three product types (method field):
 *   - PRICE_UP_DOWN: BTC/ETH price UP (rises in period) or DOWN (falls in period)
 *   - PRICE_ABOVE:   BTC/ETH price at expiry above strike — YES (1) or NO (2)
 *   - ONE_TOUCH:     BTC/ETH price ever touches strike — YES (1) or NO (2)
 *
 * Outcome semantics:
 *   User input (CLI / MCP): UP / YES  →  API "1"
 *                           DOWN / NO →  API "2"
 *   API response (settled): UP / DOWN / YES / NO  (returned as-is, human-readable)
 *
 * Key parameters unique to this module:
 *   outcome  "UP"/"YES"="1",  "DOWN"/"NO"="2"
 *   px       probability 0.00~1.00, NOT a regular asset price
 *   slippage 0~1, default "0.05"
 *   tdMode   always "cash" for event contracts
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
PRICE_UP_DOWN series: UP (price rises during the period) or DOWN (price falls).
PRICE_ABOVE / ONE_TOUCH series: YES (condition met) or NO (condition not met).
Check the 'method' field from event_get_markets to determine which applies.
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
Each series (e.g. BTC-ABOVE-DAILY, ETH-15MIN) groups recurring events of the same underlying asset and frequency.
The 'method' field indicates the product type:
  - PRICE_UP_DOWN: bet whether price rises (UP) or falls (DOWN) within the period
  - PRICE_ABOVE: bet whether price is above a strike at expiry (YES/NO)
  - ONE_TOUCH: bet whether price ever touches a strike level (YES/NO)`,
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
      description:
        "List events within a series. Each event corresponds to one expiry (e.g. BTC-ABOVE-DAILY-260224-1600). Use state=live for active events.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          seriesId: {
            type: "string",
            description: "Series ID, e.g. BTC-ABOVE-DAILY (required)",
          },
          state: {
            type: "string",
            enum: ["live", "settled", "expired"],
            description: "Filter by event state",
          },
          limit: {
            type: "number",
            description: "Max results (default 20)",
          },
          before: {
            type: "string",
            description: "Pagination: results before this event ID",
          },
          after: {
            type: "string",
            description: "Pagination: results after this event ID",
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
Key fields to understand the product structure:
  - method: PRICE_UP_DOWN / PRICE_ABOVE / ONE_TOUCH — determines which outcome values apply
  - stk (strike): the reference price level for PRICE_ABOVE and ONE_TOUCH
  - freq: period duration for PRICE_UP_DOWN (e.g. "15m")
  - outcome / settleValue: only present for expired/settled markets
For expired events, response includes outcome (UP/DOWN/YES/NO) and settleValue.`,
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
            enum: ["live", "expired"],
            description: "Filter by market state",
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
          }),
          publicRateLimit("event_get_markets", 20),
        );
        return normalizeResponse(response);
      },
    },

    // -----------------------------------------------------------------------
    // Public — ended/settled contracts
    // -----------------------------------------------------------------------
    {
      name: "event_get_ended",
      module: "event",
      description: `List recently ended/settled event contracts with outcomes (UP/DOWN/YES/NO).
Useful for reviewing settlement results and understanding historical patterns.
Returns up to 300 most recent ended contracts for the given series and method.
The 'outcome' field shows the winning side: UP/DOWN for PRICE_UP_DOWN, YES/NO for PRICE_ABOVE/ONE_TOUCH.`,
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          seriesId: {
            type: "string",
            description: "Series ID, e.g. BTC-ABOVE-DAILY (required)",
          },
          method: {
            type: "string",
            enum: ["PRICE_UP_DOWN", "PRICE_ABOVE", "ONE_TOUCH"],
            description: "Product method type (required). Must match the series method.",
          },
        },
        required: ["seriesId", "method"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/public/event-contract/offlined",
          compactObject({
            seriesId: requireString(args, "seriesId"),
            method: requireString(args, "method"),
          }),
          publicRateLimit("event_get_ended", 20),
        );
        return normalizeResponse(response);
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
**STRONGLY RECOMMENDED**: Always call this tool before event_place_order to validate parameters.
- For limit orders: provide px (a probability value 0.00~1.00, NOT a regular price)
- For market orders: provide slippage (default 0.05)`,
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
            enum: ["market", "limit"],
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
        return normalizeResponse(response);
      },
    },

    {
      name: "event_get_orders",
      module: "event",
      description:
        "Get event contract orders. When state=live, returns pending orders; otherwise returns order history.",
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
      description:
        "Get event contract fill (trade) history.",
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
- tdMode is always cash — do not pass it`,
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
            enum: ["market", "limit"],
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
        const response = await context.client.privatePost(
          "/api/v5/trade/order",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: "cash",
            side: requireString(args, "side"),
            outcome: resolveOutcome(requireString(args, "outcome")),
            ordType: readString(args, "ordType") ?? "market",
            sz: requireString(args, "sz"),
            px: readString(args, "px"),
            slippage: readString(args, "slippage"),
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
      description:
        "Cancel a pending event contract order. [CAUTION] Cancels a real order. Not supported in demo mode.",
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
        return normalizeResponse(response);
      },
    },
  ];
}
