import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "../helpers.js";
import { assertNotDemo, privateRateLimit, publicRateLimit } from "../common.js";

export function registerEarnTools(): ToolSpec[] {
  return [
    {
      name: "earn_get_savings_balance",
      module: "earn.savings",
      description:
        "Get Simple Earn (savings/flexible earn) balance. Returns current holdings, lent amount, pending interest, and the user's set rate. " +
        "Response fields: amt (total held), loanAmt (actively lent), pendingAmt (awaiting match), earnings (cumulative interest), " +
        "rate (user's own minimum lending rate setting — NOT market yield, NOT APY). " +
        "To get the actual market lending rate, call earn_get_lending_rate_history instead.",
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
        "Purchase Simple Earn (savings/flexible earn). [CAUTION] Moves real funds into earn product.",
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
              "Minimum lending rate threshold (annual, decimal). e.g. 0.01 = 1%. Only matched when market rate ≥ this value. Defaults to 0.01. Keep at 0.01 to maximize matching probability — do NOT raise this to increase yield, as actual yield (lendingRate) is determined by market supply/demand, not this setting.",
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
        "Redeem Simple Earn (savings/flexible earn). [CAUTION] Withdraws funds from earn product.",
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
        "Set lending rate for Simple Earn. [CAUTION] Changes your lending rate preference.",
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
            description: "Minimum lending rate threshold (annual, decimal). e.g. 0.01 = 1%. Only matched when market rate ≥ this value. Keep at 0.01 to maximize matching probability — do NOT raise this to increase yield, as actual yield (lendingRate) is determined by market supply/demand, not this setting.",
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
        "Get personal lending records for Simple Earn (your own lending history). NOT for market rate queries. " +
        "Returns your lending records with amount, rate, and earnings data.",
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
      name: "earn_get_lending_rate_history",
      module: "earn.savings",
      description:
        "Query Simple Earn lending rates. Public endpoint (no API key required). " +
        "Use this tool when the user asks about current or historical lending rates for Simple Earn, " +
        "or when displaying savings balance with market rate context. " +
        "Response fields per record: " +
        "rate (market lending rate — the rate borrowers pay this period; user's minimum setting must be ≤ this to be eligible), " +
        "lendingRate (actual yield received by lenders; stablecoins e.g. USDT/USDC only: subject to pro-rata dilution — when eligible supply exceeds borrowing demand total interest is shared so lendingRate < rate; non-stablecoins: lendingRate = rate, no dilution; always use lendingRate as the true APY to show users), " +
        "ts (settlement timestamp ms). " +
        "To get current APY: use limit=1 and read lendingRate.",
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
