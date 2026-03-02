import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  readNumber,
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
    {
      name: "account_get_bills",
      module: "account",
      description:
        "Get account ledger: fees paid, funding charges, realized PnL, transfers, etc. " +
        "Default 20 records (last 7 days), max 100. Private endpoint. Rate limit: 6 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SPOT", "MARGIN", "SWAP", "FUTURES", "OPTION"],
            description: "Filter by instrument type.",
          },
          ccy: {
            type: "string",
            description: "Currency filter, e.g. USDT.",
          },
          mgnMode: {
            type: "string",
            enum: ["isolated", "cross"],
            description: "Margin mode filter.",
          },
          type: {
            type: "string",
            description:
              "Bill type filter. 1=transfer, 2=trade, 3=delivery, 4=auto token convert, 5=liquidation, 6=margin transfer, 7=interest deduction, 8=funding fee, 9=adl, 10=clawback, 11=system token convert, 12=strategy transfer, 13=ddh.",
          },
          after: {
            type: "string",
            description: "Pagination: records earlier than this bill ID.",
          },
          before: {
            type: "string",
            description: "Pagination: records newer than this bill ID.",
          },
          begin: {
            type: "string",
            description: "Start time in milliseconds.",
          },
          end: {
            type: "string",
            description: "End time in milliseconds.",
          },
          limit: {
            type: "number",
            description: "Number of results. Default 20, max 100.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/bills",
          compactObject({
            instType: readString(args, "instType"),
            ccy: readString(args, "ccy"),
            mgnMode: readString(args, "mgnMode"),
            type: readString(args, "type"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            begin: readString(args, "begin"),
            end: readString(args, "end"),
            limit: readNumber(args, "limit") ?? 20,
          }),
          privateRateLimit("account_get_bills", 6),
        );
        return normalize(response);
      },
    },
    {
      name: "account_get_positions_history",
      module: "account",
      description:
        "Get closed position history for SWAP or FUTURES. " +
        "Default 20 records, max 100. Private endpoint. Rate limit: 1 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SWAP", "FUTURES", "MARGIN", "OPTION"],
            description: "Instrument type filter. Default SWAP.",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter, e.g. BTC-USDT-SWAP.",
          },
          mgnMode: {
            type: "string",
            enum: ["cross", "isolated"],
            description: "Margin mode filter.",
          },
          type: {
            type: "string",
            description: "Close type filter. 1=close long, 2=close short, 3=liquidation long, 4=liquidation short, 5=ADL long, 6=ADL short.",
          },
          posId: {
            type: "string",
            description: "Position ID filter.",
          },
          after: {
            type: "string",
            description: "Pagination: records earlier than this timestamp (ms).",
          },
          before: {
            type: "string",
            description: "Pagination: records newer than this timestamp (ms).",
          },
          limit: {
            type: "number",
            description: "Number of results. Default 20, max 100.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/positions-history",
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
            instId: readString(args, "instId"),
            mgnMode: readString(args, "mgnMode"),
            type: readString(args, "type"),
            posId: readString(args, "posId"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit") ?? 20,
          }),
          privateRateLimit("account_get_positions_history", 1),
        );
        return normalize(response);
      },
    },
    {
      name: "account_get_trade_fee",
      module: "account",
      description:
        "Get maker/taker fee rates for the account. Useful to understand your fee tier before trading. Private endpoint. Rate limit: 5 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SPOT", "MARGIN", "SWAP", "FUTURES", "OPTION"],
            description: "Instrument type to query fee tier for.",
          },
          instId: {
            type: "string",
            description: "Instrument ID for instrument-specific fee. Optional.",
          },
        },
        required: ["instType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/trade-fee",
          compactObject({
            instType: requireString(args, "instType"),
            instId: readString(args, "instId"),
          }),
          privateRateLimit("account_get_trade_fee", 5),
        );
        return normalize(response);
      },
    },
    {
      name: "account_get_config",
      module: "account",
      description:
        "Get account configuration: position mode (net vs hedge), account level, auto-loan settings, etc. Private endpoint. Rate limit: 5 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
      },
      handler: async (_rawArgs, context) => {
        const response = await context.client.privateGet(
          "/api/v5/account/config",
          {},
          privateRateLimit("account_get_config", 5),
        );
        return normalize(response);
      },
    },
    {
      name: "account_get_positions",
      module: "account",
      description:
        "Get current open positions across all instrument types (MARGIN, SWAP, FUTURES, OPTION). " +
        "Use swap_get_positions for SWAP/FUTURES-only queries when the swap module is loaded. " +
        "Private endpoint. Rate limit: 10 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["MARGIN", "SWAP", "FUTURES", "OPTION"],
            description: "Filter by instrument type. Omit to return all open positions.",
          },
          instId: {
            type: "string",
            description: "Instrument ID filter, e.g. BTC-USDT-SWAP. Omit for all instruments.",
          },
          posId: {
            type: "string",
            description: "Position ID filter.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/positions",
          compactObject({
            instType: readString(args, "instType"),
            instId: readString(args, "instId"),
            posId: readString(args, "posId"),
          }),
          privateRateLimit("account_get_positions", 10),
        );
        return normalize(response);
      },
    },
    {
      name: "account_get_bills_archive",
      module: "account",
      description:
        "Get archived account ledger (bills older than 7 days, up to 3 months). " +
        "Use account_get_bills for recent 7-day records. " +
        "Default 20 records, max 100. Private endpoint. Rate limit: 6 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SPOT", "MARGIN", "SWAP", "FUTURES", "OPTION"],
            description: "Filter by instrument type.",
          },
          ccy: {
            type: "string",
            description: "Currency filter, e.g. USDT.",
          },
          mgnMode: {
            type: "string",
            enum: ["isolated", "cross"],
            description: "Margin mode filter.",
          },
          type: {
            type: "string",
            description:
              "Bill type filter. 1=transfer, 2=trade, 3=delivery, 4=auto token convert, 5=liquidation, 6=margin transfer, 7=interest deduction, 8=funding fee, 9=adl, 10=clawback, 11=system token convert, 12=strategy transfer, 13=ddh.",
          },
          after: {
            type: "string",
            description: "Pagination: records earlier than this bill ID.",
          },
          before: {
            type: "string",
            description: "Pagination: records newer than this bill ID.",
          },
          begin: {
            type: "string",
            description: "Start time in milliseconds.",
          },
          end: {
            type: "string",
            description: "End time in milliseconds.",
          },
          limit: {
            type: "number",
            description: "Number of results. Default 20, max 100.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/bills-archive",
          compactObject({
            instType: readString(args, "instType"),
            ccy: readString(args, "ccy"),
            mgnMode: readString(args, "mgnMode"),
            type: readString(args, "type"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            begin: readString(args, "begin"),
            end: readString(args, "end"),
            limit: readNumber(args, "limit") ?? 20,
          }),
          privateRateLimit("account_get_bills_archive", 6),
        );
        return normalize(response);
      },
    },
    {
      name: "account_set_position_mode",
      module: "account",
      description:
        "Switch between net position mode and long/short hedge mode. " +
        "net: one position per instrument (default for most accounts). " +
        "long_short_mode: separate long and short positions. " +
        "[CAUTION] Requires no open positions or pending orders. Private endpoint. Rate limit: 5 req/s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          posMode: {
            type: "string",
            enum: ["long_short_mode", "net_mode"],
            description: "Position mode: 'long_short_mode' for hedge mode, 'net_mode' for one-way mode.",
          },
        },
        required: ["posMode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/account/set-position-mode",
          { posMode: requireString(args, "posMode") },
          privateRateLimit("account_set_position_mode", 5),
        );
        return normalize(response);
      },
    },
  ];
}
