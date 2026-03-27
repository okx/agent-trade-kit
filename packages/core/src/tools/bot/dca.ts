import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "../helpers.js";
import { privateRateLimit } from "../common.js";
import { OkxApiError } from "../../utils/errors.js";

const BASE = "/api/v5/tradingBot/dca";

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
        "Create a DCA (Martingale) bot. [CAUTION] Real trades. " +
        "contract_dca requires lever; spot_dca must be long. " +
        "If maxSafetyOrds>0: need safetyOrdAmt, pxSteps.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "BTC-USDT (spot) or BTC-USDT-SWAP (contract)" },
          algoOrdType: { type: "string", enum: ["spot_dca", "contract_dca"] },
          lever: { type: "string", description: "Required for contract_dca" },
          direction: { type: "string", enum: ["long", "short"] },
          initOrdAmt: { type: "string", description: "Initial amount in quote ccy" },
          maxSafetyOrds: { type: "string", description: "0=no DCA, max 100" },
          tpPct: { type: "string", description: "Take-profit ratio, 0.03=3%" },
          safetyOrdAmt: { type: "string", description: "Safety order amount. Need if maxSafetyOrds>0" },
          pxSteps: { type: "string", description: "Price drop per safety order. Need if maxSafetyOrds>0" },
          pxStepsMult: { type: "string", description: "Step multiplier. Required when maxSafetyOrds>0, e.g. '1'" },
          volMult: { type: "string", description: "Size multiplier. Required when maxSafetyOrds>0, e.g. '1'" },
          slPct: { type: "string", description: "Stop-loss ratio, 0.05=5%" },
          slMode: { type: "string", enum: ["limit", "market"] },
          allowReinvest: { type: "boolean", description: "Default true" },
          triggerStrategy: { type: "string", enum: ["instant", "price", "rsi"], description: "contract_dca: instant|price|rsi; spot_dca: instant|rsi. Default: instant" },
          triggerPx: { type: "string", description: "Need if triggerStrategy=price (contract_dca only)" },
          triggerCond: { type: "string", enum: ["cross_up", "cross_down"], description: "Required when triggerStrategy=rsi. Optional when triggerStrategy=price" },
          thold: { type: "string", description: "RSI threshold (e.g. '30'). Need if triggerStrategy=rsi" },
          timeframe: { type: "string", description: "RSI timeframe (e.g. '15m'). Need if triggerStrategy=rsi" },
          timePeriod: { type: "string", description: "RSI period. Default '14'. Optional when triggerStrategy=rsi" },
          algoClOrdId: { type: "string", description: "Client order ID, 1-32 chars" },
          // Backend expects boolean, but kept as string for backward compatibility with older clients.
          reserveFunds: { type: "string", description: "'true' or 'false', default 'true'" },
          tradeQuoteCcy: { type: "string" },
        },
        required: ["instId", "algoOrdType", "direction", "initOrdAmt", "maxSafetyOrds", "tpPct"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = requireString(args, "instId");
        const algoOrdType = requireString(args, "algoOrdType");

        // Validate lever: required for contract_dca
        if (algoOrdType === "contract_dca" && !readString(args, "lever")) {
          throw new OkxApiError("lever is required for contract_dca", {
            code: "VALIDATION",
            endpoint: `${BASE}/create`,
          });
        }

        // Build triggerParams: default to instant; support price/rsi strategy
        const triggerStrategy = readString(args, "triggerStrategy") ?? "instant";

        // Validate: price trigger is only supported for contract_dca
        if (triggerStrategy === "price" && algoOrdType === "spot_dca") {
          throw new OkxApiError("triggerStrategy 'price' is only supported for contract_dca. spot_dca supports: instant, rsi", {
            code: "VALIDATION",
            endpoint: `${BASE}/create`,
          });
        }

        const triggerParam: Record<string, string> = {
          triggerAction: "start",
          triggerStrategy,
        };
        if (triggerStrategy === "price") {
          triggerParam["triggerPx"] = requireString(args, "triggerPx");
          const triggerCond = readString(args, "triggerCond");
          if (triggerCond) {
            triggerParam["triggerCond"] = triggerCond;
          }
        } else if (triggerStrategy === "rsi") {
          triggerParam["triggerCond"] = requireString(args, "triggerCond");
          triggerParam["thold"] = requireString(args, "thold");
          triggerParam["timeframe"] = requireString(args, "timeframe");
          const timePeriod = readString(args, "timePeriod");
          triggerParam["timePeriod"] = timePeriod ?? "14";
        }

        // Validate conditional required params when maxSafetyOrds > 0
        const maxSafetyOrds = requireString(args, "maxSafetyOrds");
        if (Number(maxSafetyOrds) > 0) {
          if (!readString(args, "safetyOrdAmt")) {
            throw new OkxApiError("safetyOrdAmt is required when maxSafetyOrds > 0", {
              code: "VALIDATION",
              endpoint: `${BASE}/create`,
            });
          }
          if (!readString(args, "pxSteps")) {
            throw new OkxApiError("pxSteps is required when maxSafetyOrds > 0", {
              code: "VALIDATION",
              endpoint: `${BASE}/create`,
            });
          }
          if (!readString(args, "pxStepsMult")) {
            throw new OkxApiError("pxStepsMult is required when maxSafetyOrds > 0", {
              code: "VALIDATION",
              endpoint: `${BASE}/create`,
            });
          }
          if (!readString(args, "volMult")) {
            throw new OkxApiError("volMult is required when maxSafetyOrds > 0", {
              code: "VALIDATION",
              endpoint: `${BASE}/create`,
            });
          }
        }

        const response = await context.client.privatePost(
          `${BASE}/create`,
          compactObject({
            instId,
            algoOrdType,
            lever: readString(args, "lever"),
            direction: requireString(args, "direction"),
            initOrdAmt: requireString(args, "initOrdAmt"),
            safetyOrdAmt: readString(args, "safetyOrdAmt"),
            maxSafetyOrds,
            pxSteps: readString(args, "pxSteps"),
            pxStepsMult: readString(args, "pxStepsMult"),
            volMult: readString(args, "volMult"),
            tpPct: requireString(args, "tpPct"),
            slPct: readString(args, "slPct"),
            slMode: readString(args, "slMode"),
            allowReinvest: args["allowReinvest"] !== undefined
              ? (args["allowReinvest"] === true || args["allowReinvest"] === "true")
              : undefined,
            triggerParams: [triggerParam],
            tag: context.config.sourceTag,
            algoClOrdId: readString(args, "algoClOrdId"),
            reserveFunds: readString(args, "reserveFunds"),
            tradeQuoteCcy: readString(args, "tradeQuoteCcy"),
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
        "Stop a running DCA bot. [CAUTION] spot_dca needs stopType: 1=sell, 2=keep.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Algo order ID" },
          algoOrdType: { type: "string", enum: ["spot_dca", "contract_dca"] },
          stopType: { type: "string", enum: ["1", "2"], description: "Required for spot_dca: 1=sell all, 2=keep tokens" },
        },
        required: ["algoId", "algoOrdType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const algoOrdType = requireString(args, "algoOrdType");
        const stopType = readString(args, "stopType");

        // Validate stopType: required for spot_dca
        if (algoOrdType === "spot_dca" && !stopType) {
          throw new OkxApiError(
            "stopType is required for spot_dca. Use '1' (sell all tokens) or '2' (keep tokens)",
            { code: "VALIDATION", endpoint: `${BASE}/stop` },
          );
        }

        const response = await context.client.privatePost(
          `${BASE}/stop`,
          compactObject({ algoId, algoOrdType, stopType }),
          privateRateLimit("dca_stop_order", 20),
        );
        return normalizeWrite(response);
      },
    },
    {
      name: "dca_get_orders",
      module: "bot.dca",
      description: "List DCA bots. Default: active (running). Use status=history for stopped.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "history"] },
          algoOrdType: { type: "string", enum: ["spot_dca", "contract_dca"], description: "Default: contract_dca" },
          algoId: { type: "string", description: "Algo order ID" },
          instId: { type: "string" },
          after: { type: "string", description: "Pagination cursor" },
          before: { type: "string", description: "Pagination cursor" },
          limit: { type: "number" },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const status = readString(args, "status") ?? "active";
        const path = status === "history" ? `${BASE}/history-list` : `${BASE}/ongoing-list`;
        // Default to contract_dca for backward compatibility
        const algoOrdType = readString(args, "algoOrdType") ?? "contract_dca";

        const response = await context.client.privateGet(
          path,
          compactObject({
            algoOrdType,
            algoId: readString(args, "algoId"),
            instId: readString(args, "instId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("dca_get_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "dca_get_order_details",
      module: "bot.dca",
      description: "Get DCA bot position details (avgPx, upl, liqPx, etc).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Algo order ID" },
          algoOrdType: { type: "string", enum: ["spot_dca", "contract_dca"] },
        },
        required: ["algoId", "algoOrdType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const algoOrdType = requireString(args, "algoOrdType");

        const response = await context.client.privateGet(
          `${BASE}/position-details`,
          { algoId, algoOrdType },
          privateRateLimit("dca_get_order_details", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "dca_get_sub_orders",
      module: "bot.dca",
      description: "Get DCA cycles or orders in a cycle. Omit cycleId=cycle list; with cycleId=orders.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "Algo order ID" },
          algoOrdType: { type: "string", enum: ["spot_dca", "contract_dca"] },
          cycleId: { type: "string", description: "Omit for cycles; provide for orders" },
          after: { type: "string", description: "Pagination cursor" },
          before: { type: "string", description: "Pagination cursor" },
          limit: { type: "number" },
        },
        required: ["algoId", "algoOrdType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const algoOrdType = requireString(args, "algoOrdType");
        const cycleId = readString(args, "cycleId");

        if (cycleId) {
          // orders within a specific cycle
          const response = await context.client.privateGet(
            `${BASE}/orders`,
            compactObject({
              algoId,
              algoOrdType,
              cycleId,
              limit: readNumber(args, "limit"),
            }),
            privateRateLimit("dca_get_sub_orders", 20),
          );
          return normalizeResponse(response);
        }
        // cycle list
        const response = await context.client.privateGet(
          `${BASE}/cycle-list`,
          compactObject({
            algoId,
            algoOrdType,
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("dca_get_sub_orders", 20),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
