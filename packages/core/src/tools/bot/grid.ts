import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "../helpers.js";
import { privateRateLimit } from "../common.js";
import { OkxApiError } from "../../utils/errors.js";

function normalize(response: {
  endpoint: string;
  requestTime: string;
  data: unknown;
}): Record<string, unknown> {
  return {
    endpoint: response.endpoint,
    requestTime: response.requestTime,
    data: response.data,
  };
}

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
        "Query grid trading bot list. Use status='active' for running bots, status='history' for completed/stopped bots. " +
        "Covers Spot Grid, Contract Grid, and Moon Grid. Private endpoint. Rate limit: 20 req/2s per UID.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid", "moon_grid"],
            description:
              "Grid bot type. grid=Spot, contract_grid=Contract, moon_grid=Moon. " +
              "Must match the bot's actual type when filtering by algoId.",
          },
          status: {
            type: "string",
            enum: ["active", "history"],
            description: "active=running (default); history=stopped",
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          algoId: {
            type: "string",
            description:
              "Grid bot algo order ID (returned by grid_create_order or grid_get_orders). " +
              "This is NOT a normal trade order ID.",
          },
          after: {
            type: "string",
            description: "Pagination: before this algo ID",
          },
          before: {
            type: "string",
            description: "Pagination: after this algo ID",
          },
          limit: {
            type: "number",
            description: "Max results (default 100)",
          },
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
        return normalize(response);
      },
    },
    {
      name: "grid_get_order_details",
      module: "bot.grid",
      description:
        "Query details of a single grid trading bot by its algo ID. " +
        "Returns configuration, current status, PnL, and position info. " +
        "Private endpoint. Rate limit: 20 req/2s per UID.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid", "moon_grid"],
            description:
              "Must match the bot's actual type (use the algoOrdType value returned by grid_get_orders). " +
              "grid=Spot, contract_grid=Contract, moon_grid=Moon.",
          },
          algoId: {
            type: "string",
            description:
              "Grid bot algo order ID (returned by grid_create_order or grid_get_orders). " +
              "This is NOT a normal trade order ID.",
          },
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
        return normalize(response);
      },
    },
    {
      name: "grid_get_sub_orders",
      module: "bot.grid",
      description:
        "Query individual sub-orders (grid trades) generated by a grid bot. " +
        "Use type='filled' for executed trades, type='live' for pending orders. " +
        "Private endpoint. Rate limit: 20 req/2s per UID.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid", "moon_grid"],
            description:
              "Must match the bot's actual type (use the algoOrdType value returned by grid_get_orders). " +
              "grid=Spot, contract_grid=Contract, moon_grid=Moon.",
          },
          algoId: {
            type: "string",
            description:
              "Grid bot algo order ID (returned by grid_create_order or grid_get_orders). " +
              "This is NOT a normal trade order ID.",
          },
          type: {
            type: "string",
            enum: ["filled", "live"],
            description: "filled=executed trades (default); live=pending orders",
          },
          groupId: {
            type: "string",
            description: "Group ID — a buy-sell pair shares the same groupId. Use to filter a specific grid level.",
          },
          after: {
            type: "string",
            description: "Pagination: before this order ID",
          },
          before: {
            type: "string",
            description: "Pagination: after this order ID",
          },
          limit: {
            type: "number",
            description: "Max results (default 100)",
          },
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
        return normalize(response);
      },
    },
    {
      name: "grid_create_order",
      module: "bot.grid",
      description:
        "Create a new grid trading bot. [CAUTION] Executes real trades and locks funds. " +
        "Supports Spot Grid ('grid') and Contract Grid ('contract_grid'). " +
        "For spot grid, provide quoteSz (invest in quote currency) or baseSz (invest in base currency). " +
        "For contract grids, provide direction, lever, and sz (investment amount in margin currency, e.g. USDT for USDT-margined contracts). " +
        "Private endpoint. Rate limit: 20 req/2s per UID.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid"],
            description: "grid=Spot, contract_grid=Contract",
          },
          maxPx: {
            type: "string",
            description: "Upper price boundary",
          },
          minPx: {
            type: "string",
            description: "Lower price boundary",
          },
          gridNum: {
            type: "string",
            description: "Grid levels (e.g. '10')",
          },
          runType: {
            type: "string",
            enum: ["1", "2"],
            description: "1=arithmetic (default); 2=geometric",
          },
          quoteSz: {
            type: "string",
            description: "Spot grid: invest in quote (e.g. USDT). Provide quoteSz or baseSz.",
          },
          baseSz: {
            type: "string",
            description: "Spot grid: invest in base (e.g. BTC). Provide quoteSz or baseSz.",
          },
          direction: {
            type: "string",
            enum: ["long", "short", "neutral"],
            description: "Required for contract_grid",
          },
          lever: {
            type: "string",
            description: "Leverage (e.g. '5'). Required for contract_grid.",
          },
          sz: {
            type: "string",
            description: "Investment amount in margin currency (e.g. USDT for USDT-margined contracts). Required for contract_grid.",
          },
          basePos: {
            type: "boolean",
            description:
              "Whether to open a base position for contract grid. " +
              "Ignored for neutral direction and spot grid. Default: true",
          },
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
        "Stop a running grid trading bot. [CAUTION] This will close or cancel the bot's orders. " +
        "For contract grids, stopType controls whether open positions are closed ('1') or only orders are cancelled ('2'). " +
        "Private endpoint. Rate limit: 20 req/2s per UID.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: {
            type: "string",
            description:
              "Grid bot algo order ID (returned by grid_create_order or grid_get_orders). " +
              "This is NOT a normal trade order ID.",
          },
          algoOrdType: {
            type: "string",
            enum: ["grid", "contract_grid", "moon_grid"],
            description:
              "Must match the bot's actual type (use the algoOrdType value returned by grid_get_orders). " +
              "grid=Spot, contract_grid=Contract, moon_grid=Moon.",
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          stopType: {
            type: "string",
            enum: ["1", "2", "3", "5", "6"],
            description: "1=stop+sell/close all; 2=stop+keep assets (default); 3=close at limit; 5=partial close; 6=stop without selling (smart arb)",
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
