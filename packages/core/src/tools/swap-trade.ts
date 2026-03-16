import type { ToolSpec } from "./types.js";
import {
  asRecord,
  assertEnum,
  buildAttachAlgoOrds,
  compactObject,
  normalizeResponse,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";

const SWAP_INST_TYPES = ["SWAP", "FUTURES"] as const;

export function registerSwapTradeTools(): ToolSpec[] {
  return [
    {
      name: "swap_place_order",
      module: "swap",
      description:
        "Place SWAP/FUTURES order. Attach TP/SL via tpTriggerPx/slTriggerPx. [CAUTION] Executes real trades.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          tdMode: {
            type: "string",
            enum: ["cross", "isolated"],
            description: "cross|isolated margin",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
            description: "buy=long, sell=short; hedge: use with posSide",
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description: "net=one-way (default); long/short=hedge mode",
          },
          ordType: {
            type: "string",
            enum: ["market", "limit", "post_only", "fok", "ioc"],
            description: "market=no px; limit/fok/ioc=px req; post_only=maker",
          },
          sz: {
            type: "string",
            description: "Contracts count (NOT USDT). Use market_get_instruments for ctVal.",
          },
          px: {
            type: "string",
            description: "Required for limit/post_only/fok/ioc",
          },
          reduceOnly: {
            type: "boolean",
            description: "Close/reduce only, no new position (one-way mode)",
          },
          clOrdId: {
            type: "string",
            description: "Client order ID (max 32 chars)",
          },
          tpTriggerPx: {
            type: "string",
            description: "TP trigger price",
          },
          tpOrdPx: {
            type: "string",
            description: "TP order price; -1=market",
          },
          slTriggerPx: {
            type: "string",
            description: "SL trigger price",
          },
          slOrdPx: {
            type: "string",
            description: "SL order price; -1=market",
          },
        },
        required: ["instId", "tdMode", "side", "ordType", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const reduceOnly = args.reduceOnly;
        const attachAlgoOrds = buildAttachAlgoOrds(args);
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
            tag: context.config.sourceTag,
            attachAlgoOrds,
          }),
          privateRateLimit("swap_place_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_cancel_order",
      module: "swap",
      description:
        "Cancel an unfilled SWAP or FUTURES order.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          ordId: {
            type: "string",
          },
          clOrdId: {
            type: "string",
            description: "Client order ID",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_get_orders",
      module: "swap",
      description:
        "Query SWAP or FUTURES open orders, history (last 7 days), or archive (up to 3 months).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "history", "archive"],
            description: "open=active, history=7d, archive=3mo",
          },
          instType: {
            type: "string",
            enum: [...SWAP_INST_TYPES],
            description: "SWAP (default) or FUTURES",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter",
          },
          ordType: {
            type: "string",
            description: "Order type filter",
          },
          state: {
            type: "string",
            description: "canceled|filled",
          },
          after: {
            type: "string",
            description: "Cursor: return older",
          },
          before: {
            type: "string",
            description: "Cursor: return newer",
          },
          begin: {
            type: "string",
            description: "Start time (ms)",
          },
          end: {
            type: "string",
            description: "End time (ms)",
          },
          limit: {
            type: "number",
            description: "Max results (default 100)",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const status = readString(args, "status") ?? "open";
        const instType = readString(args, "instType") ?? "SWAP";
        assertEnum(instType, "instType", SWAP_INST_TYPES);
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
          privateRateLimit("swap_get_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_get_positions",
      module: "swap",
      description:
        "Get current SWAP or FUTURES positions.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: [...SWAP_INST_TYPES],
            description: "SWAP (default) or FUTURES",
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          posId: {
            type: "string",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_set_leverage",
      module: "swap",
      description:
        "Set leverage for a SWAP or FUTURES instrument or position. [CAUTION] Changes risk parameters.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          lever: {
            type: "string",
            description: "Leverage, e.g. '10'",
          },
          mgnMode: {
            type: "string",
            enum: ["cross", "isolated"],
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description: "Required for isolated margin in hedge mode",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_amend_algo_order",
      module: "swap",
      description:
        "Amend a pending SWAP/FUTURES algo order (modify TP/SL prices or size).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USDT-SWAP" },
          algoId: { type: "string", description: "Algo order ID" },
          newSz: { type: "string", description: "New contracts count" },
          newTpTriggerPx: { type: "string", description: "New TP trigger price" },
          newTpOrdPx: { type: "string", description: "New TP order price; -1=market" },
          newSlTriggerPx: { type: "string", description: "New SL trigger price" },
          newSlOrdPx: { type: "string", description: "New SL order price; -1=market" },
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
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_get_fills",
      module: "swap",
      description:
        "Get SWAP or FUTURES fill details. archive=false (default): last 3 days; archive=true: up to 3 months.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          archive: {
            type: "boolean",
            description: "true=up to 3 months; false=last 3 days (default)",
          },
          instType: {
            type: "string",
            enum: [...SWAP_INST_TYPES],
            description: "SWAP (default) or FUTURES",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter",
          },
          ordId: {
            type: "string",
            description: "Order ID filter",
          },
          after: {
            type: "string",
            description: "Cursor: return older",
          },
          before: {
            type: "string",
            description: "Cursor: return newer",
          },
          begin: {
            type: "string",
            description: "Start time (ms)",
          },
          end: {
            type: "string",
            description: "End time (ms)",
          },
          limit: {
            type: "number",
            description: "Max results (default 100 or 20 for archive)",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_get_order",
      module: "swap",
      description:
        "Get details of a single SWAP or FUTURES order by ordId or clOrdId.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          ordId: {
            type: "string",
            description: "Provide ordId or clOrdId",
          },
          clOrdId: {
            type: "string",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_close_position",
      module: "swap",
      description:
        "[CAUTION] Close entire SWAP/FUTURES position at market.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          mgnMode: {
            type: "string",
            enum: ["cross", "isolated"],
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description: "long/short=hedge mode; omit for one-way (net)",
          },
          autoCxl: {
            type: "boolean",
            description: "Cancel pending orders for this instrument on close",
          },
          clOrdId: {
            type: "string",
            description: "Client order ID for close order",
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
            tag: context.config.sourceTag,
          }),
          privateRateLimit("swap_close_position", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_batch_orders",
      module: "swap",
      description:
        "[CAUTION] Batch place/cancel/amend SWAP/FUTURES orders (max 20). action=place|cancel|amend.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["place", "cancel", "amend"],
          },
          orders: {
            type: "array",
            description:
              "Max 20. place:{instId,tdMode,side,ordType,sz,...}; cancel:{instId,ordId|clOrdId}; amend:{instId,ordId|clOrdId,newSz?,newPx?}.",
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
                const attachAlgoOrds = buildAttachAlgoOrds(o);
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
                  tag: context.config.sourceTag,
                  attachAlgoOrds,
                });
              })
            : (orders as Record<string, unknown>[]);
        const response = await context.client.privatePost(
          endpointMap[action],
          body,
          privateRateLimit("swap_batch_orders", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_get_leverage",
      module: "swap",
      description:
        "Get current leverage for a SWAP/FUTURES instrument.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          mgnMode: {
            type: "string",
            enum: ["cross", "isolated"],
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
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_batch_amend",
      module: "swap",
      description:
        "[CAUTION] Batch amend up to 20 unfilled SWAP/FUTURES orders.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            description: "Array (max 20): {instId, ordId?, clOrdId?, newSz?, newPx?}",
            items: { type: "object" },
          },
        },
        required: ["orders"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const orders = args.orders;
        if (!Array.isArray(orders) || orders.length === 0) {
          throw new Error("orders must be a non-empty array.");
        }
        const response = await context.client.privatePost(
          "/api/v5/trade/amend-batch-orders",
          orders as Record<string, unknown>[],
          privateRateLimit("swap_batch_amend", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_batch_cancel",
      module: "swap",
      description:
        "[CAUTION] Batch cancel up to 20 SWAP/FUTURES orders.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            description: "Array (max 20): {instId, ordId?, clOrdId?}",
            items: { type: "object" },
          },
        },
        required: ["orders"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const orders = args.orders;
        if (!Array.isArray(orders) || orders.length === 0) {
          throw new Error("orders must be a non-empty array.");
        }
        const response = await context.client.privatePost(
          "/api/v5/trade/cancel-batch-orders",
          orders as Record<string, unknown>[],
          privateRateLimit("swap_batch_cancel", 60),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
