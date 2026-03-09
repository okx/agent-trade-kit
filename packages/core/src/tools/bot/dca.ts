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

const BASE = "/api/v5/tradingBot/dca";

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

export function registerDcaTools(): ToolSpec[] {
  return [
    {
      name: "dca_create_order",
      module: "bot.dca",
      description:
        "Create a DCA bot order. " +
        "type='spot': Spot DCA (Martingale on spot, no leverage). Required: instId, initOrdAmt, safetyOrdAmt, maxSafetyOrds, pxSteps, pxStepsMult, volMult, tpPct, triggerType. " +
        "type='contract': Contract DCA (Martingale with leverage on futures/swaps). Required: instId, lever, side, initOrdAmt, safetyOrdAmt, maxSafetyOrds, pxSteps, pxStepsMult, volMult, tpPct. When slPct is set, slMode is required. " +
        "[CAUTION] Executes real trades. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["spot", "contract"],
            description: "spot=Spot DCA (Martingale, no leverage); contract=Contract DCA (Martingale with leverage)",
          },
          instId: { type: "string", description: "e.g. BTC-USDT (spot) or BTC-USDT-SWAP (contract)" },
          // Shared spot/contract params
          initOrdAmt: { type: "string", description: "Initial order amount (USDT)" },
          safetyOrdAmt: { type: "string", description: "Safety order amount (USDT)" },
          maxSafetyOrds: { type: "string", description: "Max number of safety orders, e.g. '3'" },
          pxSteps: { type: "string", description: "Price drop % per safety order, e.g. '0.03' = 3%" },
          pxStepsMult: { type: "string", description: "Price step multiplier, e.g. '1.2'" },
          volMult: { type: "string", description: "Safety order size multiplier, e.g. '1.5'" },
          tpPct: { type: "string", description: "Take-profit ratio, e.g. '0.03' = 3%" },
          slPct: { type: "string", description: "Stop-loss ratio, e.g. '0.05' = 5% (optional)" },
          slMode: { type: "string", enum: ["limit", "market"], description: "Stop-loss price type: limit or market. Required when slPct is set (contract DCA)" },
          reserveFunds: { type: "string", enum: ["true", "false"], description: "Reserve full assets upfront (default: false)" },
          // Spot-only params
          triggerType: { type: "string", enum: ["1", "2"], description: "[spot] Trigger type: 1=instant, 2=RSI signal" },
          direction: { type: "string", enum: ["long"], description: "[spot] Strategy direction, only 'long' supported" },
          // Contract-only params
          lever: { type: "string", description: "[contract] Leverage multiplier, e.g. '3'" },
          side: { type: "string", enum: ["buy", "sell"], description: "[contract] buy=long, sell=short" },
        },
        required: ["type", "instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const type = requireString(args, "type");
        const instId = requireString(args, "instId");

        if (type === "contract") {
          const response = await context.client.privatePost(
            `${BASE}/create`,
            compactObject({
              instId,
              algoOrdType: "contract_dca",
              lever: requireString(args, "lever"),
              side: requireString(args, "side"),
              direction: readString(args, "direction") ?? "long",
              initOrdAmt: requireString(args, "initOrdAmt"),
              safetyOrdAmt: requireString(args, "safetyOrdAmt"),
              maxSafetyOrds: requireString(args, "maxSafetyOrds"),
              pxSteps: requireString(args, "pxSteps"),
              pxStepsMult: requireString(args, "pxStepsMult"),
              volMult: requireString(args, "volMult"),
              tpPct: requireString(args, "tpPct"),
              slPct: readString(args, "slPct"),
              slMode: readString(args, "slMode"),
              reserveFunds: readString(args, "reserveFunds") ?? "false",
              triggerParams: [{ triggerAction: "start", triggerStrategy: "instant" }],
            }),
            privateRateLimit("dca_create_order", 20),
          );
          return normalizeWrite(response);
        }

        // spot DCA (Martingale on spot)
        const response = await context.client.privatePost(
          `${BASE}/order-algo`,
          compactObject({
            instId,
            direction: readString(args, "direction") ?? "long",
            triggerType: requireString(args, "triggerType"),
            initOrdAmt: requireString(args, "initOrdAmt"),
            reserveFunds: readString(args, "reserveFunds") ?? "false",
            safetyOrdAmt: requireString(args, "safetyOrdAmt"),
            maxSafetyOrds: requireString(args, "maxSafetyOrds"),
            pxSteps: requireString(args, "pxSteps"),
            pxStepsMult: requireString(args, "pxStepsMult"),
            volMult: requireString(args, "volMult"),
            tpPct: requireString(args, "tpPct"),
            slPct: readString(args, "slPct"),
            slMode: readString(args, "slMode"),
          }),
          privateRateLimit("dca_create_order", 20),
        );
        return normalizeWrite(response);
      },
    },
    {
      name: "dca_stop_order",
      module: "bot.dca",
      description:
        "Stop a running DCA bot. Set type='spot' or type='contract'. " +
        "[CAUTION] This will stop the bot. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["spot", "contract"],
            description: "spot or contract",
          },
          algoId: { type: "string" },
          instId: { type: "string", description: "Instrument ID, e.g. BTC-USDT (spot) or BTC-USDT-SWAP (contract)" },
          stopType: {
            type: "string",
            enum: ["1", "2"],
            description: "1=sell base currency and get quote (default); 2=keep base currency",
          },
        },
        required: ["type", "algoId", "instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const type = requireString(args, "type");
        const algoId = requireString(args, "algoId");
        const instId = requireString(args, "instId");
        const stopType = readString(args, "stopType") ?? "1";

        if (type === "contract") {
          const response = await context.client.privatePost(
            `${BASE}/stop`,
            { algoId, instId, algoOrdType: "contract_dca", stopType },
            privateRateLimit("dca_stop_order", 20),
          );
          return normalizeWrite(response);
        }

        // spot
        const response = await context.client.privatePost(
          `${BASE}/stop-order-algo`,
          [{ algoId, instId, algoOrdType: "spot_dca", stopType }],
          privateRateLimit("dca_stop_order", 20),
        );
        return normalizeWrite(response);
      },
    },
    {
      name: "dca_get_orders",
      module: "bot.dca",
      description:
        "Query DCA bot orders. Set type='spot' or type='contract'. " +
        "Use status='active' for running bots, status='history' for completed/stopped. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["spot", "contract"],
            description: "spot or contract",
          },
          status: {
            type: "string",
            enum: ["active", "history"],
            description: "active=running (default); history=stopped",
          },
          algoId: { type: "string" },
          after: { type: "string", description: "Pagination: before this algo ID" },
          before: { type: "string", description: "Pagination: after this algo ID" },
          limit: { type: "number", description: "Max results (default 100)" },
        },
        required: ["type"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const type = requireString(args, "type");
        const status = readString(args, "status") ?? "active";

        if (type === "contract") {
          const path = status === "history" ? `${BASE}/history-list` : `${BASE}/ongoing-list`;
          const response = await context.client.privateGet(
            path,
            compactObject({
              algoOrdType: "contract_dca",
              algoId: readString(args, "algoId"),
              after: readString(args, "after"),
              before: readString(args, "before"),
              limit: readNumber(args, "limit"),
            }),
            privateRateLimit("dca_get_orders", 20),
          );
          return normalize(response);
        }

        // spot
        const path =
          status === "history"
            ? `${BASE}/orders-algo-history`
            : `${BASE}/orders-algo-pending`;
        const response = await context.client.privateGet(
          path,
          compactObject({
            algoId: readString(args, "algoId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("dca_get_orders", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "dca_get_order_details",
      module: "bot.dca",
      description:
        "Query details of a single DCA bot by algo ID. Set type='spot' or type='contract'. " +
        "For contract, returns current position details. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["spot", "contract"],
            description: "spot or contract",
          },
          algoId: { type: "string" },
        },
        required: ["type", "algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const type = requireString(args, "type");
        const algoId = requireString(args, "algoId");

        if (type === "contract") {
          const response = await context.client.privateGet(
            `${BASE}/position-details`,
            { algoId, algoOrdType: "contract_dca" },
            privateRateLimit("dca_get_order_details", 20),
          );
          return normalize(response);
        }

        // spot
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-details`,
          { algoId },
          privateRateLimit("dca_get_order_details", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "dca_get_sub_orders",
      module: "bot.dca",
      description:
        "Query sub-orders or cycles of a DCA bot. Set type='spot' or type='contract'. " +
        "Spot: use subOrdType='filled' for filled orders, subOrdType='live' for pending orders (required for spot). " +
        "Contract: returns cycle list when cycleId is omitted; returns orders within a specific cycle when cycleId is provided. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["spot", "contract"],
            description: "spot or contract",
          },
          algoId: { type: "string" },
          subOrdType: {
            type: "string",
            enum: ["filled", "live"],
            description: "[spot] Sub-order type: filled=completed orders, live=pending orders (required for spot)",
          },
          cycleId: { type: "string", description: "[contract] Cycle ID; omit to list all cycles" },
          after: { type: "string", description: "Pagination: before this order ID" },
          before: { type: "string", description: "Pagination: after this order ID" },
          limit: { type: "number", description: "Max results (default 100)" },
        },
        required: ["type", "algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const type = requireString(args, "type");
        const algoId = requireString(args, "algoId");
        const cycleId = readString(args, "cycleId");

        if (type === "contract") {
          if (cycleId) {
            // orders within a specific cycle
            const response = await context.client.privateGet(
              `${BASE}/orders`,
              compactObject({
                algoId,
                algoOrdType: "contract_dca",
                cycleId,
                after: readString(args, "after"),
                before: readString(args, "before"),
                limit: readNumber(args, "limit"),
              }),
              privateRateLimit("dca_get_sub_orders", 20),
            );
            return normalize(response);
          }
          // cycle list
          const response = await context.client.privateGet(
            `${BASE}/cycle-list`,
            compactObject({
              algoId,
              algoOrdType: "contract_dca",
              after: readString(args, "after"),
              before: readString(args, "before"),
              limit: readNumber(args, "limit"),
            }),
            privateRateLimit("dca_get_sub_orders", 20),
          );
          return normalize(response);
        }

        // spot: type param is required by backend ("filled" or "live")
        const subOrdType = readString(args, "subOrdType") ?? "filled";
        const response = await context.client.privateGet(
          `${BASE}/sub-orders`,
          compactObject({
            algoId,
            type: subOrdType,
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("dca_get_sub_orders", 20),
        );
        return normalize(response);
      },
    },
  ];
}
