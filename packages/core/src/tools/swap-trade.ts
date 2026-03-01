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

const SWAP_INST_TYPES = ["SWAP", "FUTURES"] as const;

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

export function registerSwapTradeTools(): ToolSpec[] {
  return [
    {
      name: "swap_place_order",
      module: "swap",
      description:
        "Place a SWAP or FUTURES perpetual/delivery contract order. Optionally attach take-profit/stop-loss via tpTriggerPx/slTriggerPx (assembled into attachAlgoOrds automatically). [CAUTION] Executes real trades. Private endpoint. Rate limit: 60 req/s per UID.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description:
              "Instrument ID, e.g. BTC-USDT-SWAP for perpetual, BTC-USD-240329 for delivery futures.",
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
              "Quantity in number of contracts (e.g. '1' = 1 contract). For BTC-USDT-SWAP, 1 contract = 0.01 BTC.",
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
          privateRateLimit("swap_place_order", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_cancel_order",
      module: "swap",
      description:
        "Cancel an unfilled SWAP or FUTURES order. Private endpoint. Rate limit: 60 req/s per UID.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT-SWAP.",
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
          privateRateLimit("swap_cancel_order", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_get_orders",
      module: "swap",
      description:
        "Query SWAP or FUTURES open orders or order history. Private endpoint. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "history"],
            description: "Query open orders (default) or history.",
          },
          instType: {
            type: "string",
            enum: [...SWAP_INST_TYPES],
            description: "Instrument type: SWAP (default) or FUTURES.",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter.",
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
        const instType = readString(args, "instType") ?? "SWAP";
        assertEnum(instType, "instType", SWAP_INST_TYPES);
        const path =
          status === "history"
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
          privateRateLimit("swap_get_orders", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_get_positions",
      module: "swap",
      description:
        "Get current SWAP or FUTURES positions. Private endpoint. Rate limit: 10 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: [...SWAP_INST_TYPES],
            description: "Instrument type: SWAP (default) or FUTURES.",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter, e.g. BTC-USDT-SWAP.",
          },
          posId: {
            type: "string",
            description: "Position ID filter.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instType = readString(args, "instType") ?? "SWAP";
        assertEnum(instType, "instType", SWAP_INST_TYPES);
        const response = await context.client.privateGet(
          "/api/v5/account/positions",
          compactObject({
            instType,
            instId: readString(args, "instId"),
            posId: readString(args, "posId"),
          }),
          privateRateLimit("swap_get_positions", 10),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_set_leverage",
      module: "swap",
      description:
        "Set leverage for a SWAP or FUTURES instrument or position. [CAUTION] Changes risk parameters. Private endpoint. Rate limit: 20 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT-SWAP.",
          },
          lever: {
            type: "string",
            description: "Leverage value, e.g. '10'.",
          },
          mgnMode: {
            type: "string",
            enum: ["cross", "isolated"],
            description: "Margin mode.",
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description:
              "Position side. Required for isolated margin in hedge mode.",
          },
        },
        required: ["instId", "lever", "mgnMode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/account/set-leverage",
          compactObject({
            instId: requireString(args, "instId"),
            lever: requireString(args, "lever"),
            mgnMode: requireString(args, "mgnMode"),
            posSide: readString(args, "posSide"),
          }),
          privateRateLimit("swap_set_leverage", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_amend_algo_order",
      module: "swap",
      description:
        "Amend a pending SWAP/FUTURES algo order (modify TP/SL prices or size). Private endpoint. Rate limit: 20 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "Instrument ID, e.g. BTC-USDT-SWAP." },
          algoId: { type: "string", description: "Algo order ID to amend." },
          newSz: { type: "string", description: "New quantity in number of contracts." },
          newTpTriggerPx: { type: "string", description: "New take-profit trigger price." },
          newTpOrdPx: { type: "string", description: "New take-profit order price. Use '-1' for market." },
          newSlTriggerPx: { type: "string", description: "New stop-loss trigger price." },
          newSlOrdPx: { type: "string", description: "New stop-loss order price. Use '-1' for market." },
        },
        required: ["instId", "algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/amend-algos",
          compactObject({
            instId: requireString(args, "instId"),
            algoId: requireString(args, "algoId"),
            newSz: readString(args, "newSz"),
            newTpTriggerPx: readString(args, "newTpTriggerPx"),
            newTpOrdPx: readString(args, "newTpOrdPx"),
            newSlTriggerPx: readString(args, "newSlTriggerPx"),
            newSlOrdPx: readString(args, "newSlOrdPx"),
          }),
          privateRateLimit("swap_amend_algo_order", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_get_fills",
      module: "swap",
      description:
        "Get SWAP or FUTURES transaction fill details. " +
        "archive=false (default): last 3 days. " +
        "archive=true: up to 3 months, default limit 20. " +
        "Private endpoint. Rate limit: 20 req/s.",
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
            enum: [...SWAP_INST_TYPES],
            description: "Instrument type: SWAP (default) or FUTURES.",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter.",
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
        const instType = readString(args, "instType") ?? "SWAP";
        assertEnum(instType, "instType", SWAP_INST_TYPES);
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
          privateRateLimit("swap_get_fills", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_get_order",
      module: "swap",
      description:
        "Get details of a single SWAP or FUTURES order by order ID or client order ID. Private endpoint. Rate limit: 60 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT-SWAP.",
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
          privateRateLimit("swap_get_order", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_close_position",
      module: "swap",
      description:
        "[CAUTION] Close an entire SWAP/FUTURES position at market. Simpler than swap_place_order with reduceOnly when closing the full position. Private. Rate limit: 20 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT-SWAP.",
          },
          mgnMode: {
            type: "string",
            enum: ["cross", "isolated"],
            description: "Margin mode of the position to close.",
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description:
              "Position side. Required in hedge mode (long/short). Omit for one-way mode (net).",
          },
          autoCxl: {
            type: "boolean",
            description:
              "Whether to cancel pending orders for the instrument when closing. Default false.",
          },
          clOrdId: {
            type: "string",
            description: "Client-supplied order ID for the close order.",
          },
          tag: {
            type: "string",
            description: "Order tag.",
          },
        },
        required: ["instId", "mgnMode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const autoCxl = args.autoCxl;
        const response = await context.client.privatePost(
          "/api/v5/trade/close-position",
          compactObject({
            instId: requireString(args, "instId"),
            mgnMode: requireString(args, "mgnMode"),
            posSide: readString(args, "posSide"),
            autoCxl: typeof autoCxl === "boolean" ? String(autoCxl) : undefined,
            clOrdId: readString(args, "clOrdId"),
            tag: readString(args, "tag"),
          }),
          privateRateLimit("swap_close_position", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_batch_orders",
      module: "swap",
      description:
        "[CAUTION] Batch place/cancel/amend up to 20 SWAP/FUTURES orders in one request. Use action='place'/'cancel'/'amend'. Private. Rate limit: 60 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["place", "cancel", "amend"],
            description:
              "Operation type. 'place': batch place orders. 'cancel': batch cancel by ordId/clOrdId. 'amend': batch modify newSz/newPx.",
          },
          orders: {
            type: "array",
            description:
              "Array of order objects (max 20). For 'place': {instId, tdMode, side, ordType, sz, px?, posSide?, reduceOnly?, clOrdId?, tpTriggerPx?, tpOrdPx?, slTriggerPx?, slOrdPx?}. For 'cancel': {instId, ordId} or {instId, clOrdId}. For 'amend': {instId, ordId or clOrdId, newSz?, newPx?}.",
            items: {
              type: "object",
            },
          },
        },
        required: ["action", "orders"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const action = requireString(args, "action");
        assertEnum(action, "action", ["place", "cancel", "amend"]);
        const orders = args.orders;
        if (!Array.isArray(orders) || orders.length === 0) {
          throw new Error("orders must be a non-empty array.");
        }
        const endpointMap: Record<string, string> = {
          place: "/api/v5/trade/batch-orders",
          cancel: "/api/v5/trade/cancel-batch-orders",
          amend: "/api/v5/trade/amend-batch-orders",
        };
        const body: Record<string, unknown>[] =
          action === "place"
            ? orders.map((order: unknown) => {
                const o = asRecord(order);
                const tpTriggerPx = readString(o, "tpTriggerPx");
                const tpOrdPx = readString(o, "tpOrdPx");
                const slTriggerPx = readString(o, "slTriggerPx");
                const slOrdPx = readString(o, "slOrdPx");
                const algoEntry = compactObject({ tpTriggerPx, tpOrdPx, slTriggerPx, slOrdPx });
                const attachAlgoOrds =
                  Object.keys(algoEntry).length > 0 ? [algoEntry] : undefined;
                const reduceOnly = o.reduceOnly;
                return compactObject({
                  instId: requireString(o, "instId"),
                  tdMode: requireString(o, "tdMode"),
                  side: requireString(o, "side"),
                  ordType: requireString(o, "ordType"),
                  sz: requireString(o, "sz"),
                  px: readString(o, "px"),
                  posSide: readString(o, "posSide"),
                  reduceOnly:
                    typeof reduceOnly === "boolean" ? String(reduceOnly) : undefined,
                  clOrdId: readString(o, "clOrdId"),
                  attachAlgoOrds,
                });
              })
            : (orders as Record<string, unknown>[]);
        const response = await context.client.privatePost(
          endpointMap[action],
          body,
          privateRateLimit("swap_batch_orders", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "swap_get_leverage",
      module: "swap",
      description:
        "Get current leverage for a SWAP/FUTURES instrument. Call before swap_place_order to verify leverage. Private. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT-SWAP.",
          },
          mgnMode: {
            type: "string",
            enum: ["cross", "isolated"],
            description: "Margin mode.",
          },
        },
        required: ["instId", "mgnMode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/leverage-info",
          compactObject({
            instId: requireString(args, "instId"),
            mgnMode: requireString(args, "mgnMode"),
          }),
          privateRateLimit("swap_get_leverage", 20),
        );
        return normalize(response);
      },
    },
  ];
}
