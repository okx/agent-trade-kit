import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { assertNotDemo, privateRateLimit, publicRateLimit } from "./common.js";

export function registerEarnTools(): ToolSpec[] {
  return [
    {
      name: "earn_get_savings_balance",
      module: "earn.savings",
      description:
        "Get Simple Earn (savings/flexible earn) balance. Returns current holdings for all currencies or a specific one. Private endpoint. Rate limit: 6 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "e.g. USDT or BTC. Omit for all.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/finance/savings/balance",
          compactObject({ ccy: readString(args, "ccy") }),
          privateRateLimit("earn_get_savings_balance", 6),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "earn_savings_purchase",
      module: "earn.savings",
      description:
        "Purchase Simple Earn (savings/flexible earn). [CAUTION] Moves real funds into earn product. " +
        "Not supported in demo/simulated trading mode. Private endpoint. Rate limit: 6 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "Currency to purchase, e.g. USDT",
          },
          amt: {
            type: "string",
            description: "Purchase amount",
          },
          rate: {
            type: "string",
            description:
              "Lending rate. Annual rate in decimal, e.g. 0.01 = 1%. Defaults to 0.01 (1%, minimum rate, easiest to match).",
          },
        },
        required: ["ccy", "amt"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "earn_savings_purchase");
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/finance/savings/purchase-redempt",
          compactObject({
            ccy: requireString(args, "ccy"),
            amt: requireString(args, "amt"),
            side: "purchase",
            rate: readString(args, "rate") ?? "0.01",
          }),
          privateRateLimit("earn_savings_purchase", 6),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "earn_savings_redeem",
      module: "earn.savings",
      description:
        "Redeem Simple Earn (savings/flexible earn). [CAUTION] Withdraws funds from earn product. " +
        "Not supported in demo/simulated trading mode. Private endpoint. Rate limit: 6 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "Currency to redeem, e.g. USDT",
          },
          amt: {
            type: "string",
            description: "Redemption amount",
          },
        },
        required: ["ccy", "amt"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "earn_savings_redeem");
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/finance/savings/purchase-redempt",
          compactObject({
            ccy: requireString(args, "ccy"),
            amt: requireString(args, "amt"),
            side: "redempt",
          }),
          privateRateLimit("earn_savings_redeem", 6),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "earn_set_lending_rate",
      module: "earn.savings",
      description:
        "Set lending rate for Simple Earn. [CAUTION] Changes your lending rate preference. " +
        "Not supported in demo/simulated trading mode. Private endpoint. Rate limit: 6 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "Currency, e.g. USDT",
          },
          rate: {
            type: "string",
            description: "Lending rate. Annual rate in decimal, e.g. 0.01 = 1%",
          },
        },
        required: ["ccy", "rate"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "earn_set_lending_rate");
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/finance/savings/set-lending-rate",
          {
            ccy: requireString(args, "ccy"),
            rate: requireString(args, "rate"),
          },
          privateRateLimit("earn_set_lending_rate", 6),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "earn_get_lending_history",
      module: "earn.savings",
      description:
        "Get lending history for Simple Earn. Returns lending records with details like amount, rate, and earnings. " +
        "Private endpoint. Rate limit: 6 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "e.g. USDT. Omit for all.",
          },
          after: {
            type: "string",
            description: "Pagination: before this record ID",
          },
          before: {
            type: "string",
            description: "Pagination: after this record ID",
          },
          limit: {
            type: "number",
            description: "Max results (default 100)",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/finance/savings/lending-history",
          compactObject({
            ccy: readString(args, "ccy"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          privateRateLimit("earn_get_lending_history", 6),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "earn_get_lending_rate_summary",
      module: "earn.savings",
      description:
        "Get market lending rate summary for Simple Earn. Public endpoint (no API key required). " +
        "Returns current lending rates, estimated APY, and available amounts. Rate limit: 6 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "e.g. USDT. Omit for all.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/finance/savings/lending-rate-summary",
          compactObject({ ccy: readString(args, "ccy") }),
          publicRateLimit("earn_get_lending_rate_summary", 6),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "earn_get_lending_rate_history",
      module: "earn.savings",
      description:
        "Get historical lending rates for Simple Earn. Public endpoint (no API key required). " +
        "Returns past lending rate data for trend analysis. Rate limit: 6 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "e.g. USDT. Omit for all.",
          },
          after: {
            type: "string",
            description: "Pagination: before this timestamp (ms)",
          },
          before: {
            type: "string",
            description: "Pagination: after this timestamp (ms)",
          },
          limit: {
            type: "number",
            description: "Max results (default 100)",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/finance/savings/lending-rate-history",
          compactObject({
            ccy: readString(args, "ccy"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          publicRateLimit("earn_get_lending_rate_history", 6),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
