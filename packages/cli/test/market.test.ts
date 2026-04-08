import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  cmdMarketTicker,
  cmdMarketFundingRate,
  cmdMarketPriceLimit,
  cmdMarketOrderbook,
} from "../src/commands/market.js";
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
  return { endpoint: "GET /api/v5/market", requestTime: new Date().toISOString(), data };
}

// ---------------------------------------------------------------------------
// cmdMarketTicker
// ---------------------------------------------------------------------------
describe("cmdMarketTicker", () => {
  it("outputs 'No data' to stdout when items are empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdMarketTicker(runner, "BTC-USDT", false);
    assert.ok(out.join("").includes("No data"));
    assert.equal(err.join(""), "");
  });

  it("outputs ticker fields including 24h open and computed change %", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { instId: "BTC-USDT", last: "51000", open24h: "50000", high24h: "52000", low24h: "49000", vol24h: "1000", ts: "1700000000000" },
    ]);
    await cmdMarketTicker(runner, "BTC-USDT", false);
    const combined = out.join("");
    assert.ok(combined.includes("BTC-USDT"));
    assert.ok(combined.includes("51000"));
    assert.ok(combined.includes("50000")); // 24h open
    assert.ok(combined.includes("2.00%")); // (51000-50000)/50000*100 = 2.00%
    assert.equal(err.join(""), "");
  });

  it("shows N/A for 24h change % when open24h is 0", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { instId: "BTC-USDT", last: "50000", open24h: "0", high24h: "51000", low24h: "49000", vol24h: "1000", ts: "1700000000000" },
    ]);
    await cmdMarketTicker(runner, "BTC-USDT", false);
    assert.ok(out.join("").includes("N/A"));
    assert.equal(err.join(""), "");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ instId: "BTC-USDT", last: "50000" }]);
    await cmdMarketTicker(runner, "BTC-USDT", true);
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});

// ---------------------------------------------------------------------------
// cmdMarketFundingRate
// ---------------------------------------------------------------------------
describe("cmdMarketFundingRate", () => {
  it("outputs 'No data' when current rate result is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdMarketFundingRate(runner, "BTC-USDT-SWAP", { history: false, json: false });
    assert.ok(out.join("").includes("No data"));
    assert.equal(err.join(""), "");
  });

  it("outputs current funding rate kv when data is present", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { instId: "BTC-USDT-SWAP", fundingRate: "0.0001", nextFundingRate: "0.0002", fundingTime: "1700000000000", nextFundingTime: "1700028800000" },
    ]);
    await cmdMarketFundingRate(runner, "BTC-USDT-SWAP", { history: false, json: false });
    assert.ok(out.join("").includes("0.0001"));
    assert.equal(err.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdMarketPriceLimit
// ---------------------------------------------------------------------------
describe("cmdMarketPriceLimit", () => {
  it("outputs 'No data' when items are empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdMarketPriceLimit(runner, "BTC-USDT-SWAP", false);
    assert.ok(out.join("").includes("No data"));
    assert.equal(err.join(""), "");
  });

  it("outputs price limit fields when data is present", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { instId: "BTC-USDT-SWAP", buyLmt: "51000", sellLmt: "49000", ts: "1700000000000" },
    ]);
    await cmdMarketPriceLimit(runner, "BTC-USDT-SWAP", false);
    assert.ok(out.join("").includes("51000"));
    assert.equal(err.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdMarketOrderbook
// ---------------------------------------------------------------------------
describe("cmdMarketOrderbook", () => {
  it("outputs 'No data' when book array is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdMarketOrderbook(runner, "BTC-USDT", undefined, false);
    assert.ok(out.join("").includes("No data"));
    assert.equal(err.join(""), "");
  });

  it("outputs asks and bids headers when book is present", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { asks: [["50100", "1.5"], ["50200", "2.0"]], bids: [["50000", "1.0"], ["49900", "3.0"]], ts: "1700000000000" },
    ]);
    await cmdMarketOrderbook(runner, "BTC-USDT", undefined, false);
    const combined = out.join("");
    assert.ok(combined.includes("Asks"));
    assert.ok(combined.includes("Bids"));
    assert.ok(combined.includes("50100"));
    assert.ok(combined.includes("50000"));
    assert.equal(err.join(""), "");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ asks: [], bids: [] }]);
    await cmdMarketOrderbook(runner, "BTC-USDT", undefined, true);
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});
