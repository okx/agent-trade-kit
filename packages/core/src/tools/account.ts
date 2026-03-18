// Account management tools (requires auth, mostly read-only).
// Covers balance, positions, leverage, margin mode, and account configuration.
import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";

export function registerAccountTools(): ToolSpec[] {
  return [
    {
      name: "account_get_balance",
      module: "account",
      description:
        "Get account balance for trading account. Returns balances for all currencies or a specific one.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "e.g. BTC or BTC,ETH. Omit for all.",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_transfer",
      module: "account",
      description:
        "Transfer funds between accounts (trading, funding, etc.). [CAUTION] Moves real funds.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "e.g. USDT",
          },
          amt: {
            type: "string",
            description: "Transfer amount",
          },
          from: {
            type: "string",
            description: "Source account: 6=funding, 18=trading (unified)",
          },
          to: {
            type: "string",
            description: "Destination account: 6=funding, 18=trading (unified)",
          },
          type: {
            type: "string",
            description: "0=main account (default), 1=main→sub, 2=sub→main, 3=sub→sub",
          },
          subAcct: {
            type: "string",
            description: "Sub-account name. Required when type=1/2/3",
          },
          clientId: {
            type: "string",
            description: "Client ID (max 32 chars)",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_max_size",
      module: "account",
      description:
        "Get max buy/sell order size for a SWAP/FUTURES instrument given current balance and leverage. Useful before placing orders.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          tdMode: {
            type: "string",
            enum: ["cross", "isolated"],
          },
          px: {
            type: "string",
            description: "Limit order price (omit for market)",
          },
          leverage: {
            type: "string",
            description: "Leverage (defaults to account setting)",
          },
          ccy: {
            type: "string",
            description: "Margin currency. Required for isolated mode.",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_asset_balance",
      module: "account",
      description:
        "Get funding account balance (asset account). Different from account_get_balance which queries the trading account.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "e.g. BTC or BTC,ETH. Omit for all.",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_bills",
      module: "account",
      description:
        "Get account ledger: fees paid, funding charges, realized PnL, transfers, etc. Default 20 records (last 7 days), max 100.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SPOT", "MARGIN", "SWAP", "FUTURES", "OPTION"],
          },
          ccy: {
            type: "string",
            description: "e.g. USDT",
          },
          mgnMode: {
            type: "string",
            enum: ["isolated", "cross"],
          },
          type: {
            type: "string",
            description: "1=transfer,2=trade,3=delivery,4=auto convert,5=liquidation,6=margin transfer,7=interest,8=funding fee,9=adl,10=clawback,11=sys convert,12=strategy transfer,13=ddh",
          },
          after: {
            type: "string",
            description: "Pagination: before this bill ID",
          },
          before: {
            type: "string",
            description: "Pagination: after this bill ID",
          },
          begin: {
            type: "string",
            description: "Start time (ms)",
          },
          end: {
            type: "string",
            description: "End time (ms)",
          },
          limit: {
            type: "number",
            description: "Max results (default 20)",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_positions_history",
      module: "account",
      description:
        "Get closed position history for SWAP or FUTURES. Default 20 records, max 100.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SWAP", "FUTURES", "MARGIN", "OPTION"],
            description: "Default SWAP",
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          mgnMode: {
            type: "string",
            enum: ["cross", "isolated"],
          },
          type: {
            type: "string",
            description: "1=close long,2=close short,3=liq long,4=liq short,5=ADL long,6=ADL short",
          },
          posId: {
            type: "string",
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
            description: "Max results (default 20)",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_trade_fee",
      module: "account",
      description:
        "Get maker/taker fee rates for the account. Useful to understand your fee tier before trading.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SPOT", "MARGIN", "SWAP", "FUTURES", "OPTION"],
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_config",
      module: "account",
      description:
        "Get account configuration: position mode (net vs hedge), account level, auto-loan settings, etc.",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_max_withdrawal",
      module: "account",
      description:
        "Get maximum withdrawable amount for a currency from the trading account. Useful before initiating a transfer or withdrawal.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          ccy: {
            type: "string",
            description: "e.g. USDT or BTC,ETH. Omit for all.",
          },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/account/max-withdrawal",
          compactObject({ ccy: readString(args, "ccy") }),
          privateRateLimit("account_get_max_withdrawal", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_max_avail_size",
      module: "account",
      description:
        "Get maximum available size for opening or reducing a position. Different from account_get_max_size which calculates new order size.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP or BTC-USDT",
          },
          tdMode: {
            type: "string",
            enum: ["cross", "isolated", "cash"],
            description: "cash=spot",
          },
          ccy: {
            type: "string",
            description: "Margin currency. Required for isolated MARGIN mode.",
          },
          reduceOnly: {
            type: "boolean",
            description: "true=calculate max size for closing position",
          },
        },
        required: ["instId", "tdMode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const reduceOnly = readBoolean(args, "reduceOnly");
        const response = await context.client.privateGet(
          "/api/v5/account/max-avail-size",
          compactObject({
            instId: requireString(args, "instId"),
            tdMode: requireString(args, "tdMode"),
            ccy: readString(args, "ccy"),
            reduceOnly: reduceOnly !== undefined ? String(reduceOnly) : undefined,
          }),
          privateRateLimit("account_get_max_avail_size", 20),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_positions",
      module: "account",
      description:
        "Get current open positions across all instrument types (MARGIN, SWAP, FUTURES, OPTION). Use swap_get_positions for SWAP/FUTURES-only queries.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["MARGIN", "SWAP", "FUTURES", "OPTION"],
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          posId: {
            type: "string",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_get_bills_archive",
      module: "account",
      description:
        "Get archived account ledger (bills older than 7 days, up to 3 months). Use account_get_bills for recent 7-day records. Default 20 records, max 100.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SPOT", "MARGIN", "SWAP", "FUTURES", "OPTION"],
          },
          ccy: {
            type: "string",
            description: "e.g. USDT",
          },
          mgnMode: {
            type: "string",
            enum: ["isolated", "cross"],
          },
          type: {
            type: "string",
            description: "1=transfer,2=trade,3=delivery,4=auto convert,5=liquidation,6=margin transfer,7=interest,8=funding fee,9=adl,10=clawback,11=sys convert,12=strategy transfer,13=ddh",
          },
          after: {
            type: "string",
            description: "Pagination: before this bill ID",
          },
          before: {
            type: "string",
            description: "Pagination: after this bill ID",
          },
          begin: {
            type: "string",
            description: "Start time (ms)",
          },
          end: {
            type: "string",
            description: "End time (ms)",
          },
          limit: {
            type: "number",
            description: "Max results (default 20)",
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
        return normalizeResponse(response);
      },
    },
    {
      name: "account_set_position_mode",
      module: "account",
      description:
        "Switch between net position mode and long/short hedge mode. " +
        "net: one position per instrument (default). long_short_mode: separate long and short positions. " +
        "[CAUTION] Requires no open positions or pending orders.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          posMode: {
            type: "string",
            enum: ["long_short_mode", "net_mode"],
            description: "long_short_mode=hedge; net_mode=one-way",
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
        return normalizeResponse(response);
      },
    },
  ];
}
