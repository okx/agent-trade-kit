import type { ToolSpec } from "../types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readBoolean,
  readString,
  requireString,
} from "../helpers.js";
import { assertNotDemo, privateRateLimit } from "../common.js";

export function registerOnchainEarnTools(): ToolSpec[] {
  return [
    // -------------------------------------------------------------------------
    // Get Offers
    // -------------------------------------------------------------------------
    {
      name: "onchain_earn_get_offers",
      module: "earn.onchain",
      description:
        "List staking/DeFi products with APY, terms, and limits. " +
        "Always show protocol name (protocol field) and earnings currency (earningData[].ccy) when presenting results.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "Product ID filter.",
          },
          protocolType: {
            type: "string",
            description: "staking|defi",
          },
          ccy: {
            type: "string",
            description: "e.g. ETH",
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
      description: "Invest in a staking/DeFi product. [CAUTION] Moves real funds. Not available in demo mode.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "Product ID",
          },
          investData: {
            type: "array",
            description: "Array of {ccy, amt} to invest.",
            items: {
              type: "object",
              properties: {
                ccy: { type: "string", description: "e.g. ETH" },
                amt: { type: "string" },
              },
              required: ["ccy", "amt"],
            },
          },
          term: {
            type: "string",
            description: "Investment term in days, required for fixed-term products.",
          },
          tag: {
            type: "string",
            description: "Order tag.",
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
      description: "Redeem a staking/DeFi investment. [CAUTION] Some products have lock periods, early redemption may incur penalties. Not available in demo mode.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ordId: {
            type: "string",
            description: "Order ID",
          },
          protocolType: {
            type: "string",
            description: "staking|defi",
          },
          allowEarlyRedeem: {
            type: "boolean",
            description: "Allow early exit for fixed-term products, may incur penalties. Default: false.",
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
      description: "Cancel a pending staking/DeFi purchase order. [CAUTION] Not available in demo mode.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ordId: {
            type: "string",
            description: "Order ID",
          },
          protocolType: {
            type: "string",
            description: "staking|defi",
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
      description: "List current active staking/DeFi investments.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "Product ID filter.",
          },
          protocolType: {
            type: "string",
            description: "staking|defi",
          },
          ccy: {
            type: "string",
            description: "e.g. ETH",
          },
          state: {
            type: "string",
            description: "8=pending, 13=cancelling, 9=onchain, 1=earning, 2=redeeming",
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
      description: "List past staking/DeFi orders including redeemed ones.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          productId: {
            type: "string",
            description: "Product ID filter.",
          },
          protocolType: {
            type: "string",
            description: "staking|defi",
          },
          ccy: {
            type: "string",
            description: "e.g. ETH",
          },
          after: {
            type: "string",
            description: "Cursor: results older than this order ID.",
          },
          before: {
            type: "string",
            description: "Cursor: results newer than this order ID.",
          },
          limit: {
            type: "string",
            description: "Max results (default 100, max 100).",
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
