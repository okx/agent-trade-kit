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

export function registerSpotTradeTools(): ToolSpec[] {
  return [
    {
      name: "spot_place_order",
      module: "spot",
      description:
        "Place a spot order. Attach TP/SL via tpTriggerPx/slTriggerPx. [CAUTION] Executes real trades.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          tdMode: {
            type: "string",
            enum: ["cash", "cross", "isolated"],
            description: "cash=regular spot, cross/isolated=margin",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
          },
          ordType: {
            type: "string",
            enum: ["market", "limit", "post_only", "fok", "ioc"],
            description: "market(no px)|limit(px req)|post_only(maker)|fok(all-or-cancel)|ioc(partial fill)",
          },
          sz: {
            type: "string",
            description: "Buy market: quote amount, all others: base amount",
          },
          tgtCcy: {
            type: "string",
            enum: ["base_ccy", "quote_ccy"],
            description: "Size unit. base_ccy(default): sz in base (e.g. BTC), quote_ccy: sz in quote (e.g. USDT)",
          },
          px: {
            type: "string",
            description: "Required for limit/post_only/fok/ioc",
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
            description: "TP order price, -1=market",
          },
          slTriggerPx: {
            type: "string",
            description: "SL trigger price",
          },
          slOrdPx: {
            type: "string",
            description: "SL order price, -1=market",
          },
        },
        required: ["instId", "tdMode", "side", "ordType", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const attachAlgoOrds = buildAttachAlgoOrds(args);
        const response = await context.client.privatePost(
          "/api/v5/trade/order",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            side: requireString(args, "side"),
            ordType: requireString(args, "ordType"),
            sz: requireString(args, "sz"),
            tgtCcy: readString(args, "tgtCcy"),
            px: readString(args, "px"),
            clOrdId: readString(args, "clOrdId"),
            tag: context.config.sourceTag,
            attachAlgoOrds,
          }),
          privateRateLimit("spot_place_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_cancel_order",
      module: "spot",
      description:
        "Cancel an unfilled spot order.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          ordId: {
            type: "string",
          },
          clOrdId: {
            type: "string",
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
          privateRateLimit("spot_cancel_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_amend_order",
      module: "spot",
      description:
        "Amend an unfilled spot order (modify price or size).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          ordId: {
            type: "string",
          },
          clOrdId: {
            type: "string",
          },
          newSz: {
            type: "string",
            description: "New size in base currency",
          },
          newPx: {
            type: "string",
            description: "New price",
          },
          newClOrdId: {
            type: "string",
            description: "Replacement client order ID",
          },
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/amend-order",
          compactObject({
            instId: requireString(args, "instId"),
            ordId: readString(args, "ordId"),
            clOrdId: readString(args, "clOrdId"),
            newSz: readString(args, "newSz"),
            newPx: readString(args, "newPx"),
            newClOrdId: readString(args, "newClOrdId"),
          }),
          privateRateLimit("spot_amend_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_get_orders",
      module: "spot",
      description:
        "Query spot orders. status: open(active)|history(7d)|archive(3mo).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "history", "archive"],
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
            description: "Cursor: older than this order ID",
          },
          before: {
            type: "string",
            description: "Cursor: newer than this order ID",
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
        const path =
          status === "archive"
            ? "/api/v5/trade/orders-history-archive"
            : status === "history"
              ? "/api/v5/trade/orders-history"
              : "/api/v5/trade/orders-pending";
        const response = await context.client.privateGet(
          path,
          compactObject({
            instType: "SPOT",
            instId: readString(args, "instId"),
            ordType: readString(args, "ordType"),
            state: readString(args, "state"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            begin: readString(args, "begin"),
            end: readString(args, "end"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("spot_get_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_place_algo_order",
      module: "spot",
      description:
        "Place a spot algo order: TP/SL (conditional/oco) or trailing stop (move_order_stop). [CAUTION] Executes real trades.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          tdMode: {
            type: "string",
            enum: ["cash", "cross", "isolated"],
            description: "cash(default)=spot, cross/isolated=margin",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
          },
          ordType: {
            type: "string",
            enum: ["conditional", "oco", "move_order_stop"],
            description: "conditional=single TP/SL, oco=TP+SL pair, move_order_stop=trailing stop",
          },
          sz: {
            type: "string",
            description: "Quantity in base currency",
          },
          tpTriggerPx: {
            type: "string",
            description: "TP trigger price (conditional/oco only)",
          },
          tpOrdPx: {
            type: "string",
            description: "TP order price, -1=market (conditional/oco only)",
          },
          slTriggerPx: {
            type: "string",
            description: "SL trigger price (conditional/oco only)",
          },
          slOrdPx: {
            type: "string",
            description: "SL order price, -1=market (conditional/oco only)",
          },
          tgtCcy: {
            type: "string",
            enum: ["base_ccy", "quote_ccy"],
            description: "Size unit. base_ccy(default): sz in base (e.g. BTC), quote_ccy: sz in quote (e.g. USDT)",
          },
          callbackRatio: {
            type: "string",
            description: "Callback ratio e.g. 0.01=1%, use ratio or spread (move_order_stop only)",
          },
          callbackSpread: {
            type: "string",
            description: "Callback spread in price units, use ratio or spread (move_order_stop only)",
          },
          activePx: {
            type: "string",
            description: "Activation price, trailing starts when market hits this (move_order_stop only)",
          },
        },
        required: ["instId", "side", "ordType", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/order-algo",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: readString(args, "tdMode") ?? "cash",
            side: requireString(args, "side"),
            ordType: requireString(args, "ordType"),
            sz: requireString(args, "sz"),
            tgtCcy: readString(args, "tgtCcy"),
            tpTriggerPx: readString(args, "tpTriggerPx"),
            tpOrdPx: readString(args, "tpOrdPx"),
            slTriggerPx: readString(args, "slTriggerPx"),
            slOrdPx: readString(args, "slOrdPx"),
            callbackRatio: readString(args, "callbackRatio"),
            callbackSpread: readString(args, "callbackSpread"),
            activePx: readString(args, "activePx"),
            tag: context.config.sourceTag,
          }),
          privateRateLimit("spot_place_algo_order", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_amend_algo_order",
      module: "spot",
      description:
        "Amend a pending spot algo order (modify TP/SL prices or size).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USDT" },
          algoId: { type: "string" },
          newSz: { type: "string", description: "New size in base currency" },
          newTpTriggerPx: { type: "string", description: "New TP trigger price" },
          newTpOrdPx: { type: "string", description: "New TP order price, -1=market" },
          newSlTriggerPx: { type: "string", description: "New SL trigger price" },
          newSlOrdPx: { type: "string", description: "New SL order price, -1=market" },
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
          privateRateLimit("spot_amend_algo_order", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_cancel_algo_order",
      module: "spot",
      description:
        "Cancel a spot algo order (TP/SL).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          algoId: {
            type: "string",
          },
        },
        required: ["instId", "algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/cancel-algos",
          [
            {
              instId: requireString(args, "instId"),
              algoId: requireString(args, "algoId"),
            },
          ],
          privateRateLimit("spot_cancel_algo_order", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_get_algo_orders",
      module: "spot",
      description:
        "Query spot algo orders (TP/SL) — pending or history.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "history"],
            description: "pending=active (default), history=completed",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter",
          },
          ordType: {
            type: "string",
            enum: ["conditional", "oco", "move_order_stop"],
            description: "Filter by type",
          },
          after: {
            type: "string",
            description: "Cursor: older than this algo ID",
          },
          before: {
            type: "string",
            description: "Cursor: newer than this algo ID",
          },
          limit: {
            type: "number",
            description: "Max results (default 100)",
          },
          state: {
            type: "string",
            enum: ["effective", "canceled", "order_failed"],
            description: "Required for history. effective=triggered, canceled, order_failed. Default: effective.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const status = readString(args, "status") ?? "pending";
        const isHistory = status === "history";
        const path = isHistory
          ? "/api/v5/trade/orders-algo-history"
          : "/api/v5/trade/orders-algo-pending";
        const ordType = readString(args, "ordType");
        const state = isHistory
          ? readString(args, "state") ?? "effective"
          : undefined;
        const baseParams = compactObject({
          instType: "SPOT",
          instId: readString(args, "instId"),
          after: readString(args, "after"),
          before: readString(args, "before"),
          limit: readNumber(args, "limit"),
          state,
        });

        if (ordType) {
          const response = await context.client.privateGet(
            path,
            { ...baseParams, ordType },
            privateRateLimit("spot_get_algo_orders", 20),
          );
          return normalizeResponse(response);
        }

        // ordType is required by OKX; fetch all three spot types in parallel and merge
        const [r1, r2, r3] = await Promise.all([
          context.client.privateGet(path, { ...baseParams, ordType: "conditional" }, privateRateLimit("spot_get_algo_orders", 20)),
          context.client.privateGet(path, { ...baseParams, ordType: "oco" }, privateRateLimit("spot_get_algo_orders", 20)),
          context.client.privateGet(path, { ...baseParams, ordType: "move_order_stop" }, privateRateLimit("spot_get_algo_orders", 20)),
        ]);
        const merged = [
          ...((r1.data as unknown[]) ?? []),
          ...((r2.data as unknown[]) ?? []),
          ...((r3.data as unknown[]) ?? []),
        ];
        return { endpoint: r1.endpoint, requestTime: r1.requestTime, data: merged };
      },
    },
    {
      name: "spot_get_fills",
      module: "spot",
      description:
          "Get spot transaction fills. archive=false(3d, default)|true(up to 3mo).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          archive: {
            type: "boolean",
            description: "true=up to 3mo, false=3d (default)",
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
            description: "Cursor: older than this bill ID",
          },
          before: {
            type: "string",
            description: "Cursor: newer than this bill ID",
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
        const path = archive ? "/api/v5/trade/fills-history" : "/api/v5/trade/fills";
        const response = await context.client.privateGet(
          path,
          compactObject({
            instType: "SPOT",
            instId: readString(args, "instId"),
            ordId: readString(args, "ordId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            begin: readString(args, "begin"),
            end: readString(args, "end"),
            limit: readNumber(args, "limit") ?? (archive ? 20 : undefined),
          }),
          privateRateLimit("spot_get_fills", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_batch_orders",
      module: "spot",
      description:
        "[CAUTION] Batch place/cancel/amend up to 20 spot orders. action: place|cancel|amend.",
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
                "Array (max 20). place: {instId,side,ordType,sz,tdMode(default cash; use cross for unified/margin accounts),px?,clOrdId?,tpTriggerPx?,tpOrdPx?,slTriggerPx?,slOrdPx?}. cancel: {instId,ordId|clOrdId}. amend: {instId,ordId|clOrdId,newSz?,newPx?}.",
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
                return compactObject({
                  instId: requireString(o, "instId"),
                  tdMode: readString(o, "tdMode") ?? "cash",
                  side: requireString(o, "side"),
                  ordType: requireString(o, "ordType"),
                  sz: requireString(o, "sz"),
                  px: readString(o, "px"),
                  clOrdId: readString(o, "clOrdId"),
                  tag: context.config.sourceTag,
                  attachAlgoOrds,
                });
              })
            : (orders as Record<string, unknown>[]);
        const response = await context.client.privatePost(
          endpointMap[action],
          body,
          privateRateLimit("spot_batch_orders", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_get_order",
      module: "spot",
      description:
        "Get details of a single spot order.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          ordId: {
            type: "string",
            description: "Provide ordId or clOrdId",
          },
          clOrdId: {
            type: "string",
            description: "Provide ordId or clOrdId",
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
          privateRateLimit("spot_get_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_batch_amend",
      module: "spot",
      description:
        "[CAUTION] Batch amend up to 20 unfilled spot orders.",
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
          privateRateLimit("spot_batch_amend", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "spot_batch_cancel",
      module: "spot",
      description:
        "[CAUTION] Batch cancel up to 20 spot orders.",
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
          privateRateLimit("spot_batch_cancel", 60),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
