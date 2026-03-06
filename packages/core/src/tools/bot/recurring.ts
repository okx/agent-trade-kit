import type { ToolSpec } from "../types.js";
import { asRecord, requireString, readString } from "../helpers.js";
import { privateRateLimit } from "../common.js";

const BASE = "/api/v5/tradingBot/recurring";

function normalize(response: { endpoint: string; requestTime: string; data: unknown }): Record<string, unknown> {
  return { endpoint: response.endpoint, requestTime: response.requestTime, data: response.data };
}

interface RecurringItem {
  ccy: string;
  ratio: string;
}

export function registerRecurringTools(): ToolSpec[] {
  return [
    {
      name: "recurring_create",
      module: "bot-recurring",
      description:
        "Create a recurring buy (DCA) strategy for a portfolio of coins bought periodically. " +
        "recurringList: each coin and its ratio (decimal, must sum to 1.0, e.g. BTC=0.5 + ETH=0.5). " +
        "period: hourly/daily/weekly/monthly. recurringDay required for weekly (1-7) and monthly (1-28). " +
        "recurringTime: hour of execution in UTC (0-23). timeZone: offset e.g. '8' for UTC+8. " +
        "[CAUTION] Executes real trades. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          stgyName: { type: "string", description: "Strategy name (required by OKX)" },
          recurringList: {
            type: "array",
            description: "Array of {ccy, ratio} where ratio is decimal summing to 1.0. e.g. [{ccy:'BTC',ratio:'0.6'},{ccy:'ETH',ratio:'0.4'}]",
            items: {
              type: "object",
              properties: {
                ccy:   { type: "string" },
                ratio: { type: "string", description: "Decimal proportion (0-1), all ratios must sum to 1" },
              },
              required: ["ccy", "ratio"],
            },
          },
          amt:          { type: "string", description: "Total USDT amount to invest per cycle" },
          period:       { type: "string", enum: ["hourly", "daily", "weekly", "monthly"] },
          recurringDay: { type: "string", description: "Day of week (1-7) for weekly, or day of month (1-28) for monthly" },
          recurringTime:{ type: "string", description: "Hour of execution in UTC (0-23, default: 9)" },
          timeZone:     { type: "string", description: "Timezone offset e.g. '8' for UTC+8 (default: '8')" },
          tdMode:       { type: "string", enum: ["cash", "cross"], description: "Trading mode (default: cash)" },
        },
        required: ["stgyName", "recurringList", "amt", "period"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const recurringList = (args["recurringList"] as RecurringItem[]).map(({ ccy, ratio }) => ({ ccy, ratio }));
        const body: Record<string, unknown> = {
          stgyName:      requireString(args, "stgyName"),
          recurringList,
          amt:           requireString(args, "amt"),
          investmentCcy: "USDT",
          period:        requireString(args, "period"),
          recurringTime: readString(args, "recurringTime") ?? "9",
          timeZone:      readString(args, "timeZone") ?? "8",
          tdMode:        readString(args, "tdMode") ?? "cash",
        };
        const recurringDay = readString(args, "recurringDay");
        if (recurringDay) body["recurringDay"] = recurringDay;
        const response = await context.client.privatePost(
          `${BASE}/order-algo`,
          body,
          privateRateLimit("recurring_create", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "recurring_amend",
      module: "bot-recurring",
      description:
        "Rename a running recurring buy strategy. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId:   { type: "string" },
          stgyName: { type: "string", description: "New strategy name" },
        },
        required: ["algoId", "stgyName"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/amend-order-algo`,
          { algoId: requireString(args, "algoId"), stgyName: requireString(args, "stgyName") },
          privateRateLimit("recurring_amend", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "recurring_stop",
      module: "bot-recurring",
      description:
        "Stop a running recurring buy strategy. [CAUTION] Cancels future scheduled buys. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/stop-order-algo`,
          [{ algoId: requireString(args, "algoId") }],
          privateRateLimit("recurring_stop", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "recurring_get_list",
      module: "bot-recurring",
      description: "Query list of active recurring buy strategies. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_rawArgs, context) => {
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-pending`,
          {},
          privateRateLimit("recurring_get_list", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "recurring_get_history",
      module: "bot-recurring",
      description: "Query historical recurring buy strategies. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_rawArgs, context) => {
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-history`,
          {},
          privateRateLimit("recurring_get_history", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "recurring_get_details",
      module: "bot-recurring",
      description: "Query details of a single recurring buy strategy. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-details`,
          { algoId: requireString(args, "algoId") },
          privateRateLimit("recurring_get_details", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "recurring_get_sub_orders",
      module: "bot-recurring",
      description: "Query individual buy orders (sub-orders) generated by a recurring buy strategy. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/sub-orders`,
          { algoId: requireString(args, "algoId") },
          privateRateLimit("recurring_get_sub_orders", 20),
        );
        return normalize(response);
      },
    },
  ];
}
