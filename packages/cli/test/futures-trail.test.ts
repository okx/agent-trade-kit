import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdFuturesAlgoTrailPlace } from "../src/commands/futures.js";
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

beforeEach(() => {
  out = [];
  setOutput({ out: (m) => out.push(m), err: () => {} });
});
afterEach(() => resetOutput());

const fakeAlgoResult = {
  endpoint: "POST /api/v5/trade/order-algo",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "987654", sCode: "0" }],
};

// ---------------------------------------------------------------------------
// cmdFuturesAlgoTrailPlace — trailing stop passthrough
// ---------------------------------------------------------------------------
describe("cmdFuturesAlgoTrailPlace", () => {
  it("calls futures_place_move_stop_order with callbackRatio for futures instId", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdFuturesAlgoTrailPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      sz: "1",
      callbackRatio: "0.01",
      tdMode: "cross",
      json: false,
    });

    assert.ok(capturedTool, "runner should have been called");
    assert.equal(capturedTool, "futures_place_move_stop_order");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["tdMode"], "cross");
    assert.equal(capturedParams!["side"], "sell");
    assert.equal(capturedParams!["sz"], "1");
    assert.equal(capturedParams!["callbackRatio"], "0.01");
    assert.equal(capturedParams!["callbackSpread"], undefined);
    assert.equal(capturedParams!["activePx"], undefined);
  });

  it("passes callbackSpread and activePx instead of callbackRatio", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdFuturesAlgoTrailPlace(runner, {
      instId: "BTC-USD-250328",
      side: "buy",
      sz: "1",
      callbackSpread: "100",
      activePx: "50000",
      posSide: "long",
      tdMode: "isolated",
      json: false,
    });

    assert.ok(capturedParams, "runner should have been called");
    assert.equal(capturedParams!["callbackSpread"], "100");
    assert.equal(capturedParams!["activePx"], "50000");
    assert.equal(capturedParams!["posSide"], "long");
    assert.equal(capturedParams!["tdMode"], "isolated");
    assert.equal(capturedParams!["callbackRatio"], undefined);
  });

  it("passes reduceOnly when set", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdFuturesAlgoTrailPlace(runner, {
      instId: "ETH-USD-250328",
      side: "sell",
      sz: "2",
      callbackRatio: "0.02",
      tdMode: "cross",
      reduceOnly: true,
      json: false,
    });

    assert.ok(capturedParams, "runner should have been called");
    assert.equal(capturedParams!["reduceOnly"], true);
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;

    await cmdFuturesAlgoTrailPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      sz: "1",
      callbackRatio: "0.01",
      tdMode: "cross",
      json: true,
    });

    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("outputs trailing stop placed message with algoId", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;

    await cmdFuturesAlgoTrailPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      sz: "1",
      callbackRatio: "0.01",
      tdMode: "cross",
      json: false,
    });

    assert.ok(out.join("").includes("987654"), "output should contain algoId");
    assert.ok(out.join("").includes("OK"), "output should indicate success");
  });
});
