/**
 * Unit tests for event contract tools.
 * Tests tool registration, isWrite classification, schema validation,
 * outcome mapping, demo mode support, speedBump injection,
 * and API parameter construction.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolContext } from "../src/tools/types.js";
import { registerEventContractTools } from "../src/tools/event-trade.js";
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
  const calls: CapturedCall[] = [];

  const fakeResponse = (endpoint: string) => ({
    endpoint,
    requestTime: "2024-01-01T00:00:00.000Z",
    data: [],
  });

  const client = {
    publicGet: async (endpoint: string, params: Record<string, unknown>) => {
      calls.push({ method: "GET", endpoint, params });
      return fakeResponse(endpoint);
    },
    privateGet: async (endpoint: string, params: Record<string, unknown>) => {
      calls.push({ method: "GET", endpoint, params });
      return fakeResponse(endpoint);
    },
    privatePost: async (endpoint: string, params: Record<string, unknown>) => {
      calls.push({ method: "POST", endpoint, params });
      return fakeResponse(endpoint);
    },
  };

  return {
    client,
    getLastCall: () => calls[calls.length - 1] ?? null,
    getCall: (endpoint: string) => calls.findLast((c) => c.endpoint === endpoint) ?? null,
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
      "event_browse",
      "event_get_series",
      "event_get_events",
      "event_get_markets",
      "event_get_orders",
      "event_get_fills",
      "event_place_order",
      "event_amend_order",
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
    const writeTools = new Set(["event_place_order", "event_amend_order", "event_cancel_order"]);
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

  // resolveOutcome sends "yes"/"no" to the OKX API (not "1"/"2")
  it("UP maps to outcome='yes' in place_order", async () => {
    const { client, getCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "UP", sz: "10" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["outcome"], "yes");
  });

  it("YES maps to outcome='yes' in place_order", async () => {
    const { client, getCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "YES", sz: "10" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["outcome"], "yes");
  });

  it("DOWN maps to outcome='no' in place_order", async () => {
    const { client, getCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "DOWN", sz: "5" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["outcome"], "no");
  });

  it("NO maps to outcome='no' in place_order", async () => {
    const { client, getCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "NO", sz: "5" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["outcome"], "no");
  });

  it("lowercase 'up' maps to outcome='yes'", async () => {
    const { client, getCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "up", sz: "10" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["outcome"], "yes");
  });

  it("lowercase 'down' maps to outcome='no'", async () => {
    const { client, getCall } = makeMockClient();
    await placeOrder.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "down", sz: "5" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["outcome"], "no");
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
// 测试组 4：event contracts support demo mode
// ---------------------------------------------------------------------------

describe("event contracts support demo mode", () => {
  const tools = registerEventContractTools();
  const placeOrder = tools.find((t) => t.name === "event_place_order")!;
  const amendOrder = tools.find((t) => t.name === "event_amend_order")!;
  const cancelOrder = tools.find((t) => t.name === "event_cancel_order")!;

  it("event_place_order does NOT throw in demo mode", async () => {
    const { client } = makeMockClient();
    await assert.doesNotReject(
      () => placeOrder.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "UP", sz: "10" },
        makeContext(client, true),
      ),
    );
  });

  it("event_amend_order does NOT throw in demo mode", async () => {
    const { client } = makeMockClient();
    await assert.doesNotReject(
      () => amendOrder.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000", ordId: "123456", newPx: "0.55" },
        makeContext(client, true),
      ),
    );
  });

  it("event_cancel_order does NOT throw in demo mode", async () => {
    const { client } = makeMockClient();
    await assert.doesNotReject(
      () => cancelOrder.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000", ordId: "123456" },
        makeContext(client, true),
      ),
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
    const { client, getCall } = makeMockClient();
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
    const call = getCall("/api/v5/trade/order")!;
    assert.equal(call.endpoint, "/api/v5/trade/order");
    assert.equal(call.method, "POST");
    assert.equal(call.params["instId"], "BTC-ABOVE-DAILY-260224-1600-120000");
    assert.equal(call.params["side"], "buy");
    assert.equal(call.params["outcome"], "yes");
    assert.equal(call.params["ordType"], "limit");
    assert.equal(call.params["sz"], "10");
    assert.equal(call.params["px"], "0.45");
    assert.equal(call.params["tdMode"], "isolated");
  });

  it("builds correct API body for market order with DOWN outcome", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      {
        instId: "BTC-ABOVE-DAILY-260224-1600-120000",
        side: "buy",
        outcome: "DOWN",
        ordType: "market",
        sz: "5",
      },
      makeContext(client),
    );
    const call = getCall("/api/v5/trade/order")!;
    assert.equal(call.params["outcome"], "no");
    assert.equal(call.params["ordType"], "market");
  });

  it("defaults ordType to market when omitted", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "NO", sz: "5" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["ordType"], "market");
  });

  it("always sets tdMode=isolated", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "sell", outcome: "UP", sz: "3" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["tdMode"], "isolated");
  });

  it("auto-sets speedBump=1 for market orders (required by exchange)", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "YES", sz: "5" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["speedBump"], "1");
  });

  it("auto-sets speedBump=1 for limit orders", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "YES", sz: "5", ordType: "limit", px: "0.45" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["speedBump"], "1");
  });

  it("does NOT set speedBump for post_only orders", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "YES", sz: "5", ordType: "post_only", px: "0.45" },
      makeContext(client),
    );
    assert.equal(getCall("/api/v5/trade/order")?.params["speedBump"], undefined);
  });
});

describe("event_get_markets passes filters to API", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_markets")!;

  it("passes seriesId and state", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { seriesId: "BTC-ABOVE-DAILY", state: "live" },
      makeContext(client),
    );
    const call = getCall("/api/v5/public/event-contract/markets")!;
    assert.equal(call.endpoint, "/api/v5/public/event-contract/markets");
    assert.equal(call.params["seriesId"], "BTC-ABOVE-DAILY");
    assert.equal(call.params["state"], "live");
  });

  it("passes before/after pagination cursors to API (limit is applied client-side)", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { seriesId: "BTC-ABOVE-DAILY", limit: 10, before: "ts-abc", after: "ts-xyz" },
      makeContext(client),
    );
    const call = getCall("/api/v5/public/event-contract/markets")!;
    assert.equal(call.params["before"], "ts-abc");
    assert.equal(call.params["after"], "ts-xyz");
    assert.equal(call.params["limit"], undefined);
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

// ---------------------------------------------------------------------------
// 测试组 6：event_get_markets outcome 翻译
// ---------------------------------------------------------------------------

describe("event_get_markets outcome translation", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_markets")!;

  function makeClientWithData(data: unknown[]) {
    const client = {
      publicGet: async (endpoint: string) => ({
        endpoint,
        requestTime: "2024-01-01T00:00:00.000Z",
        data,
      }),
      privateGet: async (endpoint: string) => ({
        endpoint,
        requestTime: "2024-01-01T00:00:00.000Z",
        data,
      }),
      privatePost: async (endpoint: string) => ({
        endpoint,
        requestTime: "2024-01-01T00:00:00.000Z",
        data,
      }),
    };
    return client;
  }

  it("translates outcome '0' to 'pending'", async () => {
    const client = makeClientWithData([{ instId: "X", outcome: "0" }]);
    const result = await tool.handler({ seriesId: "BTC-ABOVE-DAILY" }, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "pending");
  });

  it("translates outcome '1' to 'YES'", async () => {
    const client = makeClientWithData([{ instId: "X", outcome: "1" }]);
    const result = await tool.handler({ seriesId: "BTC-ABOVE-DAILY" }, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "YES");
  });

  it("translates outcome '2' to 'NO'", async () => {
    const client = makeClientWithData([{ instId: "X", outcome: "2" }]);
    const result = await tool.handler({ seriesId: "BTC-ABOVE-DAILY" }, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "NO");
  });
});

// ---------------------------------------------------------------------------
// 测试组 7：event_cancel_order normalizeWrite 错误抛出
// ---------------------------------------------------------------------------

describe("event_cancel_order normalizeWrite error handling", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_cancel_order")!;

  function makeClientWithCancelData(sCode: string, sMsg: string) {
    const client = {
      publicGet: async (endpoint: string) => ({
        endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [],
      }),
      privateGet: async (endpoint: string) => ({
        endpoint, requestTime: "2024-01-01T00:00:00.000Z", data: [],
      }),
      privatePost: async (endpoint: string) => ({
        endpoint,
        requestTime: "2024-01-01T00:00:00.000Z",
        data: [{ ordId: "EVT-001", sCode, sMsg }],
      }),
    };
    return client;
  }

  it("throws OkxApiError when sCode=51400 (order not found)", async () => {
    const client = makeClientWithCancelData("51400", "Order does not exist");
    await assert.rejects(
      () => tool.handler(
        { instId: "BTC-ABOVE-DAILY-260224-1600-120000", ordId: "EVT-001" },
        makeContext(client),
      ),
      /51400/,
    );
  });

  it("resolves successfully when sCode=0", async () => {
    const client = makeClientWithCancelData("0", "");
    const result = await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", ordId: "EVT-001" },
      makeContext(client),
    );
    assert.ok(result, "should return a result on success");
  });
});

// ---------------------------------------------------------------------------
// P2-1: event_get_orders translates outcome to uppercase
// ---------------------------------------------------------------------------

describe("P2-1: event_get_orders translates outcome to uppercase", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_orders")!;

  function makeClientWithOrderData(data: unknown[]) {
    return {
      publicGet: async (endpoint: string) => ({ endpoint, requestTime: "2024-01-01T00:00:00.000Z", data }),
      privateGet: async (endpoint: string) => ({ endpoint, requestTime: "2024-01-01T00:00:00.000Z", data }),
      privatePost: async (endpoint: string) => ({ endpoint, requestTime: "2024-01-01T00:00:00.000Z", data }),
    };
  }

  it("translates outcome '1' to 'YES'", async () => {
    const client = makeClientWithOrderData([{ ordId: "001", outcome: "1" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "YES");
  });

  it("translates outcome '2' to 'NO'", async () => {
    const client = makeClientWithOrderData([{ ordId: "002", outcome: "2" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "NO");
  });

  it("translates outcome '0' to 'pending'", async () => {
    const client = makeClientWithOrderData([{ ordId: "003", outcome: "0" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "pending");
  });
});

// ---------------------------------------------------------------------------
// P2-3: event_get_fills subType 415 mapped to settlement with loss
// ---------------------------------------------------------------------------

describe("P2-3: event_get_fills subType 415 mapped to settlement with loss", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_fills")!;

  function makeClientWithFillData(data: unknown[]) {
    return {
      publicGet: async (endpoint: string) => ({ endpoint, requestTime: "2024-01-01T00:00:00.000Z", data }),
      privateGet: async (endpoint: string) => ({ endpoint, requestTime: "2024-01-01T00:00:00.000Z", data }),
      privatePost: async (endpoint: string) => ({ endpoint, requestTime: "2024-01-01T00:00:00.000Z", data }),
    };
  }

  it("subType=415 maps to type='settlement'", async () => {
    const client = makeClientWithFillData([{ fillId: "f1", subType: "415", fillPx: "0", fillPnl: "-10", outcome: "1" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["type"], "settlement");
  });

  it("subType=415 has settlementResult='loss'", async () => {
    const client = makeClientWithFillData([{ fillId: "f1", subType: "415", fillPx: "0", fillPnl: "-10", outcome: "1" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["settlementResult"], "loss");
  });

  it("subType=414 has settlementResult='win'", async () => {
    const client = makeClientWithFillData([{ fillId: "f2", subType: "414", fillPx: "1", fillPnl: "90", outcome: "1" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["settlementResult"], "win");
  });

  it("subType=410 maps to type='fill' with no settlementResult", async () => {
    const client = makeClientWithFillData([{ fillId: "f3", subType: "410", fillPx: "0.45", outcome: "1" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["type"], "fill");
    assert.equal(items[0]!["settlementResult"], undefined);
  });
});
