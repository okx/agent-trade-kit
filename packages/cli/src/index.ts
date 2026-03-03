import { parseArgs } from "node:util";
import { createRequire } from "node:module";
import { OkxRestClient, toToolErrorPayload, checkForUpdates } from "@okx-hub/core";

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
import { cmdSetupClients } from "./commands/client-setup.js";
import {
  cmdGridOrders,
  cmdGridDetails,
  cmdGridSubOrders,
  cmdGridCreate,
  cmdGridStop,
} from "./commands/bot.js";

function printHelp(): void {
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
  bot grid create --instId <id> --algoOrdType <type> --maxPx <px> --minPx <px> --gridNum <n> --tdMode <cash|cross|isolated>
                  [--runType <1|2>] [--quoteSz <n>] [--baseSz <n>]
                  [--direction <long|short|neutral>] [--lever <n>] [--sz <n>]
  bot grid stop --algoId <id> --algoOrdType <type> --instId <id> [--stopType <1|2>]

  config init
  config show
  config set <key> <value>
  config setup-clients
`);
}

async function main(): Promise<void> {
  checkForUpdates("okx-trade-cli", CLI_VERSION);

  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      profile: { type: "string" },
      demo: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
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
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    printHelp();
    return;
  }

  const [module, action, ...rest] = positionals;
  const json = values.json ?? false;

  // config commands don't need a client
  if (module === "config") {
    if (action === "init") return cmdConfigInit();
    if (action === "show") return cmdConfigShow(json);
    if (action === "set") return cmdConfigSet(rest[0], rest[1]);
    if (action === "setup-clients") return cmdSetupClients();
    process.stderr.write(`Unknown config command: ${action}\n`);
    process.exitCode = 1;
    return;
  }

  const config = loadProfileConfig({ profile: values.profile, demo: values.demo, userAgent: `okx-trade-cli/${CLI_VERSION}` });
  const client = new OkxRestClient(config);

  if (module === "market") {
    if (action === "ticker") return cmdMarketTicker(client, rest[0], json);
    if (action === "tickers") return cmdMarketTickers(client, rest[0], json);
    if (action === "orderbook")
      return cmdMarketOrderbook(client, rest[0], values.sz ? Number(values.sz) : undefined, json);
    if (action === "candles")
      return cmdMarketCandles(client, rest[0], {
        bar: values.bar,
        limit: values.limit ? Number(values.limit) : undefined,
        json,
      });
    if (action === "instruments")
      return cmdMarketInstruments(client, { instType: values.instType!, instId: values.instId, json });
    if (action === "funding-rate")
      return cmdMarketFundingRate(client, rest[0], {
        history: values.history,
        limit: values.limit ? Number(values.limit) : undefined,
        json,
      });
    if (action === "mark-price")
      return cmdMarketMarkPrice(client, { instType: values.instType!, instId: values.instId, json });
    if (action === "trades")
      return cmdMarketTrades(client, rest[0], {
        limit: values.limit ? Number(values.limit) : undefined,
        json,
      });
    if (action === "index-ticker")
      return cmdMarketIndexTicker(client, { instId: values.instId, quoteCcy: values.quoteCcy, json });
    if (action === "index-candles")
      return cmdMarketIndexCandles(client, rest[0], {
        bar: values.bar,
        limit: values.limit ? Number(values.limit) : undefined,
        history: values.history,
        json,
      });
    if (action === "price-limit") return cmdMarketPriceLimit(client, rest[0], json);
    if (action === "open-interest")
      return cmdMarketOpenInterest(client, { instType: values.instType!, instId: values.instId, json });
  }

  if (module === "account") {
    if (action === "balance") return cmdAccountBalance(client, rest[0], json);
    if (action === "asset-balance") return cmdAccountAssetBalance(client, values.ccy, json);
    if (action === "positions")
      return cmdAccountPositions(client, { instType: values.instType, instId: values.instId, json });
    if (action === "positions-history")
      return cmdAccountPositionsHistory(client, {
        instType: values.instType,
        instId: values.instId,
        limit: values.limit ? Number(values.limit) : undefined,
        json,
      });
    if (action === "bills")
      return cmdAccountBills(client, {
        archive: values.archive,
        instType: values.instType,
        ccy: values.ccy,
        limit: values.limit ? Number(values.limit) : undefined,
        json,
      });
    if (action === "fees")
      return cmdAccountFees(client, { instType: values.instType!, instId: values.instId, json });
    if (action === "config") return cmdAccountConfig(client, json);
    if (action === "set-position-mode")
      return cmdAccountSetPositionMode(client, values.posMode!, json);
    if (action === "max-size")
      return cmdAccountMaxSize(client, { instId: values.instId!, tdMode: values.tdMode!, px: values.px, json });
    if (action === "max-avail-size")
      return cmdAccountMaxAvailSize(client, { instId: values.instId!, tdMode: values.tdMode!, json });
    if (action === "max-withdrawal") return cmdAccountMaxWithdrawal(client, values.ccy, json);
    if (action === "transfer")
      return cmdAccountTransfer(client, {
        ccy: values.ccy!,
        amt: values.amt!,
        from: values.from!,
        to: values.to!,
        transferType: values.transferType,
        subAcct: values.subAcct,
        json,
      });
  }

  if (module === "spot") {
    if (action === "orders")
      return cmdSpotOrders(client, {
        instId: values.instId,
        status: values.history ? "history" : "open",
        json,
      });
    if (action === "get")
      return cmdSpotGet(client, { instId: values.instId!, ordId: values.ordId, clOrdId: values.clOrdId, json });
    if (action === "fills")
      return cmdSpotFills(client, { instId: values.instId, ordId: values.ordId, json });
    if (action === "amend")
      return cmdSpotAmend(client, {
        instId: values.instId!,
        ordId: values.ordId,
        clOrdId: values.clOrdId,
        newSz: values.newSz,
        newPx: values.newPx,
        json,
      });
    if (action === "place")
      return cmdSpotPlace(client, {
        instId: values.instId!,
        side: values.side!,
        ordType: values.ordType!,
        sz: values.sz!,
        px: values.px,
        json,
      });
    if (action === "cancel")
      return cmdSpotCancel(client, rest[0], values.ordId!, json);
    if (action === "algo") {
      const subAction = rest[0];
      if (subAction === "place")
        return cmdSpotAlgoPlace(client, {
          instId: values.instId!,
          side: values.side!,
          ordType: values.ordType ?? "conditional",
          sz: values.sz!,
          tpTriggerPx: values.tpTriggerPx,
          tpOrdPx: values.tpOrdPx,
          slTriggerPx: values.slTriggerPx,
          slOrdPx: values.slOrdPx,
          json,
        });
      if (subAction === "amend")
        return cmdSpotAlgoAmend(client, {
          instId: values.instId!,
          algoId: values.algoId!,
          newSz: values.newSz,
          newTpTriggerPx: values.newTpTriggerPx,
          newTpOrdPx: values.newTpOrdPx,
          newSlTriggerPx: values.newSlTriggerPx,
          newSlOrdPx: values.newSlOrdPx,
          json,
        });
      if (subAction === "cancel")
        return cmdSpotAlgoCancel(client, values.instId!, values.algoId!, json);
      if (subAction === "orders")
        return cmdSpotAlgoOrders(client, {
          instId: values.instId,
          status: values.history ? "history" : "pending",
          ordType: values.ordType,
          json,
        });
    }
  }

  if (module === "swap") {
    if (action === "positions")
      return cmdSwapPositions(client, rest[0] ?? values.instId, json);
    if (action === "orders")
      return cmdSwapOrders(client, {
        instId: values.instId,
        status: values.history ? "history" : "open",
        json,
      });
    if (action === "get")
      return cmdSwapGet(client, { instId: values.instId!, ordId: values.ordId, clOrdId: values.clOrdId, json });
    if (action === "fills")
      return cmdSwapFills(client, { instId: values.instId, ordId: values.ordId, archive: values.archive, json });
    if (action === "close")
      return cmdSwapClose(client, {
        instId: values.instId!,
        mgnMode: values.mgnMode!,
        posSide: values.posSide,
        autoCxl: values.autoCxl,
        json,
      });
    if (action === "get-leverage")
      return cmdSwapGetLeverage(client, { instId: values.instId!, mgnMode: values.mgnMode!, json });
    if (action === "place")
      return cmdSwapPlace(client, {
        instId: values.instId!,
        side: values.side!,
        ordType: values.ordType!,
        sz: values.sz!,
        posSide: values.posSide,
        px: values.px,
        tdMode: values.tdMode ?? "cross",
        json,
      });
    if (action === "cancel")
      return cmdSwapCancel(client, rest[0], values.ordId!, json);
    if (action === "leverage")
      return cmdSwapSetLeverage(client, {
        instId: values.instId!,
        lever: values.lever!,
        mgnMode: values.mgnMode!,
        posSide: values.posSide,
        json,
      });
    if (action === "algo") {
      const subAction = rest[0];
      if (subAction === "trail")
        return cmdSwapAlgoTrailPlace(client, {
          instId: values.instId!,
          side: values.side!,
          sz: values.sz!,
          callbackRatio: values.callbackRatio,
          callbackSpread: values.callbackSpread,
          activePx: values.activePx,
          posSide: values.posSide,
          tdMode: values.tdMode ?? "cross",
          reduceOnly: values.reduceOnly,
          json,
        });
      if (subAction === "place")
        return cmdSwapAlgoPlace(client, {
          instId: values.instId!,
          side: values.side!,
          ordType: values.ordType ?? "conditional",
          sz: values.sz!,
          posSide: values.posSide,
          tdMode: values.tdMode ?? "cross",
          tpTriggerPx: values.tpTriggerPx,
          tpOrdPx: values.tpOrdPx,
          slTriggerPx: values.slTriggerPx,
          slOrdPx: values.slOrdPx,
          reduceOnly: values.reduceOnly,
          json,
        });
      if (subAction === "amend")
        return cmdSwapAlgoAmend(client, {
          instId: values.instId!,
          algoId: values.algoId!,
          newSz: values.newSz,
          newTpTriggerPx: values.newTpTriggerPx,
          newTpOrdPx: values.newTpOrdPx,
          newSlTriggerPx: values.newSlTriggerPx,
          newSlOrdPx: values.newSlOrdPx,
          json,
        });
      if (subAction === "cancel")
        return cmdSwapAlgoCancel(client, values.instId!, values.algoId!, json);
      if (subAction === "orders")
        return cmdSwapAlgoOrders(client, {
          instId: values.instId,
          status: values.history ? "history" : "pending",
          ordType: values.ordType,
          json,
        });
    }
  }

  if (module === "futures") {
    if (action === "orders")
      return cmdFuturesOrders(client, {
        instId: values.instId,
        status: values.archive ? "archive" : values.history ? "history" : "open",
        json,
      });
    if (action === "positions") return cmdFuturesPositions(client, values.instId, json);
    if (action === "fills")
      return cmdFuturesFills(client, {
        instId: values.instId,
        ordId: values.ordId,
        archive: values.archive,
        json,
      });
    if (action === "place")
      return cmdFuturesPlace(client, {
        instId: values.instId!,
        side: values.side!,
        ordType: values.ordType!,
        sz: values.sz!,
        tdMode: values.tdMode ?? "cross",
        posSide: values.posSide,
        px: values.px,
        reduceOnly: values.reduceOnly,
        json,
      });
    if (action === "cancel")
      return cmdFuturesCancel(client, rest[0] ?? values.instId!, values.ordId!, json);
    if (action === "get")
      return cmdFuturesGet(client, { instId: rest[0] ?? values.instId!, ordId: values.ordId, json });
  }

  if (module === "bot") {
    const subAction = rest[0]; // e.g. "orders", "details", "sub-orders", "create", "stop"
    if (action === "grid") {
      if (subAction === "orders")
        return cmdGridOrders(client, {
          algoOrdType: values.algoOrdType!,
          instId: values.instId,
          algoId: values.algoId,
          status: values.history ? "history" : "active",
          json,
        });
      if (subAction === "details")
        return cmdGridDetails(client, {
          algoOrdType: values.algoOrdType!,
          algoId: values.algoId!,
          json,
        });
      if (subAction === "sub-orders")
        return cmdGridSubOrders(client, {
          algoOrdType: values.algoOrdType!,
          algoId: values.algoId!,
          type: values.live ? "live" : "filled",
          json,
        });
      if (subAction === "create")
        return cmdGridCreate(client, {
          instId: values.instId!,
          algoOrdType: values.algoOrdType!,
          maxPx: values.maxPx!,
          minPx: values.minPx!,
          gridNum: values.gridNum!,
          tdMode: values.tdMode ?? "cash",
          runType: values.runType,
          quoteSz: values.quoteSz,
          baseSz: values.baseSz,
          direction: values.direction,
          lever: values.lever,
          sz: values.sz,
          json,
        });
      if (subAction === "stop")
        return cmdGridStop(client, {
          algoId: values.algoId!,
          algoOrdType: values.algoOrdType!,
          instId: values.instId!,
          stopType: values.stopType,
          json,
        });
    }
  }

  process.stderr.write(`Unknown command: ${module} ${action ?? ""}\n`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const payload = toToolErrorPayload(error);
  process.stderr.write(`Error: ${payload.message}\n`);
  if (payload.traceId) process.stderr.write(`TraceId: ${payload.traceId}\n`);
  if (payload.suggestion) process.stderr.write(`Hint: ${payload.suggestion}\n`);
  process.stderr.write(`Version: okx-trade-cli@${CLI_VERSION}\n`);
  process.exitCode = 1;
});
