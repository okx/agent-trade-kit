import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdAccountBalanceAll } from "../src/commands/account.js";
import { setOutput, resetOutput } from "../src/formatter.js";

let out: string[] = [];
let err: string[] = [];

beforeEach(() => {
  out = []; err = [];
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
});
afterEach(() => resetOutput());

function fakeBalanceAllResult(overrides: Record<string, unknown> = {}) {
  return {
    trading: { available: true, totalEq: "10000", adjEq: "9500", details: [{ totalEq: "10000", details: [{ ccy: "USDT", eq: "10000", availEq: "9000", frozenBal: "1000" }] }] },
    funding: { available: true, details: [{ ccy: "USDT", bal: "5000", availBal: "5000", frozenBal: "0" }] },
    valuation: { available: true, valuationCcy: "USDT", totalBal: "15000", details: [{ totalBal: "15000", details: { trading: "10000", funding: "5000" } }] },
    meta: { requestedAt: "2024-01-01T00:00:00.000Z", elapsedMs: 42, partialFailure: false },
    ...overrides,
  };
}

describe("cmdAccountBalanceAll routing", () => {
  it("calls account_get_balance_all with correct tool name", async () => {
    let capturedTool = "";
    const runner: ToolRunner = async (tool) => {
      capturedTool = tool;
      return fakeBalanceAllResult();
    };
    await cmdAccountBalanceAll(runner, undefined, { json: true });
    assert.equal(capturedTool, "account_get_balance_all");
  });

  it("passes ccy from parameter", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return fakeBalanceAllResult();
    };
    await cmdAccountBalanceAll(runner, "BTC,ETH", { json: true });
    assert.equal(capturedArgs.ccy, "BTC,ETH");
  });

  it("passes accounts from opts", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return fakeBalanceAllResult();
    };
    await cmdAccountBalanceAll(runner, undefined, { accounts: "funding", json: true });
    assert.equal(capturedArgs.accounts, "funding");
  });

  it("passes showValuation=false when noValuation=true", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return fakeBalanceAllResult();
    };
    await cmdAccountBalanceAll(runner, undefined, { noValuation: true, json: true });
    assert.equal(capturedArgs.showValuation, false);
  });

  it("passes showValuation=true by default", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return fakeBalanceAllResult();
    };
    await cmdAccountBalanceAll(runner, undefined, { json: true });
    assert.equal(capturedArgs.showValuation, true);
  });

  it("passes valuationCcy from opts", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return fakeBalanceAllResult();
    };
    await cmdAccountBalanceAll(runner, undefined, { valuationCcy: "BTC", json: true });
    assert.equal(capturedArgs.valuationCcy, "BTC");
  });

  it("outputs valid JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeBalanceAllResult();
    await cmdAccountBalanceAll(runner, undefined, { json: true });
    const combined = out.join("");
    assert.doesNotThrow(() => JSON.parse(combined));
  });

  it("shows [PARTIAL] banner when partialFailure=true", async () => {
    const runner: ToolRunner = async () => fakeBalanceAllResult({
      meta: { requestedAt: "2024-01-01T00:00:00.000Z", elapsedMs: 42, partialFailure: true },
      trading: { available: false, error: { code: "50011", msg: "Rate limited" } },
    });
    await cmdAccountBalanceAll(runner, undefined, { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("[PARTIAL]"));
  });

  it("shows trading section with equity when available", async () => {
    const runner: ToolRunner = async () => fakeBalanceAllResult();
    await cmdAccountBalanceAll(runner, undefined, { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("Trading Account"));
    assert.ok(combined.includes("10000"));
  });

  it("shows error message when trading is unavailable", async () => {
    const runner: ToolRunner = async () => fakeBalanceAllResult({
      trading: { available: false, error: { code: "50011", msg: "Rate limited" } },
      meta: { requestedAt: "2024-01-01T00:00:00.000Z", elapsedMs: 42, partialFailure: true },
    });
    await cmdAccountBalanceAll(runner, undefined, { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("ERROR"));
    assert.ok(combined.includes("Rate limited"));
  });

  it("shows funding section when available", async () => {
    const runner: ToolRunner = async () => fakeBalanceAllResult();
    await cmdAccountBalanceAll(runner, undefined, { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("Funding Account"));
  });

  it("shows valuation section with totalBal", async () => {
    const runner: ToolRunner = async () => fakeBalanceAllResult();
    await cmdAccountBalanceAll(runner, undefined, { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("Valuation"));
    assert.ok(combined.includes("15000"));
  });

  it("does not pass ccy when undefined", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return fakeBalanceAllResult();
    };
    await cmdAccountBalanceAll(runner, undefined, { json: true });
    assert.ok(!("ccy" in capturedArgs));
  });
});
