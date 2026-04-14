import type { ToolSpec } from "./types.js";
import {
  asRecord,
  assertEnum,
  buildAttachAlgoOrds,
  compactObject,
  normalizeResponse,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";
import { buildContractTradeTools } from "./contract-trade.js";

export function registerSwapTradeTools(): ToolSpec[] {
  const common = buildContractTradeTools({
    prefix: "swap",
    module: "swap",
    label: "SWAP/FUTURES",
    instTypes: ["SWAP", "FUTURES"],
    instIdExample: "e.g. BTC-USDT-SWAP",
  });

  return [
    ...common,

    // ── swap_amend_algo_order ─────────────────────────────────────────────────
    // Unique to swap: amend a pending TP/SL algo order attached to a position.
    {
      name: "swap_amend_algo_order",
      module: "swap",
      description:
        "Amend a pending SWAP/FUTURES algo order (modify TP/SL prices or size). Also covers TP/SL orders attached when placing the main order — look up algoId via swap_get_algo_orders first.",
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

    // ── swap_batch_orders ─────────────────────────────────────────────────────
    // Unique to swap: 3-in-1 batch tool (place / cancel / amend via action param).
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
            items: { type: "object" },
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
  ];
}
