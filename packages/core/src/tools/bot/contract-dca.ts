import type { ToolSpec } from "../types.js";
import { asRecord, compactObject, readBoolean, readString, requireString } from "../helpers.js";
import { privateRateLimit } from "../common.js";

const BASE = "/api/v5/tradingBot/dca";

function normalize(response: { endpoint: string; requestTime: string; data: unknown }): Record<string, unknown> {
  return { endpoint: response.endpoint, requestTime: response.requestTime, data: response.data };
}

export function registerContractDcaTools(): ToolSpec[] {
  return [
    {
      name: "contract_dca_create",
      module: "bot-contract-dca",
      description:
        "Create a Contract DCA (Martingale) bot for futures/swaps. Buys an initial order then adds safety orders as price drops. " +
        "direction: 'long' (default) or 'short'. side must match direction (buy=long, sell=short). " +
        "Starts immediately with triggerStrategy='instant'. " +
        "[CAUTION] Uses leverage and executes real trades. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          instId:       { type: "string", description: "e.g. BTC-USDT-SWAP" },
          lever:        { type: "string", description: "Leverage multiplier (e.g. '3')" },
          side:         { type: "string", enum: ["buy", "sell"], description: "buy=long, sell=short" },
          direction:    { type: "string", enum: ["long", "short"], description: "Bot direction (default: long)" },
          initOrdAmt:   { type: "string", description: "Initial order amount (USDT)" },
          safetyOrdAmt: { type: "string", description: "Safety order amount (USDT)" },
          maxSafetyOrds:{ type: "string", description: "Max number of safety orders (e.g. '3')" },
          pxSteps:      { type: "string", description: "Price drop % to trigger each safety order (e.g. '0.02' = 2%)" },
          pxStepsMult:  { type: "string", description: "Price step multiplier between safety orders (e.g. '1' = constant)" },
          volMult:      { type: "string", description: "Safety order size multiplier (e.g. '1' = constant, '2' = doubling)" },
          tpPct:        { type: "string", description: "Take-profit ratio (e.g. '0.02' = 2%)" },
          reserveFunds: { type: "string", enum: ["true", "false"], description: "Reserve full margin upfront (default: false)" },
        },
        required: ["instId", "lever", "side", "initOrdAmt", "safetyOrdAmt", "maxSafetyOrds", "pxSteps", "pxStepsMult", "volMult", "tpPct"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
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
          privateRateLimit("contract_dca_create", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_stop",
      module: "bot-contract-dca",
      description:
        "Stop a running contract DCA v2 strategy. [CAUTION] Cancels future cycles. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/stop`,
          { algoId: requireString(args, "algoId"), algoOrdType: "contract_dca" },
          privateRateLimit("contract_dca_stop", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_manual_buy",
      module: "bot-contract-dca",
      description:
        "Manually trigger an additional buy for a contract DCA strategy (outside the regular cycle). " +
        "[CAUTION] Executes a real trade. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string" },
          amt:    { type: "string", description: "Amount to buy (USDT)" },
          price:  { type: "string", description: "Limit price (required)" },
        },
        required: ["algoId", "amt", "price"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/orders/manual-buy`,
          compactObject({
            algoId:      requireString(args, "algoId"),
            algoOrdType: "contract_dca",
            amt:         requireString(args, "amt"),
            price:       readString(args, "price"),
          }),
          privateRateLimit("contract_dca_manual_buy", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_margin_add",
      module: "bot-contract-dca",
      description:
        "Add margin to an existing contract DCA strategy position to increase collateral. " +
        "[CAUTION] Modifies live position. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string" },
          amt:    { type: "string", description: "Amount of margin to add (USDT)" },
        },
        required: ["algoId", "amt"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/margin/add`,
          { algoId: requireString(args, "algoId"), amt: requireString(args, "amt") },
          privateRateLimit("contract_dca_margin_add", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_margin_reduce",
      module: "bot-contract-dca",
      description:
        "Reduce margin from an existing contract DCA strategy position. " +
        "[CAUTION] Modifies live position. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string" },
          amt:    { type: "string", description: "Amount of margin to remove (USDT)" },
        },
        required: ["algoId", "amt"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/margin/reduce`,
          { algoId: requireString(args, "algoId"), amt: requireString(args, "amt") },
          privateRateLimit("contract_dca_margin_reduce", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_set_take_profit",
      module: "bot-contract-dca",
      description:
        "Set take-profit price for a contract DCA strategy. " +
        "tpPrice is the absolute price to trigger take-profit (e.g. '31500'). " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId:  { type: "string" },
          tpPrice: { type: "string", description: "Take-profit price (e.g. '31500')" },
        },
        required: ["algoId", "tpPrice"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/settings/take-profit`,
          { algoId: requireString(args, "algoId"), algoOrdType: "contract_dca", tpPrice: requireString(args, "tpPrice") },
          privateRateLimit("contract_dca_set_take_profit", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_set_reinvestment",
      module: "bot-contract-dca",
      description:
        "Configure reinvestment for a contract DCA strategy. " +
        "allowReinvest=true auto-reinvests profits into the next cycle, false disables it. " +
        "Private endpoint. Rate limit: 20 req/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          algoId:       { type: "string" },
          allowReinvest: { type: "boolean", description: "true to reinvest profits, false to disable" },
        },
        required: ["algoId", "allowReinvest"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/settings/reinvestment`,
          {
            algoId:       requireString(args, "algoId"),
            algoOrdType:  "contract_dca",
            allowReinvest: readBoolean(args, "allowReinvest") ?? true,
          },
          privateRateLimit("contract_dca_set_reinvestment", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_get_positions",
      module: "bot-contract-dca",
      description: "Query current position details for a contract DCA strategy. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/position-details`,
          { algoId: requireString(args, "algoId"), algoOrdType: "contract_dca" },
          privateRateLimit("contract_dca_get_positions", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_get_cycles",
      module: "bot-contract-dca",
      description: "Query cycle history for a contract DCA strategy (each buy cycle and its result). Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId: { type: "string" },
        },
        required: ["algoId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/cycle-list`,
          { algoId: requireString(args, "algoId"), algoOrdType: "contract_dca" },
          privateRateLimit("contract_dca_get_cycles", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_get_orders",
      module: "bot-contract-dca",
      description: "Query orders generated by a contract DCA strategy. cycleId is required (get it from contract_dca_get_cycles). Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          algoId:  { type: "string" },
          cycleId: { type: "string", description: "Cycle ID from contract_dca_get_cycles" },
        },
        required: ["algoId", "cycleId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/orders`,
          { algoId: requireString(args, "algoId"), algoOrdType: "contract_dca", cycleId: requireString(args, "cycleId") },
          privateRateLimit("contract_dca_get_orders", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_get_list",
      module: "bot-contract-dca",
      description: "Query list of active contract DCA v2 strategies. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_rawArgs, context) => {
        const response = await context.client.privateGet(
          `${BASE}/ongoing-list`,
          { algoOrdType: "contract_dca" },
          privateRateLimit("contract_dca_get_list", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "contract_dca_get_history",
      module: "bot-contract-dca",
      description: "Query historical contract DCA v2 strategies. Private endpoint. Rate limit: 20 req/2s.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: async (_rawArgs, context) => {
        const response = await context.client.privateGet(
          `${BASE}/history-list`,
          { algoOrdType: "contract_dca" },
          privateRateLimit("contract_dca_get_history", 20),
        );
        return normalize(response);
      },
    },
  ];
}
