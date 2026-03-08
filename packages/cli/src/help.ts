import { SUPPORTED_CLIENTS } from "./commands/client-setup.js";
import { configFilePath } from "@agent-tradekit/core";

export function printHelp(): void {
  process.stdout.write(`
Usage: okx [--profile <name>] [--json] <command> [args]

Global Options:
  --profile <name>   Use a named profile from ${configFilePath()}
  --demo             Use simulated trading (demo) mode
  --json             Output raw JSON
  --version, -v      Show version
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
  account audit [--tool <name>] [--since <ISO-date>] [--limit <n>]

  spot orders [--instId <id>] [--history]
  spot get --instId <id> --ordId <id>
  spot fills [--instId <id>] [--ordId <id>]
  spot place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--px <price>] [--tdMode <cash|cross|isolated>]
  spot amend --instId <id> --ordId <id> [--newSz <n>] [--newPx <price>]
  spot cancel <instId> --ordId <id>
  spot algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]
  spot algo place --instId <id> --side <buy|sell> --sz <n> [--ordType <conditional|oco>]
                  [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]
                  [--slTriggerPx <price>] [--slOrdPx <price|-1>] [--tdMode <cash|cross|isolated>]
  spot algo amend --instId <id> --algoId <id> [--newSz <n>]
                  [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]
                  [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]
  spot algo cancel --instId <id> --algoId <id>
  spot batch --action <place|amend|cancel> --orders '<json>'

  swap positions [<instId>]
  swap orders [--instId <id>] [--history] [--archive]
  swap get --instId <id> --ordId <id>
  swap fills [--instId <id>] [--ordId <id>] [--archive]
  swap place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--posSide <side>] [--px <price>] [--tdMode <cross|isolated>]
  swap cancel <instId> --ordId <id>
  swap amend --instId <id> --ordId <id> [--newSz <n>] [--newPx <price>]
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
  swap batch --action <place|amend|cancel> --orders '<json>'

  futures orders [--instId <id>] [--history] [--archive]
  futures positions [--instId <id>]
  futures fills [--instId <id>] [--ordId <id>] [--archive]
  futures place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--tdMode <cross|isolated>]
                [--posSide <net|long|short>] [--px <price>] [--reduceOnly]
  futures cancel <instId> --ordId <id>
  futures get --instId <id> --ordId <id>

  option orders [--instId <id>] [--uly <uly>] [--history] [--archive]
  option get --instId <id> [--ordId <id>] [--clOrdId <id>]
  option positions [--instId <id>] [--uly <uly>]
  option fills [--instId <id>] [--ordId <id>] [--archive]
  option instruments --uly <uly> [--expTime <date>]
  option greeks --uly <uly> [--expTime <date>]
  option place --instId <id> --tdMode <cash|cross|isolated> --side <buy|sell> --ordType <type> --sz <n> [--px <price>] [--reduceOnly] [--clOrdId <id>]
  option cancel --instId <id> [--ordId <id>] [--clOrdId <id>]
  option amend --instId <id> [--ordId <id>] [--clOrdId <id>] [--newSz <n>] [--newPx <price>]
  option batch-cancel --orders '<json>'

  bot grid orders --algoOrdType <grid|contract_grid|moon_grid> [--instId <id>] [--algoId <id>] [--history]
  bot grid details --algoOrdType <type> --algoId <id>
  bot grid sub-orders --algoOrdType <type> --algoId <id> [--live]
  bot grid create --instId <id> --algoOrdType <grid|contract_grid> --maxPx <px> --minPx <px> --gridNum <n>
                  [--runType <1|2>] [--quoteSz <n>] [--baseSz <n>]
                  [--direction <long|short|neutral>] [--lever <n>] [--sz <n>]
  bot grid stop --algoId <id> --algoOrdType <type> --instId <id> [--stopType <1|2|3|5|6>]

  bot dca orders [--type <spot|contract>] [--history]
  bot dca details [--type <spot|contract>] --algoId <id>
  bot dca sub-orders [--type <spot|contract>] --algoId <id> [--live] [--cycleId <id>]
  bot dca create --instId <id> --initOrdAmt <n> --safetyOrdAmt <n> --maxSafetyOrds <n>
                 --pxSteps <n> --pxStepsMult <n> --volMult <n> --tpPct <n> [--slPct <n>]
                 [--type <spot|contract>] [--triggerType <1|2>] [--lever <n>] [--side <buy|sell>]
  bot dca stop [--type <spot|contract>] --algoId <id> --instId <id> [--stopType <1|2>]

  config init [--lang zh]
  config show
  config set <key> <value>
  config setup-clients

  setup --client <client> [--profile <name>] [--modules <list>]

  Clients: ${SUPPORTED_CLIENTS.join(", ")}
`);
}
