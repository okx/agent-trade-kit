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

export function registerSpotTradeTools(): ToolSpec[] {
  return [
    {
      name: "spot_place_order",
      module: "spot",
      description:
        "Place a spot order. Optionally attach take-profit/stop-loss via tpTriggerPx/slTriggerPx (assembled into attachAlgoOrds automatically). [CAUTION] Executes real trades. Private endpoint. Rate limit: 60 req/s per UID.",
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
            description: "cash=regular spot; cross/isolated=margin",
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
            description: "Buy market: quote amount; all others: base amount",
          },
          px: {
            type: "string",
            description: "Required for limit/post_only/fok/ioc",
          },
          clOrdId: {
            type: "string",
            description: "Client order ID (max 32 chars)",
          },
          tag: {
            type: "string",
          },
          tpTriggerPx: {
            type: "string",
            description: "TP trigger price; places TP at tpOrdPx",
          },
          tpOrdPx: {
            type: "string",
            description: "TP order price; -1=market",
          },
          slTriggerPx: {
            type: "string",
            description: "SL trigger price; places SL at slOrdPx",
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
            ordType: requireString(args, "ordType"),
            sz: requireString(args, "sz"),
            px: readString(args, "px"),
            clOrdId: readString(args, "clOrdId"),
            tag: readString(args, "tag"),
            attachAlgoOrds,
          }),
          privateRateLimit("spot_place_order", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "spot_cancel_order",
      module: "spot",
      description:
        "Cancel an unfilled spot order by order ID or client order ID. Private endpoint. Rate limit: 60 req/s per UID.",
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
          privateRateLimit("spot_cancel_order", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "spot_amend_order",
      module: "spot",
      description:
        "Amend an unfilled spot order (modify price or size). Private endpoint. Rate limit: 60 req/s per UID.",
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
            description: "Client order ID",
          },
          newSz: {
            type: "string",
          },
          newPx: {
            type: "string",
          },
          newClOrdId: {
            type: "string",
            description: "New client order ID after amendment",
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
        return normalize(response);
      },
    },
    {
      name: "spot_get_orders",
      module: "spot",
      description:
        "Query spot open orders, order history (last 7 days), or order archive (up to 3 months). Private endpoint. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["open", "history", "archive"],
            description: "open=active, history=7d, archive=3mo",
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
            description: "Pagination: before this order ID",
          },
          before: {
            type: "string",
            description: "Pagination: after this order ID",
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
        return normalize(response);
      },
    },
    {
      name: "spot_place_algo_order",
      module: "spot",
      description:
        "Place a spot algo order with take-profit and/or stop-loss. [CAUTION] Executes real trades. Private endpoint. Rate limit: 20 req/s per UID.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
          },
          ordType: {
            type: "string",
            enum: ["conditional", "oco"],
            description: "conditional=single TP/SL; oco=TP+SL pair (one-cancels-other)",
          },
          sz: {
            type: "string",
            description: "Quantity in base currency",
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
        required: ["instId", "side", "ordType", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/order-algo",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: "cash",
            side: requireString(args, "side"),
            ordType: requireString(args, "ordType"),
            sz: requireString(args, "sz"),
            tpTriggerPx: readString(args, "tpTriggerPx"),
            tpOrdPx: readString(args, "tpOrdPx"),
            slTriggerPx: readString(args, "slTriggerPx"),
            slOrdPx: readString(args, "slOrdPx"),
          }),
          privateRateLimit("spot_place_algo_order", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "spot_amend_algo_order",
      module: "spot",
      description:
        "Amend a pending spot algo order (modify TP/SL prices or size). Private endpoint. Rate limit: 20 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USDT" },
          algoId: { type: "string", description: "Algo order ID" },
          newSz: { type: "string" },
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
          privateRateLimit("spot_amend_algo_order", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "spot_cancel_algo_order",
      module: "spot",
      description:
        "Cancel a spot algo order (TP/SL). Private endpoint. Rate limit: 20 req/s per UID.",
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
            description: "Algo order ID",
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
        return normalize(response);
      },
    },
    {
      name: "spot_get_algo_orders",
      module: "spot",
      description:
        "Query spot algo orders (TP/SL) — pending or history. Private endpoint. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "history"],
            description: "pending=active (default); history=completed",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter",
          },
          ordType: {
            type: "string",
            enum: ["conditional", "oco"],
            description: "Filter by type; omit for all",
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
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const status = readString(args, "status") ?? "pending";
        const path =
          status === "history"
            ? "/api/v5/trade/orders-algo-history"
            : "/api/v5/trade/orders-algo-pending";
        const ordType = readString(args, "ordType");
        const baseParams = compactObject({
          instType: "SPOT",
          instId: readString(args, "instId"),
          after: readString(args, "after"),
          before: readString(args, "before"),
          limit: readNumber(args, "limit"),
        });

        if (ordType) {
          const response = await context.client.privateGet(
            path,
            { ...baseParams, ordType },
            privateRateLimit("spot_get_algo_orders", 20),
          );
          return normalize(response);
        }

        // ordType is required by OKX; fetch both spot types in parallel and merge
        const [r1, r2] = await Promise.all([
          context.client.privateGet(path, { ...baseParams, ordType: "conditional" }, privateRateLimit("spot_get_algo_orders", 20)),
          context.client.privateGet(path, { ...baseParams, ordType: "oco" }, privateRateLimit("spot_get_algo_orders", 20)),
        ]);
        const merged = [
          ...((r1.data as unknown[]) ?? []),
          ...((r2.data as unknown[]) ?? []),
        ];
        return { endpoint: r1.endpoint, requestTime: r1.requestTime, data: merged };
      },
    },
    {
      name: "spot_get_fills",
      module: "spot",
      description:
        "Get spot transaction fill details. " +
        "archive=false (default): last 3 days. " +
        "archive=true: up to 3 months, default limit 20. " +
        "Private endpoint. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          archive: {
            type: "boolean",
            description: "true=up to 3 months; false=last 3 days (default)",
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
            description: "Pagination: before this bill ID",
          },
          before: {
            type: "string",
            description: "Pagination: after this bill ID",
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
        return normalize(response);
      },
    },
    {
      name: "spot_batch_orders",
      module: "spot",
      description:
        "[CAUTION] Batch place/cancel/amend up to 20 spot orders in one request. Use action='place'/'cancel'/'amend'. Private. Rate limit: 60 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["place", "cancel", "amend"],
            description: "place|cancel|amend",
          },
          orders: {
            type: "array",
            description:
              "Array (max 20). place: {instId,side,ordType,sz,tdMode?,px?,clOrdId?,tpTriggerPx?,tpOrdPx?,slTriggerPx?,slOrdPx?} (tdMode defaults to cash). cancel: {instId,ordId|clOrdId}. amend: {instId,ordId|clOrdId,newSz?,newPx?}.",
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
                return compactObject({
                  instId: requireString(o, "instId"),
                  tdMode: readString(o, "tdMode") ?? "cash",
                  side: requireString(o, "side"),
                  ordType: requireString(o, "ordType"),
                  sz: requireString(o, "sz"),
                  px: readString(o, "px"),
                  clOrdId: readString(o, "clOrdId"),
                  attachAlgoOrds,
                });
              })
            : (orders as Record<string, unknown>[]);
        const response = await context.client.privatePost(
          endpointMap[action],
          body,
          privateRateLimit("spot_batch_orders", 60),
        );
        return normalize(response);
      },
    },
    {
      name: "spot_get_order",
      module: "spot",
      description:
        "Get details of a single spot order by order ID or client order ID. Private endpoint. Rate limit: 60 req/s.",
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
        return normalize(response);
      },
    },
    {
      name: "spot_batch_amend",
      module: "spot",
      description:
        "[CAUTION] Batch amend up to 20 unfilled spot orders in one request. Modify price and/or size per order. Private endpoint. Rate limit: 60 req/s.",
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
        return normalize(response);
      },
    },
    {
      name: "spot_batch_cancel",
      module: "spot",
      description:
        "[CAUTION] Batch cancel up to 20 spot orders in one request. Provide instId plus ordId or clOrdId for each order. Private endpoint. Rate limit: 60 req/s.",
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
        return normalize(response);
      },
    },
  ];
}
