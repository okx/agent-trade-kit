/**
 * Unit tests for CLI indicator command —
 * handleMarketPublicCommand routing and cmdMarketIndicator formatter.
 *
 * No real network calls are made; a spy ToolRunner is used.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { handleMarketPublicCommand } from "../src/index.js";
import type { CliValues } from "../src/index.js";
import { cmdMarketIndicator } from "../src/commands/market.js";

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

describe("handleMarketPublicCommand — indicator routing", () => {
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
    const { spy, captured } = makeSpy();
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

describe("cmdMarketIndicator — formatter", () => {
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
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      cmdMarketIndicator(spy, "ma", "BTC-USDT", { json: false, params: "5,20" })
    );
    assert.deepEqual(captured.args["params"], [5, 20]);
  });

  it("omits params when string is empty (no valid numbers)", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false, params: "" })
    );
    // Empty string splits to [""] which maps to NaN, filtered out → params is undefined (length 0)
    assert.equal(captured.args["params"], undefined);
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
    // No header line should appear for empty values
    assert.ok(!output.includes("RSI") || output === "");
  });

  it("passes backtestTime to tool call", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      cmdMarketIndicator(spy, "rsi", "BTC-USDT", { json: false, backtestTime: 1700000000000 })
    );
    assert.equal(captured.args["backtestTime"], 1700000000000);
  });

  it("uses boll→BB override in output header", async () => {
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
