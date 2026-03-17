/**
 * Shared factory for SWAP and FUTURES contract trade tools.
 * Both modules share 11 identical tool shapes; only names, descriptions,
 * default instType, and instId examples differ.
 */
import type { ToolSpec } from "./types.js";
import type { ModuleId } from "../constants.js";
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

export interface ContractConfig {
  /** Tool name prefix, e.g. "swap" → "swap_place_order" */
  prefix: string;
  /** MCP module name */
  module: ModuleId;
  /** Human-readable label used in descriptions, e.g. "SWAP/FUTURES" or "FUTURES delivery" */
  label: string;
  /** [defaultType, otherType], e.g. ["SWAP", "FUTURES"] or ["FUTURES", "SWAP"] */
  instTypes: readonly [string, string];
  /** instId example string shown in property descriptions */
  instIdExample: string;
}

/** Build the 11 common contract trade tools shared by swap and futures modules. */
export function buildContractTradeTools(cfg: ContractConfig): ToolSpec[] {
  const { prefix, module, label, instTypes, instIdExample } = cfg;
  const [defaultType, otherType] = instTypes;
  const instTypeDesc = `${defaultType} (default) or ${otherType}`;
  const n = (suffix: string) => `${prefix}_${suffix}`;

  return [
    // ── place_order ──────────────────────────────────────────────────────────
    {
      name: n("place_order"),
      module,
      description: `Place ${label} order. Attach TP/SL via tpTriggerPx/slTriggerPx. [CAUTION] Executes real trades.`,
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: instIdExample },
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
          px: { type: "string", description: "Required for limit/post_only/fok/ioc" },
          reduceOnly: {
            type: "boolean",
            description: "Close/reduce only, no new position (one-way mode)",
          },
          clOrdId: { type: "string", description: "Client order ID (max 32 chars)" },
          tpTriggerPx: { type: "string", description: "TP trigger price" },
          tpOrdPx: { type: "string", description: "TP order price; -1=market" },
          slTriggerPx: { type: "string", description: "SL trigger price" },
          slOrdPx: { type: "string", description: "SL order price; -1=market" },
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
          privateRateLimit(n("place_order"), 60),
        );
        return normalizeResponse(response);
      },
    },

    // ── cancel_order ─────────────────────────────────────────────────────────
    {
      name: n("cancel_order"),
      module,
      description: `Cancel an unfilled ${label} order.`,
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: instIdExample },
          ordId: { type: "string" },
          clOrdId: { type: "string", description: "Client order ID" },
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
          privateRateLimit(n("cancel_order"), 60),
        );
        return normalizeResponse(response);
      },
    },

    // ── get_order ─────────────────────────────────────────────────────────────
    {
      name: n("get_order"),
      module,
      description: `Get details of a single ${label} order by ordId or clOrdId.`,
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: instIdExample },
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
          privateRateLimit(n("get_order"), 60),
        );
        return normalizeResponse(response);
      },
    },

    // ── get_orders ───────────────────────────────────────────────────────────
    {
      name: n("get_orders"),
      module,
      description: `Query ${label} open orders, history (last 7 days), or archive (up to 3 months).`,
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
            enum: [...instTypes],
            description: instTypeDesc,
          },
          instId: { type: "string", description: instIdExample },
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
        const status = readString(args, "status") ?? "open";
        const instType = readString(args, "instType") ?? defaultType;
        assertEnum(instType, "instType", instTypes);
        let path = "/api/v5/trade/orders-pending";
        if (status === "archive") {
          path = "/api/v5/trade/orders-history-archive";
        } else if (status === "history") {
          path = "/api/v5/trade/orders-history";
        }
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
          privateRateLimit(n("get_orders"), 20),
        );
        return normalizeResponse(response);
      },
    },

    // ── get_positions ────────────────────────────────────────────────────────
    {
      name: n("get_positions"),
      module,
      description: `Get current ${label} positions.`,
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: [...instTypes],
            description: instTypeDesc,
          },
          instId: { type: "string", description: instIdExample },
          posId: { type: "string" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instType = readString(args, "instType") ?? defaultType;
        assertEnum(instType, "instType", instTypes);
        const response = await context.client.privateGet(
          "/api/v5/account/positions",
          compactObject({
            instType,
            instId: readString(args, "instId"),
            posId: readString(args, "posId"),
          }),
          privateRateLimit(n("get_positions"), 10),
        );
        return normalizeResponse(response);
      },
    },

    // ── get_fills ────────────────────────────────────────────────────────────
    {
      name: n("get_fills"),
      module,
      description: `Get ${label} fill details. archive=false (default): last 3 days; archive=true: up to 3 months.`,
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
            enum: [...instTypes],
            description: instTypeDesc,
          },
          instId: { type: "string", description: "Instrument ID filter" },
          ordId: { type: "string", description: "Order ID filter" },
          after: { type: "string", description: "Cursor: return older" },
          before: { type: "string", description: "Cursor: return newer" },
          begin: { type: "string", description: "Start time (ms)" },
          end: { type: "string", description: "End time (ms)" },
          limit: { type: "number", description: "Max results (default 100 or 20 for archive)" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const archive = readBoolean(args, "archive") ?? false;
        const instType = readString(args, "instType") ?? defaultType;
        assertEnum(instType, "instType", instTypes);
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
          privateRateLimit(n("get_fills"), 20),
        );
        return normalizeResponse(response);
      },
    },

    // ── close_position ───────────────────────────────────────────────────────
    {
      name: n("close_position"),
      module,
      description: `[CAUTION] Close entire ${label} position at market.`,
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: instIdExample },
          mgnMode: { type: "string", enum: ["cross", "isolated"] },
          posSide: {
            type: "string",
            enum: ["long", "short", "net"],
            description: "long/short=hedge mode; omit for one-way (net)",
          },
          autoCxl: {
            type: "boolean",
            description: "Cancel pending orders for this instrument on close",
          },
          clOrdId: { type: "string", description: "Client order ID for close order" },
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
          privateRateLimit(n("close_position"), 20),
        );
        return normalizeResponse(response);
      },
    },

    // ── set_leverage ─────────────────────────────────────────────────────────
    {
      name: n("set_leverage"),
      module,
      description: `Set leverage for a ${label} instrument or position. [CAUTION] Changes risk parameters.`,
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: instIdExample },
          lever: { type: "string", description: "Leverage, e.g. '10'" },
          mgnMode: { type: "string", enum: ["cross", "isolated"] },
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
          privateRateLimit(n("set_leverage"), 20),
        );
        return normalizeResponse(response);
      },
    },

    // ── get_leverage ─────────────────────────────────────────────────────────
    {
      name: n("get_leverage"),
      module,
      description: `Get current leverage for a ${label} instrument.`,
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: instIdExample },
          mgnMode: { type: "string", enum: ["cross", "isolated"] },
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
          privateRateLimit(n("get_leverage"), 20),
        );
        return normalizeResponse(response);
      },
    },

    // ── batch_amend ──────────────────────────────────────────────────────────
    {
      name: n("batch_amend"),
      module,
      description: `[CAUTION] Batch amend up to 20 unfilled ${label} orders.`,
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
          privateRateLimit(n("batch_amend"), 60),
        );
        return normalizeResponse(response);
      },
    },

    // ── batch_cancel ─────────────────────────────────────────────────────────
    {
      name: n("batch_cancel"),
      module,
      description: `[CAUTION] Batch cancel up to 20 ${label} orders.`,
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
          privateRateLimit(n("batch_cancel"), 60),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
