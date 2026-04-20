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

  it("translates outcome '1' to 'UP' for UPDOWN series", async () => {
    const instId = "BTC-UPDOWN-15MIN-260407-1600-1615";
    const client = makeClientWithData([{ instId, outcome: "1" }]);
    const result = await tool.handler({ seriesId: "BTC-UPDOWN-15MIN" }, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "UP");
  });

  it("translates outcome '2' to 'DOWN' for UPDOWN series", async () => {
    const instId = "BTC-UPDOWN-15MIN-260407-1600-1615";
    const client = makeClientWithData([{ instId, outcome: "2" }]);
    const result = await tool.handler({ seriesId: "BTC-UPDOWN-15MIN" }, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "DOWN");
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

  it("translates outcome '1' to 'UP' for UPDOWN series orders", async () => {
    const instId = "BTC-UPDOWN-15MIN-260407-1600-1615";
    const client = makeClientWithOrderData([{ ordId: "u01", instId, outcome: "1" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "UP");
  });

  it("translates outcome '2' to 'DOWN' for UPDOWN series orders", async () => {
    const instId = "BTC-UPDOWN-15MIN-260407-1600-1615";
    const client = makeClientWithOrderData([{ ordId: "u02", instId, outcome: "2" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "DOWN");
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

  it("translates outcome '1' to 'UP' for UPDOWN fill", async () => {
    const instId = "BTC-UPDOWN-15MIN-260407-1600-1615";
    const client = makeClientWithFillData([{ fillId: "u1", instId, subType: "414", fillPx: "1", fillPnl: "90", outcome: "1" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "UP");
  });

  it("translates outcome '2' to 'DOWN' for UPDOWN fill", async () => {
    const instId = "BTC-UPDOWN-15MIN-260407-1600-1615";
    const client = makeClientWithFillData([{ fillId: "u2", instId, subType: "415", fillPx: "0", fillPnl: "-10", outcome: "2" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["outcome"], "DOWN");
  });
});

// ---------------------------------------------------------------------------
// 测试组 8：convertTimestamps (via event_get_events)
// ---------------------------------------------------------------------------

describe("convertTimestamps via event_get_events", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_events")!;

  function makeClientWithEventsData(data: unknown[]) {
    return {
      publicGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data }),
      privateGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data }),
      privatePost: async (ep: string) => ({ endpoint: ep, requestTime: "t", data }),
    };
  }

  it("converts expTime ms to YYYY-MM-DD HH:mm UTC+8 format", async () => {
    // 1711929600000 = 2024-04-01 00:00:00 UTC = 2024-04-01 08:00 UTC+8
    const client = makeClientWithEventsData([
      { eventId: "E1", expTime: "1711929600000" },
    ]);
    const result = await tool.handler({ seriesId: "BTC-ABOVE-DAILY" }, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["expTime"], "2024-04-01 08:00 UTC+8");
  });

  it("removes expTime when value is zero", async () => {
    const client = makeClientWithEventsData([
      { eventId: "E2", expTime: "0" },
    ]);
    const result = await tool.handler({ seriesId: "BTC-ABOVE-DAILY" }, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["expTime"], undefined);
  });

  it("converts settleTime when present", async () => {
    // 1711972800000 = 2024-04-01 12:00:00 UTC = 2024-04-01 20:00 UTC+8
    const client = makeClientWithEventsData([
      { eventId: "E3", settleTime: "1711972800000" },
    ]);
    const result = await tool.handler({ seriesId: "BTC-ABOVE-DAILY" }, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["settleTime"], "2024-04-01 20:00 UTC+8");
  });

  it("removes settleTime when value is zero", async () => {
    const client = makeClientWithEventsData([
      { eventId: "E4", settleTime: "0", expTime: "1711929600000" },
    ]);
    const result = await tool.handler({ seriesId: "BTC-ABOVE-DAILY" }, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["settleTime"], undefined);
    // expTime should still be converted
    assert.equal(items[0]!["expTime"], "2024-04-01 08:00 UTC+8");
  });
});

// ---------------------------------------------------------------------------
// 测试组 9：event_browse handler
// ---------------------------------------------------------------------------

describe("event_browse handler", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_browse")!;

  it("returns only human-readable series with active contracts", async () => {
    const btcSeries = {
      seriesId: "BTC-ABOVE-DAILY",
      freq: "daily",
      settlement: { method: "price_above", underlying: "BTC-USDT" },
    };
    const testSeries = {
      seriesId: "TESTXYZ-ABOVE-DAILY",
      freq: "daily",
      settlement: { method: "price_above", underlying: "TESTXYZ-USDT" },
    };

    // Future expiry timestamp (well in the future)
    const futureExpTime = String(Date.now() + 86400000);

    const client = {
      publicGet: async (ep: string) => {
        if (ep.includes("/index-tickers")) {
          return { endpoint: ep, requestTime: "t", data: [] };
        }
        return { endpoint: ep, requestTime: "t", data: [] };
      },
      privateGet: async (ep: string, params?: Record<string, unknown>) => {
        if (ep.includes("/series")) {
          return { endpoint: ep, requestTime: "t", data: [btcSeries, testSeries] };
        }
        if (ep.includes("/markets")) {
          const sid = params?.["seriesId"];
          if (sid === "BTC-ABOVE-DAILY") {
            return {
              endpoint: ep, requestTime: "t",
              data: [{ instId: "BTC-ABOVE-DAILY-260401-1600-50000", floorStrike: "50000", expTime: futureExpTime, outcome: "0" }],
            };
          }
          return { endpoint: ep, requestTime: "t", data: [] };
        }
        if (ep.includes("/balance")) {
          return { endpoint: ep, requestTime: "t", data: [] };
        }
        return { endpoint: ep, requestTime: "t", data: [] };
      },
      privatePost: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
    };

    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const data = result["data"] as Array<Record<string, unknown>>;
    // BTC-ABOVE-DAILY is human-readable, TESTXYZ is not in the known prefixes
    assert.equal(data.length, 1);
    assert.equal(data[0]!["seriesId"], "BTC-ABOVE-DAILY");
    assert.ok((result["total"] as number) > 0);
  });
});

// ---------------------------------------------------------------------------
// 测试组 10：event_get_markets with limit (client-side slicing)
// ---------------------------------------------------------------------------

describe("event_get_markets with limit (client-side slicing)", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_markets")!;

  it("slices result to limit count", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      instId: `BTC-ABOVE-DAILY-260401-1600-${50000 + i * 1000}`,
      outcome: "0",
      expTime: String(1711929600000 + i * 60000),
    }));

    const client = {
      publicGet: async (ep: string) => {
        if (ep.includes("/index-tickers")) {
          return { endpoint: ep, requestTime: "t", data: [{ idxPx: "65000" }] };
        }
        return { endpoint: ep, requestTime: "t", data: [] };
      },
      privateGet: async (ep: string) => {
        if (ep.includes("/markets")) {
          return { endpoint: ep, requestTime: "t", data: items };
        }
        if (ep.includes("/balance")) {
          return { endpoint: ep, requestTime: "t", data: [{ details: [{ ccy: "USDT", availBal: "100" }] }] };
        }
        return { endpoint: ep, requestTime: "t", data: [] };
      },
      privatePost: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
    };

    const result = await tool.handler({ seriesId: "BTC-ABOVE-DAILY", limit: 2 }, makeContext(client)) as Record<string, unknown>;
    const data = result["data"] as Record<string, unknown>[];
    assert.equal(data.length, 2);
  });
});

// ---------------------------------------------------------------------------
// 测试组 11：event_get_markets with unknown underlying (series fallback)
// ---------------------------------------------------------------------------

describe("event_get_markets unknown underlying series fallback", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_markets")!;

  it("resolves underlying from series response for unknown series", async () => {
    const marketData = [
      { instId: "NEWCOIN-ABOVE-DAILY-260401-1600-100", outcome: "0", expTime: "1711929600000" },
    ];
    const seriesData = [
      { seriesId: "NEWCOIN-ABOVE-DAILY", settlement: { underlying: "NEWCOIN-USDT", method: "price_above" } },
    ];

    const client = {
      publicGet: async (ep: string) => {
        if (ep.includes("/index-tickers")) {
          return { endpoint: ep, requestTime: "t", data: [{ idxPx: "5.5" }] };
        }
        return { endpoint: ep, requestTime: "t", data: [] };
      },
      privateGet: async (ep: string) => {
        if (ep.includes("/markets")) {
          return { endpoint: ep, requestTime: "t", data: marketData };
        }
        if (ep.includes("/series")) {
          return { endpoint: ep, requestTime: "t", data: seriesData };
        }
        if (ep.includes("/balance")) {
          return { endpoint: ep, requestTime: "t", data: [] };
        }
        return { endpoint: ep, requestTime: "t", data: [] };
      },
      privatePost: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
    };

    const result = await tool.handler({ seriesId: "NEWCOIN-ABOVE-DAILY" }, makeContext(client)) as Record<string, unknown>;
    assert.equal(result["underlying"], "NEWCOIN-USDT");
    const data = result["data"] as Record<string, unknown>[];
    assert.equal(data.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 测试组 12：event_place_order market order — orderNote and availableBalance
// ---------------------------------------------------------------------------

describe("event_place_order market order — orderNote and availableBalance", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_place_order")!;

  it("returns orderNote for market orders and availableBalance from balance", async () => {
    const client = {
      publicGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
      privateGet: async (ep: string) => {
        if (ep.includes("/balance")) {
          return { endpoint: ep, requestTime: "t", data: [{ details: [{ ccy: "USDT", availBal: "500.5" }] }] };
        }
        return { endpoint: ep, requestTime: "t", data: [] };
      },
      privatePost: async (ep: string) => ({
        endpoint: ep, requestTime: "t",
        data: [{ ordId: "123", sCode: "0", sMsg: "", tag: "abc" }],
      }),
    };

    const result = await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "UP", sz: "10" },
      makeContext(client),
    ) as Record<string, unknown>;

    assert.equal(result["availableBalance"], "500.5");
    assert.equal(result["availableBalanceCcy"], "USDT");
    assert.ok(typeof result["orderNote"] === "string");
    assert.ok((result["orderNote"] as string).includes("Market order"));
  });

  it("strips tag from successful order response", async () => {
    const client = {
      publicGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
      privateGet: async (ep: string) => {
        if (ep.includes("/balance")) {
          return { endpoint: ep, requestTime: "t", data: [] };
        }
        return { endpoint: ep, requestTime: "t", data: [] };
      },
      privatePost: async (ep: string) => ({
        endpoint: ep, requestTime: "t",
        data: [{ ordId: "123", sCode: "0", sMsg: "", tag: "shouldBeRemoved" }],
      }),
    };

    const result = await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "UP", sz: "10" },
      makeContext(client),
    ) as Record<string, unknown>;

    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["tag"], undefined);
    assert.equal(items[0]!["ordId"], "123");
  });
});

// ---------------------------------------------------------------------------
// 测试组 13：event_cancel_order — 51001 error with expired contract
// ---------------------------------------------------------------------------

describe("event_cancel_order 51001 error with expired contract", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_cancel_order")!;

  it("mentions 'expired' for an instId with past expiry date", async () => {
    const client = {
      publicGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
      privateGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
      privatePost: async (ep: string) => ({
        endpoint: ep, requestTime: "t",
        data: [{ ordId: "X", sCode: "51001", sMsg: "Instrument ID does not exist" }],
      }),
    };

    // 240101-0800 = 2024-01-01 08:00 UTC+8 = 2024-01-01 00:00 UTC (well in the past)
    await assert.rejects(
      () => tool.handler(
        { instId: "BTC-ABOVE-DAILY-240101-0800-50000", ordId: "X" },
        makeContext(client),
      ),
      (err: Error) => {
        assert.ok(err.message.includes("expired"), `Expected 'expired' in message, got: ${err.message}`);
        return true;
      },
    );
  });

  it("mentions 'not found' for an instId with future expiry date", async () => {
    const client = {
      publicGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
      privateGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
      privatePost: async (ep: string) => ({
        endpoint: ep, requestTime: "t",
        data: [{ ordId: "X", sCode: "51001", sMsg: "Instrument ID does not exist" }],
      }),
    };

    // 391231-0800 = 2039-12-31 08:00 UTC+8 (well in the future)
    await assert.rejects(
      () => tool.handler(
        { instId: "BTC-ABOVE-DAILY-391231-0800-50000", ordId: "X" },
        makeContext(client),
      ),
      (err: Error) => {
        assert.ok(err.message.includes("not found") || err.message.includes("not exist"), `Expected 'not found' in message, got: ${err.message}`);
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// 测试组 14：event_amend_order parameter construction
// ---------------------------------------------------------------------------

describe("event_amend_order parameter construction", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_amend_order")!;

  it("always sends speedBump=1", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", ordId: "ORD123", newPx: "0.55" },
      makeContext(client),
    );
    const call = getCall("/api/v5/trade/amend-order")!;
    assert.equal(call.params["speedBump"], "1");
  });

  it("passes newPx and newSz through", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", ordId: "ORD123", newPx: "0.60", newSz: "20" },
      makeContext(client),
    );
    const call = getCall("/api/v5/trade/amend-order")!;
    assert.equal(call.params["newPx"], "0.60");
    assert.equal(call.params["newSz"], "20");
  });

  it("passes instId and ordId correctly", async () => {
    const { client, getCall } = makeMockClient();
    await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", ordId: "ORD456" },
      makeContext(client),
    );
    const call = getCall("/api/v5/trade/amend-order")!;
    assert.equal(call.params["instId"], "BTC-ABOVE-DAILY-260224-1600-120000");
    assert.equal(call.params["ordId"], "ORD456");
  });
});

// ---------------------------------------------------------------------------
// 测试组 15：event_get_fills settlement enrichment details
// ---------------------------------------------------------------------------

describe("event_get_fills settlement enrichment details", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_fills")!;

  function makeClientWithFillDataEx(data: unknown[]) {
    return {
      publicGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data }),
      privateGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data }),
      privatePost: async (ep: string) => ({ endpoint: ep, requestTime: "t", data }),
    };
  }

  it("settlement win (414) includes pnl field", async () => {
    const client = makeClientWithFillDataEx([
      { fillId: "f1", subType: "414", fillPx: "1", fillPnl: "85.5", outcome: "1" },
    ]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["settlementResult"], "win");
    assert.equal(items[0]!["pnl"], 85.5);
  });

  it("settlement loss (415) includes pnl field", async () => {
    const client = makeClientWithFillDataEx([
      { fillId: "f2", subType: "415", fillPx: "0", fillPnl: "-10.0", outcome: "2" },
    ]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["settlementResult"], "loss");
    assert.equal(items[0]!["pnl"], -10.0);
  });

  it("settlement with NaN pnl sets pnl to undefined", async () => {
    const client = makeClientWithFillDataEx([
      { fillId: "f3", subType: "414", fillPx: "1", fillPnl: "abc", outcome: "1" },
    ]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["pnl"], undefined);
  });
});

// ---------------------------------------------------------------------------
// Layer 1: formatDisplayTitle pure function tests
// ---------------------------------------------------------------------------

import { formatDisplayTitle } from "../src/utils/event-format.js";

describe("formatDisplayTitle", () => {
  it("formats ABOVE instId", () => {
    assert.equal(
      formatDisplayTitle("BTC-ABOVE-DAILY-260407-1600-70000"),
      "BTC above 70,000 · 4/7",
    );
  });

  it("formats UPDOWN instId with time range", () => {
    assert.equal(
      formatDisplayTitle("BTC-UPDOWN-15MIN-260407-1600-1615"),
      "BTC Up/Down · 4/7 16:00-16:15",
    );
  });

  it("formats TOUCH instId", () => {
    assert.equal(
      formatDisplayTitle("BTC-TOUCH-DAILY-260407-1600-70000"),
      "BTC touch 70,000 · 4/7",
    );
  });

  it("returns original instId for unknown format", () => {
    assert.equal(formatDisplayTitle("UNKNOWN-FORMAT"), "UNKNOWN-FORMAT");
  });

  it("formats instId with large strike number", () => {
    assert.equal(
      formatDisplayTitle("ETH-ABOVE-DAILY-260401-1600-120000"),
      "ETH above 120,000 · 4/1",
    );
  });
});

// ---------------------------------------------------------------------------
// Layer 2: handler displayTitle in response
// ---------------------------------------------------------------------------

describe("handler displayTitle", () => {
  const tools = registerEventContractTools();

  it("event_browse includes displayTitle in contracts", async () => {
    const browse = tools.find(t => t.name === "event_browse")!;
    const { client } = makeMockClient();
    (client as Record<string, unknown>)["privateGet"] = async (endpoint: string) => {
      if (endpoint.includes("series")) {
        return {
          endpoint,
          requestTime: "2024-01-01",
          data: [{
            seriesId: "BTC-ABOVE-DAILY",
            freq: "daily",
            settlement: { method: "price_above", underlying: "BTC-USD" },
          }],
        };
      }
      if (endpoint.includes("markets")) {
        return {
          endpoint,
          requestTime: "2024-01-01",
          data: [{
            instId: "BTC-ABOVE-DAILY-260407-1600-70000",
            floorStrike: "70000",
            px: "0.45",
            expTime: String(Date.now() + 86400000),
            outcome: "0",
          }],
        };
      }
      return { endpoint, requestTime: "2024-01-01", data: [] };
    };
    const result = await browse.handler({}, makeContext(client)) as Record<string, unknown>;
    const data = result["data"] as Array<{ contracts: Record<string, unknown>[] }>;
    assert.ok(data.length > 0, "should have at least one series result");
    const contracts = data[0]!.contracts;
    assert.ok(contracts.length > 0, "should have at least one contract");
    assert.equal(contracts[0]!["displayTitle"], "BTC above 70,000 · 4/7");
  });

  it("event_get_markets includes displayTitle in each record", async () => {
    const mkts = tools.find(t => t.name === "event_get_markets")!;
    const { client } = makeMockClient();
    (client as Record<string, unknown>)["privateGet"] = async (endpoint: string) => {
      if (endpoint.includes("markets")) {
        return {
          endpoint,
          requestTime: "2024-01-01",
          data: [{ instId: "BTC-ABOVE-DAILY-260407-1600-70000", expTime: "1712505600000", outcome: "0" }],
        };
      }
      if (endpoint.includes("series")) {
        return { endpoint, requestTime: "2024-01-01", data: [] };
      }
      if (endpoint.includes("index-tickers")) {
        return { endpoint, requestTime: "2024-01-01", data: [{ idxPx: "70000" }] };
      }
      return { endpoint, requestTime: "2024-01-01", data: [] };
    };
    const result = await mkts.handler({ seriesId: "BTC-ABOVE-DAILY" }, makeContext(client)) as Record<string, unknown>;
    const data = result["data"] as Record<string, unknown>[];
    assert.ok(data.length > 0);
    assert.equal(data[0]!["displayTitle"], "BTC above 70,000 · 4/7");
  });

  it("event_get_orders includes displayTitle", async () => {
    const orders = tools.find(t => t.name === "event_get_orders")!;
    const { client } = makeMockClient();
    (client as Record<string, unknown>)["privateGet"] = async (endpoint: string) => ({
      endpoint,
      requestTime: "2024-01-01",
      data: [{ instId: "BTC-UPDOWN-15MIN-260407-1600-1615", outcome: "1" }],
    });
    const result = await orders.handler({ state: "live" }, makeContext(client)) as Record<string, unknown>;
    const data = result["data"] as Record<string, unknown>[];
    assert.ok(data[0]!["displayTitle"]);
    assert.ok(String(data[0]!["displayTitle"]).includes("Up/Down"));
  });

  it("event_get_fills includes displayTitle via enrichFill", async () => {
    const fills = tools.find(t => t.name === "event_get_fills")!;
    const { client } = makeMockClient();
    (client as Record<string, unknown>)["privateGet"] = async (endpoint: string) => ({
      endpoint,
      requestTime: "2024-01-01",
      data: [{ instId: "BTC-TOUCH-DAILY-260407-1600-70000", fillId: "f1", subType: "410", outcome: "1" }],
    });
    const result = await fills.handler({}, makeContext(client)) as Record<string, unknown>;
    const data = result["data"] as Record<string, unknown>[];
    assert.equal(data[0]!["displayTitle"], "BTC touch 70,000 · 4/7");
  });
});

// ---------------------------------------------------------------------------
// fetchAvailableBalance returns null when USDT not found in details (via place_order)
// ---------------------------------------------------------------------------

describe("fetchAvailableBalance returns null when USDT not in details", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_place_order")!;

  it("omits availableBalance when balance details contain only non-USDT entries", async () => {
    const client = {
      publicGet: async (ep: string) => ({ endpoint: ep, requestTime: "t", data: [] }),
      privateGet: async (ep: string) => {
        if (ep.includes("/balance")) {
          return { endpoint: ep, requestTime: "t", data: [{ details: [{ ccy: "BTC", availBal: "1.5" }] }] };
        }
        return { endpoint: ep, requestTime: "t", data: [] };
      },
      privatePost: async (ep: string) => ({
        endpoint: ep, requestTime: "t",
        data: [{ ordId: "123", sCode: "0", sMsg: "", tag: "abc" }],
      }),
    };

    const result = await tool.handler(
      { instId: "BTC-ABOVE-DAILY-260224-1600-120000", side: "buy", outcome: "UP", sz: "10" },
      makeContext(client),
    ) as Record<string, unknown>;
    assert.equal(result["availableBalance"], undefined, "availableBalance should be absent when USDT is not in details");
  });
});

// ---------------------------------------------------------------------------
// ORDER_STATE_MAP: stateLabel in event_get_orders
// ---------------------------------------------------------------------------

describe("event_get_orders stateLabel mapping", () => {
  const tools = registerEventContractTools();
  const tool = tools.find((t) => t.name === "event_get_orders")!;

  function makeClientWithOrderData(data: unknown[]) {
    return {
      publicGet: async (endpoint: string) => ({ endpoint, requestTime: "t", data }),
      privateGet: async (endpoint: string) => ({ endpoint, requestTime: "t", data }),
      privatePost: async (endpoint: string) => ({ endpoint, requestTime: "t", data }),
    };
  }

  it("maps 'live' to 'Unfilled'", async () => {
    const client = makeClientWithOrderData([{ ordId: "001", state: "live", outcome: "1" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["stateLabel"], "Unfilled");
    assert.equal(items[0]!["state"], "live");
  });

  it("maps 'filled' to 'Filled'", async () => {
    const client = makeClientWithOrderData([{ ordId: "002", state: "filled", outcome: "1" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["stateLabel"], "Filled");
    assert.equal(items[0]!["state"], "filled");
  });

  it("maps 'partially_filled' to 'Partially filled'", async () => {
    const client = makeClientWithOrderData([{ ordId: "003", state: "partially_filled", outcome: "0" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["stateLabel"], "Partially filled");
  });

  it("maps 'canceled' to 'Canceled'", async () => {
    const client = makeClientWithOrderData([{ ordId: "004", state: "canceled", outcome: "0" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["stateLabel"], "Canceled");
  });

  it("maps 'mmp_canceled' to 'Canceled'", async () => {
    const client = makeClientWithOrderData([{ ordId: "005", state: "mmp_canceled", outcome: "0" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["stateLabel"], "Canceled");
  });

  it("falls back to raw state for unknown values", async () => {
    const client = makeClientWithOrderData([{ ordId: "006", state: "unknown_state", outcome: "0" }]);
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    const items = result["data"] as Record<string, unknown>[];
    assert.equal(items[0]!["stateLabel"], "unknown_state");
    assert.equal(items[0]!["state"], "unknown_state");
  });
});
