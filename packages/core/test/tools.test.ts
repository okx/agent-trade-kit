/**
 * Unit tests for new/modified tool handlers.
 * Verifies endpoint selection, default parameter values, and routing logic.
 * Uses a mock client — no real API calls are made.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolContext } from "../src/tools/types.js";
import { normalizeResponse } from "../src/tools/helpers.js";
import { registerMarketTools } from "../src/tools/market.js";
import { registerSpotTradeTools } from "../src/tools/spot-trade.js";
import { registerSwapTradeTools } from "../src/tools/swap-trade.js";
import { registerAccountTools } from "../src/tools/account.js";
import { registerFuturesTools } from "../src/tools/futures-trade.js";
import { registerOptionTools } from "../src/tools/option-trade.js";
import { registerAlgoTradeTools, registerFuturesAlgoTools } from "../src/tools/algo-trade.js";
import { registerOptionAlgoTools } from "../src/tools/option-algo-trade.js";
import { registerGridTools } from "../src/tools/bot/grid.js";
import { registerDcaTools } from "../src/tools/bot/dca.js";
import { registerOnchainEarnTools } from "../src/tools/earn/onchain.js";
import { registerAllEarnTools } from "../src/tools/earn/index.js";
import { assertNotDemo } from "../src/tools/common.js";
import { ConfigError, OkxApiError } from "../src/utils/errors.js";
import { DEFAULT_SOURCE_TAG } from "../src/constants.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface CapturedCall {
  method: "GET" | "POST";
  endpoint: string;
  params: Record<string, unknown>;
}

function makeMockClient() {
  let lastCall: CapturedCall | null = null;
  const calls: CapturedCall[] = [];

  const fakeResponse = (endpoint: string) => ({
    endpoint,
    requestTime: "2024-01-01T00:00:00.000Z",
    data: [{ dummy: true }], // non-empty: prevents fallback from firing in routing tests
  });

  const record = (call: CapturedCall) => {
    lastCall = call;
    calls.push(call);
  };

  const client = {
    publicGet: async (endpoint: string, params: Record<string, unknown>) => {
      record({ method: "GET", endpoint, params });
      return fakeResponse(endpoint);
    },
    privateGet: async (endpoint: string, params: Record<string, unknown>) => {
      record({ method: "GET", endpoint, params });
      return fakeResponse(endpoint);
    },
    privatePost: async (endpoint: string, params: Record<string, unknown>) => {
      record({ method: "POST", endpoint, params });
      return fakeResponse(endpoint);
    },
  };

  return {
    client,
    getLastCall: () => lastCall,
    getCalls: () => calls,
  };
}

/**
 * Creates a mock client that returns custom data per endpoint.
 * dataByEndpoint maps endpoint path to the data array to return.
 */
function makeMockClientWithData(dataByEndpoint: Record<string, unknown[]>) {
  let lastCall: CapturedCall | null = null;
  const calls: CapturedCall[] = [];

  const fakeResponse = (endpoint: string) => ({
    endpoint,
    requestTime: "2024-01-01T00:00:00.000Z",
    data: dataByEndpoint[endpoint] ?? [],
  });

  const record = (call: CapturedCall) => {
    lastCall = call;
    calls.push(call);
  };

  const client = {
    publicGet: async (endpoint: string, params: Record<string, unknown>) => {
      record({ method: "GET", endpoint, params });
      return fakeResponse(endpoint);
    },
    privateGet: async (endpoint: string, params: Record<string, unknown>) => {
      record({ method: "GET", endpoint, params });
      return fakeResponse(endpoint);
    },
    privatePost: async (endpoint: string, params: Record<string, unknown>) => {
      record({ method: "POST", endpoint, params });
      return fakeResponse(endpoint);
    },
  };

  return {
    client,
    getLastCall: () => lastCall,
    getCalls: () => calls,
  };
}

function makeContext(client: unknown): ToolContext {
  return {
    client: client as ToolContext["client"],
    config: { sourceTag: DEFAULT_SOURCE_TAG } as ToolContext["config"],
  };
}

// ---------------------------------------------------------------------------
// Market tools
// ---------------------------------------------------------------------------

describe("market_get_candles", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_candles")!;

  it("calls /market/candles by default (no timestamp)", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/candles");
  });

  it("calls /market/candles when after is 1 hour ago", async () => {
    const { client, getLastCall } = makeMockClient();
    const oneHourAgo = String(Date.now() - 60 * 60 * 1000);
    await tool.handler({ instId: "BTC-USDT", after: oneHourAgo }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/candles");
  });

  it("calls /market/history-candles when after is 3 days ago", async () => {
    const { client, getLastCall } = makeMockClient();
    const threeDaysAgo = String(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await tool.handler({ instId: "BTC-USDT", after: threeDaysAgo }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/history-candles");
  });

  it("uses /market/candles (not history) when only before is 3 days ago", async () => {
    // `before=T` means "data newer than T" (paginating forward) — recent endpoint is correct
    // regardless of how old T is, to avoid dropping the latest 2 days.
    const { client, getLastCall } = makeMockClient();
    const threeDaysAgo = String(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await tool.handler({ instId: "BTC-USDT", before: threeDaysAgo }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/candles");
  });

  it("falls back to /market/history-candles when recent returns empty and after is provided", async () => {
    const calls: string[] = [];
    const client = {
      publicGet: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push(endpoint);
        // Return empty data for recent endpoint, non-empty for history
        return {
          endpoint,
          requestTime: "2024-01-01T00:00:00.000Z",
          data: endpoint.includes("history") ? [["1672531200000", "16500", "16600", "16400", "16550", "100"]] : [],
        };
      },
      privateGet: async (endpoint: string, params: Record<string, unknown>) => ({
        endpoint,
        requestTime: "2024-01-01T00:00:00.000Z",
        data: [],
      }),
      privatePost: async (endpoint: string, params: Record<string, unknown>) => ({
        endpoint,
        requestTime: "2024-01-01T00:00:00.000Z",
        data: [],
      }),
    };
    const oneHourAgo = String(Date.now() - 60 * 60 * 1000);
    await tool.handler({ instId: "BTC-USDT", after: oneHourAgo }, makeContext(client));
    assert.deepEqual(calls, ["/api/v5/market/candles", "/api/v5/market/history-candles"]);
  });
});

describe("market_get_funding_rate", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_funding_rate")!;

  it("calls /public/funding-rate by default", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/funding-rate");
  });

  it("calls /public/funding-rate-history when history=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", history: true },
      makeContext(client),
    );
    assert.equal(
      getLastCall()?.endpoint,
      "/api/v5/public/funding-rate-history",
    );
  });

  it("defaults limit to 20 for history query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", history: true },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.limit, 20);
  });

  it("respects explicit limit for history query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", history: true, limit: 50 },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.limit, 50);
  });
});

describe("market_get_instruments", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_instruments")!;

  it("calls /public/instruments", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instType: "SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/instruments");
  });
});

describe("market_get_mark_price", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_mark_price")!;

  it("calls /public/mark-price", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instType: "SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/mark-price");
  });
});

describe("market_get_trades", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_trades")!;

  it("calls /market/trades", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/trades");
  });

  it("defaults limit to 20", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT" }, makeContext(client));
    assert.equal(getLastCall()?.params.limit, 20);
  });

  it("respects explicit limit", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT", limit: 100 }, makeContext(client));
    assert.equal(getLastCall()?.params.limit, 100);
  });
});

describe("market_get_open_interest", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_open_interest")!;

  it("calls /public/open-interest", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instType: "SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/open-interest");
  });
});

describe("market_get_stock_tokens", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_stock_tokens")!;

  it("is registered", () => {
    assert.ok(tool, "market_get_stock_tokens should be registered");
  });

  it("calls /public/instruments", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/instruments");
  });

  it("defaults instType to SWAP when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "SWAP");
  });

  it("passes explicit instType", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instType: "SPOT" }, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "SPOT");
  });

  it("passes instId when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "AAPL-USDT-SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.params.instId, "AAPL-USDT-SWAP");
  });

  it("omits instId when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.instId, undefined);
  });

  it("filters out non-stock instruments (instCategory !== '3')", async () => {
    const { client } = makeMockClient();
    // Override publicGet to return mixed instruments
    (client as unknown as { publicGet: (e: string, p: Record<string, unknown>) => Promise<unknown> }).publicGet = async (endpoint, params) => ({
      endpoint,
      params,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: [
        { instId: "BTC-USDT-SWAP", instCategory: "1" },
        { instId: "AAPL-USDT-SWAP", instCategory: "3" },
        { instId: "TSLA-USDT-SWAP", instCategory: "3" },
        { instId: "ETH-USDT-SWAP", instCategory: "1" },
      ],
    });
    const result = await tool.handler({}, makeContext(client)) as { data: unknown[] };
    assert.equal(result.data.length, 2);
    assert.ok(
      (result.data as Array<{ instId: string }>).every((i) => i.instId.match(/AAPL|TSLA/)),
      "should only contain stock tokens",
    );
  });

  it("returns empty array when no stock tokens exist", async () => {
    const { client } = makeMockClient();
    (client as unknown as { publicGet: (e: string, p: Record<string, unknown>) => Promise<unknown> }).publicGet = async (endpoint, params) => ({
      endpoint,
      params,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: [
        { instId: "BTC-USDT-SWAP", instCategory: "1" },
        { instId: "ETH-USDT-SWAP", instCategory: "1" },
      ],
    });
    const result = await tool.handler({}, makeContext(client)) as { data: unknown[] };
    assert.equal(result.data.length, 0);
  });

  it("passes through non-array data unchanged", async () => {
    const { client } = makeMockClient();
    (client as unknown as { publicGet: (e: string, p: Record<string, unknown>) => Promise<unknown> }).publicGet = async (endpoint, params) => ({
      endpoint,
      params,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: null,
    });
    const result = await tool.handler({}, makeContext(client)) as { data: unknown };
    assert.equal(result.data, null);
  });
});

describe("market_get_instruments_by_category", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_instruments_by_category")!;

  it("is registered", () => {
    assert.ok(tool, "market_get_instruments_by_category should be registered");
  });

  it("calls /public/instruments", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instCategory: "4" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/instruments");
  });

  it("defaults instType to SWAP when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instCategory: "6" }, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "SWAP");
  });

  it("passes explicit instType", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instCategory: "4", instType: "SPOT" }, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "SPOT");
  });

  it("filters by the given instCategory", async () => {
    const { client } = makeMockClient();
    (client as unknown as { publicGet: (e: string, p: Record<string, unknown>) => Promise<unknown> }).publicGet = async (endpoint, params) => ({
      endpoint,
      params,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: [
        { instId: "BTC-USDT-SWAP", instCategory: "1" },
        { instId: "AAPL-USDT-SWAP", instCategory: "3" },
        { instId: "XAUUSDT-USDT-SWAP", instCategory: "4" },
        { instId: "OIL-USDT-SWAP", instCategory: "5" },
        { instId: "EURUSDT-USDT-SWAP", instCategory: "6" },
        { instId: "US30Y-USDT-SWAP", instCategory: "7" },
      ],
    });
    const result = await tool.handler({ instCategory: "4" }, makeContext(client)) as { data: Array<{ instId: string }> };
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].instId, "XAUUSDT-USDT-SWAP");
  });

  it("filters stock tokens (instCategory=3) — replaces market_get_stock_tokens", async () => {
    const { client } = makeMockClient();
    (client as unknown as { publicGet: (e: string, p: Record<string, unknown>) => Promise<unknown> }).publicGet = async (endpoint, params) => ({
      endpoint,
      params,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: [
        { instId: "BTC-USDT-SWAP", instCategory: "1" },
        { instId: "AAPL-USDT-SWAP", instCategory: "3" },
        { instId: "TSLA-USDT-SWAP", instCategory: "3" },
        { instId: "XAUUSDT-USDT-SWAP", instCategory: "4" },
      ],
    });
    const result = await tool.handler({ instCategory: "3" }, makeContext(client)) as { data: Array<{ instId: string }> };
    assert.equal(result.data.length, 2);
    assert.ok(result.data.every((i) => i.instId.match(/AAPL|TSLA/)));
  });

  it("filters commodities (instCategory=5)", async () => {
    const { client } = makeMockClient();
    (client as unknown as { publicGet: (e: string, p: Record<string, unknown>) => Promise<unknown> }).publicGet = async (endpoint, params) => ({
      endpoint,
      params,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: [
        { instId: "XAUUSDT-USDT-SWAP", instCategory: "4" },
        { instId: "OIL-USDT-SWAP", instCategory: "5" },
        { instId: "GAS-USDT-SWAP", instCategory: "5" },
      ],
    });
    const result = await tool.handler({ instCategory: "5" }, makeContext(client)) as { data: Array<{ instId: string }> };
    assert.equal(result.data.length, 2);
    assert.ok(result.data.every((i) => i.instId.match(/OIL|GAS/)));
  });

  it("returns empty array when no matching category", async () => {
    const { client } = makeMockClient();
    (client as unknown as { publicGet: (e: string, p: Record<string, unknown>) => Promise<unknown> }).publicGet = async (endpoint, params) => ({
      endpoint,
      params,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: [
        { instId: "BTC-USDT-SWAP", instCategory: "1" },
      ],
    });
    const result = await tool.handler({ instCategory: "7" }, makeContext(client)) as { data: unknown[] };
    assert.equal(result.data.length, 0);
  });
});

describe("market_get_index_ticker", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_index_ticker")!;

  it("calls /market/index-tickers", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/index-tickers");
  });

  it("passes instId filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USD" }, makeContext(client));
    assert.equal(getLastCall()?.params.instId, "BTC-USD");
  });

  it("omits instId when not provided (returns all indices)", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.instId, undefined);
  });
});

describe("market_get_index_candles", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_index_candles")!;

  it("calls /market/index-candles by default", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USD" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/index-candles");
  });

  it("calls /market/history-index-candles when history=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USD", history: true },
      makeContext(client),
    );
    assert.equal(
      getLastCall()?.endpoint,
      "/api/v5/market/history-index-candles",
    );
  });

  it("passes bar parameter", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USD", bar: "1H" }, makeContext(client));
    assert.equal(getLastCall()?.params.bar, "1H");
  });
});

describe("market_get_price_limit", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_price_limit")!;

  it("calls /public/price-limit", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/price-limit");
  });

  it("passes instId", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "ETH-USDT-SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.params.instId, "ETH-USDT-SWAP");
  });
});

// ---------------------------------------------------------------------------
// Spot trade tools
// ---------------------------------------------------------------------------

describe("spot_get_fills", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_get_fills")!;

  it("calls /trade/fills by default (archive omitted)", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills");
  });

  it("calls /trade/fills when archive=false", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", archive: false },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills");
  });

  it("calls /trade/fills-history when archive=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", archive: true },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills-history");
  });

  it("defaults limit to 20 for archive query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", archive: true },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.limit, 20);
  });

  it("does not set a default limit for recent fills", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT" }, makeContext(client));
    // recent fills: no default limit (undefined gets dropped by compactObject)
    assert.equal(getLastCall()?.params.limit, undefined);
  });

  it("respects explicit limit for archive query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", archive: true, limit: 50 },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.limit, 50);
  });
});

describe("spot_get_orders archive", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_get_orders")!;

  it("calls /trade/orders-pending by default (status omitted)", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-pending");
  });

  it("calls /trade/orders-history when status=history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "history" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-history");
  });

  it("calls /trade/orders-history-archive when status=archive", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "archive" }, makeContext(client));
    assert.equal(
      getLastCall()?.endpoint,
      "/api/v5/trade/orders-history-archive",
    );
  });
});

describe("spot_batch_orders", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_batch_orders")!;

  it("calls /trade/batch-orders for action=place via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        action: "place",
        orders: [
          { instId: "BTC-USDT", side: "buy", ordType: "market", sz: "10" },
        ],
      },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/batch-orders");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("calls /trade/cancel-batch-orders for action=cancel", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { action: "cancel", orders: [{ instId: "BTC-USDT", ordId: "123" }] },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-batch-orders");
  });

  it("defaults tdMode to cash for place orders", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        action: "place",
        orders: [
          { instId: "BTC-USDT", side: "buy", ordType: "market", sz: "10" },
        ],
      },
      makeContext(client),
    );
    const body = getLastCall()?.params as unknown as unknown[];
    assert.equal((body[0] as Record<string, unknown>).tdMode, "cash");
  });

  it("injects tag into each placed order", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { action: "place", orders: [{ instId: "BTC-USDT", side: "buy", ordType: "market", sz: "10" }] },
      makeContext(client),
    );
    const body = getLastCall()?.params as unknown[];
    assert.equal((body[0] as Record<string, unknown>).tag, DEFAULT_SOURCE_TAG);
  });
});

describe("swap_get_orders archive", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_get_orders")!;

  it("calls /trade/orders-pending by default", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-pending");
  });

  it("calls /trade/orders-history when status=history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "history" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-history");
  });

  it("calls /trade/orders-history-archive when status=archive", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "archive" }, makeContext(client));
    assert.equal(
      getLastCall()?.endpoint,
      "/api/v5/trade/orders-history-archive",
    );
  });
});

describe("spot_get_order", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_get_order")!;

  it("calls /trade/order", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", ordId: "12345" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order");
  });

  it("passes instId and ordId to the API", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", ordId: "99999" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.instId, "BTC-USDT");
    assert.equal(getLastCall()?.params.ordId, "99999");
  });
});

// ---------------------------------------------------------------------------
// Swap trade tools
// ---------------------------------------------------------------------------

describe("swap_get_fills", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_get_fills")!;

  it("calls /trade/fills by default", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills");
  });

  it("calls /trade/fills-history when archive=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", archive: true },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills-history");
  });

  it("defaults limit to 20 for archive query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", archive: true },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.limit, 20);
  });
});

describe("swap_get_order", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_get_order")!;

  it("calls /trade/order", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", ordId: "12345" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order");
  });
});

// ---------------------------------------------------------------------------
// Account tools
// ---------------------------------------------------------------------------

describe("account_get_bills", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_bills")!;

  it("calls /account/bills", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/bills");
  });

  it("defaults limit to 20", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.limit, 20);
  });

  it("respects explicit limit", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ limit: 100 }, makeContext(client));
    assert.equal(getLastCall()?.params.limit, 100);
  });
});

describe("account_get_positions_history", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_positions_history")!;

  it("calls /account/positions-history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/positions-history");
  });

  it("defaults instType to SWAP", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "SWAP");
  });

  it("respects explicit instType", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instType: "FUTURES" }, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "FUTURES");
  });

  it("defaults limit to 20", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.limit, 20);
  });
});

describe("account_get_trade_fee", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_trade_fee")!;

  it("calls /account/trade-fee", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instType: "SPOT" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/trade-fee");
  });
});

describe("account_get_config", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_config")!;

  it("calls /account/config", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/config");
  });

  it("preserves settleCcy and settleCcyList in response", async () => {
    const mockClient = {
      privateGet: async (endpoint: string) => ({
        endpoint,
        requestTime: "2024-01-01T00:00:00.000Z",
        data: [{ uid: "123", settleCcy: "USDT", settleCcyList: ["USDT", "USDC"], posMode: "net_mode" }],
      }),
    };
    const result = await tool.handler({}, makeContext(mockClient)) as Record<string, unknown>;
    const row = (result.data as Record<string, unknown>[])[0];
    assert.equal(row["settleCcy"], "USDT");
    assert.deepEqual(row["settleCcyList"], ["USDT", "USDC"]);
    assert.equal(row["posMode"], "net_mode");
    assert.equal(row["uid"], "123");
  });
});

describe("account_get_max_withdrawal", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_max_withdrawal")!;

  it("calls /account/max-withdrawal", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/max-withdrawal");
  });

  it("passes ccy filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT" }, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, "USDT");
  });

  it("omits ccy when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, undefined);
  });
});

describe("account_get_max_avail_size", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_max_avail_size")!;

  it("calls /account/max-avail-size", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/max-avail-size");
  });

  it("passes instId and tdMode", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "isolated" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.instId, "BTC-USDT-SWAP");
    assert.equal(getLastCall()?.params.tdMode, "isolated");
  });

  it("serializes reduceOnly=true as string 'true'", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross", reduceOnly: true },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.reduceOnly, "true");
  });

  it("omits reduceOnly when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.reduceOnly, undefined);
  });
});

describe("account_get_positions", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_positions")!;

  it("calls /account/positions", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/positions");
  });

  it("passes instType when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instType: "SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "SWAP");
  });

  it("omits instType when not provided (returns all positions)", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.instType, undefined);
  });

  it("passes instId filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP" }, makeContext(client));
    assert.equal(getLastCall()?.params.instId, "BTC-USDT-SWAP");
  });
});

describe("account_get_bills_archive", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_bills_archive")!;

  it("calls /account/bills-archive", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/bills-archive");
  });

  it("defaults limit to 20", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.limit, 20);
  });

  it("respects explicit limit", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ limit: 50 }, makeContext(client));
    assert.equal(getLastCall()?.params.limit, 50);
  });

  it("passes ccy filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT" }, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, "USDT");
  });
});

describe("account_set_position_mode", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_set_position_mode")!;

  it("calls /account/set-position-mode via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ posMode: "net_mode" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/set-position-mode");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes posMode to the API", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ posMode: "long_short_mode" }, makeContext(client));
    assert.equal(getLastCall()?.params.posMode, "long_short_mode");
  });
});

describe("spot_batch_amend", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_batch_amend")!;

  it("calls /trade/amend-batch-orders via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { orders: [{ instId: "BTC-USDT", ordId: "123", newPx: "50000" }] },
      makeContext(client),
    );
    assert.equal(getLastCall()?.method, "POST");
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/amend-batch-orders");
  });

  it("throws when orders is empty", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({ orders: [] }, makeContext(client)),
      (err: unknown) => err instanceof Error,
    );
  });
});

describe("swap_batch_orders", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_batch_orders")!;

  it("calls /trade/batch-orders for action=place via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { action: "place", orders: [{ instId: "BTC-USDT-SWAP", tdMode: "cross", side: "buy", ordType: "market", sz: "1" }] },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/batch-orders");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("calls /trade/cancel-batch-orders for action=cancel", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { action: "cancel", orders: [{ instId: "BTC-USDT-SWAP", ordId: "456" }] },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-batch-orders");
  });

  it("injects tag into each placed order", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { action: "place", orders: [{ instId: "BTC-USDT-SWAP", tdMode: "cross", side: "buy", ordType: "market", sz: "1" }] },
      makeContext(client),
    );
    const body = getLastCall()?.params as unknown[];
    assert.equal((body[0] as Record<string, unknown>).tag, DEFAULT_SOURCE_TAG);
  });
});

describe("swap_batch_amend", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_batch_amend")!;

  it("calls /trade/amend-batch-orders via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { orders: [{ instId: "BTC-USDT-SWAP", ordId: "456", newSz: "2" }] },
      makeContext(client),
    );
    assert.equal(getLastCall()?.method, "POST");
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/amend-batch-orders");
  });
});

describe("spot_batch_cancel", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_batch_cancel")!;

  it("calls /trade/cancel-batch-orders via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { orders: [{ instId: "BTC-USDT", ordId: "123" }] },
      makeContext(client),
    );
    assert.equal(getLastCall()?.method, "POST");
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-batch-orders");
  });

  it("throws when orders is empty", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({ orders: [] }, makeContext(client)),
      (err: unknown) => err instanceof Error,
    );
  });
});

describe("swap_batch_cancel", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_batch_cancel")!;

  it("calls /trade/cancel-batch-orders via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { orders: [{ instId: "BTC-USDT-SWAP", ordId: "456" }] },
      makeContext(client),
    );
    assert.equal(getLastCall()?.method, "POST");
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-batch-orders");
  });
});

// ---------------------------------------------------------------------------
// Futures trade tools
// ---------------------------------------------------------------------------

describe("futures_place_order", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_place_order")!;

  it("calls /trade/order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-USDT-240329",
        tdMode: "cross",
        side: "buy",
        ordType: "market",
        sz: "1",
      },
      makeContext(client),
    );
    assert.equal(getLastCall()?.method, "POST");
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order");
  });

  it("injects tag into request body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-240329", tdMode: "cross", side: "buy", ordType: "market", sz: "1" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.tag, DEFAULT_SOURCE_TAG);
  });
});

describe("futures_get_orders", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_get_orders")!;

  it("defaults instType to FUTURES", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>)?.instType,
      "FUTURES",
    );
  });

  it("calls /trade/orders-history when status=history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "history" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-history");
  });
});

describe("futures_get_positions", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_get_positions")!;

  it("defaults instType to FUTURES", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>)?.instType,
      "FUTURES",
    );
  });
});

// ---------------------------------------------------------------------------
// assertNotDemo (common.ts)
// ---------------------------------------------------------------------------

describe("assertNotDemo", () => {
  it("throws ConfigError when demo=true", () => {
    const config = { demo: true } as ToolContext["config"];
    assert.throws(
      () => assertNotDemo(config, "test_endpoint"),
      (err: unknown) => err instanceof ConfigError,
    );
  });

  it("does not throw when demo=false", () => {
    const config = { demo: false } as ToolContext["config"];
    assert.doesNotThrow(() => assertNotDemo(config, "test_endpoint"));
  });
});

// ---------------------------------------------------------------------------
// Spot trade — write handlers
// ---------------------------------------------------------------------------

describe("spot_place_order", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_place_order")!;

  it("calls /trade/order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "buy",
        ordType: "market",
        sz: "100",
      },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes required fields", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "ETH-USDT",
        tdMode: "cash",
        side: "sell",
        ordType: "limit",
        sz: "1",
        px: "2000",
      },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.instId, "ETH-USDT");
    assert.equal(params.side, "sell");
    assert.equal(params.px, "2000");
  });

  it("injects tag into request body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", tdMode: "cash", side: "buy", ordType: "market", sz: "100" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.tag, DEFAULT_SOURCE_TAG);
  });
});

describe("spot_cancel_order", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_cancel_order")!;

  it("calls /trade/cancel-order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", ordId: "123" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-order");
    assert.equal(getLastCall()?.method, "POST");
  });
});

describe("spot_amend_order", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_amend_order")!;

  it("calls /trade/amend-order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", ordId: "123", newPx: "50000" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/amend-order");
    assert.equal(getLastCall()?.method, "POST");
  });
});

describe("spot_get_algo_orders", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_get_algo_orders")!;

  it("calls /trade/orders-algo-pending when ordType provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordType: "conditional" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-algo-pending");
  });

  it("calls /trade/orders-algo-history when status=history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { status: "history", ordType: "conditional" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-algo-history");
  });

  it("defaults state to effective for history queries", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { status: "history", ordType: "conditional" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.state, "effective");
  });

  it("passes explicit state for history queries", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { status: "history", ordType: "oco", state: "canceled" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.state, "canceled");
  });

  it("does not pass state for pending queries", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordType: "conditional" }, makeContext(client));
    assert.equal(getLastCall()?.params.state, undefined);
  });

  it("all parallel history requests include state", async () => {
    const calls: Record<string, unknown>[] = [];
    const fakeResponse = (endpoint: string) => ({
      endpoint,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: [],
    });
    const capturingClient = {
      publicGet: async (ep: string, p: Record<string, unknown>) => {
        calls.push(p);
        return fakeResponse(ep);
      },
      privateGet: async (ep: string, p: Record<string, unknown>) => {
        calls.push(p);
        return fakeResponse(ep);
      },
      privatePost: async (ep: string, p: Record<string, unknown>) => {
        calls.push(p);
        return fakeResponse(ep);
      },
    };
    await tool.handler({ status: "history" }, makeContext(capturingClient));
    assert.equal(calls.length, 3);
    for (const params of calls) {
      assert.equal(
        params.state,
        "effective",
        "each parallel request must include state",
      );
    }
  });

  it("makes three parallel requests when ordType is omitted", async () => {
    let callCount = 0;
    const fakeResponse = (endpoint: string) => ({
      endpoint,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: [],
    });
    const countingClient = {
      publicGet: async (ep: string, _p: unknown) => {
        callCount++;
        return fakeResponse(ep);
      },
      privateGet: async (ep: string, _p: unknown) => {
        callCount++;
        return fakeResponse(ep);
      },
      privatePost: async (ep: string, _p: unknown) => {
        callCount++;
        return fakeResponse(ep);
      },
    };
    await tool.handler({}, makeContext(countingClient));
    assert.equal(callCount, 3);
  });
});

// ---------------------------------------------------------------------------
// Swap trade — write handlers
// ---------------------------------------------------------------------------

describe("swap_place_order", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_place_order")!;

  it("calls /trade/order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-USDT-SWAP",
        tdMode: "cross",
        side: "buy",
        ordType: "market",
        sz: "1",
      },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("injects tag into request body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross", side: "buy", ordType: "market", sz: "1" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.tag, DEFAULT_SOURCE_TAG);
  });
});

describe("swap_cancel_order", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_cancel_order")!;

  it("calls /trade/cancel-order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", ordId: "456" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-order");
    assert.equal(getLastCall()?.method, "POST");
  });
});

describe("swap_get_positions", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_get_positions")!;

  it("calls /account/positions", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/positions");
  });

  it("defaults instType to SWAP", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "SWAP");
  });
});

describe("swap_close_position", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_close_position")!;

  it("calls /trade/close-position via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", mgnMode: "cross" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/close-position");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("injects tag into request body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP", mgnMode: "cross" }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.tag, DEFAULT_SOURCE_TAG);
  });
});

describe("swap_set_leverage", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_set_leverage")!;

  it("calls /account/set-leverage via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", lever: "10", mgnMode: "cross" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/set-leverage");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes lever and mgnMode", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", lever: "5", mgnMode: "isolated" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.lever, "5");
    assert.equal(params.mgnMode, "isolated");
  });
});

describe("swap_get_leverage", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_get_leverage")!;

  it("calls /account/leverage-info", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", mgnMode: "cross" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/leverage-info");
  });
});

// ---------------------------------------------------------------------------
// Account tools — write/read handlers not previously tested
// ---------------------------------------------------------------------------

describe("account_get_balance", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_balance")!;

  it("calls /account/balance", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/balance");
  });

  it("passes ccy filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "BTC" }, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, "BTC");
  });
});

describe("account_transfer", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_transfer")!;

  it("calls /asset/transfer via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { ccy: "USDT", amt: "100", from: "18", to: "6" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/asset/transfer");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes required fields", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { ccy: "USDT", amt: "50", from: "6", to: "18" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.ccy, "USDT");
    assert.equal(params.amt, "50");
  });
});

describe("account_get_max_size", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_max_size")!;

  it("calls /account/max-size", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/max-size");
  });

  it("passes instId and tdMode", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "ETH-USDT-SWAP", tdMode: "isolated" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.instId, "ETH-USDT-SWAP");
    assert.equal(getLastCall()?.params.tdMode, "isolated");
  });
});

describe("account_get_asset_balance", () => {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_asset_balance")!;

  it("calls /asset/balances", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/asset/balances");
  });

  it("passes ccy filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "ETH" }, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, "ETH");
  });

  it("does not include valuation field when showValuation is omitted", async () => {
    const { client } = makeMockClient();
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    assert.ok(!("valuation" in result));
  });

  it("calls /asset/asset-valuation and returns valuation field when showValuation=true", async () => {
    const calls: string[] = [];
    const client = {
      publicGet: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push(endpoint);
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [] };
      },
      privateGet: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push(endpoint);
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [{ totalBal: "1000" }] };
      },
      privatePost: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push(endpoint);
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [] };
      },
    };
    const result = await tool.handler({ showValuation: true }, makeContext(client)) as Record<string, unknown>;
    assert.ok(calls.includes("/api/v5/asset/balances"), "should call asset/balances");
    assert.ok(calls.includes("/api/v5/asset/asset-valuation"), "should call asset/asset-valuation");
    assert.ok("valuation" in result, "result should contain valuation field");
  });

  it("does not pass ccy to /asset/asset-valuation when showValuation=true", async () => {
    const callParams: Record<string, Record<string, unknown>> = {};
    const client = {
      publicGet: async (endpoint: string, params: Record<string, unknown>) => {
        callParams[endpoint] = params;
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [] };
      },
      privateGet: async (endpoint: string, params: Record<string, unknown>) => {
        callParams[endpoint] = params;
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [] };
      },
      privatePost: async (endpoint: string, params: Record<string, unknown>) => {
        callParams[endpoint] = params;
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [] };
      },
    };
    await tool.handler({ ccy: "USDT", showValuation: true }, makeContext(client));
    // ccy is a balance filter, not a quote currency — should not be forwarded to the valuation endpoint
    assert.equal(callParams["/api/v5/asset/asset-valuation"]?.ccy, undefined);
    // ccy should still be passed to the balances endpoint as a filter
    assert.equal(callParams["/api/v5/asset/balances"]?.ccy, "USDT");
  });
});

// ---------------------------------------------------------------------------
// Futures trade — handlers not previously tested
// ---------------------------------------------------------------------------

describe("futures_cancel_order", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_cancel_order")!;

  it("calls /trade/cancel-order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-240329", ordId: "999" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-order");
    assert.equal(getLastCall()?.method, "POST");
  });
});

describe("futures_get_order", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_get_order")!;

  it("calls /trade/order via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-240329", ordId: "777" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order");
    assert.equal(getLastCall()?.method, "GET");
  });
});

describe("futures_get_fills", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_get_fills")!;

  it("calls /trade/fills by default", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills");
  });

  it("calls /trade/fills-history when archive=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ archive: true }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills-history");
  });

  it("defaults instType to FUTURES", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "FUTURES");
  });
});

// ---------------------------------------------------------------------------
// Option trade tools
// ---------------------------------------------------------------------------

describe("option_place_order", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_place_order")!;

  it("calls /trade/order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-USD-241227-50000-C",
        tdMode: "cash",
        side: "buy",
        ordType: "limit",
        sz: "1",
        px: "500",
      },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes required fields", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-USD-241227-50000-P",
        tdMode: "cross",
        side: "sell",
        ordType: "market",
        sz: "2",
      },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.instId, "BTC-USD-241227-50000-P");
    assert.equal(params.tdMode, "cross");
    assert.equal(params.side, "sell");
    assert.equal(params.sz, "2");
  });

  it("serializes reduceOnly=true as string 'true'", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-USD-241227-50000-C",
        tdMode: "cash",
        side: "sell",
        ordType: "market",
        sz: "1",
        reduceOnly: true,
      },
      makeContext(client),
    );
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).reduceOnly,
      "true",
    );
  });

  it("omits reduceOnly when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-USD-241227-50000-C",
        tdMode: "cash",
        side: "buy",
        ordType: "market",
        sz: "1",
      },
      makeContext(client),
    );
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).reduceOnly,
      undefined,
    );
  });

  it("injects tag into request body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USD-241227-50000-C", tdMode: "cash", side: "buy", ordType: "market", sz: "1" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.tag, DEFAULT_SOURCE_TAG);
  });
});

describe("option_cancel_order", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_cancel_order")!;

  it("calls /trade/cancel-order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USD-241227-50000-C", ordId: "123" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-order");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes instId and ordId", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USD-241227-50000-C", ordId: "456" },
      makeContext(client),
    );
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).instId,
      "BTC-USD-241227-50000-C",
    );
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).ordId,
      "456",
    );
  });
});

describe("option_batch_cancel", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_batch_cancel")!;

  it("calls /trade/cancel-batch-orders via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { orders: [{ instId: "BTC-USD-241227-50000-C", ordId: "123" }] },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-batch-orders");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("throws when orders is empty", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({ orders: [] }, makeContext(client)),
      (err: unknown) => err instanceof Error,
    );
  });
});

describe("option_amend_order", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_amend_order")!;

  it("calls /trade/amend-order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USD-241227-50000-C", ordId: "123", newPx: "600" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/amend-order");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes newPx and newSz", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-USD-241227-50000-C",
        ordId: "123",
        newPx: "700",
        newSz: "2",
      },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.newPx, "700");
    assert.equal(params.newSz, "2");
  });
});

describe("option_get_order", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_get_order")!;

  it("calls /trade/order via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USD-241227-50000-C", ordId: "789" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("passes instId and ordId", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USD-241227-50000-P", clOrdId: "myOrd1" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.instId, "BTC-USD-241227-50000-P");
    assert.equal(params.clOrdId, "myOrd1");
  });
});

describe("option_get_orders", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_get_orders")!;

  it("calls /trade/orders-pending by default (status omitted)", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-pending");
  });

  it("calls /trade/orders-pending when status=live", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "live" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-pending");
  });

  it("calls /trade/orders-history when status=history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "history" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-history");
  });

  it("calls /trade/orders-history-archive when status=archive", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "archive" }, makeContext(client));
    assert.equal(
      getLastCall()?.endpoint,
      "/api/v5/trade/orders-history-archive",
    );
  });

  it("always passes instType=OPTION", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).instType,
      "OPTION",
    );
  });

  it("passes uly filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uly: "BTC-USD" }, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).uly,
      "BTC-USD",
    );
  });
});

describe("option_get_positions", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_get_positions")!;

  it("calls /account/positions", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/positions");
  });

  it("always passes instType=OPTION", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).instType,
      "OPTION",
    );
  });

  it("passes instId filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USD-241227-50000-C" },
      makeContext(client),
    );
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).instId,
      "BTC-USD-241227-50000-C",
    );
  });

  it("passes uly filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uly: "ETH-USD" }, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).uly,
      "ETH-USD",
    );
  });
});

describe("option_get_fills", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_get_fills")!;

  it("calls /trade/fills by default", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills");
  });

  it("calls /trade/fills-history when archive=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ archive: true }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills-history");
  });

  it("always passes instType=OPTION", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).instType,
      "OPTION",
    );
  });

  it("defaults limit to 20 for archive query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ archive: true }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).limit, 20);
  });

  it("does not set default limit for recent fills", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).limit,
      undefined,
    );
  });
});

describe("option_get_instruments", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_get_instruments")!;

  it("calls /public/instruments via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uly: "BTC-USD" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/instruments");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("always passes instType=OPTION", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uly: "BTC-USD" }, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).instType,
      "OPTION",
    );
  });

  it("passes uly", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uly: "ETH-USD" }, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).uly,
      "ETH-USD",
    );
  });

  it("passes expTime filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { uly: "BTC-USD", expTime: "241227" },
      makeContext(client),
    );
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).expTime,
      "241227",
    );
  });

  it("omits expTime when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uly: "BTC-USD" }, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).expTime,
      undefined,
    );
  });
});

describe("option_get_greeks", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_get_greeks")!;

  it("calls /public/opt-summary via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uly: "BTC-USD" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/opt-summary");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("passes uly", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uly: "ETH-USD" }, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).uly,
      "ETH-USD",
    );
  });

  it("passes expTime filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { uly: "BTC-USD", expTime: "250328" },
      makeContext(client),
    );
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).expTime,
      "250328",
    );
  });

  it("omits expTime when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uly: "BTC-USD" }, makeContext(client));
    assert.equal(
      (getLastCall()?.params as Record<string, unknown>).expTime,
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// Grid tools — module field
// ---------------------------------------------------------------------------

describe("grid tools module field", () => {
  const tools = registerGridTools();

  it("all grid tools have module 'bot.grid'", () => {
    for (const tool of tools) {
      assert.equal(
        tool.module,
        "bot.grid",
        `${tool.name} should have module bot.grid`,
      );
    }
  });

  it("registers exactly 5 grid tools", () => {
    assert.equal(tools.length, 5);
  });
});

// ---------------------------------------------------------------------------
// Grid — grid_create_order basePos
// ---------------------------------------------------------------------------

describe("grid_create_order basePos", () => {
  const tools = registerGridTools();
  const tool = tools.find((t) => t.name === "grid_create_order")!;

  const baseArgs = {
    instId: "BTC-USDT-SWAP",
    algoOrdType: "contract_grid",
    maxPx: "100000",
    minPx: "80000",
    gridNum: "10",
    direction: "long",
    lever: "5",
    sz: "100",
  };

  it("defaults basePos to true for contract_grid", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(baseArgs, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.basePos, true);
  });

  it("respects explicit basePos=false", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ...baseArgs, basePos: false }, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.basePos, false);
  });

  it("respects explicit basePos=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ...baseArgs, basePos: true }, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.basePos, true);
  });

  it("does not set basePos for spot grid", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-USDT",
        algoOrdType: "grid",
        maxPx: "100000",
        minPx: "80000",
        gridNum: "10",
        quoteSz: "100",
      },
      makeContext(client),
    );
    const params = getLastCall()!.params;
    assert.equal(params.basePos, undefined);
  });

  it("injects tag into request body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(baseArgs, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.tag, DEFAULT_SOURCE_TAG);
  });
});

// ---------------------------------------------------------------------------
// Grid — grid_create_order coin-margined (CoinM)
// ---------------------------------------------------------------------------

describe("grid_create_order coin-margined", () => {
  const tools = registerGridTools();
  const tool = tools.find((t) => t.name === "grid_create_order")!;

  const coinMArgs = {
    instId: "BTC-USD-SWAP",
    algoOrdType: "contract_grid",
    maxPx: "100000",
    minPx: "80000",
    gridNum: "20",
    direction: "long",
    lever: "5",
    sz: "0.1",
  };

  it("passes coin-margined instId (BTC-USD-SWAP) correctly", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(coinMArgs, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.instId, "BTC-USD-SWAP");
    assert.equal(params.algoOrdType, "contract_grid");
  });

  it("passes sz as coin amount for coin-margined contracts", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(coinMArgs, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.sz, "0.1");
  });

  it("defaults basePos to true for coin-margined contract_grid", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(coinMArgs, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.basePos, true);
  });

  it("tool description mentions coin-margined support", () => {
    assert.ok(
      tool.description.includes("coin-margined"),
      "grid_create_order description should mention coin-margined",
    );
  });

  it("instId description includes BTC-USD-SWAP example", () => {
    const props = (tool.inputSchema as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
    const desc = props["instId"]["description"] as string;
    assert.ok(
      desc.includes("BTC-USD-SWAP"),
      "instId description should include BTC-USD-SWAP as coin-margined example",
    );
  });

  it("sz description mentions coin unit for coin-margined", () => {
    const props = (tool.inputSchema as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
    const desc = props["sz"]["description"] as string;
    assert.ok(
      desc.includes("coin") || desc.includes("BTC"),
      "sz description should mention coin-margined unit",
    );
  });
});

// ---------------------------------------------------------------------------
// Grid — grid_create_order TP/SL params
// ---------------------------------------------------------------------------

describe("grid_create_order TP/SL params", () => {
  const tools = registerGridTools();
  const tool = tools.find((t) => t.name === "grid_create_order")!;

  const contractArgs = {
    instId: "BTC-USDT-SWAP",
    algoOrdType: "contract_grid",
    maxPx: "100000",
    minPx: "80000",
    gridNum: "10",
    direction: "long",
    lever: "5",
    sz: "100",
  };

  it("passes tpTriggerPx and slTriggerPx to API", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ...contractArgs, tpTriggerPx: "110000", slTriggerPx: "75000" }, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.tpTriggerPx, "110000");
    assert.equal(params.slTriggerPx, "75000");
  });

  it("passes tpRatio and slRatio to API", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ...contractArgs, tpRatio: "0.1", slRatio: "0.05" }, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.tpRatio, "0.1");
    assert.equal(params.slRatio, "0.05");
  });

  it("omits TP/SL fields when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(contractArgs, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.tpTriggerPx, undefined);
    assert.equal(params.slTriggerPx, undefined);
    assert.equal(params.tpRatio, undefined);
    assert.equal(params.slRatio, undefined);
  });

  it("schema includes tpTriggerPx, slTriggerPx, tpRatio, slRatio", () => {
    const props = (tool.inputSchema as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
    assert.ok(props["tpTriggerPx"], "tpTriggerPx should exist in schema");
    assert.ok(props["slTriggerPx"], "slTriggerPx should exist in schema");
    assert.ok(props["tpRatio"], "tpRatio should exist in schema");
    assert.ok(props["slRatio"], "slRatio should exist in schema");
  });
});

// ---------------------------------------------------------------------------
// Grid — grid_create_order algoClOrdId
// ---------------------------------------------------------------------------

describe("grid_create_order algoClOrdId", () => {
  const tools = registerGridTools();
  const tool = tools.find((t) => t.name === "grid_create_order")!;

  const baseArgs = {
    instId: "BTC-USDT",
    algoOrdType: "grid",
    maxPx: "100000",
    minPx: "80000",
    gridNum: "10",
    quoteSz: "100",
  };

  it("passes algoClOrdId to API when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ...baseArgs, algoClOrdId: "myGrid001" }, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.algoClOrdId, "myGrid001");
  });

  it("omits algoClOrdId when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(baseArgs, makeContext(client));
    const params = getLastCall()!.params;
    assert.equal(params.algoClOrdId, undefined);
  });

  it("schema includes algoClOrdId", () => {
    const props = (tool.inputSchema as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
    assert.ok(props["algoClOrdId"], "algoClOrdId should exist in schema");
  });
});

// ---------------------------------------------------------------------------
// DCA tools
// ---------------------------------------------------------------------------

describe("dca_create_order", () => {
  const tools = registerDcaTools();
  const tool = tools.find((t) => t.name === "dca_create_order")!;

  it("calls /dca/create endpoint with algoOrdType=contract_dca", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
    }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/create");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "contract_dca");
  });

  it("calls /dca/create with algoOrdType=spot_dca", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT", algoOrdType: "spot_dca",
      direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.05",
    }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/create");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "spot_dca");
  });

  it("contract_dca throws without lever", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({
        instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
        direction: "long",
        initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.02",
      }, makeContext(client)),
      { name: "OkxApiError" },
    );
  });

  it("spot_dca with direction=short does not throw", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT", algoOrdType: "spot_dca",
      direction: "short",
      initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.05",
    }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).direction, "short");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "spot_dca");
  });

  it("spot_dca does not require lever", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT", algoOrdType: "spot_dca",
      direction: "long",
      initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.05",
    }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "spot_dca");
    assert.equal((getLastCall()?.params as Record<string, unknown>).lever, undefined);
  });

  it("passes direction directly", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "short",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
    }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).direction, "short");
  });

  it("passes slMode when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
      slMode: "limit",
    }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).slMode, "limit");
  });

  it("passes allowReinvest=false as boolean", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
      allowReinvest: false,
    }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).allowReinvest, false);
  });

  it("converts allowReinvest string 'true' to boolean true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
      allowReinvest: "true",
    }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).allowReinvest, true);
  });

  it("converts allowReinvest boolean true to true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
      allowReinvest: true,
    }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).allowReinvest, true);
  });

  it("defaults triggerParams to instant strategy", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    const triggerParams = params.triggerParams as Record<string, string>[];
    assert.equal(triggerParams.length, 1);
    assert.equal(triggerParams[0]!.triggerAction, "start");
    assert.equal(triggerParams[0]!.triggerStrategy, "instant");
  });

  it("builds triggerParams with price strategy and triggerPx", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
      triggerStrategy: "price", triggerPx: "50000",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    const triggerParams = params.triggerParams as Record<string, string>[];
    assert.equal(triggerParams[0]!.triggerStrategy, "price");
    assert.equal(triggerParams[0]!.triggerPx, "50000");
  });

  it("triggerStrategy=price throws without triggerPx", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({
        instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
        lever: "3", direction: "long",
        initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
        pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
        triggerStrategy: "price",
      }, makeContext(client)),
      { name: "ValidationError" },
    );
  });

  it("safetyOrdAmt, pxSteps, pxStepsMult, volMult are optional (not in schema required)", async () => {
    const { client, getLastCall } = makeMockClient();
    // Only pass the 6 schema-required fields — no safetyOrdAmt/pxSteps/pxStepsMult/volMult
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.02",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.safetyOrdAmt, undefined);
    assert.equal(params.pxSteps, undefined);
    assert.equal(params.pxStepsMult, undefined);
    assert.equal(params.volMult, undefined);
  });

  it("throws when maxSafetyOrds>0 but pxStepsMult is missing", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({
        instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
        lever: "3", direction: "long",
        initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
        pxSteps: "0.03", volMult: "1", tpPct: "0.02",
      }, makeContext(client)),
      { name: "OkxApiError" },
    );
  });

  it("throws when maxSafetyOrds>0 but volMult is missing", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({
        instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
        lever: "3", direction: "long",
        initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
        pxSteps: "0.03", pxStepsMult: "1", tpPct: "0.02",
      }, makeContext(client)),
      { name: "OkxApiError" },
    );
  });

  it("does not send slMode/allowReinvest when omitted", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.slMode, undefined);
    assert.equal(params.allowReinvest, undefined);
  });

  it("passes slPct and slMode when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50",
      maxSafetyOrds: "3", pxSteps: "0.02",
      pxStepsMult: "1", volMult: "1", tpPct: "0.02",
      slPct: "0.05", slMode: "market",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.slPct, "0.05");
    assert.equal(params.slMode, "market");
  });

  it("omits slPct and slMode when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", safetyOrdAmt: "50", maxSafetyOrds: "3",
      pxSteps: "0.03", pxStepsMult: "1", volMult: "1", tpPct: "0.02",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.slPct, undefined);
    assert.equal(params.slMode, undefined);
  });

  it("injects tag from context.config.sourceTag", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca",
      lever: "3", direction: "long",
      initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.02",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.tag, DEFAULT_SOURCE_TAG);
  });

  it("passes algoClOrdId when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT", algoOrdType: "spot_dca",
      direction: "long",
      initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.05",
      algoClOrdId: "myOrder123",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.algoClOrdId, "myOrder123");
  });

  it("passes reserveFunds and tradeQuoteCcy when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT", algoOrdType: "spot_dca",
      direction: "long",
      initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.05",
      reserveFunds: "false", tradeQuoteCcy: "USDT",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.reserveFunds, "false");
    assert.equal(params.tradeQuoteCcy, "USDT");
  });

  it("omits algoClOrdId, reserveFunds, tradeQuoteCcy when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      instId: "BTC-USDT", algoOrdType: "spot_dca",
      direction: "long",
      initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.05",
    }, makeContext(client));
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.algoClOrdId, undefined);
    assert.equal(params.reserveFunds, undefined);
    assert.equal(params.tradeQuoteCcy, undefined);
  });

});

describe("dca_stop_order", () => {
  const tools = registerDcaTools();
  const tool = tools.find((t) => t.name === "dca_stop_order")!;

  it("calls /dca/stop with algoOrdType=contract_dca", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "456", algoOrdType: "contract_dca" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/stop");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "contract_dca");
  });

  it("calls /dca/stop with algoOrdType=spot_dca and stopType", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "456", algoOrdType: "spot_dca", stopType: "1" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/stop");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "spot_dca");
    assert.equal((getLastCall()?.params as Record<string, unknown>).stopType, "1");
  });

  it("calls /dca/stop with algoOrdType=spot_dca and stopType=2", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "456", algoOrdType: "spot_dca", stopType: "2" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/stop");
    assert.equal((getLastCall()?.params as Record<string, unknown>).stopType, "2");
  });

  it("spot_dca throws without stopType", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({ algoId: "456", algoOrdType: "spot_dca" }, makeContext(client)),
      { name: "OkxApiError" },
    );
  });

  it("contract_dca does not require stopType", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "456", algoOrdType: "contract_dca" }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).stopType, undefined);
  });
});

describe("dca_get_orders", () => {
  const tools = registerDcaTools();
  const tool = tools.find((t) => t.name === "dca_get_orders")!;

  it("calls /dca/ongoing-list by default", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/ongoing-list");
  });

  it("calls /dca/history-list when status=history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "history" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/history-list");
  });

  it("passes algoOrdType filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoOrdType: "spot_dca" }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "spot_dca");
  });

  it("defaults to contract_dca when algoOrdType not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "contract_dca");
  });

  it("passes instId filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP" }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).instId, "BTC-USDT-SWAP");
  });

  it("omits instId when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).instId, undefined);
  });

  it("passes algoId filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "999888" }, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoId, "999888");
  });

  it("omits algoId when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoId, undefined);
  });
});

describe("dca_get_order_details", () => {
  const tools = registerDcaTools();
  const tool = tools.find((t) => t.name === "dca_get_order_details")!;

  it("calls /dca/position-details with algoOrdType=contract_dca", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "789", algoOrdType: "contract_dca" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/position-details");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "contract_dca");
  });

  it("calls /dca/position-details with algoOrdType=spot_dca", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "789", algoOrdType: "spot_dca" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/position-details");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "spot_dca");
  });
});

describe("dca_get_sub_orders", () => {
  const tools = registerDcaTools();
  const tool = tools.find((t) => t.name === "dca_get_sub_orders")!;

  it("without cycleId: calls /dca/cycle-list", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "123", algoOrdType: "contract_dca" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/cycle-list");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "contract_dca");
  });

  it("with cycleId: calls /dca/orders", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "123", algoOrdType: "contract_dca", cycleId: "c001" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/orders");
    assert.equal((getLastCall()?.params as Record<string, unknown>).cycleId, "c001");
  });

  it("passes algoOrdType=spot_dca to cycle-list", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "123", algoOrdType: "spot_dca" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/cycle-list");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "spot_dca");
  });

  it("passes algoOrdType=spot_dca to orders with cycleId", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ algoId: "123", algoOrdType: "spot_dca", cycleId: "c002" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/tradingBot/dca/orders");
    assert.equal((getLastCall()?.params as Record<string, unknown>).algoOrdType, "spot_dca");
    assert.equal((getLastCall()?.params as Record<string, unknown>).cycleId, "c002");
  });
});

// ---------------------------------------------------------------------------
// Algo trade — swap_get_algo_orders state parameter
// ---------------------------------------------------------------------------

describe("swap_get_algo_orders", () => {
  const tools = registerAlgoTradeTools();
  const tool = tools.find((t) => t.name === "swap_get_algo_orders")!;

  it("defaults state to effective for history queries", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { status: "history", ordType: "conditional" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.state, "effective");
  });

  it("passes explicit state for history queries", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { status: "history", ordType: "oco", state: "canceled" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.state, "canceled");
  });

  it("does not pass state for pending queries", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordType: "conditional" }, makeContext(client));
    assert.equal(getLastCall()?.params.state, undefined);
  });

  it("all parallel history requests include state", async () => {
    const calls: Record<string, unknown>[] = [];
    const fakeResponse = (endpoint: string) => ({
      endpoint,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: [],
    });
    const capturingClient = {
      publicGet: async (ep: string, p: Record<string, unknown>) => {
        calls.push(p);
        return fakeResponse(ep);
      },
      privateGet: async (ep: string, p: Record<string, unknown>) => {
        calls.push(p);
        return fakeResponse(ep);
      },
      privatePost: async (ep: string, p: Record<string, unknown>) => {
        calls.push(p);
        return fakeResponse(ep);
      },
    };
    await tool.handler({ status: "history" }, makeContext(capturingClient));
    assert.equal(calls.length, 3);
    for (const params of calls) {
      assert.equal(
        params.state,
        "effective",
        "each parallel request must include state",
      );
    }
  });
});

describe("dca tools registration", () => {
  const tools = registerDcaTools();

  it("registers exactly 5 DCA tools", () => {
    assert.equal(tools.length, 5);
  });

  it("all DCA tools have module bot.dca", () => {
    for (const tool of tools) {
      assert.equal(
        tool.module,
        "bot.dca",
        `${tool.name} should have module bot.dca`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Grid & DCA tools — algoId description regression (prevents error 51000/50016)
// ---------------------------------------------------------------------------

describe("grid tools algoId description", () => {
  const tools = registerGridTools();
  const toolsWithAlgoId = ["grid_get_orders", "grid_get_order_details", "grid_get_sub_orders", "grid_stop_order"];

  for (const name of toolsWithAlgoId) {
    it(`${name} has a non-empty algoId description`, () => {
      const tool = tools.find((t) => t.name === name)!;
      const props = (tool.inputSchema as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
      assert.ok(props["algoId"], `${name} should have algoId property`);
      assert.ok(
        typeof props["algoId"]["description"] === "string" && props["algoId"]["description"].length > 0,
        `${name}.algoId should have a non-empty description`,
      );
    });
  }

  const toolsWithAlgoOrdType = ["grid_get_order_details", "grid_get_sub_orders", "grid_stop_order"];

  for (const name of toolsWithAlgoOrdType) {
    it(`${name} algoOrdType description explains enum values`, () => {
      const tool = tools.find((t) => t.name === name)!;
      const props = (tool.inputSchema as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
      const desc = props["algoOrdType"]["description"];
      assert.ok(
        typeof desc === "string" && desc.includes("grid") && desc.includes("contract_grid"),
        `${name}.algoOrdType should describe the enum values (grid/contract_grid)`,
      );
    });
  }
});

describe("dca tools algoId description", () => {
  const tools = registerDcaTools();
  const allDcaTools = ["dca_create_order", "dca_stop_order", "dca_get_orders", "dca_get_order_details", "dca_get_sub_orders"];

  for (const name of allDcaTools) {
    const tool = tools.find((t) => t.name === name)!;
    const props = (tool.inputSchema as Record<string, unknown>).properties as Record<string, Record<string, unknown>>;
    if (props["algoId"]) {
      it(`${name} has a non-empty algoId description`, () => {
        assert.ok(
          typeof props["algoId"]["description"] === "string" && props["algoId"]["description"].length > 0,
          `${name}.algoId should have a non-empty description`,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// swap_place_algo_order — tag injection
// ---------------------------------------------------------------------------

describe("swap_place_algo_order tag injection", () => {
  const tools = registerAlgoTradeTools();
  const tool = tools.find((t) => t.name === "swap_place_algo_order")!;

  it("injects tag into request body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross", side: "sell", ordType: "conditional", sz: "1", slTriggerPx: "40000", slOrdPx: "-1" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.tag, DEFAULT_SOURCE_TAG);
  });
});

describe("spot_place_algo_order tag injection", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_place_algo_order")!;

  it("injects tag into request body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT", side: "sell", ordType: "conditional", sz: "0.01", slTriggerPx: "40000", slOrdPx: "-1" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.tag, DEFAULT_SOURCE_TAG);
  });
});

// ---------------------------------------------------------------------------
// swap_place_move_stop_order — callBack key names (capital B)
// ---------------------------------------------------------------------------

describe("swap_place_move_stop_order callBack key names", () => {
  const tools = registerAlgoTradeTools();
  const tool = tools.find((t) => t.name === "swap_place_move_stop_order")!;

  it("sends callBackRatio (capital B) in POST body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross", side: "sell", sz: "1", callbackRatio: "0.01" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.callBackRatio, "0.01", "callBackRatio (capital B) should be present");
    assert.equal(params.callbackRatio, undefined, "callbackRatio (lowercase b) should NOT be present");
  });

  it("sends callBackSpread (capital B) in POST body", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross", side: "sell", sz: "1", callbackSpread: "100" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.callBackSpread, "100", "callBackSpread (capital B) should be present");
    assert.equal(params.callbackSpread, undefined, "callbackSpread (lowercase b) should NOT be present");
  });
});

// ---------------------------------------------------------------------------
// swap_place_algo_order — callBack key names (capital B)
// ---------------------------------------------------------------------------

describe("swap_place_algo_order callBack key names", () => {
  const tools = registerAlgoTradeTools();
  const tool = tools.find((t) => t.name === "swap_place_algo_order")!;

  it("sends callBackRatio (capital B) in POST body for move_order_stop", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross", side: "sell", ordType: "move_order_stop", sz: "1", callbackRatio: "0.02" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.callBackRatio, "0.02", "callBackRatio (capital B) should be present");
    assert.equal(params.callbackRatio, undefined, "callbackRatio (lowercase b) should NOT be present");
  });

  it("sends callBackSpread (capital B) in POST body for move_order_stop", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-SWAP", tdMode: "cross", side: "sell", ordType: "move_order_stop", sz: "1", callbackSpread: "50" },
      makeContext(client),
    );
    const params = getLastCall()?.params as Record<string, unknown>;
    assert.equal(params.callBackSpread, "50", "callBackSpread (capital B) should be present");
    assert.equal(params.callbackSpread, undefined, "callbackSpread (lowercase b) should NOT be present");
  });
});

// ---------------------------------------------------------------------------
// Earn tools
// ---------------------------------------------------------------------------

import { registerEarnTools } from "../src/tools/earn/savings.js";
import { registerDcdTools } from "../src/tools/earn/dcd.js";

describe("earn tools registration", () => {
  const tools = registerEarnTools();

  it("registers exactly 9 earn tools", () => {
    assert.equal(tools.length, 9);
  });

  it("all earn tools have module earn.savings", () => {
    for (const tool of tools) {
      assert.equal(tool.module, "earn.savings", `${tool.name} should have module earn.savings`);
    }
  });
});

// ---------------------------------------------------------------------------
// On-chain Earn tools
// ---------------------------------------------------------------------------

describe("onchain-earn tools registration", () => {
  const tools = registerOnchainEarnTools();

  it("registers exactly 6 onchain-earn tools", () => {
    assert.equal(tools.length, 6);
  });

  it("all tools have module earn.onchain", () => {
    for (const tool of tools) {
      assert.equal(tool.module, "earn.onchain", `${tool.name} should have module earn.onchain`);
    }
  });

  it("write tools have isWrite=true", () => {
    const writeTools = ["onchain_earn_purchase", "onchain_earn_redeem", "onchain_earn_cancel"];
    for (const name of writeTools) {
      const tool = tools.find((t) => t.name === name);
      assert.ok(tool, `${name} should exist`);
      assert.equal(tool!.isWrite, true, `${name} should have isWrite=true`);
    }
  });

  it("read tools have isWrite=false", () => {
    const readTools = ["onchain_earn_get_offers", "onchain_earn_get_active_orders", "onchain_earn_get_order_history"];
    for (const name of readTools) {
      const tool = tools.find((t) => t.name === name);
      assert.ok(tool, `${name} should exist`);
      assert.equal(tool!.isWrite, false, `${name} should have isWrite=false`);
    }
  });
});

describe("earn_get_savings_balance", () => {
  const tools = registerEarnTools();
  const tool = tools.find((t) => t.name === "earn_get_savings_balance")!;

  it("calls /finance/savings/balance via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/savings/balance");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("passes ccy filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT" }, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, "USDT");
  });

  it("omits ccy when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, undefined);
  });

  it("is not a write tool", () => {
    assert.equal(tool.isWrite, false);
  });
});

describe("earn_get_fixed_order_list", () => {
  const tools = registerEarnTools();
  const tool = tools.find((t) => t.name === "earn_get_fixed_order_list")!;

  it("calls /finance/simple-earn-fixed/order-list via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/simple-earn-fixed/order-list");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("passes ccy and state when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT", state: "earning" }, makeContext(client));
    const params = getLastCall()?.params;
    assert.equal(params?.ccy, "USDT");
    assert.equal(params?.state, "earning");
  });

  it("omits optional params when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    const params = getLastCall()?.params;
    assert.equal(params?.ccy, undefined);
    assert.equal(params?.state, undefined);
  });

  it("is not a write tool", () => {
    assert.equal(tool.isWrite, false);
  });

  it("strips finalSettlementDate from response data", async () => {
    const { client, getCalls } = makeMockClientWithData({
      "/api/v5/finance/simple-earn-fixed/order-list": [
        { reqId: "r1", ccy: "USDT", finalSettlementDate: "2025-06-01", state: "earning", amt: "100" },
        { reqId: "r2", ccy: "BTC", finalSettlementDate: "2025-07-01", state: "pending", amt: "0.5" },
      ],
    });
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const data = result["data"] as Record<string, unknown>[];
    assert.equal(data.length, 2);
    assert.equal(data[0]!["reqId"], "r1");
    assert.equal(data[0]!["finalSettlementDate"], undefined);
    assert.equal(data[1]!["finalSettlementDate"], undefined);
    assert.equal(data[1]!["ccy"], "BTC");
  });
});

describe("earn_savings_purchase", () => {
  const tools = registerEarnTools();
  const tool = tools.find((t) => t.name === "earn_savings_purchase")!;

  it("calls /finance/savings/purchase-redempt via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT", amt: "100" }, makeContext(client));
    assert.equal(
      getLastCall()?.endpoint,
      "/api/v5/finance/savings/purchase-redempt",
    );
    assert.equal(getLastCall()?.method, "POST");
  });

  it("sets side to 'purchase'", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT", amt: "100" }, makeContext(client));
    assert.equal(getLastCall()?.params.side, "purchase");
  });

  it("defaults rate to 0.01 when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT", amt: "100" }, makeContext(client));
    assert.equal(getLastCall()?.params.rate, "0.01");
  });

  it("passes explicit rate", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { ccy: "USDT", amt: "100", rate: "0.05" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.rate, "0.05");
  });

  it("is a write tool", () => {
    assert.equal(tool.isWrite, true);
  });
});

describe("earn_fixed_purchase", () => {
  const tools = registerEarnTools();
  const tool = tools.find((t) => t.name === "earn_fixed_purchase")!;

  it("preview mode calls lending-rate-history and fixed offers APIs", async () => {
    const { client, getCalls } = makeMockClient();
    await tool.handler({ ccy: "USDT", amt: "1000", term: "90D" }, makeContext(client));
    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(endpoints.includes("/api/v5/finance/savings/lending-rate-history"));
    assert.ok(endpoints.includes("/api/v5/finance/simple-earn-fixed/offers"));
  });

  it("preview mode does not call purchase endpoint", async () => {
    const { client, getCalls } = makeMockClient();
    await tool.handler({ ccy: "USDT", amt: "1000", term: "90D" }, makeContext(client));
    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(!endpoints.includes("/api/v5/finance/simple-earn-fixed/purchase"));
  });

  it("preview mode returns preview flag", async () => {
    const { client } = makeMockClient();
    const result = await tool.handler({ ccy: "USDT", amt: "1000", term: "90D" }, makeContext(client)) as Record<string, unknown>;
    assert.equal(result["preview"], true);
    assert.equal(result["ccy"], "USDT");
    assert.equal(result["amt"], "1000");
    assert.equal(result["term"], "90D");
  });

  it("preview mode returns matched offer with soldOut flag", async () => {
    const { client } = makeMockClientWithData({
      "/api/v5/finance/savings/lending-rate-history": [{ lendingRate: "0.015", ts: "1700000000000" }],
      "/api/v5/finance/simple-earn-fixed/offers": [
        { ccy: "USDT", term: "90D", apr: "0.05", lendQuota: "50000", borrowingOrderQuota: "1000000", minLend: "100" },
        { ccy: "USDT", term: "30D", apr: "0.03", lendQuota: "0", borrowingOrderQuota: "500000", minLend: "100" },
      ],
    });
    const result = await tool.handler({ ccy: "USDT", amt: "1000", term: "90D" }, makeContext(client)) as Record<string, unknown>;
    const offer = result["offer"] as Record<string, unknown>;
    assert.ok(offer);
    assert.equal(offer["ccy"], "USDT");
    assert.equal(offer["term"], "90D");
    assert.equal(offer["soldOut"], false);
    assert.equal(offer["lendQuota"], "50000");
    assert.equal(offer["borrowingOrderQuota"], undefined); // stripped
    assert.equal(result["currentFlexibleRate"], "0.015");
    assert.ok(typeof result["warning"] === "string");
  });

  it("preview mode returns soldOut=true when lendQuota is 0", async () => {
    const { client } = makeMockClientWithData({
      "/api/v5/finance/savings/lending-rate-history": [],
      "/api/v5/finance/simple-earn-fixed/offers": [
        { ccy: "USDT", term: "90D", apr: "0.05", lendQuota: "0", borrowingOrderQuota: "0" },
      ],
    });
    const result = await tool.handler({ ccy: "USDT", amt: "1000", term: "90D" }, makeContext(client)) as Record<string, unknown>;
    const offer = result["offer"] as Record<string, unknown>;
    assert.ok(offer);
    assert.equal(offer["soldOut"], true);
    assert.equal(result["currentFlexibleRate"], null);
  });

  it("preview mode returns null offer when no match found", async () => {
    const { client } = makeMockClientWithData({
      "/api/v5/finance/savings/lending-rate-history": [],
      "/api/v5/finance/simple-earn-fixed/offers": [
        { ccy: "BTC", term: "30D", apr: "0.02", lendQuota: "10" },
      ],
    });
    const result = await tool.handler({ ccy: "USDT", amt: "1000", term: "90D" }, makeContext(client)) as Record<string, unknown>;
    assert.equal(result["offer"], null);
  });

  it("preview mode handles non-array data gracefully", async () => {
    const fakeNullDataResponse = (endpoint: string) => ({
      endpoint,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: null,
    });
    const client = {
      publicGet: async (endpoint: string, params: Record<string, unknown>) => fakeNullDataResponse(endpoint),
      privateGet: async (endpoint: string, params: Record<string, unknown>) => fakeNullDataResponse(endpoint),
      privatePost: async (endpoint: string, params: Record<string, unknown>) => fakeNullDataResponse(endpoint),
    };
    const result = await tool.handler({ ccy: "USDT", amt: "500", term: "30D" }, makeContext(client)) as Record<string, unknown>;
    assert.equal(result["preview"], true);
    assert.equal(result["offer"], null);
    assert.equal(result["currentFlexibleRate"], null);
  });

  it("confirm mode calls /finance/simple-earn-fixed/purchase via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT", amt: "1000", term: "90D", confirm: true }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/simple-earn-fixed/purchase");
    assert.equal(getLastCall()?.method, "POST");
    assert.equal(getLastCall()?.params.ccy, "USDT");
    assert.equal(getLastCall()?.params.amt, "1000");
    assert.equal(getLastCall()?.params.term, "90D");
  });

  it("rejects in demo mode (confirm)", async () => {
    const { client } = makeMockClient();
    const demoContext = {
      client: client as ToolContext["client"],
      config: { demo: true } as ToolContext["config"],
    };
    await assert.rejects(
      () => tool.handler({ ccy: "USDT", amt: "1000", term: "90D", confirm: true }, demoContext),
      (err: unknown) => err instanceof ConfigError,
    );
  });

  it("is a write tool", () => {
    assert.equal(tool.isWrite, true);
  });
});

describe("earn_fixed_redeem", () => {
  const tools = registerEarnTools();
  const tool = tools.find((t) => t.name === "earn_fixed_redeem")!;

  it("calls /finance/simple-earn-fixed/redeem via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ reqId: "req123" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/simple-earn-fixed/redeem");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes reqId correctly", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ reqId: "req456" }, makeContext(client));
    assert.equal(getLastCall()?.params.reqId, "req456");
  });

  it("rejects in demo mode", async () => {
    const { client } = makeMockClient();
    const demoContext = {
      client: client as ToolContext["client"],
      config: { demo: true } as ToolContext["config"],
    };
    await assert.rejects(
      () => tool.handler({ reqId: "req123" }, demoContext),
      (err: unknown) => err instanceof ConfigError,
    );
  });

  it("is a write tool", () => {
    assert.equal(tool.isWrite, true);
  });
});

describe("onchain_earn_get_offers", () => {
  const tools = registerOnchainEarnTools();
  const tool = tools.find((t) => t.name === "onchain_earn_get_offers")!;

  it("calls /finance/staking-defi/offers", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/staking-defi/offers");
  });

  it("passes filters when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "ETH", protocolType: "staking" }, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, "ETH");
    assert.equal(getLastCall()?.params.protocolType, "staking");
  });
});

describe("onchain_earn_purchase", () => {
  const tools = registerAllEarnTools();
  const tool = tools.find((t) => t.name === "onchain_earn_purchase")!;

  it("calls /finance/staking-defi/purchase via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { productId: "prod123", investData: [{ ccy: "ETH", amt: "1" }] },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/staking-defi/purchase");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes optional term and tag", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { productId: "prod123", investData: [{ ccy: "ETH", amt: "1" }], term: "30", tag: "myTag" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.term, "30");
    assert.equal(getLastCall()?.params.tag, "myTag");
  });

  it("rejects in demo mode", async () => {
    const { client } = makeMockClient();
    const demoContext = {
      client: client as ToolContext["client"],
      config: { demo: true } as ToolContext["config"],
    };
    await assert.rejects(
      () => tool.handler({ productId: "prod123", investData: [{ ccy: "ETH", amt: "1" }] }, demoContext),
      (err: unknown) => err instanceof ConfigError,
    );
  });
});

describe("earn_savings_redeem", () => {
  const tools = registerEarnTools();
  const tool = tools.find((t) => t.name === "earn_savings_redeem")!;

  it("calls /finance/savings/purchase-redempt via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT", amt: "50" }, makeContext(client));
    assert.equal(
      getLastCall()?.endpoint,
      "/api/v5/finance/savings/purchase-redempt",
    );
    assert.equal(getLastCall()?.method, "POST");
  });

  it("sets side to 'redempt'", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT", amt: "50" }, makeContext(client));
    assert.equal(getLastCall()?.params.side, "redempt");
  });

  it("is a write tool", () => {
    assert.equal(tool.isWrite, true);
  });
});

describe("onchain_earn_redeem", () => {
  const tools = registerAllEarnTools();
  const tool = tools.find((t) => t.name === "onchain_earn_redeem")!;

  it("calls /finance/staking-defi/redeem via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordId: "123", protocolType: "staking" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/staking-defi/redeem");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes allowEarlyRedeem when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordId: "123", protocolType: "defi", allowEarlyRedeem: true }, makeContext(client));
    assert.equal(getLastCall()?.params.allowEarlyRedeem, true);
  });

  it("rejects in demo mode", async () => {
    const { client } = makeMockClient();
    const demoContext = {
      client: client as ToolContext["client"],
      config: { demo: true } as ToolContext["config"],
    };
    await assert.rejects(
      () => tool.handler({ ordId: "123", protocolType: "staking" }, demoContext),
      (err: unknown) => err instanceof ConfigError,
    );
  });
});

describe("earn_set_lending_rate", () => {
  const tools = registerEarnTools();
  const tool = tools.find((t) => t.name === "earn_set_lending_rate")!;

  it("calls /finance/savings/set-lending-rate via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT", rate: "0.02" }, makeContext(client));
    assert.equal(
      getLastCall()?.endpoint,
      "/api/v5/finance/savings/set-lending-rate",
    );
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes ccy and rate", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "BTC", rate: "0.03" }, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, "BTC");
    assert.equal(getLastCall()?.params.rate, "0.03");
  });

  it("is a write tool", () => {
    assert.equal(tool.isWrite, true);
  });
});

describe("earn_get_lending_history", () => {
  const tools = registerEarnTools();
  const tool = tools.find((t) => t.name === "earn_get_lending_history")!;

  it("calls /finance/savings/lending-history via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(
      getLastCall()?.endpoint,
      "/api/v5/finance/savings/lending-history",
    );
    assert.equal(getLastCall()?.method, "GET");
  });

  it("passes ccy and limit when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "USDT", limit: 10 }, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, "USDT");
    assert.equal(getLastCall()?.params.limit, 10);
  });

  it("is not a write tool", () => {
    assert.equal(tool.isWrite, false);
  });
});

describe("earn_get_lending_rate_history", () => {
  const tools = registerEarnTools();
  const tool = tools.find((t) => t.name === "earn_get_lending_rate_history")!;

  it("calls both lending-rate-history and fixed offers APIs", async () => {
    const { client, getCalls } = makeMockClient();
    await tool.handler({}, makeContext(client));
    const calls = getCalls();
    const endpoints = calls.map((c) => c.endpoint);
    assert.ok(endpoints.includes("/api/v5/finance/savings/lending-rate-history"));
    assert.ok(endpoints.includes("/api/v5/finance/simple-earn-fixed/offers"));
  });

  it("passes ccy and limit to rate-history, ccy to fixed offers", async () => {
    const { client, getCalls } = makeMockClient();
    await tool.handler({ ccy: "BTC", limit: 50 }, makeContext(client));
    const calls = getCalls();
    const rateCall = calls.find((c) => c.endpoint === "/api/v5/finance/savings/lending-rate-history");
    const fixedCall = calls.find((c) => c.endpoint === "/api/v5/finance/simple-earn-fixed/offers");
    assert.equal(rateCall?.params.ccy, "BTC");
    assert.equal(rateCall?.params.limit, 50);
    assert.equal(fixedCall?.params.ccy, "BTC");
  });

  it("returns fixedOffers field in response", async () => {
    const { client } = makeMockClient();
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    assert.ok("fixedOffers" in result);
    assert.ok(Array.isArray(result["fixedOffers"]));
  });

  it("strips redundant rate field from rate history data", async () => {
    const { client } = makeMockClientWithData({
      "/api/v5/finance/savings/lending-rate-history": [
        { ccy: "USDT", lendingRate: "0.015", rate: "0.015", ts: "1700000000000" },
        { ccy: "USDT", lendingRate: "0.012", rate: "0.012", ts: "1699900000000" },
      ],
      "/api/v5/finance/simple-earn-fixed/offers": [],
    });
    const result = await tool.handler({ ccy: "USDT" }, makeContext(client)) as Record<string, unknown>;
    const data = result["data"] as Record<string, unknown>[];
    assert.equal(data.length, 2);
    assert.equal(data[0]!["lendingRate"], "0.015");
    assert.equal(data[0]!["rate"], undefined); // rate field stripped
    assert.equal(data[1]!["rate"], undefined);
  });

  it("enriches fixedOffers with soldOut flag and strips borrowingOrderQuota", async () => {
    const { client } = makeMockClientWithData({
      "/api/v5/finance/savings/lending-rate-history": [],
      "/api/v5/finance/simple-earn-fixed/offers": [
        { ccy: "USDT", term: "90D", apr: "0.05", lendQuota: "50000", borrowingOrderQuota: "1000000" },
        { ccy: "USDT", term: "30D", apr: "0.03", lendQuota: "0", borrowingOrderQuota: "500000" },
      ],
    });
    const result = await tool.handler({ ccy: "USDT" }, makeContext(client)) as Record<string, unknown>;
    const offers = result["fixedOffers"] as Record<string, unknown>[];
    assert.equal(offers.length, 2);
    assert.equal(offers[0]!["soldOut"], false);
    assert.equal(offers[0]!["borrowingOrderQuota"], undefined);
    assert.equal(offers[1]!["soldOut"], true);
    assert.equal(offers[1]!["borrowingOrderQuota"], undefined);
  });

  it("propagates error when API call throws", async () => {
    const client = {
      publicGet: async () => { throw new Error("rate api error"); },
      privateGet: async () => { throw new Error("fixed offers error"); },
      privatePost: async () => { throw new Error("should not be called"); },
    };
    await assert.rejects(
      () => tool.handler({ ccy: "USDT" }, makeContext(client)),
      (err: Error) => err.message === "rate api error" || err.message === "fixed offers error",
    );
  });

  it("handles non-array rate history data gracefully", async () => {
    const fakeNullDataResponse = (endpoint: string) => ({
      endpoint,
      requestTime: "2024-01-01T00:00:00.000Z",
      data: null,
    });
    const client = {
      publicGet: async (endpoint: string, params: Record<string, unknown>) => fakeNullDataResponse(endpoint),
      privateGet: async (endpoint: string, params: Record<string, unknown>) => fakeNullDataResponse(endpoint),
      privatePost: async (endpoint: string, params: Record<string, unknown>) => fakeNullDataResponse(endpoint),
    };
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    assert.ok(Array.isArray(result["data"]));
    assert.equal((result["data"] as unknown[]).length, 0);
  });
});

describe("onchain_earn_cancel", () => {
  const tools = registerAllEarnTools();
  const tool = tools.find((t) => t.name === "onchain_earn_cancel")!;

  it("calls /finance/staking-defi/cancel via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordId: "456", protocolType: "defi" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/staking-defi/cancel");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("rejects in demo mode", async () => {
    const { client } = makeMockClient();
    const demoContext = {
      client: client as ToolContext["client"],
      config: { demo: true } as ToolContext["config"],
    };
    await assert.rejects(
      () => tool.handler({ ordId: "456", protocolType: "defi" }, demoContext),
      (err: unknown) => err instanceof ConfigError,
    );
  });
});

describe("onchain_earn_get_active_orders", () => {
  const tools = registerOnchainEarnTools();
  const tool = tools.find((t) => t.name === "onchain_earn_get_active_orders")!;

  it("calls /finance/staking-defi/orders-active", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/staking-defi/orders-active");
  });

  it("passes filters when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ccy: "BTC", state: "1" }, makeContext(client));
    assert.equal(getLastCall()?.params.ccy, "BTC");
    assert.equal(getLastCall()?.params.state, "1");
  });
});

describe("onchain_earn_get_order_history", () => {
  const tools = registerOnchainEarnTools();
  const tool = tools.find((t) => t.name === "onchain_earn_get_order_history")!;

  it("calls /finance/staking-defi/orders-history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/staking-defi/orders-history");
  });

  it("passes pagination params", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ after: "123", before: "456" }, makeContext(client));
    assert.equal(getLastCall()?.params.after, "123");
    assert.equal(getLastCall()?.params.before, "456");
  });

  it("passes limit and after params", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ limit: "50", after: "ord100" }, makeContext(client));
    assert.equal(getLastCall()?.params.limit, "50");
    assert.equal(getLastCall()?.params.after, "ord100");
  });

  it("is not a write tool", () => {
    assert.equal(tool.isWrite, false);
  });
});

// ---------------------------------------------------------------------------
// normalizeResponse helper
// ---------------------------------------------------------------------------

describe("normalizeResponse", () => {
  it("returns endpoint, requestTime and data", () => {
    const input = { endpoint: "/api/v5/test", requestTime: "2026-01-01T00:00:00Z", data: [{ ccy: "USDT" }] };
    const result = normalizeResponse(input);
    assert.equal(result["endpoint"], input.endpoint);
    assert.equal(result["requestTime"], input.requestTime);
    assert.deepEqual(result["data"], input.data);
  });

  it("preserves null data", () => {
    const result = normalizeResponse({ endpoint: "/test", requestTime: "ts", data: null });
    assert.equal(result["data"], null);
  });

  it("preserves array data", () => {
    const result = normalizeResponse({ endpoint: "/test", requestTime: "ts", data: [1, 2, 3] });
    assert.deepEqual(result["data"], [1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// earn sub-module registration — isWrite checks
// ---------------------------------------------------------------------------
describe("earn tools isWrite classification", () => {
  const tools = registerEarnTools();

  it("write tools have isWrite=true", () => {
    const writeNames = ["earn_savings_purchase", "earn_savings_redeem", "earn_set_lending_rate", "earn_fixed_purchase", "earn_fixed_redeem"];
    for (const name of writeNames) {
      const tool = tools.find((t) => t.name === name);
      assert.ok(tool, `${name} should exist`);
      assert.equal(tool!.isWrite, true, `${name} should be a write tool`);
    }
  });

  it("read tools have isWrite=false", () => {
    const readNames = ["earn_get_savings_balance", "earn_get_fixed_order_list", "earn_get_lending_history", "earn_get_lending_rate_history"];
    for (const name of readNames) {
      const tool = tools.find((t) => t.name === name);
      assert.ok(tool, `${name} should exist`);
      assert.equal(tool!.isWrite, false, `${name} should not be a write tool`);
    }
  });
});

// ---------------------------------------------------------------------------
// DCD tools
// ---------------------------------------------------------------------------

describe("dcd tools registration", () => {
  const tools = registerDcdTools();

  it("registers exactly 6 dcd tools", () => {
    assert.equal(tools.length, 6);
  });

  it("all tools have module earn.dcd", () => {
    for (const tool of tools) {
      assert.equal(tool.module, "earn.dcd", `${tool.name} should have module earn.dcd`);
    }
  });

  it("write tools have isWrite=true", () => {
    for (const name of ["dcd_subscribe", "dcd_redeem"]) {
      const tool = tools.find((t) => t.name === name);
      assert.ok(tool, `${name} should exist`);
      assert.equal(tool!.isWrite, true, `${name} should have isWrite=true`);
    }
  });

  it("read tools have isWrite=false", () => {
    for (const name of ["dcd_get_currency_pairs", "dcd_get_products", "dcd_get_order_state", "dcd_get_orders"]) {
      const tool = tools.find((t) => t.name === name);
      assert.ok(tool, `${name} should exist`);
      assert.equal(tool!.isWrite, false, `${name} should have isWrite=false`);
    }
  });
});

describe("dcd_get_currency_pairs", () => {
  const tools = registerDcdTools();
  const tool = tools.find((t) => t.name === "dcd_get_currency_pairs")!;

  it("calls /api/v5/finance/sfp/dcd/currency-pair via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/sfp/dcd/currency-pair");
    assert.equal(getLastCall()?.method, "GET");
  });
});

describe("dcd_get_products", () => {
  const tools = registerDcdTools();
  const tool = tools.find((t) => t.name === "dcd_get_products")!;

  it("calls /api/v5/finance/sfp/dcd/products via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ baseCcy: "BTC", quoteCcy: "USDT", optType: "C" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/sfp/dcd/products");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("passes required params", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ baseCcy: "ETH", quoteCcy: "USDT", optType: "P" }, makeContext(client));
    assert.equal(getLastCall()?.params.baseCcy, "ETH");
    assert.equal(getLastCall()?.params.quoteCcy, "USDT");
    assert.equal(getLastCall()?.params.optType, "P");
  });
});


describe("dcd_subscribe", () => {
  const tools = registerAllEarnTools();
  const tool = tools.find((t) => t.name === "dcd_subscribe")!;

  function makeSubscribeClient(quoteData: Record<string, unknown> = { quoteId: "q-sub-123", annualizedYield: "0.185" }) {
    const calls: CapturedCall[] = [];
    const client = {
      publicGet: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push({ method: "GET", endpoint, params });
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [] };
      },
      privateGet: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push({ method: "GET", endpoint, params });
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [] };
      },
      privatePost: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push({ method: "POST", endpoint, params });
        if (endpoint === "/api/v5/finance/sfp/dcd/quote") {
          return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [quoteData] };
        }
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [] };
      },
    };
    return { client, getCalls: () => calls };
  }

  it("calls /dcd/quote then /dcd/trade in order", async () => {
    const { client, getCalls } = makeSubscribeClient();
    await tool.handler(
      { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.1", notionalCcy: "BTC" },
      makeContext(client),
    );
    const calls = getCalls();
    assert.equal(calls.length, 2);
    assert.equal(calls[0].endpoint, "/api/v5/finance/sfp/dcd/quote");
    assert.equal(calls[1].endpoint, "/api/v5/finance/sfp/dcd/trade");
  });

  it("passes productId, notionalSz, notionalCcy to quote", async () => {
    const { client, getCalls } = makeSubscribeClient();
    await tool.handler(
      { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.5", notionalCcy: "BTC" },
      makeContext(client),
    );
    assert.equal(getCalls()[0].params.productId, "BTC-USDT-260327-77000-C");
    assert.equal(getCalls()[0].params.notionalSz, "0.5");
    assert.equal(getCalls()[0].params.notionalCcy, "BTC");
  });

  it("passes quoteId from quote response to trade", async () => {
    const { client, getCalls } = makeSubscribeClient({ quoteId: "q-abc-456", annualizedYield: "0.20" });
    await tool.handler(
      { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.1", notionalCcy: "BTC" },
      makeContext(client),
    );
    assert.equal(getCalls()[1].params.quoteId, "q-abc-456");
  });

  it("passes optional clOrdId to trade when provided", async () => {
    const { client, getCalls } = makeSubscribeClient();
    await tool.handler(
      { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.1", notionalCcy: "BTC", clOrdId: "my-order-1" },
      makeContext(client),
    );
    assert.equal(getCalls()[1].params.clOrdId, "my-order-1");
  });

  it("omits clOrdId from trade when not provided", async () => {
    const { client, getCalls } = makeSubscribeClient();
    await tool.handler(
      { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.1", notionalCcy: "BTC" },
      makeContext(client),
    );
    assert.equal(getCalls()[1].params.clOrdId, undefined);
  });

  it("rejects with YIELD_BELOW_MIN when quote yield is below minAnnualizedYield", async () => {
    // API returns annualizedYield as decimal: 0.15 = 15%
    const { client } = makeSubscribeClient({ quoteId: "q-test", annualizedYield: "0.15" });
    await assert.rejects(
      () => tool.handler(
        { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.1", notionalCcy: "BTC", minAnnualizedYield: 18 },
        makeContext(client),
      ),
      (err: unknown) => err instanceof OkxApiError && (err as OkxApiError).code === "YIELD_BELOW_MIN",
    );
  });

  it("does not reject when quote yield meets minAnnualizedYield", async () => {
    // API returns annualizedYield as decimal: 0.20 = 20%
    const { client, getCalls } = makeSubscribeClient({ quoteId: "q-test", annualizedYield: "0.20" });
    await tool.handler(
      { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.1", notionalCcy: "BTC", minAnnualizedYield: 18 },
      makeContext(client),
    );
    assert.equal(getCalls().length, 2);
  });

  it("does not reject when quote yield exactly equals minAnnualizedYield", async () => {
    // 0.18 * 100 = 18, threshold is 18 → should pass (uses < not <=)
    const { client, getCalls } = makeSubscribeClient({ quoteId: "q-test", annualizedYield: "0.18" });
    await tool.handler(
      { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.1", notionalCcy: "BTC", minAnnualizedYield: 18 },
      makeContext(client),
    );
    assert.equal(getCalls().length, 2);
  });

  // NaN guard only fires when minAnnualizedYield is set; without it, non-numeric yield is ignored
  it("rejects with INVALID_YIELD_VALUE when annualizedYield is non-numeric", async () => {
    const { client } = makeSubscribeClient({ quoteId: "q-test", annualizedYield: "not-a-number" });
    await assert.rejects(
      () => tool.handler(
        { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.1", notionalCcy: "BTC", minAnnualizedYield: 10 },
        makeContext(client),
      ),
      (err: unknown) => err instanceof OkxApiError && (err as OkxApiError).code === "INVALID_YIELD_VALUE",
    );
  });

  it("rejects in demo mode", async () => {
    const { client } = makeSubscribeClient();
    const demoContext = { client: client as ToolContext["client"], config: { demo: true } as ToolContext["config"] };
    await assert.rejects(
      () => tool.handler(
        { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.1", notionalCcy: "BTC" },
        demoContext,
      ),
      (err: unknown) => err instanceof ConfigError,
    );
  });
});

describe("dcd_redeem", () => {
  const tools = registerAllEarnTools();
  const tool = tools.find((t) => t.name === "dcd_redeem")!;

  it("preview mode: calls /dcd/redeem-quote via POST (no quoteId)", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordId: "ord-123" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/sfp/dcd/redeem-quote");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("preview mode: passes ordId to redeem-quote", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordId: "ord-456" }, makeContext(client));
    assert.equal(getLastCall()?.params.ordId, "ord-456");
  });

  it("execute mode: calls /dcd/redeem with ordId and quoteId", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordId: "ord-123", quoteId: "q-redeem-456" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/sfp/dcd/redeem");
    assert.equal(getLastCall()?.params.ordId, "ord-123");
    assert.equal(getLastCall()?.params.quoteId, "q-redeem-456");
  });

  it("execute mode: auto-refreshes quote on 52905 and sets autoRefreshedQuote=true", async () => {
    const calls: Array<{ endpoint: string; params: Record<string, unknown> }> = [];
    let redeemAttempt = 0;
    const client = {
      publicGet: async () => ({ endpoint: "", requestTime: "", data: [] }),
      privateGet: async () => ({ endpoint: "", requestTime: "", data: [] }),
      privatePost: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push({ endpoint, params });
        if (endpoint === "/api/v5/finance/sfp/dcd/redeem") {
          redeemAttempt++;
          if (redeemAttempt === 1) throw new OkxApiError("Quote expired", { code: "52905" });
        }
        if (endpoint === "/api/v5/finance/sfp/dcd/redeem-quote") {
          return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [{ quoteId: "q-refreshed-789" }] };
        }
        return { endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [] };
      },
    };
    const result = await tool.handler(
      { ordId: "ord-123", quoteId: "q-expired" },
      makeContext(client),
    ) as Record<string, unknown>;
    assert.equal(result["autoRefreshedQuote"], true);
    assert.equal(calls.filter((c) => c.endpoint === "/api/v5/finance/sfp/dcd/redeem").length, 2);
    assert.equal(calls.filter((c) => c.endpoint === "/api/v5/finance/sfp/dcd/redeem-quote").length, 1);
  });

  it("execute mode: rejects in demo mode", async () => {
    const { client } = makeMockClient();
    const demoContext = { client: client as ToolContext["client"], config: { demo: true } as ToolContext["config"] };
    await assert.rejects(
      () => tool.handler({ ordId: "ord-123", quoteId: "q-456" }, demoContext),
      (err: unknown) => err instanceof ConfigError,
    );
  });

  it("preview mode: does NOT reject in demo mode", async () => {
    const { client } = makeMockClient();
    const demoContext = { client: client as ToolContext["client"], config: { demo: true } as ToolContext["config"] };
    await tool.handler({ ordId: "ord-123" }, demoContext);
  });
});

describe("dcd_get_order_state", () => {
  const tools = registerDcdTools();
  const tool = tools.find((t) => t.name === "dcd_get_order_state")!;

  it("calls /api/v5/finance/sfp/dcd/order-status via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordId: "987654321" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/sfp/dcd/order-status");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("passes ordId", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordId: "123" }, makeContext(client));
    assert.equal(getLastCall()?.params.ordId, "123");
  });
});

describe("dcd_get_orders", () => {
  const tools = registerDcdTools();
  const tool = tools.find((t) => t.name === "dcd_get_orders")!;

  it("calls /api/v5/finance/sfp/dcd/order-history via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/finance/sfp/dcd/order-history");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("passes optional filters when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ state: "live", uly: "BTC-USD", limit: 10 }, makeContext(client));
    assert.equal(getLastCall()?.params.state, "live");
    assert.equal(getLastCall()?.params.uly, "BTC-USD");
    assert.equal(getLastCall()?.params.limit, 10);
  });

  it("omits undefined optional params", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params.state, undefined);
    assert.equal(getLastCall()?.params.ordId, undefined);
  });
});

// ---------------------------------------------------------------------------
// Futures trade — new tools (Phase 1)
// ---------------------------------------------------------------------------

describe("futures_amend_order", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_amend_order")!;

  it("calls /api/v5/trade/amend-order via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-240329", ordId: "123", newPx: "50000" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/amend-order");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes newPx and newSz when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-240329", ordId: "123", newPx: "50000", newSz: "2" }, makeContext(client));
    assert.equal(getLastCall()?.params.newPx, "50000");
    assert.equal(getLastCall()?.params.newSz, "2");
  });
});

describe("futures_close_position", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_close_position")!;

  it("calls /api/v5/trade/close-position via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-240329", mgnMode: "cross" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/close-position");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes posSide when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-240329", mgnMode: "isolated", posSide: "long" }, makeContext(client));
    assert.equal(getLastCall()?.params.posSide, "long");
  });
});

describe("futures_set_leverage", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_set_leverage")!;

  it("calls /api/v5/account/set-leverage via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-240329", lever: "10", mgnMode: "cross" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/set-leverage");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes lever and mgnMode correctly", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-240329", lever: "5", mgnMode: "isolated" }, makeContext(client));
    assert.equal(getLastCall()?.params.lever, "5");
    assert.equal(getLastCall()?.params.mgnMode, "isolated");
  });
});

describe("futures_get_leverage", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_get_leverage")!;

  it("calls /api/v5/account/leverage-info via GET", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-240329", mgnMode: "cross" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/leverage-info");
    assert.equal(getLastCall()?.method, "GET");
  });
});

describe("futures_batch_orders", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_batch_orders")!;

  it("calls /api/v5/trade/batch-orders via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    const orders = [{ instId: "BTC-USDT-240329", tdMode: "cross", side: "buy", ordType: "limit", sz: "1", px: "50000" }];
    await tool.handler({ orders }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/batch-orders");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("throws if orders is empty", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({ orders: [] }, makeContext(client)),
      /non-empty array/,
    );
  });
});

describe("futures_batch_amend", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_batch_amend")!;

  it("calls /api/v5/trade/amend-batch-orders via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ orders: [{ instId: "BTC-USDT-240329", ordId: "123", newPx: "50000" }] }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/amend-batch-orders");
    assert.equal(getLastCall()?.method, "POST");
  });
});

describe("futures_batch_cancel", () => {
  const tools = registerFuturesTools();
  const tool = tools.find((t) => t.name === "futures_batch_cancel")!;

  it("calls /api/v5/trade/cancel-batch-orders via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ orders: [{ instId: "BTC-USDT-240329", ordId: "123" }] }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/cancel-batch-orders");
    assert.equal(getLastCall()?.method, "POST");
  });
});

// ---------------------------------------------------------------------------
// Futures algo tools (Phase 1)
// ---------------------------------------------------------------------------

describe("futures_place_algo_order", () => {
  const tools = registerFuturesAlgoTools();
  const tool = tools.find((t) => t.name === "futures_place_algo_order")!;

  it("calls /api/v5/trade/order-algo via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-240329", tdMode: "cross", side: "sell", ordType: "conditional", sz: "1", tpTriggerPx: "60000", tpOrdPx: "-1" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order-algo");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("passes tpTriggerPx and slTriggerPx when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-USDT-240329", tdMode: "cross", side: "sell", ordType: "oco", sz: "1", tpTriggerPx: "60000", slTriggerPx: "40000" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params.tpTriggerPx, "60000");
    assert.equal(getLastCall()?.params.slTriggerPx, "40000");
  });
});

describe("futures_get_algo_orders", () => {
  const tools = registerFuturesAlgoTools();
  const tool = tools.find((t) => t.name === "futures_get_algo_orders")!;

  it("defaults to instType=FUTURES", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordType: "conditional" }, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "FUTURES");
  });

  it("calls pending endpoint by default", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordType: "conditional" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-algo-pending");
  });

  it("calls history endpoint when status=history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "history", ordType: "conditional" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-algo-history");
  });

  it("defaults state to effective for history", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ status: "history", ordType: "conditional" }, makeContext(client));
    assert.equal(getLastCall()?.params.state, "effective");
  });
});

describe("swap_get_algo_orders instType param", () => {
  const tools = registerAlgoTradeTools();
  const tool = tools.find((t) => t.name === "swap_get_algo_orders")!;

  it("defaults instType to SWAP", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordType: "conditional" }, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "SWAP");
  });

  it("passes explicit instType=FUTURES", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ ordType: "conditional", instType: "FUTURES" }, makeContext(client));
    assert.equal(getLastCall()?.params.instType, "FUTURES");
  });
});

// ---------------------------------------------------------------------------
// earn demo guard (earn/index.ts — withDemoGuard)
// ---------------------------------------------------------------------------

describe("earn demo guard", () => {
  const tools = registerAllEarnTools();
  // Guard only applies to write tools (isWrite: true), excluding dcd_redeem (has own check)
  const DEMO_GUARD_SKIP = new Set(["dcd_redeem", "earn_fixed_purchase"]);
  const guardedTools = tools.filter((t) => t.isWrite && !DEMO_GUARD_SKIP.has(t.name));
  const readOnlyTools = tools.filter((t) => !t.isWrite);
  const dcdRedeemTool = tools.find((t) => t.name === "dcd_redeem")!;

  it("throws ConfigError with 'simulated trading' message when demo=true (all write tools)", async () => {
    for (const tool of guardedTools) {
      const { client } = makeMockClient();
      const ctx: ToolContext = {
        ...makeContext(client),
        config: { ...makeContext(client).config, demo: true },
      };
      await assert.rejects(
        () => tool.handler({}, ctx),
        (err: unknown) => err instanceof ConfigError && /simulated trading/i.test((err as ConfigError).message),
        `${tool.name} should be blocked by demo guard`,
      );
    }
  });

  it("dcd_redeem preview mode (no quoteId) is allowed in demo mode", async () => {
    const { client } = makeMockClient();
    const ctx: ToolContext = {
      ...makeContext(client),
      config: { ...makeContext(client).config, demo: true },
    };
    // Must NOT throw ConfigError — preview is read-only
    let threw: unknown;
    try {
      await dcdRedeemTool.handler({ ordId: "ord-123" }, ctx);
    } catch (err) {
      threw = err;
    }
    assert.ok(
      !(threw instanceof ConfigError),
      "dcd_redeem preview should not throw ConfigError in demo mode",
    );
  });

  it("dcd_redeem execute mode (with quoteId) rejects in demo mode", async () => {
    const { client } = makeMockClient();
    const ctx: ToolContext = {
      ...makeContext(client),
      config: { ...makeContext(client).config, demo: true },
    };
    await assert.rejects(
      () => dcdRedeemTool.handler({ ordId: "ord-123", quoteId: "q-456" }, ctx),
      (err: unknown) => err instanceof ConfigError,
      "dcd_redeem execute mode should reject in demo",
    );
  });

  it("earn_fixed_purchase preview mode (confirm=false) is allowed in demo mode", async () => {
    const fixedPurchaseTool = tools.find((t) => t.name === "earn_fixed_purchase")!;
    const { client } = makeMockClient();
    const ctx: ToolContext = {
      ...makeContext(client),
      config: { ...makeContext(client).config, demo: true },
    };
    let threw: unknown;
    try {
      await fixedPurchaseTool.handler({ ccy: "USDT", amt: "100", term: "90D" }, ctx);
    } catch (err) {
      threw = err;
    }
    assert.ok(
      !(threw instanceof ConfigError),
      "earn_fixed_purchase preview should not throw ConfigError in demo mode",
    );
  });

  it("earn_fixed_purchase confirm mode rejects in demo mode", async () => {
    const fixedPurchaseTool = tools.find((t) => t.name === "earn_fixed_purchase")!;
    const { client } = makeMockClient();
    const ctx: ToolContext = {
      ...makeContext(client),
      config: { ...makeContext(client).config, demo: true },
    };
    await assert.rejects(
      () => fixedPurchaseTool.handler({ ccy: "USDT", amt: "100", term: "90D", confirm: true }, ctx),
      (err: unknown) => err instanceof ConfigError,
      "earn_fixed_purchase confirm mode should reject in demo",
    );
  });

  it("read-only tools (isWrite: false) are NOT blocked in demo mode", async () => {
    assert.ok(readOnlyTools.length > 0, "should have at least one read-only tool");
    for (const tool of readOnlyTools) {
      const { client } = makeMockClient();
      const ctx: ToolContext = {
        ...makeContext(client),
        config: { ...makeContext(client).config, demo: true },
      };
      // Should NOT throw ConfigError — read-only tools are allowed in demo
      try {
        await tool.handler({}, ctx);
      } catch (err) {
        assert.ok(
          !(err instanceof ConfigError && /simulated trading/i.test((err as ConfigError).message)),
          `${tool.name} (read-only) should not be blocked by demo guard`,
        );
      }
    }
  });

  it("does not throw demo guard when demo=false", async () => {
    const { client } = makeMockClient();
    const ctx: ToolContext = {
      ...makeContext(client),
      config: { ...makeContext(client).config, demo: false },
    };
    const tool = guardedTools[0]!;
    // handler may throw for other reasons (e.g. missing required params / API error),
    // but must NOT throw ConfigError due to the demo guard
    try {
      await tool.handler({}, ctx);
    } catch (err) {
      assert.ok(
        !(err instanceof ConfigError && /simulated trading/i.test((err as ConfigError).message)),
        "demo guard should not block when demo=false",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// option_place_algo_order — tgtCcy conversion via resolveQuoteCcySz
// ---------------------------------------------------------------------------

describe("option_place_algo_order — tgtCcy conversion", () => {
  const tools = registerOptionAlgoTools();
  const tool = tools.find((t) => t.name === "option_place_algo_order")!;

  it("calls resolveQuoteCcySz and sends converted sz to API", async () => {
    // Mock client: instruments returns ctVal=1, ticker returns lastPx=84000
    const calls: CapturedCall[] = [];
    const client = {
      publicGet: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push({ method: "GET", endpoint, params });
        if (endpoint.includes("/public/instruments")) {
          return { endpoint, requestTime: "", data: [{ ctVal: "1" }] };
        }
        if (endpoint.includes("/market/ticker")) {
          return { endpoint, requestTime: "", data: [{ last: "84000" }] };
        }
        return { endpoint, requestTime: "", data: [] };
      },
      privatePost: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push({ method: "POST", endpoint, params });
        return { endpoint, requestTime: "", data: [{ sCode: "0", ordId: "123" }] };
      },
    };

    // 200000 USDT / (1 * 84000) = 2.38 → floor = 2 contracts
    await tool.handler(
      {
        instId: "BTC-USD-260405-90000-C",
        tdMode: "cross",
        side: "buy",
        ordType: "conditional",
        sz: "200000",
        tgtCcy: "quote_ccy",
        tpTriggerPx: "95000",
        tpOrdPx: "-1",
      },
      makeContext(client),
    );

    // Should have called instruments + ticker (conversion) + privatePost (order)
    const postCall = calls.find((c) => c.method === "POST");
    assert.ok(postCall, "should make a POST call");
    assert.equal(postCall!.params.sz, "2", "sz should be converted to 2 contracts");
    assert.equal(postCall!.params.tgtCcy, undefined, "tgtCcy should be stripped after conversion");
  });

  it("passes sz unchanged when tgtCcy is not quote_ccy", async () => {
    const { client, getLastCall } = makeMockClient();

    await tool.handler(
      {
        instId: "BTC-USD-260405-90000-C",
        tdMode: "cross",
        side: "buy",
        ordType: "conditional",
        sz: "5",
        tpTriggerPx: "95000",
        tpOrdPx: "-1",
      },
      makeContext(client),
    );

    const call = getLastCall()!;
    assert.equal(call.params.sz, "5", "sz should pass through unchanged");
  });
});

// ---------------------------------------------------------------------------
// option_place_order — tgtCcy conversion via resolveQuoteCcySz
// ---------------------------------------------------------------------------

describe("option_place_order — tgtCcy conversion", () => {
  const tools = registerOptionTools();
  const tool = tools.find((t) => t.name === "option_place_order")!;

  it("converts tgtCcy=quote_ccy to contracts", async () => {
    const calls: CapturedCall[] = [];
    const client = {
      publicGet: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push({ method: "GET", endpoint, params });
        if (endpoint.includes("/public/instruments")) {
          return { endpoint, requestTime: "", data: [{ ctVal: "1" }] };
        }
        if (endpoint.includes("/market/ticker")) {
          return { endpoint, requestTime: "", data: [{ last: "84000" }] };
        }
        return { endpoint, requestTime: "", data: [] };
      },
      privatePost: async (endpoint: string, params: Record<string, unknown>) => {
        calls.push({ method: "POST", endpoint, params });
        return { endpoint, requestTime: "", data: [{ sCode: "0", ordId: "456" }] };
      },
    };

    // 200000 USDT / (1 * 84000) = 2.38 → floor = 2
    await tool.handler(
      {
        instId: "BTC-USD-260405-90000-C",
        tdMode: "cross",
        side: "buy",
        ordType: "market",
        sz: "200000",
        tgtCcy: "quote_ccy",
      },
      makeContext(client),
    );

    const postCall = calls.find((c) => c.method === "POST");
    assert.ok(postCall, "should POST");
    assert.equal(postCall!.params.sz, "2", "200k USDT → 2 contracts");
    assert.equal(postCall!.params.tgtCcy, undefined, "tgtCcy stripped");
  });

  it("passes sz unchanged without tgtCcy", async () => {
    const { client, getLastCall } = makeMockClient();

    await tool.handler(
      {
        instId: "BTC-USD-260405-90000-C",
        tdMode: "cross",
        side: "buy",
        ordType: "market",
        sz: "3",
      },
      makeContext(client),
    );

    const call = getLastCall()!;
    assert.equal(call.params.sz, "3");
    assert.equal(call.params.tgtCcy, undefined, "tgtCcy should not be passed when not specified");
  });
});
