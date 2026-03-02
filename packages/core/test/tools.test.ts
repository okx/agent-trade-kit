/**
 * Unit tests for new/modified tool handlers.
 * Verifies endpoint selection, default parameter values, and routing logic.
 * Uses a mock client — no real API calls are made.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolContext } from "../src/tools/types.js";
import { registerMarketTools } from "../src/tools/market.js";
import { registerSpotTradeTools } from "../src/tools/spot-trade.js";
import { registerSwapTradeTools } from "../src/tools/swap-trade.js";
import { registerAccountTools } from "../src/tools/account.js";

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

  const fakeResponse = (endpoint: string) => ({
    endpoint,
    requestTime: "2024-01-01T00:00:00.000Z",
    data: [],
  });

  const client = {
    publicGet: async (endpoint: string, params: Record<string, unknown>) => {
      lastCall = { method: "GET", endpoint, params };
      return fakeResponse(endpoint);
    },
    privateGet: async (endpoint: string, params: Record<string, unknown>) => {
      lastCall = { method: "GET", endpoint, params };
      return fakeResponse(endpoint);
    },
    privatePost: async (endpoint: string, params: Record<string, unknown>) => {
      lastCall = { method: "POST", endpoint, params };
      return fakeResponse(endpoint);
    },
  };

  return {
    client,
    getLastCall: () => lastCall,
  };
}

function makeContext(client: unknown): ToolContext {
  return {
    client: client as ToolContext["client"],
    config: {} as ToolContext["config"],
  };
}

// ---------------------------------------------------------------------------
// Market tools
// ---------------------------------------------------------------------------

describe("market_get_candles", () => {
  const tools = registerMarketTools();
  const tool = tools.find((t) => t.name === "market_get_candles")!;

  it("calls /market/candles by default (history omitted)", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/candles");
  });

  it("calls /market/candles when history=false", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT", history: false }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/candles");
  });

  it("calls /market/history-candles when history=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT", history: true }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/market/history-candles");
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
    await tool.handler({ instId: "BTC-USDT-SWAP", history: true }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/public/funding-rate-history");
  });

  it("defaults limit to 20 for history query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP", history: true }, makeContext(client));
    assert.equal(getLastCall()?.params.limit, 20);
  });

  it("respects explicit limit for history query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP", history: true, limit: 50 }, makeContext(client));
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
    await tool.handler({ instId: "BTC-USDT", archive: false }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills");
  });

  it("calls /trade/fills-history when archive=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT", archive: true }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills-history");
  });

  it("defaults limit to 20 for archive query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT", archive: true }, makeContext(client));
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
    await tool.handler({ instId: "BTC-USDT", archive: true, limit: 50 }, makeContext(client));
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
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-history-archive");
  });
});

describe("spot_batch_orders", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_batch_orders")!;

  it("calls /trade/batch-orders for action=place via POST", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { action: "place", orders: [{ instId: "BTC-USDT", side: "buy", ordType: "market", sz: "10" }] },
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
      { action: "place", orders: [{ instId: "BTC-USDT", side: "buy", ordType: "market", sz: "10" }] },
      makeContext(client),
    );
    const body = getLastCall()?.params as unknown[];
    assert.equal((body[0] as Record<string, unknown>).tdMode, "cash");
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
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-history-archive");
  });
});

describe("spot_get_order", () => {
  const tools = registerSpotTradeTools();
  const tool = tools.find((t) => t.name === "spot_get_order")!;

  it("calls /trade/order", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT", ordId: "12345" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/order");
  });

  it("passes instId and ordId to the API", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT", ordId: "99999" }, makeContext(client));
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
    await tool.handler({ instId: "BTC-USDT-SWAP", archive: true }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/fills-history");
  });

  it("defaults limit to 20 for archive query", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP", archive: true }, makeContext(client));
    assert.equal(getLastCall()?.params.limit, 20);
  });
});

describe("swap_get_order", () => {
  const tools = registerSwapTradeTools();
  const tool = tools.find((t) => t.name === "swap_get_order")!;

  it("calls /trade/order", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP", ordId: "12345" }, makeContext(client));
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
    await tool.handler({ instId: "BTC-USDT-SWAP", tdMode: "cross" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/account/max-avail-size");
  });

  it("passes instId and tdMode", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP", tdMode: "isolated" }, makeContext(client));
    assert.equal(getLastCall()?.params.instId, "BTC-USDT-SWAP");
    assert.equal(getLastCall()?.params.tdMode, "isolated");
  });

  it("serializes reduceOnly=true as string 'true'", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP", tdMode: "cross", reduceOnly: true }, makeContext(client));
    assert.equal(getLastCall()?.params.reduceOnly, "true");
  });

  it("omits reduceOnly when not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instId: "BTC-USDT-SWAP", tdMode: "cross" }, makeContext(client));
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
