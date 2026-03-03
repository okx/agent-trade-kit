import type { ToolSpec } from "./types.js";
import {
  asRecord,
  assertEnum,
  compactObject,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";

const FUTURES_INST_TYPES = ["FUTURES", "SWAP"] as const;

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

export function registerFuturesTools(): ToolSpec[] {
  return [
    {
      name: "futures_place_order",
      module: "futures",
      description:
        "Place a FUTURES delivery contract order (e.g. instId: BTC-USDT-240329). Optionally attach TP/SL via tpTriggerPx/slTriggerPx. [CAUTION] Executes real trades. Private endpoint. Rate limit: 60 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description:
              "Instrument ID, e.g. BTC-USDT-240329 for quarterly delivery futures.",
          },
          tdMode: {
            type: "string",
            enum: ["cross", "isolated"],
            description: "Trade mode: cross or isolated margin.",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
            description:
              "Order side. In one-way mode: buy=open/add long, sell=open/add short. To close: sell with reduceOnly=true (long) or buy with reduceOnly=true (short). In hedge mode: buy+long=open long, sell+long=close long, sell+short=open short, buy+short=close short.",
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description:
              "Position side. IMPORTANT: Most OKX accounts use one-way mode — use 'net' in that case. Only use 'long' or 'short' if your account is configured for hedge mode (双向持仓). If you get an error like 'posSide is not valid', switch to 'net'.",
          },
          ordType: {
            type: "string",
            enum: ["market", "limit", "post_only", "fok", "ioc"],
            description:
              "Order type. 'market': execute immediately at market price, no px needed. 'limit': execute at px or better, px required. 'post_only': maker-only limit order, px required. 'fok': fill entire order immediately or cancel, px required. 'ioc': fill as much as possible immediately, cancel rest, px required.",
          },
          sz: {
            type: "string",
            description:
              "Quantity in number of contracts (e.g. '1' = 1 contract).",
          },
          px: {
            type: "string",
            description:
              "Order price. Required for limit, post_only, fok, ioc orders. Omit for market orders.",
          },
          reduceOnly: {
            type: "boolean",
            description:
              "Set true to close/reduce an existing position without opening a new one. Use this in one-way mode to close positions instead of posSide.",
          },
          clOrdId: {
            type: "string",
            description: "Client-supplied order ID. Up to 32 characters.",
          },
          tag: {
            type: "string",
            description: "Order tag.",
          },
          tpTriggerPx: {
            type: "string",
            description:
              "Take-profit trigger price. When triggered, places a TP order at tpOrdPx. Assembled into attachAlgoOrds automatically.",
          },
          tpOrdPx: {
            type: "string",
            description:
              "Take-profit order price. Use '-1' for market order. Required when tpTriggerPx is set.",
          },
          slTriggerPx: {
            type: "string",
            description:
              "Stop-loss trigger price. When triggered, places a SL order at slOrdPx. Assembled into attachAlgoOrds automatically.",
          },
          slOrdPx: {
            type: "string",
            description:
              "Stop-loss order price. Use '-1' for market order. Required when slTriggerPx is set.",
          },
        },
        required: ["instId", "tdMode", "side", "ordType", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const reduceOnly = args.reduceOnly;
        const tpTriggerPx = readString(args, "tpTriggerPx");
        const tpOrdPx = readString(args, "tpOrdPx");
        const slTriggerPx = readString(args, "slTriggerPx");
        const slOrdPx = readString(args, "slOrdPx");
        const algoEntry = compactObject({ tpTriggerPx, tpOrdPx, slTriggerPx, slOrdPx });
        const attachAlgoOrds = Object.keys(algoEntry).length > 0 ? [algoEntry] : undefined;
        const response = await context.client.privatePost(
          "/api/v5/trade/order",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            side: requireString(args, "side"),
            posSide: readString(args, "posSide"),
            ordType: requireString(args, "ordType"),
            sz: requireString(args, "sz"),
            px: readString(args, "px"),
            reduceOnly: typeof reduceOnly === "boolean" ? String(reduceOnly) : undefined,
            clOrdId: readString(args, "clOrdId"),
            tag: readString(args, "tag"),
            attachAlgoOrds,
          }),
          privateRateLimit("futures_place_order", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "futures_cancel_order",
      module: "futures",
      description:
        "Cancel an unfilled FUTURES delivery order. Private endpoint. Rate limit: 60 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT-240329.",
          },
          ordId: {
            type: "string",
            description: "Order ID.",
          },
          clOrdId: {
            type: "string",
            description: "Client-supplied order ID.",
          },
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/cancel-order",
          compactObject({
            instId: requireString(args, "instId"),
            ordId: readString(args, "ordId"),
            clOrdId: readString(args, "clOrdId"),
          }),
          privateRateLimit("futures_cancel_order", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "futures_get_order",
      module: "futures",
      description:
        "Get details of a single FUTURES delivery order by ordId or clOrdId. Private endpoint. Rate limit: 60 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT-240329.",
          },
          ordId: {
            type: "string",
            description: "Order ID. Provide either ordId or clOrdId.",
          },
          clOrdId: {
            type: "string",
            description: "Client-supplied order ID. Provide either ordId or clOrdId.",
          },
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/trade/order",
          compactObject({
            instId: requireString(args, "instId"),
            ordId: readString(args, "ordId"),
            clOrdId: readString(args, "clOrdId"),
          }),
          privateRateLimit("futures_get_order", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "futures_get_orders",
      module: "futures",
      description:
        "Query FUTURES open orders, history (last 7 days), or archive (up to 3 months). Private. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "history", "archive"],
            description:
              "Query open orders (default), history of last 7 days, or archive of up to 3 months.",
          },
          instType: {
            type: "string",
            enum: [...FUTURES_INST_TYPES],
            description: "Instrument type: FUTURES (default) or SWAP.",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter, e.g. BTC-USDT-240329.",
          },
          ordType: {
            type: "string",
            description: "Order type filter.",
          },
          state: {
            type: "string",
            description: "Order state filter (for history): canceled, filled.",
          },
          after: {
            type: "string",
            description: "Pagination cursor: orders earlier than this order ID.",
          },
          before: {
            type: "string",
            description: "Pagination cursor: orders newer than this order ID.",
          },
          begin: {
            type: "string",
            description: "Start time filter in milliseconds.",
          },
          end: {
            type: "string",
            description: "End time filter in milliseconds.",
          },
          limit: {
            type: "number",
            description: "Number of results, default 100, max 100.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const status = readString(args, "status") ?? "open";
        const instType = readString(args, "instType") ?? "FUTURES";
        assertEnum(instType, "instType", FUTURES_INST_TYPES);
        const path =
          status === "archive"
            ? "/api/v5/trade/orders-history-archive"
            : status === "history"
              ? "/api/v5/trade/orders-history"
              : "/api/v5/trade/orders-pending";
        const response = await context.client.privateGet(
          path,
          compactObject({
            instType,
            instId: readString(args, "instId"),
            ordType: readString(args, "ordType"),
            state: readString(args, "state"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            begin: readString(args, "begin"),
            end: readString(args, "end"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("futures_get_orders", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "futures_get_positions",
      module: "futures",
      description:
        "Get current FUTURES delivery contract positions. Private endpoint. Rate limit: 10 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: [...FUTURES_INST_TYPES],
            description: "Instrument type: FUTURES (default) or SWAP.",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter, e.g. BTC-USDT-240329.",
          },
          posId: {
            type: "string",
            description: "Position ID filter.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instType = readString(args, "instType") ?? "FUTURES";
        assertEnum(instType, "instType", FUTURES_INST_TYPES);
        const response = await context.client.privateGet(
          "/api/v5/account/positions",
          compactObject({
            instType,
            instId: readString(args, "instId"),
            posId: readString(args, "posId"),
          }),
          privateRateLimit("futures_get_positions", 10),
        );
        return normalize(response);
      },
    },
    {
      name: "futures_get_fills",
      module: "futures",
      description:
        "Get FUTURES fill details. archive=false: last 3 days. archive=true: up to 3 months. Private. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          archive: {
            type: "boolean",
            description: "Set true to query fills history up to 3 months. Default false (last 3 days).",
          },
          instType: {
            type: "string",
            enum: [...FUTURES_INST_TYPES],
            description: "Instrument type: FUTURES (default) or SWAP.",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter, e.g. BTC-USDT-240329.",
          },
          ordId: {
            type: "string",
            description: "Order ID filter.",
          },
          after: {
            type: "string",
            description: "Pagination cursor: fills earlier than this bill ID.",
          },
          before: {
            type: "string",
            description: "Pagination cursor: fills newer than this bill ID.",
          },
          begin: {
            type: "string",
            description: "Start time filter in milliseconds.",
          },
          end: {
            type: "string",
            description: "End time filter in milliseconds.",
          },
          limit: {
            type: "number",
            description: "Number of results, max 100. Defaults to 100 (recent) or 20 (archive).",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const archive = readBoolean(args, "archive") ?? false;
        const instType = readString(args, "instType") ?? "FUTURES";
        assertEnum(instType, "instType", FUTURES_INST_TYPES);
        const path = archive ? "/api/v5/trade/fills-history" : "/api/v5/trade/fills";
        const response = await context.client.privateGet(
          path,
          compactObject({
            instType,
            instId: readString(args, "instId"),
            ordId: readString(args, "ordId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            begin: readString(args, "begin"),
            end: readString(args, "end"),
            limit: readNumber(args, "limit") ?? (archive ? 20 : undefined),
          }),
          privateRateLimit("futures_get_fills", 20),
        );
        return normalize(response);
      },
    },
  ];
}
