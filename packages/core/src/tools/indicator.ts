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

// Overrides for CLI names whose API code differs from simple uppercase + underscore
const INDICATOR_CODE_OVERRIDES: Record<string, string> = {
  "rainbow":         "BTCRAINBOW",
  "range-filter":    "RANGEFILTER",
  "stoch-rsi":       "STOCHRSI",
  "pi-cycle-top":    "PI_CYCLE_TOP",
  "pi-cycle-bottom": "PI_CYCLE_BOTTOM",
  // boll is an alias for bb; server supports BB not BOLL
  "boll":            "BB",
};

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
              "Indicator name (case-insensitive). Examples: ma, ema, rsi, macd, bb, kdj, supertrend, ahr999, rainbow, pi-cycle-top, pi-cycle-bottom, mayer, envelope, halftrend, alphatrend, pmax, waddah, tdi, qqe, range-filter",
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
  ];
}
