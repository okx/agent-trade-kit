import type { ToolSpec } from "./types.js";
import { asRecord, assertEnum, compactObject, normalizeResponse, readBoolean, readNumber, readString, requireString, validateSwapInstId } from "./helpers.js";
import { publicRateLimit, OKX_CANDLE_BARS, OKX_INST_TYPES } from "./common.js";
import { ValidationError } from "../utils/errors.js";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/** Schema property shared by all market tools to opt-in to demo market data. */
const DEMO_PROPERTY = {
  demo: {
    type: "boolean" as const,
    description: "Query simulated trading (demo) market data. Default: false (live market data).",
  },
};

const TRADES_PAGINATION_TYPES = ["1", "2"] as const;
const HISTORY_TRADES_MAX_LIMIT = 100;

/**
 * /market/trades only accepts instId + limit; type/after/before exist solely on
 * /market/history-trades (max 100 per page, last 3 months), so reject them
 * instead of silently dropping the pagination the caller asked for.
 */
function validateTradesPagination(opts: {
  isHistory: boolean;
  type: string | undefined;
  after: string | undefined;
  before: string | undefined;
  limit: number;
}): void {
  const { isHistory, type, after, before, limit } = opts;
  if (!isHistory) {
    const extras = [["type", type], ["after", after], ["before", before]].filter(([, v]) => v !== undefined);
    if (extras.length > 0) {
      throw new ValidationError(
        `Parameter(s) ${extras.map(([k]) => `"${k}"`).join(", ")} require history=true: the recent-trades endpoint does not support pagination.`,
      );
    }
    return;
  }
  assertEnum(type, "type", TRADES_PAGINATION_TYPES);
  if (limit > HISTORY_TRADES_MAX_LIMIT) {
    throw new ValidationError(`Parameter "limit" must be <= ${HISTORY_TRADES_MAX_LIMIT} when history=true.`);
  }
  if (type === "2" && before !== undefined) {
    throw new ValidationError('Parameter "before" is not supported with type=2 (timestamp pagination); use "after".');
  }
}

export function registerMarketTools(): ToolSpec[] {
  return [
    {
      name: "market_get_ticker",
      title: "Get Ticker",
      module: "market",
      description:
        "Get ticker data for a single instrument.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT, BTC-USDT-SWAP",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/market/ticker",
          { instId: requireString(args, "instId") },
          publicRateLimit("market_get_ticker", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_tickers",
      title: "Get All Tickers",
      module: "market",
      description:
        "Get ticker data for all instruments of a given type.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: [...OKX_INST_TYPES],
          },
          uly: {
            type: "string",
            description: "Underlying, e.g. BTC-USD. Required for OPTION",
          },
          instFamily: {
            type: "string",
            description: "e.g. BTC-USD",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/market/tickers",
          compactObject({
            instType: requireString(args, "instType"),
            uly: readString(args, "uly"),
            instFamily: readString(args, "instFamily"),
          }),
          publicRateLimit("market_get_tickers", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_orderbook",
      title: "Get Order Book",
      module: "market",
      description:
        "Get the order book (bids/asks) for an instrument.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          sz: {
            type: "number",
            description: "Depth per side, default 1, max 400",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/market/books",
          compactObject({
            instId: requireString(args, "instId"),
            sz: readNumber(args, "sz"),
          }),
          publicRateLimit("market_get_orderbook", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_candles",
      title: "Get Candlesticks",
      module: "market",
      description:
        "Get candlestick (OHLCV) data for an instrument. Automatically retrieves historical data (back to 2021) when requesting older time ranges. Use the `after` parameter to paginate back in time (the old `history` parameter has been removed). IMPORTANT: Before fetching with `after`/`before`, estimate the number of candles: time_range_ms / bar_interval_ms. If the estimate exceeds ~500 candles, inform the user of the estimated count and ask for confirmation before proceeding.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          bar: {
            type: "string",
            enum: [...OKX_CANDLE_BARS],
            description: "Default 1m. 6Hutc,12Hutc,1Dutc,2Dutc,3Dutc,1Wutc,1Mutc,3Mutc are UTC+0 bars (plain 6H-3M follow UTC+8)",
          },
          after: {
            type: "string",
            description: "Pagination: before this timestamp (ms)",
          },
          before: {
            type: "string",
            description: "Pagination: after this timestamp (ms)",
          },
          limit: {
            type: "number",
            description: "Max results (default 100)",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const bar = readString(args, "bar");
        assertEnum(bar, "bar", OKX_CANDLE_BARS);
        const afterTs = readString(args, "after");
        const beforeTs = readString(args, "before");
        const demo = readBoolean(args, "demo") ?? false;
        const query = compactObject({
          instId: requireString(args, "instId"),
          bar,
          after: afterTs,
          before: beforeTs,
          limit: readNumber(args, "limit"),
        });
        const rateLimit = publicRateLimit("market_get_candles", 40);

        const hasTimestamp = afterTs !== undefined || beforeTs !== undefined;
        // Only route to history based on `after`: `after=T` means "data older than T".
        // `before=T` means "data newer than T" (paginating forward), so it always needs
        // the recent endpoint - routing it to history would drop the latest 2 days.
        const useHistory = afterTs !== undefined && Number(afterTs) < Date.now() - TWO_DAYS_MS;

        const path = useHistory ? "/api/v5/market/history-candles" : "/api/v5/market/candles";
        const response = await context.client.publicGet(path, query, rateLimit, demo);

        // Defensive fallback: if the recent endpoint returns empty for a timestamped request,
        // the timestamp may straddle the 2-day boundary. Try history endpoint once.
        // Trade-off: truly empty ranges also trigger a second request, which is acceptable
        // since this case is rare and correctness matters more than avoiding one extra call.
        if (!useHistory && hasTimestamp && Array.isArray(response.data) && response.data.length === 0) {
          return normalizeResponse(await context.client.publicGet("/api/v5/market/history-candles", query, rateLimit, demo));
        }
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_instruments",
      title: "List Instruments",
      module: "market",
      description:
        "Get tradable instruments for a given type. Returns contract specs: min order size, lot size, tick size, contract value, settlement currency, listing/expiry time. Essential before placing orders.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: [...OKX_INST_TYPES],
          },
          instId: {
            type: "string",
            description: "Filter by ID, e.g. BTC-USDT-SWAP",
          },
          uly: {
            type: "string",
            description: "Required for OPTION, e.g. BTC-USD",
          },
          instFamily: {
            type: "string",
            description: "e.g. BTC-USD",
          },
          seriesId: {
            type: "string",
            description: "Required for EVENTS type, e.g. BTC-ABOVE-DAILY",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/public/instruments",
          compactObject({
            instType: requireString(args, "instType"),
            instId: readString(args, "instId"),
            uly: readString(args, "uly"),
            instFamily: readString(args, "instFamily"),
            seriesId: readString(args, "seriesId"),
          }),
          publicRateLimit("market_get_instruments", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_funding_rate",
      title: "Get Funding Rate",
      module: "market",
      description:
        "Get funding rate for a perpetual SWAP instrument. IMPORTANT: instId must end with -SWAP (e.g. BTC-USDT-SWAP). Spot IDs like BTC-USDT are NOT valid. history=false (default): current rate + next estimated rate; history=true: historical rates.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Perpetual swap instrument ID, must end with -SWAP (e.g. BTC-USDT-SWAP). Spot IDs like BTC-USDT will be rejected.",
          },
          history: {
            type: "boolean",
            description: "true=fetch historical rates",
          },
          after: {
            type: "string",
            description: "Pagination (history): before this timestamp (ms)",
          },
          before: {
            type: "string",
            description: "Pagination (history): after this timestamp (ms)",
          },
          limit: {
            type: "number",
            description: "History records (default 20, max 100)",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instId = requireString(args, "instId");
        validateSwapInstId(instId);
        const isHistory = readBoolean(args, "history") ?? false;
        const demo = readBoolean(args, "demo") ?? false;
        if (isHistory) {
          const response = await context.client.publicGet(
            "/api/v5/public/funding-rate-history",
            compactObject({
              instId,
              after: readString(args, "after"),
              before: readString(args, "before"),
              limit: readNumber(args, "limit") ?? 20,
            }),
            publicRateLimit("market_get_funding_rate", 20),
            demo,
          );
          return normalizeResponse(response);
        }
        const response = await context.client.publicGet(
          "/api/v5/public/funding-rate",
          { instId },
          publicRateLimit("market_get_funding_rate", 20),
          demo,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_mark_price",
      title: "Get Mark Price",
      module: "market",
      description:
        "Get mark price for SWAP, FUTURES, or MARGIN instruments. Used for liquidation calculations and unrealized PnL.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["MARGIN", "SWAP", "FUTURES", "OPTION"],
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          uly: {
            type: "string",
            description: "e.g. BTC-USD",
          },
          instFamily: {
            type: "string",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/public/mark-price",
          compactObject({
            instType: requireString(args, "instType"),
            instId: readString(args, "instId"),
            uly: readString(args, "uly"),
            instFamily: readString(args, "instFamily"),
          }),
          publicRateLimit("market_get_mark_price", 10),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_trades",
      title: "Get Recent Trades",
      module: "market",
      description:
        "Get recent public trades for an instrument. Default 20 records, max 500. Set history=true to page back through trades of the last 3 months (max 100 per page) using type/after/before.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT",
          },
          limit: {
            type: "number",
            description: "Default 20, max 500 (max 100 when history=true)",
          },
          history: {
            type: "boolean",
            description: "true=page through trades of the last 3 months. Required for type/after/before. Default false (latest trades only).",
          },
          type: {
            type: "string",
            enum: [...TRADES_PAGINATION_TYPES],
            description: "Pagination type, only with history=true. 1=by tradeId (default), 2=by timestamp",
          },
          after: {
            type: "string",
            description: "Only with history=true. Return trades older than this tradeId (type=1) or timestamp in ms (type=2)",
          },
          before: {
            type: "string",
            description: "Only with history=true. Return trades newer than this tradeId. Not supported with type=2",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const isHistory = readBoolean(args, "history") ?? false;
        const type = readString(args, "type");
        const after = readString(args, "after");
        const before = readString(args, "before");
        const limit = readNumber(args, "limit") ?? 20;
        validateTradesPagination({ isHistory, type, after, before, limit });
        const response = await context.client.publicGet(
          isHistory ? "/api/v5/market/history-trades" : "/api/v5/market/trades",
          compactObject({
            instId: requireString(args, "instId"),
            type,
            after,
            before,
            limit,
          }),
          publicRateLimit("market_get_trades", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_index_ticker",
      title: "Get Index Ticker",
      module: "market",
      description:
        "Get index ticker data (e.g. BTC-USD, ETH-USD index prices). Independent of any single exchange.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USD. Omit for all indices",
          },
          quoteCcy: {
            type: "string",
            description: "e.g. USD or USDT",
          },
          ...DEMO_PROPERTY,
        },
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/market/index-tickers",
          compactObject({
            instId: readString(args, "instId"),
            quoteCcy: readString(args, "quoteCcy"),
          }),
          publicRateLimit("market_get_index_ticker", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_index_candles",
      title: "Get Index Candlesticks",
      module: "market",
      description:
        "Get candlestick data for an index (e.g. BTC-USD index). history=false: recent up to 1440 bars; history=true: older data.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Index ID, e.g. BTC-USD",
          },
          bar: {
            type: "string",
            enum: [...OKX_CANDLE_BARS],
            description: "Default 1m. 6Hutc,12Hutc,1Dutc,2Dutc,3Dutc,1Wutc,1Mutc,3Mutc are UTC+0 bars (plain 6H-3M follow UTC+8)",
          },
          after: {
            type: "string",
            description: "Pagination: before this timestamp (ms)",
          },
          before: {
            type: "string",
            description: "Pagination: after this timestamp (ms)",
          },
          limit: {
            type: "number",
            description: "Max results (default 100)",
          },
          history: {
            type: "boolean",
            description: "true=older historical data",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const isHistory = readBoolean(args, "history") ?? false;
        const path = isHistory
          ? "/api/v5/market/history-index-candles"
          : "/api/v5/market/index-candles";
        const response = await context.client.publicGet(
          path,
          compactObject({
            instId: requireString(args, "instId"),
            bar: readString(args, "bar"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          publicRateLimit("market_get_index_candles", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_price_limit",
      title: "Get Price Limit",
      module: "market",
      description:
        "Get the current price limit (upper and lower bands) for a SWAP or FUTURES instrument. Orders outside these limits will be rejected.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "SWAP or FUTURES ID, e.g. BTC-USDT-SWAP",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/public/price-limit",
          { instId: requireString(args, "instId") },
          publicRateLimit("market_get_price_limit", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_open_interest",
      title: "Get Open Interest",
      module: "market",
      description:
        "Get open interest for SWAP, FUTURES, or OPTION instruments. Useful for gauging market sentiment and positioning.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SWAP", "FUTURES", "OPTION"],
          },
          instId: {
            type: "string",
            description: "e.g. BTC-USDT-SWAP",
          },
          uly: {
            type: "string",
            description: "e.g. BTC-USD",
          },
          instFamily: {
            type: "string",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/public/open-interest",
          compactObject({
            instType: requireString(args, "instType"),
            instId: readString(args, "instId"),
            uly: readString(args, "uly"),
            instFamily: readString(args, "instFamily"),
          }),
          publicRateLimit("market_get_open_interest", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_stock_tokens",
      title: "List Stock Tokens",
      module: "market",
      description:
        "[Deprecated: use market_get_instruments_by_category with instCategory=\"3\" instead] Get all stock token instruments (instCategory=3). Stock tokens track real-world stock prices on OKX (e.g. AAPL-USDT-SWAP).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SPOT", "SWAP"],
            description: "Instrument type. Default: SWAP",
          },
          instId: {
            type: "string",
            description: "Optional: filter by specific instrument ID, e.g. AAPL-USDT-SWAP",
          },
          ...DEMO_PROPERTY,
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instType = readString(args, "instType") ?? "SWAP";
        const instId = readString(args, "instId");
        const response = await context.client.publicGet(
          "/api/v5/public/instruments",
          compactObject({ instType, instId }),
          publicRateLimit("market_get_stock_tokens", 20),
          readBoolean(args, "demo") ?? false,
        );
        const data = response.data;
        const filtered = Array.isArray(data)
          ? data.filter((item) => (item as Record<string, unknown>).instCategory === "3")
          : data;
        return normalizeResponse({ ...response, data: filtered });
      },
    },
    {
      name: "market_get_instruments_by_category",
      title: "List Instruments by Category",
      module: "market",
      description:
        "Discover tradeable instruments by asset category. Stock tokens (instCategory=3, e.g. AAPL-USDT-SWAP, TSLA-USDT-SWAP), Metals (4, e.g. XAUUSDT-USDT-SWAP for gold), Commodities (5, e.g. OIL-USDT-SWAP for crude oil), Forex (6, e.g. EURUSDT-USDT-SWAP for EUR/USD), Bonds (7, e.g. US30Y-USDT-SWAP for crude oil). Use this to find instIds before querying prices or placing orders. Filters client-side by instCategory.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instCategory: {
            type: "string",
            enum: ["3", "4", "5", "6", "7"],
            description: "Asset category: 3=Stock tokens, 4=Metals, 5=Commodities, 6=Forex, 7=Bonds",
          },
          instType: {
            type: "string",
            enum: ["SPOT", "SWAP"],
            description: "Instrument type. Default: SWAP",
          },
          instId: {
            type: "string",
            description: "Optional: filter by specific instrument ID",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instCategory"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const instCategory = requireString(args, "instCategory");
        const instType = readString(args, "instType") ?? "SWAP";
        const instId = readString(args, "instId");
        const response = await context.client.publicGet(
          "/api/v5/public/instruments",
          compactObject({ instType, instId }),
          publicRateLimit("market_get_instruments_by_category", 20),
          readBoolean(args, "demo") ?? false,
        );
        const data = response.data;
        const filtered = Array.isArray(data)
          ? data.filter((item) => (item as Record<string, unknown>).instCategory === instCategory)
          : data;
        return normalizeResponse({ ...response, data: filtered });
      },
    },
  ];
}
