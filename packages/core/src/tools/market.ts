import type { ToolSpec } from "./types.js";
import { asRecord, compactObject, readBoolean, readNumber, readString, requireString } from "./helpers.js";
import { publicRateLimit, OKX_CANDLE_BARS, OKX_INST_TYPES } from "./common.js";

function normalize(response: {
  endpoint: string;
  requestTime: string;
  data: unknown;
}): Record<string, unknown> {
  return {
    endpoint: response.endpoint,
    requestTime: response.requestTime,
    data: response.data,
  };
}

export function registerMarketTools(): ToolSpec[] {
  return [
    {
      name: "market_get_ticker",
      module: "market",
      description:
        "Get ticker data for a single instrument. Public endpoint, no authentication required. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "e.g. BTC-USDT, BTC-USDT-SWAP",
          },
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/market/ticker",
          { instId: requireString(args, "instId") },
          publicRateLimit("market_get_ticker", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_tickers",
      module: "market",
      description:
        "Get ticker data for all instruments of a given type. Public endpoint, no authentication required. Rate limit: 20 req/s.",
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
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_orderbook",
      module: "market",
      description:
        "Get the order book (bids/asks) for an instrument. Public endpoint, no authentication required. Rate limit: 20 req/s.",
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
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_candles",
      module: "market",
      description:
        "Get candlestick (OHLCV) data for an instrument. " +
        "history=false (default): recent candles up to 1440 bars. " +
        "history=true: older historical data beyond the recent window. " +
        "Public endpoint, no authentication required. Rate limit: 40 req/s.",
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
          history: {
            type: "boolean",
            description: "true=older historical data beyond recent window",
          },
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const isHistory = readBoolean(args, "history") ?? false;
        const path = isHistory
          ? "/api/v5/market/history-candles"
          : "/api/v5/market/candles";
        const response = await context.client.publicGet(
          path,
          compactObject({
            instId: requireString(args, "instId"),
            bar: readString(args, "bar"),
            after: readString(args, "after"),
            before: readString(args, "before"),
            limit: readNumber(args, "limit"),
          }),
          publicRateLimit("market_get_candles", 40),
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_instruments",
      module: "market",
      description:
        "Get tradable instruments for a given type. Returns contract specs: min order size, lot size, tick size, contract value, settlement currency, listing/expiry time. Essential before placing orders. Public endpoint. Rate limit: 20 req/s.",
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
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_funding_rate",
      module: "market",
      description:
        "Get funding rate for a SWAP instrument. " +
        "history=false (default): current rate and estimated next rate + settlement time. " +
        "history=true: historical rates, default 20 records, max 100. " +
        "Public endpoint. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "SWAP instrument, e.g. BTC-USDT-SWAP",
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
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const isHistory = readBoolean(args, "history") ?? false;
        if (isHistory) {
          const response = await context.client.publicGet(
            "/api/v5/public/funding-rate-history",
            compactObject({
              instId: requireString(args, "instId"),
              after: readString(args, "after"),
              before: readString(args, "before"),
              limit: readNumber(args, "limit") ?? 20,
            }),
            publicRateLimit("market_get_funding_rate", 20),
          );
          return normalize(response);
        }
        const response = await context.client.publicGet(
          "/api/v5/public/funding-rate",
          { instId: requireString(args, "instId") },
          publicRateLimit("market_get_funding_rate", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_mark_price",
      module: "market",
      description:
        "Get mark price for SWAP, FUTURES, or MARGIN instruments. " +
        "Mark price is used for liquidation calculations and unrealized PnL. " +
        "Public endpoint. Rate limit: 10 req/s.",
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
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_trades",
      module: "market",
      description:
        "Get recent trades for an instrument. Default 20 records, max 500. " +
        "Public endpoint, no authentication required. Rate limit: 20 req/s.",
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
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_index_ticker",
      module: "market",
      description:
        "Get index ticker data (e.g. BTC-USD, ETH-USD index prices). " +
        "Index prices are used for mark price calculation and are independent of any single exchange. " +
        "Public endpoint. Rate limit: 20 req/s.",
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
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_index_candles",
      module: "market",
      description:
        "Get candlestick data for an index (e.g. BTC-USD index). " +
        "history=false (default): recent candles up to 1440 bars. " +
        "history=true: older historical data beyond the recent window. " +
        "Public endpoint. Rate limit: 20 req/s.",
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
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_price_limit",
      module: "market",
      description:
        "Get the current price limit (upper and lower bands) for a SWAP or FUTURES instrument. " +
        "Orders placed outside these limits will be rejected by OKX. " +
        "Public endpoint. Rate limit: 20 req/s.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "SWAP or FUTURES ID, e.g. BTC-USDT-SWAP",
          },
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.publicGet(
          "/api/v5/public/price-limit",
          { instId: requireString(args, "instId") },
          publicRateLimit("market_get_price_limit", 20),
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_open_interest",
      module: "market",
      description:
        "Get open interest for SWAP, FUTURES, or OPTION instruments. " +
        "Useful for gauging market sentiment and positioning. " +
        "Public endpoint. Rate limit: 20 req/s.",
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
        );
        return normalize(response);
      },
    },
    {
      name: "market_get_stock_tokens",
      module: "market",
      description:
        "Get all stock token instruments (instCategory=3). " +
        "Stock tokens track real-world stock prices on OKX (e.g. AAPL-USDT-SWAP, TSLA-USDT-SWAP). " +
        "Fetches all instruments of the given type and filters client-side by instCategory=3. " +
        "Public endpoint. Rate limit: 20 req/s.",
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
        );
        const data = response.data;
        const filtered = Array.isArray(data)
          ? data.filter((item) => (item as Record<string, unknown>).instCategory === "3")
          : data;
        return normalize({ ...response, data: filtered });
      },
    },
  ];
}
