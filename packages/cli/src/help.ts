import { SUPPORTED_CLIENTS } from "./commands/client-setup.js";
import { configFilePath } from "@agent-tradekit/core";

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
        description: "List all stock token instruments (instCategory=3, e.g. AAPL-USDT-SWAP)",
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
        description: "Simple Earn — flexible savings and lending",
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
            description: "Get lending history",
          },
          "rate-summary": {
            usage: "okx earn savings rate-summary [<ccy>]",
            description: "Get market lending rate summary (public, no auth needed)",
          },
          "rate-history": {
            usage: "okx earn savings rate-history [--ccy <ccy>] [--limit <n>]",
            description: "Get historical lending rates (public, no auth needed)",
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
          quote: {
            usage: "okx earn dcd quote --productId <id> --sz <n> --notionalCcy <ccy>",
            description: "Request a real-time DCD quote (TTL: 30 seconds)",
          },
          buy: {
            usage: "okx earn dcd buy --quoteId <id> [--clOrdId <id>]",
            description: "[CAUTION] Execute a DCD quote to place a trade. Auto-queries order state after placement",
          },
          "quote-and-buy": {
            usage: "okx earn dcd quote-and-buy --productId <id> --sz <n> --notionalCcy <ccy> [--clOrdId <id>]",
            description: "[CAUTION] Request quote and execute immediately in one step (no confirmation — for AI agent use)",
          },
          "redeem-quote": {
            usage: "okx earn dcd redeem-quote --ordId <id>",
            description: "Request an early redemption quote for a live DCD order (TTL: 15 seconds)",
          },
          redeem: {
            usage: "okx earn dcd redeem --ordId <id> --quoteId <id>",
            description: "[CAUTION] Execute early redemption of a DCD position",
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
    description: "Trading bot strategies (grid, dca, twap, recurring)",
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
            usage: "okx bot grid create --instId <id> --algoOrdType <grid|contract_grid> --maxPx <px> --minPx <px> --gridNum <n>\n                   [--runType <1|2>] [--quoteSz <n>] [--baseSz <n>]\n                   [--direction <long|short|neutral>] [--lever <n>] [--sz <n>] [--basePos] [--no-basePos]\n                   [--tpTriggerPx <px>] [--slTriggerPx <px>] [--algoClOrdId <id>]\n                   [--tpRatio <ratio>] [--slRatio <ratio>] [--tradeQuoteCcy <ccy>]",
            description: "Create a new grid bot order (contract grid opens base position by default)",
          },
          stop: {
            usage: "okx bot grid stop --algoId <id> --algoOrdType <type> --instId <id> [--stopType <1|2|3|5|6>]",
            description: "Stop a running grid bot order",
          },
          "amend-basic": {
            usage: "okx bot grid amend-basic --algoId <id> --minPx <px> --maxPx <px> --gridNum <n> [--topupAmount <n>]",
            description: "Amend grid bot's price range and grid count",
          },
          "amend-order": {
            usage: "okx bot grid amend-order --algoId <id> --instId <id>\n                   [--slTriggerPx <px>] [--tpTriggerPx <px>]\n                   [--tpRatio <ratio>] [--slRatio <ratio>] [--topUpAmt <n>]",
            description: "Amend TP/SL settings of a running grid bot",
          },
          "close-position": {
            usage: "okx bot grid close-position --algoId <id> [--mktClose] [--sz <n>] [--px <price>]",
            description: "Close position of a stopped contract grid bot",
          },
          "cancel-close": {
            usage: "okx bot grid cancel-close --algoId <id> --ordId <id>",
            description: "Cancel a pending close order for contract grid",
          },
          "instant-trigger": {
            usage: "okx bot grid instant-trigger --algoId <id> [--topUpAmt <n>]",
            description: "Immediately trigger a pending-signal grid bot",
          },
          positions: {
            usage: "okx bot grid positions --algoOrdType contract_grid --algoId <id>",
            description: "Get contract grid bot position info",
          },
          "withdraw-income": {
            usage: "okx bot grid withdraw-income --algoId <id>",
            description: "Withdraw profit from a spot grid bot",
          },
          "compute-margin": {
            usage: "okx bot grid compute-margin --algoId <id> --gridType <add|reduce> [--amt <n>]",
            description: "Preview margin adjustment for contract grid",
          },
          "margin-balance": {
            usage: "okx bot grid margin-balance --algoId <id> --gridType <add|reduce> [--amt <n>] [--percent <n>]",
            description: "Adjust margin for contract grid bot",
          },
          "adjust-investment": {
            usage: "okx bot grid adjust-investment --algoId <id> --amt <n> [--allowReinvestProfit <true|false>]",
            description: "Add investment to a running grid bot",
          },
          "ai-param": {
            usage: "okx bot grid ai-param --algoOrdType <grid|contract_grid> --instId <id> [--direction <dir>] [--duration <7D|30D|180D>]",
            description: "Get AI-recommended grid parameters (public, no auth)",
          },
          "min-investment": {
            usage: "okx bot grid min-investment --instId <id> --algoOrdType <type> --gridNum <n>\n                       --maxPx <px> --minPx <px> --runType <1|2>\n                       [--direction <dir>] [--lever <n>] [--basePos] [--investmentType <quote|base|dual>]",
            description: "Calculate minimum investment for grid config (public, no auth)",
          },
          "rsi-back-testing": {
            usage: "okx bot grid rsi-back-testing --instId <id> --timeframe <3m|5m|15m|30m|1H|4H|1D>\n                         --thold <n> --timePeriod <n> [--triggerCond <cond>] [--duration <1M>]",
            description: "RSI signal back testing for grid trigger (public, no auth)",
          },
          "max-quantity": {
            usage: "okx bot grid max-quantity --instId <id> --runType <1|2> --algoOrdType <type>\n                      --maxPx <px> --minPx <px> [--lever <n>]",
            description: "Get maximum grid quantity for config (public, no auth)",
          },
        },
      },
      dca: {
        description: "Contract DCA (Martingale) bot — leveraged recurring buys on futures/swaps",
        commands: {
          orders: {
            usage: "okx bot dca orders [--algoId <id>] [--instId <id>] [--history]",
            description: "List active or historical Contract DCA bot orders",
          },
          details: {
            usage: "okx bot dca details --algoId <id>",
            description: "Get details of a specific Contract DCA bot order",
          },
          "sub-orders": {
            usage: "okx bot dca sub-orders --algoId <id> [--cycleId <id>]",
            description: "List cycles or orders within a cycle of a Contract DCA bot",
          },
          create: {
            usage: "okx bot dca create --instId <id> --lever <n> --direction <long|short>\n                 --initOrdAmt <n> --maxSafetyOrds <n> --tpPct <n>\n                 [--safetyOrdAmt <n>] [--pxSteps <n>] [--pxStepsMult <n>] [--volMult <n>]\n                 [--slPct <n>] [--slMode <limit|market>]\n                 [--allowReinvest <true|false>] [--triggerStrategy <instant|price|rsi>] [--triggerPx <price>]\n                 [--triggerCond <cross_up|cross_down>] [--thold <n>] [--timePeriod <n>] [--timeframe <3m|5m|15m|30m|1H|4H|1D>]\n                 [--trackingMode <sync|async>] [--profitSharingRatio <0|0.1|0.2|0.3>]\n                 Note: safetyOrdAmt, pxSteps required when maxSafetyOrds > 0; pxStepsMult, volMult required when maxSafetyOrds > 1\n                 Note: slMode required when slPct is set; triggerCond, thold, timeframe required when triggerStrategy=rsi",
            description: "Create a new Contract DCA bot order",
          },
          stop: {
            usage: "okx bot dca stop --algoId <id>",
            description: "Stop a running Contract DCA bot order",
          },
          "margin-add": {
            usage: "okx bot dca margin-add --algoId <id> --amt <n>",
            description: "Add margin to a running DCA bot (CLI-only)",
          },
          "margin-reduce": {
            usage: "okx bot dca margin-reduce --algoId <id> --amt <n>",
            description: "Reduce margin from a running DCA bot (CLI-only)",
          },
          "set-tp": {
            usage: "okx bot dca set-tp --algoId <id> --tpPrice <price>",
            description: "Update take-profit price for a running DCA bot (CLI-only)",
          },
          "set-reinvest": {
            usage: "okx bot dca set-reinvest --algoId <id> --allowReinvest <true|false>",
            description: "Enable or disable reinvestment for a DCA bot (CLI-only)",
          },
          "manual-buy": {
            usage: "okx bot dca manual-buy --algoId <id> --amt <n> --px <price>",
            description: "Manually trigger a buy order within a DCA bot cycle (CLI-only)",
          },
        },
      },
      twap: {
        description: "TWAP (Time-Weighted Average Price) — split large orders over time intervals",
        commands: {
          orders: {
            usage: "okx bot twap orders [--instId <id>] [--instType <SPOT|SWAP|FUTURES|MARGIN>] [--history] [--state <effective|canceled|order_failed>]",
            description: "List active or historical TWAP algo orders",
          },
          details: {
            usage: "okx bot twap details --algoId <id> | --algoClOrdId <id>",
            description: "Get details of a specific TWAP algo order",
          },
          place: {
            usage: "okx bot twap place --instId <id> --tdMode <cross|isolated|cash> --side <buy|sell>\n                   --sz <n> --szLimit <n> --pxLimit <px> --timeInterval <sec>\n                   --pxVar <bps> | --pxSpread <abs>\n                   [--posSide <long|short|net>] [--algoClOrdId <id>] [--ccy <ccy>] [--tradeQuoteCcy <ccy>]\n                   [--reduceOnly] [--isTradeBorrowMode]",
            description: "Place a TWAP algo order to split a large order over time",
          },
          cancel: {
            usage: "okx bot twap cancel --instId <id> --algoId <id> | --algoClOrdId <id>",
            description: "Cancel a running TWAP algo order",
          },
        },
      },
      recurring: {
        description: "Spot Recurring Buy (定投) — periodic automatic purchases",
        commands: {
          orders: {
            usage: "okx bot recurring orders [--algoId <id>] [--history]",
            description: "List active or historical recurring buy orders",
          },
          details: {
            usage: "okx bot recurring details --algoId <id>",
            description: "Get details of a specific recurring buy order",
          },
          "sub-orders": {
            usage: "okx bot recurring sub-orders --algoId <id>",
            description: "List sub-orders (individual buy executions) of a recurring buy",
          },
          create: {
            usage: "okx bot recurring create --stgyName <name> --recurringList '<json>'\n                      --period <hourly|daily|weekly|monthly> --recurringTime <0-23> --timeZone <n>\n                      --amt <n> --investmentCcy <ccy> --tdMode <cross|cash>\n                      [--recurringDay <n>] [--recurringHour <1|4|8|12>] [--tradeQuoteCcy <ccy>] [--algoClOrdId <id>]",
            description: "Create a new recurring buy order",
          },
          amend: {
            usage: "okx bot recurring amend --algoId <id> --stgyName <name>",
            description: "Amend strategy name of a running recurring buy order",
          },
          stop: {
            usage: "okx bot recurring stop --algoId <id>",
            description: "Stop a running recurring buy order",
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
    description: "Run network diagnostics (DNS, TCP, TLS, API, auth)",
    usage: "okx diagnose [--profile <name>] [--demo]",
  },
};

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/** Render the global overview (no path arguments). */
function printGlobalHelp(): void {
  const lines: string[] = [
    "",
    `Usage: okx [--profile <name>] [--demo] [--json] <module> <action> [args...]`,
    "",
    "Global Options:",
    `  --profile <name>   Use a named profile from ${configFilePath()}`,
    "  --demo             Use simulated trading (demo) mode",
    "  --json             Output raw JSON",
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
  process.stdout.write(lines.join("\n"));
}

/** Render module-level help (one path argument, e.g. "spot"). */
function printModuleHelp(moduleName: string): void {
  const group = HELP_TREE[moduleName];
  if (!group) {
    process.stderr.write(`Unknown module: ${moduleName}\n`);
    process.exitCode = 1;
    return;
  }

  const hasSubgroups = group.subgroups && Object.keys(group.subgroups).length > 0;
  const hasCommands = group.commands && Object.keys(group.commands).length > 0;

  const lines: string[] = [""];

  if (hasSubgroups && !hasCommands) {
    // Pure subgroup module (e.g. bot)
    const subgroupNames = Object.keys(group.subgroups!);
    lines.push(`Usage: okx ${moduleName} <strategy> <action> [args...]`);
    lines.push("", `${group.description}.`, "");
    lines.push("Strategies:");
    const colWidth = Math.max(...subgroupNames.map((n) => n.length)) + 4;
    for (const [sgName, sg] of Object.entries(group.subgroups!)) {
      lines.push(`  ${sgName.padEnd(colWidth)}${sg.description}`);
    }
    lines.push("", `Run "okx ${moduleName} <strategy> --help" for details.`);
  } else if (hasSubgroups && hasCommands) {
    // Mixed: has both direct commands and subgroups (e.g. spot, swap)
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
  } else if (hasCommands) {
    // Plain module with direct commands only (e.g. market, account)
    lines.push(`Usage: okx ${moduleName} <action> [args...]`);
    lines.push("", `${group.description}.`, "", "Commands:");
    printCommandList(lines, group.commands!);
  } else if (group.usage) {
    // Module with no sub-commands (e.g. setup)
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

  lines.push("");
  process.stdout.write(lines.join("\n"));
}

/** Render subgroup-level help (two path arguments, e.g. "bot", "grid"). */
function printSubgroupHelp(moduleName: string, subgroupName: string): void {
  const group = HELP_TREE[moduleName];
  if (!group) {
    process.stderr.write(`Unknown module: ${moduleName}\n`);
    process.exitCode = 1;
    return;
  }
  const subgroup = group.subgroups?.[subgroupName];
  if (!subgroup) {
    process.stderr.write(`Unknown subgroup: ${moduleName} ${subgroupName}\n`);
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
  process.stdout.write(lines.join("\n"));
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
