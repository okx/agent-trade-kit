import type { ToolSpec } from "./types.js";
import {
  asRecord,
  assertEnum,
  compactObject,
  normalizeResponse,
  readBoolean,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { ValidationError } from "../utils/errors.js";
import { publicRateLimit } from "./common.js";
import { withAigcErrors } from "./aigc-errors.js";
import {
  INDICATOR_DEFAULT_PARAMS,
  describeIndicatorDefaults,
  formatIndicatorSignature,
  getSpecDefaultParams,
  hasIndicatorParamSpec,
  validateIndicatorParams,
} from "./indicator-params.js";

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
  // Note: range-filter -> RANGE_FILTER is correct via the default rule; no override needed.
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

/** Set of valid indicator names (lowercase) for fast lookup. */
const VALID_INDICATOR_NAMES = new Set(KNOWN_INDICATORS.map((i) => i.name));

export function resolveIndicatorCode(name: string): string {
  const lower = name.toLowerCase();
  return INDICATOR_CODE_OVERRIDES[lower] ?? name.toUpperCase().replace(/-/g, "_");
}

/**
 * Default `paramList` per indicator, keyed by the lowercase indicator name
 * (matching `KNOWN_INDICATORS[].name`). Derived from the specs in
 * `indicator-params.ts` (single source of truth, shared by CLI and MCP): when
 * `params` is omitted the handler applies the default for these indicators.
 * Indicators without an entry are sent without a `paramList`.
 */
export const DEFAULT_INDICATOR_PARAMS: Record<string, number[]> = Object.fromEntries(
  Object.entries(INDICATOR_DEFAULT_PARAMS).map(([name, defaults]) => [name, [...defaults]]),
);

/**
 * Resolve the default `paramList` for an indicator, case-insensitively and
 * applying the same alias resolution as `resolveIndicatorCode` (e.g. the
 * `boll` alias maps to `bb`'s default `[20, 2]`).
 *
 * Returns `undefined` for non-period indicators and unknown names.
 */
export function getDefaultIndicatorParams(name: string): number[] | undefined {
  return getSpecDefaultParams(name);
}

/**
 * Validate that the indicator name is in the KNOWN_INDICATORS list.
 * Throws ValidationError with suggestions when an unknown name is given.
 */
function validateIndicatorName(name: string): void {
  const lower = name.toLowerCase();
  if (VALID_INDICATOR_NAMES.has(lower)) return;
  // Also accept override aliases (e.g. "boll")
  if (INDICATOR_CODE_OVERRIDES[lower]) return;

  // Find close matches for suggestion; skip substring-match for very short queries
  // to avoid flooding the user with unrelated results (e.g. "ma" matching ema, macd, ...)
  const suggestions = [...VALID_INDICATOR_NAMES]
    .filter((n) => lower.length >= 3 && (n.includes(lower) || lower.includes(n)))
    .slice(0, 5);
  const hint = suggestions.length > 0
    ? ` Did you mean: ${suggestions.join(", ")}?`
    : " Call market_list_indicators to see all valid names.";
  throw new ValidationError(
    `Unknown indicator "${name}".${hint}`,
  );
}

const NUMERIC_STRING_RE = /^-?\d+(\.\d+)?$/;

/** Accept finite numbers and numeric strings (LLMs sometimes send "14"); reject everything else. */
function toNumberItem(key: string, item: unknown, index: number): number {
  if (typeof item === "number" && Number.isFinite(item)) return item;
  if (typeof item === "string" && NUMERIC_STRING_RE.test(item.trim())) {
    const parsed = Number(item);
    // a very long digit string overflows to Infinity, which JSON would serialise as null
    if (Number.isFinite(parsed)) return parsed;
  }
  const shown = typeof item === "string" ? JSON.stringify(item.slice(0, 40)) : JSON.stringify(item) ?? String(item);
  throw new ValidationError(`Parameter "${key}"[${index}] must be a finite number, got ${shown}.`);
}

function readNumberArray(
  args: Record<string, unknown>,
  key: string,
): number[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new ValidationError(`Parameter "${key}" must be an array of numbers, e.g. [12,26,9].`);
  }
  return value.map((item, index) => toNumberItem(key, item, index));
}

/** Read `params`; a malformed value for an indicator with a params contract also reports its signature. */
function readParams(args: Record<string, unknown>, indicator: string): number[] | undefined {
  try {
    return readNumberArray(args, "params");
  } catch (error) {
    if (error instanceof ValidationError && hasIndicatorParamSpec(indicator)) {
      throw new ValidationError(`${error.message} ${formatIndicatorSignature(indicator)}`);
    }
    throw error;
  }
}

export function registerIndicatorTools(): ToolSpec[] {
  return [
    {
      name: "market_get_indicator",
      title: "Get Technical Indicator",
      module: "market",
      description:
        "Get technical indicator values for an instrument. Common indicators: ma, ema, rsi, macd, bb (Bollinger), kdj, supertrend, ahr999. Call market_list_indicators first to see all valid names. No credentials required.",
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
              "Indicator name (case-insensitive), e.g. 'rsi', 'macd', 'bb', 'ma', 'ema', 'kdj', 'supertrend'. Call market_list_indicators to see all valid names. Using an invalid name will return an error.",
          },
          bar: {
            type: "string",
            enum: [...INDICATOR_BARS],
            description: "Timeframe. Default: 1H",
          },
          params: {
            type: "array",
            items: { type: "integer" },
            description: `Optional. Omit to use the indicator's default. If given it must be complete: fixed-length indicators need exactly the full set (too few or too many is an error), ma/ema/rsi/wr/wma/dema/tema/zlema/hma/kama take one or more periods; values are integers (periods 2-365; bb multiplier and supertrend factor 1-9). Order matters, e.g. macd [fast,slow,signal], bb [period,multiplier], supertrend [factor,atrPeriod]. Defaults: ${describeIndicatorDefaults()}. The result reports appliedParams and paramsSource (default|explicit).`,
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
        validateIndicatorName(indicator);
        const bar = readString(args, "bar") ?? "1H";
        assertEnum(bar, "bar", INDICATOR_BARS, { caseInsensitive: true });
        const rawParams = readParams(args, indicator);
        const explicit = rawParams && rawParams.length > 0 ? rawParams : undefined;
        if (explicit) validateIndicatorParams(indicator, explicit);
        // Omitted params -> apply the indicator's default (CLI and MCP alike).
        const paramList = explicit ?? getDefaultIndicatorParams(indicator);
        const returnList = readBoolean(args, "returnList") ?? false;
        const limit = readNumber(args, "limit") ?? 10;
        const backtestTime = readNumber(args, "backtestTime");

        const apiCode = resolveIndicatorCode(indicator);
        const indicatorConfig = compactObject({
          paramList,
          returnList,
          limit: returnList ? limit : undefined,
        });

        const body = compactObject({
          instId,
          timeframes: [bar],
          indicators: { [apiCode]: indicatorConfig },
          backtestTime,
        });

        return withAigcErrors(async () => {
          const response = await context.client.publicPost(
            "/api/v5/aigc/mcp/indicators",
            body,
            publicRateLimit("market_get_indicator", 5),
          );
          const result = normalizeResponse(response);
          if (!paramList || !hasIndicatorParamSpec(indicator)) return result;
          return { ...result, appliedParams: paramList, paramsSource: explicit ? "explicit" : "default" };
        });
      },
    },
    {
      name: "market_list_indicators",
      title: "List Technical Indicators",
      module: "market",
      description:
        "List all supported technical indicator names and descriptions. Call this before market_get_indicator to discover valid indicator names. No credentials required.",
      isWrite: false,
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({ data: KNOWN_INDICATORS }),
    },
  ];
}
