import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { privateRateLimit } from "./common.js";

const BASE = "/api/v5/copytrading";

/** lastDays: "1"=7d, "2"=30d, "3"=90d, "4"=365d */
const LAST_DAYS_30 = "2";

const INST_TYPE_SWAP = "SWAP";
const COPY_MODE_SMART = "smart_copy";
const COPY_MODE_FIXED = "fixed_amount";
const COPY_MODE_RATIO = "ratio_copy";
const COPY_INST_ID_TYPE_COPY = "copy";
const COPY_INST_ID_TYPE_CUSTOM = "custom";
const COPY_MGN_MODE_COPY = "copy";
const COPY_MGN_MODE_ISOLATED = "isolated";
const INST_TYPE_SPOT = "SPOT";
const SUB_POS_CLOSE_COPY = "copy_close";

export function registerCopyTradeTools(): ToolSpec[] {
  return [
    {
      name: "copytrading_get_lead_traders",
      module: "copytrading",
      description:
        "Get top lead traders ranking. Public endpoint, no auth required. Use for: 交易员排行, 带单员推荐, top traders.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: { type: "string", enum: ["SWAP", "SPOT"], description: "Instrument type: SWAP (default) or SPOT." },
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
            instType: readString(args, "instType") ?? INST_TYPE_SWAP,
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
          endpoint: response.endpoint,
          requestTime: response.requestTime,
          dataVer: String(first["dataVer"] ?? ""),
          totalPage: String(first["totalPage"] ?? ""),
          data: (first["ranks"] as unknown[]) ?? [],
        };
      },
    },
    {
      name: "copytrading_get_trader_details",
      module: "copytrading",
      description:
        "Get full profile of a specific lead trader: daily P&L, statistics (win rate, position stats, follower P&L), and preferred trading currencies. All returned together. Public endpoint, no auth required.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string", description: "Lead trader unique code (16 chars)" },
          instType: { type: "string", enum: ["SWAP", "SPOT"], description: "Instrument type: SWAP (default) or SPOT." },
          lastDays: { type: "string", enum: ["1", "2", "3", "4"], description: "Time range for pnl and stats: 1=7d 2=30d 3=90d 4=365d (default: 2)" },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const uniqueCode = requireString(args, "uniqueCode");
        const instType = readString(args, "instType") ?? INST_TYPE_SWAP;
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
          pnl: normalizeResponse(pnlRes).data,
          stats: normalizeResponse(statsRes).data,
          preference: normalizeResponse(preferenceRes).data,
        };
      },
    },
    {
      name: "copytrading_get_my_details",
      module: "copytrading",
      description:
        "Query the lead traders I am currently copying (cumulative P&L per trader). Private. Rate limit: 5/2s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: { type: "string", enum: ["SWAP", "SPOT"], description: "Instrument type: SWAP (default) or SPOT." },
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          `${BASE}/current-lead-traders`,
          compactObject({ instType: readString(args, "instType") ?? INST_TYPE_SWAP }),
          privateRateLimit("copytrading_get_my_details", 5),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "copytrading_set_copytrading",
      module: "copytrading",
      description:
        "Start copy trading a lead trader. copyMode: smart_copy (default), fixed_amount, ratio_copy. [CAUTION] Allocates real funds. Private. Rate limit: 5/2s.",
      isWrite: true,
      inputSchema: {
        type: "object",
        properties: {
          uniqueCode: { type: "string", description: "Lead trader unique code (16 chars)" },
          instType: { type: "string", enum: ["SWAP", "SPOT"], description: "Instrument type: SWAP (default) or SPOT." },
          copyMode: { type: "string", enum: ["smart_copy", "fixed_amount", "ratio_copy"], description: "Copy mode: smart_copy=smart copy, initialAmount+replicationRequired required (default); fixed_amount=fixed USDT per order, copyAmt required; ratio_copy=proportional copy, copyRatio required" },
          copyMgnMode: { type: "string", enum: ["cross", "isolated", "copy"], description: "Margin mode (non-smart_copy only): copy=follow trader (default), isolated, cross. For smart_copy: auto-set by instType (SWAP→copy, SPOT→isolated), user input ignored." },
          copyInstIdType: { type: "string", enum: ["copy", "custom"], description: "copy=follow trader's instruments (default); custom=user-defined (instId required)" },
          instId: { type: "string", description: "Comma-separated instrument IDs, required when copyInstIdType=custom" },
          copyTotalAmt: { type: "string", description: "Max total USDT to allocate for this trader. [REQUIRED when copyMode=fixed_amount or ratio_copy; auto-filled from initialAmount when copyMode=smart_copy]" },
          copyAmt: { type: "string", description: "Fixed USDT per order. [REQUIRED when copyMode=fixed_amount]" },
          copyRatio: { type: "string", description: "Copy ratio (e.g. 0.1 = 10%). [REQUIRED when copyMode=ratio_copy]" },
          initialAmount: { type: "string", description: "Initial investment amount in USDT. [REQUIRED when copyMode=smart_copy; automatically assigned to copyTotalAmt]" },
          replicationRequired: { type: "string", enum: ["0", "1"], description: "Whether to replicate existing positions: 0=no, 1=yes. Only applicable to smart_copy mode." },
          tpRatio: { type: "string", description: "Take-profit ratio per order, e.g. 0.1 = 10%" },
          slRatio: { type: "string", description: "Stop-loss ratio per order, e.g. 0.1 = 10%" },
          subPosCloseType: { type: "string", enum: ["copy_close", "market_close", "manual_close"], description: "How to close sub-positions when you stop copying: copy_close=follow trader (default), market_close=close all immediately, manual_close=keep open" },
          slTotalAmt: { type: "string", description: "Total stop-loss amount (USDT). Auto-stop when net loss reaches this amount" },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const copyMode = readString(args, "copyMode") ?? COPY_MODE_SMART;
        const instType = readString(args, "instType") ?? INST_TYPE_SWAP;
        const copyInstIdType = readString(args, "copyInstIdType") ?? COPY_INST_ID_TYPE_COPY;
        // smart_copy: mgnMode is determined by instType (SWAP→copy, SPOT→isolated)
        const copyMgnMode = copyMode === COPY_MODE_SMART
          ? (instType === INST_TYPE_SPOT ? COPY_MGN_MODE_ISOLATED : COPY_MGN_MODE_COPY)
          : (readString(args, "copyMgnMode") ?? COPY_MGN_MODE_COPY);
        const initialAmount = copyMode === COPY_MODE_SMART
          ? requireString(args, "initialAmount")
          : readString(args, "initialAmount");
        const replicationRequired = copyMode === COPY_MODE_SMART
          ? requireString(args, "replicationRequired")
          : undefined;
        const copyTotalAmt = copyMode === COPY_MODE_SMART
          ? initialAmount
          : requireString(args, "copyTotalAmt");
        const response = await context.client.privatePost(
          `${BASE}/first-copy-settings`,
          compactObject({
            instType,
            uniqueCode: requireString(args, "uniqueCode"),
            copyMode,
            copyMgnMode,
            copyInstIdType,
            instId: copyInstIdType === COPY_INST_ID_TYPE_CUSTOM ? requireString(args, "instId") : readString(args, "instId"),
            copyTotalAmt,
            copyAmt: copyMode === COPY_MODE_FIXED ? requireString(args, "copyAmt") : readString(args, "copyAmt"),
            copyRatio: copyMode === COPY_MODE_RATIO ? requireString(args, "copyRatio") : readString(args, "copyRatio"),
            initialAmount: copyMode === COPY_MODE_SMART ? initialAmount : undefined,
            replicationRequired: copyMode === COPY_MODE_SMART ? replicationRequired : undefined,
            tpRatio: readString(args, "tpRatio"),
            slRatio: readString(args, "slRatio"),
            subPosCloseType: readString(args, "subPosCloseType") ?? SUB_POS_CLOSE_COPY,
            slTotalAmt: readString(args, "slTotalAmt"),
            tag: context.config.sourceTag,
          }),
          privateRateLimit("copytrading_set_copytrading", 5),
        );
        return normalizeResponse(response);
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
          subPosCloseType: { type: "string", enum: ["copy_close", "market_close", "manual_close"], description: "How to handle positions when stopping: copy_close=follow trader (default), market_close=close all immediately, manual_close=keep open" },
          instType: { type: "string", enum: ["SWAP", "SPOT"], description: "Instrument type: SWAP (default) or SPOT." },
        },
        required: ["uniqueCode"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privatePost(
          `${BASE}/stop-copy-trading`,
          compactObject({
            instType: readString(args, "instType") ?? INST_TYPE_SWAP,
            uniqueCode: requireString(args, "uniqueCode"),
            subPosCloseType: readString(args, "subPosCloseType") ?? SUB_POS_CLOSE_COPY,
          }),
          privateRateLimit("copytrading_stop_copy_trader", 5),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
