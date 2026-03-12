/**
 * Unit tests for copy-trade tool handlers.
 * Verifies endpoint selection, default parameter values, and required param forwarding.
 * Uses a mock client — no real API calls are made.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolContext } from "../src/tools/types.js";
import { registerCopyTradeTools } from "../src/tools/copy-trade.js";
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
    getCalls: () => calls,
    getLastCall: () => calls[calls.length - 1] ?? null,
  };
}

function makeContext(client: unknown): ToolContext {
  return {
    client: client as ToolContext["client"],
    config: { sourceTag: DEFAULT_SOURCE_TAG } as ToolContext["config"],
  };
}

// ---------------------------------------------------------------------------
// copytrading_public_lead_traders
// ---------------------------------------------------------------------------

describe("copytrading_public_lead_traders", () => {
  const tools = registerCopyTradeTools();
  const tool = tools.find((t) => t.name === "copytrading_public_lead_traders")!;

  it("calls /copytrading/public-lead-traders with publicGet", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/copytrading/public-lead-traders");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("defaults instType=SWAP and sortType=overview", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params["instType"], "SWAP");
    assert.equal(getLastCall()?.params["sortType"], "overview");
  });

  it("defaults limit to '10'", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params["limit"], "10");
  });

  it("forwards custom instType and sortType", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instType: "SPOT", sortType: "pnl" }, makeContext(client));
    assert.equal(getLastCall()?.params["instType"], "SPOT");
    assert.equal(getLastCall()?.params["sortType"], "pnl");
  });

  it("forwards pagination params when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ page: "2", dataVer: "20231010182400" }, makeContext(client));
    assert.equal(getLastCall()?.params["page"], "2");
    assert.equal(getLastCall()?.params["dataVer"], "20231010182400");
  });

  it("returns endpoint, requestTime, dataVer, totalPage, data fields", async () => {
    const { client } = makeMockClient();
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    assert.ok("endpoint" in result);
    assert.ok("requestTime" in result);
    assert.ok("dataVer" in result);
    assert.ok("totalPage" in result);
    assert.ok("data" in result);
    assert.ok(Array.isArray(result["data"]));
  });
});

// ---------------------------------------------------------------------------
// copytrading_public_trader_detail
// ---------------------------------------------------------------------------

describe("copytrading_public_trader_detail", () => {
  const tools = registerCopyTradeTools();
  const tool = tools.find((t) => t.name === "copytrading_public_trader_detail")!;

  it("calls 3 public endpoints in parallel for pnl, stats, preference", async () => {
    const { client, getCalls } = makeMockClient();
    await tool.handler({ uniqueCode: "ABCD1234EFGH5678" }, makeContext(client));
    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(endpoints.includes("/api/v5/copytrading/public-pnl"));
    assert.ok(endpoints.includes("/api/v5/copytrading/public-stats"));
    assert.ok(endpoints.includes("/api/v5/copytrading/public-preference-currency"));
    assert.equal(getCalls().length, 3);
  });

  it("defaults instType=SWAP and lastDays=2", async () => {
    const { client, getCalls } = makeMockClient();
    await tool.handler({ uniqueCode: "ABCD1234EFGH5678" }, makeContext(client));
    const pnlCall = getCalls().find((c) => c.endpoint.includes("public-pnl"));
    assert.equal(pnlCall?.params["instType"], "SWAP");
    assert.equal(pnlCall?.params["lastDays"], "2");
  });

  it("forwards uniqueCode to all sub-requests", async () => {
    const { client, getCalls } = makeMockClient();
    await tool.handler({ uniqueCode: "TESTCODE12345678" }, makeContext(client));
    for (const call of getCalls()) {
      assert.equal(call.params["uniqueCode"], "TESTCODE12345678");
    }
  });

  it("returns pnl, stats, preference fields", async () => {
    const { client } = makeMockClient();
    const result = await tool.handler({ uniqueCode: "ABCD1234EFGH5678" }, makeContext(client)) as Record<string, unknown>;
    assert.ok("pnl" in result);
    assert.ok("stats" in result);
    assert.ok("preference" in result);
  });

  it("preference call omits lastDays param", async () => {
    const { client, getCalls } = makeMockClient();
    await tool.handler({ uniqueCode: "ABCD1234EFGH5678", lastDays: "1" }, makeContext(client));
    const prefCall = getCalls().find((c) => c.endpoint.includes("preference-currency"));
    assert.ok(!("lastDays" in (prefCall?.params ?? {})), "preference should not include lastDays");
  });
});

// ---------------------------------------------------------------------------
// copytrading_my_status
// ---------------------------------------------------------------------------

describe("copytrading_my_status", () => {
  const tools = registerCopyTradeTools();
  const tool = tools.find((t) => t.name === "copytrading_my_status")!;

  it("calls /copytrading/current-lead-traders with privateGet", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/copytrading/current-lead-traders");
    assert.equal(getLastCall()?.method, "GET");
  });

  it("defaults instType=SWAP", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    assert.equal(getLastCall()?.params["instType"], "SWAP");
  });

  it("forwards custom instType=SPOT", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ instType: "SPOT" }, makeContext(client));
    assert.equal(getLastCall()?.params["instType"], "SPOT");
  });

  it("returns endpoint, requestTime, data fields", async () => {
    const { client } = makeMockClient();
    const result = await tool.handler({}, makeContext(client)) as Record<string, unknown>;
    assert.ok("endpoint" in result);
    assert.ok("requestTime" in result);
    assert.ok("data" in result);
  });
});

// ---------------------------------------------------------------------------
// copytrading_set_copy_trading
// ---------------------------------------------------------------------------

describe("copytrading_set_copy_trading", () => {
  const tools = registerCopyTradeTools();
  const tool = tools.find((t) => t.name === "copytrading_set_copy_trading")!;

  it("calls /copytrading/first-copy-settings with privatePost", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uniqueCode: "ABCD1234EFGH5678", copyTotalAmt: "1000" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/copytrading/first-copy-settings");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("defaults instType=SWAP, copyMgnMode=isolated, copyInstIdType=copy, copyMode=fixed_amount, subPosCloseType=copy_close", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uniqueCode: "ABCD1234EFGH5678", copyTotalAmt: "1000" }, makeContext(client));
    const p = getLastCall()?.params ?? {};
    assert.equal(p["instType"], "SWAP");
    assert.equal(p["copyMgnMode"], "isolated");
    assert.equal(p["copyInstIdType"], "copy");
    assert.equal(p["copyMode"], "fixed_amount");
    assert.equal(p["subPosCloseType"], "copy_close");
  });

  it("forwards uniqueCode and copyTotalAmt", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uniqueCode: "MYCODE12345ABCDE", copyTotalAmt: "500" }, makeContext(client));
    const p = getLastCall()?.params ?? {};
    assert.equal(p["uniqueCode"], "MYCODE12345ABCDE");
    assert.equal(p["copyTotalAmt"], "500");
  });

  it("forwards optional tpRatio, slRatio, slTotalAmt when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({
      uniqueCode: "ABCD1234EFGH5678",
      copyTotalAmt: "1000",
      tpRatio: "0.1",
      slRatio: "0.05",
      slTotalAmt: "200",
    }, makeContext(client));
    const p = getLastCall()?.params ?? {};
    assert.equal(p["tpRatio"], "0.1");
    assert.equal(p["slRatio"], "0.05");
    assert.equal(p["slTotalAmt"], "200");
  });

  it("attaches sourceTag from context config", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uniqueCode: "ABCD1234EFGH5678", copyTotalAmt: "1000" }, makeContext(client));
    const p = getLastCall()?.params ?? {};
    assert.equal(p["tag"], DEFAULT_SOURCE_TAG);
  });
});

// ---------------------------------------------------------------------------
// copytrading_stop_copy_trader
// ---------------------------------------------------------------------------

describe("copytrading_stop_copy_trader", () => {
  const tools = registerCopyTradeTools();
  const tool = tools.find((t) => t.name === "copytrading_stop_copy_trader")!;

  it("calls /copytrading/stop-copy-trading with privatePost", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uniqueCode: "ABCD1234EFGH5678" }, makeContext(client));
    assert.equal(getLastCall()?.endpoint, "/api/v5/copytrading/stop-copy-trading");
    assert.equal(getLastCall()?.method, "POST");
  });

  it("defaults instType=SWAP", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uniqueCode: "ABCD1234EFGH5678" }, makeContext(client));
    assert.equal(getLastCall()?.params["instType"], "SWAP");
  });

  it("forwards uniqueCode", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uniqueCode: "STOP1234CODE5678" }, makeContext(client));
    assert.equal(getLastCall()?.params["uniqueCode"], "STOP1234CODE5678");
  });

  it("forwards optional subPosCloseType when provided", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ uniqueCode: "ABCD1234EFGH5678", subPosCloseType: "market_close" }, makeContext(client));
    assert.equal(getLastCall()?.params["subPosCloseType"], "market_close");
  });

  it("returns endpoint, requestTime, data fields", async () => {
    const { client } = makeMockClient();
    const result = await tool.handler({ uniqueCode: "ABCD1234EFGH5678" }, makeContext(client)) as Record<string, unknown>;
    assert.ok("endpoint" in result);
    assert.ok("requestTime" in result);
    assert.ok("data" in result);
  });
});
