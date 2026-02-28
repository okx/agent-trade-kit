import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";

function normalize(response: {
  endpoint: string;
  requestTime: string;
  data: unknown;
}): Record<string, unknown> {
  return {
    endpoint: response.endpoint,
    requestTime: response.requestTime,
    data: response.data,
  };
}

export function registerAccountTools(): ToolSpec[] {
  return [
    {
      name: "account_get_balance",
      module: "account",
      description:
        "Get account balance for trading account. Returns balances for all currencies or a specific one. Private endpoint. Rate limit: 10 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description:
              "Currency, e.g. BTC. Comma-separated for multiple, e.g. BTC,ETH. Omit for all.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/balance",
          compactObject({ ccy: readString(args, "ccy") }),
          privateRateLimit("account_get_balance", 10),
        );
        return normalize(response);
      },
    },
    {
      name: "account_transfer",
      module: "account",
      description:
        "Transfer funds between accounts (trading, funding, etc.). [CAUTION] Moves real funds. Private endpoint. Rate limit: 2 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "Currency to transfer, e.g. USDT.",
          },
          amt: {
            type: "string",
            description: "Transfer amount.",
          },
          from: {
            type: "string",
            description:
              "Transfer source account type. 6=funding, 18=trading (unified).",
          },
          to: {
            type: "string",
            description:
              "Transfer destination account type. 6=funding, 18=trading (unified).",
          },
          type: {
            type: "string",
            description:
              "Transfer type. 0=master account transfer (default), 1=master to sub-account, 2=sub-account to master, 3=sub-account to sub-account.",
          },
          subAcct: {
            type: "string",
            description: "Sub-account name. Required when type is 1, 2, or 3.",
          },
          clientId: {
            type: "string",
            description: "Client-supplied ID. Up to 32 characters.",
          },
        },
        required: ["ccy", "amt", "from", "to"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/asset/transfer",
          compactObject({
            ccy: requireString(args, "ccy"),
            amt: requireString(args, "amt"),
            from: requireString(args, "from"),
            to: requireString(args, "to"),
            type: readString(args, "type"),
            subAcct: readString(args, "subAcct"),
            clientId: readString(args, "clientId"),
          }),
          privateRateLimit("account_transfer", 2),
        );
        return normalize(response);
      },
    },
    {
      name: "account_get_max_size",
      module: "account",
      description:
        "Get max buy/sell order size for a SWAP/FUTURES instrument given current balance and leverage. Useful before placing orders. Private. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT-SWAP.",
          },
          tdMode: {
            type: "string",
            enum: ["cross", "isolated"],
            description: "Trade mode: cross or isolated margin.",
          },
          px: {
            type: "string",
            description:
              "Order price for limit order calculation. Affects the max size result. Omit for market orders.",
          },
          leverage: {
            type: "string",
            description: "Leverage to use for calculation. Defaults to current account leverage.",
          },
          ccy: {
            type: "string",
            description: "Margin currency. Required for isolated margin mode.",
          },
        },
        required: ["instId", "tdMode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/max-size",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            px: readString(args, "px"),
            leverage: readString(args, "leverage"),
            ccy: readString(args, "ccy"),
          }),
          privateRateLimit("account_get_max_size", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "account_get_asset_balance",
      module: "account",
      description:
        "Get funding account balance (asset account). Different from account_get_balance which queries the trading account. Private. Rate limit: 6 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description:
              "Currency filter, e.g. BTC or BTC,ETH for multiple. Omit to return all currencies.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/asset/balances",
          compactObject({ ccy: readString(args, "ccy") }),
          privateRateLimit("account_get_asset_balance", 6),
        );
        return normalize(response);
      },
    },
  ];
}
