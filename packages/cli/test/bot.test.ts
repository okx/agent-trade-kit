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
} from "../src/commands/bot.js";
import { setOutput, resetOutput } from "../src/formatter.js";

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
    assert.doesNotThrow(() => JSON.parse(out.join("")));
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
    assert.doesNotThrow(() => JSON.parse(out.join("")));
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
});

// ---------------------------------------------------------------------------
// cmdDcaDetails
// ---------------------------------------------------------------------------
describe("cmdDcaDetails", () => {
  it("outputs 'DCA bot not found' to stdout when result is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdDcaDetails(runner, { algoId: "DCA001", json: false });
    assert.ok(out.join("").includes("DCA bot not found"));
    assert.equal(err.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdDcaCreate — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
describe("cmdDcaCreate", () => {
  const baseOpts = {
    instId: "BTC-USDT-SWAP", lever: "3", direction: "long",
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
});

// ---------------------------------------------------------------------------
// cmdDcaStop — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
describe("cmdDcaStop", () => {
  it("outputs success message to stdout when sCode='0'", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "DCA001", sCode: "0", sMsg: "" }]);
    await cmdDcaStop(runner, { algoId: "DCA001", json: false });
    assert.ok(out.join("").includes("DCA bot stopped"));
    assert.ok(out.join("").includes("DCA001"));
    assert.ok(out.join("").includes("OK"));
    assert.equal(err.join(""), "");
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const runner: ToolRunner = async () => fakeResult([{ algoId: "", sCode: "50013", sMsg: "Bot not found" }]);
    await cmdDcaStop(runner, { algoId: "DCA001", json: false });
    assert.ok(err.join("").includes("Bot not found"));
    assert.ok(err.join("").includes("50013"));
    assert.equal(out.join(""), "");
  });
});
