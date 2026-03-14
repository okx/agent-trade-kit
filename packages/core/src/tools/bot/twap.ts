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

export function registerTwapTools(): ToolSpec[] {
  return [
    {
      name: "twap_place_order",
      module: "bot.twap",
      description:
        "Place a TWAP (Time-Weighted Average Price) algo order to split a large order into smaller slices over time. " +
        "Required: instId, tdMode, side, sz, szLimit, pxLimit, timeInterval. " +
        "Must provide either pxVar or pxSpread (mutually exclusive). " +
        "Optional: posSide, algoClOrdId, ccy, tradeQuoteCcy (spot only), reduceOnly, isTradeBorrowMode. " +
        "[CAUTION] Executes real trades. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "Instrument ID, e.g. BTC-USDT-SWAP" },
          tdMode: { type: "string", enum: ["cross", "isolated", "cash"], description: "Trade mode" },
          side: { type: "string", enum: ["buy", "sell"], description: "Order side" },
          sz: { type: "string", description: "Total quantity to execute" },
          szLimit: { type: "string", description: "Size limit per slice order" },
          pxLimit: { type: "string", description: "Price limit — worst acceptable price" },
          timeInterval: { type: "string", description: "Time interval between slices in seconds, e.g. '10'" },
          posSide: { type: "string", enum: ["long", "short", "net"], description: "Position side (for hedge mode)" },
          pxVar: { type: "string", description: "Price variance (basis points). Must provide either pxVar or pxSpread." },
          pxSpread: { type: "string", description: "Price spread (absolute). Must provide either pxVar or pxSpread." },
          algoClOrdId: { type: "string", description: "Client-assigned algo order ID" },
          ccy: { type: "string", description: "Margin currency, e.g. USDT" },
          tradeQuoteCcy: { type: "string", description: "Quote currency for spot trading. Only for spot instruments. Defaults to instId quote ccy." },
          reduceOnly: { type: "boolean", description: "Whether to reduce only (true/false). Default: false." },
          isTradeBorrowMode: { type: "boolean", description: "Whether to enable auto-borrow mode (true/false). Applicable to TWAP strategies." },
        },
        required: ["instId", "tdMode", "side", "sz", "szLimit", "pxLimit", "timeInterval"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/order-algo",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            side: requireString(args, "side"),
            ordType: "twap",
            sz: requireString(args, "sz"),
            szLimit: requireString(args, "szLimit"),
            pxLimit: requireString(args, "pxLimit"),
            timeInterval: requireString(args, "timeInterval"),
            posSide: readString(args, "posSide"),
            pxVar: readString(args, "pxVar"),
            pxSpread: readString(args, "pxSpread"),
            tag: context.config.sourceTag,
            algoClOrdId: readString(args, "algoClOrdId"),
            ccy: readString(args, "ccy"),
            tradeQuoteCcy: readString(args, "tradeQuoteCcy"),
            reduceOnly: (() => { const v = readBoolean(args, "reduceOnly"); return v !== undefined ? String(v) : undefined; })(),
            isTradeBorrowMode: (() => { const v = readBoolean(args, "isTradeBorrowMode"); return v !== undefined ? String(v) : undefined; })(),
          }),
          privateRateLimit("twap_place_order", 20),
        );
        return normalizeWrite(response);
      },
    },
    {
      name: "twap_cancel_order",
      module: "bot.twap",
      description:
        "Cancel a running TWAP algo order. " +
        "[CAUTION] This will stop the TWAP execution. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "Instrument ID, e.g. BTC-USDT-SWAP" },
          algoId: { type: "string", description: "Algo order ID. Must pass algoId or algoClOrdId (algoId takes priority)." },
          algoClOrdId: { type: "string", description: "Client-assigned algo order ID. Must pass algoId or algoClOrdId." },
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/trade/cancel-algos",
          [compactObject({
            algoId: readString(args, "algoId"),
            algoClOrdId: readString(args, "algoClOrdId"),
            instId: requireString(args, "instId"),
          })],
          privateRateLimit("twap_cancel_order", 20),
        );
        return normalizeWrite(response);
      },
    },
    {
      name: "twap_get_orders",
      module: "bot.twap",
      description:
        "Query TWAP algo orders. " +
        "Use status='active' for running orders, status='history' for completed/stopped. " +
        "For history: state and algoId are mutually exclusive — pass one or the other (defaults to state='effective' if neither given). " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "history"],
            description: "active=running (default); history=stopped/completed",
          },
          instType: { type: "string", enum: ["SPOT", "SWAP", "FUTURES", "MARGIN"], description: "Filter by instrument type (optional)" },
          instId: { type: "string", description: "Filter by instrument (optional)" },
          algoId: { type: "string", description: "Filter by algo order ID (optional)" },
          after: { type: "string", description: "Pagination: before this algo ID" },
          before: { type: "string", description: "Pagination: after this algo ID" },
          limit: { type: "number", description: "Max results (default 100)" },
          state: {
            type: "string",
            enum: ["effective", "canceled", "order_failed"],
            description: "State filter for history queries (default: effective)",
          },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const status = readString(args, "status") ?? "active";

        const path = status === "history"
          ? "/api/v5/trade/orders-algo-history"
          : "/api/v5/trade/orders-algo-pending";

        const response = await context.client.privateGet(
          path,
          compactObject({
            ordType: "twap",
            instType: readString(args, "instType"),
            instId: readString(args, "instId"),
            algoId: readString(args, "algoId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
            ...(status === "history" && !readString(args, "algoId")
              ? { state: readString(args, "state") ?? "effective" }
              : {}),
          }),
          privateRateLimit("twap_get_orders", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "twap_get_order_details",
      module: "bot.twap",
      description:
        "Query details of a single TWAP algo order by algo ID. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Algo order ID. Must pass algoId or algoClOrdId (algoId takes priority)." },
          algoClOrdId: { type: "string", description: "Client-assigned algo order ID. Must pass algoId or algoClOrdId." },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/trade/order-algo",
          compactObject({
            algoId: readString(args, "algoId"),
            algoClOrdId: readString(args, "algoClOrdId"),
          }),
          privateRateLimit("twap_get_order_details", 20),
        );
        return normalize(response);
      },
    },
  ];
}
