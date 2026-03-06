import type { ToolSpec } from "../types.js";
import { asRecord, compactObject, readString, requireString } from "../helpers.js";
import { privateRateLimit } from "../common.js";

const BASE = "/api/v5/tradingBot/dca";

function normalize(response: { endpoint: string; requestTime: string; data: unknown }): Record<string, unknown> {
  return { endpoint: response.endpoint, requestTime: response.requestTime, data: response.data };
}

export function registerDcaTools(): ToolSpec[] {
  return [
    {
      name: "dca_create",
      module: "bot",
      description:
        "Create a Spot DCA (Martingale) bot. Buys an initial order then adds safety orders as price drops. " +
        "direction must be 'long'. triggerType: '1'=start immediately, '2'=RSI signal trigger. " +
        "reserveFunds: 'true' reserves enough balance for all safety orders upfront; 'false' buys as price drops. " +
        "[CAUTION] Executes real trades. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId:       { type: "string", description: "e.g. BTC-USDT" },
          initOrdAmt:   { type: "string", description: "Initial order amount (USDT)" },
          safetyOrdAmt: { type: "string", description: "Safety order amount (USDT)" },
          maxSafetyOrds:{ type: "string", description: "Max number of safety orders (e.g. '3')" },
          pxSteps:      { type: "string", description: "Price drop % to trigger each safety order (e.g. '0.10' = 10%)" },
          pxStepsMult:  { type: "string", description: "Price step multiplier between safety orders (e.g. '1' = constant, '1.5' = increasing)" },
          volMult:      { type: "string", description: "Safety order size multiplier (e.g. '1' = constant, '2' = doubling)" },
          tpPct:        { type: "string", description: "Take-profit ratio (e.g. '0.05' = 5%)" },
          slPct:        { type: "string", description: "Stop-loss ratio (e.g. '0.10' = 10%)" },
          reserveFunds: { type: "string", enum: ["true", "false"], description: "Reserve full margin upfront (default: false)" },
          triggerType:  { type: "string", enum: ["1", "2"], description: "1=start immediately (default); 2=RSI signal" },
          direction:    { type: "string", enum: ["long"], description: "Must be 'long'" },
        },
        required: ["instId", "initOrdAmt", "safetyOrdAmt", "maxSafetyOrds", "pxSteps", "pxStepsMult", "volMult", "tpPct", "slPct"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/order-algo`,
          compactObject({
            instId:        requireString(args, "instId"),
            initOrdAmt:    requireString(args, "initOrdAmt"),
            safetyOrdAmt:  requireString(args, "safetyOrdAmt"),
            maxSafetyOrds: requireString(args, "maxSafetyOrds"),
            pxSteps:       requireString(args, "pxSteps"),
            pxStepsMult:   requireString(args, "pxStepsMult"),
            volMult:       requireString(args, "volMult"),
            tpPct:         requireString(args, "tpPct"),
            slPct:         requireString(args, "slPct"),
            reserveFunds:  readString(args, "reserveFunds") ?? "false",
            triggerType:   readString(args, "triggerType") ?? "1",
            direction:     readString(args, "direction") ?? "long",
          }),
          privateRateLimit("dca_create", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "dca_stop",
      module: "bot",
      description:
        "Stop a running spot DCA (Martingale) strategy. [CAUTION] Cancels all pending safety orders. " +
        "stopType: '1'=sell all holdings and stop; '2'=keep holdings and stop. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId:   { type: "string", description: "DCA strategy ID" },
          instId:   { type: "string", description: "Instrument ID, e.g. BTC-USDT" },
          stopType: { type: "string", enum: ["1", "2"], description: "1=sell holdings and stop; 2=keep holdings and stop" },
        },
        required: ["algoId", "instId", "stopType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/stop-order-algo`,
          [{ algoId: requireString(args, "algoId"), instId: requireString(args, "instId"), algoOrdType: "spot_dca", stopType: requireString(args, "stopType") }],
          privateRateLimit("dca_stop", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "dca_get_list",
      module: "bot",
      description: "Query list of active spot DCA strategies. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_rawArgs, context) => {
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-pending`,
          {},
          privateRateLimit("dca_get_list", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "dca_get_history",
      module: "bot",
      description: "Query historical (stopped/completed) spot DCA strategies. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_rawArgs, context) => {
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-history`,
          {},
          privateRateLimit("dca_get_history", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "dca_get_details",
      module: "bot",
      description: "Query details of a single spot DCA strategy by algo ID. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "DCA strategy ID" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/orders-algo-details`,
          { algoId: requireString(args, "algoId") },
          privateRateLimit("dca_get_details", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "dca_get_sub_orders",
      module: "bot",
      description:
        "Query sub-orders generated by a spot DCA strategy. " +
        "type='0' for pending (live) orders; type='1' for filled (executed) orders. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string", description: "DCA strategy ID" },
          type:   { type: "string", enum: ["filled", "live"], description: "filled=executed orders; live=pending orders" },
        },
        required: ["algoId", "type"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/sub-orders`,
          { algoId: requireString(args, "algoId"), type: requireString(args, "type") },
          privateRateLimit("dca_get_sub_orders", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "dca_get_ai_param",
      module: "bot",
      description:
        "Get AI-recommended parameters for a spot DCA strategy. " +
        "userRiskMode: 'conservative'|'moderate'|'aggressive'. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId:       { type: "string", description: "e.g. BTC-USDT" },
          userRiskMode: { type: "string", enum: ["conservative", "moderate", "aggressive"], description: "Risk level" },
        },
        required: ["instId", "userRiskMode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/ai-param`,
          { instId: requireString(args, "instId"), userRiskMode: requireString(args, "userRiskMode") },
          privateRateLimit("dca_get_ai_param", 20),
        );
        return normalize(response);
      },
    },
  ];
}
