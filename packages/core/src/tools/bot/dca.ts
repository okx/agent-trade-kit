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
      name: "dca_create_order",
      module: "bot.dca",
      description:
        "Create a DCA (Martingale) bot — supports both Spot DCA ('spot_dca') and Contract DCA ('contract_dca'). " +
        "Spot DCA: buys an initial order then adds safety orders as price drops; direction must be 'long'. " +
        "Contract DCA: supports 'long' or 'short' via lever and side (buy=long, sell=short). " +
        "[CAUTION] Executes real trades. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType:   { type: "string", enum: ["spot_dca", "contract_dca"], description: "spot_dca=Spot DCA, contract_dca=Contract DCA" },
          instId:        { type: "string", description: "e.g. BTC-USDT (spot_dca) or BTC-USDT-SWAP (contract_dca)" },
          initOrdAmt:    { type: "string", description: "Initial order amount (USDT)" },
          safetyOrdAmt:  { type: "string", description: "Safety order amount (USDT)" },
          maxSafetyOrds: { type: "string", description: "Max number of safety orders (e.g. '3')" },
          pxSteps:       { type: "string", description: "Price drop % to trigger each safety order (e.g. '0.10' = 10%)" },
          pxStepsMult:   { type: "string", description: "Price step multiplier between safety orders (e.g. '1' = constant, '1.5' = increasing)" },
          volMult:       { type: "string", description: "Safety order size multiplier (e.g. '1' = constant, '2' = doubling)" },
          tpPct:         { type: "string", description: "Take-profit ratio (e.g. '0.05' = 5%)" },
          slPct:         { type: "string", description: "Stop-loss ratio (e.g. '0.10' = 10%). Spot DCA only." },
          reserveFunds:  { type: "string", enum: ["true", "false"], description: "Reserve full margin upfront (default: false)" },
          triggerType:   { type: "string", enum: ["1", "2"], description: "Spot DCA only. 1=start immediately (default); 2=RSI signal" },
          direction:     { type: "string", enum: ["long", "short"], description: "Bot direction. Spot DCA: must be 'long'. Contract DCA: 'long' or 'short' (default: long)" },
          lever:         { type: "string", description: "Leverage multiplier (e.g. '3'). Required for contract_dca." },
          side:          { type: "string", enum: ["buy", "sell"], description: "buy=long, sell=short. Required for contract_dca." },
        },
        required: ["algoOrdType", "instId", "initOrdAmt", "safetyOrdAmt", "maxSafetyOrds", "pxSteps", "pxStepsMult", "volMult", "tpPct"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoOrdType = requireString(args, "algoOrdType");
        if (algoOrdType === "contract_dca") {
          const response = await context.client.privatePost(
            `${BASE}/create`,
            compactObject({
              instId:        requireString(args, "instId"),
              algoOrdType:   "contract_dca",
              lever:         requireString(args, "lever"),
              side:          requireString(args, "side"),
              direction:     readString(args, "direction") ?? "long",
              initOrdAmt:    requireString(args, "initOrdAmt"),
              safetyOrdAmt:  requireString(args, "safetyOrdAmt"),
              maxSafetyOrds: requireString(args, "maxSafetyOrds"),
              pxSteps:       requireString(args, "pxSteps"),
              pxStepsMult:   requireString(args, "pxStepsMult"),
              volMult:       requireString(args, "volMult"),
              tpPct:         requireString(args, "tpPct"),
              reserveFunds:  readString(args, "reserveFunds") ?? "false",
              triggerParams: [{ triggerAction: "start", triggerStrategy: "instant" }],
            }),
            privateRateLimit("dca_create_order", 20),
          );
          return normalize(response);
        } else {
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
              slPct:         readString(args, "slPct"),
              reserveFunds:  readString(args, "reserveFunds") ?? "false",
              triggerType:   readString(args, "triggerType") ?? "1",
              direction:     readString(args, "direction") ?? "long",
            }),
            privateRateLimit("dca_create_order", 20),
          );
          return normalize(response);
        }
      },
    },
    {
      name: "dca_stop_order",
      module: "bot.dca",
      description:
        "Stop a running DCA strategy — supports both Spot DCA ('spot_dca') and Contract DCA ('contract_dca'). " +
        "[CAUTION] Cancels all pending safety orders. " +
        "Spot DCA stopType: '1'=sell all holdings and stop; '2'=keep holdings and stop. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: { type: "string", enum: ["spot_dca", "contract_dca"], description: "spot_dca=Spot DCA, contract_dca=Contract DCA" },
          algoId:      { type: "string", description: "DCA strategy ID" },
          instId:      { type: "string", description: "Instrument ID (required for spot_dca), e.g. BTC-USDT" },
          stopType:    { type: "string", enum: ["1", "2"], description: "Spot DCA only: 1=sell holdings and stop; 2=keep holdings and stop" },
        },
        required: ["algoOrdType", "algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoOrdType = requireString(args, "algoOrdType");
        if (algoOrdType === "contract_dca") {
          const response = await context.client.privatePost(
            `${BASE}/stop`,
            { algoId: requireString(args, "algoId"), algoOrdType: "contract_dca" },
            privateRateLimit("dca_stop_order", 20),
          );
          return normalize(response);
        } else {
          const response = await context.client.privatePost(
            `${BASE}/stop-order-algo`,
            [{
              algoId:      requireString(args, "algoId"),
              instId:      requireString(args, "instId"),
              algoOrdType: "spot_dca",
              stopType:    requireString(args, "stopType"),
            }],
            privateRateLimit("dca_stop_order", 20),
          );
          return normalize(response);
        }
      },
    },
    {
      name: "dca_get_orders",
      module: "bot.dca",
      description:
        "Query DCA strategy list — supports both Spot DCA ('spot_dca') and Contract DCA ('contract_dca'). " +
        "Use status='active' for running strategies, status='history' for completed/stopped. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: { type: "string", enum: ["spot_dca", "contract_dca"], description: "spot_dca=Spot DCA, contract_dca=Contract DCA" },
          status:      { type: "string", enum: ["active", "history"], description: "active=running (default); history=stopped" },
        },
        required: ["algoOrdType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoOrdType = requireString(args, "algoOrdType");
        const status = readString(args, "status") ?? "active";
        if (algoOrdType === "contract_dca") {
          const path = status === "history" ? `${BASE}/history-list` : `${BASE}/ongoing-list`;
          const response = await context.client.privateGet(
            path,
            { algoOrdType: "contract_dca" },
            privateRateLimit("dca_get_orders", 20),
          );
          return normalize(response);
        } else {
          const path = status === "history" ? `${BASE}/orders-algo-history` : `${BASE}/orders-algo-pending`;
          const response = await context.client.privateGet(
            path,
            {},
            privateRateLimit("dca_get_orders", 20),
          );
          return normalize(response);
        }
      },
    },
    {
      name: "dca_get_order_details",
      module: "bot.dca",
      description:
        "Query details of a single DCA strategy by algo ID — supports both Spot DCA ('spot_dca') and Contract DCA ('contract_dca'). " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: { type: "string", enum: ["spot_dca", "contract_dca"], description: "spot_dca=Spot DCA, contract_dca=Contract DCA" },
          algoId:      { type: "string", description: "DCA strategy ID" },
        },
        required: ["algoOrdType", "algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoOrdType = requireString(args, "algoOrdType");
        if (algoOrdType === "contract_dca") {
          const response = await context.client.privateGet(
            `${BASE}/position-details`,
            { algoId: requireString(args, "algoId"), algoOrdType: "contract_dca" },
            privateRateLimit("dca_get_order_details", 20),
          );
          return normalize(response);
        } else {
          const response = await context.client.privateGet(
            `${BASE}/orders-algo-details`,
            { algoId: requireString(args, "algoId") },
            privateRateLimit("dca_get_order_details", 20),
          );
          return normalize(response);
        }
      },
    },
    {
      name: "dca_get_sub_orders",
      module: "bot.dca",
      description:
        "Query sub-orders generated by a DCA strategy — supports both Spot DCA ('spot_dca') and Contract DCA ('contract_dca'). " +
        "Spot DCA: type='filled' for executed orders, type='live' for pending orders. " +
        "Contract DCA: returns cycle list (each buy cycle and its result). " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoOrdType: { type: "string", enum: ["spot_dca", "contract_dca"], description: "spot_dca=Spot DCA, contract_dca=Contract DCA" },
          algoId:      { type: "string", description: "DCA strategy ID" },
          type:        { type: "string", enum: ["filled", "live"], description: "Spot DCA only: filled=executed orders; live=pending orders" },
        },
        required: ["algoOrdType", "algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const algoOrdType = requireString(args, "algoOrdType");
        if (algoOrdType === "contract_dca") {
          const response = await context.client.privateGet(
            `${BASE}/cycle-list`,
            { algoId: requireString(args, "algoId"), algoOrdType: "contract_dca" },
            privateRateLimit("dca_get_sub_orders", 20),
          );
          return normalize(response);
        } else {
          const rawType = readString(args, "type") ?? "filled";
          const apiType = rawType === "live" ? "0" : "1";
          const response = await context.client.privateGet(
            `${BASE}/sub-orders`,
            { algoId: requireString(args, "algoId"), type: apiType },
            privateRateLimit("dca_get_sub_orders", 20),
          );
          return normalize(response);
        }
      },
    },
  ];
}