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
 *   slippage  0~1, default "0.05"
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
      description: `List event contract product series.

settlement.method semantics (always use these exact Chinese labels when presenting):
  price_up_down    → "涨跌方向（UP/DOWN）"  — bet whether price RISES or FALLS during the period
  price_above      → "价格高于目标价（YES/NO）"  — bet whether price closes ABOVE a strike price at expiry
  price_once_touch → "一次触碰目标价（YES/NO）"  — bet whether price ever TOUCHES the strike price during the period

Series ID format: API returns internal IDs that may be random strings (e.g. FMQRZ, GLUQI) or human-readable (e.g. BTC-ABOVE-DAILY, BTC-UPDOWN-15MIN). ALL returned IDs are valid seriesIds for subsequent calls to event_get_events and event_get_markets — use them as-is.

Presentation rules:
1. Group by settlement.method, show price_up_down first then price_above/price_once_touch.
2. Highlight standard named series (BTC-ABOVE-DAILY, ETH-ABOVE-DAILY, BTC-UPDOWN-15MIN, etc.) with ⭐ as recommended entry points.
3. Summarize random-prefix seriesIds (e.g. FMQRZ-ABOVE-DAILY) as "及 N 个更多 BTC-USDT 系列" — do not enumerate them individually.
4. Always show the seriesId value so user can copy it for next step.

Series ID prefix convention (explain when multiple series share same settlement.method):
  PARAM1- prefix  → parameterized: strike dynamically set per event (flexible target)
  No prefix (e.g. ETH-ABOVE-DAILY) → fixed: standard recurring events with consistent strike levels

Error guidance: if seriesId is provided and no results are returned, tell user "未找到该系列，请检查系列ID是否正确，或不传 seriesId 查看全部系列列表。"

Routing (silent, no explanation to user): orderbook requests → call market_get_orderbook directly; expired-events requests → call event_get_markets(state="expired") directly.

After listing series, always add: "选定系列后，可调用 event_get_events 查看具体合约（含到期时间），再调用 event_get_markets 获取当前赔率和可交易价位，最后使用 event_precheck_order 确认成本后再下单。"`,
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
- outcome: UP/YES (bet price goes up/condition met) or DOWN/NO (bet price goes down/condition not met)
- For limit orders: px is a probability value 0.00~1.00 (e.g. 0.45 = 45%), NOT a regular asset price
- For market orders: use slippage parameter (not px)
- tdMode is always isolated; speedBump is auto-set per exchange requirement — do not pass either
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
            tdMode: "isolated",
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
instId must be the full event contract instrument ID (e.g. BTC-ABOVE-DAILY-260224-1600-69700), NOT a spot trading pair like BTC-USDT.
On success: "Order {ordId} cancelled."
On error (tool throws): explain in plain language. For error 51001 (instrument not found): "合约 {instId} 不存在或已到期，无法撤单。请先调用 event_get_markets 查询当前有效的事件合约 ID，再重试。"
On error 51401 (order may have just filled): "订单可能已成交，请检查成交记录。"`,
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
