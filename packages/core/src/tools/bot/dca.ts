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
        "Create Contract DCA (Martingale) bot. [CAUTION] Real trades. " +
        "When maxSafetyOrds > 0: also need safetyOrdAmt, pxSteps. When maxSafetyOrds > 1: also need pxStepsMult, volMult.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId: { type: "string", description: "e.g. BTC-USDT-SWAP" },
          lever: { type: "string", description: "Leverage, e.g. '3'" },
          direction: { type: "string", enum: ["long", "short"] },
          initOrdAmt: { type: "string", description: "Initial order amount (USDT)" },
          maxSafetyOrds: { type: "string", description: "Max safety orders, e.g. '3'" },
          tpPct: { type: "string", description: "Take-profit ratio, e.g. '0.03' = 3%" },
          safetyOrdAmt: { type: "string", description: "Safety order amount (USDT). Need when maxSafetyOrds > 0" },
          pxSteps: { type: "string", description: "Price drop % per safety order, e.g. '0.03'. Need when maxSafetyOrds > 0" },
          pxStepsMult: { type: "string", description: "Price step multiplier, e.g. '1.2'. Need when maxSafetyOrds > 1" },
          volMult: { type: "string", description: "Safety order size multiplier, e.g. '1.5'. Need when maxSafetyOrds > 1" },
          slPct: { type: "string", description: "Stop-loss ratio, e.g. '0.05' = 5%" },
          slMode: { type: "string", enum: ["limit", "market"], description: "Stop-loss type. Default: market" },
          allowReinvest: { type: "string", enum: ["true", "false"], description: "Reinvest profit. Default: 'true'" },
          triggerStrategy: { type: "string", enum: ["instant", "price", "rsi"], default: "instant", description: "How bot starts. Default: instant" },
          triggerPx: { type: "string", description: "Required when triggerStrategy='price'" },
          triggerCond: { type: "string", enum: ["cross_up", "cross_down"], description: "RSI trigger condition. Required when triggerStrategy='rsi'" },
          thold: { type: "string", description: "RSI threshold, e.g. '30'. Required when triggerStrategy='rsi'" },
          timePeriod: { type: "string", description: "RSI period. Default: '14'" },
          timeframe: { type: "string", enum: ["3m", "5m", "15m", "30m", "1H", "4H", "1D"], description: "RSI K-line timeframe. Required when triggerStrategy='rsi'" },
          trackingMode: { type: "string", enum: ["sync", "async"], description: "Copy-trading tracking mode" },
          profitSharingRatio: { type: "string", enum: ["0", "0.1", "0.2", "0.3"], description: "Copy-trading profit sharing ratio" },
        },
        required: ["instId", "lever", "direction", "initOrdAmt", "maxSafetyOrds", "tpPct"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = requireString(args, "instId");

        // Validate conditionally required params
        const maxSafetyOrds = Number(requireString(args, "maxSafetyOrds"));
        if (maxSafetyOrds > 0) {
          const missing: string[] = [];
          if (!readString(args, "safetyOrdAmt")) missing.push("safetyOrdAmt");
          if (!readString(args, "pxSteps")) missing.push("pxSteps");
          if (missing.length > 0) {
            throw new Error(
              `When maxSafetyOrds > 0, the following parameters are required: ${missing.join(", ")}`,
            );
          }
        }
        if (maxSafetyOrds > 1) {
          const missing: string[] = [];
          if (!readString(args, "pxStepsMult")) missing.push("pxStepsMult");
          if (!readString(args, "volMult")) missing.push("volMult");
          if (missing.length > 0) {
            throw new Error(
              `When maxSafetyOrds > 1, the following parameters are required: ${missing.join(", ")}`,
            );
          }
        }

        // Validate slPct + slMode dependency: must be both set or both omitted
        const slPct = readString(args, "slPct");
        const slMode = readString(args, "slMode");
        if (slPct && !slMode) {
          throw new Error(
            "slMode is required when slPct is set. Use 'market' (market price stop-loss) or 'limit' (limit price stop-loss).",
          );
        }
        if (slMode && !slPct) {
          throw new Error(
            "slPct is required when slMode is set. e.g. '0.05' = 5% stop-loss.",
          );
        }

        // Build triggerParams: default to instant; support price/rsi strategies
        const triggerStrategy = readString(args, "triggerStrategy") ?? "instant";
        const triggerParam: Record<string, string> = {
          triggerAction: "start",
          triggerStrategy,
        };
        if (triggerStrategy === "price") {
          triggerParam["triggerPx"] = requireString(args, "triggerPx");
        }
        if (triggerStrategy === "rsi") {
          const rsiMissing: string[] = [];
          const triggerCond = readString(args, "triggerCond");
          const thold = readString(args, "thold");
          const timeframe = readString(args, "timeframe");
          if (!triggerCond) rsiMissing.push("triggerCond");
          if (!thold) rsiMissing.push("thold");
          if (!timeframe) rsiMissing.push("timeframe");
          if (rsiMissing.length > 0) {
            throw new Error(
              `When triggerStrategy='rsi', the following parameters are required: ${rsiMissing.join(", ")}`,
            );
          }
          triggerParam["triggerCond"] = triggerCond!;
          triggerParam["thold"] = thold!;
          triggerParam["timePeriod"] = readString(args, "timePeriod") ?? "14";
          triggerParam["timeframe"] = timeframe!;
        }

        const triggerParams: Record<string, string>[] = [triggerParam];

        const response = await context.client.privatePost(
          `${BASE}/create`,
          compactObject({
            instId,
            algoOrdType: "contract_dca",
            lever: requireString(args, "lever"),
            direction: requireString(args, "direction"),
            initOrdAmt: requireString(args, "initOrdAmt"),
            safetyOrdAmt: readString(args, "safetyOrdAmt"),
            maxSafetyOrds: requireString(args, "maxSafetyOrds"),
            pxSteps: readString(args, "pxSteps"),
            pxStepsMult: readString(args, "pxStepsMult"),
            volMult: readString(args, "volMult"),
            tpPct: requireString(args, "tpPct"),
            slPct: readString(args, "slPct"),
            slMode: readString(args, "slMode"),
            allowReinvest: readString(args, "allowReinvest"),
            trackingMode: readString(args, "trackingMode"),
            profitSharingRatio: readString(args, "profitSharingRatio"),
            tag: context.config.sourceTag,
            triggerParams,
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
        "Stop a running Contract DCA bot. [CAUTION] This will stop the bot.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "DCA bot algo order ID (not a trade ordId)" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");

        const response = await context.client.privatePost(
          `${BASE}/stop`,
          { algoId, algoOrdType: "contract_dca" },
          privateRateLimit("dca_stop_order", 20),
        );
        return normalizeWrite(response);
      },
    },
    {
      name: "dca_get_orders",
      module: "bot.dca",
      description:
        "List DCA bots. status='active' for running; 'history' for stopped.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "history"],
            description: "active=running (default); history=stopped",
          },
          algoId: { type: "string", description: "DCA bot algo order ID (not a trade ordId)" },
          instId: { type: "string", description: "e.g. BTC-USDT-SWAP" },
          after: { type: "string", description: "Cursor for older records" },
          before: { type: "string", description: "Cursor for newer records" },
          limit: { type: "number", description: "Default 100" },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const status = readString(args, "status") ?? "active";

        const path = status === "history" ? `${BASE}/history-list` : `${BASE}/ongoing-list`;
        const response = await context.client.privateGet(
          path,
          compactObject({
            algoOrdType: "contract_dca",
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
      description: "Get DCA bot detail by algo ID. Returns current position details.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "DCA bot algo order ID (not a trade ordId)" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");

        const response = await context.client.privateGet(
          `${BASE}/position-details`,
          { algoId, algoOrdType: "contract_dca" },
          privateRateLimit("dca_get_order_details", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "dca_get_sub_orders",
      module: "bot.dca",
      description:
        "Query DCA bot cycles or orders within a cycle. Omit cycleId for cycle list; provide cycleId for orders.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "DCA bot algo order ID (not a trade ordId)" },
          cycleId: { type: "string", description: "Omit for cycle list; provide for orders within a cycle" },
          after: { type: "string", description: "Cursor for older records (cycle-list mode only)" },
          before: { type: "string", description: "Cursor for newer records (cycle-list mode only)" },
          limit: { type: "number", description: "Default 100" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoId = requireString(args, "algoId");
        const cycleId = readString(args, "cycleId");

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
          return normalizeResponse(response);
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
        return normalizeResponse(response);
      },
    },
  ];
}
