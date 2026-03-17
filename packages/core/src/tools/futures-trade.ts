import type { ToolSpec } from "./types.js";
import {
  asRecord,
  buildAttachAlgoOrds,
  compactObject,
  normalizeResponse,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";
import { buildContractTradeTools } from "./contract-trade.js";

export function registerFuturesTools(): ToolSpec[] {
  const common = buildContractTradeTools({
    prefix: "futures",
    module: "futures",
    label: "FUTURES delivery",
    instTypes: ["FUTURES", "SWAP"],
    instIdExample: "e.g. BTC-USDT-240329",
  });

  return [
    ...common,

    // ── futures_amend_order ───────────────────────────────────────────────────
    // Unique to futures: amend a regular (non-algo) unfilled order.
    {
      name: "futures_amend_order",
      module: "futures",
      description:
        "Amend an unfilled FUTURES delivery order (modify price and/or size).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USDT-240329" },
          ordId: { type: "string", description: "Provide ordId or clOrdId" },
          clOrdId: { type: "string" },
          newSz: { type: "string", description: "New number of contracts" },
          newPx: { type: "string", description: "New price" },
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
          }),
          privateRateLimit("futures_amend_order", 60),
        );
        return normalizeResponse(response);
      },
    },

    // ── futures_batch_orders ──────────────────────────────────────────────────
    // Unique to futures: batch place only (no cancel/amend action dispatch).
    {
      name: "futures_batch_orders",
      module: "futures",
      description:
        "[CAUTION] Batch place up to 20 FUTURES delivery orders.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            description:
              "Array (max 20): {instId,tdMode,side,ordType,sz,px?,posSide?,reduceOnly?,clOrdId?,tpTriggerPx?,tpOrdPx?,slTriggerPx?,slOrdPx?}",
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
        const body = orders.map((order: unknown) => {
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
            reduceOnly: typeof reduceOnly === "boolean" ? String(reduceOnly) : undefined,
            clOrdId: readString(o, "clOrdId"),
            tag: context.config.sourceTag,
            attachAlgoOrds,
          });
        });
        const response = await context.client.privatePost(
          "/api/v5/trade/batch-orders",
          body,
          privateRateLimit("futures_batch_orders", 60),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
