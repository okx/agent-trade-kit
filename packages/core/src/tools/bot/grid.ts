import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "../helpers.js";
import { privateRateLimit } from "../common.js";
import { OkxApiError } from "../../utils/errors.js";

/** For write operations: surface any inner sCode/sMsg errors from data items. */
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
  return {
    endpoint: response.endpoint,
    requestTime: response.requestTime,
    data,
  };
}

export function registerGridTools(): ToolSpec[] {
  return [
    {
      name: "grid_get_orders",
      module: "bot.grid",
      description:
        "List grid bots. status='active' for running; 'history' for stopped.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid"],
            description: "grid=Spot, contract_grid=Contract",
          },
          status: {
            type: "string",
            enum: ["active", "history"],
            description: "active=running (default); history=stopped",
          },
          instId: { type: "string", description: "e.g. BTC-USDT" },
          algoId: { type: "string", description: "Grid bot algo order ID (not a trade ordId)" },
          after: { type: "string", description: "Cursor for older records" },
          before: { type: "string", description: "Cursor for newer records" },
          limit: { type: "number", description: "Default 100" },
        },
        required: ["algoOrdType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoOrdType = requireString(args, "algoOrdType");
        const status = readString(args, "status") ?? "active";
        const path =
          status === "history"
            ? "/api/v5/tradingBot/grid/orders-algo-history"
            : "/api/v5/tradingBot/grid/orders-algo-pending";
        const response = await context.client.privateGet(
          path,
          compactObject({
            algoOrdType,
            instId: readString(args, "instId"),
            algoId: readString(args, "algoId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("grid_get_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "grid_get_order_details",
      module: "bot.grid",
      description: "Get grid bot detail by algo ID. Returns config, status, PnL, and position.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid"],
            description: "grid=Spot, contract_grid=Contract",
          },
          algoId: { type: "string", description: "Grid bot algo order ID (not a trade ordId)" },
        },
        required: ["algoOrdType", "algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/tradingBot/grid/orders-algo-details",
          {
            algoOrdType: requireString(args, "algoOrdType"),
            algoId: requireString(args, "algoId"),
          },
          privateRateLimit("grid_get_order_details", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "grid_get_sub_orders",
      module: "bot.grid",
      description:
        "Query sub-orders (grid trades) of a bot. type='filled' for executed; 'live' for pending.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid"],
            description: "grid=Spot, contract_grid=Contract",
          },
          algoId: { type: "string", description: "Grid bot algo order ID (not a trade ordId)" },
          type: {
            type: "string",
            enum: ["filled", "live"],
            description: "filled=executed trades (default); live=pending",
          },
          groupId: { type: "string", description: "A buy-sell pair shares the same groupId" },
          after: { type: "string", description: "Cursor for older records" },
          before: { type: "string", description: "Cursor for newer records" },
          limit: { type: "number", description: "Default 100" },
        },
        required: ["algoOrdType", "algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/tradingBot/grid/sub-orders",
          compactObject({
            algoOrdType: requireString(args, "algoOrdType"),
            algoId: requireString(args, "algoId"),
            type: readString(args, "type") ?? "filled",
            groupId: readString(args, "groupId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("grid_get_sub_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "grid_create_order",
      module: "bot.grid",
      description:
        "Create grid bot. [CAUTION] Real trades, locks funds. " +
        "Spot('grid'): need quoteSz|baseSz. Contract('contract_grid'): need direction+lever+sz.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USDT" },
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid"],
            description: "grid=Spot, contract_grid=Contract",
          },
          maxPx: { type: "string", description: "Upper price" },
          minPx: { type: "string", description: "Lower price" },
          gridNum: { type: "string", description: "Number of grids" },
          runType: {
            type: "string",
            enum: ["1", "2"],
            description: "1=arithmetic (default); 2=geometric",
          },
          quoteSz: { type: "string", description: "Spot: quote amount (e.g. USDT)" },
          baseSz: { type: "string", description: "Spot: base amount (e.g. BTC)" },
          direction: {
            type: "string",
            enum: ["long", "short", "neutral"],
            description: "Contract only",
          },
          lever: { type: "string", description: "Leverage. Contract only" },
          sz: { type: "string", description: "Margin amount. Contract only" },
          basePos: { type: "boolean", description: "Open base position for contract. Default: true" },
        },
        required: ["instId", "algoOrdType", "maxPx", "minPx", "gridNum"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoOrdType = requireString(args, "algoOrdType");
        const body: Record<string, unknown> = compactObject({
          instId: requireString(args, "instId"),
          algoOrdType,
          maxPx: requireString(args, "maxPx"),
          minPx: requireString(args, "minPx"),
          gridNum: requireString(args, "gridNum"),
          runType: readString(args, "runType"),
          quoteSz: readString(args, "quoteSz"),
          baseSz: readString(args, "baseSz"),
          direction: readString(args, "direction"),
          lever: readString(args, "lever"),
          sz: readString(args, "sz"),
          tag: context.config.sourceTag,
        });
        if (algoOrdType === "contract_grid") {
          body.triggerParams = [{ triggerAction: "start", triggerStrategy: "instant" }];
          body.basePos = readBoolean(args, "basePos") ?? true;
        }
        const response = await context.client.privatePost(
          "/api/v5/tradingBot/grid/order-algo",
          body,
          privateRateLimit("grid_create_order", 20),
        );
        return normalizeWrite(response);
      },
    },
    {
      name: "grid_stop_order",
      module: "bot.grid",
      description:
        "Stop a grid bot. [CAUTION] Closes or cancels orders. " +
        "For contract: stopType controls close ('1') vs cancel-only ('2').",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Grid bot algo order ID (not a trade ordId)" },
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid"],
            description: "grid=Spot, contract_grid=Contract",
          },
          instId: { type: "string", description: "e.g. BTC-USDT" },
          stopType: {
            type: "string",
            enum: ["1", "2", "3", "5", "6"],
            description: "1=close all; 2=keep assets (default); 3=limit close; 5=partial; 6=no sell",
          },
        },
        required: ["algoId", "algoOrdType", "instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/tradingBot/grid/stop-order-algo",
          [compactObject({
            algoId: requireString(args, "algoId"),
            algoOrdType: requireString(args, "algoOrdType"),
            instId: requireString(args, "instId"),
            stopType: readString(args, "stopType") ?? "2",
          })],
          privateRateLimit("grid_stop_order", 20),
        );
        return normalizeWrite(response);
      },
    },
  ];
}
