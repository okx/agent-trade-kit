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

const FUTURES_INST_TYPES = ["FUTURES", "SWAP"] as const;

export function registerFuturesTools(): ToolSpec[] {
  return [
    {
      name: "futures_place_order",
      module: "futures",
      description:
        "Place a FUTURES delivery contract order (e.g. instId: BTC-USDT-240329). Optionally attach TP/SL via tpTriggerPx/slTriggerPx. [CAUTION] Executes real trades.",
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
            description: "one-way: buy=open long, sell=open short (use reduceOnly=true to close); hedge: combined with posSide",
          },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description: "net=one-way mode (default); long/short=hedge mode only",
          },
          ordType: {
            type: "string",
            enum: ["market", "limit", "post_only", "fok", "ioc"],
            description: "market(no px)|limit(px req)|post_only(maker)|fok(all-or-cancel)|ioc(partial fill)",
          },
          sz: {
            type: "string",
            description: "Number of contracts (NOT USDT amount). Use market_get_instruments to get ctVal for conversion.",
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
          privateRateLimit("futures_place_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "futures_cancel_order",
      module: "futures",
      description:
        "Cancel an unfilled FUTURES delivery order.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-240329",
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
          privateRateLimit("futures_cancel_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "futures_get_order",
      module: "futures",
      description:
        "Get details of a single FUTURES delivery order by ordId or clOrdId.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-240329",
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
          privateRateLimit("futures_get_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "futures_get_orders",
      module: "futures",
      description:
        "Query FUTURES open orders, history (last 7 days), or archive (up to 3 months).",
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
            enum: [...FUTURES_INST_TYPES],
            description: "FUTURES (default) or SWAP",
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-240329",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "futures_get_positions",
      module: "futures",
      description:
        "Get current FUTURES delivery contract positions.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: [...FUTURES_INST_TYPES],
            description: "FUTURES (default) or SWAP",
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-240329",
          },
          posId: {
            type: "string",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "futures_get_fills",
      module: "futures",
      description:
        "Get FUTURES fill details. archive=false: last 3 days; archive=true: up to 3 months.",
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
            enum: [...FUTURES_INST_TYPES],
            description: "FUTURES (default) or SWAP",
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
        return normalizeResponse(response);
      },
    },
  ];
}
