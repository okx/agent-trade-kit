import { createRequire } from "node:module";
import { OkxRestClient, toToolErrorPayload, checkForUpdates, createToolRunner, allToolSpecs } from "@agent-tradekit/core";
import type { ToolRunner } from "@agent-tradekit/core";

declare const __GIT_HASH__: string;

const _require = createRequire(import.meta.url);
const CLI_VERSION = (_require("../package.json") as { version: string }).version;
const GIT_HASH: string = typeof __GIT_HASH__ !== "undefined" ? __GIT_HASH__ : "dev";
import { cmdDiagnose } from "./commands/diagnose.js";
import { loadProfileConfig } from "./config/loader.js";
import { printHelp } from "./help.js";
import { parseCli } from "./parser.js";
import type { CliValues } from "./parser.js";
import {
  cmdMarketTicker,
  cmdMarketTickers,
  cmdMarketOrderbook,
  cmdMarketCandles,
  cmdMarketInstruments,
  cmdMarketFundingRate,
  cmdMarketMarkPrice,
  cmdMarketTrades,
  cmdMarketIndexTicker,
  cmdMarketIndexCandles,
  cmdMarketPriceLimit,
  cmdMarketOpenInterest,
  cmdMarketStockTokens,
  cmdMarketIndicator,
} from "./commands/market.js";
import {
  cmdAccountBalance,
  cmdAccountAssetBalance,
  cmdAccountPositions,
  cmdAccountBills,
  cmdAccountFees,
  cmdAccountConfig,
  cmdAccountSetPositionMode,
  cmdAccountMaxSize,
  cmdAccountMaxAvailSize,
  cmdAccountMaxWithdrawal,
  cmdAccountPositionsHistory,
  cmdAccountTransfer,
  cmdAccountAudit,
} from "./commands/account.js";
import {
  cmdSpotOrders,
  cmdSpotPlace,
  cmdSpotCancel,
  cmdSpotFills,
  cmdSpotGet,
  cmdSpotAmend,
  cmdSpotAlgoPlace,
  cmdSpotAlgoAmend,
  cmdSpotAlgoCancel,
  cmdSpotAlgoOrders,
  cmdSpotAlgoTrailPlace,
  cmdSpotBatch,
} from "./commands/spot.js";
import {
  cmdSwapPositions,
  cmdSwapOrders,
  cmdSwapPlace,
  cmdSwapCancel,
  cmdSwapFills,
  cmdSwapGet,
  cmdSwapClose,
  cmdSwapGetLeverage,
  cmdSwapSetLeverage,
  cmdSwapAlgoPlace,
  cmdSwapAlgoAmend,
  cmdSwapAlgoCancel,
  cmdSwapAlgoOrders,
  cmdSwapAlgoTrailPlace,
  cmdSwapAmend,
  cmdSwapBatch,
} from "./commands/swap.js";
import {
  cmdFuturesOrders,
  cmdFuturesPositions,
  cmdFuturesFills,
  cmdFuturesPlace,
  cmdFuturesCancel,
  cmdFuturesGet,
  cmdFuturesAmend,
  cmdFuturesAlgoPlace,
  cmdFuturesAlgoAmend,
  cmdFuturesAlgoCancel,
  cmdFuturesAlgoOrders,
  cmdFuturesAlgoTrailPlace,
  cmdFuturesBatch,
  cmdFuturesClose,
  cmdFuturesGetLeverage,
  cmdFuturesSetLeverage,
} from "./commands/futures.js";
import {
  cmdOptionOrders,
  cmdOptionGet,
  cmdOptionPositions,
  cmdOptionFills,
  cmdOptionInstruments,
  cmdOptionGreeks,
  cmdOptionPlace,
  cmdOptionCancel,
  cmdOptionAmend,
  cmdOptionBatchCancel,
  cmdOptionAlgoPlace,
  cmdOptionAlgoAmend,
  cmdOptionAlgoCancel,
  cmdOptionAlgoOrders,
} from "./commands/option.js";
import { cmdConfigShow, cmdConfigSet, cmdConfigInit, cmdConfigAddProfile, cmdConfigListProfile, cmdConfigUse } from "./commands/config.js";
import type { Lang } from "./commands/config.js";
import {
  cmdSetupClients,
  cmdSetupClient,
  printSetupUsage,
  SUPPORTED_CLIENTS,
} from "./commands/client-setup.js";
import type { ClientId } from "./commands/client-setup.js";
import {
  cmdEarnSavingsBalance,
  cmdEarnSavingsPurchase,
  cmdEarnSavingsRedeem,
  cmdEarnSetLendingRate,
  cmdEarnLendingHistory,
  cmdEarnLendingRateHistory,
} from "./commands/earn.js";
import {
  cmdAutoEarnStatus,
  cmdAutoEarnOn,
  cmdAutoEarnOff,
} from "./commands/auto-earn.js";
import {
  cmdGridOrders,
  cmdGridDetails,
  cmdGridSubOrders,
  cmdGridCreate,
  cmdGridStop,
  cmdDcaCreate,
  cmdDcaStop,
  cmdDcaOrders,
  cmdDcaDetails,
  cmdDcaSubOrders,
} from "./commands/bot.js";
import {
  cmdOnchainEarnOffers,
  cmdOnchainEarnPurchase,
  cmdOnchainEarnRedeem,
  cmdOnchainEarnCancel,
  cmdOnchainEarnActiveOrders,
  cmdOnchainEarnOrderHistory,
} from "./commands/onchain-earn.js";
import {
  cmdDcdPairs,
  cmdDcdProducts,
  cmdDcdRedeemExecute,
  cmdDcdOrderState,
  cmdDcdOrders,
  cmdDcdQuoteAndBuy,
} from "./commands/dcd.js";
import { markFailedIfSCodeError, output, outputLine, errorOutput, errorLine, setOutput } from "./formatter.js";

// Re-export for tests and external consumers
export { printHelp } from "./help.js";
export type { CliValues } from "./parser.js";

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

export function handleConfigCommand(action: string, rest: string[], json: boolean, lang?: string, force?: boolean): Promise<void> | void {
  if (action === "init") return cmdConfigInit((lang === "zh" ? "zh" : "en") as Lang);
  if (action === "show") return cmdConfigShow(json);
  if (action === "set") return cmdConfigSet(rest[0], rest[1]);
  if (action === "setup-clients") return cmdSetupClients();
  if (action === "add-profile") return cmdConfigAddProfile(rest, force ?? false);
  if (action === "list-profile") return cmdConfigListProfile();
  if (action === "use") return cmdConfigUse(rest[0]);
  errorLine(`Unknown config command: ${action}`);
  process.exitCode = 1;
}

export function handleSetupCommand(v: CliValues): void {
  if (!v.client) {
    printSetupUsage();
    return;
  }
  if (!SUPPORTED_CLIENTS.includes(v.client as ClientId)) {
    errorLine(`Unknown client: "${v.client}"`);
    errorLine(`Supported: ${SUPPORTED_CLIENTS.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  cmdSetupClient({
    client: v.client as ClientId,
    profile: v.profile,
    modules: v.modules,
  });
}

export function handleMarketPublicCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "ticker") return cmdMarketTicker(run, rest[0], json);
  if (action === "tickers") return cmdMarketTickers(run, rest[0], json);
  if (action === "instruments")
    return cmdMarketInstruments(run, { instType: v.instType!, instId: v.instId, json });
  if (action === "mark-price")
    return cmdMarketMarkPrice(run, { instType: v.instType!, instId: v.instId, json });
  if (action === "index-ticker")
    return cmdMarketIndexTicker(run, { instId: v.instId, quoteCcy: v.quoteCcy, json });
  if (action === "price-limit") return cmdMarketPriceLimit(run, rest[0], json);
  if (action === "open-interest")
    return cmdMarketOpenInterest(run, { instType: v.instType!, instId: v.instId, json });
  if (action === "stock-tokens")
    return cmdMarketStockTokens(run, { instType: v.instType, instId: v.instId, json });
  if (action === "indicator") {
    const limit = v.limit !== undefined ? Number(v.limit) : undefined;
    const backtestTime = v["backtest-time"] !== undefined ? Number(v["backtest-time"]) : undefined;
    return cmdMarketIndicator(run, rest[0], rest[1], {
      bar: v.bar,
      params: v.params,
      list: v.list,
      limit,
      backtestTime,
      json,
    });
  }
}

export function handleMarketDataCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  const limit = v.limit !== undefined ? Number(v.limit) : undefined;
  if (action === "orderbook")
    return cmdMarketOrderbook(run, rest[0], v.sz !== undefined ? Number(v.sz) : undefined, json);
  if (action === "candles")
    return cmdMarketCandles(run, rest[0], { bar: v.bar, limit, json });
  if (action === "funding-rate")
    return cmdMarketFundingRate(run, rest[0], { history: v.history ?? false, limit, json });
  if (action === "trades")
    return cmdMarketTrades(run, rest[0], { limit, json });
  if (action === "index-candles")
    return cmdMarketIndexCandles(run, rest[0], { bar: v.bar, limit, history: v.history ?? false, json });
}

export function handleMarketCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  return (
    handleMarketPublicCommand(run, action, rest, v, json) ??
    handleMarketDataCommand(run, action, rest, v, json)
  );
}

export function handleAccountWriteCommand(
  run: ToolRunner,
  action: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "set-position-mode")
    return cmdAccountSetPositionMode(run, v.posMode!, json);
  if (action === "max-size")
    return cmdAccountMaxSize(run, { instId: v.instId!, tdMode: v.tdMode!, px: v.px, json });
  if (action === "max-avail-size")
    return cmdAccountMaxAvailSize(run, { instId: v.instId!, tdMode: v.tdMode!, json });
  if (action === "max-withdrawal") return cmdAccountMaxWithdrawal(run, v.ccy, json);
  if (action === "transfer")
    return cmdAccountTransfer(run, {
      ccy: v.ccy!,
      amt: v.amt!,
      from: v.from!,
      to: v.to!,
      transferType: v.transferType,
      subAcct: v.subAcct,
      json,
    });
}

function handleAccountCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "audit")
    return cmdAccountAudit({ limit: v.limit, tool: v.tool, since: v.since, json });
  const limit = v.limit !== undefined ? Number(v.limit) : undefined;
  if (action === "balance") return cmdAccountBalance(run, rest[0], json);
  if (action === "asset-balance") return cmdAccountAssetBalance(run, v.ccy, json);
  if (action === "positions")
    return cmdAccountPositions(run, { instType: v.instType, instId: v.instId, json });
  if (action === "positions-history")
    return cmdAccountPositionsHistory(run, {
      instType: v.instType,
      instId: v.instId,
      limit,
      json,
    });
  if (action === "bills")
    return cmdAccountBills(run, {
      archive: v.archive ?? false,
      instType: v.instType,
      ccy: v.ccy,
      limit,
      json,
    });
  if (action === "fees")
    return cmdAccountFees(run, { instType: v.instType!, instId: v.instId, json });
  if (action === "config") return cmdAccountConfig(run, json);
  return handleAccountWriteCommand(run, action, v, json);
}

export function handleSpotAlgoCommand(
  run: ToolRunner,
  subAction: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (subAction === "trail")
    return cmdSpotAlgoTrailPlace(run, {
      instId: v.instId!,
      side: v.side!,
      sz: v.sz!,
      callbackRatio: v.callbackRatio,
      callbackSpread: v.callbackSpread,
      activePx: v.activePx,
      tdMode: v.tdMode,
      json,
    });
  if (subAction === "place")
    return cmdSpotAlgoPlace(run, {
      instId: v.instId!,
      tdMode: v.tdMode,
      side: v.side!,
      ordType: v.ordType ?? "conditional",
      sz: v.sz!,
      tgtCcy: v.tgtCcy,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      callbackRatio: v.callbackRatio,
      callbackSpread: v.callbackSpread,
      activePx: v.activePx,
      json,
    });
  if (subAction === "amend")
    return cmdSpotAlgoAmend(run, {
      instId: v.instId!,
      algoId: v.algoId!,
      newSz: v.newSz,
      newTpTriggerPx: v.newTpTriggerPx,
      newTpOrdPx: v.newTpOrdPx,
      newSlTriggerPx: v.newSlTriggerPx,
      newSlOrdPx: v.newSlOrdPx,
      json,
    });
  if (subAction === "cancel")
    return cmdSpotAlgoCancel(run, v.instId!, v.algoId!, json);
  if (subAction === "orders")
    return cmdSpotAlgoOrders(run, {
      instId: v.instId,
      status: v.history ? "history" : "pending",
      ordType: v.ordType,
      json,
    });
}

export function handleSpotCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "orders")
    return cmdSpotOrders(run, {
      instId: v.instId,
      status: v.history ? "history" : "open",
      json,
    });
  if (action === "get")
    return cmdSpotGet(run, { instId: v.instId!, ordId: v.ordId, clOrdId: v.clOrdId, json });
  if (action === "fills")
    return cmdSpotFills(run, { instId: v.instId, ordId: v.ordId, json });
  if (action === "amend")
    return cmdSpotAmend(run, {
      instId: v.instId!,
      ordId: v.ordId,
      clOrdId: v.clOrdId,
      newSz: v.newSz,
      newPx: v.newPx,
      json,
    });
  if (action === "place")
    return cmdSpotPlace(run, {
      instId: v.instId!,
      tdMode: v.tdMode,
      side: v.side!,
      ordType: v.ordType!,
      sz: v.sz!,
      tgtCcy: v.tgtCcy,
      px: v.px,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      json,
    });
  if (action === "cancel")
    return cmdSpotCancel(run, { instId: (v.instId ?? rest[0])!, ordId: v.ordId, clOrdId: v.clOrdId, json });
  if (action === "algo")
    return handleSpotAlgoCommand(run, rest[0], v, json);
  if (action === "batch")
    return cmdSpotBatch(run, { action: v.action!, orders: v.orders!, json });
}

export function handleSwapAlgoCommand(
  run: ToolRunner,
  subAction: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (subAction === "trail")
    return cmdSwapAlgoTrailPlace(run, {
      instId: v.instId!,
      side: v.side!,
      sz: v.sz!,
      callbackRatio: v.callbackRatio,
      callbackSpread: v.callbackSpread,
      activePx: v.activePx,
      posSide: v.posSide,
      tdMode: v.tdMode ?? "cross",
      reduceOnly: v.reduceOnly,
      json,
    });
  if (subAction === "place")
    return cmdSwapAlgoPlace(run, {
      instId: v.instId!,
      side: v.side!,
      ordType: v.ordType ?? "conditional",
      sz: v.sz!,
      posSide: v.posSide,
      tdMode: v.tdMode ?? "cross",
      tgtCcy: v.tgtCcy,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      reduceOnly: v.reduceOnly,
      callbackRatio: v.callbackRatio,
      callbackSpread: v.callbackSpread,
      activePx: v.activePx,
      json,
    });
  if (subAction === "amend")
    return cmdSwapAlgoAmend(run, {
      instId: v.instId!,
      algoId: v.algoId!,
      newSz: v.newSz,
      newTpTriggerPx: v.newTpTriggerPx,
      newTpOrdPx: v.newTpOrdPx,
      newSlTriggerPx: v.newSlTriggerPx,
      newSlOrdPx: v.newSlOrdPx,
      json,
    });
  if (subAction === "cancel")
    return cmdSwapAlgoCancel(run, v.instId!, v.algoId!, json);
  if (subAction === "orders")
    return cmdSwapAlgoOrders(run, {
      instId: v.instId,
      status: v.history ? "history" : "pending",
      ordType: v.ordType,
      json,
    });
}

function handleSwapQuery(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void | undefined {
  if (action === "positions")
    return cmdSwapPositions(run, v.instId ?? rest[0], json);
  if (action === "orders")
    return cmdSwapOrders(run, {
      instId: v.instId,
      status: v.history ? "history" : "open",
      json,
    });
  if (action === "get")
    return cmdSwapGet(run, { instId: v.instId!, ordId: v.ordId, clOrdId: v.clOrdId, json });
  if (action === "fills")
    return cmdSwapFills(run, {
      instId: v.instId,
      ordId: v.ordId,
      archive: v.archive ?? false,
      json,
    });
  if (action === "get-leverage")
    return cmdSwapGetLeverage(run, { instId: v.instId!, mgnMode: v.mgnMode!, json });
  return undefined;
}

export function handleSwapCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  const queryResult = handleSwapQuery(run, action, rest, v, json);
  if (queryResult !== undefined) return queryResult;
  if (action === "close")
    return cmdSwapClose(run, {
      instId: v.instId!,
      mgnMode: v.mgnMode!,
      posSide: v.posSide,
      autoCxl: v.autoCxl,
      json,
    });
  if (action === "place")
    return cmdSwapPlace(run, {
      instId: v.instId!,
      side: v.side!,
      ordType: v.ordType!,
      sz: v.sz!,
      posSide: v.posSide,
      px: v.px,
      tdMode: v.tdMode ?? "cross",
      tgtCcy: v.tgtCcy,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      json,
    });
  if (action === "cancel")
    return cmdSwapCancel(run, { instId: (v.instId ?? rest[0])!, ordId: v.ordId, clOrdId: v.clOrdId, json });
  if (action === "amend")
    return cmdSwapAmend(run, {
      instId: v.instId!,
      ordId: v.ordId,
      clOrdId: v.clOrdId,
      newSz: v.newSz,
      newPx: v.newPx,
      json,
    });
  if (action === "leverage")
    return cmdSwapSetLeverage(run, {
      instId: v.instId!,
      lever: v.lever!,
      mgnMode: v.mgnMode!,
      posSide: v.posSide,
      json,
    });
  if (action === "algo")
    return handleSwapAlgoCommand(run, rest[0], v, json);
  if (action === "batch")
    return cmdSwapBatch(run, { action: v.action!, orders: v.orders!, json });
}

export function handleOptionAlgoCommand(
  run: ToolRunner,
  subAction: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (subAction === "place")
    return cmdOptionAlgoPlace(run, {
      instId: v.instId!,
      tdMode: v.tdMode!,
      side: v.side!,
      ordType: v.ordType ?? "conditional",
      sz: v.sz!,
      tgtCcy: v.tgtCcy,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      reduceOnly: v.reduceOnly,
      clOrdId: v.clOrdId,
      json,
    });
  if (subAction === "amend")
    return cmdOptionAlgoAmend(run, {
      instId: v.instId!,
      algoId: v.algoId!,
      newSz: v.newSz,
      newTpTriggerPx: v.newTpTriggerPx,
      newTpOrdPx: v.newTpOrdPx,
      newSlTriggerPx: v.newSlTriggerPx,
      newSlOrdPx: v.newSlOrdPx,
      json,
    });
  if (subAction === "cancel")
    return cmdOptionAlgoCancel(run, { instId: v.instId!, algoId: v.algoId!, json });
  if (subAction === "orders")
    return cmdOptionAlgoOrders(run, {
      instId: v.instId,
      status: v.history ? "history" : "pending",
      ordType: v.ordType,
      json,
    });
}

export function handleOptionCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "orders") {
    let status: "live" | "history" | "archive" = "live";
    if (v.archive) status = "archive";
    else if (v.history) status = "history";
    return cmdOptionOrders(run, { instId: v.instId, uly: v.uly, status, json });
  }
  if (action === "get")
    return cmdOptionGet(run, { instId: v.instId!, ordId: v.ordId, clOrdId: v.clOrdId, json });
  if (action === "positions")
    return cmdOptionPositions(run, { instId: v.instId, uly: v.uly, json });
  if (action === "fills")
    return cmdOptionFills(run, { instId: v.instId, ordId: v.ordId, archive: v.archive ?? false, json });
  if (action === "instruments")
    return cmdOptionInstruments(run, { uly: v.uly!, expTime: v.expTime, json });
  if (action === "greeks")
    return cmdOptionGreeks(run, { uly: v.uly!, expTime: v.expTime, json });
  if (action === "place")
    return cmdOptionPlace(run, {
      instId: v.instId!,
      tdMode: v.tdMode!,
      side: v.side!,
      ordType: v.ordType!,
      sz: v.sz!,
      px: v.px,
      reduceOnly: v.reduceOnly,
      clOrdId: v.clOrdId,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      json,
    });
  if (action === "cancel")
    return cmdOptionCancel(run, { instId: v.instId!, ordId: v.ordId, clOrdId: v.clOrdId, json });
  if (action === "amend")
    return cmdOptionAmend(run, {
      instId: v.instId!,
      ordId: v.ordId,
      clOrdId: v.clOrdId,
      newSz: v.newSz,
      newPx: v.newPx,
      json,
    });
  if (action === "batch-cancel")
    return cmdOptionBatchCancel(run, { orders: v.orders!, json });
  if (action === "algo")
    return handleOptionAlgoCommand(run, rest[0], v, json);
}

export function handleFuturesAlgoCommand(
  run: ToolRunner,
  subAction: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (subAction === "trail")
    return cmdFuturesAlgoTrailPlace(run, {
      instId: v.instId!,
      side: v.side!,
      sz: v.sz!,
      callbackRatio: v.callbackRatio,
      callbackSpread: v.callbackSpread,
      activePx: v.activePx,
      posSide: v.posSide,
      tdMode: v.tdMode ?? "cross",
      reduceOnly: v.reduceOnly,
      json,
    });
  if (subAction === "place")
    return cmdFuturesAlgoPlace(run, {
      instId: v.instId!,
      side: v.side!,
      ordType: v.ordType ?? "conditional",
      sz: v.sz!,
      posSide: v.posSide,
      tdMode: v.tdMode ?? "cross",
      tgtCcy: v.tgtCcy,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      reduceOnly: v.reduceOnly,
      callbackRatio: v.callbackRatio,
      callbackSpread: v.callbackSpread,
      activePx: v.activePx,
      json,
    });
  if (subAction === "amend")
    return cmdFuturesAlgoAmend(run, {
      instId: v.instId!,
      algoId: v.algoId!,
      newSz: v.newSz,
      newTpTriggerPx: v.newTpTriggerPx,
      newTpOrdPx: v.newTpOrdPx,
      newSlTriggerPx: v.newSlTriggerPx,
      newSlOrdPx: v.newSlOrdPx,
      json,
    });
  if (subAction === "cancel")
    return cmdFuturesAlgoCancel(run, v.instId!, v.algoId!, json);
  if (subAction === "orders")
    return cmdFuturesAlgoOrders(run, {
      instId: v.instId,
      status: v.history ? "history" : "pending",
      ordType: v.ordType,
      json,
    });
}

function resolveFuturesOrdersStatus(v: CliValues): "archive" | "history" | "open" {
  if (v.archive) return "archive";
  if (v.history) return "history";
  return "open";
}

function handleFuturesQuery(
  run: ToolRunner,
  action: string,
  v: CliValues,
  json: boolean
): Promise<void> | void | undefined {
  if (action === "orders")
    return cmdFuturesOrders(run, { instId: v.instId, status: resolveFuturesOrdersStatus(v), json });
  if (action === "positions") return cmdFuturesPositions(run, v.instId, json);
  if (action === "fills")
    return cmdFuturesFills(run, {
      instId: v.instId,
      ordId: v.ordId,
      archive: v.archive ?? false,
      json,
    });
  if (action === "get")
    return cmdFuturesGet(run, { instId: v.instId!, ordId: v.ordId, json });
  if (action === "get-leverage")
    return cmdFuturesGetLeverage(run, { instId: v.instId!, mgnMode: v.mgnMode!, json });
  return undefined;
}

export function handleFuturesCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  const queryResult = handleFuturesQuery(run, action, v, json);
  if (queryResult !== undefined) return queryResult;
  if (action === "place")
    return cmdFuturesPlace(run, {
      instId: v.instId!,
      side: v.side!,
      ordType: v.ordType!,
      sz: v.sz!,
      tdMode: v.tdMode ?? "cross",
      tgtCcy: v.tgtCcy,
      posSide: v.posSide,
      px: v.px,
      reduceOnly: v.reduceOnly,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      json,
    });
  if (action === "cancel")
    return cmdFuturesCancel(run, { instId: (v.instId ?? rest[0])!, ordId: v.ordId, clOrdId: v.clOrdId, json });
  if (action === "amend")
    return cmdFuturesAmend(run, {
      instId: v.instId!,
      ordId: v.ordId,
      clOrdId: v.clOrdId,
      newSz: v.newSz,
      newPx: v.newPx,
      json,
    });
  if (action === "close")
    return cmdFuturesClose(run, {
      instId: v.instId!,
      mgnMode: v.mgnMode!,
      posSide: v.posSide,
      autoCxl: v.autoCxl,
      json,
    });
  if (action === "leverage")
    return cmdFuturesSetLeverage(run, {
      instId: v.instId!,
      lever: v.lever!,
      mgnMode: v.mgnMode!,
      posSide: v.posSide,
      json,
    });
  if (action === "batch")
    return cmdFuturesBatch(run, { action: v.action!, orders: v.orders!, json });
  if (action === "algo")
    return handleFuturesAlgoCommand(run, rest[0], v, json);
}

export function handleBotGridCommand(
  run: ToolRunner,
  v: CliValues,
  rest: string[],
  json: boolean
): Promise<void> | void {
  const subAction = rest[0];
  if (subAction === "orders")
    return cmdGridOrders(run, {
      algoOrdType: v.algoOrdType!,
      instId: v.instId,
      algoId: v.algoId,
      status: v.history ? "history" : "active",
      json,
    });
  if (subAction === "details")
    return cmdGridDetails(run, {
      algoOrdType: v.algoOrdType!,
      algoId: v.algoId!,
      json,
    });
  if (subAction === "sub-orders")
    return cmdGridSubOrders(run, {
      algoOrdType: v.algoOrdType!,
      algoId: v.algoId!,
      type: v.live ? "live" : "filled",
      json,
    });
  if (subAction === "create")
    return cmdGridCreate(run, {
      instId: v.instId!,
      algoOrdType: v.algoOrdType!,
      maxPx: v.maxPx!,
      minPx: v.minPx!,
      gridNum: v.gridNum!,
      runType: v.runType,
      quoteSz: v.quoteSz,
      baseSz: v.baseSz,
      direction: v.direction,
      lever: v.lever,
      sz: v.sz,
      basePos: v.basePos,
      tpTriggerPx: v.tpTriggerPx,
      slTriggerPx: v.slTriggerPx,
      tpRatio: v.tpRatio,
      slRatio: v.slRatio,
      algoClOrdId: v.algoClOrdId,
      json,
    });
  if (subAction === "stop")
    return cmdGridStop(run, {
      algoId: v.algoId!,
      algoOrdType: v.algoOrdType!,
      instId: v.instId!,
      stopType: v.stopType,
      json,
    });
}

export function handleBotDcaCommand(
  run: ToolRunner,
  subAction: string,
  v: CliValues,
  json: boolean,
): Promise<void> | void {
  // CLI backward compatibility: default algoOrdType to contract_dca if not provided
  const algoOrdType = v.algoOrdType ?? "contract_dca";

  if (subAction === "orders")
    return cmdDcaOrders(run, { algoOrdType, algoId: v.algoId, instId: v.instId, history: v.history ?? false, json });
  if (subAction === "details")
    return cmdDcaDetails(run, { algoId: v.algoId!, algoOrdType, json });
  if (subAction === "sub-orders")
    return cmdDcaSubOrders(run, { algoId: v.algoId!, algoOrdType, cycleId: v.cycleId, json });
  if (subAction === "create")
    return cmdDcaCreate(run, {
      instId: v.instId!,
      algoOrdType,
      lever: v.lever,
      direction: v.direction!,
      initOrdAmt: v.initOrdAmt!,
      maxSafetyOrds: v.maxSafetyOrds!,
      tpPct: v.tpPct!,
      safetyOrdAmt: v.safetyOrdAmt,
      pxSteps: v.pxSteps,
      pxStepsMult: v.pxStepsMult,
      volMult: v.volMult,
      slPct: v.slPct,
      slMode: v.slMode,
      allowReinvest: v.allowReinvest,
      triggerStrategy: v.triggerStrategy,
      triggerPx: v.triggerPx,
      triggerCond: v.triggerCond,
      thold: v.thold,
      timeframe: v.timeframe,
      timePeriod: v.timePeriod,
      algoClOrdId: v.algoClOrdId,
      reserveFunds: v.reserveFunds,
      tradeQuoteCcy: v.tradeQuoteCcy,
      json,
    });
  if (subAction === "stop")
    return cmdDcaStop(run, { algoId: v.algoId!, algoOrdType, stopType: v.stopType, json });
}

export function handleBotCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "grid") return handleBotGridCommand(run, v, rest, json);
  if (action === "dca") return handleBotDcaCommand(run, rest[0], v, json);
}

export function handleEarnCommand(
  run: ToolRunner,
  submodule: string,
  rest: string[],
  v: CliValues,
  json: boolean,
): Promise<void> | void {
  const action = rest[0];
  const innerRest = rest.slice(1);
  if (submodule === "savings") return handleEarnSavingsCommand(run, action, innerRest, v, json);
  if (submodule === "onchain") return handleEarnOnchainCommand(run, action, v, json);
  if (submodule === "dcd") return handleEarnDcdCommand(run, action, v, json);
  if (submodule === "auto-earn") return handleEarnAutoEarnCommand(run, action, innerRest, v, json);
  errorLine(`Unknown earn sub-module: ${submodule}`);
  errorLine("Valid: savings, onchain, dcd, auto-earn");
  process.exitCode = 1;
}

function handleEarnAutoEarnCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean,
): Promise<void> | void {
  const ccy = rest[0] ?? v.ccy;
  if (action === "status") return cmdAutoEarnStatus(run, ccy, json);
  if (action === "on") {
    if (!ccy) { errorLine("Currency required: okx earn auto-earn on <ccy>"); process.exitCode = 1; return; }
    return cmdAutoEarnOn(run, ccy, json);
  }
  if (action === "off") {
    if (!ccy) { errorLine("Currency required: okx earn auto-earn off <ccy>"); process.exitCode = 1; return; }
    return cmdAutoEarnOff(run, ccy, json);
  }
  errorLine(`Unknown auto-earn command: ${action}`);
  errorLine("Valid: status, on, off");
  process.exitCode = 1;
}

function handleEarnSavingsCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  const limit = v.limit !== undefined ? Number(v.limit) : undefined;
  if (action === "balance") return cmdEarnSavingsBalance(run, rest[0] ?? v.ccy, json);
  if (action === "purchase") return cmdEarnSavingsPurchase(run, { ccy: v.ccy!, amt: v.amt!, rate: v.rate, json });
  if (action === "redeem") return cmdEarnSavingsRedeem(run, { ccy: v.ccy!, amt: v.amt!, json });
  if (action === "set-rate") return cmdEarnSetLendingRate(run, { ccy: v.ccy!, rate: v.rate!, json });
  if (action === "lending-history") return cmdEarnLendingHistory(run, { ccy: v.ccy, limit, json });
  if (action === "rate-history") return cmdEarnLendingRateHistory(run, { ccy: v.ccy, limit, json });
  errorLine(`Unknown earn savings command: ${action}`);
  process.exitCode = 1;
}

function handleEarnOnchainCommand(
  run: ToolRunner,
  action: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "offers") return cmdOnchainEarnOffers(run, v).then((r) => outputResult(r, json));
  if (action === "purchase") return cmdOnchainEarnPurchase(run, v).then((r) => outputResult(r, json));
  if (action === "redeem") return cmdOnchainEarnRedeem(run, v).then((r) => outputResult(r, json));
  if (action === "cancel") return cmdOnchainEarnCancel(run, v).then((r) => outputResult(r, json));
  if (action === "orders") return cmdOnchainEarnActiveOrders(run, v).then((r) => outputResult(r, json));
  if (action === "history") return cmdOnchainEarnOrderHistory(run, v).then((r) => outputResult(r, json));
  errorLine(`Unknown earn onchain command: ${action}`);
  process.exitCode = 1;
}

function parseDcdOpts(v: CliValues) {
  return {
    limit: v.limit !== undefined ? Number(v.limit) : undefined,
    minYield: v.minYield !== undefined ? parseFloat(v.minYield) : undefined,
    strikeNear: v.strikeNear !== undefined ? parseFloat(v.strikeNear) : undefined,
    termDays: v.termDays !== undefined ? parseInt(v.termDays, 10) : undefined,
    minTermDays: v.minTermDays !== undefined ? parseInt(v.minTermDays, 10) : undefined,
    maxTermDays: v.maxTermDays !== undefined ? parseInt(v.maxTermDays, 10) : undefined,
  };
}

function handleEarnDcdCommand(
  run: ToolRunner,
  action: string,
  v: CliValues,
  json: boolean,
): Promise<void> | void {
  const { limit, minYield, strikeNear, termDays, minTermDays, maxTermDays } = parseDcdOpts(v);
  if (action === "pairs") return cmdDcdPairs(run, json);
  if (action === "products")
    return cmdDcdProducts(run, {
      baseCcy: v.baseCcy,
      quoteCcy: v.quoteCcy,
      optType: v.optType,
      minYield,
      strikeNear,
      termDays,
      minTermDays,
      maxTermDays,
      expDate: v.expDate,
      json,
    });
  if (action === "quote-and-buy")
    return cmdDcdQuoteAndBuy(run, {
      productId: v.productId!,
      notionalSz: v.sz!,
      notionalCcy: v.notionalCcy!,
      clOrdId: v.clOrdId,
      minAnnualizedYield: v.minAnnualizedYield !== undefined ? parseFloat(v.minAnnualizedYield) : undefined,
      json,
    });
  if (action === "redeem-execute")
    return cmdDcdRedeemExecute(run, { ordId: v.ordId!, json });
  if (action === "order")
    return cmdDcdOrderState(run, { ordId: v.ordId!, json });
  if (action === "orders")
    return cmdDcdOrders(run, {
      ordId: v.ordId,
      productId: v.productId,
      uly: v.uly,
      state: v.state,
      beginId: v.beginId,
      endId: v.endId,
      begin: v.begin,
      end: v.end,
      limit,
      json,
    });
  errorLine(`Unknown earn dcd command: ${action}`);
  errorLine("Valid: pairs, products, quote-and-buy, redeem-execute, order, orders");
  process.exitCode = 1;
}

function outputResult(result: { endpoint: string; requestTime: string; data: unknown }, json: boolean): void {
  if (json) {
    outputLine(JSON.stringify(result, null, 2));
  } else {
    outputLine(JSON.stringify(result.data, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function printHelpForLevel(positionals: string[]): void {
  const [module, subgroup] = positionals;
  if (!module) printHelp();
  else if (!subgroup) printHelp(module);
  else printHelp(module, subgroup);
}

function printVerboseConfigSummary(config: import("@agent-tradekit/core").OkxConfig, profile?: string): void {
  let authLabel = "\u2717";
  if (config.hasAuth && config.apiKey) {
    authLabel = `\u2713(${config.apiKey.slice(0, 3)}***${config.apiKey.slice(-3)})`;
  } else if (config.hasAuth) {
    authLabel = "\u2713";
  }
  errorLine(`[verbose] config: profile=${profile ?? "default"} site=${config.site} base=${config.baseUrl} auth=${authLabel} demo=${config.demo ? "on" : "off"} modules=${config.modules.join(",")}`);
}

async function main(): Promise<void> {
  setOutput({
    out: (m) => process.stdout.write(m),
    err: (m) => process.stderr.write(m),
  });

  checkForUpdates("@okx_ai/okx-trade-cli", CLI_VERSION);

  const { values, positionals } = parseCli(process.argv.slice(2));

  if (values.version) {
    outputLine(`${CLI_VERSION} (${GIT_HASH})`);
    return;
  }

  if (values.help || positionals.length === 0) {
    printHelpForLevel(positionals);
    return;
  }

  const [module, action, ...rest] = positionals;
  const v = values;
  const json = v.json ?? false;

  if (module === "config") return handleConfigCommand(action, rest, json, v.lang, v.force);
  if (module === "setup") return handleSetupCommand(v);

  // diagnose runs before loadConfig — it must handle config parse errors itself
  if (module === "diagnose") {
    let config: ReturnType<typeof loadProfileConfig> | undefined;
    try {
      config = loadProfileConfig({ profile: v.profile, demo: v.demo, verbose: v.verbose, userAgent: `okx-trade-cli/${CLI_VERSION}`, sourceTag: "CLI" });
    } catch {
      // Config parse failed — diagnose will detect and report it
    }
    return cmdDiagnose(config, v.profile ?? "default", { mcp: v.mcp, cli: v.cli, all: v.all, output: v.output });
  }

  const config = loadProfileConfig({ profile: v.profile, demo: v.demo, verbose: v.verbose, userAgent: `okx-trade-cli/${CLI_VERSION}`, sourceTag: "CLI" });

  const client = new OkxRestClient(config);
  const baseRunner = createToolRunner(client, config);
  const writeToolNames = new Set(allToolSpecs().filter((t) => t.isWrite).map((t) => t.name));
  const run: ToolRunner = async (toolName, args) => {
    const result = await baseRunner(toolName, args);
    if (writeToolNames.has(toolName)) {
      markFailedIfSCodeError(result.data);
    }
    return result;
  };

  const moduleHandlers: Record<string, () => Promise<void> | void> = {
    market:  () => handleMarketCommand(run, action, rest, v, json),
    account: () => handleAccountCommand(run, action, rest, v, json),
    spot:    () => handleSpotCommand(run, action, rest, v, json),
    swap:    () => handleSwapCommand(run, action, rest, v, json),
    futures: () => handleFuturesCommand(run, action, rest, v, json),
    option:  () => handleOptionCommand(run, action, rest, v, json),
    bot:     () => handleBotCommand(run, action, rest, v, json),
    earn:    () => handleEarnCommand(run, action, rest, v, json),
  };
  const handler = moduleHandlers[module];
  if (handler) return handler();
  errorLine(`Unknown command: ${module} ${action ?? ""}`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const payload = toToolErrorPayload(error);
  errorLine(`Error: ${payload.message}`);
  if (payload.traceId) errorLine(`TraceId: ${payload.traceId}`);
  if (payload.suggestion) errorLine(`Hint: ${payload.suggestion}`);
  errorLine(`Version: @okx_ai/okx-trade-cli@${CLI_VERSION}`);
  process.exitCode = 1;
});
