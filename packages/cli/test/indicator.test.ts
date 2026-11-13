/**
 * Unit tests for CLI indicator command —
 * handleMarketPublicCommand routing and cmdMarketIndicator formatter.
 *
 * No real network calls are made; a spy ToolRunner is used.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { handleMarketPublicCommand } from "../src/index.js";
import type { CliValues } from "../src/index.js";
import { cmdMarketIndicator } from "../src/commands/market.js";

// CLI dispatch helpers set `process.exitCode = 1` on unknown actions; reset
// between tests so a leaked exit code doesn't fail the test file as a whole.
afterEach(() => { process.exitCode = 0; });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Suppress stdout for tests that render formatted output. */
function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: typeof process.stdout.write }).write = (chunk: unknown) => {
    chunks.push(String(chunk));
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

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

const MOCK_INDICATOR_RESULT = {
  endpoint: "POST /api/v5/aigc/mcp/indicators",
  requestTime: new Date().toISOString(),
  data: [{
    data: [{
      instId: "BTC-USDT",
      timeframes: {
        "1H": {
          indicators: {
            RSI: [{ ts: "1700000000000", values: { "14": "55.00" } }],
          },
        },
      },
    }],
    mode: "live",
    summary: {},
    timestamp: 1700000000000,
  }],
};

/** Same shape as MOCK_INDICATOR_RESULT but for another indicator code (e.g. MA, MACD). */
function resultFor(code: string): typeof MOCK_INDICATOR_RESULT {
  return {
    ...MOCK_INDICATOR_RESULT,
    data: [{
      ...MOCK_INDICATOR_RESULT.data[0]!,
      data: [{
        instId: "BTC-USDT",
        timeframes: { "1H": { indicators: { [code]: [{ ts: "1700000000000", values: { v: "1.00" } }] } } },
      }],
    }],
  } as unknown as typeof MOCK_INDICATOR_RESULT;
}

function makeSpy(result: unknown = MOCK_INDICATOR_RESULT): {
  spy: ToolRunner;
  captured: { tool: string; args: Record<string, unknown> };
} {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    return result as ReturnType<ToolRunner> extends Promise<infer R> ? R : never;
  };
  return { spy, captured };
}

// ---------------------------------------------------------------------------
// handleMarketPublicCommand — indicator routing
// ---------------------------------------------------------------------------

describe("handleMarketPublicCommand - indicator routing", () => {
  it("routes 'indicator' action to market_get_indicator", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleMarketPublicCommand(spy, "indicator", ["rsi", "BTC-USDT"], vals({}), false)
    );
    assert.equal(captured.tool, "market_get_indicator");
    assert.equal(captured.args["instId"], "BTC-USDT");
    assert.equal(captured.args["indicator"], "rsi");
  });

  it("passes bar from v.bar", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleMarketPublicCommand(spy, "indicator", ["rsi", "BTC-USDT"], vals({ bar: "4H" }), false)
    );
    assert.equal(captured.args["bar"], "4H");
  });

  it("passes params from v.params string", async () => {
    const { spy, captured } = makeSpy(resultFor("MA"));
    await captureStdout(() =>
      handleMarketPublicCommand(spy, "indicator", ["ma", "BTC-USDT"], vals({ params: "5,20" }), false)
    );
    // params are parsed in cmdMarketIndicator, but the string is passed through
    assert.equal(captured.args["indicator"], "ma");
  });

  it("passes list flag from v.list", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleMarketPublicCommand(spy, "indicator", ["rsi", "BTC-USDT"], vals({ list: true }), false)
    );
    assert.equal(captured.args["returnList"], true);
  });

  it("converts v.limit string to number", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleMarketPublicCommand(spy, "indicator", ["rsi", "BTC-USDT"], vals({ limit: "20" as unknown as number }), false)
    );
    assert.equal(captured.args["limit"], 20);
  });

  it("converts v['backtest-time'] string to number", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleMarketPublicCommand(spy, "indicator", ["rsi", "BTC-USDT"], vals({ "backtest-time": "1700000000000" }), false)
    );
    assert.equal(captured.args["backtestTime"], 1700000000000);
  });

  it("returns undefined for non-indicator actions", () => {
    const { spy } = makeSpy();
    const result = handleMarketPublicCommand(spy, "unknown-action", [], vals({}), false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// cmdMarketIndicator — formatter
// ---------------------------------------------------------------------------

describe("cmdMarketIndicator - formatter", () => {
  it("with --json flag outputs raw JSON array", async () => {
    const { spy } = makeSpy();
    const output = await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: true })
    );
    const parsed = JSON.parse(output);
    assert.ok(Array.isArray(parsed));
  });

  it("with no data outputs 'No data'", async () => {
    const emptyResult = { ...MOCK_INDICATOR_RESULT, data: [] };
    const { spy } = makeSpy(emptyResult);
    const output = await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false })
    );
    assert.ok(output.includes("No data"));
  });

  it("with missing timeframes falls back to JSON output", async () => {
    const noTimeframesResult = {
      ...MOCK_INDICATOR_RESULT,
      data: [{ data: [{ instId: "BTC-USDT" }], mode: "live", summary: {}, timestamp: 0 }],
    };
    const { spy } = makeSpy(noTimeframesResult);
    const output = await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false })
    );
    // Should output raw JSON as fallback
    assert.ok(output.length > 0);
    assert.ok(output.includes("[") || output.includes("{"));
  });

  it("renders instId, indicator code and timeframe in output", async () => {
    const { spy } = makeSpy();
    const output = await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false })
    );
    assert.ok(output.includes("BTC-USDT"), `output: ${output}`);
    assert.ok(output.includes("RSI"), `output: ${output}`);
    assert.ok(output.includes("1H"), `output: ${output}`);
  });

  it("with --list renders table rows", async () => {
    const listResult = {
      ...MOCK_INDICATOR_RESULT,
      data: [{
        data: [{
          instId: "BTC-USDT",
          timeframes: {
            "1H": {
              indicators: {
                RSI: [
                  { ts: "1700000001000", values: { "14": "56.00" } },
                  { ts: "1700000000000", values: { "14": "55.00" } },
                ],
              },
            },
          },
        }],
        mode: "live", summary: {}, timestamp: 0,
      }],
    };
    const { spy } = makeSpy(listResult);
    const output = await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false, list: true })
    );
    // Table output should contain both values
    assert.ok(output.includes("56.00") || output.includes("55.00"), `output: ${output}`);
  });

  it("without --list renders only the latest (kv) value", async () => {
    const { spy } = makeSpy();
    const output = await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false, list: false })
    );
    assert.ok(output.includes("55.00"), `output: ${output}`);
  });

  it("parses comma-separated params string into number array", async () => {
    const { spy, captured } = makeSpy(resultFor("MA"));
    await captureStdout(() =>
      cmdMarketIndicator(spy, "ma", "BTC-USDT", { json: false, params: "5,20" })
    );
    assert.deepEqual(captured.args["params"], [5, 20]);
  });

  it("does not inject defaults itself: omitted/empty --params reach core as undefined", async () => {
    for (const params of [undefined, ""]) {
      const { spy, captured } = makeSpy();
      await captureStdout(() =>
        cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false, params })
      );
      // core applies the indicator default (shared with MCP); see core indicator tests
      assert.equal(captured.args["params"], undefined);
    }
  });

  it("throws before calling the tool when params contain junk / wrong format", async () => {
    for (const params of ["[20]", "12,,9", "abc", "12,x,9", "1 2"]) {
      const { spy, captured } = makeSpy();
      await assert.rejects(
        () => cmdMarketIndicator(spy, "macd", "BTC-USDT", { json: false, params }),
        /Invalid --params.*macd requires 3 params \(fast,slow,signal\)\. Default: 12,26,9\. Example: params \[12,26,9\]/s,
        params,
      );
      assert.equal(captured.tool, "", `tool must not run for params=${params}`);
    }
  });

  it("format errors carry the signature and default of the indicator that was asked for (not always macd)", async () => {
    const cases: Array<[string, string, RegExp, RegExp]> = [
      ["rsi", "14,x", /rsi requires one or more periods.*Default: 14\./s, /12,26,9/],
      ["supertrend", "3,x", /supertrend requires 2 params \(factor,atrPeriod\)\. Default: 3,10\./, /12,26,9/],
      ["boll", "20,x", /bb requires 2 params \(period,multiplier\)\. Default: 20,2\./, /12,26,9/],
      ["envelope", "20,x", /envelope requires 2 params \(period,percent\)\. Default: 20,2\./, /12,26,9/],
    ];
    for (const [indicator, params, expected, forbidden] of cases) {
      const { spy, captured } = makeSpy();
      await assert.rejects(
        () => cmdMarketIndicator(spy, indicator, "BTC-USDT", { json: false, params }),
        (err) => expected.test((err as Error).message) && !forbidden.test((err as Error).message),
        indicator,
      );
      assert.equal(captured.tool, "", `${indicator}: the tool must not run`);
    }
  });

  it("an indicator without a params contract gets a neutral format hint (no macd example)", async () => {
    const { spy } = makeSpy();
    await assert.rejects(
      () => cmdMarketIndicator(spy, "obv", "BTC-USDT", { json: false, params: "x" }),
      (err) => /expected comma-separated numbers/.test((err as Error).message) && !/12,26,9|requires/.test((err as Error).message),
    );
  });

  it("names the offending token in the error", async () => {
    const { spy } = makeSpy();
    await assert.rejects(
      () => cmdMarketIndicator(spy, "macd", "BTC-USDT", { json: false, params: "12,x,9" }),
      /"x"/,
    );
  });

  it("passes a negative first value through to the tool (validation is done in core)", async () => {
    const { spy, captured } = makeSpy(resultFor("MACD"));
    await captureStdout(() =>
      cmdMarketIndicator(spy, "macd", "BTC-USDT", { json: false, params: "-9,3,3" })
    );
    assert.deepEqual(captured.args["params"], [-9, 3, 3]);
  });

  it("routes --params from v.params (not positional args)", async () => {
    const { spy, captured } = makeSpy(resultFor("MACD"));
    await captureStdout(() =>
      handleMarketPublicCommand(spy, "indicator", ["macd", "BTC-USDT"], vals({ params: "12,26,9" }), false)
    );
    assert.deepEqual(captured.args["params"], [12, 26, 9]);
  });

  it("errors when explicit --params yield no values on any timeframe", async () => {
    const empty = {
      ...MOCK_INDICATOR_RESULT,
      data: [{ data: [{ instId: "BTC-USDT", timeframes: { "1H": { indicators: { RSI: [] } } } }], mode: "live", summary: {}, timestamp: 0 }],
    };
    const { spy } = makeSpy(empty);
    await assert.rejects(
      () => cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false, params: "5000" }),
      /No values returned for rsi with params \[5000\].*available candles/s,
    );
  });

  it("keeps the soft hint when params were omitted and nothing was returned", async () => {
    const empty = {
      ...MOCK_INDICATOR_RESULT,
      data: [{ data: [{ instId: "BTC-USDT", timeframes: { "1H": { indicators: { OBV: [] } } } }], mode: "live", summary: {}, timestamp: 0 }],
    };
    const { spy } = makeSpy(empty);
    const out = await captureStdout(() => cmdMarketIndicator(spy, "obv", "BTC-USDT", { json: false }));
    assert.match(out, /No indicator values returned/);
  });

  it("prints the applied params line (default) in table mode", async () => {
    const withApplied = { ...MOCK_INDICATOR_RESULT, appliedParams: [14], paramsSource: "default" };
    const { spy } = makeSpy(withApplied);
    const out = await captureStdout(() => cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false }));
    assert.match(out, /params: 14 \(default\)/);
  });

  it("prints the applied params line (explicit) in table mode", async () => {
    const withApplied = { ...resultFor("MA"), appliedParams: [5, 20], paramsSource: "explicit" };
    const { spy } = makeSpy(withApplied);
    const out = await captureStdout(() => cmdMarketIndicator(spy, "ma", "BTC-USDT", { json: false, params: "5,20" }));
    assert.match(out, /params: 5,20 \(explicit\)/);
  });

  it("--json prints only the backend data (no applied params line)", async () => {
    const withApplied = { ...MOCK_INDICATOR_RESULT, appliedParams: [14], paramsSource: "default" };
    const { spy } = makeSpy(withApplied);
    const out = await captureStdout(() => cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: true }));
    assert.doesNotMatch(out, /appliedParams|params: /);
    assert.deepEqual(JSON.parse(out), MOCK_INDICATOR_RESULT.data);
  });

  it("prints no params line when the tool result carries no appliedParams (e.g. indicators without a params contract)", async () => {
    const { spy } = makeSpy(resultFor("OBV"));
    const out = await captureStdout(() => cmdMarketIndicator(spy, "obv", "BTC-USDT", { json: false }));
    assert.doesNotMatch(out, /params: /);
  });

  it("explicit --params with an empty outer response or a response without timeframes also fails (table mode)", async () => {
    for (const data of [[], [{ data: [{ instId: "BTC-USDT" }] }]]) {
      const { spy } = makeSpy({ ...MOCK_INDICATOR_RESULT, data });
      await assert.rejects(
        () => cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false, params: "14" }),
        /No values returned for rsi with params \[14\]/,
      );
    }
  });

  it("without --params the same abnormal responses keep the master output", async () => {
    const empty = makeSpy({ ...MOCK_INDICATOR_RESULT, data: [] });
    assert.match(await captureStdout(() => cmdMarketIndicator(empty.spy, "rsi", "BTC-USDT", { json: false })), /No data/);
    const noTf = makeSpy({ ...MOCK_INDICATOR_RESULT, data: [{ data: [{ instId: "BTC-USDT" }] }] });
    assert.match(await captureStdout(() => cmdMarketIndicator(noTf.spy, "rsi", "BTC-USDT", { json: false })), /instId/);
  });

  it("--json is unchanged: explicit --params with no values still prints the data and does not throw", async () => {
    const { spy } = makeSpy({ ...MOCK_INDICATOR_RESULT, data: [] });
    const out = await captureStdout(() => cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: true, params: "14" }));
    assert.deepEqual(JSON.parse(out), []);
  });

  it("rejects a numeric token that overflows to Infinity", async () => {
    const { spy, captured } = makeSpy();
    await assert.rejects(
      () => cmdMarketIndicator(spy, "obv", "BTC-USDT", { json: false, params: "9".repeat(400) }),
      /not a finite number/,
    );
    assert.equal(captured.tool, "");
  });

  it("uses a different hint when a default was applied and nothing came back", async () => {
    const emptyDefault = {
      ...MOCK_INDICATOR_RESULT,
      appliedParams: [14],
      paramsSource: "default",
      data: [{ data: [{ instId: "BTC-USDT", timeframes: { "1H": { indicators: { RSI: [] } } } }], mode: "live", summary: {}, timestamp: 0 }],
    };
    const { spy } = makeSpy(emptyDefault);
    const out = await captureStdout(() => cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false }));
    assert.match(out, /params: 14 \(default\)/);
    assert.match(out, /for the default params; there may not be enough candles/);
    assert.doesNotMatch(out, /try --params/);
  });

  it("skips timeframes with empty indicator values", async () => {
    const emptyValuesResult = {
      ...MOCK_INDICATOR_RESULT,
      data: [{
        data: [{
          instId: "BTC-USDT",
          timeframes: {
            "1H": {
              indicators: { RSI: [] },
            },
          },
        }],
        mode: "live", summary: {}, timestamp: 0,
      }],
    };
    const { spy } = makeSpy(emptyValuesResult);
    const output = await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false })
    );
    // Plan A: the hint must be printed (command must never be silent).
    assert.ok(output.includes("No indicator values returned"), "Plan A hint must be emitted for empty indicator values");
    assert.ok(!output.includes("RSI"), "header line must not appear when all timeframe values are empty");
  });

  it("passes backtestTime to tool call", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false, backtestTime: 1700000000000 })
    );
    assert.equal(captured.args["backtestTime"], 1700000000000);
  });

  it("uses boll->BB override in output header", async () => {
    const bbResult = {
      ...MOCK_INDICATOR_RESULT,
      data: [{
        data: [{
          instId: "BTC-USDT",
          timeframes: {
            "1H": {
              indicators: {
                BB: [{ ts: "1700000000000", values: { upper: "50000", mid: "48000", lower: "46000" } }],
              },
            },
          },
        }],
        mode: "live", summary: {}, timestamp: 0,
      }],
    };
    const { spy } = makeSpy(bbResult);
    const output = await captureStdout(() =>
      cmdMarketIndicator(spy, "boll", "BTC-USDT", { json: false })
    );
    assert.ok(output.includes("BB"), `output: ${output}`);
  });
});
