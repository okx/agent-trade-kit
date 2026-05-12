import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdMarketPairSpread } from "../src/commands/market.js";
import { setOutput, resetOutput } from "../src/formatter.js";

let out: string[] = [];
let err: string[] = [];

beforeEach(() => {
  out = []; err = [];
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
});
afterEach(() => resetOutput());

function fakeResult(data: unknown) {
  return { endpoint: "POST /api/v5/aigc/mcp/pair-spread", requestTime: new Date().toISOString(), data };
}

const LIVE_DATA = {
  timestamp: 1715500000000,
  mode: "live",
  instIdA: "BTC-USDT-SWAP",
  instIdB: "ETH-USDT-SWAP",
  bar: "15m",
  window: "1W",
  realtime: {
    lastPriceA: "62345.10000000",
    lastPriceB: "3012.25000000",
    spreadAbs: "59332.85000000",
    spreadRatio: "20.69688541",
    tsA: 1715500000000,
    tsB: 1715500000000,
  },
  statistics: {
    sampleCount: 672,
    windowStartTs: 1714895100000,
    windowEndTs: 1715499900000,
    absolute: { mean: "59000.00000000", stdDev: "500.00000000", median: "59100.00000000", min: "58000.00000000", max: "60000.00000000" },
    ratio: { mean: "20.50000000", stdDev: "0.30000000", median: "20.55000000", min: "19.80000000", max: "21.20000000" },
  },
  meta: {
    requestedBars: 672,
    alignedBars: 672,
    droppedBars: 0,
    truncated: false,
  },
};

const BACKTEST_DATA = {
  ...LIVE_DATA,
  mode: "backtest",
  realtime: null,
};

describe("cmdMarketPairSpread", () => {
  it("passes correct params to tool runner", async () => {
    let capturedName = "";
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (name, args) => {
      capturedName = name;
      capturedArgs = args as Record<string, unknown>;
      return fakeResult(LIVE_DATA);
    };
    await cmdMarketPairSpread(runner, "BTC-USDT-SWAP", "ETH-USDT-SWAP", {
      bar: "5m",
      window: "4H",
      backtestTime: 1715000000000,
      json: false,
    });
    assert.equal(capturedName, "market_get_pair_spread");
    assert.equal(capturedArgs["instIdA"], "BTC-USDT-SWAP");
    assert.equal(capturedArgs["instIdB"], "ETH-USDT-SWAP");
    assert.equal(capturedArgs["bar"], "5m");
    assert.equal(capturedArgs["window"], "4H");
    assert.equal(capturedArgs["backtestTime"], 1715000000000);
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult(LIVE_DATA);
    await cmdMarketPairSpread(runner, "BTC-USDT-SWAP", "ETH-USDT-SWAP", { json: true });
    const combined = out.join("");
    assert.doesNotThrow(() => JSON.parse(combined));
    const parsed = JSON.parse(combined);
    assert.equal(parsed.mode, "live");
    assert.equal(parsed.instIdA, "BTC-USDT-SWAP");
  });

  it("outputs table header with instIds, bar, window, mode in default mode", async () => {
    const runner: ToolRunner = async () => fakeResult(LIVE_DATA);
    await cmdMarketPairSpread(runner, "BTC-USDT-SWAP", "ETH-USDT-SWAP", { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("BTC-USDT-SWAP"));
    assert.ok(combined.includes("ETH-USDT-SWAP"));
    assert.ok(combined.includes("bar=15m"));
    assert.ok(combined.includes("window=1W"));
    assert.ok(combined.includes("mode=live"));
  });

  it("outputs realtime line with prices and spread in live mode", async () => {
    const runner: ToolRunner = async () => fakeResult(LIVE_DATA);
    await cmdMarketPairSpread(runner, "BTC-USDT-SWAP", "ETH-USDT-SWAP", { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("lastA=62345.10000000"));
    assert.ok(combined.includes("lastB=3012.25000000"));
    assert.ok(combined.includes("abs=59332.85000000"));
    assert.ok(combined.includes("ratio=20.69688541"));
  });

  it("skips realtime line in backtest mode", async () => {
    const runner: ToolRunner = async () => fakeResult(BACKTEST_DATA);
    await cmdMarketPairSpread(runner, "BTC-USDT-SWAP", "ETH-USDT-SWAP", { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("mode=backtest"));
    assert.ok(!combined.includes("lastA="));
    assert.ok(!combined.includes("realtime"));
  });

  it("outputs statistics table with absolute and ratio columns", async () => {
    const runner: ToolRunner = async () => fakeResult(LIVE_DATA);
    await cmdMarketPairSpread(runner, "BTC-USDT-SWAP", "ETH-USDT-SWAP", { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("mean"));
    assert.ok(combined.includes("stdDev"));
    assert.ok(combined.includes("median"));
    assert.ok(combined.includes("59000.00000000"));
    assert.ok(combined.includes("20.50000000"));
  });

  it("outputs meta line with aligned/dropped/truncated info", async () => {
    const runner: ToolRunner = async () => fakeResult(LIVE_DATA);
    await cmdMarketPairSpread(runner, "BTC-USDT-SWAP", "ETH-USDT-SWAP", { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("requested=672"));
    assert.ok(combined.includes("aligned=672"));
    assert.ok(combined.includes("dropped=0"));
    assert.ok(combined.includes("truncated=false"));
  });

  it("passes undefined for optional params when not provided", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => {
      capturedArgs = args as Record<string, unknown>;
      return fakeResult(LIVE_DATA);
    };
    await cmdMarketPairSpread(runner, "BTC-USDT-SWAP", "ETH-USDT-SWAP", { json: false });
    assert.equal(capturedArgs["bar"], undefined);
    assert.equal(capturedArgs["window"], undefined);
    assert.equal(capturedArgs["backtestTime"], undefined);
  });
});
