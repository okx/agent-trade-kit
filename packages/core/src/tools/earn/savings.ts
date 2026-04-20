import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readBoolean,
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
        "Get Simple Earn (savings/flexible earn) balance. Returns current holdings for all currencies or a specific one. " +
        "To show market rates alongside balance (市场均利率), call earn_get_lending_rate_history. " +
        "earn_get_lending_rate_history also returns fixed-term (定期) product offers, so one call gives a complete view of both flexible and fixed options. " +
        "Do NOT use for fixed-term (定期) order queries — use earn_get_fixed_order_list instead.",
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
      name: "earn_get_fixed_order_list",
      module: "earn.savings",
      description:
        "Get Simple Earn Fixed (定期赚币) lending order list. " +
        "Returns orders sorted by creation time descending. " +
        "Use this to check status of fixed-term lending orders (pending/earning/expired/settled/cancelled). " +
        "Do NOT use for flexible earn balance — use earn_get_savings_balance instead. " +
        "If the result is empty, do NOT display any fixed-term section in the output.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "Currency, e.g. USDT. Omit for all.",
          },
          state: {
            type: "string",
            description:
              "Order state: pending (匹配中), earning (赚币中), expired (逾期), settled (已结算), cancelled (已撤销). Omit for all.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/finance/simple-earn-fixed/order-list",
          compactObject({
            ccy: readString(args, "ccy"),
            state: readString(args, "state"),
          }),
          privateRateLimit("earn_get_fixed_order_list", 3),
        );
        const result = normalizeResponse(response);
        if (Array.isArray(result["data"])) {
          result["data"] = (result["data"] as Record<string, unknown>[]).map(
            ({ finalSettlementDate: _, ...rest }) => rest,
          );
        }
        return result;
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
      name: "earn_fixed_purchase",
      module: "earn.savings",
      description:
        "Purchase Simple Earn Fixed (定期) product, two-step flow. " +
        "First call (confirm omitted or false): returns purchase preview with product details and risk warning. " +
        "Preview offer fields: lendQuota = remaining quota (剩余额度), soldOut = whether product is sold out (lendQuota is 0). " +
        "YOU MUST display the 'warning' field from the preview response to the user VERBATIM before asking for confirmation — do NOT omit or summarize it. " +
        "Second call (confirm=true): executes the purchase. Only proceed after the user explicitly confirms. " +
        "IMPORTANT: Orders in 'pending' (匹配中) state can still be cancelled via earn_fixed_redeem; once the status changes to 'earning' (赚币中), funds are LOCKED until maturity — no early redemption allowed.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "Currency, e.g. USDT",
          },
          amt: {
            type: "string",
            description: "Purchase amount",
          },
          term: {
            type: "string",
            description: "Term, e.g. 90D",
          },
          confirm: {
            type: "boolean",
            description:
              "Omit or false on the first call to preview the purchase details; " +
              "set to true on the second call to execute after user confirms.",
          },
        },
        required: ["ccy", "amt", "term"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const ccy = requireString(args, "ccy");
        const amt = requireString(args, "amt");
        const term = requireString(args, "term");
        const confirm = readBoolean(args, "confirm") ?? false;

        if (!confirm) {
          // First call: preview mode — fetch offer + current rate, no state change
          const [rateResponse, fixedResponse] = await Promise.all([
            context.client.publicGet(
              "/api/v5/finance/savings/lending-rate-history",
              compactObject({ ccy, limit: 1 }),
              publicRateLimit("earn_get_lending_rate_history", 6),
            ),
            context.client.privateGet(
              "/api/v5/finance/simple-earn-fixed/offers",
              compactObject({ ccy }),
              privateRateLimit("earn_fixed_purchase_preview_offers", 2),
            ).catch(() => null),
          ]);
          const rateResult = normalizeResponse(rateResponse);
          const fixedResult = fixedResponse ? normalizeResponse(fixedResponse) : { data: [] };
          const rateArr = Array.isArray(rateResult["data"])
            ? (rateResult["data"] as Record<string, unknown>[])
            : [];
          const allOffers = Array.isArray(fixedResult["data"])
            ? (fixedResult["data"] as Record<string, unknown>[])
            : [];
          const matchedOffer = allOffers.find(
            (o) => o["term"] === term && o["ccy"] === ccy,
          );
          const { borrowingOrderQuota: _, ...offerWithoutTotal } = matchedOffer ?? {};
          const offerWithSoldOut = matchedOffer
            ? { ...offerWithoutTotal, soldOut: offerWithoutTotal["lendQuota"] === "0" }
            : null;

          return {
            preview: true,
            ccy,
            amt,
            term,
            offer: offerWithSoldOut,
            currentFlexibleRate: rateArr[0]?.["lendingRate"] ?? null,
            warning:
              "⚠️ Orders still in 'pending' state can be cancelled before matching completes. " +
              "Once the status changes to 'earning', funds are LOCKED until maturity — early redemption is NOT allowed. " +
              "Please call again with confirm=true to proceed.",
          };
        }

        // Second call: execute purchase
        assertNotDemo(context.config, "earn_fixed_purchase");
        const response = await context.client.privatePost(
          "/api/v5/finance/simple-earn-fixed/purchase",
          { ccy, amt, term },
          privateRateLimit("earn_fixed_purchase", 2),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "earn_fixed_redeem",
      module: "earn.savings",
      description:
        "Redeem Simple Earn Fixed (定期赚币) order. [CAUTION] Redeems a fixed-term lending order. " +
        "Always redeems the full order amount. Only orders in 'pending' (匹配中) state can be redeemed — " +
        "orders in 'earning' state are locked until maturity and cannot be redeemed early. " +
        "Do NOT use for flexible earn redemption — use earn_savings_redeem instead.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          reqId: {
            type: "string",
            description: "Request ID of the fixed-term order to redeem",
          },
        },
        required: ["reqId"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "earn_fixed_redeem");
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/finance/simple-earn-fixed/redeem",
          {
            reqId: requireString(args, "reqId"),
          },
          privateRateLimit("earn_fixed_redeem", 2),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "earn_get_lending_rate_history",
      module: "earn.savings",
      description:
        "Query Simple Earn lending rates and fixed-term offers. " +
        "Use this tool when the user asks about Simple Earn products, current or historical lending rates, " +
        "or when displaying savings balance with market rate context (市场均利率). " +
        "Returns lending rate history (lendingRate field, newest-first) AND available fixed-term (定期) offers " +
        "with APR, term, min amount, and quota — one call gives a complete view of both flexible and fixed options. " +
        "In fixedOffers: lendQuota = remaining quota (剩余额度), soldOut = whether product is sold out (lendQuota is 0). " +
        "To get current flexible APY: use limit=1 and read lendingRate.",
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
            description: "Max results (default 7)",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const ccy = readString(args, "ccy");
        const [rateResponse, fixedResponse] = await Promise.all([
          context.client.publicGet(
            "/api/v5/finance/savings/lending-rate-history",
            compactObject({
              ccy,
              after: readString(args, "after"),
              before: readString(args, "before"),
              limit: readNumber(args, "limit") ?? 7,
            }),
            publicRateLimit("earn_get_lending_rate_history", 6),
          ),
          context.client.privateGet(
            "/api/v5/finance/simple-earn-fixed/offers",
            compactObject({ ccy }),
            privateRateLimit("earn_get_lending_rate_history_fixed", 2),
          ).catch(() => null),
        ]);

        const rateResult = normalizeResponse(rateResponse);
        // Remove redundant `rate` field — `lendingRate` is the canonical field
        const rateData = Array.isArray((rateResult as Record<string, unknown>)["data"])
          ? ((rateResult as Record<string, unknown>)["data"] as Array<Record<string, unknown>>).map(
              ({ rate: _, ...rest }) => rest,
            )
          : [];

        const fixedResult = fixedResponse ? normalizeResponse(fixedResponse) : { data: [] };
        const allOffers = ((fixedResult as Record<string, unknown>)["data"] ?? []) as Array<Record<string, unknown>>;
        const fixedOffers = allOffers
          .map(({ borrowingOrderQuota: _, ...rest }) => ({
            ...rest,
            soldOut: rest["lendQuota"] === "0",
          }));

        return {
          ...rateResult,
          data: rateData,
          fixedOffers,
        };
      },
    },
  ];
}
