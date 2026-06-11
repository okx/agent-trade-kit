import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  cmdMarketTicker,
  cmdMarketFundingRate,
  cmdMarketPriceLimit,
  cmdMarketOrderbook,
  cmdMarketFilter,
  cmdMarketOiHistory,
  cmdMarketOiChangeFilter,
  cmdMarketIndicator,
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

// ---------------------------------------------------------------------------
// cmdMarketFilter
// ---------------------------------------------------------------------------
describe("cmdMarketFilter", () => {
  const baseOpts = { instType: "SPOT", json: false };

  it("outputs 'No results' and 'Total: 0' when rows are empty", async () => {
    const runner: ToolRunner = async () => fakeResult([{ total: 0, rows: [] }]);
    await cmdMarketFilter(runner, { ...baseOpts });
    const combined = out.join("");
    assert.ok(combined.includes("Total: 0"));
    assert.ok(combined.includes("No results"));
    assert.equal(err.join(""), "");
  });

  it("outputs table with rows and correct Total for SPOT (no fundingRate column)", async () => {
    const runner: ToolRunner = async () => fakeResult([{
      total: 3,
      rows: [{ rank: 1, instId: "BTC-USDT", last: "50000", chg24hPct: "2.1", volUsd24h: "1000000000", oiUsd: null, sortVal: "1000000000" }],
    }]);
    await cmdMarketFilter(runner, { ...baseOpts });
    const combined = out.join("");
    assert.ok(combined.includes("Total: 3"));
    assert.ok(combined.includes("BTC-USDT"));
    assert.ok(combined.includes("50000"));
    assert.ok(!combined.includes("No results"));
    assert.ok(!combined.includes("fundingRate"));
    assert.equal(err.join(""), "");
  });

  it("outputs table with fundingRate column for SWAP", async () => {
    const runner: ToolRunner = async () => fakeResult([{
      total: 1,
      rows: [{ rank: 1, instId: "BTC-USDT-SWAP", last: "50000", chg24hPct: "1.5", volUsd24h: "5000000000", oiUsd: "2000000000", fundingRate: "0.0001", sortVal: "2000000000" }],
    }]);
    await cmdMarketFilter(runner, { instType: "SWAP", json: false });
    const combined = out.join("");
    assert.ok(combined.includes("BTC-USDT-SWAP"));
    assert.ok(combined.includes("fundingRate"));
    assert.ok(combined.includes("0.0001"));
    assert.equal(err.join(""), "");
  });

  it("outputs JSON unchanged (full getData(result) array) when json=true", async () => {
    const arrayData = [{
      total: 1,
      rows: [{ rank: 1, instId: "BTC-USDT", last: "50000", chg24hPct: "2.1", volUsd24h: "1000000000", oiUsd: null, sortVal: "1000000000" }],
    }];
    const runner: ToolRunner = async () => fakeResult(arrayData);
    await cmdMarketFilter(runner, { ...baseOpts, json: true });
    const printed = findJson(out);
    assert.doesNotThrow(() => JSON.parse(printed));
    // --json must serialize the original getData(result) value (the full array), unchanged.
    assert.deepEqual(JSON.parse(printed), arrayData);
  });
});

// ---------------------------------------------------------------------------
// cmdMarketOiHistory
// ---------------------------------------------------------------------------
describe("cmdMarketOiHistory", () => {
  it("outputs 'No OI data' when rows are empty", async () => {
    const runner: ToolRunner = async () => fakeResult([{ instId: "BTC-USDT-SWAP", bar: "1H", rows: [] }]);
    await cmdMarketOiHistory(runner, "BTC-USDT-SWAP", { json: false });
    assert.ok(out.join("").includes("No OI data"));
    assert.equal(err.join(""), "");
  });

  it("outputs OI table with non-null values", async () => {
    const runner: ToolRunner = async () => fakeResult([{
      instId: "BTC-USDT-SWAP",
      bar: "1H",
      rows: [{ ts: "1700000000000", oiUsd: "2000000000", oiDeltaUsd: "50000000", oiDeltaPct: "2.5", oiCont: "40000" }],
    }]);
    await cmdMarketOiHistory(runner, "BTC-USDT-SWAP", { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("BTC-USDT-SWAP"));
    assert.ok(combined.includes("2000000000"));
    assert.equal(err.join(""), "");
  });

  it("shows '-' for null OI fields", async () => {
    const runner: ToolRunner = async () => fakeResult([{
      instId: "BTC-USDT-SWAP",
      bar: "1H",
      rows: [{ ts: "1700000000000", oiUsd: null, oiDeltaUsd: null, oiDeltaPct: null, oiCont: null }],
    }]);
    await cmdMarketOiHistory(runner, "BTC-USDT-SWAP", { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("-"));
    assert.equal(err.join(""), "");
  });

  it("falls back to instId param when data.instId is absent", async () => {
    const runner: ToolRunner = async () => fakeResult([{
      bar: "4H",
      rows: [{ ts: "1700000000000", oiUsd: "1000000", oiDeltaUsd: "0", oiDeltaPct: "0", oiCont: "200" }],
    }]);
    await cmdMarketOiHistory(runner, "ETH-USDT-SWAP", { bar: "4H", json: false });
    assert.ok(out.join("").includes("ETH-USDT-SWAP"));
    assert.equal(err.join(""), "");
  });

  it("outputs 'No OI data' when data array is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdMarketOiHistory(runner, "BTC-USDT-SWAP", { json: false });
    assert.ok(out.join("").includes("No OI data"));
    assert.equal(err.join(""), "");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ instId: "BTC-USDT-SWAP", bar: "1H", rows: [] }]);
    await cmdMarketOiHistory(runner, "BTC-USDT-SWAP", { json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});

// ---------------------------------------------------------------------------
// cmdMarketOiChangeFilter
// ---------------------------------------------------------------------------
describe("cmdMarketOiChangeFilter", () => {
  const baseOpts = { instType: "SWAP", json: false };

  it("outputs 'No results' when rows are empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdMarketOiChangeFilter(runner, { ...baseOpts });
    assert.ok(out.join("").includes("No results"));
    assert.equal(err.join(""), "");
  });

  it("outputs table with OI change rows", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { rank: 1, instId: "BTC-USDT-SWAP", last: "50000", oiUsd: "2000000000", oiDeltaPct: "3.5", pxChgPct: "1.2", volUsd24h: "5000000000", fundingRate: "0.0001" },
    ]);
    await cmdMarketOiChangeFilter(runner, { ...baseOpts });
    const combined = out.join("");
    assert.ok(combined.includes("BTC-USDT-SWAP"));
    assert.ok(combined.includes("3.5"));
    assert.equal(err.join(""), "");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdMarketOiChangeFilter(runner, { ...baseOpts, json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});

// ---------------------------------------------------------------------------
// cmdMarketIndicator — Bug 2: Plan A visible-hint guard + Plan B default lookup
// ---------------------------------------------------------------------------

/** Exact verbatim Plan A hint (spec §8.2, TBC[3]). */
const PLAN_A_HINT =
  "No indicator values returned. This indicator may require a period — try --params (e.g. --params 14).";

/** Build a full indicator response envelope the render loop traverses. */
function indicatorResult(apiCode: string, valuesByTf: Record<string, Array<{ ts: number; values: Record<string, string> }>>) {
  const timeframes: Record<string, unknown> = {};
  for (const [tf, entries] of Object.entries(valuesByTf)) {
    timeframes[tf] = { indicators: { [apiCode]: entries } };
  }
  return fakeResult([
    { data: [{ instId: "BTC-USDT", timeframes }], mode: "live", summary: {}, timestamp: Date.now() },
  ]);
}

describe("cmdMarketIndicator", () => {
  it("Plan A: prints the exact hint (never silent) when every timeframe is empty", async () => {
    // EMA resolves to apiCode "EMA"; indicators.EMA = [] (empty) for the timeframe.
    const runner: ToolRunner = async () => indicatorResult("EMA", { "1H": [] });
    await cmdMarketIndicator(runner, "ema", "BTC-USDT", { json: false });
    const combined = out.join("");
    assert.notEqual(combined, "", "indicator command must never be silent");
    assert.ok(combined.includes(PLAN_A_HINT), "must print the exact Plan A hint");
    assert.equal(err.join(""), "");
  });

  it("Plan A: non-period indicator (obv) with empty result prints the hint, no default substituted", async () => {
    let capturedParams: unknown;
    const runner: ToolRunner = async (_name, args) => {
      capturedParams = (args as Record<string, unknown>).params;
      return indicatorResult("OBV", { "1H": [] });
    };
    await cmdMarketIndicator(runner, "obv", "BTC-USDT", { json: false });
    assert.equal(capturedParams, undefined, "obv has no default — params must stay undefined");
    assert.ok(out.join("").includes(PLAN_A_HINT));
    assert.equal(err.join(""), "");
  });

  it("Plan B routing: omitting --params for ema sends the core default [14] (via named flag, not positional)", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => {
      capturedArgs = args as Record<string, unknown>;
      return indicatorResult("EMA", { "1H": [{ ts: 1700000000000, values: { ema: "50000" } }] });
    };
    await cmdMarketIndicator(runner, "ema", "BTC-USDT", { json: false });
    assert.deepEqual(capturedArgs.params, [14], "default paramList [14] must be sent on omit");
  });

  it("explicit --params wins: --params 2 sends [2] (no regression, no default override)", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => {
      capturedArgs = args as Record<string, unknown>;
      return indicatorResult("EMA", { "1H": [{ ts: 1700000000000, values: { ema: "50000" } }] });
    };
    await cmdMarketIndicator(runner, "ema", "BTC-USDT", { params: "2", json: false });
    assert.deepEqual(capturedArgs.params, [2], "explicit --params must win over the default");
  });

  it("Plan B render: when default yields values, the loop renders them (no hint printed)", async () => {
    const runner: ToolRunner = async () =>
      indicatorResult("EMA", { "1H": [{ ts: 1700000000000, values: { ema: "50123.45" } }] });
    await cmdMarketIndicator(runner, "ema", "BTC-USDT", { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("50123.45"), "rendered indicator value must appear");
    assert.ok(!combined.includes(PLAN_A_HINT), "no hint when values are rendered");
    assert.equal(err.join(""), "");
  });

  it("Plan B render --list: renders a table of values when --list is set", async () => {
    const runner: ToolRunner = async () =>
      indicatorResult("EMA", {
        "1H": [
          { ts: 1700000000000, values: { ema: "50123.45" } },
          { ts: 1700003600000, values: { ema: "50200.00" } },
        ],
      });
    await cmdMarketIndicator(runner, "ema", "BTC-USDT", { list: true, json: false });
    const combined = out.join("");
    assert.ok(combined.includes("50123.45"));
    assert.ok(combined.includes("50200.00"));
    assert.ok(!combined.includes(PLAN_A_HINT));
    assert.equal(err.join(""), "");
  });
});
