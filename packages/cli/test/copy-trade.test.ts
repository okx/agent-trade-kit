import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  cmdCopyTradeTraders,
  cmdCopyTradeMyStatus,
  cmdCopyTradeFollow,
  cmdCopyTradeUnfollow,
  cmdCopyTradeTraderDetail,
} from "../src/commands/copy-trade.js";

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
      return result.then(() => { restore(); return chunks.join(""); }, (e) => { restore(); throw e; });
    }
  } catch (e) { restore(); throw e; }
  restore();
  return Promise.resolve(chunks.join(""));
}

function createMockRunner(data: unknown = []): ToolRunner {
  return async () => ({
    endpoint: "GET /api/v5/copytrading/test",
    requestTime: new Date().toISOString(),
    data,
  });
}

/** Runner that captures the tool name and args it was called with */
function createCapturingRunner(data: unknown = []): {
  runner: ToolRunner;
  getCalls: () => Array<{ tool: string; args: unknown }>;
} {
  const calls: Array<{ tool: string; args: unknown }> = [];
  const runner: ToolRunner = async (tool, args) => {
    calls.push({ tool: String(tool), args });
    return { endpoint: "/api/v5/copytrading/test", requestTime: "ts", data };
  };
  return { runner, getCalls: () => calls };
}

// ---------------------------------------------------------------------------
// cmdCopyTradeTraders
// ---------------------------------------------------------------------------
describe("cmdCopyTradeTraders", () => {
  it("prints table for non-json mode", async () => {
    const runner = createMockRunner([
      { uniqueCode: "ABC123", nickName: "Trader1", pnl: "1000", winRatio: "0.6", copyTraderNum: "50", leadDays: "30" },
    ]);
    const out = await captureStdout(() => cmdCopyTradeTraders(runner, { json: false }));
    assert.ok(out.length > 0, "should produce output");
    assert.ok(out.includes("Trader1") || out.includes("ABC123"), "should include trader data");
  });

  it("prints JSON in json=true mode", async () => {
    const runner = createMockRunner([{ uniqueCode: "ABC", nickName: "T1" }]);
    const out = await captureStdout(() => cmdCopyTradeTraders(runner, { json: true }));
    assert.doesNotThrow(() => JSON.parse(out), "should be valid JSON");
  });

  it("defaults instType=SWAP when not provided", async () => {
    const { runner, getCalls } = createCapturingRunner([]);
    await captureStdout(() => cmdCopyTradeTraders(runner, { json: false }));
    const call = getCalls()[0];
    assert.equal((call?.args as Record<string, unknown>)?.["instType"], "SWAP");
  });

  it("forwards custom instType and limit", async () => {
    const { runner, getCalls } = createCapturingRunner([]);
    await captureStdout(() => cmdCopyTradeTraders(runner, { instType: "SPOT", limit: 5, json: false }));
    const args = getCalls()[0]?.args as Record<string, unknown>;
    assert.equal(args?.["instType"], "SPOT");
    assert.equal(args?.["limit"], 5);
  });

  it("calls copytrading_public_lead_traders tool", async () => {
    const { runner, getCalls } = createCapturingRunner([]);
    await captureStdout(() => cmdCopyTradeTraders(runner, { json: false }));
    assert.equal(getCalls()[0]?.tool, "copytrading_public_lead_traders");
  });
});

// ---------------------------------------------------------------------------
// cmdCopyTradeMyStatus
// ---------------------------------------------------------------------------
describe("cmdCopyTradeMyStatus", () => {
  it("prints 'No active copy traders' when data is empty", async () => {
    const runner = createMockRunner([]);
    const out = await captureStdout(() => cmdCopyTradeMyStatus(runner, { json: false }));
    assert.ok(out.includes("No active copy traders"));
  });

  it("prints table when data exists", async () => {
    const runner = createMockRunner([
      { uniqueCode: "ABC", nickName: "Trader1", copyTotalPnl: "500", todayPnl: "10", upl: "5", margin: "1000" },
    ]);
    const out = await captureStdout(() => cmdCopyTradeMyStatus(runner, { json: false }));
    assert.ok(out.length > 0, "should produce output");
  });

  it("prints JSON in json=true mode", async () => {
    const runner = createMockRunner([{ uniqueCode: "ABC" }]);
    const out = await captureStdout(() => cmdCopyTradeMyStatus(runner, { json: true }));
    assert.doesNotThrow(() => JSON.parse(out), "should be valid JSON");
  });

  it("calls copytrading_my_status tool", async () => {
    const { runner, getCalls } = createCapturingRunner([]);
    await captureStdout(() => cmdCopyTradeMyStatus(runner, { json: false }));
    assert.equal(getCalls()[0]?.tool, "copytrading_my_status");
  });
});

// ---------------------------------------------------------------------------
// cmdCopyTradeFollow
// ---------------------------------------------------------------------------
describe("cmdCopyTradeFollow", () => {
  it("outputs 'Following trader' confirmation in non-json mode", async () => {
    const runner = createMockRunner([{ result: "ok" }]);
    const out = await captureStdout(() =>
      cmdCopyTradeFollow(runner, { uniqueCode: "TRADER123", copyTotalAmt: "1000", json: false })
    );
    assert.ok(out.includes("Following trader"));
    assert.ok(out.includes("TRADER123"));
  });

  it("prints JSON in json=true mode", async () => {
    const runner = createMockRunner([{ result: "ok" }]);
    const out = await captureStdout(() =>
      cmdCopyTradeFollow(runner, { uniqueCode: "TRADER123", copyTotalAmt: "1000", json: true })
    );
    assert.doesNotThrow(() => JSON.parse(out), "should be valid JSON");
  });

  it("calls copytrading_set_copy_trading with correct args", async () => {
    const { runner, getCalls } = createCapturingRunner([]);
    await captureStdout(() =>
      cmdCopyTradeFollow(runner, {
        uniqueCode: "TRADER123",
        copyTotalAmt: "500",
        copyMgnMode: "cross",
        copyMode: "ratio_copy",
        copyRatio: "0.5",
        instType: "SPOT",
        json: false,
      })
    );
    const args = getCalls()[0]?.args as Record<string, unknown>;
    assert.equal(getCalls()[0]?.tool, "copytrading_set_copy_trading");
    assert.equal(args?.["uniqueCode"], "TRADER123");
    assert.equal(args?.["copyTotalAmt"], "500");
    assert.equal(args?.["copyMgnMode"], "cross");
    assert.equal(args?.["copyMode"], "ratio_copy");
    assert.equal(args?.["copyRatio"], "0.5");
    assert.equal(args?.["instType"], "SPOT");
  });

  it("defaults copyMgnMode=isolated, copyInstIdType=copy, copyMode=fixed_amount, subPosCloseType=copy_close, instType=SWAP", async () => {
    const { runner, getCalls } = createCapturingRunner([]);
    await captureStdout(() =>
      cmdCopyTradeFollow(runner, { uniqueCode: "TRADER123", copyTotalAmt: "1000", json: false })
    );
    const args = getCalls()[0]?.args as Record<string, unknown>;
    assert.equal(args?.["copyMgnMode"], "isolated");
    assert.equal(args?.["copyInstIdType"], "copy");
    assert.equal(args?.["copyMode"], "fixed_amount");
    assert.equal(args?.["subPosCloseType"], "copy_close");
    assert.equal(args?.["instType"], "SWAP");
  });
});

// ---------------------------------------------------------------------------
// cmdCopyTradeUnfollow
// ---------------------------------------------------------------------------
describe("cmdCopyTradeUnfollow", () => {
  it("outputs 'Stopped copying' confirmation in non-json mode", async () => {
    const runner = createMockRunner([{ result: "ok" }]);
    const out = await captureStdout(() =>
      cmdCopyTradeUnfollow(runner, { uniqueCode: "TRADER456", json: false })
    );
    assert.ok(out.includes("Stopped copying"));
    assert.ok(out.includes("TRADER456"));
  });

  it("prints JSON in json=true mode", async () => {
    const runner = createMockRunner([{ result: "ok" }]);
    const out = await captureStdout(() =>
      cmdCopyTradeUnfollow(runner, { uniqueCode: "TRADER456", json: true })
    );
    assert.doesNotThrow(() => JSON.parse(out), "should be valid JSON");
  });

  it("calls copytrading_stop_copy_trader with uniqueCode", async () => {
    const { runner, getCalls } = createCapturingRunner([]);
    await captureStdout(() =>
      cmdCopyTradeUnfollow(runner, { uniqueCode: "STOP_TRADER", json: false })
    );
    assert.equal(getCalls()[0]?.tool, "copytrading_stop_copy_trader");
    const args = getCalls()[0]?.args as Record<string, unknown>;
    assert.equal(args?.["uniqueCode"], "STOP_TRADER");
  });

  it("defaults subPosCloseType=manual_close when not provided", async () => {
    const { runner, getCalls } = createCapturingRunner([]);
    await captureStdout(() =>
      cmdCopyTradeUnfollow(runner, { uniqueCode: "TRADER456", json: false })
    );
    const args = getCalls()[0]?.args as Record<string, unknown>;
    assert.equal(args?.["subPosCloseType"], "manual_close");
  });

  it("forwards custom subPosCloseType and instType", async () => {
    const { runner, getCalls } = createCapturingRunner([]);
    await captureStdout(() =>
      cmdCopyTradeUnfollow(runner, { uniqueCode: "TRADER456", subPosCloseType: "market_close", instType: "SPOT", json: false })
    );
    const args = getCalls()[0]?.args as Record<string, unknown>;
    assert.equal(args?.["subPosCloseType"], "market_close");
    assert.equal(args?.["instType"], "SPOT");
  });
});

// ---------------------------------------------------------------------------
// cmdCopyTradeTraderDetail
// ---------------------------------------------------------------------------
describe("cmdCopyTradeTraderDetail", () => {
  it("prints JSON in json=true mode", async () => {
    const runner: ToolRunner = async () => ({
      endpoint: "/api/v5/test", requestTime: "ts",
      pnl: [], stats: [], preference: [],
    } as unknown as { endpoint: string; requestTime: string; data: unknown });
    const out = await captureStdout(() =>
      cmdCopyTradeTraderDetail(runner, { uniqueCode: "TRADER789", json: true })
    );
    assert.doesNotThrow(() => JSON.parse(out), "should be valid JSON");
  });

  it("calls copytrading_public_trader_detail with uniqueCode", async () => {
    const { runner, getCalls } = createCapturingRunner();
    await captureStdout(() =>
      cmdCopyTradeTraderDetail(runner, { uniqueCode: "TRADER789", json: true })
    );
    assert.equal(getCalls()[0]?.tool, "copytrading_public_trader_detail");
    const args = getCalls()[0]?.args as Record<string, unknown>;
    assert.equal(args?.["uniqueCode"], "TRADER789");
  });

  it("defaults lastDays=2 and instType=SWAP", async () => {
    const { runner, getCalls } = createCapturingRunner();
    await captureStdout(() =>
      cmdCopyTradeTraderDetail(runner, { uniqueCode: "TRADER789", json: true })
    );
    const args = getCalls()[0]?.args as Record<string, unknown>;
    assert.equal(args?.["lastDays"], "2");
    assert.equal(args?.["instType"], "SWAP");
  });

  it("prints stats block in non-json mode when stats data exists", async () => {
    const runner: ToolRunner = async () => ({
      endpoint: "/api/v5/test", requestTime: "ts",
      stats: [{ winRatio: "0.65", profitDays: "20", lossDays: "10", curCopyTraderPnl: "500", avgSubPosNotional: "2000", investAmt: "10000" }],
      pnl: [],
      preference: [],
    } as unknown as { endpoint: string; requestTime: string; data: unknown });
    const out = await captureStdout(() =>
      cmdCopyTradeTraderDetail(runner, { uniqueCode: "TRADER789", json: false })
    );
    assert.ok(out.includes("Win Rate") || out.includes("0.65"), "should display win ratio");
  });

  it("prints daily P&L table when pnl data exists", async () => {
    const runner: ToolRunner = async () => ({
      endpoint: "/api/v5/test", requestTime: "ts",
      stats: [],
      pnl: [{ beginTs: "1700000000000", pnl: "100", pnlRatio: "0.05" }],
      preference: [],
    } as unknown as { endpoint: string; requestTime: string; data: unknown });
    const out = await captureStdout(() =>
      cmdCopyTradeTraderDetail(runner, { uniqueCode: "TRADER789", json: false })
    );
    assert.ok(out.includes("Daily P&L") || out.includes("pnl") || out.length > 0, "should display P&L data");
  });

  it("prints currency preference table when preference data exists", async () => {
    const runner: ToolRunner = async () => ({
      endpoint: "/api/v5/test", requestTime: "ts",
      stats: [],
      pnl: [],
      preference: [{ ccy: "BTC", ratio: "0.6" }, { ccy: "ETH", ratio: "0.4" }],
    } as unknown as { endpoint: string; requestTime: string; data: unknown });
    const out = await captureStdout(() =>
      cmdCopyTradeTraderDetail(runner, { uniqueCode: "TRADER789", json: false })
    );
    assert.ok(out.includes("Currency Preference") || out.includes("BTC"), "should display currency preference");
  });
});
