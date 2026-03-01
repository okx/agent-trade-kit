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
} from "./commands/market.js";
import { cmdAccountBalance } from "./commands/account.js";
import {
  cmdSpotOrders,
  cmdSpotPlace,
  cmdSpotCancel,
  cmdSpotFills,
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
  cmdSwapSetLeverage,
  cmdSwapAlgoPlace,
  cmdSwapAlgoAmend,
  cmdSwapAlgoCancel,
  cmdSwapAlgoOrders,
  cmdSwapAlgoTrailPlace,
} from "./commands/swap.js";
import { cmdConfigShow, cmdConfigSet } from "./commands/config.js";

function printHelp(): void {
  process.stdout.write(`
Usage: okx [--profile <name>] [--json] <command> [args]

Global Options:
  --profile <name>   Use a named profile from ~/.okx/config.toml
  --json             Output raw JSON
  --help             Show this help

Commands:
  market ticker <instId>
  market tickers <instType>               (SPOT|SWAP|FUTURES|OPTION)
  market orderbook <instId> [--sz <n>]
  market candles <instId> [--bar <bar>] [--limit <n>]

  account balance [<ccy>]

  spot orders [--instId <id>] [--history]
  spot fills [--instId <id>] [--ordId <id>]
  spot place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--px <price>]
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
  swap orders [--instId <id>] [--history]
  swap place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--posSide <side>] [--px <price>] [--tdMode <cross|isolated>]
  swap cancel <instId> --ordId <id>
  swap leverage --instId <id> --lever <n> --mgnMode <cross|isolated> [--posSide <side>]
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

  config show
  config set <key> <value>
`);
}

async function main(): Promise<void> {
  checkForUpdates("okx-trade-cli", CLI_VERSION);

  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      profile: { type: "string" },
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
    if (action === "show") return cmdConfigShow(json);
    if (action === "set") return cmdConfigSet(rest[0], rest[1]);
    process.stderr.write(`Unknown config command: ${action}\n`);
    process.exitCode = 1;
    return;
  }

  const config = loadProfileConfig({ profile: values.profile });
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
  }

  if (module === "account") {
    if (action === "balance") return cmdAccountBalance(client, rest[0], json);
  }

  if (module === "spot") {
    if (action === "orders")
      return cmdSpotOrders(client, {
        instId: values.instId,
        status: values.history ? "history" : "open",
        json,
      });
    if (action === "fills")
      return cmdSpotFills(client, { instId: values.instId, ordId: values.ordId, json });
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

  process.stderr.write(`Unknown command: ${module} ${action ?? ""}\n`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const payload = toToolErrorPayload(error);
  process.stderr.write(`Error: ${payload.message}\n`);
  if (payload.suggestion) process.stderr.write(`Hint: ${payload.suggestion}\n`);
  process.exitCode = 1;
});
