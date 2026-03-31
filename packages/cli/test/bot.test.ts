import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  cmdGridOrders,
  cmdGridDetails,
  cmdGridCreate,
  cmdGridStop,
  cmdDcaOrders,
  cmdDcaDetails,
  cmdDcaCreate,
  cmdDcaStop,
  cmdDcaSubOrders,
} from "../src/commands/bot.js";
import { setOutput, resetOutput } from "../src/formatter.js";

/** Find valid JSON in captured output (tolerates parallel test output mixing in Node 18). */
function findJson(output: string[]): string {
  const joined = output.join("");
  try { JSON.parse(joined); return joined; } catch {}
  for (const chunk of output) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try { JSON.parse(trimmed); return trimmed; } catch {}
    }
  }
  return joined;
}


let out: string[] = [];
let err: string[] = [];

beforeEach(() => {
  out = []; err = [];
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
});
afterEach(() => resetOutput());

function fakeResult(data: unknown) {
  return { endpoint: "POST /api/v5/tradingBot", requestTime: new Date().toISOString(), data };
}

// ---------------------------------------------------------------------------
// cmdGridOrders
// ---------------------------------------------------------------------------
describe("cmdGridOrders", () => {
  it("outputs 'No grid bots' to stdout when list is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdGridOrders(runner, { algoOrdType: "grid", status: "active", json: false });
    assert.ok(out.join("").includes("No grid bots"));
    assert.equal(err.join(""), "");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "1", instId: "BTC-USDT", algoOrdType: "grid", state: "running", pnlRatio: "0", gridNum: "10", maxPx: "50000", minPx: "40000", cTime: "0" }]);
    await cmdGridOrders(runner, { algoOrdType: "grid", status: "active", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });

  it("queries CoinM contract grid orders", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "2", instId: "BTC-USD-SWAP", algoOrdType: "contract_grid", state: "running", pnlRatio: "0.01", gridNum: "20", maxPx: "100000", minPx: "80000", cTime: "0" }]);
    await cmdGridOrders(runner, { algoOrdType: "contract_grid", status: "active", json: false });
    assert.ok(out.join("").includes("BTC-USD-SWAP"));
    assert.equal(err.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdGridDetails
// ---------------------------------------------------------------------------
describe("cmdGridDetails", () => {
  it("outputs 'Bot not found' to stdout when result is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdGridDetails(runner, { algoOrdType: "grid", algoId: "001", json: false });
    assert.ok(out.join("").includes("Bot not found"));
    assert.equal(err.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdGridCreate — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
describe("cmdGridCreate", () => {
  it("outputs success message to stdout when sCode='0'", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "GRID001", sCode: "0", sMsg: "" }]);
    await cmdGridCreate(runner, { instId: "BTC-USDT", algoOrdType: "grid", maxPx: "50000", minPx: "40000", gridNum: "10", json: false });
    assert.ok(out.join("").includes("Grid bot created"));
    assert.ok(out.join("").includes("GRID001"));
    assert.ok(out.join("").includes("OK"));
    assert.equal(err.join(""), "");
  });

  it("outputs error message to stderr when sCode is non-zero", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "", sCode: "51008", sMsg: "Insufficient balance" }]);
    await cmdGridCreate(runner, { instId: "BTC-USDT", algoOrdType: "grid", maxPx: "50000", minPx: "40000", gridNum: "10", json: false });
    assert.ok(err.join("").includes("Insufficient balance"));
    assert.ok(err.join("").includes("51008"));
    assert.equal(out.join(""), "");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "GRID001", sCode: "0" }]);
    await cmdGridCreate(runner, { instId: "BTC-USDT", algoOrdType: "grid", maxPx: "50000", minPx: "40000", gridNum: "10", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });

  it("passes tpTriggerPx, slTriggerPx, tpRatio, slRatio, algoClOrdId to runner", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const spy: ToolRunner = async (_name, args) => {
      capturedArgs = args as Record<string, unknown>;
      return fakeResult([{ algoId: "GRID_TP_SL", sCode: "0", sMsg: "" }]);
    };
    await cmdGridCreate(spy, {
      instId: "BTC-USDT-SWAP", algoOrdType: "contract_grid",
      maxPx: "120000", minPx: "80000", gridNum: "5",
      direction: "long", lever: "5", sz: "100",
      tpTriggerPx: "130000", slTriggerPx: "75000",
      tpRatio: "0.1", slRatio: "0.05",
      algoClOrdId: "myGrid001",
      json: false,
    });
    assert.equal(capturedArgs.tpTriggerPx, "130000");
    assert.equal(capturedArgs.slTriggerPx, "75000");
    assert.equal(capturedArgs.tpRatio, "0.1");
    assert.equal(capturedArgs.slRatio, "0.05");
    assert.equal(capturedArgs.algoClOrdId, "myGrid001");
    assert.ok(out.join("").includes("GRID_TP_SL"));
  });

  it("creates CoinM contract grid with BTC-USD-SWAP", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "GRID_COINM_001", sCode: "0", sMsg: "" }]);
    await cmdGridCreate(runner, {
      instId: "BTC-USD-SWAP", algoOrdType: "contract_grid",
      maxPx: "100000", minPx: "80000", gridNum: "20",
      direction: "long", lever: "5", sz: "0.1",
      json: false,
    });
    assert.ok(out.join("").includes("Grid bot created"));
    assert.ok(out.join("").includes("GRID_COINM_001"));
    assert.equal(err.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdGridStop — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
describe("cmdGridStop", () => {
  it("outputs success message to stdout when sCode='0'", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "GRID001", sCode: "0", sMsg: "" }]);
    await cmdGridStop(runner, { algoId: "GRID001", algoOrdType: "grid", instId: "BTC-USDT", json: false });
    assert.ok(out.join("").includes("Grid bot stopped"));
    assert.ok(out.join("").includes("GRID001"));
    assert.ok(out.join("").includes("OK"));
    assert.equal(err.join(""), "");
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "", sCode: "50013", sMsg: "Bot not running" }]);
    await cmdGridStop(runner, { algoId: "GRID001", algoOrdType: "grid", instId: "BTC-USDT", json: false });
    assert.ok(err.join("").includes("Bot not running"));
    assert.ok(err.join("").includes("50013"));
    assert.equal(out.join(""), "");
  });

  it("stops CoinM contract grid bot", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "GRID_COINM_001", sCode: "0", sMsg: "" }]);
    await cmdGridStop(runner, { algoId: "GRID_COINM_001", algoOrdType: "contract_grid", instId: "BTC-USD-SWAP", json: false });
    assert.ok(out.join("").includes("Grid bot stopped"));
    assert.ok(out.join("").includes("GRID_COINM_001"));
    assert.equal(err.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdDcaOrders
// ---------------------------------------------------------------------------
describe("cmdDcaOrders", () => {
  it("outputs 'No DCA bots' to stdout when list is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdDcaOrders(runner, { history: false, json: false });
    assert.ok(out.join("").includes("No DCA bots"));
    assert.equal(err.join(""), "");
  });

  it("passes algoOrdType=spot_dca filter to runner", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([]); };
    await cmdDcaOrders(runner, { algoOrdType: "spot_dca", history: false, json: false });
    assert.equal(captured["algoOrdType"], "spot_dca");
    assert.equal(captured["status"], "active");
  });

  it("passes status=history when history=true", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([]); };
    await cmdDcaOrders(runner, { history: true, json: false });
    assert.equal(captured["status"], "history");
  });

  it("passes algoOrdType through to runner", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([]); };
    await cmdDcaOrders(runner, { algoOrdType: "contract_dca", history: false, json: false });
    assert.equal(captured["algoOrdType"], "contract_dca");
  });

  it("passes undefined algoOrdType when omitted", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([]); };
    await cmdDcaOrders(runner, { history: false, json: false });
    assert.equal(captured["algoOrdType"], undefined);
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "1", instId: "BTC-USDT", algoOrdType: "spot_dca", state: "running", pnl: "10", pnlRatio: "0.01", cTime: "0" }]);
    await cmdDcaOrders(runner, { history: false, json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});

// ---------------------------------------------------------------------------
// cmdDcaDetails
// ---------------------------------------------------------------------------
describe("cmdDcaDetails", () => {
  it("outputs 'DCA bot not found' to stdout when result is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdDcaDetails(runner, { algoId: "DCA001", algoOrdType: "contract_dca", json: false });
    assert.ok(out.join("").includes("DCA bot not found"));
    assert.equal(err.join(""), "");
  });

  it("passes algoOrdType=spot_dca to runner", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([]); };
    await cmdDcaDetails(runner, { algoId: "DCA001", algoOrdType: "spot_dca", json: false });
    assert.equal(captured["algoOrdType"], "spot_dca");
    assert.equal(captured["algoId"], "DCA001");
  });

  it("renders KV output for normal result", async () => {
    const runner: ToolRunner = async () => fakeResult([{
      algoId: "DCA001", algoOrdType: "spot_dca", instId: "BTC-USDT",
      sz: "0.01", avgPx: "30000", initPx: "30500", tpPx: "31500",
      slPx: "", upl: "50", fee: "-1.5", fundingFee: "0",
      curCycleId: "c1", fillSafetyOrds: "2", startTime: "1700000000000",
    }]);
    await cmdDcaDetails(runner, { algoId: "DCA001", algoOrdType: "spot_dca", json: false });
    assert.ok(out.join("").includes("DCA001"));
    assert.ok(out.join("").includes("BTC-USDT"));
  });
});

// ---------------------------------------------------------------------------
// cmdDcaCreate — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
describe("cmdDcaCreate", () => {
  const baseOpts = {
    instId: "BTC-USDT-SWAP", algoOrdType: "contract_dca", lever: "3", direction: "long",
    initOrdAmt: "100", maxSafetyOrds: "5", tpPct: "0.05", json: false,
  };

  it("outputs success message to stdout when sCode='0'", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "DCA001", sCode: "0", sMsg: "" }]);
    await cmdDcaCreate(runner, baseOpts);
    assert.ok(out.join("").includes("DCA bot created"));
    assert.ok(out.join("").includes("DCA001"));
    assert.ok(out.join("").includes("OK"));
    assert.equal(err.join(""), "");
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "", sCode: "51008", sMsg: "Insufficient margin" }]);
    await cmdDcaCreate(runner, baseOpts);
    assert.ok(err.join("").includes("Insufficient margin"));
    assert.ok(err.join("").includes("51008"));
    assert.equal(out.join(""), "");
  });

  it("passes algoOrdType and new params to runner", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([{ sCode: "0" }]); };
    await cmdDcaCreate(runner, {
      ...baseOpts,
      algoOrdType: "spot_dca",
      algoClOrdId: "myOrder123",
      reserveFunds: "false",
      tradeQuoteCcy: "USDT",
    });
    assert.equal(captured["algoOrdType"], "spot_dca");
    assert.equal(captured["algoClOrdId"], "myOrder123");
    assert.equal(captured["reserveFunds"], "false");
    assert.equal(captured["tradeQuoteCcy"], "USDT");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "DCA001", sCode: "0" }]);
    await cmdDcaCreate(runner, { ...baseOpts, json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });

  it("passes rsi trigger params to runner", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([{ sCode: "0" }]); };
    await cmdDcaCreate(runner, {
      ...baseOpts,
      triggerStrategy: "rsi",
      triggerCond: "cross_up",
      thold: "30",
      timeframe: "15m",
      timePeriod: "14",
    });
    assert.equal(captured["triggerStrategy"], "rsi");
    assert.equal(captured["triggerCond"], "cross_up");
    assert.equal(captured["thold"], "30");
    assert.equal(captured["timeframe"], "15m");
    assert.equal(captured["timePeriod"], "14");
  });

  it("passes price trigger params to runner", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([{ sCode: "0" }]); };
    await cmdDcaCreate(runner, {
      ...baseOpts,
      triggerStrategy: "price",
      triggerPx: "50000",
      triggerCond: "cross_down",
    });
    assert.equal(captured["triggerStrategy"], "price");
    assert.equal(captured["triggerPx"], "50000");
    assert.equal(captured["triggerCond"], "cross_down");
  });
});

// ---------------------------------------------------------------------------
// cmdDcaStop — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
describe("cmdDcaStop", () => {
  it("outputs success message to stdout when sCode='0'", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "DCA001", sCode: "0", sMsg: "" }]);
    await cmdDcaStop(runner, { algoId: "DCA001", algoOrdType: "contract_dca", json: false });
    assert.ok(out.join("").includes("DCA bot stopped"));
    assert.ok(out.join("").includes("DCA001"));
    assert.ok(out.join("").includes("OK"));
    assert.equal(err.join(""), "");
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "", sCode: "50013", sMsg: "Bot not found" }]);
    await cmdDcaStop(runner, { algoId: "DCA001", algoOrdType: "contract_dca", json: false });
    assert.ok(err.join("").includes("Bot not found"));
    assert.ok(err.join("").includes("50013"));
    assert.equal(out.join(""), "");
  });

  it("passes algoOrdType and stopType to runner", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([{ sCode: "0" }]); };
    await cmdDcaStop(runner, { algoId: "DCA001", algoOrdType: "spot_dca", stopType: "2", json: false });
    assert.equal(captured["algoOrdType"], "spot_dca");
    assert.equal(captured["stopType"], "2");
    assert.equal(captured["algoId"], "DCA001");
  });
});

// ---------------------------------------------------------------------------
// cmdDcaSubOrders
// ---------------------------------------------------------------------------
describe("cmdDcaSubOrders", () => {
  it("passes algoOrdType to runner", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([]); };
    await cmdDcaSubOrders(runner, { algoId: "DCA001", algoOrdType: "spot_dca", json: false });
    assert.equal(captured["algoOrdType"], "spot_dca");
    assert.equal(captured["algoId"], "DCA001");
  });

  it("outputs 'No sub-orders' when list is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdDcaSubOrders(runner, { algoId: "DCA001", algoOrdType: "contract_dca", json: false });
    assert.ok(out.join("").includes("No sub-orders"));
    assert.equal(err.join(""), "");
  });

  it("renders cycle list format when cycleId is omitted", async () => {
    const runner: ToolRunner = async () => fakeResult([{
      cycleId: "c001", cycleStatus: "running", currentCycle: true,
      avgPx: "30000", tpPx: "31500", realizedPnl: "0", fee: "-1",
      startTime: "1700000000000",
    }]);
    await cmdDcaSubOrders(runner, { algoId: "DCA001", algoOrdType: "spot_dca", json: false });
    assert.ok(out.join("").includes("c001"));
  });

  it("renders order list format when cycleId is provided", async () => {
    const runner: ToolRunner = async () => fakeResult([{
      ordId: "ord001", side: "buy", ordType: "init_order",
      px: "30000", filledSz: "0.01", avgFillPx: "30000",
      state: "filled", fee: "-0.5",
    }]);
    await cmdDcaSubOrders(runner, { algoId: "DCA001", algoOrdType: "spot_dca", cycleId: "c001", json: false });
    assert.ok(out.join("").includes("ord001"));
    assert.ok(out.join("").includes("buy"));
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ cycleId: "c001" }]);
    await cmdDcaSubOrders(runner, { algoId: "DCA001", algoOrdType: "contract_dca", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });

  it("passes cycleId to runner when provided", async () => {
    let captured: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => { captured = args as Record<string, unknown>; return fakeResult([]); };
    await cmdDcaSubOrders(runner, { algoId: "DCA001", algoOrdType: "contract_dca", cycleId: "c001", json: false });
    assert.equal(captured["cycleId"], "c001");
  });
});
