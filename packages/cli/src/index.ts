import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { OkxRestClient, toToolErrorPayload, checkForUpdates } from "@agent-tradekit/core";

const _require = createRequire(import.meta.url);
const CLI_VERSION = (_require("../package.json") as { version: string }).version;
import { loadProfileConfig } from "./config/loader.js";
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
} from "./commands/swap.js";
import {
  cmdFuturesOrders,
  cmdFuturesPositions,
  cmdFuturesFills,
  cmdFuturesPlace,
  cmdFuturesCancel,
  cmdFuturesGet,
} from "./commands/futures.js";
import { cmdConfigShow, cmdConfigSet, cmdConfigInit } from "./commands/config.js";
import {
  cmdSetupClients,
  cmdSetupClient,
  printSetupUsage,
  SUPPORTED_CLIENTS,
} from "./commands/client-setup.js";
import type { ClientId } from "./commands/client-setup.js";
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
  cmdDcaAiParam,
  cmdContractDcaCreate,
  cmdContractDcaStop,
  cmdContractDcaManualBuy,
  cmdContractDcaMargin,
  cmdContractDcaSetTp,
  cmdContractDcaSetReinvest,
  cmdContractDcaPositions,
  cmdContractDcaCycles,
  cmdContractDcaOrders,
  cmdContractDcaList,
  cmdRecurringCreate,
  cmdRecurringAmend,
  cmdRecurringStop,
  cmdRecurringOrders,
  cmdRecurringDetails,
  cmdRecurringSubOrders,
} from "./commands/bot.js";

export function printHelp(): void {
  process.stdout.write(`
Usage: okx [--profile <name>] [--json] <command> [args]

Global Options:
  --profile <name>   Use a named profile from ~/.okx/config.toml
  --demo             Use simulated trading (demo) mode
  --json             Output raw JSON
  --help             Show this help

Commands:
  market ticker <instId>
  market tickers <instType>               (SPOT|SWAP|FUTURES|OPTION)
  market orderbook <instId> [--sz <n>]
  market candles <instId> [--bar <bar>] [--limit <n>]
  market instruments --instType <type> [--instId <id>]
  market funding-rate <instId> [--history] [--limit <n>]
  market mark-price --instType <MARGIN|SWAP|FUTURES|OPTION> [--instId <id>]
  market trades <instId> [--limit <n>]
  market index-ticker [--instId <id>] [--quoteCcy <ccy>]
  market index-candles <instId> [--bar <bar>] [--limit <n>] [--history]
  market price-limit <instId>
  market open-interest --instType <SWAP|FUTURES|OPTION> [--instId <id>]

  account balance [<ccy>]
  account asset-balance [--ccy <ccy>]
  account positions [--instType <type>] [--instId <id>]
  account positions-history [--instType <type>] [--instId <id>] [--limit <n>]
  account bills [--instType <type>] [--ccy <ccy>] [--limit <n>] [--archive]
  account fees --instType <type> [--instId <id>]
  account config
  account set-position-mode --posMode <long_short_mode|net_mode>
  account max-size --instId <id> --tdMode <cross|isolated> [--px <price>]
  account max-avail-size --instId <id> --tdMode <cross|isolated|cash>
  account max-withdrawal [--ccy <ccy>]
  account transfer --ccy <ccy> --amt <n> --from <acct> --to <acct> [--transferType <0|1|2|3>]

  spot orders [--instId <id>] [--history]
  spot get --instId <id> --ordId <id>
  spot fills [--instId <id>] [--ordId <id>]
  spot place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--px <price>]
  spot amend --instId <id> --ordId <id> [--newSz <n>] [--newPx <price>]
  spot cancel <instId> --ordId <id>
  spot algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]
  spot algo place --instId <id> --side <buy|sell> --sz <n> [--ordType <conditional|oco>]
                  [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]
                  [--slTriggerPx <price>] [--slOrdPx <price|-1>]
  spot algo amend --instId <id> --algoId <id> [--newSz <n>]
                  [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]
                  [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]
  spot algo cancel --instId <id> --algoId <id>

  swap positions [<instId>]
  swap orders [--instId <id>] [--history] [--archive]
  swap get --instId <id> --ordId <id>
  swap fills [--instId <id>] [--ordId <id>] [--archive]
  swap place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--posSide <side>] [--px <price>] [--tdMode <cross|isolated>]
  swap cancel <instId> --ordId <id>
  swap close --instId <id> --mgnMode <cross|isolated> [--posSide <net|long|short>] [--autoCxl]
  swap leverage --instId <id> --lever <n> --mgnMode <cross|isolated> [--posSide <side>]
  swap get-leverage --instId <id> --mgnMode <cross|isolated>
  swap algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]
  swap algo trail --instId <id> --side <buy|sell> --sz <n> --callbackRatio <ratio>
                  [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]
  swap algo place --instId <id> --side <buy|sell> --sz <n> [--ordType <conditional|oco>]
                  [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]
                  [--slTriggerPx <price>] [--slOrdPx <price|-1>]
                  [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]
  swap algo amend --instId <id> --algoId <id> [--newSz <n>]
                  [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]
                  [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]
  swap algo cancel --instId <id> --algoId <id>

  futures orders [--instId <id>] [--history] [--archive]
  futures positions [--instId <id>]
  futures fills [--instId <id>] [--ordId <id>] [--archive]
  futures place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--tdMode <cross|isolated>]
                [--posSide <net|long|short>] [--px <price>] [--reduceOnly]
  futures cancel <instId> --ordId <id>
  futures get --instId <id> --ordId <id>

  bot grid orders --algoOrdType <grid|contract_grid|moon_grid> [--instId <id>] [--algoId <id>] [--history]
  bot grid details --algoOrdType <type> --algoId <id>
  bot grid sub-orders --algoOrdType <type> --algoId <id> [--live]
  bot grid create --instId <id> --algoOrdType <grid|contract_grid> --maxPx <px> --minPx <px> --gridNum <n>
                  [--runType <1|2>] [--quoteSz <n>] [--baseSz <n>]
                  [--direction <long|short|neutral>] [--lever <n>] [--sz <n>]
  bot grid stop --algoId <id> --algoOrdType <type> --instId <id> [--stopType <1|2|3|5|6>]

  bot dca orders [--history]
  bot dca details --algoId <id>
  bot dca sub-orders --algoId <id> [--live]
  bot dca ai-param --instId <id> --userRiskMode <conservative|moderate|aggressive>
  bot dca create --instId <id> --initOrdAmt <n> --safetyOrdAmt <n> --maxSafetyOrds <n>
                 --pxSteps <pct> --pxStepsMult <mult> --volMult <mult> --tpPct <pct> --slPct <pct>
                 [--reserveFunds <true|false>] [--triggerType <1|2>]
  bot dca stop --algoId <id> --instId <id> --stopType <1|2>

  bot contract-dca list [--history]
  bot contract-dca positions --algoId <id>
  bot contract-dca cycles --algoId <id>
  bot contract-dca orders --algoId <id> --cycleId <id>
  bot contract-dca create --instId <id> --lever <n> --side <buy|sell>
                          --initOrdAmt <n> --safetyOrdAmt <n> --maxSafetyOrds <n>
                          --pxSteps <pct> --pxStepsMult <mult> --volMult <mult> --tpPct <pct>
                          [--direction <long|short>] [--reserveFunds <true|false>]
  bot contract-dca stop --algoId <id>
  bot contract-dca manual-buy --algoId <id> --amt <n> [--px <price>]
  bot contract-dca margin-add --algoId <id> --amt <n>
  bot contract-dca margin-reduce --algoId <id> --amt <n>
  bot contract-dca set-tp --algoId <id> --tpPrice <price>
  bot contract-dca set-reinvest --algoId <id> --allowReinvest <true|false>

  bot recurring orders [--history]
  bot recurring details --algoId <id>
  bot recurring sub-orders --algoId <id>
  bot recurring create --stgyName <name> --recurringList <json> --amt <n> --period <hourly|daily|weekly|monthly>
                       [--recurringDay <n>] [--recurringTime <0-23>] [--timeZone <offset>] [--tdMode <cash|cross>]
  bot recurring amend --algoId <id> --stgyName <name>
  bot recurring stop --algoId <id>

  config init
  config show
  config set <key> <value>
  config setup-clients

  setup --client <client> [--profile <name>] [--modules <list>]

  Clients: ${SUPPORTED_CLIENTS.join(", ")}
`);
}

export interface CliValues {
  profile?: string;
  demo?: boolean;
  json?: boolean;
  help?: boolean;
  client?: string;
  modules?: string;
  bar?: string;
  limit?: string;
  sz?: string;
  instId?: string;
  history?: boolean;
  ordId?: string;
  side?: string;
  ordType?: string;
  px?: string;
  posSide?: string;
  tdMode?: string;
  lever?: string;
  mgnMode?: string;
  tpTriggerPx?: string;
  tpOrdPx?: string;
  slTriggerPx?: string;
  slOrdPx?: string;
  algoId?: string;
  reduceOnly?: boolean;
  newSz?: string;
  newTpTriggerPx?: string;
  newTpOrdPx?: string;
  newSlTriggerPx?: string;
  newSlOrdPx?: string;
  callbackRatio?: string;
  callbackSpread?: string;
  activePx?: string;
  algoOrdType?: string;
  gridNum?: string;
  maxPx?: string;
  minPx?: string;
  runType?: string;
  quoteSz?: string;
  baseSz?: string;
  direction?: string;
  stopType?: string;
  live?: boolean;
  instType?: string;
  quoteCcy?: string;
  archive?: boolean;
  posMode?: string;
  ccy?: string;
  from?: string;
  to?: string;
  transferType?: string;
  subAcct?: string;
  amt?: string;
  autoCxl?: boolean;
  clOrdId?: string;
  newPx?: string;
  // dca / contract-dca
  initOrdAmt?: string;
  safetyOrdAmt?: string;
  maxSafetyOrds?: string;
  pxSteps?: string;
  pxStepsMult?: string;
  volMult?: string;
  tpPct?: string;
  slPct?: string;
  reserveFunds?: string;
  triggerType?: string;
  userRiskMode?: string;
  tpPrice?: string;
  allowReinvest?: string;
  cycleId?: string;
  // recurring
  stgyName?: string;
  recurringList?: string;
  period?: string;
  recurringDay?: string;
  recurringTime?: string;
  timeZone?: string;
}

export function handleConfigCommand(action: string, rest: string[], json: boolean): Promise<void> | void {
  if (action === "init") return cmdConfigInit();
  if (action === "show") return cmdConfigShow(json);
  if (action === "set") return cmdConfigSet(rest[0], rest[1]);
  if (action === "setup-clients") return cmdSetupClients();
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
  client: OkxRestClient,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "ticker") return cmdMarketTicker(client, rest[0], json);
  if (action === "tickers") return cmdMarketTickers(client, rest[0], json);
  if (action === "instruments")
    return cmdMarketInstruments(client, { instType: v.instType!, instId: v.instId, json });
  if (action === "mark-price")
    return cmdMarketMarkPrice(client, { instType: v.instType!, instId: v.instId, json });
  if (action === "index-ticker")
    return cmdMarketIndexTicker(client, { instId: v.instId, quoteCcy: v.quoteCcy, json });
  if (action === "price-limit") return cmdMarketPriceLimit(client, rest[0], json);
  if (action === "open-interest")
    return cmdMarketOpenInterest(client, { instType: v.instType!, instId: v.instId, json });
}

export function handleMarketDataCommand(
  client: OkxRestClient,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  const limit = v.limit !== undefined ? Number(v.limit) : undefined;
  if (action === "orderbook")
    return cmdMarketOrderbook(client, rest[0], v.sz !== undefined ? Number(v.sz) : undefined, json);
  if (action === "candles")
    return cmdMarketCandles(client, rest[0], { bar: v.bar, limit, json });
  if (action === "funding-rate")
    return cmdMarketFundingRate(client, rest[0], { history: v.history ?? false, limit, json });
  if (action === "trades")
    return cmdMarketTrades(client, rest[0], { limit, json });
  if (action === "index-candles")
    return cmdMarketIndexCandles(client, rest[0], { bar: v.bar, limit, history: v.history ?? false, json });
}

export function handleMarketCommand(
  client: OkxRestClient,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  return (
    handleMarketPublicCommand(client, action, rest, v, json) ??
    handleMarketDataCommand(client, action, rest, v, json)
  );
}

export function handleAccountWriteCommand(
  client: OkxRestClient,
  action: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "set-position-mode")
    return cmdAccountSetPositionMode(client, v.posMode!, json);
  if (action === "max-size")
    return cmdAccountMaxSize(client, { instId: v.instId!, tdMode: v.tdMode!, px: v.px, json });
  if (action === "max-avail-size")
    return cmdAccountMaxAvailSize(client, { instId: v.instId!, tdMode: v.tdMode!, json });
  if (action === "max-withdrawal") return cmdAccountMaxWithdrawal(client, v.ccy, json);
  if (action === "transfer")
    return cmdAccountTransfer(client, {
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
  client: OkxRestClient,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  const limit = v.limit !== undefined ? Number(v.limit) : undefined;
  if (action === "balance") return cmdAccountBalance(client, rest[0], json);
  if (action === "asset-balance") return cmdAccountAssetBalance(client, v.ccy, json);
  if (action === "positions")
    return cmdAccountPositions(client, { instType: v.instType, instId: v.instId, json });
  if (action === "positions-history")
    return cmdAccountPositionsHistory(client, {
      instType: v.instType,
      instId: v.instId,
      limit,
      json,
    });
  if (action === "bills")
    return cmdAccountBills(client, {
      archive: v.archive ?? false,
      instType: v.instType,
      ccy: v.ccy,
      limit,
      json,
    });
  if (action === "fees")
    return cmdAccountFees(client, { instType: v.instType!, instId: v.instId, json });
  if (action === "config") return cmdAccountConfig(client, json);
  return handleAccountWriteCommand(client, action, v, json);
}

function handleSpotAlgoCommand(
  client: OkxRestClient,
  subAction: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (subAction === "place")
    return cmdSpotAlgoPlace(client, {
      instId: v.instId!,
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
    return cmdSpotAlgoAmend(client, {
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
    return cmdSpotAlgoCancel(client, v.instId!, v.algoId!, json);
  if (subAction === "orders")
    return cmdSpotAlgoOrders(client, {
      instId: v.instId,
      status: v.history ? "history" : "pending",
      ordType: v.ordType,
      json,
    });
}

function handleSpotCommand(
  client: OkxRestClient,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "orders")
    return cmdSpotOrders(client, {
      instId: v.instId,
      status: v.history ? "history" : "open",
      json,
    });
  if (action === "get")
    return cmdSpotGet(client, { instId: v.instId!, ordId: v.ordId, clOrdId: v.clOrdId, json });
  if (action === "fills")
    return cmdSpotFills(client, { instId: v.instId, ordId: v.ordId, json });
  if (action === "amend")
    return cmdSpotAmend(client, {
      instId: v.instId!,
      ordId: v.ordId,
      clOrdId: v.clOrdId,
      newSz: v.newSz,
      newPx: v.newPx,
      json,
    });
  if (action === "place")
    return cmdSpotPlace(client, {
      instId: v.instId!,
      side: v.side!,
      ordType: v.ordType!,
      sz: v.sz!,
      px: v.px,
      json,
    });
  if (action === "cancel")
    return cmdSpotCancel(client, rest[0], v.ordId!, json);
  if (action === "algo")
    return handleSpotAlgoCommand(client, rest[0], v, json);
}

function handleSwapAlgoCommand(
  client: OkxRestClient,
  subAction: string,
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (subAction === "trail")
    return cmdSwapAlgoTrailPlace(client, {
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
    return cmdSwapAlgoPlace(client, {
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
    return cmdSwapAlgoAmend(client, {
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
    return cmdSwapAlgoCancel(client, v.instId!, v.algoId!, json);
  if (subAction === "orders")
    return cmdSwapAlgoOrders(client, {
      instId: v.instId,
      status: v.history ? "history" : "pending",
      ordType: v.ordType,
      json,
    });
}

function handleSwapCommand(
  client: OkxRestClient,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "positions")
    return cmdSwapPositions(client, rest[0] ?? v.instId, json);
  if (action === "orders")
    return cmdSwapOrders(client, {
      instId: v.instId,
      status: v.history ? "history" : "open",
      json,
    });
  if (action === "get")
    return cmdSwapGet(client, { instId: v.instId!, ordId: v.ordId, clOrdId: v.clOrdId, json });
  if (action === "fills")
    return cmdSwapFills(client, {
      instId: v.instId,
      ordId: v.ordId,
      archive: v.archive ?? false,
      json,
    });
  if (action === "close")
    return cmdSwapClose(client, {
      instId: v.instId!,
      mgnMode: v.mgnMode!,
      posSide: v.posSide,
      autoCxl: v.autoCxl,
      json,
    });
  if (action === "get-leverage")
    return cmdSwapGetLeverage(client, { instId: v.instId!, mgnMode: v.mgnMode!, json });
  if (action === "place")
    return cmdSwapPlace(client, {
      instId: v.instId!,
      side: v.side!,
      ordType: v.ordType!,
      sz: v.sz!,
      posSide: v.posSide,
      px: v.px,
      tdMode: v.tdMode ?? "cross",
      json,
    });
  if (action === "cancel")
    return cmdSwapCancel(client, rest[0], v.ordId!, json);
  if (action === "leverage")
    return cmdSwapSetLeverage(client, {
      instId: v.instId!,
      lever: v.lever!,
      mgnMode: v.mgnMode!,
      posSide: v.posSide,
      json,
    });
  if (action === "algo")
    return handleSwapAlgoCommand(client, rest[0], v, json);
}

function handleFuturesCommand(
  client: OkxRestClient,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "orders") {
    let status: "archive" | "history" | "open" = "open";
    if (v.archive) status = "archive";
    else if (v.history) status = "history";
    return cmdFuturesOrders(client, { instId: v.instId, status, json });
  }
  if (action === "positions") return cmdFuturesPositions(client, v.instId, json);
  if (action === "fills")
    return cmdFuturesFills(client, {
      instId: v.instId,
      ordId: v.ordId,
      archive: v.archive ?? false,
      json,
    });
  if (action === "place")
    return cmdFuturesPlace(client, {
      instId: v.instId!,
      side: v.side!,
      ordType: v.ordType!,
      sz: v.sz!,
      tdMode: v.tdMode ?? "cross",
      posSide: v.posSide,
      px: v.px,
      reduceOnly: v.reduceOnly,
      json,
    });
  if (action === "cancel")
    return cmdFuturesCancel(client, rest[0] ?? v.instId!, v.ordId!, json);
  if (action === "get")
    return cmdFuturesGet(client, { instId: rest[0] ?? v.instId!, ordId: v.ordId, json });
}

export function handleBotGridCommand(
  client: OkxRestClient,
  v: CliValues,
  rest: string[],
  json: boolean
): Promise<void> | void {
  const subAction = rest[0];
  if (subAction === "orders")
    return cmdGridOrders(client, {
      algoOrdType: v.algoOrdType!,
      instId: v.instId,
      algoId: v.algoId,
      status: v.history ? "history" : "active",
      json,
    });
  if (subAction === "details")
    return cmdGridDetails(client, {
      algoOrdType: v.algoOrdType!,
      algoId: v.algoId!,
      json,
    });
  if (subAction === "sub-orders")
    return cmdGridSubOrders(client, {
      algoOrdType: v.algoOrdType!,
      algoId: v.algoId!,
      type: v.live ? "live" : "filled",
      json,
    });
  if (subAction === "create")
    return cmdGridCreate(client, {
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
      json,
    });
  if (subAction === "stop")
    return cmdGridStop(client, {
      algoId: v.algoId!,
      algoOrdType: v.algoOrdType!,
      instId: v.instId!,
      stopType: v.stopType,
      json,
    });
}

export function handleBotDcaCommand(
  client: OkxRestClient,
  v: CliValues,
  rest: string[],
  json: boolean,
): Promise<void> | void {
  const subAction = rest[0];
  if (subAction === "orders")
    return cmdDcaOrders(client, { history: v.history ?? false, json });
  if (subAction === "details")
    return cmdDcaDetails(client, { algoId: v.algoId!, json });
  if (subAction === "sub-orders")
    return cmdDcaSubOrders(client, { algoId: v.algoId!, live: v.live ?? false, json });
  if (subAction === "ai-param")
    return cmdDcaAiParam(client, { instId: v.instId!, userRiskMode: v.userRiskMode!, json });
  if (subAction === "create")
    return cmdDcaCreate(client, {
      instId: v.instId!, initOrdAmt: v.initOrdAmt!, safetyOrdAmt: v.safetyOrdAmt!,
      maxSafetyOrds: v.maxSafetyOrds!, pxSteps: v.pxSteps!, pxStepsMult: v.pxStepsMult!,
      volMult: v.volMult!, tpPct: v.tpPct!, slPct: v.slPct!,
      reserveFunds: v.reserveFunds, triggerType: v.triggerType, direction: v.direction,
      json,
    });
  if (subAction === "stop")
    return cmdDcaStop(client, { algoId: v.algoId!, instId: v.instId!, stopType: v.stopType!, json });
}

export function handleBotContractDcaCommand(
  client: OkxRestClient,
  v: CliValues,
  rest: string[],
  json: boolean,
): Promise<void> | void {
  const subAction = rest[0];
  if (subAction === "list")
    return cmdContractDcaList(client, { history: v.history ?? false, json });
  if (subAction === "positions")
    return cmdContractDcaPositions(client, { algoId: v.algoId!, json });
  if (subAction === "cycles")
    return cmdContractDcaCycles(client, { algoId: v.algoId!, json });
  if (subAction === "orders")
    return cmdContractDcaOrders(client, { algoId: v.algoId!, cycleId: v.cycleId!, json });
  if (subAction === "create")
    return cmdContractDcaCreate(client, {
      instId: v.instId!, lever: v.lever!, side: v.side!,
      initOrdAmt: v.initOrdAmt!, safetyOrdAmt: v.safetyOrdAmt!,
      maxSafetyOrds: v.maxSafetyOrds!, pxSteps: v.pxSteps!, pxStepsMult: v.pxStepsMult!,
      volMult: v.volMult!, tpPct: v.tpPct!,
      direction: v.direction, reserveFunds: v.reserveFunds,
      json,
    });
  if (subAction === "stop")
    return cmdContractDcaStop(client, { algoId: v.algoId!, json });
  if (subAction === "manual-buy")
    return cmdContractDcaManualBuy(client, { algoId: v.algoId!, amt: v.amt!, px: v.px, json });
  if (subAction === "margin-add")
    return cmdContractDcaMargin(client, { algoId: v.algoId!, amt: v.amt!, action: "add", json });
  if (subAction === "margin-reduce")
    return cmdContractDcaMargin(client, { algoId: v.algoId!, amt: v.amt!, action: "reduce", json });
  if (subAction === "set-tp")
    return cmdContractDcaSetTp(client, { algoId: v.algoId!, tpPrice: v.tpPrice!, json });
  if (subAction === "set-reinvest")
    return cmdContractDcaSetReinvest(client, {
      algoId: v.algoId!,
      allowReinvest: v.allowReinvest !== "false",
      json,
    });
}

export function handleBotRecurringCommand(
  client: OkxRestClient,
  v: CliValues,
  rest: string[],
  json: boolean,
): Promise<void> | void {
  const subAction = rest[0];
  if (subAction === "orders")
    return cmdRecurringOrders(client, { history: v.history ?? false, json });
  if (subAction === "details")
    return cmdRecurringDetails(client, { algoId: v.algoId!, json });
  if (subAction === "sub-orders")
    return cmdRecurringSubOrders(client, { algoId: v.algoId!, json });
  if (subAction === "create")
    return cmdRecurringCreate(client, {
      stgyName: v.stgyName!, recurringList: v.recurringList!, amt: v.amt!, period: v.period!,
      recurringDay: v.recurringDay, recurringTime: v.recurringTime, timeZone: v.timeZone,
      tdMode: v.tdMode,
      json,
    });
  if (subAction === "amend")
    return cmdRecurringAmend(client, { algoId: v.algoId!, stgyName: v.stgyName!, json });
  if (subAction === "stop")
    return cmdRecurringStop(client, { algoId: v.algoId!, json });
}

export function handleBotCommand(
  client: OkxRestClient,
  action: string,
  rest: string[],
  v: CliValues,
  json: boolean
): Promise<void> | void {
  if (action === "grid") return handleBotGridCommand(client, v, rest, json);
  if (action === "dca") return handleBotDcaCommand(client, v, rest, json);
  if (action === "contract-dca") return handleBotContractDcaCommand(client, v, rest, json);
  if (action === "recurring") return handleBotRecurringCommand(client, v, rest, json);
}

async function main(): Promise<void> {
  checkForUpdates("@okx_ai/okx-trade-cli", CLI_VERSION);

  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      profile: { type: "string" },
      demo: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      // setup command
      client: { type: "string" },
      modules: { type: "string" },
      // market candles
      bar: { type: "string" },
      limit: { type: "string" },
      sz: { type: "string" },
      // orders
      instId: { type: "string" },
      history: { type: "boolean", default: false },
      ordId: { type: "string" },
      // trade
      side: { type: "string" },
      ordType: { type: "string" },
      px: { type: "string" },
      posSide: { type: "string" },
      tdMode: { type: "string" },
      // leverage
      lever: { type: "string" },
      mgnMode: { type: "string" },
      // algo orders
      tpTriggerPx: { type: "string" },
      tpOrdPx: { type: "string" },
      slTriggerPx: { type: "string" },
      slOrdPx: { type: "string" },
      algoId: { type: "string" },
      reduceOnly: { type: "boolean", default: false },
      // algo amend
      newSz: { type: "string" },
      newTpTriggerPx: { type: "string" },
      newTpOrdPx: { type: "string" },
      newSlTriggerPx: { type: "string" },
      newSlOrdPx: { type: "string" },
      // trailing stop
      callbackRatio: { type: "string" },
      callbackSpread: { type: "string" },
      activePx: { type: "string" },
      // grid bot
      algoOrdType: { type: "string" },
      gridNum: { type: "string" },
      maxPx: { type: "string" },
      minPx: { type: "string" },
      runType: { type: "string" },
      quoteSz: { type: "string" },
      baseSz: { type: "string" },
      direction: { type: "string" },
      stopType: { type: "string" },
      live: { type: "boolean", default: false },
      // market extras
      instType: { type: "string" },
      quoteCcy: { type: "string" },
      // account extras
      archive: { type: "boolean", default: false },
      posMode: { type: "string" },
      ccy: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      transferType: { type: "string" },
      subAcct: { type: "string" },
      amt: { type: "string" },
      // swap/order extras
      autoCxl: { type: "boolean", default: false },
      clOrdId: { type: "string" },
      newPx: { type: "string" },
      // dca / contract-dca
      initOrdAmt: { type: "string" },
      safetyOrdAmt: { type: "string" },
      maxSafetyOrds: { type: "string" },
      pxSteps: { type: "string" },
      pxStepsMult: { type: "string" },
      volMult: { type: "string" },
      tpPct: { type: "string" },
      slPct: { type: "string" },
      reserveFunds: { type: "string" },
      triggerType: { type: "string" },
      userRiskMode: { type: "string" },
      tpPrice: { type: "string" },
      allowReinvest: { type: "string" },
      cycleId: { type: "string" },
      // recurring
      stgyName: { type: "string" },
      recurringList: { type: "string" },
      period: { type: "string" },
      recurringDay: { type: "string" },
      recurringTime: { type: "string" },
      timeZone: { type: "string" },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    printHelp();
    return;
  }

  const [module, action, ...rest] = positionals;
  const v = values as CliValues;
  const json = v.json ?? false;

  if (module === "config") return handleConfigCommand(action, rest, json);
  if (module === "setup") return handleSetupCommand(v);

  const config = loadProfileConfig({ profile: v.profile, demo: v.demo, userAgent: `okx-trade-cli/${CLI_VERSION}` });
  const client = new OkxRestClient(config);

  if (module === "market") return handleMarketCommand(client, action, rest, v, json);
  if (module === "account") return handleAccountCommand(client, action, rest, v, json);
  if (module === "spot") return handleSpotCommand(client, action, rest, v, json);
  if (module === "swap") return handleSwapCommand(client, action, rest, v, json);
  if (module === "futures") return handleFuturesCommand(client, action, rest, v, json);
  if (module === "bot") return handleBotCommand(client, action, rest, v, json);

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
