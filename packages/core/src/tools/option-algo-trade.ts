import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";

export function registerOptionAlgoTools(): ToolSpec[] {
  return [
    {
      name: "option_place_algo_order",
      module: "option",
      description:
        "Place OPTION TP/SL algo order (conditional/oco). [CAUTION] Executes real trades. conditional=single TP/SL; oco=TP+SL pair. -1=market.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USD-241227-50000-C",
          },
          tdMode: {
            type: "string",
            enum: ["cash", "cross", "isolated"],
            description: "cash=buyer full premium; cross/isolated=seller margin",
          },
          side: {
            type: "string",
            enum: ["buy", "sell"],
            description: "sell=close long, buy=close short",
          },
          ordType: {
            type: "string",
            enum: ["conditional", "oco"],
            description: "conditional=single TP/SL or both; oco=TP+SL pair (first trigger cancels other)",
          },
          sz: {
            type: "string",
            description: "Contracts count (NOT USDT). Use market_get_instruments for ctVal.",
          },
          tpTriggerPx: {
            type: "string",
            description: "TP trigger price",
          },
          tpOrdPx: {
            type: "string",
            description: "TP order price; -1=market",
          },
          tpTriggerPxType: {
            type: "string",
            enum: ["last", "index", "mark"],
          },
          slTriggerPx: {
            type: "string",
            description: "SL trigger price",
          },
          slOrdPx: {
            type: "string",
            description: "SL order price; -1=market",
          },
          slTriggerPxType: {
            type: "string",
            enum: ["last", "index", "mark"],
          },
          tgtCcy: {
            type: "string",
            enum: ["base_ccy", "quote_ccy"],
            description: "Size unit. base_ccy(default): sz in contracts, quote_ccy: sz in USDT (may not be supported for options)",
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
        const reduceOnly = readBoolean(args, "reduceOnly");
        const response = await context.client.privatePost(
          "/api/v5/trade/order-algo",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            side: requireString(args, "side"),
            ordType: requireString(args, "ordType"),
            sz: requireString(args, "sz"),
            tgtCcy: readString(args, "tgtCcy"),
            tpTriggerPx: readString(args, "tpTriggerPx"),
            tpOrdPx: readString(args, "tpOrdPx"),
            tpTriggerPxType: readString(args, "tpTriggerPxType"),
            slTriggerPx: readString(args, "slTriggerPx"),
            slOrdPx: readString(args, "slOrdPx"),
            slTriggerPxType: readString(args, "slTriggerPxType"),
            reduceOnly: reduceOnly !== undefined ? String(reduceOnly) : undefined,
            clOrdId: readString(args, "clOrdId"),
            tag: context.config.sourceTag,
          }),
          privateRateLimit("option_place_algo_order", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_amend_algo_order",
      module: "option",
      description:
        "Amend a pending OPTION algo order (modify TP/SL prices or size).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USD-241227-50000-C" },
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
          privateRateLimit("option_amend_algo_order", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_cancel_algo_orders",
      module: "option",
      description:
        "Cancel OPTION algo orders (TP/SL). Each item: {algoId, instId}.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            description: "Array of {algoId, instId} to cancel.",
            items: {
              type: "object",
              properties: {
                algoId: {
                  type: "string",
                  description: "Algo order ID",
                },
                instId: {
                  type: "string",
                  description: "e.g. BTC-USD-241227-50000-C",
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
          privateRateLimit("option_cancel_algo_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_get_algo_orders",
      module: "option",
      description:
        "Query pending or completed OPTION algo orders (TP/SL, OCO).",
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
            enum: ["conditional", "oco"],
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
            description: "Cursor: return older",
          },
          before: {
            type: "string",
            description: "Cursor: return newer",
          },
          limit: {
            type: "number",
            description: "Max results (default 100)",
          },
          state: {
            type: "string",
            enum: ["effective", "canceled", "order_failed"],
            description: "When history: effective|canceled|order_failed",
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
          instType: "OPTION",
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
            privateRateLimit("option_get_algo_orders", 20),
          );
          return normalizeResponse(response);
        }

        // No filter: fetch conditional + oco in parallel and merge
        const [r1, r2] = await Promise.all([
          context.client.privateGet(path, { ...baseParams, ordType: "conditional" }, privateRateLimit("option_get_algo_orders", 20)),
          context.client.privateGet(path, { ...baseParams, ordType: "oco" }, privateRateLimit("option_get_algo_orders", 20)),
        ]);
        const merged = [
          ...((r1.data as unknown[]) ?? []),
          ...((r2.data as unknown[]) ?? []),
        ];
        return { endpoint: r1.endpoint, requestTime: r1.requestTime, data: merged };
      },
    },
  ];
}
