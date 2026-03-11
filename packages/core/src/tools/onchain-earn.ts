import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readBoolean,
  readString,
  requireString,
} from "./helpers.js";
import { assertNotDemo, privateRateLimit } from "./common.js";

export function registerOnchainEarnTools(): ToolSpec[] {
  return [
    // -------------------------------------------------------------------------
    // Get Offers
    // -------------------------------------------------------------------------
    {
      name: "onchain_earn_get_offers",
      module: "earn.onchain",
      description:
        "Get available on-chain earn (staking/DeFi) offers. Returns investment products with APY, terms, and limits. " +
        "Private endpoint. Rate limit: 3 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "Specific product ID to query. Omit for all offers.",
          },
          protocolType: {
            type: "string",
            description:
              "Protocol type filter: staking, defi. Omit for all types.",
          },
          ccy: {
            type: "string",
            description: "Currency filter, e.g. ETH. Omit for all currencies.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/finance/staking-defi/offers",
          compactObject({
            productId: readString(args, "productId"),
            protocolType: readString(args, "protocolType"),
            ccy: readString(args, "ccy"),
          }),
          privateRateLimit("onchain_earn_get_offers", 3),
        );
        return normalizeResponse(response);
      },
    },

    // -------------------------------------------------------------------------
    // Purchase
    // -------------------------------------------------------------------------
    {
      name: "onchain_earn_purchase",
      module: "earn.onchain",
      description:
        "Purchase on-chain earn (staking/DeFi) product. [CAUTION] Moves real funds into staking/DeFi product. " +
        "Not supported in demo/simulated trading mode. Private endpoint. Rate limit: 2 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "Product ID to purchase",
          },
          investData: {
            type: "array",
            description:
              "Investment data array: [{ccy, amt}]. Each item specifies currency and amount.",
            items: {
              type: "object",
              properties: {
                ccy: { type: "string", description: "Currency, e.g. ETH" },
                amt: { type: "string", description: "Amount to invest" },
              },
              required: ["ccy", "amt"],
            },
          },
          term: {
            type: "string",
            description:
              "Investment term in days. Required for fixed-term products.",
          },
          tag: {
            type: "string",
            description: "Order tag for tracking (optional).",
          },
        },
        required: ["productId", "investData"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "onchain_earn_purchase");
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/finance/staking-defi/purchase",
          compactObject({
            productId: requireString(args, "productId"),
            investData: args.investData,
            term: readString(args, "term"),
            tag: readString(args, "tag"),
          }),
          privateRateLimit("onchain_earn_purchase", 2),
        );
        return normalizeResponse(response);
      },
    },

    // -------------------------------------------------------------------------
    // Redeem
    // -------------------------------------------------------------------------
    {
      name: "onchain_earn_redeem",
      module: "earn.onchain",
      description:
        "Redeem on-chain earn (staking/DeFi) investment. [CAUTION] Withdraws funds from staking/DeFi product. " +
        "Some products may have lock periods. Not supported in demo mode. Private endpoint. Rate limit: 2 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ordId: {
            type: "string",
            description: "Order ID to redeem",
          },
          protocolType: {
            type: "string",
            description: "Protocol type: staking, defi",
          },
          allowEarlyRedeem: {
            type: "boolean",
            description:
              "Allow early redemption for fixed-term products (may incur penalties). Default false.",
          },
        },
        required: ["ordId", "protocolType"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "onchain_earn_redeem");
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/finance/staking-defi/redeem",
          compactObject({
            ordId: requireString(args, "ordId"),
            protocolType: requireString(args, "protocolType"),
            allowEarlyRedeem: readBoolean(args, "allowEarlyRedeem"),
          }),
          privateRateLimit("onchain_earn_redeem", 2),
        );
        return normalizeResponse(response);
      },
    },

    // -------------------------------------------------------------------------
    // Cancel
    // -------------------------------------------------------------------------
    {
      name: "onchain_earn_cancel",
      module: "earn.onchain",
      description:
        "Cancel pending on-chain earn purchase. [CAUTION] Cancels a pending investment order. " +
        "Not supported in demo mode. Private endpoint. Rate limit: 2 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ordId: {
            type: "string",
            description: "Order ID to cancel",
          },
          protocolType: {
            type: "string",
            description: "Protocol type: staking, defi",
          },
        },
        required: ["ordId", "protocolType"],
      },
      handler: async (rawArgs, context) => {
        assertNotDemo(context.config, "onchain_earn_cancel");
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/finance/staking-defi/cancel",
          {
            ordId: requireString(args, "ordId"),
            protocolType: requireString(args, "protocolType"),
          },
          privateRateLimit("onchain_earn_cancel", 2),
        );
        return normalizeResponse(response);
      },
    },

    // -------------------------------------------------------------------------
    // Get Active Orders
    // -------------------------------------------------------------------------
    {
      name: "onchain_earn_get_active_orders",
      module: "earn.onchain",
      description:
        "Get active on-chain earn orders. Returns current staking/DeFi investments. " +
        "Private endpoint. Rate limit: 3 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "Filter by product ID. Omit for all.",
          },
          protocolType: {
            type: "string",
            description: "Filter by protocol type: staking, defi. Omit for all.",
          },
          ccy: {
            type: "string",
            description: "Filter by currency, e.g. ETH. Omit for all.",
          },
          state: {
            type: "string",
            description:
              "Filter by state: 8 (pending), 13 (cancelling), 9 (onchain), 1 (earning), 2 (redeeming). Omit for all.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/finance/staking-defi/orders-active",
          compactObject({
            productId: readString(args, "productId"),
            protocolType: readString(args, "protocolType"),
            ccy: readString(args, "ccy"),
            state: readString(args, "state"),
          }),
          privateRateLimit("onchain_earn_get_active_orders", 3),
        );
        return normalizeResponse(response);
      },
    },

    // -------------------------------------------------------------------------
    // Get Order History
    // -------------------------------------------------------------------------
    {
      name: "onchain_earn_get_order_history",
      module: "earn.onchain",
      description:
        "Get on-chain earn order history. Returns past staking/DeFi investments including redeemed orders. " +
        "Private endpoint. Rate limit: 3 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "Filter by product ID. Omit for all.",
          },
          protocolType: {
            type: "string",
            description: "Filter by protocol type: staking, defi. Omit for all.",
          },
          ccy: {
            type: "string",
            description: "Filter by currency, e.g. ETH. Omit for all.",
          },
          after: {
            type: "string",
            description: "Pagination: return results before this order ID",
          },
          before: {
            type: "string",
            description: "Pagination: return results after this order ID",
          },
          limit: {
            type: "string",
            description: "Max results to return (default 100, max 100)",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/finance/staking-defi/orders-history",
          compactObject({
            productId: readString(args, "productId"),
            protocolType: readString(args, "protocolType"),
            ccy: readString(args, "ccy"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readString(args, "limit"),
          }),
          privateRateLimit("onchain_earn_get_order_history", 3),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
