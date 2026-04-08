import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";
import { resolveQuoteCcySz } from "./tgtccy-conversion.js";

export function registerAlgoTradeTools(): ToolSpec[] {
  return [
    {
      name: "swap_place_algo_order",
      module: "swap",
      description:
        "Place a SWAP/FUTURES algo order: TP/SL (conditional/oco) or trailing stop (move_order_stop). [CAUTION] Executes real trades. " +
        "conditional: single TP, single SL, or both on one order. " +
        "oco: TP+SL simultaneously — first trigger cancels the other. " +
        "move_order_stop: provide callbackRatio (e.g. '0.01'=1%) OR callbackSpread, and optionally activePx. " +
        "Set tpOrdPx='-1' or slOrdPx='-1' for market execution.",
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
            description: "sell=close long, buy=close short",
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description: "net=one-way (default); long/short=hedge mode",
          },
          ordType: {
            type: "string",
            enum: ["conditional", "oco", "move_order_stop"],
            description: "conditional=single TP/SL or both; oco=TP+SL pair (first trigger cancels other); move_order_stop=trailing stop",
          },
          sz: {
            type: "string",
            description: "Number of contracts to close (NOT USDT amount). Use market_get_instruments to get ctVal for conversion.",
          },
          tpTriggerPx: {
            type: "string",
            description: "TP trigger price (conditional/oco only)",
          },
          tpOrdPx: {
            type: "string",
            description: "TP order price; -1=market (conditional/oco only)",
          },
          tpTriggerPxType: {
            type: "string",
            enum: ["last", "index", "mark"],
            description: "last(default)|index|mark (conditional/oco only)",
          },
          slTriggerPx: {
            type: "string",
            description: "SL trigger price (conditional/oco only)",
          },
          slOrdPx: {
            type: "string",
            description: "SL order price; -1=market (recommended) (conditional/oco only)",
          },
          slTriggerPxType: {
            type: "string",
            enum: ["last", "index", "mark"],
            description: "last(default)|index|mark (conditional/oco only)",
          },
          callbackRatio: {
            type: "string",
            description: "Callback ratio (e.g. '0.01'=1%); provide either ratio or spread (move_order_stop only)",
          },
          callbackSpread: {
            type: "string",
            description: "Callback spread in price units; provide either ratio or spread (move_order_stop only)",
          },
          activePx: {
            type: "string",
            description: "Activation price; tracking starts after market reaches this level (move_order_stop only)",
          },
          tgtCcy: {
            type: "string",
            enum: ["base_ccy", "quote_ccy", "margin"],
            description: "Size unit. base_ccy(default): sz in contracts; quote_ccy: sz in USDT notional value; margin: sz in USDT margin cost (actual position = sz * leverage)",
          },
          reduceOnly: {
            type: "boolean",
            description: "Ensure order only reduces position",
          },
          clOrdId: {
            type: "string",
            description: "Client order ID (max 32 chars)",
          },
        },
        required: ["instId", "tdMode", "side", "ordType", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const reduceOnly = args.reduceOnly;
        const resolved = await resolveQuoteCcySz(
          requireString(args, "instId"),
          requireString(args, "sz"),
          readString(args, "tgtCcy"),
          "SWAP",
          context.client,
          readString(args, "tdMode"),
        );
        const response = await context.client.privatePost(
          "/api/v5/trade/order-algo",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            side: requireString(args, "side"),
            posSide: readString(args, "posSide"),
            ordType: requireString(args, "ordType"),
            sz: resolved.sz,
            tgtCcy: resolved.tgtCcy,
            tpTriggerPx: readString(args, "tpTriggerPx"),
            tpOrdPx: readString(args, "tpOrdPx"),
            tpTriggerPxType: readString(args, "tpTriggerPxType"),
            slTriggerPx: readString(args, "slTriggerPx"),
            slOrdPx: readString(args, "slOrdPx"),
            slTriggerPxType: readString(args, "slTriggerPxType"),
            callBackRatio: readString(args, "callbackRatio"),
            callBackSpread: readString(args, "callbackSpread"),
            activePx: readString(args, "activePx"),
            reduceOnly:
              typeof reduceOnly === "boolean" ? String(reduceOnly) : undefined,
            clOrdId: readString(args, "clOrdId"),
            tag: context.config.sourceTag,
          }),
          privateRateLimit("swap_place_algo_order", 20),
        );
        const result = normalizeResponse(response);
        if (resolved.conversionNote) {
          result._conversion = resolved.conversionNote;
        }
        return result;
      },
    },
    {
      name: "swap_place_move_stop_order",
      module: "swap",
      description:
        "[DEPRECATED] Use swap_place_algo_order with ordType='move_order_stop' instead. " +
        "Place a SWAP/FUTURES trailing stop order. [CAUTION] Executes real trades. " +
        "Specify callbackRatio (e.g. '0.01'=1%) or callbackSpread (fixed price distance), not both. " +
        "Optionally set activePx so tracking starts once market reaches that price.",
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
            description: "sell=close long, buy=close short",
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description: "net=one-way (default); long/short=hedge mode",
          },
          sz: {
            type: "string",
            description: "Number of contracts (NOT USDT amount). Use market_get_instruments to get ctVal for conversion.",
          },
          callbackRatio: {
            type: "string",
            description: "Callback ratio (e.g. '0.01'=1%); provide either ratio or spread",
          },
          callbackSpread: {
            type: "string",
            description: "Callback spread in price units; provide either ratio or spread",
          },
          activePx: {
            type: "string",
            description: "Activation price; tracking starts after market reaches this level",
          },
          reduceOnly: {
            type: "boolean",
            description: "Ensure order only reduces position",
          },
          clOrdId: {
            type: "string",
            description: "Client order ID (max 32 chars)",
          },
        },
        required: ["instId", "tdMode", "side", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const reduceOnly = args.reduceOnly;
        const response = await context.client.privatePost(
          "/api/v5/trade/order-algo",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            side: requireString(args, "side"),
            posSide: readString(args, "posSide"),
            ordType: "move_order_stop",
            sz: requireString(args, "sz"),
            callBackRatio: readString(args, "callbackRatio"),
            callBackSpread: readString(args, "callbackSpread"),
            activePx: readString(args, "activePx"),
            reduceOnly:
              typeof reduceOnly === "boolean" ? String(reduceOnly) : undefined,
            clOrdId: readString(args, "clOrdId"),
          }),
          privateRateLimit("swap_place_move_stop_order", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_cancel_algo_orders",
      module: "swap",
      description:
        "Cancel one or more pending SWAP/FUTURES algo orders (TP/SL). Accepts a list of {algoId, instId} objects.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            description: "List of algo orders to cancel. Each item: {algoId, instId}.",
            items: {
              type: "object",
              properties: {
                algoId: {
                  type: "string",
                  description: "Algo order ID",
                },
                instId: {
                  type: "string",
                  description: "e.g. BTC-USDT-SWAP",
                },
              },
              required: ["algoId", "instId"],
            },
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
          "/api/v5/trade/cancel-algos",
          orders,
          privateRateLimit("swap_cancel_algo_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "swap_get_algo_orders",
      module: "swap",
      description:
        "Query pending or completed SWAP/FUTURES algo orders (TP/SL, OCO, trailing stop).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "history"],
            description: "pending=active (default); history=completed",
          },
          instType: {
            type: "string",
            enum: ["SWAP", "FUTURES"],
            description: "SWAP (default) or FUTURES",
          },
          ordType: {
            type: "string",
            enum: ["conditional", "oco", "move_order_stop"],
            description: "Filter by type; omit for all",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter",
          },
          algoId: {
            type: "string",
            description: "Filter by algo order ID",
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
          state: {
            type: "string",
            enum: ["effective", "canceled", "order_failed"],
            description:
              "Required when status=history. effective=triggered, canceled, order_failed. Defaults to effective.",
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
        const instType = readString(args, "instType") ?? "SWAP";
        const baseParams = compactObject({
          instType,
          instId: readString(args, "instId"),
          algoId: readString(args, "algoId"),
          after: readString(args, "after"),
          before: readString(args, "before"),
          limit: readNumber(args, "limit"),
          state,
        });

        if (ordType) {
          const response = await context.client.privateGet(
            path,
            { ...baseParams, ordType },
            privateRateLimit("swap_get_algo_orders", 20),
          );
          return normalizeResponse(response);
        }

        // No filter: fetch all three types in parallel and merge
        const [r1, r2, r3] = await Promise.all([
          context.client.privateGet(path, { ...baseParams, ordType: "conditional" }, privateRateLimit("swap_get_algo_orders", 20)),
          context.client.privateGet(path, { ...baseParams, ordType: "oco" }, privateRateLimit("swap_get_algo_orders", 20)),
          context.client.privateGet(path, { ...baseParams, ordType: "move_order_stop" }, privateRateLimit("swap_get_algo_orders", 20)),
        ]);
        const merged = [
          ...((r1.data as unknown[]) ?? []),
          ...((r2.data as unknown[]) ?? []),
          ...((r3.data as unknown[]) ?? []),
        ];
        return { endpoint: r1.endpoint, requestTime: r1.requestTime, data: merged };
      },
    },
  ];
}

export function registerFuturesAlgoTools(): ToolSpec[] {
  return [
    {
      name: "futures_place_algo_order",
      module: "futures",
      description:
        "Place a FUTURES delivery algo order: TP/SL (conditional/oco) or trailing stop (move_order_stop). [CAUTION] Executes real trades. " +
        "conditional: single TP, single SL, or both on one order. " +
        "oco: TP+SL simultaneously — first trigger cancels the other. " +
        "move_order_stop: provide callbackRatio (e.g. '0.01'=1%) OR callbackSpread, and optionally activePx. " +
        "Set tpOrdPx='-1' or slOrdPx='-1' for market execution.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-240329",
          },
          tdMode: {
            type: "string",
            enum: ["cross", "isolated"],
            description: "cross|isolated margin",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
            description: "sell=close long, buy=close short",
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description: "net=one-way (default); long/short=hedge mode",
          },
          ordType: {
            type: "string",
            enum: ["conditional", "oco", "move_order_stop"],
            description: "conditional=single TP/SL or both; oco=TP+SL pair; move_order_stop=trailing stop",
          },
          sz: {
            type: "string",
            description: "Number of contracts (NOT USDT amount).",
          },
          tpTriggerPx: {
            type: "string",
            description: "TP trigger price (conditional/oco only)",
          },
          tpOrdPx: {
            type: "string",
            description: "TP order price; -1=market (conditional/oco only)",
          },
          tpTriggerPxType: {
            type: "string",
            enum: ["last", "index", "mark"],
            description: "last(default)|index|mark (conditional/oco only)",
          },
          slTriggerPx: {
            type: "string",
            description: "SL trigger price (conditional/oco only)",
          },
          slOrdPx: {
            type: "string",
            description: "SL order price; -1=market (conditional/oco only)",
          },
          slTriggerPxType: {
            type: "string",
            enum: ["last", "index", "mark"],
            description: "last(default)|index|mark (conditional/oco only)",
          },
          callbackRatio: {
            type: "string",
            description: "Callback ratio (e.g. '0.01'=1%); provide either ratio or spread (move_order_stop only)",
          },
          callbackSpread: {
            type: "string",
            description: "Callback spread in price units (move_order_stop only)",
          },
          activePx: {
            type: "string",
            description: "Activation price; tracking starts after market reaches this level (move_order_stop only)",
          },
          tgtCcy: {
            type: "string",
            enum: ["base_ccy", "quote_ccy", "margin"],
            description: "Size unit. base_ccy(default): sz in contracts; quote_ccy: sz in USDT notional value; margin: sz in USDT margin cost (actual position = sz * leverage)",
          },
          reduceOnly: {
            type: "boolean",
            description: "Ensure order only reduces position",
          },
          clOrdId: {
            type: "string",
            description: "Client order ID (max 32 chars)",
          },
        },
        required: ["instId", "tdMode", "side", "ordType", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const reduceOnly = args.reduceOnly;
        const resolved = await resolveQuoteCcySz(
          requireString(args, "instId"),
          requireString(args, "sz"),
          readString(args, "tgtCcy"),
          "FUTURES",
          context.client,
          readString(args, "tdMode"),
        );
        const response = await context.client.privatePost(
          "/api/v5/trade/order-algo",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            side: requireString(args, "side"),
            posSide: readString(args, "posSide"),
            ordType: requireString(args, "ordType"),
            sz: resolved.sz,
            tgtCcy: resolved.tgtCcy,
            tpTriggerPx: readString(args, "tpTriggerPx"),
            tpOrdPx: readString(args, "tpOrdPx"),
            tpTriggerPxType: readString(args, "tpTriggerPxType"),
            slTriggerPx: readString(args, "slTriggerPx"),
            slOrdPx: readString(args, "slOrdPx"),
            slTriggerPxType: readString(args, "slTriggerPxType"),
            callBackRatio: readString(args, "callbackRatio"),
            callBackSpread: readString(args, "callbackSpread"),
            activePx: readString(args, "activePx"),
            reduceOnly:
              typeof reduceOnly === "boolean" ? String(reduceOnly) : undefined,
            clOrdId: readString(args, "clOrdId"),
            tag: context.config.sourceTag,
          }),
          privateRateLimit("futures_place_algo_order", 20),
        );
        const result = normalizeResponse(response);
        if (resolved.conversionNote) {
          result._conversion = resolved.conversionNote;
        }
        return result;
      },
    },
    {
      name: "futures_place_move_stop_order",
      module: "futures",
      description:
        "[DEPRECATED] Use futures_place_algo_order with ordType='move_order_stop' instead. " +
        "Place a FUTURES delivery trailing stop order. [CAUTION] Executes real trades.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-240329",
          },
          tdMode: {
            type: "string",
            enum: ["cross", "isolated"],
            description: "cross|isolated margin",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
            description: "sell=close long, buy=close short",
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description: "net=one-way (default); long/short=hedge mode",
          },
          sz: {
            type: "string",
            description: "Number of contracts (NOT USDT amount).",
          },
          callbackRatio: {
            type: "string",
            description: "Callback ratio (e.g. '0.01'=1%); provide either ratio or spread",
          },
          callbackSpread: {
            type: "string",
            description: "Callback spread in price units; provide either ratio or spread",
          },
          activePx: {
            type: "string",
            description: "Activation price",
          },
          reduceOnly: {
            type: "boolean",
            description: "Ensure order only reduces position",
          },
          clOrdId: {
            type: "string",
            description: "Client order ID (max 32 chars)",
          },
        },
        required: ["instId", "tdMode", "side", "sz"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const reduceOnly = args.reduceOnly;
        const response = await context.client.privatePost(
          "/api/v5/trade/order-algo",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            side: requireString(args, "side"),
            posSide: readString(args, "posSide"),
            ordType: "move_order_stop",
            sz: requireString(args, "sz"),
            callBackRatio: readString(args, "callbackRatio"),
            callBackSpread: readString(args, "callbackSpread"),
            activePx: readString(args, "activePx"),
            reduceOnly:
              typeof reduceOnly === "boolean" ? String(reduceOnly) : undefined,
            clOrdId: readString(args, "clOrdId"),
          }),
          privateRateLimit("futures_place_move_stop_order", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "futures_amend_algo_order",
      module: "futures",
      description:
        "Amend a pending FUTURES delivery algo order (modify TP/SL prices or size).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USDT-240329" },
          algoId: { type: "string", description: "Algo order ID" },
          newSz: { type: "string", description: "New number of contracts" },
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
          privateRateLimit("futures_amend_algo_order", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "futures_cancel_algo_orders",
      module: "futures",
      description:
        "Cancel one or more pending FUTURES delivery algo orders (TP/SL). Accepts a list of {algoId, instId} objects.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            description: "List of algo orders to cancel. Each item: {algoId, instId}.",
            items: {
              type: "object",
              properties: {
                algoId: { type: "string", description: "Algo order ID" },
                instId: { type: "string", description: "e.g. BTC-USDT-240329" },
              },
              required: ["algoId", "instId"],
            },
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
          "/api/v5/trade/cancel-algos",
          orders,
          privateRateLimit("futures_cancel_algo_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "futures_get_algo_orders",
      module: "futures",
      description:
        "Query pending or completed FUTURES delivery algo orders (TP/SL, OCO, trailing stop).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pending", "history"],
            description: "pending=active (default); history=completed",
          },
          ordType: {
            type: "string",
            enum: ["conditional", "oco", "move_order_stop"],
            description: "Filter by type; omit for all",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter",
          },
          algoId: {
            type: "string",
            description: "Filter by algo order ID",
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
          state: {
            type: "string",
            enum: ["effective", "canceled", "order_failed"],
            description:
              "Required when status=history. effective=triggered, canceled, order_failed. Defaults to effective.",
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
          instType: "FUTURES",
          instId: readString(args, "instId"),
          algoId: readString(args, "algoId"),
          after: readString(args, "after"),
          before: readString(args, "before"),
          limit: readNumber(args, "limit"),
          state,
        });

        if (ordType) {
          const response = await context.client.privateGet(
            path,
            { ...baseParams, ordType },
            privateRateLimit("futures_get_algo_orders", 20),
          );
          return normalizeResponse(response);
        }

        // No filter: fetch all three types in parallel and merge
        const [r1, r2, r3] = await Promise.all([
          context.client.privateGet(path, { ...baseParams, ordType: "conditional" }, privateRateLimit("futures_get_algo_orders", 20)),
          context.client.privateGet(path, { ...baseParams, ordType: "oco" }, privateRateLimit("futures_get_algo_orders", 20)),
          context.client.privateGet(path, { ...baseParams, ordType: "move_order_stop" }, privateRateLimit("futures_get_algo_orders", 20)),
        ]);
        const merged = [
          ...((r1.data as unknown[]) ?? []),
          ...((r2.data as unknown[]) ?? []),
          ...((r3.data as unknown[]) ?? []),
        ];
        return { endpoint: r1.endpoint, requestTime: r1.requestTime, data: merged };
      },
    },
  ];
}
