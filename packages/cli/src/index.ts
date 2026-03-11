import { createRequire } from "node:module";
import { OkxRestClient, toToolErrorPayload, checkForUpdates, createToolRunner } from "@agent-tradekit/core";
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
  cmdEarnLendingRateSummary,
  cmdEarnLendingRateHistory,
} from "./commands/earn.js";
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
  process.stderr.write(`Unknown config command: ${action}\n`);
  process.exitCode = 1;
}

export function handleSetupCommand(v: CliValues): void {
  if (!v.client) {
    printSetupUsage();
    return;
  }
  if (!SUPPORTED_CLIENTS.includes(v.client as ClientId)) {
    process.stderr.write(
      `Unknown client: "${v.client}"\nSupported: ${SUPPORTED_CLIENTS.join(", ")}\n`
    );
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

function handleSpotAlgoCommand(
  run: ToolRunner,
  subAction: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (subAction === "place")
    return cmdSpotAlgoPlace(run, {
      instId: v.instId!,
      tdMode: v.tdMode,
      side: v.side!,
      ordType: v.ordType ?? "conditional",
      sz: v.sz!,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
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

function handleSpotCommand(
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
      px: v.px,
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      json,
    });
  if (action === "cancel")
    return cmdSpotCancel(run, rest[0], v.ordId!, json);
  if (action === "algo")
    return handleSpotAlgoCommand(run, rest[0], v, json);
  if (action === "batch")
    return cmdSpotBatch(run, { action: v.action!, orders: v.orders!, json });
}

function handleSwapAlgoCommand(
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
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      reduceOnly: v.reduceOnly,
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

export function handleSwapCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "positions")
    return cmdSwapPositions(run, rest[0] ?? v.instId, json);
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
  if (action === "close")
    return cmdSwapClose(run, {
      instId: v.instId!,
      mgnMode: v.mgnMode!,
      posSide: v.posSide,
      autoCxl: v.autoCxl,
      json,
    });
  if (action === "get-leverage")
    return cmdSwapGetLeverage(run, { instId: v.instId!, mgnMode: v.mgnMode!, json });
  if (action === "place")
    return cmdSwapPlace(run, {
      instId: v.instId!,
      side: v.side!,
      ordType: v.ordType!,
      sz: v.sz!,
      posSide: v.posSide,
      px: v.px,
      tdMode: v.tdMode ?? "cross",
      tpTriggerPx: v.tpTriggerPx,
      tpOrdPx: v.tpOrdPx,
      slTriggerPx: v.slTriggerPx,
      slOrdPx: v.slOrdPx,
      json,
    });
  if (action === "cancel")
    return cmdSwapCancel(run, rest[0], v.ordId!, json);
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

function handleOptionCommand(
  run: ToolRunner,
  action: string,
  _rest: string[],
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
}

function handleFuturesCommand(
  run: ToolRunner,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "orders") {
    let status: "archive" | "history" | "open" = "open";
    if (v.archive) status = "archive";
    else if (v.history) status = "history";
    return cmdFuturesOrders(run, { instId: v.instId, status, json });
  }
  if (action === "positions") return cmdFuturesPositions(run, v.instId, json);
  if (action === "fills")
    return cmdFuturesFills(run, {
      instId: v.instId,
      ordId: v.ordId,
      archive: v.archive ?? false,
      json,
    });
  if (action === "place")
    return cmdFuturesPlace(run, {
      instId: v.instId!,
      side: v.side!,
      ordType: v.ordType!,
      sz: v.sz!,
      tdMode: v.tdMode ?? "cross",
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
    return cmdFuturesCancel(run, rest[0] ?? v.instId!, v.ordId!, json);
  if (action === "get")
    return cmdFuturesGet(run, { instId: rest[0] ?? v.instId!, ordId: v.ordId, json });
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
  if (subAction === "orders")
    return cmdDcaOrders(run, { history: v.history ?? false, json });
  if (subAction === "details")
    return cmdDcaDetails(run, { algoId: v.algoId!, json });
  if (subAction === "sub-orders")
    return cmdDcaSubOrders(run, { algoId: v.algoId!, cycleId: v.cycleId, json });
  if (subAction === "create")
    return cmdDcaCreate(run, {
      instId: v.instId!,
      lever: v.lever!,
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
      json,
    });
  if (subAction === "stop")
    return cmdDcaStop(run, { algoId: v.algoId!, json });
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
  json: boolean
): Promise<void> | void {
  const action = rest[0];
  const innerRest = rest.slice(1);
  if (submodule === "savings") return handleEarnSavingsCommand(run, action, innerRest, v, json);
  if (submodule === "onchain") return handleEarnOnchainCommand(run, action, v, json);
  process.stderr.write(`Unknown earn sub-module: ${submodule}\nValid: savings, onchain\n`);
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
  if (action === "rate-summary") return cmdEarnLendingRateSummary(run, rest[0] ?? v.ccy, json);
  if (action === "rate-history") return cmdEarnLendingRateHistory(run, { ccy: v.ccy, limit, json });
  process.stderr.write(`Unknown earn savings command: ${action}\n`);
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
  process.stderr.write(`Unknown earn onchain command: ${action}\n`);
  process.exitCode = 1;
}

function outputResult(result: { endpoint: string; requestTime: string; data: unknown }, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(JSON.stringify(result.data, null, 2) + "\n");
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
  process.stderr.write(
    `[verbose] config: profile=${profile ?? "default"} site=${config.site} base=${config.baseUrl} auth=${authLabel} demo=${config.demo ? "on" : "off"} modules=${config.modules.join(",")}\n`,
  );
}

async function main(): Promise<void> {
  checkForUpdates("@okx_ai/okx-trade-cli", CLI_VERSION);

  const { values, positionals } = parseCli(process.argv.slice(2));

  if (values.version) {
    process.stdout.write(`${CLI_VERSION} (${GIT_HASH})\n`);
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

  const config = loadProfileConfig({ profile: v.profile, demo: v.demo, verbose: v.verbose, userAgent: `okx-trade-cli/${CLI_VERSION}`, sourceTag: "CLI" });

  if (config.verbose) printVerboseConfigSummary(config, v.profile);

  if (module === "diagnose") return cmdDiagnose(config, v.profile ?? "default");

  const client = new OkxRestClient(config);
  const run = createToolRunner(client, config);

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
  process.stderr.write(`Unknown command: ${module} ${action ?? ""}\n`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const payload = toToolErrorPayload(error);
  process.stderr.write(`Error: ${payload.message}\n`);
  if (payload.traceId) process.stderr.write(`TraceId: ${payload.traceId}\n`);
  if (payload.suggestion) process.stderr.write(`Hint: ${payload.suggestion}\n`);
  process.stderr.write(`Version: @okx_ai/okx-trade-cli@${CLI_VERSION}\n`);
  process.exitCode = 1;
});
