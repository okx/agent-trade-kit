/**
 * Unit tests for event contract tools.
 * Tests tool registration, isWrite classification, schema validation,
 * outcome mapping, assertNotDemo protection, speedBump injection,
 * and API parameter construction.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolContext } from "../src/tools/types.js";
import { registerEventContractTools } from "../src/tools/event-contract.js";
import { allToolSpecs } from "../src/tools/index.js";
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

function makeContext(client: unknown, demo = false): ToolContext {
  return {
    client: client as ToolContext["client"],
    config: { sourceTag: DEFAULT_SOURCE_TAG, demo } as ToolContext["config"],
  };
}

// ---------------------------------------------------------------------------
// 测试组 1：工具注册
// ---------------------------------------------------------------------------

describe("event contract tool registration", () => {
  const tools = registerEventContractTools();

  it("registers exactly 9 tools", () => {
    assert.equal(tools.length, 9);
  });

  it("all tools have module='event'", () => {
    for (const tool of tools) {
      assert.equal(tool.module, "event", `${tool.name} has wrong module`);
    }
  });

  it("contains all expected tool names", () => {
    const names = new Set(tools.map((t) => t.name));
    const expected = [
      "event_get_series",
      "event_get_events",
      "event_get_markets",
      "event_get_max_size",
      "event_precheck_order",
      "event_get_orders",
      "event_get_fills",
      "event_place_order",
      "event_cancel_order",
    ];
    for (const name of expected) {
      assert.ok(names.has(name), `Missing tool: ${name}`);
    }
  });

  it("event_get_ended is NOT registered (endpoint does not exist in API)", () => {
    const names = new Set(tools.map((t) => t.name));
    assert.ok(!names.has("event_get_ended"), "event_get_ended should not be registered");
  });

  it("isWrite is correct for each tool", () => {
    const writeTools = new Set(["event_place_order", "event_cancel_order"]);
    for (const tool of tools) {
      if (writeTools.has(tool.name)) {
        assert.equal(tool.isWrite, true, `${tool.name} should be isWrite=true`);
      } else {
        assert.equal(tool.isWrite, false, `${tool.name} should be isWrite=false`);
      }
    }
  });

  it("event tools appear in allToolSpecs()", () => {
    const all = allToolSpecs();
    const eventTools = all.filter((t) => t.module === "event");
    assert.equal(eventTools.length, 9);
  });
});

// ---------------------------------------------------------------------------
// 测试组 2：outcome 语义映射
// ---------------------------------------------------------------------------

describe("outcome semantic mapping", () => {
  const tools = registerEventContractTools();
  const placeOrder = tools.find((t) => t.name === "event_place_order")!;
  const maxSize = tools.find((t) => t.name === "event_get_max_size")!;
  const precheck = tools.find((t) => t.name === "event_precheck_order")!;

  it("UP maps to outcome=1 in place_order", async () => {
    const { client, getLastCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "UP", sz: "10" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["outcome"], "1");
  });

  it("YES maps to outcome=1 in place_order", async () => {
    const { client, getLastCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "YES", sz: "10" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["outcome"], "1");
  });

  it("DOWN maps to outcome=2 in place_order", async () => {
    const { client, getLastCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "DOWN", sz: "5" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["outcome"], "2");
  });

  it("NO maps to outcome=2 in place_order", async () => {
    const { client, getLastCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "NO", sz: "5" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["outcome"], "2");
  });

  it("lowercase 'up' maps to outcome=1", async () => {
    const { client, getLastCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "up", sz: "10" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["outcome"], "1");
  });

  it("lowercase 'down' maps to outcome=2", async () => {
    const { client, getLastCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "down", sz: "5" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["outcome"], "2");
  });

  it("invalid outcome throws a clear error", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => placeOrder.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "MAYBE", sz: "5" },
        makeContext(client),
      ),
      /Invalid outcome/i,
    );
  });

  it("UP maps to outcome=1 in max_size", async () => {
    const { client, getLastCall } = makeMockClient();
    await maxSize.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", outcome: "UP" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["outcome"], "1");
  });

  it("NO maps to outcome=2 in precheck", async () => {
    const { client, getLastCall } = makeMockClient();
    await precheck.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "NO", sz: "3" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["outcome"], "2");
  });
});

// ---------------------------------------------------------------------------
// 测试组 3：Schema 校验（必填参数缺失时抛错）
// ---------------------------------------------------------------------------

describe("event contract schema validation", () => {
  const tools = registerEventContractTools();
  const getByName = (name: string) => tools.find((t) => t.name === name)!;

  it("event_place_order requires outcome", async () => {
    const tool = getByName("event_place_order");
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", sz: "10" },
        makeContext(client),
      ),
      /outcome/i,
    );
  });

  it("event_place_order requires instId", async () => {
    const tool = getByName("event_place_order");
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler(
        { side: "buy", outcome: "UP", sz: "10" },
        makeContext(client),
      ),
      /instId/i,
    );
  });

  it("event_place_order requires sz", async () => {
    const tool = getByName("event_place_order");
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "YES" },
        makeContext(client),
      ),
      /sz/i,
    );
  });

  it("event_get_max_size requires outcome", async () => {
    const tool = getByName("event_get_max_size");
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000" },
        makeContext(client),
      ),
      /outcome/i,
    );
  });

  it("event_get_events requires seriesId", async () => {
    const tool = getByName("event_get_events");
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({}, makeContext(client)),
      /seriesId/i,
    );
  });

  it("event_cancel_order requires instId and ordId", async () => {
    const tool = getByName("event_cancel_order");
    const { client } = makeMockClient();
    await assert.rejects(
      () => tool.handler({ instId: "BTC-ABOVE-DAILY-260224-1600-120000" }, makeContext(client)),
      /ordId/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 测试组 4：assertNotDemo 保护
// ---------------------------------------------------------------------------

describe("assertNotDemo protection", () => {
  const tools = registerEventContractTools();
  const placeOrder = tools.find((t) => t.name === "event_place_order")!;
  const cancelOrder = tools.find((t) => t.name === "event_cancel_order")!;

  it("event_place_order throws in demo mode", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => placeOrder.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "UP", sz: "10" },
        makeContext(client, true),
      ),
      /demo|simulated/i,
    );
  });

  it("event_cancel_order throws in demo mode", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => cancelOrder.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000", ordId: "123456" },
        makeContext(client, true),
      ),
      /demo|simulated/i,
    );
  });
});

// ---------------------------------------------------------------------------
// 测试组 5：参数构造（spy client）
// ---------------------------------------------------------------------------

describe("event_place_order parameter construction", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_place_order")!;

  it("builds correct API body for limit order with YES outcome", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-ABOVE-DAILY-260224-1600-120000",
        side: "buy",
        outcome: "YES",
        ordType: "limit",
        sz: "10",
        px: "0.45",
      },
      makeContext(client),
    );
    const call = getLastCall()!;
    assert.equal(call.endpoint, "/api/v5/trade/order");
    assert.equal(call.method, "POST");
    assert.equal(call.params["instId"], "BTC-ABOVE-DAILY-260224-1600-120000");
    assert.equal(call.params["side"], "buy");
    assert.equal(call.params["outcome"], "1");
    assert.equal(call.params["ordType"], "limit");
    assert.equal(call.params["sz"], "10");
    assert.equal(call.params["px"], "0.45");
    assert.equal(call.params["tdMode"], "cash");
  });

  it("builds correct API body for market order with DOWN outcome", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-ABOVE-DAILY-260224-1600-120000",
        side: "buy",
        outcome: "DOWN",
        ordType: "market",
        sz: "5",
        slippage: "0.03",
      },
      makeContext(client),
    );
    const call = getLastCall()!;
    assert.equal(call.params["outcome"], "2");
    assert.equal(call.params["ordType"], "market");
    assert.equal(call.params["slippage"], "0.03");
  });

  it("defaults ordType to market when omitted", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "NO", sz: "5" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["ordType"], "market");
  });

  it("always sets tdMode=cash", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "sell", outcome: "UP", sz: "3" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["tdMode"], "cash");
  });

  it("auto-sets speedBump=1 for market orders (required by exchange)", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "YES", sz: "5" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["speedBump"], "1");
  });

  it("auto-sets speedBump=1 for limit orders", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "YES", sz: "5", ordType: "limit", px: "0.45" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["speedBump"], "1");
  });

  it("does NOT set speedBump for post_only orders", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "YES", sz: "5", ordType: "post_only", px: "0.45" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["speedBump"], undefined);
  });
});

describe("event_get_markets passes filters to API", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_markets")!;

  it("passes seriesId and state", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { seriesId: "BTC-ABOVE-DAILY", state: "live" },
      makeContext(client),
    );
    const call = getLastCall()!;
    assert.equal(call.endpoint, "/api/v5/public/event-contract/markets");
    assert.equal(call.params["seriesId"], "BTC-ABOVE-DAILY");
    assert.equal(call.params["state"], "live");
  });

  it("passes pagination params limit/before/after", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { seriesId: "BTC-ABOVE-DAILY", limit: 10, before: "ts-abc", after: "ts-xyz" },
      makeContext(client),
    );
    const call = getLastCall()!;
    assert.equal(call.params["limit"], 10);
    assert.equal(call.params["before"], "ts-abc");
    assert.equal(call.params["after"], "ts-xyz");
  });
});

describe("event_get_events parameter construction", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_events")!;

  it("passes eventId filter when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { seriesId: "BTC-ABOVE-DAILY", eventId: "BTC-ABOVE-DAILY-260224-1600" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["eventId"], "BTC-ABOVE-DAILY-260224-1600");
  });

  it("passes settling state correctly", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { seriesId: "BTC-ABOVE-DAILY", state: "settling" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.params["state"], "settling");
  });
});

describe("event_get_orders routing", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_orders")!;

  it("routes to orders-pending when state=live", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", state: "live" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-pending");
  });

  it("routes to orders-history when state is omitted", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000" },
      makeContext(client),
    );
    assert.equal(getLastCall()?.endpoint, "/api/v5/trade/orders-history");
  });

  it("always passes instType=EVENTS", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params["instType"], "EVENTS");
  });
});

describe("event_get_fills passes instType=EVENTS", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_fills")!;

  it("sends instType=EVENTS to fills endpoint", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    const call = getLastCall()!;
    assert.equal(call.endpoint, "/api/v5/trade/fills");
    assert.equal(call.params["instType"], "EVENTS");
  });
});
