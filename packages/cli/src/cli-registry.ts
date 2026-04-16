/**
 * CLI Command Registry — declarative mapping of CLI command paths to ToolSpec names.
 *
 * This is the single source of truth for CLI command structure.  Help generation
 * reads this registry and auto-fills descriptions from ToolSpec when not overridden.
 * The drift test uses `getAllRegisteredToolNames()` to verify coverage.
 *
 * Structure mirrors the help tree:
 *   CliRegistry[module][command]  or  CliRegistry[module][subgroup][command]
 *
 * Usage strings are intentionally hand-crafted (Phase 1) to preserve visual quality.
 * Descriptions are taken from the current HELP_TREE for backward-compat; they can be
 * removed later to auto-derive from ToolSpec.description.
 */

import { SUPPORTED_CLIENTS } from "./commands/client-setup.js";
import { configFilePath } from "@agent-tradekit/core";

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface CliCommandEntry {
  /** ToolSpec name this CLI command calls; null for management/composite commands. */
  toolName: string | null;
  /**
   * Additional ToolSpec names covered by this command (e.g. batch --action place|amend|cancel
   * routes to different tools; bills --archive routes to bills_archive).
   * Listed here so drift test covers them even though the primary toolName is different.
   */
  alternateTools?: string[];
  /** Full CLI usage line (may contain \n for continuation lines). */
  usage: string;
  /** One-line description. If omitted, auto-derived from ToolSpec.description. */
  description?: string;
}

export interface CliModuleEntry {
  /** Module description; if omitted, falls back to MODULE_DESCRIPTIONS[key]. */
  description?: string;
  /** For usage-only modules (setup, diagnose) that have no sub-commands. */
  usage?: string;
  /** Direct commands in this module or subgroup. */
  commands?: Record<string, CliCommandEntry>;
  /** Nested subgroups (e.g. spot→algo, earn→savings). */
  subgroups?: Record<string, CliModuleEntry>;
}

export type CliRegistry = Record<string, CliModuleEntry>;

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const CLI_REGISTRY: CliRegistry = {
  // ── market ─────────────────────────────────────────────────────────────────
  market: {
    description: "Market data (ticker, orderbook, candles, trades)",
    commands: {
      ticker: {
        toolName: "market_get_ticker",
        usage: "okx market ticker <instId>",
        description: "Get latest ticker data for an instrument",
      },
      tickers: {
        toolName: "market_get_tickers",
        usage: "okx market tickers <instType>",
        description: "Get all tickers for an instrument type (SPOT|SWAP|FUTURES|OPTION)",
      },
      orderbook: {
        toolName: "market_get_orderbook",
        usage: "okx market orderbook <instId> [--sz <n>]",
        description: "Get order book depth for an instrument",
      },
      candles: {
        toolName: "market_get_candles",
        usage: "okx market candles <instId> [--bar <bar>] [--limit <n>]",
        description: "Get candlestick (OHLCV) data",
      },
      instruments: {
        toolName: "market_get_instruments",
        usage: "okx market instruments --instType <type> [--instId <id>]",
        description: "List tradable instruments of a given type",
      },
      "funding-rate": {
        toolName: "market_get_funding_rate",
        usage: "okx market funding-rate <instId> [--history] [--limit <n>]",
        description: "Get current or historical funding rate (instId must be SWAP, e.g. BTC-USDT-SWAP)",
      },
      "mark-price": {
        toolName: "market_get_mark_price",
        usage: "okx market mark-price --instType <MARGIN|SWAP|FUTURES|OPTION> [--instId <id>]",
        description: "Get mark price for instruments",
      },
      trades: {
        toolName: "market_get_trades",
        usage: "okx market trades <instId> [--limit <n>]",
        description: "Get recent trades for an instrument",
      },
      "index-ticker": {
        toolName: "market_get_index_ticker",
        usage: "okx market index-ticker [--instId <id>] [--quoteCcy <ccy>]",
        description: "Get index ticker data",
      },
      "index-candles": {
        toolName: "market_get_index_candles",
        usage: "okx market index-candles <instId> [--bar <bar>] [--limit <n>] [--history]",
        description: "Get index candlestick data",
      },
      "price-limit": {
        toolName: "market_get_price_limit",
        usage: "okx market price-limit <instId>",
        description: "Get price limit for an instrument",
      },
      "open-interest": {
        toolName: "market_get_open_interest",
        usage: "okx market open-interest --instType <SWAP|FUTURES|OPTION> [--instId <id>]",
        description: "Get open interest for instruments",
      },
      "stock-tokens": {
        toolName: "market_get_stock_tokens",
        usage: "okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>]",
        description: "[Deprecated: use instruments-by-category --instCategory 3] List all stock token instruments (instCategory=3, e.g. AAPL-USDT-SWAP)",
      },
      "instruments-by-category": {
        toolName: "market_get_instruments_by_category",
        usage: "okx market instruments-by-category --instCategory <4|5|6|7> [--instType <SPOT|SWAP>] [--instId <id>]",
        description: "List instruments by asset category: 4=Metals (gold/silver), 5=Commodities (oil/gas), 6=Forex (EUR/USD), 7=Bonds",
      },
      filter: {
        toolName: "market_filter",
        usage: "okx market filter --instType <SPOT|SWAP|FUTURES> [--sortBy <field>] [--sortOrder <asc|desc>] [--limit <n>] [--baseCcy <ccy>] [--quoteCcy <ccy>] [--settleCcy <ccy>] [--instFamily <fam>] [--ctType <linear|inverse>] [--minLast <n>] [--maxLast <n>] [--minChg24hPct <n>] [--maxChg24hPct <n>] [--minMarketCapUsd <n>] [--maxMarketCapUsd <n>] [--minVolUsd24h <n>] [--maxVolUsd24h <n>] [--minFundingRate <n>] [--maxFundingRate <n>] [--minOiUsd <n>] [--maxOiUsd <n>]",
        description: "Screen / rank instruments by multi-dimensional criteria (price, volume, OI, funding rate, market cap, etc.)",
      },
      "oi-history": {
        toolName: "market_get_oi_history",
        usage: "okx market oi-history <instId> [--bar <5m|15m|1H|4H|1D>] [--limit <n>] [--ts <ms>]",
        description: "Open interest history time series with bar-over-bar delta for a single instrument",
      },
      "oi-change": {
        toolName: "market_filter_oi_change",
        usage: "okx market oi-change --instType <SWAP|FUTURES> [--bar <5m|15m|1H|4H|1D>] [--sortBy <field>] [--sortOrder <asc|desc>] [--limit <n>] [--minOiUsd <n>] [--minVolUsd24h <n>] [--minAbsOiDeltaPct <n>]",
        description: "Find instruments with largest OI changes over a bar window (accumulation/distribution scanner)",
      },
    },
    subgroups: {
      indicator: {
        description: "Technical indicators and chart patterns",
        commands: {
          list: {
            toolName: "market_list_indicators",
            usage: "okx market indicator list",
            description: "List all supported technical indicators",
          },
          "<instId> <indicator>": {
            toolName: "market_get_indicator",
            usage: "okx market indicator <instId> <indicator> [--bar <bar>] [--limit <n>] [--backtest-time <ts>] [--params <json>]",
            description: "Get indicator values for an instrument (e.g. okx market indicator BTC-USDT-SWAP rsi)",
          },
        },
      },
    },
  },

  // ── account ────────────────────────────────────────────────────────────────
  account: {
    description: "Account balance, positions, bills, and configuration",
    commands: {
      balance: {
        toolName: "account_get_balance",
        usage: "okx account balance [<ccy>]",
        description: "Get trading account balance",
      },
      "asset-balance": {
        toolName: "account_get_asset_balance",
        usage: "okx account asset-balance [--ccy <ccy>]",
        description: "Get funding account asset balance",
      },
      positions: {
        toolName: "account_get_positions",
        usage: "okx account positions [--instType <type>] [--instId <id>]",
        description: "Get current open positions",
      },
      "positions-history": {
        toolName: "account_get_positions_history",
        usage: "okx account positions-history [--instType <type>] [--instId <id>] [--limit <n>]",
        description: "Get historical positions",
      },
      bills: {
        toolName: "account_get_bills",
        alternateTools: ["account_get_bills_archive"],
        usage: "okx account bills [--instType <type>] [--ccy <ccy>] [--limit <n>] [--archive]",
        description: "Get account bill history",
      },
      fees: {
        toolName: "account_get_trade_fee",
        usage: "okx account fees --instType <type> [--instId <id>]",
        description: "Get trading fee rates",
      },
      config: {
        toolName: "account_get_config",
        usage: "okx account config",
        description: "Get account configuration",
      },
      "set-position-mode": {
        toolName: "account_set_position_mode",
        usage: "okx account set-position-mode --posMode <long_short_mode|net_mode>",
        description: "Set position mode (long/short or net)",
      },
      "max-size": {
        toolName: "account_get_max_size",
        usage: "okx account max-size --instId <id> --tdMode <cross|isolated> [--px <price>]",
        description: "Get maximum order size for an instrument",
      },
      "max-avail-size": {
        toolName: "account_get_max_avail_size",
        usage: "okx account max-avail-size --instId <id> --tdMode <cross|isolated|cash>",
        description: "Get maximum available tradable amount",
      },
      "max-withdrawal": {
        toolName: "account_get_max_withdrawal",
        usage: "okx account max-withdrawal [--ccy <ccy>]",
        description: "Get maximum withdrawable amount",
      },
      transfer: {
        toolName: "account_transfer",
        usage: "okx account transfer --ccy <ccy> --amt <n> --from <acct> --to <acct> [--transferType <0|1|2|3>]",
        description: "Transfer funds between accounts",
      },
      audit: {
        // trade_get_history ToolSpec reads the same local log files as cmdAccountAudit.
        // CLI reads files directly without routing through ToolRunner for performance,
        // but conceptually this command is the CLI representation of the ToolSpec.
        toolName: "trade_get_history",
        usage: "okx account audit [--tool <name>] [--since <ISO-date>] [--limit <n>]",
        description: "Audit account activity and tool call history",
      },
    },
  },

  // ── spot ───────────────────────────────────────────────────────────────────
  spot: {
    description: "Spot trading (orders, algo orders)",
    commands: {
      orders: {
        toolName: "spot_get_orders",
        usage: "okx spot orders [--instId <id>] [--history]",
        description: "List open or historical spot orders",
      },
      get: {
        toolName: "spot_get_order",
        usage: "okx spot get --instId <id> [--ordId <id>] [--clOrdId <id>]",
        description: "Get details of a specific spot order",
      },
      fills: {
        toolName: "spot_get_fills",
        usage: "okx spot fills [--instId <id>] [--ordId <id>]",
        description: "Get trade fill history for spot orders",
      },
      place: {
        toolName: "spot_place_order",
        usage: "okx spot place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--px <price>] [--tdMode <cash|cross|isolated>]\n                [--tgtCcy <base_ccy|quote_ccy>] [--clOrdId <id>]\n                [--tpTriggerPx <price>] [--tpOrdPx <price|-1>] [--slTriggerPx <price>] [--slOrdPx <price|-1>]",
        description: "Place a new spot order (supports attached TP/SL)",
      },
      amend: {
        toolName: "spot_amend_order",
        usage: "okx spot amend --instId <id> --ordId <id> [--newSz <n>] [--newPx <price>]",
        description: "Amend a pending spot order (price/size only; to modify TP/SL use 'okx spot algo amend')",
      },
      cancel: {
        toolName: "spot_cancel_order",
        usage: "okx spot cancel <instId> [--ordId <id>] [--clOrdId <id>]",
        description: "Cancel a pending spot order",
      },
      batch: {
        toolName: "spot_batch_orders",
        alternateTools: ["spot_batch_amend", "spot_batch_cancel"],
        usage: "okx spot batch --action <place|amend|cancel> --orders '<json>'",
        description: "Batch place, amend, or cancel spot orders",
      },
    },
    subgroups: {
      algo: {
        description: "Spot algo orders (conditional, OCO, take-profit/stop-loss)",
        commands: {
          orders: {
            toolName: "spot_get_algo_orders",
            usage: "okx spot algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]",
            description: "List spot algo orders",
          },
          place: {
            toolName: "spot_place_algo_order",
            usage: "okx spot algo place --instId <id> --side <buy|sell> --sz <n> [--ordType <conditional|oco>]\n                    [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]\n                    [--slTriggerPx <price>] [--slOrdPx <price|-1>] [--tdMode <cash|cross|isolated>]",
            description: "Place a spot algo order (take-profit/stop-loss)",
          },
          trail: {
            toolName: "spot_place_algo_order",
            usage: "okx spot algo trail --instId <id> --side <buy|sell> --sz <n> --callbackRatio <ratio>\n                    [--activePx <price>] [--tdMode <cash|cross|isolated>]",
            description: "Place a trailing stop algo order for spot",
          },
          amend: {
            toolName: "spot_amend_algo_order",
            usage: "okx spot algo amend --instId <id> --algoId <id> [--newSz <n>]\n                    [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]\n                    [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]",
            description: "Amend a pending spot algo order (including attached TP/SL)",
          },
          cancel: {
            toolName: "spot_cancel_algo_order",
            usage: "okx spot algo cancel --instId <id> --algoId <id>",
            description: "Cancel a pending spot algo order",
          },
        },
      },
    },
  },

  // ── swap ───────────────────────────────────────────────────────────────────
  swap: {
    description: "Perpetual swap trading (orders, algo orders)",
    commands: {
      positions: {
        toolName: "swap_get_positions",
        usage: "okx swap positions [<instId>]",
        description: "Get current perpetual swap positions",
      },
      orders: {
        toolName: "swap_get_orders",
        usage: "okx swap orders [--instId <id>] [--history] [--archive]",
        description: "List open or historical swap orders",
      },
      get: {
        toolName: "swap_get_order",
        usage: "okx swap get --instId <id> [--ordId <id>] [--clOrdId <id>]",
        description: "Get details of a specific swap order",
      },
      fills: {
        toolName: "swap_get_fills",
        usage: "okx swap fills [--instId <id>] [--ordId <id>] [--archive]",
        description: "Get trade fill history for swap orders",
      },
      place: {
        toolName: "swap_place_order",
        usage: "okx swap place --instId <id> --side <buy|sell> --ordType <type> --sz <n> [--posSide <side>] [--px <price>]\n               [--tdMode <cross|isolated>] [--tgtCcy <base_ccy|quote_ccy|margin>] [--reduceOnly] [--clOrdId <id>]\n               [--tpTriggerPx <price>] [--tpOrdPx <price|-1>] [--slTriggerPx <price>] [--slOrdPx <price|-1>]",
        description: "Place a new perpetual swap order (supports attached TP/SL)",
      },
      cancel: {
        toolName: "swap_cancel_order",
        usage: "okx swap cancel <instId> [--ordId <id>] [--clOrdId <id>]",
        description: "Cancel a pending swap order",
      },
      amend: {
        // swap amend uses spot_amend_order (same OKX /trade/amend-order endpoint works for all types)
        toolName: "spot_amend_order",
        usage: "okx swap amend --instId <id> --ordId <id> [--newSz <n>] [--newPx <price>]",
        description: "Amend a pending swap order (price/size only; to modify attached TP/SL use 'okx swap algo amend')",
      },
      close: {
        toolName: "swap_close_position",
        usage: "okx swap close --instId <id> --mgnMode <cross|isolated> [--posSide <net|long|short>] [--autoCxl]",
        description: "Close a swap position",
      },
      leverage: {
        toolName: "swap_set_leverage",
        usage: "okx swap leverage --instId <id> --lever <n> --mgnMode <cross|isolated> [--posSide <side>]",
        description: "Set leverage for a swap instrument",
      },
      "get-leverage": {
        toolName: "swap_get_leverage",
        usage: "okx swap get-leverage --instId <id> --mgnMode <cross|isolated>",
        description: "Get current leverage setting for a swap instrument",
      },
      batch: {
        toolName: "swap_batch_orders",
        alternateTools: ["swap_batch_amend", "swap_batch_cancel"],
        usage: "okx swap batch --action <place|amend|cancel> --orders '<json>'",
        description: "Batch place, amend, or cancel swap orders",
      },
    },
    subgroups: {
      algo: {
        description: "Perpetual swap algo orders (trailing stop, conditional, OCO)",
        commands: {
          orders: {
            toolName: "swap_get_algo_orders",
            usage: "okx swap algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]",
            description: "List swap algo orders",
          },
          trail: {
            toolName: "swap_place_move_stop_order",
            usage: "okx swap algo trail --instId <id> --side <buy|sell> --sz <n> --callbackRatio <ratio>\n                   [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]",
            description: "Place a trailing stop algo order for perpetual swap",
          },
          place: {
            toolName: "swap_place_algo_order",
            usage: "okx swap algo place --instId <id> --side <buy|sell> --sz <n> [--ordType <conditional|oco>]\n                   [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]\n                   [--slTriggerPx <price>] [--slOrdPx <price|-1>]\n                   [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]",
            description: "Place a swap algo order (take-profit/stop-loss)",
          },
          amend: {
            toolName: "swap_amend_algo_order",
            usage: "okx swap algo amend --instId <id> --algoId <id> [--newSz <n>]\n                   [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]\n                   [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]",
            description: "Amend a pending swap algo order (including attached TP/SL)",
          },
          cancel: {
            toolName: "swap_cancel_algo_orders",
            usage: "okx swap algo cancel --instId <id> --algoId <id>",
            description: "Cancel a pending swap algo order",
          },
        },
      },
    },
  },

  // ── futures ────────────────────────────────────────────────────────────────
  futures: {
    description: "Futures trading (orders, positions, algo orders, leverage)",
    commands: {
      orders: {
        toolName: "futures_get_orders",
        usage: "okx futures orders [--instId <id>] [--history] [--archive]",
        description: "List open or historical futures orders",
      },
      positions: {
        toolName: "futures_get_positions",
        usage: "okx futures positions [--instId <id>]",
        description: "Get current futures positions",
      },
      fills: {
        toolName: "futures_get_fills",
        usage: "okx futures fills [--instId <id>] [--ordId <id>] [--archive]",
        description: "Get trade fill history for futures orders",
      },
      place: {
        toolName: "futures_place_order",
        usage: "okx futures place --instId <id> --side <buy|sell> --ordType <type> --sz <n>\n                 [--tdMode <cross|isolated>] [--posSide <net|long|short>] [--px <price>] [--reduceOnly]\n                 [--tgtCcy <base_ccy|quote_ccy|margin>] [--clOrdId <id>]\n                 [--tpTriggerPx <price>] [--tpOrdPx <price|-1>] [--slTriggerPx <price>] [--slOrdPx <price|-1>]",
        description: "Place a new futures order (supports attached TP/SL)",
      },
      cancel: {
        toolName: "futures_cancel_order",
        usage: "okx futures cancel <instId> [--ordId <id>] [--clOrdId <id>]",
        description: "Cancel a pending futures order",
      },
      amend: {
        toolName: "futures_amend_order",
        usage: "okx futures amend --instId <id> [--ordId <id>] [--clOrdId <id>] [--newSz <n>] [--newPx <price>]",
        description: "Amend a pending futures order (price/size only; to modify TP/SL use 'okx futures algo amend')",
      },
      get: {
        toolName: "futures_get_order",
        usage: "okx futures get --instId <id> [--ordId <id>] [--clOrdId <id>]",
        description: "Get details of a specific futures order",
      },
      close: {
        toolName: "futures_close_position",
        usage: "okx futures close --instId <id> --mgnMode <cross|isolated> [--posSide <net|long|short>] [--autoCxl]",
        description: "Close a futures position",
      },
      "get-leverage": {
        toolName: "futures_get_leverage",
        usage: "okx futures get-leverage --instId <id> --mgnMode <cross|isolated>",
        description: "Get current leverage for a futures instrument",
      },
      leverage: {
        toolName: "futures_set_leverage",
        usage: "okx futures leverage --instId <id> --lever <n> --mgnMode <cross|isolated> [--posSide <net|long|short>]",
        description: "Set leverage for a futures instrument",
      },
      batch: {
        toolName: "futures_batch_orders",
        alternateTools: ["futures_batch_amend", "futures_batch_cancel"],
        usage: "okx futures batch --action <place|amend|cancel> --orders '<json>'",
        description: "Batch place, amend, or cancel futures orders",
      },
    },
    subgroups: {
      algo: {
        description: "Futures algo orders (trailing stop, conditional, OCO)",
        commands: {
          orders: {
            toolName: "futures_get_algo_orders",
            usage: "okx futures algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]",
            description: "List futures algo orders",
          },
          trail: {
            toolName: "futures_place_move_stop_order",
            usage: "okx futures algo trail --instId <id> --side <buy|sell> --sz <n> --callbackRatio <ratio>\n                   [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]",
            description: "Place a trailing stop algo order for futures",
          },
          place: {
            toolName: "futures_place_algo_order",
            usage: "okx futures algo place --instId <id> --side <buy|sell> --sz <n> [--ordType <conditional|oco>]\n                   [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]\n                   [--slTriggerPx <price>] [--slOrdPx <price|-1>]\n                   [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]",
            description: "Place a futures algo order (take-profit/stop-loss)",
          },
          amend: {
            toolName: "futures_amend_algo_order",
            usage: "okx futures algo amend --instId <id> --algoId <id> [--newSz <n>]\n                   [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]\n                   [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]",
            description: "Amend a pending futures algo order (including attached TP/SL)",
          },
          cancel: {
            toolName: "futures_cancel_algo_orders",
            usage: "okx futures algo cancel --instId <id> --algoId <id>",
            description: "Cancel a pending futures algo order",
          },
        },
      },
    },
  },

  // ── option ─────────────────────────────────────────────────────────────────
  option: {
    description: "Options trading (orders, positions, greeks)",
    commands: {
      orders: {
        toolName: "option_get_orders",
        usage: "okx option orders [--instId <id>] [--uly <uly>] [--history] [--archive]",
        description: "List open or historical option orders",
      },
      get: {
        toolName: "option_get_order",
        usage: "okx option get --instId <id> [--ordId <id>] [--clOrdId <id>]",
        description: "Get details of a specific option order",
      },
      positions: {
        toolName: "option_get_positions",
        usage: "okx option positions [--instId <id>] [--uly <uly>]",
        description: "Get current option positions",
      },
      fills: {
        toolName: "option_get_fills",
        usage: "okx option fills [--instId <id>] [--ordId <id>] [--archive]",
        description: "Get trade fill history for option orders",
      },
      instruments: {
        toolName: "option_get_instruments",
        usage: "okx option instruments --uly <uly> [--expTime <date>]",
        description: "List tradable option instruments for an underlying",
      },
      greeks: {
        toolName: "option_get_greeks",
        usage: "okx option greeks --uly <uly> [--expTime <date>]",
        description: "Get option greeks (delta, gamma, theta, vega)",
      },
      place: {
        toolName: "option_place_order",
        usage: "okx option place --instId <id> --tdMode <cash|cross|isolated> --side <buy|sell> --ordType <type> --sz <n>\n               [--px <price>] [--tgtCcy <base_ccy|quote_ccy|margin>] [--reduceOnly] [--clOrdId <id>]\n               [--tpTriggerPx <price>] [--tpOrdPx <price|-1>] [--slTriggerPx <price>] [--slOrdPx <price|-1>]",
        description: "Place a new option order",
      },
      cancel: {
        toolName: "option_cancel_order",
        usage: "okx option cancel --instId <id> [--ordId <id>] [--clOrdId <id>]",
        description: "Cancel a pending option order",
      },
      amend: {
        toolName: "option_amend_order",
        usage: "okx option amend --instId <id> [--ordId <id>] [--clOrdId <id>] [--newSz <n>] [--newPx <price>]",
        description: "Amend a pending option order (price/size only; to modify TP/SL use 'okx option algo amend')",
      },
      "batch-cancel": {
        toolName: "option_batch_cancel",
        usage: "okx option batch-cancel --orders '<json>'",
        description: "Batch cancel option orders",
      },
    },
    subgroups: {
      algo: {
        description: "Option algo orders (conditional, TP/SL)",
        commands: {
          orders: {
            toolName: "option_get_algo_orders",
            usage: "okx option algo orders [--instId <id>] [--history] [--ordType <conditional|oco>]",
            description: "List option algo orders",
          },
          place: {
            toolName: "option_place_algo_order",
            usage: "okx option algo place --instId <id> --tdMode <cash|cross|isolated> --side <buy|sell> --sz <n>\n                   [--ordType <conditional|oco>] [--tpTriggerPx <price>] [--tpOrdPx <price|-1>]\n                   [--slTriggerPx <price>] [--slOrdPx <price|-1>] [--reduceOnly] [--clOrdId <id>]",
            description: "Place an option algo order (take-profit/stop-loss)",
          },
          amend: {
            toolName: "option_amend_algo_order",
            usage: "okx option algo amend --instId <id> --algoId <id> [--newSz <n>]\n                   [--newTpTriggerPx <price>] [--newTpOrdPx <price|-1>]\n                   [--newSlTriggerPx <price>] [--newSlOrdPx <price|-1>]",
            description: "Amend a pending option algo order (including attached TP/SL)",
          },
          cancel: {
            toolName: "option_cancel_algo_orders",
            usage: "okx option algo cancel --instId <id> --algoId <id>",
            description: "Cancel a pending option algo order",
          },
        },
      },
    },
  },

  // ── earn ───────────────────────────────────────────────────────────────────
  earn: {
    description: "Earn products — Simple Earn, On-chain Earn, DCD, Flash Earn, and Auto-Earn",
    subgroups: {
      savings: {
        description: "Simple Earn — flexible savings, fixed-term, and lending",
        commands: {
          balance: {
            toolName: "earn_get_savings_balance",
            usage: "okx earn savings balance [<ccy>]",
            description: "Get savings balance (optionally filter by currency)",
          },
          purchase: {
            toolName: "earn_savings_purchase",
            usage: "okx earn savings purchase --ccy <ccy> --amt <n> [--rate <rate>]",
            description: "Purchase Simple Earn (flexible savings). Rate defaults to 0.01 (1%)",
          },
          redeem: {
            toolName: "earn_savings_redeem",
            usage: "okx earn savings redeem --ccy <ccy> --amt <n>",
            description: "Redeem Simple Earn (flexible savings)",
          },
          "set-rate": {
            toolName: "earn_set_lending_rate",
            usage: "okx earn savings set-rate --ccy <ccy> --rate <rate>",
            description: "Set lending rate for a currency",
          },
          "lending-history": {
            toolName: "earn_get_lending_history",
            usage: "okx earn savings lending-history [--ccy <ccy>] [--limit <n>]",
            description: "Get personal lending records (requires auth)",
          },
          "rate-history": {
            toolName: "earn_get_lending_rate_history",
            usage: "okx earn savings rate-history [--ccy <ccy>] [--limit <n>]",
            description: "Query Simple Earn lending rates and fixed-term offers (requires auth)",
          },
          "fixed-orders": {
            toolName: "earn_get_fixed_order_list",
            usage: "okx earn savings fixed-orders [--ccy <ccy>] [--state <pending|earning|expired|settled|cancelled>]",
            description: "List fixed-term earn orders",
          },
          "fixed-purchase": {
            toolName: "earn_fixed_purchase",
            usage: "okx earn savings fixed-purchase --ccy <ccy> --amt <n> --term <term> [--confirm]",
            description: "Purchase Simple Earn Fixed (定期). Preview by default; add --confirm to execute. Funds locked until maturity",
          },
          "fixed-redeem": {
            toolName: "earn_fixed_redeem",
            usage: "okx earn savings fixed-redeem <reqId>",
            description: "Redeem a fixed-term earn order (full amount)",
          },
        },
      },
      onchain: {
        description: "On-chain Earn — staking and DeFi products",
        commands: {
          offers: {
            toolName: "onchain_earn_get_offers",
            usage: "okx earn onchain offers [--productId <id>] [--protocolType <type>] [--ccy <ccy>]",
            description: "Browse available on-chain earn products (staking, DeFi)",
          },
          purchase: {
            toolName: "onchain_earn_purchase",
            usage: "okx earn onchain purchase --productId <id> --ccy <ccy> --amt <n> [--term <term>] [--tag <tag>]",
            description: "Purchase an on-chain earn product (stake/deposit)",
          },
          redeem: {
            toolName: "onchain_earn_redeem",
            usage: "okx earn onchain redeem --ordId <id> --protocolType <type> [--allowEarlyRedeem]",
            description: "Redeem an on-chain earn position",
          },
          cancel: {
            toolName: "onchain_earn_cancel",
            usage: "okx earn onchain cancel --ordId <id> --protocolType <type>",
            description: "Cancel a pending on-chain earn order",
          },
          orders: {
            toolName: "onchain_earn_get_active_orders",
            usage: "okx earn onchain orders [--productId <id>] [--protocolType <type>] [--ccy <ccy>] [--state <state>]",
            description: "List active on-chain earn orders",
          },
          history: {
            toolName: "onchain_earn_get_order_history",
            usage: "okx earn onchain history [--productId <id>] [--protocolType <type>] [--ccy <ccy>]",
            description: "Get on-chain earn order history",
          },
        },
      },
      "auto-earn": {
        description: "Auto-earn — automatically lend, stake, or earn on idle assets",
        commands: {
          status: {
            // CLI reads from account_get_balance; earn_auto_set is covered by 'on' command below
            toolName: null,
            usage: "okx earn auto-earn status [<ccy>]",
            description: "Query auto-earn status for all or a specific currency",
          },
          on: {
            toolName: "earn_auto_set",
            usage: "okx earn auto-earn on <ccy>",
            description: "Enable auto-earn for a currency (auto-detects lend/stake vs USDG earn)",
          },
          off: {
            // same tool as 'on'; earn_auto_set already registered above
            toolName: "earn_auto_set",
            usage: "okx earn auto-earn off <ccy>",
            description: "Disable auto-earn for a currency",
          },
        },
      },
      "flash-earn": {
        description: "Flash Earn — browse short-window earn projects by status",
        commands: {
          projects: {
            toolName: "earn_get_flash_earn_projects",
            usage: "okx earn flash-earn projects [--status <0|100|0,100>]",
            description: "List upcoming or in-progress Flash Earn projects. Defaults to both statuses",
          },
        },
      },
      dcd: {
        description: "DCD (Dual Currency Deposit) — structured products with fixed yield",
        commands: {
          pairs: {
            toolName: "dcd_get_currency_pairs",
            usage: "okx earn dcd pairs",
            description: "List available DCD currency pairs",
          },
          products: {
            toolName: "dcd_get_products",
            usage: "okx earn dcd products --baseCcy <ccy> --quoteCcy <ccy> --optType <C|P>\n                         [--minYield <n>] [--strikeNear <price>]\n                         [--termDays <n>] [--minTermDays <n>] [--maxTermDays <n>]\n                         [--expDate <YYYY-MM-DD|YYYY-MM-DDTHH:mm>]",
            description: "List active DCD products (baseCcy, quoteCcy, optType required). Client-side filters: minYield (e.g. 0.05=5%), strikeNear (±10%), term range, expDate",
          },
          "quote-and-buy": {
            toolName: "dcd_subscribe",
            usage: "okx earn dcd quote-and-buy --productId <id> --sz <n> --notionalCcy <ccy> [--clOrdId <id>] [--minAnnualizedYield <pct>]",
            description: "[CAUTION] Subscribe to a DCD product atomically (quote + execute in one step)",
          },
          "redeem-execute": {
            toolName: "dcd_redeem",
            usage: "okx earn dcd redeem-execute --ordId <id>",
            description: "[CAUTION] Re-quote and execute early redemption in one step (recommended for AI agent use)",
          },
          order: {
            toolName: "dcd_get_order_state",
            usage: "okx earn dcd order --ordId <id>",
            description: "Query current state of a DCD order",
          },
          orders: {
            toolName: "dcd_get_orders",
            usage: "okx earn dcd orders [--ordId <id>] [--productId <id>] [--uly <uly>] [--state <state>] [--limit <n>]",
            description: "Get DCD order history. State: initial|live|pending_settle|settled|pending_redeem|redeemed|rejected",
          },
        },
      },
    },
  },

  // ── bot ────────────────────────────────────────────────────────────────────
  bot: {
    description: "Trading bot strategies (grid, dca)",
    subgroups: {
      grid: {
        description: "Grid trading bot — create, monitor, and stop grid orders",
        commands: {
          orders: {
            toolName: "grid_get_orders",
            usage: "okx bot grid orders --algoOrdType <grid|contract_grid|moon_grid> [--instId <id>] [--algoId <id>] [--history]",
            description: "List active or historical grid bot orders",
          },
          details: {
            toolName: "grid_get_order_details",
            usage: "okx bot grid details --algoOrdType <type> --algoId <id>",
            description: "Get details of a specific grid bot order",
          },
          "sub-orders": {
            toolName: "grid_get_sub_orders",
            usage: "okx bot grid sub-orders --algoOrdType <type> --algoId <id> [--live]",
            description: "List sub-orders of a grid bot (filled or live)",
          },
          create: {
            toolName: "grid_create_order",
            usage: "okx bot grid create --instId <id> --algoOrdType <grid|contract_grid> --maxPx <px> --minPx <px> --gridNum <n>\n                   [--runType <1|2>] [--quoteSz <n>] [--baseSz <n>]\n                   [--direction <long|short|neutral>] [--lever <n>] [--sz <n>] [--basePos] [--no-basePos]\n                   [--tpTriggerPx <px>] [--slTriggerPx <px>] [--tpRatio <n>] [--slRatio <n>] [--algoClOrdId <id>]",
            description: "Create a new grid bot order (contract grid opens base position by default)",
          },
          stop: {
            toolName: "grid_stop_order",
            usage: "okx bot grid stop --algoId <id> --algoOrdType <type> --instId <id> [--stopType <1|2|3|5|6>]",
            description: "Stop a running grid bot order",
          },
        },
      },
      dca: {
        description: "DCA (Martingale) bot — spot or contract recurring buys",
        commands: {
          orders: {
            toolName: "dca_get_orders",
            usage: "okx bot dca orders [--algoOrdType <spot_dca|contract_dca>] [--algoId <id>] [--instId <id>] [--history]",
            description: "List DCA bots (spot and/or contract)",
          },
          details: {
            toolName: "dca_get_order_details",
            usage: "okx bot dca details --algoOrdType <spot_dca|contract_dca> --algoId <id>",
            description: "Get DCA bot details (spot or contract)",
          },
          "sub-orders": {
            toolName: "dca_get_sub_orders",
            usage: "okx bot dca sub-orders --algoOrdType <spot_dca|contract_dca> --algoId <id> [--cycleId <id>]",
            description: "Get DCA cycles/orders (spot or contract)",
          },
          create: {
            toolName: "dca_create_order",
            usage: "okx bot dca create --algoOrdType <spot_dca|contract_dca> --instId <id> --direction <long|short>\n                 --initOrdAmt <n> --maxSafetyOrds <n> --tpPct <n>\n                 [--lever <n>] [--safetyOrdAmt <n>] [--pxSteps <n>] [--pxStepsMult <n>] [--volMult <n>]\n                 [--slPct <n>] [--slMode <limit|market>] [--allowReinvest <true|false>]\n                 [--triggerStrategy <instant|price|rsi>] [--triggerPx <price>]\n                 [--triggerCond <cross_up|cross_down>] [--thold <n>] [--timeframe <tf>] [--timePeriod <n>]\n                 [--algoClOrdId <id>] [--reserveFunds <true|false>] [--tradeQuoteCcy <ccy>]\n                 Note: --lever required for contract_dca; safetyOrdAmt, pxSteps, pxStepsMult, volMult required when maxSafetyOrds > 0\n                 triggerStrategy: contract_dca supports instant|price|rsi; spot_dca supports instant|rsi",
            description: "Create a DCA (Martingale) bot (spot or contract)",
          },
          stop: {
            toolName: "dca_stop_order",
            usage: "okx bot dca stop --algoOrdType <spot_dca|contract_dca> --algoId <id> [--stopType <1|2>]\n                 Note: --stopType required for spot_dca (1=sell all, 2=keep tokens)",
            description: "Stop a DCA bot (spot or contract)",
          },
        },
      },
    },
  },

  // ── event ──────────────────────────────────────────────────────────────────
  event: {
    description: "Event contracts — binary prediction markets (YES/NO, UP/DOWN)",
    commands: {
      browse: {
        toolName: "event_browse",
        usage: "okx event browse [--underlying <asset>] [--json]",
        description: "Browse active event contracts grouped by type",
      },
      series: {
        toolName: "event_get_series",
        usage: "okx event series [--seriesId <id>] [--all] [--json]",
        description: "List event contract series",
      },
      events: {
        toolName: "event_get_events",
        usage: "okx event events <seriesId> [--eventId <id>] [--state <state>] [--limit <n>] [--json]",
        description: "List events in a series",
      },
      markets: {
        toolName: "event_get_markets",
        usage: "okx event markets <seriesId> [--eventId <id>] [--state <state>] [--limit <n>] [--json]",
        description: "List tradeable contracts within a series",
      },
      place: {
        toolName: "event_place_order",
        usage: "okx event place <instId> <side> <outcome> <sz> [--px <price>] [--ordType <type>] [--json]",
        description: "Place an event contract order",
      },
      amend: {
        toolName: "event_amend_order",
        usage: "okx event amend <instId> <ordId> [--px <price>] [--sz <n>] [--json]",
        description: "Amend a pending event contract order",
      },
      cancel: {
        toolName: "event_cancel_order",
        usage: "okx event cancel <instId> <ordId> [--json]",
        description: "Cancel a pending event contract order",
      },
      orders: {
        toolName: "event_get_orders",
        usage: "okx event orders [--instId <id>] [--state live] [--limit <n>] [--json]",
        description: "Query event contract orders",
      },
      fills: {
        toolName: "event_get_fills",
        usage: "okx event fills [--instId <id>] [--limit <n>] [--json]",
        description: "Get event contract fill history",
      },
    },
  },

  // ── config ─────────────────────────────────────────────────────────────────
  config: {
    description: "Manage CLI configuration profiles",
    commands: {
      init: {
        toolName: null,
        usage: "okx config init [--lang zh]",
        description: "Initialize a new configuration profile interactively",
      },
      show: {
        toolName: null,
        usage: "okx config show",
        description: `Show current configuration (file: ${configFilePath()})`,
      },
      set: {
        toolName: null,
        usage: "okx config set <key> <value>",
        description: "Set a configuration value",
      },
      "setup-clients": {
        toolName: null,
        usage: "okx config setup-clients",
        description: "Set up MCP client integrations (Cursor, Windsurf, etc.)",
      },
    },
  },

  // ── setup ──────────────────────────────────────────────────────────────────
  setup: {
    description: "Set up client integrations (Cursor, Windsurf, Claude, etc.)",
    usage: `okx setup --client <${SUPPORTED_CLIENTS.join("|")}> [--profile <name>] [--modules <list>]`,
  },

  // ── doh ────────────────────────────────────────────────────────────────────
  doh: {
    description: "Manage DoH (DNS-over-HTTPS) resolver binary",
    commands: {
      status: {
        toolName: null,
        usage: "okx doh status [--json]",
        description: "Show DoH binary info, checksum, and CDN match status",
      },
      install: {
        toolName: null,
        usage: "okx doh install [--json]",
        description: "Download or update the DoH resolver binary",
      },
      remove: {
        toolName: null,
        usage: "okx doh remove [--force] [--json]",
        description: "Remove the DoH resolver binary (prompts for confirmation without --force)",
      },
    },
  },

  // ── news ──────────────────────────────────────────────────────────────────
  news: {
    commands: {
      latest: {
        toolName: "news_get_latest",
        usage: "okx news latest [--coins BTC,ETH] [--platform blockbeats] [--lang zh-CN] [--limit 20]",
      },
      important: {
        toolName: "news_get_latest",
        usage: "okx news important [--coins BTC,ETH] [--lang zh-CN] [--limit 20]",
        description: "Get important/high-impact crypto news",
      },
      "by-coin": {
        toolName: "news_get_by_coin",
        usage: "okx news by-coin --coins BTC [--importance high] [--platform blockbeats] [--lang zh-CN]",
      },
      search: {
        toolName: "news_search",
        usage: "okx news search --keyword <term> [--coins BTC] [--sentiment bullish] [--platform blockbeats] [--lang zh-CN]",
      },
      detail: {
        toolName: "news_get_detail",
        usage: "okx news detail <id> [--lang zh-CN]",
      },
      platforms: {
        toolName: "news_get_domains",
        usage: "okx news platforms",
        description: "List available news platforms",
      },
      "coin-sentiment": {
        toolName: "news_get_coin_sentiment",
        usage: "okx news coin-sentiment --coins BTC [--period 24h]",
      },
      "coin-trend": {
        toolName: "news_get_coin_sentiment",
        usage: "okx news coin-trend <coin> [--period 24h] [--points 24]",
        description: "Get coin sentiment trend over time",
      },
      "by-sentiment": {
        toolName: "news_search",
        usage: "okx news by-sentiment --sentiment bullish [--coins BTC] [--importance high] [--platform <source>] [--sort-by latest] [--begin <ms>] [--end <ms>]",
        description: "Browse news filtered by sentiment direction",
      },
      "sentiment-rank": {
        toolName: "news_get_sentiment_ranking",
        usage: "okx news sentiment-rank [--period 24h] [--sort-by 0] [--limit 20]",
      },
    },
  },

  // ── diagnose ───────────────────────────────────────────────────────────────
  diagnose: {
    description: "Run network / MCP server diagnostics",
    usage: "okx diagnose [--cli | --mcp | --all] [--profile <name>] [--demo | --live] [--output <file>]",
  },

  // ── skill ──────────────────────────────────────────────────────────────────
  skill: {
    description: "OKX Skills Marketplace — search, install, and manage agent skills",
    commands: {
      search: {
        toolName: "skills_search",
        usage: "okx skill search [--keyword <kw>] [--categories <id>] [--page <n>] [--limit <n>]",
        description: "Search for skills in the marketplace",
      },
      categories: {
        toolName: "skills_get_categories",
        usage: "okx skill categories",
        description: "List available skill categories",
      },
      add: {
        // Composite: downloads + installs via npx; no single ToolSpec
        toolName: null,
        usage: "okx skill add <name>",
        description: "Download and install a skill to detected agents",
      },
      download: {
        // CLI calls downloadSkillZip directly (same capability as skills_download ToolSpec)
        toolName: "skills_download",
        usage: "okx skill download <name> [--dir <path>] [--format zip|skill]",
        description: "Download a skill package without installing",
      },
      remove: {
        toolName: null,
        usage: "okx skill remove <name>",
        description: "Remove an installed skill",
      },
      check: {
        // Uses skills_search internally; skills_search already registered above
        toolName: null,
        usage: "okx skill check <name>",
        description: "Check if an installed skill has a newer version",
      },
      list: {
        toolName: null,
        usage: "okx skill list",
        description: "List all locally installed skills",
      },
    },
  },

  // ── upgrade ────────────────────────────────────────────────────────────────
  upgrade: {
    description: "Upgrade okx CLI and MCP server to the latest stable version",
    usage: "okx upgrade [--check] [--beta] [--force] [--json]",
  },

  // ── list-tools ──────────────────────────────────────────────────────────────
  "list-tools": {
    description: "List all available tools and their parameters (use --json for machine-readable output)",
    usage: "okx list-tools [--json] [--module <module>]",
  },
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Collect all non-null toolName values and all alternateTools entries from the
 * entire CLI registry tree.  Used by the drift test to verify ToolSpec coverage.
 */
export function getAllRegisteredToolNames(): Set<string> {
  const names = new Set<string>();

  function collectFromEntry(entry: CliCommandEntry): void {
    if (entry.toolName != null) {
      names.add(entry.toolName);
    }
    for (const alt of entry.alternateTools ?? []) {
      names.add(alt);
    }
  }

  function collectFromModule(mod: CliModuleEntry): void {
    for (const cmd of Object.values(mod.commands ?? {})) {
      collectFromEntry(cmd);
    }
    for (const sg of Object.values(mod.subgroups ?? {})) {
      collectFromModule(sg);
    }
  }

  for (const mod of Object.values(CLI_REGISTRY)) {
    collectFromModule(mod);
  }

  return names;
}
