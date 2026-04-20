import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdSwapPlace, cmdSwapCancel } from "../src/commands/swap.js";
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
  return { endpoint: "POST /api/v5/trade/order", requestTime: new Date().toISOString(), data };
}

const placeOpts = {
  instId: "BTC-USDT-SWAP", side: "buy" as const, ordType: "limit",
  sz: "1", tdMode: "cross", px: "50000", json: false,
};

// ---------------------------------------------------------------------------
// cmdSwapPlace — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
describe("cmdSwapPlace", () => {
  it("outputs success message to stdout when sCode='0'", async () => {
    const runner: ToolRunner = async () => fakeResult([{ ordId: "ORD001", sCode: "0", sMsg: "" }]);
    await cmdSwapPlace(runner, placeOpts);
    assert.ok(out.join("").includes("Order placed"));
    assert.ok(out.join("").includes("ORD001"));
    assert.ok(out.join("").includes("OK"));
    assert.equal(err.join(""), "");
  });

  it("outputs error message to stderr when sCode is non-zero", async () => {
    const runner: ToolRunner = async () => fakeResult([{ ordId: "", sCode: "51008", sMsg: "Insufficient margin" }]);
    await cmdSwapPlace(runner, placeOpts);
    assert.ok(err.join("").includes("Insufficient margin"));
    assert.ok(err.join("").includes("51008"));
    assert.equal(out.join(""), "");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ ordId: "ORD001", sCode: "0" }]);
    await cmdSwapPlace(runner, { ...placeOpts, json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});

// ---------------------------------------------------------------------------
// cmdSwapCancel — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
describe("cmdSwapCancel", () => {
  it("outputs success message to stdout when sCode='0'", async () => {
    const runner: ToolRunner = async () => fakeResult([{ ordId: "ORD001", sCode: "0", sMsg: "" }]);
    await cmdSwapCancel(runner, { instId: "BTC-USDT-SWAP", ordId: "ORD001", json: false });
    assert.ok(out.join("").includes("Cancelled"));
    assert.ok(out.join("").includes("ORD001"));
    assert.ok(out.join("").includes("OK"));
    assert.equal(err.join(""), "");
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const runner: ToolRunner = async () => fakeResult([{ ordId: "", sCode: "51401", sMsg: "Order does not exist" }]);
    await cmdSwapCancel(runner, { instId: "BTC-USDT-SWAP", ordId: "ORD001", json: false });
    assert.ok(err.join("").includes("Order does not exist"));
    assert.ok(err.join("").includes("51401"));
    assert.equal(out.join(""), "");
  });
});
