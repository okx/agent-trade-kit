/**
 * Tests for DCA extended CLI commands (bot-dca-ext.ts)
 * and DCA/Recurring CLI command passthrough (bot.ts).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner, OkxRestClient } from "@agent-tradekit/core";
import {
  cmdDcaMarginAdd,
  cmdDcaMarginReduce,
  cmdDcaSetTakeProfit,
  cmdDcaSetReinvestment,
  cmdDcaManualBuy,
} from "../src/commands/bot-dca-ext.js";
import {
  cmdDcaCreate,
  cmdDcaStop,
  cmdDcaOrders,
  cmdDcaDetails,
  cmdDcaSubOrders,
} from "../src/commands/bot.js";
import {
  cmdRecurringCreate,
  cmdRecurringAmend,
  cmdRecurringStop,
  cmdRecurringOrders,
  cmdRecurringDetails,
  cmdRecurringSubOrders,
} from "../src/commands/bot-recurring-ext.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  const restore = () => { process.stdout.write = orig; };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        () => { restore(); return chunks.join(""); },
        (e) => { restore(); throw e; },
      );
    }
  } catch (e) { restore(); throw e; }
  restore();
  return Promise.resolve(chunks.join(""));
}

interface MockCall {
  method: string;
  path: string;
  body?: unknown;
}

function makeMockClient(overrideData?: unknown) {
  let lastCall: MockCall | null = null;
  const defaultData = [{ algoId: "123", sCode: "0", sMsg: "" }];
  const data = overrideData ?? defaultData;

  const client = {
    privateGet: async (path: string, params: unknown, _rl?: unknown) => {
      lastCall = { method: "GET", path, body: params };
      return { data };
    },
    privatePost: async (path: string, body: unknown, _rl?: unknown) => {
      lastCall = { method: "POST", path, body };
      return { data };
    },
  } as unknown as OkxRestClient;

  return { client, getLastCall: () => lastCall };
}

interface RunnerCall {
  tool: string;
  params: Record<string, unknown>;
}

function makeMockRunner(overrideData?: unknown) {
  let lastCall: RunnerCall | null = null;
  const defaultData = [{ algoId: "123", sCode: "0", sMsg: "" }];
  const data = overrideData ?? defaultData;

  const runner: ToolRunner = async (tool, params) => {
    lastCall = { tool, params: params as Record<string, unknown> };
    return { data };
  };

  return { runner, getLastCall: () => lastCall };
}

// ---------------------------------------------------------------------------
// DCA ext commands — endpoint + params
// ---------------------------------------------------------------------------

describe("cmdDcaMarginAdd", () => {
  it("calls /dca/margin/add with algoId and amt", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdDcaMarginAdd(client, { algoId: "111", amt: "200", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/dca/margin/add");
    assert.equal(getLastCall()!.method, "POST");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "111");
    assert.equal(body.amt, "200");
  });

  it("--json outputs valid JSON", async () => {
    const { client } = makeMockClient();
    const out = await captureStdout(() =>
      cmdDcaMarginAdd(client, { algoId: "111", amt: "200", json: true }),
    );
    assert.doesNotThrow(() => JSON.parse(out));
  });
});

describe("cmdDcaMarginReduce", () => {
  it("calls /dca/margin/reduce with algoId and amt", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdDcaMarginReduce(client, { algoId: "222", amt: "100", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/dca/margin/reduce");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "222");
    assert.equal(body.amt, "100");
  });
});

describe("cmdDcaSetTakeProfit", () => {
  it("calls /dca/settings/take-profit with algoOrdType=contract_dca", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdDcaSetTakeProfit(client, { algoId: "333", tpPrice: "50000", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/dca/settings/take-profit");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "333");
    assert.equal(body.algoOrdType, "contract_dca");
    assert.equal(body.tpPrice, "50000");
  });
});

describe("cmdDcaSetReinvestment", () => {
  it("calls /dca/settings/reinvestment with allowReinvest", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdDcaSetReinvestment(client, { algoId: "444", allowReinvest: "false", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/dca/settings/reinvestment");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "444");
    assert.equal(body.allowReinvest, "false");
  });

  it("displays enabled when allowReinvest=true", async () => {
    const { client } = makeMockClient();
    const out = await captureStdout(() =>
      cmdDcaSetReinvestment(client, { algoId: "444", allowReinvest: "true", json: false }),
    );
    assert.ok(out.includes("enabled"));
  });

  it("displays disabled when allowReinvest=false", async () => {
    const { client } = makeMockClient();
    const out = await captureStdout(() =>
      cmdDcaSetReinvestment(client, { algoId: "444", allowReinvest: "false", json: false }),
    );
    assert.ok(out.includes("disabled"));
  });
});

describe("cmdDcaManualBuy", () => {
  it("calls /dca/orders/manual-buy with price field", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdDcaManualBuy(client, { algoId: "555", amt: "10", px: "42000", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/dca/orders/manual-buy");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "555");
    assert.equal(body.algoOrdType, "contract_dca");
    assert.equal(body.amt, "10");
    assert.equal(body.price, "42000");
  });
});

describe("DCA ext — error handling", () => {
  it("displays error when sCode is non-zero", async () => {
    const { client } = makeMockClient([{ algoId: "123", sCode: "51000", sMsg: "Parameter error" }]);
    const out = await captureStdout(() =>
      cmdDcaMarginAdd(client, { algoId: "123", amt: "200", json: false }),
    );
    assert.ok(out.includes("Error: [51000]"));
    assert.ok(out.includes("Parameter error"));
  });

  it("handles empty response data", async () => {
    const { client } = makeMockClient([]);
    const out = await captureStdout(() =>
      cmdDcaMarginAdd(client, { algoId: "123", amt: "200", json: false }),
    );
    assert.ok(out.includes("No response data"));
  });
});

// ---------------------------------------------------------------------------
// DCA CLI commands (bot.ts) — tool passthrough
// ---------------------------------------------------------------------------

describe("cmdDcaCreate — param passthrough", () => {
  it("passes RSI trigger params to dca_create_order tool", async () => {
    const { runner, getLastCall } = makeMockRunner();
    await captureStdout(() =>
      cmdDcaCreate(runner, {
        instId: "BTC-USDT-SWAP", lever: "3", direction: "long",
        initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.02",
        triggerStrategy: "rsi", triggerCond: "cross_down",
        thold: "30", timeframe: "15m", timePeriod: "14",
        json: true,
      }),
    );
    const p = getLastCall()!.params;
    assert.equal(getLastCall()!.tool, "dca_create_order");
    assert.equal(p.triggerStrategy, "rsi");
    assert.equal(p.triggerCond, "cross_down");
    assert.equal(p.thold, "30");
    assert.equal(p.timeframe, "15m");
    assert.equal(p.timePeriod, "14");
  });

  it("passes copy-trading params to dca_create_order tool", async () => {
    const { runner, getLastCall } = makeMockRunner();
    await captureStdout(() =>
      cmdDcaCreate(runner, {
        instId: "BTC-USDT-SWAP", lever: "3", direction: "long",
        initOrdAmt: "100", maxSafetyOrds: "0", tpPct: "0.02",
        trackingMode: "sync", profitSharingRatio: "0.1",
        json: true,
      }),
    );
    const p = getLastCall()!.params;
    assert.equal(p.trackingMode, "sync");
    assert.equal(p.profitSharingRatio, "0.1");
  });
});

describe("cmdDcaStop", () => {
  it("calls dca_stop_order with algoId", async () => {
    const { runner, getLastCall } = makeMockRunner();
    await captureStdout(() => cmdDcaStop(runner, { algoId: "999", json: true }));
    assert.equal(getLastCall()!.tool, "dca_stop_order");
    assert.equal(getLastCall()!.params.algoId, "999");
  });
});

describe("cmdDcaOrders", () => {
  it("calls dca_get_orders with status=active by default", async () => {
    const { runner, getLastCall } = makeMockRunner([]);
    await captureStdout(() => cmdDcaOrders(runner, { history: false, json: true }));
    assert.equal(getLastCall()!.tool, "dca_get_orders");
    assert.equal(getLastCall()!.params.status, "active");
  });

  it("calls dca_get_orders with status=history", async () => {
    const { runner, getLastCall } = makeMockRunner([]);
    await captureStdout(() => cmdDcaOrders(runner, { history: true, json: true }));
    assert.equal(getLastCall()!.params.status, "history");
  });
});

describe("cmdDcaDetails", () => {
  it("calls dca_get_order_details with algoId", async () => {
    const { runner, getLastCall } = makeMockRunner([{ algoId: "123", state: "running" }]);
    await captureStdout(() => cmdDcaDetails(runner, { algoId: "123", json: true }));
    assert.equal(getLastCall()!.tool, "dca_get_order_details");
    assert.equal(getLastCall()!.params.algoId, "123");
  });
});

describe("cmdDcaSubOrders", () => {
  it("calls dca_get_sub_orders with algoId", async () => {
    const { runner, getLastCall } = makeMockRunner([]);
    await captureStdout(() => cmdDcaSubOrders(runner, { algoId: "123", json: true }));
    assert.equal(getLastCall()!.tool, "dca_get_sub_orders");
    assert.equal(getLastCall()!.params.algoId, "123");
  });
});

// ---------------------------------------------------------------------------
// Recurring CLI commands (bot.ts) — tool passthrough
// ---------------------------------------------------------------------------

describe("cmdRecurringCreate", () => {
  it("calls /recurring/order-algo with all params", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdRecurringCreate(client, {
        stgyName: "My DCA", recurringList: '[{"ccy":"BTC","ratio":"1"}]',
        period: "daily", recurringDay: "1", recurringTime: "08:00",
        timeZone: "8", amt: "100", investmentCcy: "USDT", tdMode: "cross",
        json: true,
      }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/recurring/order-algo");
    assert.equal(getLastCall()!.method, "POST");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.stgyName, "My DCA");
    assert.equal(body.period, "daily");
    assert.equal(body.recurringDay, "1");
    assert.equal(body.amt, "100");
    assert.equal(body.tdMode, "cross");
  });

  it("passes optional algoClOrdId", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdRecurringCreate(client, {
        stgyName: "My DCA", recurringList: '[{"ccy":"BTC","ratio":"1"}]',
        period: "daily", recurringDay: "1", recurringTime: "08:00",
        timeZone: "8", amt: "100", investmentCcy: "USDT", tdMode: "cross",
        algoClOrdId: "custom-id",
        json: true,
      }),
    );
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoClOrdId, "custom-id");
  });

  it("passes tradeQuoteCcy", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdRecurringCreate(client, {
        stgyName: "My DCA", recurringList: '[{"ccy":"BTC","ratio":"1"}]',
        period: "daily", recurringTime: "9",
        timeZone: "8", amt: "100", investmentCcy: "USDT", tdMode: "cash",
        tradeQuoteCcy: "USDT",
        json: true,
      }),
    );
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.tradeQuoteCcy, "USDT");
  });

  it("throws on invalid recurringList JSON", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => cmdRecurringCreate(client, {
        stgyName: "X", recurringList: "not-json",
        period: "daily", recurringTime: "9",
        timeZone: "8", amt: "100", investmentCcy: "USDT", tdMode: "cash",
        json: true,
      }),
      /valid JSON array/,
    );
  });

  it("throws when period=hourly without recurringHour", async () => {
    const { client } = makeMockClient();
    await assert.rejects(
      () => cmdRecurringCreate(client, {
        stgyName: "X", recurringList: '[{"ccy":"BTC","ratio":"1"}]',
        period: "hourly", recurringTime: "9",
        timeZone: "8", amt: "100", investmentCcy: "USDT", tdMode: "cash",
        json: true,
      }),
      /recurringHour is required/,
    );
  });
});

describe("cmdRecurringAmend", () => {
  it("calls /recurring/amend-order-algo with algoId and stgyName", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdRecurringAmend(client, { algoId: "456", stgyName: "New Name", json: true }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/recurring/amend-order-algo");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "456");
    assert.equal(body.stgyName, "New Name");
  });
});

describe("cmdRecurringStop", () => {
  it("calls /recurring/stop-order-algo with algoId array", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() => cmdRecurringStop(client, { algoId: "789", json: true }));
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/recurring/stop-order-algo");
    assert.equal(getLastCall()!.method, "POST");
    const body = getLastCall()!.body as Record<string, unknown>[];
    assert.ok(Array.isArray(body));
    assert.equal((body[0] as Record<string, unknown>).algoId, "789");
  });
});

describe("cmdRecurringOrders", () => {
  it("calls /recurring/orders-algo-pending by default", async () => {
    const { client, getLastCall } = makeMockClient([]);
    await captureStdout(() => cmdRecurringOrders(client, { history: false, json: true }));
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/recurring/orders-algo-pending");
  });

  it("calls /recurring/orders-algo-history when history=true", async () => {
    const { client, getLastCall } = makeMockClient([]);
    await captureStdout(() => cmdRecurringOrders(client, { history: true, json: true }));
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/recurring/orders-algo-history");
  });
});

describe("cmdRecurringDetails", () => {
  it("calls /recurring/orders-algo-details with algoId", async () => {
    const { client, getLastCall } = makeMockClient([{ algoId: "123", state: "running", cTime: "1700000000000" }]);
    await captureStdout(() => cmdRecurringDetails(client, { algoId: "123", json: true }));
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/recurring/orders-algo-details");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "123");
  });

  it("displays 'not found' when no data", async () => {
    const { client } = makeMockClient([]);
    const out = await captureStdout(() => cmdRecurringDetails(client, { algoId: "999", json: false }));
    assert.ok(out.includes("not found"));
  });
});

describe("cmdRecurringSubOrders", () => {
  it("calls /recurring/sub-orders with algoId", async () => {
    const { client, getLastCall } = makeMockClient([]);
    await captureStdout(() => cmdRecurringSubOrders(client, { algoId: "123", json: true }));
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/recurring/sub-orders");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "123");
  });

  it("displays 'No sub-orders' when empty", async () => {
    const { client } = makeMockClient([]);
    const out = await captureStdout(() => cmdRecurringSubOrders(client, { algoId: "123", json: false }));
    assert.ok(out.includes("No sub-orders"));
  });
});
