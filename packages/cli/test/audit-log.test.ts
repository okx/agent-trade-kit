import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { TradeLogger } from "@agent-tradekit/core";
import type { ToolRunner } from "@agent-tradekit/core";
import { wrapRunnerWithLogger } from "../src/index.js";

function makeSpyLogger() {
  const entries: { level: string; tool: string; params: unknown; result: unknown; durationMs: number }[] = [];
  const logger = {
    log(level: string, tool: string, params: unknown, result: unknown, durationMs: number) {
      entries.push({ level, tool, params, result, durationMs });
    },
  } as unknown as TradeLogger;
  return { logger, entries };
}

function makeFakeRunner(result: unknown): ToolRunner {
  return async () => ({ endpoint: "/test", requestTime: new Date().toISOString(), data: result });
}

function makeFailingRunner(error: Error): ToolRunner {
  return async () => { throw error; };
}

describe("wrapRunnerWithLogger", () => {
  it("logs successful tool call at info level with compact result", async () => {
    const { logger, entries } = makeSpyLogger();
    const run = wrapRunnerWithLogger(makeFakeRunner([{ ok: true }]), logger);
    const result = await run("market_get_ticker", { instId: "BTC-USDT" });
    assert.equal(result.data[0].ok, true);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, "info");
    assert.equal(entries[0].tool, "market_get_ticker");
    assert.deepEqual(entries[0].result, { status: "ok" });
    assert.ok(entries[0].durationMs >= 0);
  });

  it("logs failed tool call at error level and rethrows", async () => {
    const { logger, entries } = makeSpyLogger();
    const err = new Error("API failed");
    const run = wrapRunnerWithLogger(makeFailingRunner(err), logger);
    await assert.rejects(() => run("swap_place_order", { instId: "BTC-USDT-SWAP" }), (thrown: unknown) => {
      assert.equal(thrown, err);
      return true;
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, "error");
    assert.equal(entries[0].tool, "swap_place_order");
  });

  it("records duration for both success and failure", async () => {
    const { logger, entries } = makeSpyLogger();
    const run = wrapRunnerWithLogger(makeFakeRunner({ ok: true }), logger);
    await run("market_get_ticker", {});
    assert.equal(typeof entries[0].durationMs, "number");
    assert.ok(entries[0].durationMs >= 0);
  });

  it("passes args to logger", async () => {
    const { logger, entries } = makeSpyLogger();
    const run = wrapRunnerWithLogger(makeFakeRunner(null), logger);
    await run("account_get_balance", { ccy: "USDT" });
    assert.deepEqual(entries[0].params, { ccy: "USDT" });
  });

  it("verbose=false: only info level, no debug entry", async () => {
    const { logger, entries } = makeSpyLogger();
    const run = wrapRunnerWithLogger(makeFakeRunner({ price: "100" }), logger, false);
    await run("market_get_ticker", { instId: "BTC-USDT" });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].level, "info");
    assert.deepEqual(entries[0].result, { status: "ok" });
  });

  it("verbose=true: info + debug entries, debug has full result", async () => {
    const { logger, entries } = makeSpyLogger();
    const fakeData = { price: "100", vol: "500" };
    const run = wrapRunnerWithLogger(makeFakeRunner(fakeData), logger, true);
    await run("market_get_ticker", { instId: "BTC-USDT" });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].level, "info");
    assert.deepEqual(entries[0].result, { status: "ok" });
    assert.equal(entries[1].level, "debug");
    assert.equal(entries[1].tool, "market_get_ticker");
    const debugResult = entries[1].result as { endpoint: string; data: unknown };
    assert.equal(debugResult.endpoint, "/test");
    assert.deepEqual(debugResult.data, fakeData);
  });
});
