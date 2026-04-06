import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "../helpers.js";
import { assertNotDemo, privateRateLimit } from "../common.js";
import { OkxApiError, RateLimitError } from "../../utils/errors.js";

// retry=true: withDcdErrors converts the error to RateLimitError, signaling the caller to back off and retry.
const DCD_CODE_BEHAVIORS: Record<string, { retry: boolean; suggestion: string }> = {
  "50001": { retry: true,  suggestion: "DCD service is down. Retry in a few minutes." },
  "50002": { retry: false, suggestion: "Invalid JSON in request body. This is likely a bug — check request parameters." },
  "50014": { retry: false, suggestion: "Missing required parameter. Check that all required fields are provided." },
  "50016": { retry: false, suggestion: "notionalCcy does not match productId option type. Use baseCcy for CALL, quoteCcy for PUT." },
  "50026": { retry: true,  suggestion: "DCD system error. Retry in a few minutes." },
  "50030": { retry: false, suggestion: "Account not authorized for DCD (earn-auth check failed). Complete required verification in the OKX app first." },
  "50038": { retry: false, suggestion: "DCD Open API feature is disabled for this account. Contact OKX support to enable it." },
  "50051": { retry: false, suggestion: "This currency pair is restricted for your country or account type. Do not retry." },
  "51000": { retry: false, suggestion: "Invalid parameter value or format. Check ordId, quoteId, or clOrdId." },
  "51728": { retry: false, suggestion: "Available quota exceeded. Reduce the amount and retry." },
  "51736": { retry: false, suggestion: "Insufficient balance. Top up your account before retrying." },
  "52905": { retry: false, suggestion: "Quote has expired or was not found. Request a new quote." },
  "52909": { retry: false, suggestion: "Duplicate client order ID. Use a different clOrdId." },
  "52917": { retry: false, suggestion: "Amount is below the minimum trade size. Increase the amount." },
  "52918": { retry: false, suggestion: "Amount exceeds the maximum trade size. Reduce the amount." },
  "52921": { retry: false, suggestion: "Quote has already been used by another trade." },
  "52927": { retry: true,  suggestion: "No quote returned by liquidity provider. Retry the quote request." },
  "52928": { retry: false, suggestion: "Amount is not divisible by the required step size. Adjust the amount." },
  "58004": { retry: false, suggestion: "Account is frozen or blocked. Contact OKX support. Do not retry." },
  "58102": { retry: true,  suggestion: "DCD rate limit exceeded. Back off and retry after a short delay." },
};

async function withDcdErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof OkxApiError && error.code) {
      const behavior = DCD_CODE_BEHAVIORS[error.code];
      if (behavior) {
        if (behavior.retry) {
          throw new RateLimitError(error.message, behavior.suggestion, error.endpoint, error.traceId);
        }
        throw new OkxApiError(error.message, {
          code: error.code,
          suggestion: behavior.suggestion,
          endpoint: error.endpoint,
          traceId: error.traceId,
        });
      }
    }
    throw error;
  }
}

export function registerDcdTools(): ToolSpec[] {
  return [
    {
      name: "dcd_get_currency_pairs",
      module: "earn.dcd",
      description: "Get available DCD currency pairs.",
      isWrite: false,
      inputSchema: { type: "object", properties: {} },
      handler: async (_rawArgs, context) => {
        return withDcdErrors(async () => {
          const response = await context.client.privateGet(
            "/api/v5/finance/sfp/dcd/currency-pair",
            undefined,
            privateRateLimit("dcd_get_currency_pairs", 5),
          );
          return normalizeResponse(response);
        });
      },
    },
    {
      name: "dcd_get_products",
      module: "earn.dcd",
      description: "Get DCD products with yield and quota info. Yields in response are decimal fractions, not percentages.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          baseCcy: { type: "string", description: "Base currency, e.g. BTC" },
          quoteCcy: { type: "string", description: "Quote currency, e.g. USDT" },
          optType: { type: "string", description: "Option type: C (Call, sell high) or P (Put, buy low)" },
        },
        required: ["baseCcy", "quoteCcy", "optType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        return withDcdErrors(async () => {
          const response = await context.client.privateGet(
            "/api/v5/finance/sfp/dcd/products",
            {
              baseCcy: requireString(args, "baseCcy"),
              quoteCcy: requireString(args, "quoteCcy"),
              optType: requireString(args, "optType"),
            },
            privateRateLimit("dcd_get_products", 5),
          );
          return normalizeResponse(response);
        });
      },
    },
    {
      name: "dcd_get_order_state",
      module: "earn.dcd",
      description: "Check DCD order state after subscription (returns ordId + state only). For full order details (productId, strike, yield, settlement info), use dcd_get_orders instead.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ordId: { type: "string", description: "Order ID" },
        },
        required: ["ordId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        return withDcdErrors(async () => {
          const response = await context.client.privateGet(
            "/api/v5/finance/sfp/dcd/order-status",
            { ordId: requireString(args, "ordId") },
            privateRateLimit("dcd_get_order_state", 5),
          );
          return normalizeResponse(response);
        });
      },
    },
    {
      name: "dcd_get_orders",
      module: "earn.dcd",
      description: "Get DCD order history. Yields in response are decimal fractions, not percentages.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ordId: { type: "string", description: "Filter by order ID (overrides other filters)" },
          productId: { type: "string", description: "e.g. BTC-USDT-260327-77000-C" },
          uly: { type: "string", description: "Underlying index, e.g. BTC-USD" },
          state: {
            type: "string",
            description:
              "Filter by state: initial | live | pending_settle | settled | pending_redeem | redeemed | rejected",
          },
          beginId: { type: "string", description: "Cursor for newer records" },
          endId: { type: "string", description: "Cursor for older records" },
          begin: { type: "string", description: "Begin timestamp, Unix ms" },
          end: { type: "string", description: "End timestamp, Unix ms" },
          limit: { type: "number", description: "Default 100" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        return withDcdErrors(async () => {
          const response = await context.client.privateGet(
            "/api/v5/finance/sfp/dcd/order-history",
            compactObject({
              ordId: readString(args, "ordId"),
              productId: readString(args, "productId"),
              uly: readString(args, "uly"),
              state: readString(args, "state"),
              beginId: readString(args, "beginId"),
              endId: readString(args, "endId"),
              begin: readString(args, "begin"),
              end: readString(args, "end"),
              limit: readNumber(args, "limit"),
            }),
            privateRateLimit("dcd_get_orders", 5),
          );
          return normalizeResponse(response);
        });
      },
    },
    {
      name: "dcd_subscribe",
      module: "earn.dcd",
      description:
        "Subscribe to a DCD product: get quote and execute atomically. " +
        "Confirm product, amount, and currency with user before calling. " +
        "Optional minAnnualizedYield rejects the order if quote yield falls below threshold. " +
        "Returns order result with quote snapshot (minAnnualizedYield is in percent; response yields are decimal fractions).",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "Product ID, e.g. BTC-USDT-260327-77000-C" },
          notionalSz: { type: "string", description: "Investment amount (the quantity to invest, e.g. '0.1' for 0.1 BTC). This is the 'sz' / 'size' field for DCD." },
          notionalCcy: { type: "string", description: "Investment currency: baseCcy for CALL (C), quoteCcy for PUT (P)" },
          clOrdId: { type: "string", description: "Client order ID for idempotency (optional)" },
          minAnnualizedYield: {
            type: "number",
            description:
              "Minimum acceptable annualized yield in percent (e.g. 18 means 18%). " +
              "Order will NOT be placed if the quote yield is below this threshold.",
          },
        },
        required: ["productId", "notionalSz", "notionalCcy"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const productId = requireString(args, "productId");
        const notionalSz = requireString(args, "notionalSz");
        const notionalCcy = requireString(args, "notionalCcy");
        const clOrdId = readString(args, "clOrdId");
        const minAnnualizedYield = readNumber(args, "minAnnualizedYield");

        return withDcdErrors(async () => {
          // Step 1: request quote
          const quoteResp = await context.client.privatePost(
            "/api/v5/finance/sfp/dcd/quote",
            { productId, notionalSz, notionalCcy },
            privateRateLimit("dcd_subscribe", 5),
          );
          const quoteNorm = normalizeResponse(quoteResp);
          const quoteList = Array.isArray(quoteNorm["data"])
            ? (quoteNorm["data"] as Record<string, unknown>[])
            : [];
          const quote = quoteList[0];

          if (!quote || !quote["quoteId"]) {
            throw new OkxApiError("No quote returned by liquidity provider.", {
              code: "52927",
              suggestion: "Retry the subscription request.",
            });
          }

          // Step 2: check minAnnualizedYield before executing
          // API returns annualizedYield as decimal (e.g. 0.1748 = 17.48%), convert to percent for comparison
          if (minAnnualizedYield !== undefined) {
            const rawYield = parseFloat(quote["annualizedYield"] as string);
            if (isNaN(rawYield)) {
              throw new OkxApiError(
                "Quote returned non-numeric annualizedYield, cannot verify minimum yield threshold.",
                {
                  code: "INVALID_YIELD_VALUE",
                  suggestion: "Order not placed. The quote did not include a valid annualizedYield. Retry or pick a different product.",
                },
              );
            }
            const actualYieldPct = rawYield * 100;
            if (actualYieldPct < minAnnualizedYield) {
              throw new OkxApiError(
                `Quote yield ${actualYieldPct.toFixed(2)}% is below the minimum threshold of ${minAnnualizedYield}%.`,
                {
                  code: "YIELD_BELOW_MIN",
                  suggestion: `Order not placed. Actual: ${actualYieldPct.toFixed(2)}%, required: >= ${minAnnualizedYield}%. Try a different product or lower your minimum yield.`,
                },
              );
            }
          }

          // Step 3: execute quote immediately
          const tradeResp = await context.client.privatePost(
            "/api/v5/finance/sfp/dcd/trade",
            compactObject({
              quoteId: quote["quoteId"] as string,
              clOrdId,
            }),
            privateRateLimit("dcd_subscribe", 5),
          );
          const tradeNorm = normalizeResponse(tradeResp);

          // Return trade result with quote snapshot attached
          return {
            ...tradeNorm,
            quote: {
              quoteId: quote["quoteId"],
              annualizedYield: quote["annualizedYield"],
              absYield: quote["absYield"],
              notionalSz: quote["notionalSz"],
              notionalCcy: quote["notionalCcy"],
            },
          };
        });
      },
    },
    {
      name: "dcd_redeem",
      module: "earn.dcd",
      description:
        "Early redemption of a DCD order, two-step flow. " +
        "First call (no quoteId): returns redemption quote for user confirmation. " +
        "Second call (with quoteId): executes redemption. If the quote expired, auto-refreshes and executes; response includes autoRefreshedQuote: true.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ordId: { type: "string", description: "Order ID to redeem early" },
          quoteId: {
            type: "string",
            description:
              "Redeem quote ID returned by the first dcd_redeem call. " +
              "Omit on the first call to preview the exit cost; provide on the second call to execute.",
          },
        },
        required: ["ordId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const ordId = requireString(args, "ordId");
        const quoteId = readString(args, "quoteId");

        if (!quoteId) {
          // First call: preview mode — request quote only, no state change
          return withDcdErrors(async () => {
            const resp = await context.client.privatePost(
              "/api/v5/finance/sfp/dcd/redeem-quote",
              { ordId },
              privateRateLimit("dcd_redeem", 5),
            );
            return normalizeResponse(resp);
          });
        }

        // Second call: execute mode
        assertNotDemo(context.config, "dcd_redeem");
        return withDcdErrors(async () => {
          try {
            const resp = await context.client.privatePost(
              "/api/v5/finance/sfp/dcd/redeem",
              { ordId, quoteId },
              privateRateLimit("dcd_redeem", 5),
            );
            return normalizeResponse(resp);
          } catch (error) {
            // Quote expired: user already confirmed — re-request and execute atomically
            if (error instanceof OkxApiError && error.code === "52905") {
              const quoteResp = await context.client.privatePost(
                "/api/v5/finance/sfp/dcd/redeem-quote",
                { ordId },
                privateRateLimit("dcd_redeem", 5),
              );
              const quoteNorm = normalizeResponse(quoteResp);
              const quoteList = Array.isArray(quoteNorm["data"])
                ? (quoteNorm["data"] as Record<string, unknown>[])
                : [];
              const newQuote = quoteList[0];
              if (!newQuote?.["quoteId"]) {
                throw error; // cannot recover, surface original expiry error
              }
              const redeemResp = await context.client.privatePost(
                "/api/v5/finance/sfp/dcd/redeem",
                { ordId, quoteId: newQuote["quoteId"] as string },
                privateRateLimit("dcd_redeem", 5),
              );
              return {
                ...normalizeResponse(redeemResp),
                autoRefreshedQuote: true,
                refreshedQuote: {
                  quoteId: newQuote["quoteId"],
                  redeemSz: newQuote["redeemSz"],
                  redeemCcy: newQuote["redeemCcy"],
                  termRate: newQuote["termRate"],
                },
              };
            }
            throw error;
          }
        });
      },
    },
  ];
}
