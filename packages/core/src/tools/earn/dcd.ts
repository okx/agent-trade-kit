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
      description:
        "Get available DCD (Dual Currency Deposit) currency pairs. Private endpoint. Rate limit: 5 req/s.",
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
      description:
        "Get active DCD products with yield, trade size, quota, and VIP yield tier information. " +
        "baseCcy, quoteCcy, and optType are all required. Private endpoint. Rate limit: 5 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          baseCcy: { type: "string", description: "Base currency, e.g. BTC" },
          quoteCcy: { type: "string", description: "Quote currency, e.g. USDT" },
          optType: { type: "string", description: "Option type: C (Call/高卖) or P (Put/低买)" },
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
      name: "dcd_request_quote",
      module: "earn.dcd",
      description:
        "Request a real-time quote for a DCD product. Check validUntil for expiry time — execute before expiry. " +
        "Yield reflects the user's actual VIP tier rate. Private endpoint. Rate limit: 5 req/s.",
      isWrite: false, // POST for payload, no state change
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "Product ID, e.g. BTC-USDT-260327-77000-C" },
          notionalSz: { type: "string", description: "Investment amount" },
          notionalCcy: { type: "string", description: "Investment currency: baseCcy for CALL (C), quoteCcy for PUT (P)" },
        },
        required: ["productId", "notionalSz", "notionalCcy"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        return withDcdErrors(async () => {
          const response = await context.client.privatePost(
            "/api/v5/finance/sfp/dcd/quote",
            {
              productId: requireString(args, "productId"),
              notionalSz: requireString(args, "notionalSz"),
              notionalCcy: requireString(args, "notionalCcy"),
            },
            privateRateLimit("dcd_request_quote", 5),
          );
          return normalizeResponse(response);
        });
      },
    },
    {
      name: "dcd_execute_quote",
      module: "earn.dcd",
      description:
        "Execute a DCD quote to place a trade. [CAUTION] Moves real funds into DCD product. " +
        "Quote expires — call immediately after dcd_request_quote. " +
        "Not supported in demo/simulated trading mode. Private endpoint. Rate limit: 5 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          quoteId: { type: "string", description: "Quote ID from dcd_request_quote" },
          clOrdId: { type: "string", description: "Client order ID for idempotency (optional)" },
        },
        required: ["quoteId"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "dcd_execute_quote");
        const args = asRecord(rawArgs);
        return withDcdErrors(async () => {
          const response = await context.client.privatePost(
            "/api/v5/finance/sfp/dcd/trade",
            compactObject({
              quoteId: requireString(args, "quoteId"),
              clOrdId: readString(args, "clOrdId"),
            }),
            privateRateLimit("dcd_execute_quote", 5),
          );
          return normalizeResponse(response);
        });
      },
    },
    {
      name: "dcd_request_redeem_quote",
      module: "earn.dcd",
      description:
        "Request an early redemption quote for a live DCD order. Check validUntil for expiry. " +
        "Private endpoint. Rate limit: 5 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ordId: { type: "string", description: "Order ID to redeem early" },
        },
        required: ["ordId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        return withDcdErrors(async () => {
          const response = await context.client.privatePost(
            "/api/v5/finance/sfp/dcd/redeem-quote",
            { ordId: requireString(args, "ordId") },
            privateRateLimit("dcd_request_redeem_quote", 5),
          );
          return normalizeResponse(response);
        });
      },
    },
    {
      name: "dcd_execute_redeem",
      module: "earn.dcd",
      description:
        "Execute an early redemption using a valid redeem quote. [CAUTION] Initiates early redemption of a DCD position. " +
        "Not supported in demo/simulated trading mode. Private endpoint. Rate limit: 5 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ordId: { type: "string", description: "Order ID" },
          quoteId: { type: "string", description: "Redeem quote ID from dcd_request_redeem_quote" },
        },
        required: ["ordId", "quoteId"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "dcd_execute_redeem");
        const args = asRecord(rawArgs);
        return withDcdErrors(async () => {
          const response = await context.client.privatePost(
            "/api/v5/finance/sfp/dcd/redeem",
            {
              ordId: requireString(args, "ordId"),
              quoteId: requireString(args, "quoteId"),
            },
            privateRateLimit("dcd_execute_redeem", 5),
          );
          return normalizeResponse(response);
        });
      },
    },
    {
      name: "dcd_get_order_state",
      module: "earn.dcd",
      description:
        "Query DCD order state by order ID. Private endpoint. Rate limit: 5 req/s.",
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
      description:
        "Get DCD order history with optional filters. Returns up to 100 records per request. " +
        "Private endpoint. Rate limit: 5 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ordId: { type: "string", description: "Filter by specific order ID (ignores other filters when provided)" },
          productId: { type: "string", description: "Filter by product ID, e.g. BTC-USDT-260327-77000-C" },
          uly: { type: "string", description: "Filter by underlying index, e.g. BTC-USD" },
          state: {
            type: "string",
            description:
              "Filter by state: initial | live | pending_settle | settled | pending_redeem | redeemed | rejected",
          },
          beginId: { type: "string", description: "Return records newer than this order ID (pagination)" },
          endId: { type: "string", description: "Return records older than this order ID (pagination)" },
          begin: { type: "string", description: "Begin timestamp filter, Unix ms" },
          end: { type: "string", description: "End timestamp filter, Unix ms" },
          limit: { type: "number", description: "Results per request, max 100 (default 100)" },
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
  ];
}
