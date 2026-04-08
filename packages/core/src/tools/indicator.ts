import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { publicRateLimit } from "./common.js";

// Valid timeframes accepted by the indicator API
export const INDICATOR_BARS = [
  "3m", "5m", "15m", "1H", "4H", "12Hutc", "1Dutc", "3Dutc", "1Wutc",
] as const;

export type IndicatorBar = (typeof INDICATOR_BARS)[number];

// Overrides for CLI names whose API code differs from simple uppercase + underscore.
// Default rule: name.toUpperCase().replace(/-/g, "_"), so only add entries that deviate.
const INDICATOR_CODE_OVERRIDES: Record<string, string> = {
  // Aliases
  "boll":              "BB",             // server supports BB not BOLL
  // Names where default rule produces underscores but backend uses no separator
  "rainbow":           "BTCRAINBOW",     // default: RAINBOW
  "stoch-rsi":         "STOCHRSI",       // default: STOCH_RSI
  "bull-engulf":       "BULLENGULF",     // default: BULL_ENGULF
  "bear-engulf":       "BEARENGULF",     // default: BEAR_ENGULF
  "bull-harami":       "BULLHARAMI",     // default: BULL_HARAMI
  "bear-harami":       "BEARHARAMI",     // default: BEAR_HARAMI
  "bull-harami-cross": "BULLHARAMICROSS",// default: BULL_HARAMI_CROSS
  "bear-harami-cross": "BEARHARAMICROSS",// default: BEAR_HARAMI_CROSS
  "three-soldiers":    "THREESOLDIERS",  // default: THREE_SOLDIERS
  "three-crows":       "THREECROWS",     // default: THREE_CROWS
  "hanging-man":       "HANGINGMAN",     // default: HANGING_MAN
  "inverted-hammer":   "INVERTEDH",      // default: INVERTED_HAMMER (backend uses INVERTEDH)
  "shooting-star":     "SHOOTINGSTAR",   // default: SHOOTING_STAR
  "nvi-pvi":           "NVIPVI",         // default: NVI_PVI
  "top-long-short":    "TOPLONGSHORT",   // default: TOP_LONG_SHORT
  // Note: range-filter → RANGE_FILTER is correct via the default rule; no override needed.
};

/** All indicators supported by the /api/v5/aigc/mcp/indicators endpoint. */
export const KNOWN_INDICATORS: ReadonlyArray<{ readonly name: string; readonly description: string }> = [
  // Moving Averages
  { name: "ma",            description: "Simple Moving Average" },
  { name: "ema",           description: "Exponential Moving Average" },
  { name: "wma",           description: "Weighted Moving Average" },
  { name: "dema",          description: "Double Exponential Moving Average" },
  { name: "tema",          description: "Triple Exponential Moving Average" },
  { name: "zlema",         description: "Zero-Lag Exponential Moving Average" },
  { name: "hma",           description: "Hull Moving Average" },
  { name: "kama",          description: "Kaufman Adaptive Moving Average" },
  // Trend
  { name: "macd",          description: "MACD" },
  { name: "sar",           description: "Parabolic SAR" },
  { name: "adx",           description: "Average Directional Index" },
  { name: "aroon",         description: "Aroon Indicator" },
  { name: "cci",           description: "Commodity Channel Index" },
  { name: "dpo",           description: "Detrended Price Oscillator" },
  { name: "envelope",      description: "Envelope" },
  { name: "halftrend",     description: "HalfTrend" },
  { name: "alphatrend",    description: "AlphaTrend" },
  // Momentum
  { name: "rsi",           description: "Relative Strength Index" },
  { name: "stoch-rsi",     description: "Stochastic RSI" },
  { name: "stoch",         description: "Stochastic Oscillator" },
  { name: "roc",           description: "Rate of Change" },
  { name: "mom",           description: "Momentum" },
  { name: "ppo",           description: "Price Percentage Oscillator" },
  { name: "trix",          description: "TRIX" },
  { name: "ao",            description: "Awesome Oscillator" },
  { name: "uo",            description: "Ultimate Oscillator" },
  { name: "wr",            description: "Williams %R" },
  // Volatility
  { name: "bb",            description: "Bollinger Bands" },
  { name: "boll",          description: "Bollinger Bands (alias for bb)" },
  { name: "bbwidth",       description: "Bollinger Band Width" },
  { name: "bbpct",         description: "Bollinger Band %B" },
  { name: "atr",           description: "Average True Range" },
  { name: "keltner",       description: "Keltner Channel" },
  { name: "donchian",      description: "Donchian Channel" },
  { name: "hv",            description: "Historical Volatility" },
  { name: "stddev",        description: "Standard Deviation" },
  // Volume
  { name: "obv",           description: "On-Balance Volume" },
  { name: "vwap",          description: "Volume Weighted Average Price" },
  { name: "mvwap",         description: "Moving VWAP" },
  { name: "cmf",           description: "Chaikin Money Flow" },
  { name: "mfi",           description: "Money Flow Index" },
  { name: "ad",            description: "Accumulation/Distribution" },
  // Statistical
  { name: "lr",            description: "Linear Regression" },
  { name: "slope",         description: "Linear Regression Slope" },
  { name: "angle",         description: "Linear Regression Angle" },
  { name: "variance",      description: "Variance" },
  { name: "meandev",       description: "Mean Deviation" },
  { name: "sigma",         description: "Sigma" },
  { name: "stderr",        description: "Standard Error" },
  // Custom
  { name: "kdj",           description: "KDJ Stochastic Oscillator" },
  { name: "supertrend",    description: "Supertrend" },
  // Ichimoku
  { name: "tenkan",        description: "Ichimoku Tenkan-sen (Conversion Line)" },
  { name: "kijun",         description: "Ichimoku Kijun-sen (Base Line)" },
  { name: "senkoa",        description: "Ichimoku Senkou Span A (Leading Span A)" },
  { name: "senkob",        description: "Ichimoku Senkou Span B (Leading Span B)" },
  { name: "chikou",        description: "Ichimoku Chikou Span (Lagging Span)" },
  // Candlestick Patterns
  { name: "doji",          description: "Doji candlestick pattern" },
  { name: "bull-engulf",   description: "Bullish Engulfing pattern" },
  { name: "bear-engulf",   description: "Bearish Engulfing pattern" },
  { name: "bull-harami",   description: "Bullish Harami pattern" },
  { name: "bear-harami",   description: "Bearish Harami pattern" },
  { name: "bull-harami-cross", description: "Bullish Harami Cross pattern" },
  { name: "bear-harami-cross", description: "Bearish Harami Cross pattern" },
  { name: "three-soldiers",    description: "Three White Soldiers pattern" },
  { name: "three-crows",       description: "Three Black Crows pattern" },
  { name: "hanging-man",       description: "Hanging Man pattern" },
  { name: "inverted-hammer",   description: "Inverted Hammer pattern" },
  { name: "shooting-star",     description: "Shooting Star pattern" },
  // Bitcoin On-Chain
  { name: "ahr999",        description: "AHR999 Bitcoin accumulation index" },
  { name: "rainbow",       description: "Bitcoin Rainbow Chart" },
  // Other
  { name: "fisher",        description: "Fisher Transform" },
  { name: "nvi-pvi",       description: "Negative/Positive Volume Index (returns both)" },
  { name: "pmax",          description: "PMAX" },
  { name: "qqe",           description: "QQE Mod" },
  { name: "tdi",           description: "Traders Dynamic Index" },
  { name: "waddah",        description: "Waddah Attar Explosion" },
  { name: "range-filter",  description: "Range Filter" },
  { name: "cho",           description: "Chande Momentum Oscillator" },
  { name: "tr",            description: "True Range" },
  { name: "tp",            description: "Typical Price" },
  { name: "mp",            description: "Median Price" },
  { name: "top-long-short", description: "Top Trader Long/Short Ratio (timeframe-independent)" },
] as const;

export function resolveIndicatorCode(name: string): string {
  const lower = name.toLowerCase();
  return INDICATOR_CODE_OVERRIDES[lower] ?? name.toUpperCase().replace(/-/g, "_");
}

function readNumberArray(
  args: Record<string, unknown>,
  key: string,
): number[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => Number(item));
}

export function registerIndicatorTools(): ToolSpec[] {
  return [
    {
      name: "market_get_indicator",
      module: "market",
      description:
        "Get technical indicator values for an instrument (MA, EMA, RSI, MACD, BB, KDJ, SUPERTREND, AHR999, BTCRAINBOW, and more). No credentials required.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT",
          },
          indicator: {
            type: "string",
            description:
              "Indicator name (case-insensitive). Call market_list_indicators to see all supported names.",
          },
          bar: {
            type: "string",
            enum: [...INDICATOR_BARS],
            description: "Timeframe. Default: 1H",
          },
          params: {
            type: "array",
            items: { type: "number" },
            description: "Indicator parameters, e.g. [5, 20] for MA with periods 5 and 20",
          },
          returnList: {
            type: "boolean",
            description: "Return a historical list instead of the latest value only. Default: false",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
            description: "Number of historical records to return (only used when returnList=true). Default: 10",
          },
          backtestTime: {
            type: "integer",
            description: "Backtest timestamp in milliseconds. Omit for live (real-time) mode",
          },
        },
        required: ["instId", "indicator"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = requireString(args, "instId");
        const indicator = requireString(args, "indicator");
        const bar = readString(args, "bar") ?? "1H";
        const params = readNumberArray(args, "params");
        const returnList = readBoolean(args, "returnList") ?? false;
        const limit = readNumber(args, "limit") ?? 10;
        const backtestTime = readNumber(args, "backtestTime");

        const apiCode = resolveIndicatorCode(indicator);
        const indicatorConfig = compactObject({
          paramList: params && params.length > 0 ? params : undefined,
          returnList,
          limit: returnList ? limit : undefined,
        });

        const body = compactObject({
          instId,
          timeframes: [bar],
          indicators: { [apiCode]: indicatorConfig },
          backtestTime,
        });

        const response = await context.client.publicPost(
          "/api/v5/aigc/mcp/indicators",
          body,
          publicRateLimit("market_get_indicator", 5),
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_list_indicators",
      module: "market",
      description:
        "List all supported technical indicator names and descriptions. Call this before market_get_indicator to discover valid indicator names. No credentials required.",
      isWrite: false,
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({ data: KNOWN_INDICATORS }),
    },
  ];
}
