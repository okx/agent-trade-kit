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

export function registerCopyTradeTools(): ToolSpec[] {
  return [
    {
      name: "copytrading_public_lead_traders",
      module: "copytrading",
      description:
        "Get top lead traders ranking. Public endpoint, no auth required. Use for: 交易员排行, 带单员推荐, top traders.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: { type: "string", enum: ["SPOT", "SWAP"], description: "SWAP (default) or SPOT" },
          sortType: { type: "string", enum: ["overview", "pnl", "aum", "win_ratio", "pnl_ratio"], description: "Sort by: overview (default), pnl, aum, win_ratio" },
          limit: { type: "number", description: "Max results (default 10, max 20)" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/copytrading/public-lead-traders",
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
            sortType: readString(args, "sortType") ?? "overview",
            limit: String(readNumber(args, "limit") ?? 10),
          }),
        );
        const raw = response as unknown as Record<string, unknown>;
        const dataArr = Array.isArray(raw.data) ? raw.data as Record<string, unknown>[] : [];
        const ranks = (dataArr[0]?.["ranks"] as unknown[]) ?? [];
        return { endpoint: String(raw.endpoint ?? ""), requestTime: String(raw.requestTime ?? ""), data: ranks };
      },
    },
    {
      name: "copytrading_current_lead_traders",
      module: "copytrading",
      description: "Get the list of lead traders I am currently copying. Private. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/copytrading/current-lead-traders",
          compactObject({ instType: readString(args, "instType") ?? "SWAP" }),
          privateRateLimit("copytrading_current_lead_traders", 5),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_copy_positions",
      module: "copytrading",
      description: "Get my current copy trade positions (未平仓的跟单仓位). Private. Rate limit: 20/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
          instId: { type: "string", description: "Filter by instrument, e.g. BTC-USDT-SWAP" },
          limit: { type: "number" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/copytrading/current-subpositions",
          compactObject({
            instType: readString(args, "instType"),
            instId: readString(args, "instId"),
            limit: readString(args, "limit"),
          }),
          privateRateLimit("copytrading_copy_positions", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_follow_trader",
      module: "copytrading",
      description:
        "Start copy trading a lead trader for the first time. [CAUTION] Allocates real funds. Private. Rate limit: 5/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string", description: "Lead trader unique code (16 chars)" },
          copyTotalAmt: { type: "string", description: "Max total USDT to allocate for this trader" },
          copyMgnMode: { type: "string", enum: ["cross", "isolated", "copy"], description: "Margin mode (default: isolated)" },
          copyInstIdType: { type: "string", enum: ["copy", "custom"], description: "copy=follow trader's instruments (default)" },
          copyMode: { type: "string", enum: ["fixed_amount", "ratio_copy"], description: "fixed_amount (default) or ratio_copy" },
          copyAmt: { type: "string", description: "Fixed USDT per order (for fixed_amount mode)" },
          copyRatio: { type: "string", description: "Copy ratio (for ratio_copy mode)" },
          subPosCloseType: { type: "string", enum: ["copy_close", "market_close", "manual_close"], description: "How to handle positions when stopping (default: copy_close)" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
        },
        required: ["uniqueCode", "copyTotalAmt", "copyMgnMode", "copyInstIdType", "subPosCloseType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/copytrading/first-copy-settings",
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
            uniqueCode: requireString(args, "uniqueCode"),
            copyMgnMode: readString(args, "copyMgnMode") ?? "isolated",
            copyInstIdType: readString(args, "copyInstIdType") ?? "copy",
            copyMode: readString(args, "copyMode") ?? "fixed_amount",
            copyTotalAmt: requireString(args, "copyTotalAmt"),
            copyAmt: readString(args, "copyAmt"),
            copyRatio: readString(args, "copyRatio"),
            subPosCloseType: readString(args, "subPosCloseType") ?? "copy_close",
          }),
          privateRateLimit("copytrading_follow_trader", 5),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_amend_settings",
      module: "copytrading",
      description: "Update copy trade settings for a lead trader (after first setup). Private. Rate limit: 5/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string" },
          copyTotalAmt: { type: "string" },
          copyMgnMode: { type: "string", enum: ["cross", "isolated", "copy"] },
          copyInstIdType: { type: "string", enum: ["copy", "custom"] },
          copyMode: { type: "string", enum: ["fixed_amount", "ratio_copy"] },
          copyAmt: { type: "string" },
          copyRatio: { type: "string" },
          subPosCloseType: { type: "string", enum: ["copy_close", "market_close", "manual_close"] },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
        },
        required: ["uniqueCode", "copyMgnMode", "copyInstIdType", "subPosCloseType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/copytrading/amend-copy-settings",
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
            uniqueCode: requireString(args, "uniqueCode"),
            copyMgnMode: readString(args, "copyMgnMode") ?? "isolated",
            copyInstIdType: readString(args, "copyInstIdType") ?? "copy",
            copyMode: readString(args, "copyMode"),
            copyTotalAmt: readString(args, "copyTotalAmt"),
            copyAmt: readString(args, "copyAmt"),
            copyRatio: readString(args, "copyRatio"),
            subPosCloseType: readString(args, "subPosCloseType") ?? "copy_close",
          }),
          privateRateLimit("copytrading_amend_settings", 5),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_stop_copy_trader",
      module: "copytrading",
      description:
        "Stop copy trading a lead trader. [CAUTION] Can close all positions. Private. Rate limit: 5/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string", description: "Lead trader unique code" },
          subPosCloseType: { type: "string", enum: ["market_close", "copy_close", "manual_close"], description: "market_close=close all now, copy_close=follow trader, manual_close=keep open" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          "/api/v5/copytrading/stop-copy-trading",
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
            uniqueCode: requireString(args, "uniqueCode"),
            subPosCloseType: readString(args, "subPosCloseType"),
          }),
          privateRateLimit("copytrading_stop_copy_trader", 5),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_copy_settings",
      module: "copytrading",
      description: "Get current copy settings for a specific lead trader. Private. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/copytrading/copy-settings",
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
            uniqueCode: requireString(args, "uniqueCode"),
          }),
          privateRateLimit("copytrading_copy_settings", 5),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_history_positions",
      module: "copytrading",
      description: "Get copy trade history positions (closed, last 3 months). Private. Rate limit: 20/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
          instId: { type: "string" },
          limit: { type: "number" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          "/api/v5/copytrading/subpositions-history",
          compactObject({
            instType: readString(args, "instType"),
            instId: readString(args, "instId"),
            limit: readString(args, "limit"),
          }),
          privateRateLimit("copytrading_history_positions", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_public_lead_trader_pnl",
      module: "copytrading",
      description: "Get a lead trader daily P&L performance. Public endpoint, no auth required. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string", description: "Lead trader unique code (16 chars)" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
          lastDays: { type: "string", enum: ["1", "2", "3", "4"], description: "1=7d 2=30d 3=90d 4=365d" },
        },
        required: ["uniqueCode", "lastDays"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/copytrading/public-pnl",
          compactObject({
            uniqueCode: requireString(args, "uniqueCode"),
            instType: readString(args, "instType") ?? "SWAP",
            lastDays: requireString(args, "lastDays"),
          }),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_public_weekly_pnl",
      module: "copytrading",
      description: "Get a lead trader weekly P&L (last 12 weeks). Public endpoint, no auth required. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/copytrading/public-weekly-pnl",
          compactObject({
            uniqueCode: requireString(args, "uniqueCode"),
            instType: readString(args, "instType") ?? "SWAP",
          }),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_public_stats",
      module: "copytrading",
      description: "Get a lead trader statistics (win rate, avg position, follower P&L). Public endpoint. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
          lastDays: { type: "string", enum: ["1", "2", "3", "4"], description: "1=7d 2=30d 3=90d 4=365d" },
        },
        required: ["uniqueCode", "lastDays"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/copytrading/public-stats",
          compactObject({
            uniqueCode: requireString(args, "uniqueCode"),
            instType: readString(args, "instType") ?? "SWAP",
            lastDays: requireString(args, "lastDays"),
          }),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_public_preference_currency",
      module: "copytrading",
      description: "Get a lead trader preferred trading currencies. Public endpoint. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/copytrading/public-preference-currency",
          compactObject({
            uniqueCode: requireString(args, "uniqueCode"),
            instType: readString(args, "instType") ?? "SWAP",
          }),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_public_current_positions",
      module: "copytrading",
      description: "Get a lead trader current open positions (public view). Public endpoint. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
          limit: { type: "number" },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/copytrading/public-current-subpositions",
          compactObject({
            uniqueCode: requireString(args, "uniqueCode"),
            instType: readString(args, "instType") ?? "SWAP",
            limit: readNumber(args, "limit"),
          }),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_public_history_positions",
      module: "copytrading",
      description: "Get a lead trader closed positions history (public view, last 3 months). Public endpoint. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
          limit: { type: "number" },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/copytrading/public-subpositions-history",
          compactObject({
            uniqueCode: requireString(args, "uniqueCode"),
            instType: readString(args, "instType") ?? "SWAP",
            limit: readNumber(args, "limit"),
          }),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_public_followers",
      module: "copytrading",
      description: "Get a lead trader current followers info. Public endpoint. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
          limit: { type: "number" },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/copytrading/public-copy-traders",
          compactObject({
            uniqueCode: requireString(args, "uniqueCode"),
            instType: readString(args, "instType") ?? "SWAP",
            limit: readNumber(args, "limit"),
          }),
        );
        return normalize(response);
      },
    },
    {
      name: "copytrading_public_config",
      module: "copytrading",
      description: "Get platform copy trading config (min/max amounts and ratios). Public endpoint. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/copytrading/public-config",
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
          }),
        );
        return normalize(response);
      },
    },
  ];
}
