import { EOL } from "node:os";
import { SUPPORTED_CLIENTS } from "./commands/client-setup.js";
import { configFilePath } from "@agent-tradekit/core";
import { output, errorLine } from "./formatter.js";

// ---------------------------------------------------------------------------
// Help tree data structures
// ---------------------------------------------------------------------------

interface CommandInfo {
  /** Full usage line, e.g. "okx bot grid create --instId <id> ..." */
  usage: string;
  /** Short description of what the command does */
  description: string;
}

interface GroupInfo {
  /** One-line description shown in parent overview */
  description: string;
  /** Optional direct usage line when the group has no sub-commands */
  usage?: string;
  /** Leaf commands within this group */
  commands?: Record<string, CommandInfo>;
  /** Nested sub-groups (e.g. bot → grid, spot → algo) */
  subgroups?: Record<string, GroupInfo>;
}

type HelpTree = Record<string, GroupInfo>;

// ---------------------------------------------------------------------------
// Help data — descriptions are intentionally kept in sync with core ToolSpec
// ---------------------------------------------------------------------------

const HELP_TREE: HelpTree = {
  market: {
    description: "Market data (ticker, orderbook, candles, trades)",
    commands: {
      ticker: {
        usage: "okx market ticker <instId>",
        description: "Get latest ticker data for an instrument",
      },
      tickers: {
        usage: "okx market tickers <instType>",
        description: "Get all tickers for an instrument type (SPOT|SWAP|FUTURES|OPTION)",
      },
      orderbook: {
        usage: "okx market orderbook <instId> [--sz <n>]",
        description: "Get order book depth for an instrument",
      },
      candles: {
        usage: "okx market candles <instId> [--bar <bar>] [--limit <n>]",
        description: "Get candlestick (OHLCV) data",
      },
      instruments: {
        usage: "okx market instruments --instType <type> [--instId <id>]",
        description: "List tradable instruments of a given type",
      },
      "funding-rate": {
        usage: "okx market funding-rate <instId> [--history] [--limit <n>]",
        description: "Get current or historical funding rate for perpetual swaps",
      },
      "mark-price": {
        usage: "okx market mark-price --instType <MARGIN|SWAP|FUTURES|OPTION> [--instId <id>]",
        description: "Get mark price for instruments",
      },
      trades: {
        usage: "okx market trades <instId> [--limit <n>]",
        description: "Get recent trades for an instrument",
      },
      "index-ticker": {
        usage: "okx market index-ticker [--instId <id>] [--quoteCcy <ccy>]",
        description: "Get index ticker data",
      },
      "index-candles": {
        usage: "okx market index-candles <instId> [--bar <bar>] [--limit <n>] [--history]",
        description: "Get index candlestick data",
      },
      "price-limit": {
        usage: "okx market price-limit <instId>",
        description: "Get price limit for an instrument",
      },
      "open-interest": {
        usage: "okx market open-interest --instType <SWAP|FUTURES|OPTION> [--instId <id>]",
        description: "Get open interest for instruments",
      },
      "stock-tokens": {
        usage: "okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>]",
        description: "[Deprecated: use instruments-by-category --instCategory 3] List all stock token instruments (instCategory=3, e.g. AAPL-USDT-SWAP)",
      },
      "instruments-by-category": {
        usage: "okx market instruments-by-category --instCategory <4|5|6|7> [--instType <SPOT|SWAP>] [--instId <id>]",
        description: "List instruments by asset category: 4=Metals (gold/silver), 5=Commodities (oil/gas), 6=Forex (EUR/USD), 7=Bonds",
      },
    },
  },

  account: {
    description: "Account balance, positions, bills, and configuration",
    commands: {
      balance: {
        usage: "okx account balance [<ccy>]",
        description: "Get trading account balance",
      },
      "asset-balance": {
        usage: "okx account asset-balance [--ccy <ccy>]",
        description: "Get funding account asset balance",
      },
      positions: {
        usage: "okx account positions [--instType <type>] [--instId <id>]",
        description: "Get current open positions",
      },
      "positions-history": {
        usage: "okx account positions-history [--instType <type>] [--instId <id>] [--limit <n>]",
        description: "Get historical positions",
      },
      bills: {
        usage: "okx account bills [--instType <type>] [--ccy <ccy>] [--limit <n>] [--archive]",
        description: "Get account bill history",
      },
      fees: {
        usage: "okx account fees --instType <type> [--instId <id>]",
        description: "Get trading fee rates",
      },
      config: {
        usage: "okx account config",
        description: "Get account configuration",
      },
      "set-position-mode": {
        usage: "okx account set-position-mode --posMode <long_short_mode|net_mode>",
        description: "Set position mode (long/short or net)",
      },
      "max-size": {
        usage: "okx account max-size --instId <id> --tdMode <cross|isolated> [--px <price>]",
        description: "Get maximum order size for an instrument",
      },
      "max-avail-size": {
        usage: "okx account max-avail-size --instId <id> --tdMode <cross|isolated|cash>",
        description: "Get maximum available tradable amount",
      },
      "max-withdrawal": {
        usage: "okx account max-withdrawal [--ccy <ccy>]",
        description: "Get maximum withdrawable amount",
      },
      transfer: {
        usage: "okx account transfer --ccy <ccy> --amt <n> --from <acct> --to <acct> [--transferType <0|1|2|3>]",
        description: "Transfer funds between accounts",
      },
      audit: {
        usage: "okx account audit [--tool <name>] [--since <ISO-date>] [--limit <n>]",
        description: "Audit account activity and tool call history",
      },
    },
  },

  spot: {
    description: "Spot trading (orders, algo orders)",
    commands: {
      orders: {
        usage: "okx spot orders [--instId <id>] [--history]",
        description: "List open or historical spot orders",
      },
      get: {
        usage: "okx spot get --instId <id> --ordId <id>",
        description: "Get details of a specific spot order",
      },
      fills: {
        usage: "okx spot fills [--instId <id>] [--ordId <id>]",
        description: "Get trade fill history for spot orders",
      },
      place: {
        usage: "okx spot place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--px <price>] [--tdMode <cash|cross|isolated>] [--tpTriggerPx <price>] [--tpOrdPx <price|-1>] [--slTriggerPx <price>] [--slOrdPx <price|-1>]",
        description: "Place a new spot order (supports attached TP/SL)",
      },
      amend: {
        usage: "okx spot amend --instId <id> --ordId <id> [--newSz <n>] [--newPx <price>]",
        description: "Amend a pending spot order",
      },
      cancel: {
        usage: "okx spot cancel <instId> --ordId <id>",
        description: "Cancel a pending spot order",
      },
      batch: {
        usage: "okx spot batch --action <place|amend|cancel> --orders '<json>'",
        description: "Batch place, amend, or cancel spot orders",
      },
    },
    subgroups: {
      algo: {
        description: "Spot algo orders (conditional, OCO, take-profit/stop-loss)",
        commands: {
          orders: {
            usage: "okx spot algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]",
            description: "List spot algo orders",
          },
          place: {
            usage: "okx spot algo place --instId <id> --side <buy|sell> --sz <n> [--ordType <conditional|oco>]\n                    [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]\n                    [--slTriggerPx <price>] [--slOrdPx <price|-1>] [--tdMode <cash|cross|isolated>]",
            description: "Place a spot algo order (take-profit/stop-loss)",
          },
          amend: {
            usage: "okx spot algo amend --instId <id> --algoId <id> [--newSz <n>]\n                    [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]\n                    [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]",
            description: "Amend a pending spot algo order",
          },
          cancel: {
            usage: "okx spot algo cancel --instId <id> --algoId <id>",
            description: "Cancel a pending spot algo order",
          },
        },
      },
    },
  },

  swap: {
    description: "Perpetual swap trading (orders, algo orders)",
    commands: {
      positions: {
        usage: "okx swap positions [<instId>]",
        description: "Get current perpetual swap positions",
      },
      orders: {
        usage: "okx swap orders [--instId <id>] [--history] [--archive]",
        description: "List open or historical swap orders",
      },
      get: {
        usage: "okx swap get --instId <id> --ordId <id>",
        description: "Get details of a specific swap order",
      },
      fills: {
        usage: "okx swap fills [--instId <id>] [--ordId <id>] [--archive]",
        description: "Get trade fill history for swap orders",
      },
      place: {
        usage: "okx swap place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--posSide <side>] [--px <price>] [--tdMode <cross|isolated>] [--tpTriggerPx <price>] [--tpOrdPx <price|-1>] [--slTriggerPx <price>] [--slOrdPx <price|-1>]",
        description: "Place a new perpetual swap order (supports attached TP/SL)",
      },
      cancel: {
        usage: "okx swap cancel <instId> --ordId <id>",
        description: "Cancel a pending swap order",
      },
      amend: {
        usage: "okx swap amend --instId <id> --ordId <id> [--newSz <n>] [--newPx <price>]",
        description: "Amend a pending swap order",
      },
      close: {
        usage: "okx swap close --instId <id> --mgnMode <cross|isolated> [--posSide <net|long|short>] [--autoCxl]",
        description: "Close a swap position",
      },
      leverage: {
        usage: "okx swap leverage --instId <id> --lever <n> --mgnMode <cross|isolated> [--posSide <side>]",
        description: "Set leverage for a swap instrument",
      },
      "get-leverage": {
        usage: "okx swap get-leverage --instId <id> --mgnMode <cross|isolated>",
        description: "Get current leverage setting for a swap instrument",
      },
      batch: {
        usage: "okx swap batch --action <place|amend|cancel> --orders '<json>'",
        description: "Batch place, amend, or cancel swap orders",
      },
    },
    subgroups: {
      algo: {
        description: "Perpetual swap algo orders (trailing stop, conditional, OCO)",
        commands: {
          orders: {
            usage: "okx swap algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]",
            description: "List swap algo orders",
          },
          trail: {
            usage: "okx swap algo trail --instId <id> --side <buy|sell> --sz <n> --callbackRatio <ratio>\n                   [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]",
            description: "Place a trailing stop algo order for perpetual swap",
          },
          place: {
            usage: "okx swap algo place --instId <id> --side <buy|sell> --sz <n> [--ordType <conditional|oco>]\n                   [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]\n                   [--slTriggerPx <price>] [--slOrdPx <price|-1>]\n                   [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]",
            description: "Place a swap algo order (take-profit/stop-loss)",
          },
          amend: {
            usage: "okx swap algo amend --instId <id> --algoId <id> [--newSz <n>]\n                   [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]\n                   [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]",
            description: "Amend a pending swap algo order",
          },
          cancel: {
            usage: "okx swap algo cancel --instId <id> --algoId <id>",
            description: "Cancel a pending swap algo order",
          },
        },
      },
    },
  },

  futures: {
    description: "Futures trading (orders, positions, algo orders, leverage)",
    commands: {
      orders: {
        usage: "okx futures orders [--instId <id>] [--history] [--archive]",
        description: "List open or historical futures orders",
      },
      positions: {
        usage: "okx futures positions [--instId <id>]",
        description: "Get current futures positions",
      },
      fills: {
        usage: "okx futures fills [--instId <id>] [--ordId <id>] [--archive]",
        description: "Get trade fill history for futures orders",
      },
      place: {
        usage: "okx futures place --instId <id> --side <buy|sell> --ordType <type> --sz <n>\n                 [--tdMode <cross|isolated>] [--posSide <net|long|short>] [--px <price>] [--reduceOnly]\n                 [--tpTriggerPx <price>] [--tpOrdPx <price|-1>] [--slTriggerPx <price>] [--slOrdPx <price|-1>]",
        description: "Place a new futures order (supports attached TP/SL)",
      },
      cancel: {
        usage: "okx futures cancel <instId> --ordId <id>",
        description: "Cancel a pending futures order",
      },
      amend: {
        usage: "okx futures amend --instId <id> [--ordId <id>] [--clOrdId <id>] [--newSz <n>] [--newPx <price>]",
        description: "Amend a pending futures order",
      },
      get: {
        usage: "okx futures get --instId <id> --ordId <id>",
        description: "Get details of a specific futures order",
      },
      close: {
        usage: "okx futures close --instId <id> --mgnMode <cross|isolated> [--posSide <net|long|short>] [--autoCxl]",
        description: "Close a futures position",
      },
      "get-leverage": {
        usage: "okx futures get-leverage --instId <id> --mgnMode <cross|isolated>",
        description: "Get current leverage for a futures instrument",
      },
      leverage: {
        usage: "okx futures leverage --instId <id> --lever <n> --mgnMode <cross|isolated> [--posSide <net|long|short>]",
        description: "Set leverage for a futures instrument",
      },
      batch: {
        usage: "okx futures batch --action <place|amend|cancel> --orders '<json>'",
        description: "Batch place, amend, or cancel futures orders",
      },
    },
    subgroups: {
      algo: {
        description: "Futures algo orders (trailing stop, conditional, OCO)",
        commands: {
          orders: {
            usage: "okx futures algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]",
            description: "List futures algo orders",
          },
          trail: {
            usage: "okx futures algo trail --instId <id> --side <buy|sell> --sz <n> --callbackRatio <ratio>\n                   [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]",
            description: "Place a trailing stop algo order for futures",
          },
          place: {
            usage: "okx futures algo place --instId <id> --side <buy|sell> --sz <n> [--ordType <conditional|oco>]\n                   [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]\n                   [--slTriggerPx <price>] [--slOrdPx <price|-1>]\n                   [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]",
            description: "Place a futures algo order (take-profit/stop-loss)",
          },
          amend: {
            usage: "okx futures algo amend --instId <id> --algoId <id> [--newSz <n>]\n                   [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]\n                   [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]",
            description: "Amend a pending futures algo order",
          },
          cancel: {
            usage: "okx futures algo cancel --instId <id> --algoId <id>",
            description: "Cancel a pending futures algo order",
          },
        },
      },
    },
  },

  option: {
    description: "Options trading (orders, positions, greeks)",
    commands: {
      orders: {
        usage: "okx option orders [--instId <id>] [--uly <uly>] [--history] [--archive]",
        description: "List open or historical option orders",
      },
      get: {
        usage: "okx option get --instId <id> [--ordId <id>] [--clOrdId <id>]",
        description: "Get details of a specific option order",
      },
      positions: {
        usage: "okx option positions [--instId <id>] [--uly <uly>]",
        description: "Get current option positions",
      },
      fills: {
        usage: "okx option fills [--instId <id>] [--ordId <id>] [--archive]",
        description: "Get trade fill history for option orders",
      },
      instruments: {
        usage: "okx option instruments --uly <uly> [--expTime <date>]",
        description: "List tradable option instruments for an underlying",
      },
      greeks: {
        usage: "okx option greeks --uly <uly> [--expTime <date>]",
        description: "Get option greeks (delta, gamma, theta, vega)",
      },
      place: {
        usage: "okx option place --instId <id> --tdMode <cash|cross|isolated> --side <buy|sell> --ordType <type> --sz <n>\n               [--px <price>] [--reduceOnly] [--clOrdId <id>]",
        description: "Place a new option order",
      },
      cancel: {
        usage: "okx option cancel --instId <id> [--ordId <id>] [--clOrdId <id>]",
        description: "Cancel a pending option order",
      },
      amend: {
        usage: "okx option amend --instId <id> [--ordId <id>] [--clOrdId <id>] [--newSz <n>] [--newPx <price>]",
        description: "Amend a pending option order",
      },
      "batch-cancel": {
        usage: "okx option batch-cancel --orders '<json>'",
        description: "Batch cancel option orders",
      },
    },
  },

  earn: {
    description: "Earn products — Simple Earn, On-chain Earn, and DCD (Dual Currency Deposit)",
    subgroups: {
      savings: {
        description: "Simple Earn — flexible savings, fixed-term, and lending",
        commands: {
          balance: {
            usage: "okx earn savings balance [<ccy>]",
            description: "Get savings balance (optionally filter by currency)",
          },
          purchase: {
            usage: "okx earn savings purchase --ccy <ccy> --amt <n> [--rate <rate>]",
            description: "Purchase Simple Earn (flexible savings). Rate defaults to 0.01 (1%)",
          },
          redeem: {
            usage: "okx earn savings redeem --ccy <ccy> --amt <n>",
            description: "Redeem Simple Earn (flexible savings)",
          },
          "set-rate": {
            usage: "okx earn savings set-rate --ccy <ccy> --rate <rate>",
            description: "Set lending rate for a currency",
          },
          "lending-history": {
            usage: "okx earn savings lending-history [--ccy <ccy>] [--limit <n>]",
            description: "Get personal lending records (requires auth)",
          },
          "rate-history": {
            usage: "okx earn savings rate-history [--ccy <ccy>] [--limit <n>]",
            description: "Query Simple Earn lending rates and fixed-term offers (requires auth)",
          },
          "fixed-orders": {
            usage: "okx earn savings fixed-orders [--ccy <ccy>] [--state <pending|earning|expired|settled|cancelled>]",
            description: "List fixed-term earn orders",
          },
          "fixed-purchase": {
            usage: "okx earn savings fixed-purchase --ccy <ccy> --amt <n> --term <term> [--confirm]",
            description: "Purchase Simple Earn Fixed (定期). Preview by default; add --confirm to execute. Funds locked until maturity",
          },
          "fixed-redeem": {
            usage: "okx earn savings fixed-redeem <reqId>",
            description: "Redeem a fixed-term earn order (full amount)",
          },
        },
      },
      onchain: {
        description: "On-chain Earn — staking and DeFi products",
        commands: {
          offers: {
            usage: "okx earn onchain offers [--productId <id>] [--protocolType <type>] [--ccy <ccy>]",
            description: "Browse available on-chain earn products (staking, DeFi)",
          },
          purchase: {
            usage: "okx earn onchain purchase --productId <id> --ccy <ccy> --amt <n> [--term <term>] [--tag <tag>]",
            description: "Purchase an on-chain earn product (stake/deposit)",
          },
          redeem: {
            usage: "okx earn onchain redeem --ordId <id> --protocolType <type> [--allowEarlyRedeem]",
            description: "Redeem an on-chain earn position",
          },
          cancel: {
            usage: "okx earn onchain cancel --ordId <id> --protocolType <type>",
            description: "Cancel a pending on-chain earn order",
          },
          orders: {
            usage: "okx earn onchain orders [--productId <id>] [--protocolType <type>] [--ccy <ccy>] [--state <state>]",
            description: "List active on-chain earn orders",
          },
          history: {
            usage: "okx earn onchain history [--productId <id>] [--protocolType <type>] [--ccy <ccy>]",
            description: "Get on-chain earn order history",
          },
        },
      },
      "auto-earn": {
        description: "Auto-earn — automatically lend, stake, or earn on idle assets",
        commands: {
          status: {
            usage: "okx earn auto-earn status [<ccy>]",
            description: "Query auto-earn status for all or a specific currency",
          },
          on: {
            usage: "okx earn auto-earn on <ccy>",
            description: "Enable auto-earn for a currency (auto-detects lend/stake vs USDG earn)",
          },
          off: {
            usage: "okx earn auto-earn off <ccy>",
            description: "Disable auto-earn for a currency",
          },
        },
      },
      dcd: {
        description: "DCD (Dual Currency Deposit) — structured products with fixed yield",
        commands: {
          pairs: {
            usage: "okx earn dcd pairs",
            description: "List available DCD currency pairs",
          },
          products: {
            usage: "okx earn dcd products --baseCcy <ccy> --quoteCcy <ccy> --optType <C|P>\n                         [--minYield <n>] [--strikeNear <price>]\n                         [--termDays <n>] [--minTermDays <n>] [--maxTermDays <n>]\n                         [--expDate <YYYY-MM-DD|YYYY-MM-DDTHH:mm>]",
            description: "List active DCD products (baseCcy, quoteCcy, optType required). Client-side filters: minYield (e.g. 0.05=5%), strikeNear (±10%), term range, expDate",
          },
          "quote-and-buy": {
            usage: "okx earn dcd quote-and-buy --productId <id> --sz <n> --notionalCcy <ccy> [--clOrdId <id>] [--minAnnualizedYield <pct>]",
            description: "[CAUTION] Subscribe to a DCD product atomically (quote + execute in one step)",
          },
          "redeem-execute": {
            usage: "okx earn dcd redeem-execute --ordId <id>",
            description: "[CAUTION] Re-quote and execute early redemption in one step (recommended for AI agent use)",
          },
          order: {
            usage: "okx earn dcd order --ordId <id>",
            description: "Query current state of a DCD order",
          },
          orders: {
            usage: "okx earn dcd orders [--ordId <id>] [--productId <id>] [--uly <uly>] [--state <state>] [--limit <n>]",
            description: "Get DCD order history. State: initial|live|pending_settle|settled|pending_redeem|redeemed|rejected",
          },
        },
      },
    },
  },

  bot: {
    description: "Trading bot strategies (grid, dca)",
    subgroups: {
      grid: {
        description: "Grid trading bot — create, monitor, and stop grid orders",
        commands: {
          orders: {
            usage: "okx bot grid orders --algoOrdType <grid|contract_grid|moon_grid> [--instId <id>] [--algoId <id>] [--history]",
            description: "List active or historical grid bot orders",
          },
          details: {
            usage: "okx bot grid details --algoOrdType <type> --algoId <id>",
            description: "Get details of a specific grid bot order",
          },
          "sub-orders": {
            usage: "okx bot grid sub-orders --algoOrdType <type> --algoId <id> [--live]",
            description: "List sub-orders of a grid bot (filled or live)",
          },
          create: {
            usage: "okx bot grid create --instId <id> --algoOrdType <grid|contract_grid> --maxPx <px> --minPx <px> --gridNum <n>\n                   [--runType <1|2>] [--quoteSz <n>] [--baseSz <n>]\n                   [--direction <long|short|neutral>] [--lever <n>] [--sz <n>] [--basePos] [--no-basePos]\n                   [--tpTriggerPx <px>] [--slTriggerPx <px>] [--tpRatio <n>] [--slRatio <n>] [--algoClOrdId <id>]",
            description: "Create a new grid bot order (contract grid opens base position by default)",
          },
          stop: {
            usage: "okx bot grid stop --algoId <id> --algoOrdType <type> --instId <id> [--stopType <1|2|3|5|6>]",
            description: "Stop a running grid bot order",
          },
        },
      },
      dca: {
        description: "DCA (Martingale) bot — spot or contract recurring buys",
        commands: {
          orders: {
            usage: "okx bot dca orders [--algoOrdType <spot_dca|contract_dca>] [--algoId <id>] [--instId <id>] [--history]",
            description: "List DCA bots (spot and/or contract)",
          },
          details: {
            usage: "okx bot dca details --algoOrdType <spot_dca|contract_dca> --algoId <id>",
            description: "Get DCA bot details (spot or contract)",
          },
          "sub-orders": {
            usage: "okx bot dca sub-orders --algoOrdType <spot_dca|contract_dca> --algoId <id> [--cycleId <id>]",
            description: "Get DCA cycles/orders (spot or contract)",
          },
          create: {
            usage: "okx bot dca create --algoOrdType <spot_dca|contract_dca> --instId <id> --direction <long|short>\n                 --initOrdAmt <n> --maxSafetyOrds <n> --tpPct <n>\n                 [--lever <n>] [--safetyOrdAmt <n>] [--pxSteps <n>] [--pxStepsMult <n>] [--volMult <n>]\n                 [--slPct <n>] [--slMode <limit|market>] [--allowReinvest <true|false>]\n                 [--triggerStrategy <instant|price|rsi>] [--triggerPx <price>]\n                 [--triggerCond <cross_up|cross_down>] [--thold <n>] [--timeframe <tf>] [--timePeriod <n>]\n                 [--algoClOrdId <id>] [--reserveFunds <true|false>] [--tradeQuoteCcy <ccy>]\n                 Note: --lever required for contract_dca; safetyOrdAmt, pxSteps, pxStepsMult, volMult required when maxSafetyOrds > 0\n                 triggerStrategy: contract_dca supports instant|price|rsi; spot_dca supports instant|rsi",
            description: "Create a DCA (Martingale) bot (spot or contract)",
          },
          stop: {
            usage: "okx bot dca stop --algoOrdType <spot_dca|contract_dca> --algoId <id> [--stopType <1|2>]\n                 Note: --stopType required for spot_dca (1=sell all, 2=keep tokens)",
            description: "Stop a DCA bot (spot or contract)",
          },
        },
      },
    },
  },

  config: {
    description: "Manage CLI configuration profiles",
    commands: {
      init: {
        usage: "okx config init [--lang zh]",
        description: "Initialize a new configuration profile interactively",
      },
      show: {
        usage: "okx config show",
        description: `Show current configuration (file: ${configFilePath()})`,
      },
      set: {
        usage: "okx config set <key> <value>",
        description: "Set a configuration value",
      },
      "setup-clients": {
        usage: "okx config setup-clients",
        description: "Set up MCP client integrations (Cursor, Windsurf, etc.)",
      },
    },
  },

  setup: {
    description: "Set up client integrations (Cursor, Windsurf, Claude, etc.)",
    usage: `okx setup --client <${SUPPORTED_CLIENTS.join("|")}> [--profile <name>] [--modules <list>]`,
  },

  diagnose: {
    description: "Run network / MCP server diagnostics",
    usage: "okx diagnose [--cli | --mcp | --all] [--profile <name>] [--demo | --live] [--output <file>]",
  },

  upgrade: {
    description: "Upgrade okx CLI and MCP server to the latest stable version",
    usage: "okx upgrade [--check] [--beta] [--force] [--json]",
  },
};

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/** Render the global overview (no path arguments). */
function printGlobalHelp(): void {
  const lines: string[] = [
    "",
    `Usage: okx [--profile <name>] [--demo | --live] [--json] <module> <action> [args...]`,
    "",
    "Global Options:",
    `  --profile <name>   Use a named profile from ${configFilePath()}`,
    "  --demo             Use simulated trading (demo) mode",
    "  --live             Force live trading mode (overrides profile demo=true; mutually exclusive with --demo)",
    "  --json             Output raw JSON",
    "  --env              With --json, wrap output as {env, profile, data}",
    "  --verbose          Show detailed network request/response info (stderr)",
    "  --version, -v      Show version",
    "  --help             Show this help",
    "",
    "Modules:",
  ];

  const colWidth = 12;
  for (const [name, group] of Object.entries(HELP_TREE)) {
    lines.push(`  ${name.padEnd(colWidth)}${group.description}`);
  }

  lines.push("", 'Run "okx <module> --help" for module details.', "");
  output(lines.join(EOL));
}

/** Render pure-subgroup module body (e.g. bot). */
function printSubgroupOnlyModule(lines: string[], moduleName: string, group: GroupInfo): void {
  const subgroupNames = Object.keys(group.subgroups!);
  const colWidth = Math.max(...subgroupNames.map((n) => n.length)) + 4;
  lines.push(`Usage: okx ${moduleName} <strategy> <action> [args...]`);
  lines.push("", `${group.description}.`, "");
  lines.push("Strategies:");
  for (const [sgName, sg] of Object.entries(group.subgroups!)) {
    lines.push(`  ${sgName.padEnd(colWidth)}${sg.description}`);
  }
  lines.push("", `Run "okx ${moduleName} <strategy> --help" for details.`);
}

/** Render mixed module body (direct commands + subgroups, e.g. spot, swap). */
function printMixedModule(lines: string[], moduleName: string, group: GroupInfo): void {
  lines.push(`Usage: okx ${moduleName} <action> [args...]`);
  lines.push("", `${group.description}.`, "", "Commands:");
  printCommandList(lines, group.commands!);
  lines.push("", "Subgroups:");
  const subgroupEntries = Object.entries(group.subgroups!);
  const colWidth = Math.max(...subgroupEntries.map(([n]) => n.length)) + 4;
  for (const [sgName, sg] of subgroupEntries) {
    lines.push(`  ${sgName.padEnd(colWidth)}${sg.description}`);
  }
  lines.push("", `Run "okx ${moduleName} <subgroup> --help" for subgroup details.`);
}

/** Render commands-only module body (e.g. market, account). */
function printCommandsOnlyModule(lines: string[], moduleName: string, group: GroupInfo): void {
  lines.push(`Usage: okx ${moduleName} <action> [args...]`);
  lines.push("", `${group.description}.`, "", "Commands:");
  printCommandList(lines, group.commands!);
}

/** Render custom-usage module body (e.g. setup). */
function printUsageModule(lines: string[], group: GroupInfo): void {
  lines.push(`Usage: ${group.usage}`);
  lines.push("", `${group.description}.`);
  if (group.commands) {
    lines.push("");
    for (const cmd of Object.values(group.commands)) {
      lines.push(`  ${cmd.description}`);
      lines.push(`  Usage: ${cmd.usage}`);
    }
  }
}

/** Render module-level help (one path argument, e.g. "spot"). */
function printModuleHelp(moduleName: string): void {
  const group = HELP_TREE[moduleName];
  if (!group) {
    errorLine(`Unknown module: ${moduleName}`);
    process.exitCode = 1;
    return;
  }

  const hasSubgroups = group.subgroups && Object.keys(group.subgroups).length > 0;
  const hasCommands = group.commands && Object.keys(group.commands).length > 0;

  const lines: string[] = [""];

  if (hasSubgroups && !hasCommands) {
    printSubgroupOnlyModule(lines, moduleName, group);
  } else if (hasSubgroups && hasCommands) {
    printMixedModule(lines, moduleName, group);
  } else if (hasCommands) {
    printCommandsOnlyModule(lines, moduleName, group);
  } else if (group.usage) {
    printUsageModule(lines, group);
  }

  lines.push("");
  output(lines.join(EOL));
}

/** Render subgroup-level help (two path arguments, e.g. "bot", "grid"). */
function printSubgroupHelp(moduleName: string, subgroupName: string): void {
  const group = HELP_TREE[moduleName];
  if (!group) {
    errorLine(`Unknown module: ${moduleName}`);
    process.exitCode = 1;
    return;
  }
  const subgroup = group.subgroups?.[subgroupName];
  if (!subgroup) {
    errorLine(`Unknown subgroup: ${moduleName} ${subgroupName}`);
    process.exitCode = 1;
    return;
  }

  const lines: string[] = [
    "",
    `Usage: okx ${moduleName} ${subgroupName} <action> [args...]`,
    "",
    `${subgroup.description}.`,
    "",
    "Commands:",
  ];

  if (subgroup.commands) {
    printCommandList(lines, subgroup.commands);
  }

  lines.push("");
  output(lines.join(EOL));
}

/** Append a formatted command list to the lines array. */
function printCommandList(lines: string[], commands: Record<string, CommandInfo>): void {
  const names = Object.keys(commands);
  const colWidth = Math.max(...names.map((n) => n.length)) + 4;

  for (const [name, cmd] of Object.entries(commands)) {
    lines.push(`  ${name.padEnd(colWidth)}${cmd.description}`);
    // Indent usage lines to align with the description column
    const usageLines = cmd.usage.split("\n");
    lines.push(`  ${" ".repeat(colWidth)}Usage: ${usageLines[0]}`);
    for (const extra of usageLines.slice(1)) {
      lines.push(`  ${" ".repeat(colWidth)}       ${extra.trimStart()}`);
    }
    lines.push("");
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Print help text to stdout.
 *
 * - `printHelp()` — global module overview
 * - `printHelp("market")` — module detail with all commands
 * - `printHelp("bot")` — module overview listing sub-strategies
 * - `printHelp("bot", "grid")` — subgroup detail with all commands
 * - `printHelp("spot", "algo")` — subgroup detail with all commands
 */
export function printHelp(...path: string[]): void {
  const [moduleName, subgroupName] = path;
  if (!moduleName) {
    printGlobalHelp();
  } else if (!subgroupName) {
    printModuleHelp(moduleName);
  } else {
    printSubgroupHelp(moduleName, subgroupName);
  }
}
