import type { ToolSpec } from "./types.js";
import { asRecord, compactObject, normalizeResponse, readBoolean, readNumber, readString, requireString, validateSwapInstId } from "./helpers.js";
import { publicRateLimit, OKX_CANDLE_BARS, OKX_INST_TYPES } from "./common.js";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/** Schema property shared by all market tools to opt-in to demo market data. */
const DEMO_PROPERTY = {
  demo: {
    type: "boolean" as const,
    description: "Query simulated trading (demo) market data. Default: false (live market data).",
  },
};

export function registerMarketTools(): ToolSpec[] {
  return [
    {
      name: "market_get_ticker",
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
            description: "Default 1m",
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
        const afterTs = readString(args, "after");
        const beforeTs = readString(args, "before");
        const demo = readBoolean(args, "demo") ?? false;
        const query = compactObject({
          instId: requireString(args, "instId"),
          bar: readString(args, "bar"),
          after: afterTs,
          before: beforeTs,
          limit: readNumber(args, "limit"),
        });
        const rateLimit = publicRateLimit("market_get_candles", 40);

        const hasTimestamp = afterTs !== undefined || beforeTs !== undefined;
        // Only route to history based on `after`: `after=T` means "data older than T".
        // `before=T` means "data newer than T" (paginating forward), so it always needs
        // the recent endpoint — routing it to history would drop the latest 2 days.
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
          }),
          publicRateLimit("market_get_instruments", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_funding_rate",
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
      module: "market",
      description:
        "Get recent trades for an instrument. Default 20 records, max 500.",
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
            description: "Default 20, max 500",
          },
          ...DEMO_PROPERTY,
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/market/trades",
          compactObject({
            instId: requireString(args, "instId"),
            limit: readNumber(args, "limit") ?? 20,
          }),
          publicRateLimit("market_get_trades", 20),
          readBoolean(args, "demo") ?? false,
        );
        return normalizeResponse(response);
      },
    },
    {
      name: "market_get_index_ticker",
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
            description: "Default 1m",
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
