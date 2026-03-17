/**
 * Tests for grid extended CLI commands (bot-grid-ext.ts)
 * and grid create new param passthrough (bot.ts).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner, OkxRestClient } from "@agent-tradekit/core";
import { cmdGridCreate } from "../src/commands/bot.js";
import {
  cmdGridAmendBasicParam,
  cmdGridAmendOrder,
  cmdGridClosePosition,
  cmdGridCancelCloseOrder,
  cmdGridInstantTrigger,
  cmdGridPositions,
  cmdGridWithdrawIncome,
  cmdGridComputeMarginBalance,
  cmdGridMarginBalance,
  cmdGridAdjustInvestment,
  cmdGridAiParam,
  cmdGridMinInvestment,
  cmdGridRsiBackTesting,
  cmdGridMaxQuantity,
} from "../src/commands/bot-grid-ext.js";

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
  const defaultData = [{ algoId: "123", sCode: "0", sMsg: "", profit: "10.5", ordId: "456" }];
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
    publicGet: async (path: string, params: unknown, _rl?: unknown) => {
      lastCall = { method: "GET", path, body: params };
      return { data: [{ maxGridQty: "100", triggerNum: "5", instId: "BTC-USDT", algoOrdType: "grid", gridNum: "10", maxPx: "100000", minPx: "80000", minInvestment: "50", ccy: "USDT", annualizedRate: "0.15", runType: "1", duration: "7D" }] };
    },
    publicPost: async (path: string, body: unknown, _rl?: unknown) => {
      lastCall = { method: "POST", path, body };
      return { data: [{ minInvestmentData: [{ amt: "10", ccy: "USDT" }], singleAmt: "1" }] };
    },
  } as unknown as OkxRestClient;

  return { client, getLastCall: () => lastCall };
}

// ---------------------------------------------------------------------------
// cmdGridCreate — new params passthrough
// ---------------------------------------------------------------------------

describe("cmdGridCreate — new params passthrough", () => {
  const baseOpts = {
    instId: "BTC-USDT-SWAP",
    algoOrdType: "contract_grid",
    maxPx: "100000",
    minPx: "80000",
    gridNum: "10",
    json: true,
  };

  async function runWith(extraOpts: Record<string, unknown>) {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_tool, params) => {
      captured = params as Record<string, unknown>;
      return { data: [{ algoId: "123", sCode: "0" }] };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await captureStdout(() => cmdGridCreate(runner, { ...baseOpts, ...extraOpts } as any));
    return captured;
  }

  it("passes tpTriggerPx", async () => {
    const p = await runWith({ tpTriggerPx: "80000" });
    assert.equal(p.tpTriggerPx, "80000");
  });

  it("passes slTriggerPx", async () => {
    const p = await runWith({ slTriggerPx: "60000" });
    assert.equal(p.slTriggerPx, "60000");
  });

  it("passes algoClOrdId", async () => {
    const p = await runWith({ algoClOrdId: "my-grid-001" });
    assert.equal(p.algoClOrdId, "my-grid-001");
  });

  it("passes tpRatio", async () => {
    const p = await runWith({ tpRatio: "0.1" });
    assert.equal(p.tpRatio, "0.1");
  });

  it("passes slRatio", async () => {
    const p = await runWith({ slRatio: "0.05" });
    assert.equal(p.slRatio, "0.05");
  });

  it("passes tradeQuoteCcy", async () => {
    const p = await runWith({ tradeQuoteCcy: "USDT" });
    assert.equal(p.tradeQuoteCcy, "USDT");
  });

  it("omitted new fields → undefined", async () => {
    const p = await runWith({});
    assert.equal(p.tpTriggerPx, undefined);
    assert.equal(p.slTriggerPx, undefined);
    assert.equal(p.algoClOrdId, undefined);
    assert.equal(p.tpRatio, undefined);
    assert.equal(p.slRatio, undefined);
    assert.equal(p.tradeQuoteCcy, undefined);
  });
});

// ---------------------------------------------------------------------------
// Grid extended commands — endpoint + params
// ---------------------------------------------------------------------------

describe("cmdGridAmendBasicParam", () => {
  it("calls correct endpoint with params", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridAmendBasicParam(client, {
        algoId: "123", minPx: "78000", maxPx: "105000", gridNum: "12", json: false,
      }),
    );
    const call = getLastCall()!;
    assert.equal(call.path, "/api/v5/tradingBot/grid/amend-algo-basic-param");
    assert.equal(call.method, "POST");
    const body = call.body as Record<string, unknown>;
    assert.equal(body.algoId, "123");
    assert.equal(body.minPx, "78000");
    assert.equal(body.maxPx, "105000");
    assert.equal(body.gridNum, "12");
  });

  it("--json outputs valid JSON", async () => {
    const { client } = makeMockClient();
    const out = await captureStdout(() =>
      cmdGridAmendBasicParam(client, {
        algoId: "123", minPx: "78000", maxPx: "105000", gridNum: "12", json: true,
      }),
    );
    assert.doesNotThrow(() => JSON.parse(out));
  });
});

describe("cmdGridAmendOrder", () => {
  it("calls correct endpoint with optional tpTriggerPx", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridAmendOrder(client, {
        algoId: "123", instId: "BTC-USDT", tpTriggerPx: "115000", json: false,
      }),
    );
    const call = getLastCall()!;
    assert.equal(call.path, "/api/v5/tradingBot/grid/amend-order-algo");
    const body = call.body as Record<string, unknown>;
    assert.equal(body.algoId, "123");
    assert.equal(body.instId, "BTC-USDT");
    assert.equal(body.tpTriggerPx, "115000");
  });
});

describe("cmdGridClosePosition", () => {
  it("market close sets mktClose=true", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridClosePosition(client, { algoId: "123", mktClose: true, json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/close-position");
    assert.equal((getLastCall()!.body as Record<string, unknown>).mktClose, true);
  });

  it("limit close passes sz and px", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridClosePosition(client, { algoId: "123", mktClose: false, sz: "1", px: "95000", json: false }),
    );
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.sz, "1");
    assert.equal(body.px, "95000");
  });
});

describe("cmdGridCancelCloseOrder", () => {
  it("calls correct endpoint", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridCancelCloseOrder(client, { algoId: "123", ordId: "456", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/cancel-close-order");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "123");
    assert.equal(body.ordId, "456");
  });
});

describe("cmdGridInstantTrigger", () => {
  it("calls correct endpoint", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridInstantTrigger(client, { algoId: "123", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/order-instant-trigger");
    assert.equal((getLastCall()!.body as Record<string, unknown>).algoId, "123");
  });
});

describe("cmdGridPositions", () => {
  it("calls correct endpoint with GET", async () => {
    const { client, getLastCall } = makeMockClient([{
      algoId: "123", instId: "BTC-USDT-SWAP", pos: "1", avgPx: "90000",
      liqPx: "80000", lever: "5", mgnMode: "cross", upl: "100", uplRatio: "0.01", markPx: "91000",
    }]);
    await captureStdout(() =>
      cmdGridPositions(client, { algoOrdType: "contract_grid", algoId: "123", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/positions");
    assert.equal(getLastCall()!.method, "GET");
  });
});

describe("cmdGridWithdrawIncome", () => {
  it("calls correct endpoint", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridWithdrawIncome(client, { algoId: "123", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/withdraw-income");
    assert.equal((getLastCall()!.body as Record<string, unknown>).algoId, "123");
  });
});

describe("cmdGridComputeMarginBalance", () => {
  it("calls correct endpoint", async () => {
    const { client, getLastCall } = makeMockClient([{ maxAmt: "1000", lever: "5" }]);
    await captureStdout(() =>
      cmdGridComputeMarginBalance(client, { algoId: "123", type: "add", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/compute-margin-balance");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "123");
    assert.equal(body.type, "add");
  });
});

describe("cmdGridMarginBalance", () => {
  it("calls correct endpoint with amt", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridMarginBalance(client, { algoId: "123", type: "add", amt: "50", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/margin-balance");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.amt, "50");
    assert.equal(body.type, "add");
  });
});

describe("cmdGridAdjustInvestment", () => {
  it("calls correct endpoint", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridAdjustInvestment(client, { algoId: "123", amt: "200", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/adjust-investment");
    const body = getLastCall()!.body as Record<string, unknown>;
    assert.equal(body.algoId, "123");
    assert.equal(body.amt, "200");
  });
});

// ---------------------------------------------------------------------------
// printWriteResult — sCode absent (response without sCode should be success)
// ---------------------------------------------------------------------------

describe("printWriteResult — response without sCode", () => {
  it("treats missing sCode as success for adjust-investment", async () => {
    const { client } = makeMockClient([{ algoId: "123" }]);
    const out = await captureStdout(() =>
      cmdGridAdjustInvestment(client, { algoId: "123", amt: "200", json: false }),
    );
    assert.ok(out.includes("Grid investment adjusted"), `expected success msg, got: ${out}`);
    assert.ok(!out.includes("Error"), `should not contain Error, got: ${out}`);
  });

  it("treats missing sCode as success for margin-balance", async () => {
    const { client } = makeMockClient([{ algoId: "123" }]);
    const out = await captureStdout(() =>
      cmdGridMarginBalance(client, { algoId: "123", type: "add", amt: "50", json: false }),
    );
    assert.ok(out.includes("Grid margin adjusted"), `expected success msg, got: ${out}`);
  });

  it("treats missing sCode as success for amend-basic", async () => {
    const { client } = makeMockClient([{ algoId: "123" }]);
    const out = await captureStdout(() =>
      cmdGridAmendBasicParam(client, { algoId: "123", minPx: "78000", maxPx: "105000", gridNum: "12", json: false }),
    );
    assert.ok(out.includes("Grid bot amended"), `expected success msg, got: ${out}`);
  });

  it("treats missing sCode as success for close-position", async () => {
    const { client } = makeMockClient([{ algoId: "123" }]);
    const out = await captureStdout(() =>
      cmdGridClosePosition(client, { algoId: "123", mktClose: true, json: false }),
    );
    assert.ok(out.includes("Grid position market closed"), `expected success msg, got: ${out}`);
  });

  it("reports error when sCode is present and non-zero", async () => {
    const { client } = makeMockClient([{ algoId: "123", sCode: "51000", sMsg: "Parameter error" }]);
    const out = await captureStdout(() =>
      cmdGridAdjustInvestment(client, { algoId: "123", amt: "200", json: false }),
    );
    assert.ok(out.includes("Error: [51000]"), `expected error msg, got: ${out}`);
    assert.ok(out.includes("Parameter error"), `expected error detail, got: ${out}`);
  });
});

describe("cmdGridAiParam", () => {
  it("calls public GET endpoint", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridAiParam(client, { algoOrdType: "grid", instId: "BTC-USDT", json: false }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/ai-param");
    assert.equal(getLastCall()!.method, "GET");
  });
});

describe("cmdGridMinInvestment", () => {
  it("calls public POST endpoint", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridMinInvestment(client, {
        instId: "BTC-USDT", algoOrdType: "grid", gridNum: "10",
        maxPx: "100000", minPx: "80000", runType: "1", json: false,
      }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/min-investment");
    assert.equal(getLastCall()!.method, "POST");
  });
});

describe("cmdGridRsiBackTesting", () => {
  it("calls public GET endpoint", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridRsiBackTesting(client, {
        instId: "BTC-USDT", timeframe: "15m", thold: "30", timePeriod: "14", json: false,
      }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/public/rsi-back-testing");
    assert.equal(getLastCall()!.method, "GET");
  });
});

describe("cmdGridMaxQuantity", () => {
  it("calls public GET endpoint", async () => {
    const { client, getLastCall } = makeMockClient();
    await captureStdout(() =>
      cmdGridMaxQuantity(client, {
        instId: "BTC-USDT", runType: "1", algoOrdType: "grid",
        maxPx: "100000", minPx: "80000", json: false,
      }),
    );
    assert.equal(getLastCall()!.path, "/api/v5/tradingBot/grid/grid-quantity");
    assert.equal(getLastCall()!.method, "GET");
  });
});
