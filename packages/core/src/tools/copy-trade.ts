import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";

const BASE = "/api/v5/copytrading";

/** lastDays: "1"=7d, "2"=30d, "3"=90d, "4"=365d */
const LAST_DAYS_30 = "2";

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
          sortType: { type: "string", enum: ["overview", "pnl", "aum", "win_ratio", "pnl_ratio", "current_copy_trader_pnl"], description: "Sort by: overview (default), pnl, aum, win_ratio, pnl_ratio, current_copy_trader_pnl" },
          state: { type: "string", enum: ["0", "1"], description: "0=all traders (default), 1=only traders with open slots" },
          minLeadDays: { type: "string", enum: ["1", "2", "3", "4"], description: "Min lead trading days: 1=7d, 2=30d, 3=90d, 4=180d" },
          minAssets: { type: "string", description: "Min trader assets (USDT)" },
          maxAssets: { type: "string", description: "Max trader assets (USDT)" },
          minAum: { type: "string", description: "Min AUM / copy trading scale (USDT)" },
          maxAum: { type: "string", description: "Max AUM / copy trading scale (USDT)" },
          page: { type: "string", description: "Page number for pagination" },
          dataVer: { type: "string", description: "Ranking data version (14-digit, e.g. 20231010182400). Use when paginating to keep consistent results." },
          limit: { type: "number", description: "Max results per page (default 10, max 20)" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          `${BASE}/public-lead-traders`,
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
            sortType: readString(args, "sortType") ?? "overview",
            state: readString(args, "state"),
            minLeadDays: readString(args, "minLeadDays"),
            minAssets: readString(args, "minAssets"),
            maxAssets: readString(args, "maxAssets"),
            minAum: readString(args, "minAum"),
            maxAum: readString(args, "maxAum"),
            page: readString(args, "page"),
            dataVer: readString(args, "dataVer"),
            limit: String(readNumber(args, "limit") ?? 10),
          }),
        );
        const raw = response as unknown as Record<string, unknown>;
        const dataArr = Array.isArray(raw.data) ? raw.data as Record<string, unknown>[] : [];
        const first = dataArr[0] ?? {};
        return {
          endpoint: String(raw.endpoint ?? ""),
          requestTime: String(raw.requestTime ?? ""),
          dataVer: String(first["dataVer"] ?? ""),
          totalPage: String(first["totalPage"] ?? ""),
          data: (first["ranks"] as unknown[]) ?? [],
        };
      },
    },
    {
      name: "copytrading_public_trader_detail",
      module: "copytrading",
      description:
        "Get full profile of a specific lead trader: daily P&L, statistics (win rate, position stats, follower P&L), and preferred trading currencies. All returned together. Public endpoint, no auth required.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string", description: "Lead trader unique code (16 chars)" },
          instType: { type: "string", enum: ["SPOT", "SWAP"] },
          lastDays: { type: "string", enum: ["1", "2", "3", "4"], description: "Time range for pnl and stats: 1=7d 2=30d 3=90d 4=365d (default: 2)" },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const uniqueCode = requireString(args, "uniqueCode");
        const instType = readString(args, "instType") ?? "SWAP";
        const lastDays = readString(args, "lastDays") ?? LAST_DAYS_30;

        const [pnlRes, statsRes, preferenceRes] = await Promise.all([
          context.client.publicGet(
            `${BASE}/public-pnl`,
            compactObject({ uniqueCode, instType, lastDays }),
          ),
          context.client.publicGet(
            `${BASE}/public-stats`,
            compactObject({ uniqueCode, instType, lastDays }),
          ),
          context.client.publicGet(
            `${BASE}/public-preference-currency`,
            compactObject({ uniqueCode, instType }),
          ),
        ]);

        return {
          pnl: normalize(pnlRes).data,
          stats: normalize(statsRes).data,
          preference: normalize(preferenceRes).data,
        };
      },
    },
    {
      name: "copytrading_my_status",
      module: "copytrading",
      description:
        "Query the lead traders I am currently copying (cumulative P&L per trader) and all current open copy-trade sub-positions. Returns traders and subpositions together. Private. Rate limit: 5/2s (traders), 20/2s (subpositions).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: { type: "string", enum: ["SPOT", "SWAP"], description: "SPOT or SWAP. Returns all if omitted for subpositions." },
          instId: { type: "string", description: "Filter sub-positions by instrument ID, e.g. BTC-USDT-SWAP" },
          after: { type: "string", description: "Sub-positions pagination: return records older than this subPosId" },
          before: { type: "string", description: "Sub-positions pagination: return records newer than this subPosId" },
          limit: { type: "string", description: "Sub-positions max results (default 500, max 500)" },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instType = readString(args, "instType");
        const [tradersRes, subposRes] = await Promise.all([
          context.client.privateGet(
            `${BASE}/current-lead-traders`,
            compactObject({ instType: instType ?? "SWAP" }),
            privateRateLimit("copytrading_my_status", 5),
          ),
          context.client.privateGet(
            `${BASE}/current-subpositions`,
            compactObject({
              instType,
              instId: readString(args, "instId"),
              after: readString(args, "after"),
              before: readString(args, "before"),
              limit: readString(args, "limit"),
            }),
            privateRateLimit("copytrading_my_status_subpos", 20),
          ),
        ]);
        return {
          endpoint: tradersRes.endpoint,
          requestTime: tradersRes.requestTime,
          traders: tradersRes.data,
          subpositions: subposRes.data,
        };
      },
    },
    {
      name: "copytrading_set_copy_trading",
      module: "copytrading",
      description:
        "Start copy trading a lead trader for the first time (/first-copy-settings). copyMode=fixed_amount or ratio_copy. [CAUTION] Allocates real funds. Private. Rate limit: 5/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string", description: "Lead trader unique code (16 chars)" },
          instType: { type: "string", enum: ["SPOT", "SWAP"], description: "SWAP (default)" },
          copyMode: { type: "string", enum: ["fixed_amount", "ratio_copy"], description: "fixed_amount=fixed USDT per order (default); ratio_copy=proportional" },
          copyMgnMode: { type: "string", enum: ["cross", "isolated", "copy"], description: "Margin mode: cross/isolated/copy(follow trader). Default: isolated" },
          copyInstIdType: { type: "string", enum: ["copy", "custom"], description: "copy=follow trader's instruments (default); custom=user-defined (instId required)" },
          instId: { type: "string", description: "Comma-separated instrument IDs, required when copyInstIdType=custom" },
          copyTotalAmt: { type: "string", description: "Max total USDT to allocate for this trader" },
          copyAmt: { type: "string", description: "Fixed USDT per order. [REQUIRED when copyMode=fixed_amount, which is the default]" },
          copyRatio: { type: "string", description: "Copy ratio (e.g. 0.1 = 10%). [REQUIRED when copyMode=ratio_copy]" },
          tpRatio: { type: "string", description: "Take-profit ratio per order, e.g. 0.1 = 10%" },
          slRatio: { type: "string", description: "Stop-loss ratio per order, e.g. 0.1 = 10%" },
          subPosCloseType: { type: "string", enum: ["copy_close", "market_close", "manual_close"], description: "How to close sub-positions when you stop copying: copy_close=follow trader (default), market_close=close all immediately, manual_close=keep open" },
          slTotalAmt: { type: "string", description: "Total stop-loss amount (USDT). Auto-stop when net loss reaches this amount" },
        },
        required: ["uniqueCode", "copyTotalAmt"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/first-copy-settings`,
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
            uniqueCode: requireString(args, "uniqueCode"),
            copyMode: readString(args, "copyMode") ?? "fixed_amount",
            copyMgnMode: readString(args, "copyMgnMode") ?? "isolated",
            copyInstIdType: readString(args, "copyInstIdType") ?? "copy",
            instId: readString(args, "instId"),
            copyTotalAmt: requireString(args, "copyTotalAmt"),
            copyAmt: readString(args, "copyAmt"),
            copyRatio: readString(args, "copyRatio"),
            tpRatio: readString(args, "tpRatio"),
            slRatio: readString(args, "slRatio"),
            subPosCloseType: readString(args, "subPosCloseType") ?? "copy_close",
            slTotalAmt: readString(args, "slTotalAmt"),
            tag: context.config.sourceTag,
          }),
          privateRateLimit("copytrading_set_copy_trading", 5),
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
        required: ["uniqueCode", "subPosCloseType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/stop-copy-trading`,
          compactObject({
            instType: readString(args, "instType") ?? "SWAP",
            uniqueCode: requireString(args, "uniqueCode"),
            subPosCloseType: requireString(args, "subPosCloseType"),
          }),
          privateRateLimit("copytrading_stop_copy_trader", 5),
        );
        return normalize(response);
      },
    },
  ];
}
