import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolContext } from "../src/tools/types.js";
import { registerAccountTools } from "../src/tools/account.js";
import { AuthenticationError, OkxApiError } from "../src/utils/errors.js";

interface CapturedCall {
  method: "GET" | "POST";
  endpoint: string;
  params: Record<string, unknown>;
}

function makeMockClient(
  dataByEndpoint: Record<string, unknown[]> = {},
  errorByEndpoint: Record<string, Error> = {},
) {
  const calls: CapturedCall[] = [];

  const fakeResponse = (endpoint: string) => ({
    endpoint,
    requestTime: "2024-01-01T00:00:00.000Z",
    data: dataByEndpoint[endpoint] ?? [],
  });

  const record = (call: CapturedCall) => { calls.push(call); };

  const client = {
    publicGet: async (endpoint: string, params: Record<string, unknown>) => {
      record({ method: "GET", endpoint, params });
      if (errorByEndpoint[endpoint]) throw errorByEndpoint[endpoint];
      return fakeResponse(endpoint);
    },
    privateGet: async (endpoint: string, params: Record<string, unknown>) => {
      record({ method: "GET", endpoint, params });
      if (errorByEndpoint[endpoint]) throw errorByEndpoint[endpoint];
      return fakeResponse(endpoint);
    },
    privatePost: async (endpoint: string, params: Record<string, unknown>) => {
      record({ method: "POST", endpoint, params });
      if (errorByEndpoint[endpoint]) throw errorByEndpoint[endpoint];
      return fakeResponse(endpoint);
    },
  };

  return { client, getCalls: () => calls };
}

function getBalanceAllTool() {
  const tools = registerAccountTools();
  const tool = tools.find((t) => t.name === "account_get_balance_all");
  assert.ok(tool, "account_get_balance_all tool must exist");
  return tool;
}

function makeContext(
  dataByEndpoint: Record<string, unknown[]> = {},
  errorByEndpoint: Record<string, Error> = {},
) {
  const { client, getCalls } = makeMockClient(dataByEndpoint, errorByEndpoint);
  const context = { client, config: {} } as unknown as ToolContext;
  return { context, getCalls };
}

describe("account_get_balance_all", () => {
  it("exists in registered tools and has correct metadata", () => {
    const tool = getBalanceAllTool();
    assert.equal(tool.module, "account");
    assert.equal(tool.isWrite, false);
    assert.ok(tool.description.includes("One-shot snapshot"));
  });

  it("returns full success with trading + funding + valuation", async () => {
    const tool = getBalanceAllTool();
    const { context } = makeContext({
      "/api/v5/account/balance": [{ totalEq: "10000", adjEq: "9500", details: [{ ccy: "USDT", eq: "10000" }] }],
      "/api/v5/asset/balances": [{ ccy: "USDT", bal: "5000", availBal: "5000", frozenBal: "0" }],
      "/api/v5/asset/asset-valuation": [{ totalBal: "15000", details: { trading: "10000", funding: "5000" } }],
    });

    const result = (await tool.handler({}, context)) as Record<string, unknown>;

    const trading = result.trading as Record<string, unknown>;
    assert.equal(trading.available, true);
    assert.equal(trading.totalEq, "10000");

    const funding = result.funding as Record<string, unknown>;
    assert.equal(funding.available, true);
    assert.ok(Array.isArray(funding.details));

    const valuation = result.valuation as Record<string, unknown>;
    assert.equal(valuation.available, true);
    assert.equal(valuation.totalBal, "15000");
    assert.equal(valuation.valuationCcy, "USDT");

    const meta = result.meta as Record<string, unknown>;
    assert.equal(meta.partialFailure, false);
    assert.ok((meta.elapsedMs as number) >= 0);
    assert.ok(meta.requestedAt);
  });

  it("sets partialFailure=true when trading fails", async () => {
    const tool = getBalanceAllTool();
    const { context } = makeContext(
      {
        "/api/v5/asset/balances": [{ ccy: "BTC", bal: "1" }],
        "/api/v5/asset/asset-valuation": [{ totalBal: "50000" }],
      },
      {
        "/api/v5/account/balance": new OkxApiError("Rate limited", { code: "50011" }),
      },
    );

    const result = (await tool.handler({}, context)) as Record<string, unknown>;

    const trading = result.trading as Record<string, unknown>;
    assert.equal(trading.available, false);
    assert.ok(trading.error);

    const funding = result.funding as Record<string, unknown>;
    assert.equal(funding.available, true);

    const meta = result.meta as Record<string, unknown>;
    assert.equal(meta.partialFailure, true);
  });

  it("sets partialFailure=true when funding fails", async () => {
    const tool = getBalanceAllTool();
    const { context } = makeContext(
      {
        "/api/v5/account/balance": [{ totalEq: "10000" }],
        "/api/v5/asset/asset-valuation": [{ totalBal: "10000" }],
      },
      {
        "/api/v5/asset/balances": new OkxApiError("Service error", { code: "50000" }),
      },
    );

    const result = (await tool.handler({}, context)) as Record<string, unknown>;

    const funding = result.funding as Record<string, unknown>;
    assert.equal(funding.available, false);

    const meta = result.meta as Record<string, unknown>;
    assert.equal(meta.partialFailure, true);
  });

  it("valuation failure does NOT set partialFailure", async () => {
    const tool = getBalanceAllTool();
    const { context } = makeContext(
      {
        "/api/v5/account/balance": [{ totalEq: "10000" }],
        "/api/v5/asset/balances": [{ ccy: "USDT", bal: "5000" }],
      },
      {
        "/api/v5/asset/asset-valuation": new OkxApiError("Timeout", { code: "TIMEOUT" }),
      },
    );

    const result = (await tool.handler({}, context)) as Record<string, unknown>;

    const valuation = result.valuation as Record<string, unknown>;
    assert.equal(valuation.available, false);
    assert.ok(valuation.error);

    const meta = result.meta as Record<string, unknown>;
    assert.equal(meta.partialFailure, false);
  });

  it("throws OkxApiError when both trading and funding fail", async () => {
    const tool = getBalanceAllTool();
    const { context } = makeContext(
      {},
      {
        "/api/v5/account/balance": new OkxApiError("Error A", { code: "50001" }),
        "/api/v5/asset/balances": new OkxApiError("Error B", { code: "50002" }),
      },
    );

    await assert.rejects(
      () => tool.handler({}, context),
      (err: Error) => {
        assert.ok(err instanceof OkxApiError);
        assert.ok(err.message.includes("Both balance queries failed"));
        return true;
      },
    );
  });

  it("throws AuthenticationError immediately on auth failure", async () => {
    const tool = getBalanceAllTool();
    const { context } = makeContext(
      {},
      {
        "/api/v5/account/balance": new AuthenticationError("Not logged in"),
        "/api/v5/asset/balances": new OkxApiError("Also fails"),
      },
    );

    await assert.rejects(
      () => tool.handler({}, context),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        return true;
      },
    );
  });

  it("respects accounts param — only queries funding when accounts='funding'", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext({
      "/api/v5/asset/balances": [{ ccy: "USDT", bal: "1000" }],
      "/api/v5/asset/asset-valuation": [{ totalBal: "1000" }],
    });

    const result = (await tool.handler({ accounts: "funding" }, context)) as Record<string, unknown>;

    assert.equal(result.trading, undefined);
    assert.ok(result.funding);

    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(!endpoints.includes("/api/v5/account/balance"));
    assert.ok(endpoints.includes("/api/v5/asset/balances"));
  });

  it("respects showValuation=false — skips valuation query", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext({
      "/api/v5/account/balance": [{ totalEq: "10000" }],
      "/api/v5/asset/balances": [{ ccy: "USDT", bal: "5000" }],
    });

    const result = (await tool.handler({ showValuation: false }, context)) as Record<string, unknown>;

    assert.equal(result.valuation, undefined);

    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(!endpoints.includes("/api/v5/asset/asset-valuation"));
  });

  it("passes ccy filter to trading and funding queries", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext({
      "/api/v5/account/balance": [{ totalEq: "5000" }],
      "/api/v5/asset/balances": [{ ccy: "BTC", bal: "1" }],
      "/api/v5/asset/asset-valuation": [{ totalBal: "50000" }],
    });

    await tool.handler({ ccy: "BTC" }, context);

    const calls = getCalls();
    const tradingCall = calls.find((c) => c.endpoint === "/api/v5/account/balance");
    const fundingCall = calls.find((c) => c.endpoint === "/api/v5/asset/balances");
    const valuationCall = calls.find((c) => c.endpoint === "/api/v5/asset/asset-valuation");

    assert.equal(tradingCall?.params.ccy, "BTC");
    assert.equal(fundingCall?.params.ccy, "BTC");
    assert.equal(valuationCall?.params.ccy, "USDT");
  });

  it("uses custom valuationCcy when provided", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext({
      "/api/v5/account/balance": [{ totalEq: "1" }],
      "/api/v5/asset/balances": [{ ccy: "BTC", bal: "1" }],
      "/api/v5/asset/asset-valuation": [{ totalBal: "1" }],
    });

    const result = (await tool.handler({ valuationCcy: "BTC" }, context)) as Record<string, unknown>;

    const valuationCall = getCalls().find((c) => c.endpoint === "/api/v5/asset/asset-valuation");
    assert.equal(valuationCall?.params.ccy, "BTC");

    const valuation = result.valuation as Record<string, unknown>;
    assert.equal(valuation.valuationCcy, "BTC");
  });

  it("single requested section failure throws when it's the only one", async () => {
    const tool = getBalanceAllTool();
    const { context } = makeContext(
      {
        "/api/v5/asset/asset-valuation": [{ totalBal: "0" }],
      },
      {
        "/api/v5/account/balance": new OkxApiError("Error", { code: "50001" }),
      },
    );

    await assert.rejects(
      () => tool.handler({ accounts: "trading" }, context),
      (err: Error) => {
        assert.ok(err instanceof OkxApiError);
        assert.ok(err.message.includes("Both balance queries failed"));
        return true;
      },
    );
  });
});

const AGG_ENDPOINT = "/api/v5/aigc/forward/balance-aggregate";

function aggResponse(overrides: Record<string, unknown> = {}) {
  return {
    trading: {
      available: true,
      totalEq: "49000",
      adjEq: "",
      details: [{ ccy: "USDT", eq: "49000", availEq: "5433", frozenBal: "43566", upl: "0" }],
    },
    funding: {
      available: true,
      details: [{ ccy: "USDT", bal: "0.0000040825541056", availBal: "0.0000040825541056", frozenBal: "" }],
    },
    meta: { requestedAt: 1780567576321, elapsedMs: 178, partialFailure: false, site: "OKX_GLOBAL" },
    ...overrides,
  };
}

describe("account_get_balance_all (aggregate-first)", () => {
  it("uses the aggregate endpoint on success and stamps meta.source=aggregate", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext({ [AGG_ENDPOINT]: [aggResponse()] });

    const result = (await tool.handler({}, context)) as Record<string, unknown>;

    const meta = result.meta as Record<string, unknown>;
    assert.equal(meta.source, "aggregate");
    assert.equal(meta.site, "OKX_GLOBAL");
    assert.equal(typeof meta.requestedAt, "string");
    assert.equal(meta.requestedAt, new Date(1780567576321).toISOString());

    const trading = result.trading as Record<string, unknown>;
    assert.equal(trading.available, true);
    assert.equal(trading.totalEq, "49000");

    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(endpoints.includes(AGG_ENDPOINT));
    assert.ok(!endpoints.includes("/api/v5/account/balance"));
    assert.ok(!endpoints.includes("/api/v5/asset/balances"));
  });

  it("forwards ccy/accounts/showValuation/valuationCcy to the aggregate endpoint", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext({ [AGG_ENDPOINT]: [aggResponse()] });

    await tool.handler({ ccy: "BTC", accounts: "funding", valuationCcy: "EUR", showValuation: true }, context);

    const call = getCalls().find((c) => c.endpoint === AGG_ENDPOINT);
    assert.equal(call?.params.ccy, "BTC");
    assert.equal(call?.params.accounts, "funding");
    assert.equal(call?.params.valuationCcy, "EUR");
    assert.equal(call?.params.showValuation, true);
  });

  it("returns aggregate partialFailure as-is WITHOUT falling back", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext({
      [AGG_ENDPOINT]: [
        aggResponse({
          trading: { available: false, error: { code: -30002, msg: "upstream timeout" } },
          meta: { requestedAt: 1780567576321, elapsedMs: 178, partialFailure: true, site: "OKX_GLOBAL" },
        }),
      ],
    });

    const result = (await tool.handler({}, context)) as Record<string, unknown>;

    const meta = result.meta as Record<string, unknown>;
    assert.equal(meta.source, "aggregate");
    assert.equal(meta.partialFailure, true);

    const trading = result.trading as Record<string, unknown>;
    assert.equal(trading.available, false);
    const error = trading.error as Record<string, unknown>;
    assert.equal(error.code, "-30002"); // Integer code coerced to string

    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(!endpoints.includes("/api/v5/account/balance"));
    assert.ok(!endpoints.includes("/api/v5/asset/balances"));
  });

  it("falls back to parallel queries when the aggregate endpoint errors", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext(
      {
        "/api/v5/account/balance": [{ totalEq: "10000", details: [{ ccy: "USDT", eq: "10000" }] }],
        "/api/v5/asset/balances": [{ ccy: "USDT", bal: "5000" }],
        "/api/v5/asset/asset-valuation": [{ totalBal: "15000" }],
      },
      { [AGG_ENDPOINT]: new OkxApiError("service unavailable", { code: "-30005" }) },
    );

    const result = (await tool.handler({}, context)) as Record<string, unknown>;

    const meta = result.meta as Record<string, unknown>;
    assert.equal(meta.source, "fallback");

    const trading = result.trading as Record<string, unknown>;
    assert.equal(trading.available, true);
    assert.equal(trading.totalEq, "10000");

    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(endpoints.includes(AGG_ENDPOINT));
    assert.ok(endpoints.includes("/api/v5/account/balance"));
    assert.ok(endpoints.includes("/api/v5/asset/balances"));
  });

  it("does NOT fall back on AuthenticationError from the aggregate endpoint", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext(
      {
        "/api/v5/account/balance": [{ totalEq: "10000" }],
        "/api/v5/asset/balances": [{ ccy: "USDT", bal: "5000" }],
      },
      { [AGG_ENDPOINT]: new AuthenticationError("Not logged in") },
    );

    await assert.rejects(
      () => tool.handler({}, context),
      (err: Error) => {
        assert.ok(err instanceof AuthenticationError);
        return true;
      },
    );

    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(!endpoints.includes("/api/v5/account/balance"));
    assert.ok(!endpoints.includes("/api/v5/asset/balances"));
  });

  it("preferParallel=true skips the aggregate endpoint entirely", async () => {
    const tool = getBalanceAllTool();
    const { context, getCalls } = makeContext({
      "/api/v5/account/balance": [{ totalEq: "10000" }],
      "/api/v5/asset/balances": [{ ccy: "USDT", bal: "5000" }],
      "/api/v5/asset/asset-valuation": [{ totalBal: "15000" }],
      [AGG_ENDPOINT]: [aggResponse()],
    });

    const result = (await tool.handler({ preferParallel: true }, context)) as Record<string, unknown>;

    const meta = result.meta as Record<string, unknown>;
    assert.equal(meta.source, "fallback");

    const endpoints = getCalls().map((c) => c.endpoint);
    assert.ok(!endpoints.includes(AGG_ENDPOINT));
    assert.ok(endpoints.includes("/api/v5/account/balance"));
  });
});
