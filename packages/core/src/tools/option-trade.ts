import type { ToolSpec } from "./types.js";
import {
  asRecord,
  buildAttachAlgoOrds,
  compactObject,
  normalizeResponse,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";
import { resolveQuoteCcySz } from "./tgtccy-conversion.js";

export function registerOptionTools(): ToolSpec[] {
  return [
    {
      name: "option_place_order",
      module: "option",
      description:
        "Place OPTION order. instId: {uly}-{expiry}-{strike}-C/P, e.g. BTC-USD-241227-50000-C. Before placing, use market_get_instruments to get ctVal (contract face value) — do NOT assume contract sizes. [CAUTION] Executes real trades.",
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
          },
          ordType: {
            type: "string",
            enum: ["market", "limit", "post_only", "fok", "ioc"],
            description: "market=no px; limit/fok/ioc=px req; post_only=maker",
          },
          sz: {
            type: "string",
            description: "Contracts count by default. Set tgtCcy=quote_ccy to specify USDT notional value; set tgtCcy=margin to specify USDT margin cost (notional = sz * leverage).",
          },
          tgtCcy: {
            type: "string",
            enum: ["base_ccy", "quote_ccy", "margin"],
            description: "Size unit. base_ccy(default): sz in contracts; quote_ccy: sz in USDT notional value; margin: sz in USDT margin cost (actual position = sz * leverage)",
          },
          px: {
            type: "string",
            description: "Required for limit/post_only/fok/ioc",
          },
          reduceOnly: {
            type: "boolean",
            description: "Reduce/close only",
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
        const resolved = await resolveQuoteCcySz(
          requireString(args, "instId"),
          requireString(args, "sz"),
          readString(args, "tgtCcy"),
          "OPTION",
          context.client,
          readString(args, "tdMode"),
        );
        const response = await context.client.privatePost(
          "/api/v5/trade/order",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            side: requireString(args, "side"),
            ordType: requireString(args, "ordType"),
            sz: resolved.sz,
            tgtCcy: resolved.tgtCcy,
            px: readString(args, "px"),
            reduceOnly: typeof reduceOnly === "boolean" ? String(reduceOnly) : undefined,
            clOrdId: readString(args, "clOrdId"),
            tag: context.config.sourceTag,
            attachAlgoOrds,
          }),
          privateRateLimit("option_place_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_cancel_order",
      module: "option",
      description:
        "Cancel an unfilled OPTION order. Provide ordId or clOrdId.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USD-241227-50000-C" },
          ordId: { type: "string" },
          clOrdId: { type: "string" },
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
          privateRateLimit("option_cancel_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_batch_cancel",
      module: "option",
      description:
        "[CAUTION] Batch cancel up to 20 OPTION orders.",
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
          privateRateLimit("option_batch_cancel", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_amend_order",
      module: "option",
      description:
        "Amend an unfilled OPTION order (price and/or size). Provide ordId or clOrdId.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USD-241227-50000-C" },
          ordId: { type: "string" },
          clOrdId: { type: "string" },
          newSz: { type: "string", description: "New contracts count" },
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
          privateRateLimit("option_amend_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_get_order",
      module: "option",
      description:
        "Get details of a single OPTION order by ordId or clOrdId.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USD-241227-50000-C" },
          ordId: { type: "string", description: "Provide ordId or clOrdId" },
          clOrdId: { type: "string" },
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
          privateRateLimit("option_get_order", 60),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_get_orders",
      module: "option",
      description:
        "List OPTION orders. status: live=pending (default), history=7d, archive=3mo.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["live", "history", "archive"],
            description: "live=pending (default), history=7d, archive=3mo",
          },
          uly: { type: "string", description: "Underlying filter, e.g. BTC-USD" },
          instId: { type: "string", description: "Instrument filter" },
          ordType: { type: "string", description: "Order type filter" },
          state: { type: "string", description: "canceled|filled" },
          after: { type: "string", description: "Cursor: return older" },
          before: { type: "string", description: "Cursor: return newer" },
          begin: { type: "string", description: "Start time (ms)" },
          end: { type: "string", description: "End time (ms)" },
          limit: { type: "number", description: "Max results (default 100)" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const status = readString(args, "status") ?? "live";
        let path: string;
        if (status === "archive") {
          path = "/api/v5/trade/orders-history-archive";
        } else if (status === "history") {
          path = "/api/v5/trade/orders-history";
        } else {
          path = "/api/v5/trade/orders-pending";
        }
        const response = await context.client.privateGet(
          path,
          compactObject({
            instType: "OPTION",
            uly: readString(args, "uly"),
            instId: readString(args, "instId"),
            ordType: readString(args, "ordType"),
            state: readString(args, "state"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            begin: readString(args, "begin"),
            end: readString(args, "end"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("option_get_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_get_positions",
      module: "option",
      description:
        "Get current OPTION positions including Greeks (delta, gamma, theta, vega).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "Filter by specific contract" },
          uly: { type: "string", description: "Filter by underlying, e.g. BTC-USD" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/positions",
          compactObject({
            instType: "OPTION",
            instId: readString(args, "instId"),
            uly: readString(args, "uly"),
          }),
          privateRateLimit("option_get_positions", 10),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_get_fills",
      module: "option",
      description:
        "Get OPTION fill history. archive=false: last 3 days (default); archive=true: up to 3 months.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          archive: {
            type: "boolean",
            description: "true=up to 3 months; false=last 3 days (default)",
          },
          instId: { type: "string", description: "Instrument filter" },
          ordId: { type: "string", description: "Order ID filter" },
          after: { type: "string", description: "Cursor: return older" },
          before: { type: "string", description: "Cursor: return newer" },
          begin: { type: "string", description: "Start time (ms)" },
          end: { type: "string", description: "End time (ms)" },
          limit: { type: "number", description: "Max results" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const archive = readBoolean(args, "archive") ?? false;
        const path = archive ? "/api/v5/trade/fills-history" : "/api/v5/trade/fills";
        const response = await context.client.privateGet(
          path,
          compactObject({
            instType: "OPTION",
            instId: readString(args, "instId"),
            ordId: readString(args, "ordId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            begin: readString(args, "begin"),
            end: readString(args, "end"),
            limit: readNumber(args, "limit") ?? (archive ? 20 : undefined),
          }),
          privateRateLimit("option_get_fills", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_get_instruments",
      module: "option",
      description:
        "List available OPTION contracts for a given underlying (option chain). Use to find valid instIds before placing orders.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uly: {
            type: "string",
            description: "Underlying, e.g. BTC-USD or ETH-USD",
          },
          expTime: {
            type: "string",
            description: "Filter by expiry date, e.g. 241227",
          },
        },
        required: ["uly"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/public/instruments",
          compactObject({
            instType: "OPTION",
            uly: requireString(args, "uly"),
            expTime: readString(args, "expTime"),
          }),
          privateRateLimit("option_get_instruments", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "option_get_greeks",
      module: "option",
      description:
        "Get implied volatility and Greeks (delta, gamma, theta, vega) for OPTION contracts by underlying.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uly: {
            type: "string",
            description: "Underlying, e.g. BTC-USD or ETH-USD",
          },
          expTime: {
            type: "string",
            description: "Filter by expiry date, e.g. 241227",
          },
        },
        required: ["uly"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/public/opt-summary",
          compactObject({
            uly: requireString(args, "uly"),
            expTime: readString(args, "expTime"),
          }),
          privateRateLimit("option_get_greeks", 20),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
