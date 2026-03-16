import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdFuturesAlgoTrailPlace } from "../src/commands/futures.js";

function muteStdout(fn: () => Promise<void>): Promise<void> {
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: typeof process.stdout.write }).write = () => true;
  return fn().finally(() => {
    process.stdout.write = orig;
  });
}

function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: typeof process.stdout.write }).write = (chunk) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  return fn().finally(() => {
    process.stdout.write = orig;
  }).then(() => chunks.join(""));
}

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

    await muteStdout(() =>
      cmdFuturesAlgoTrailPlace(runner, {
        instId: "BTC-USD-250328",
        side: "sell",
        sz: "1",
        callbackRatio: "0.01",
        tdMode: "cross",
        json: false,
      }),
    );

    assert.ok(capturedTool, "runner should have been called");
    assert.equal(capturedTool, "futures_place_move_stop_order");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["tdMode"], "cross");
    assert.equal(capturedParams!["side"], "sell");
    assert.equal(capturedParams!["sz"], "1");
    assert.equal(capturedParams!["callbackRatio"], "0.01");
    // mutual exclusivity: when callbackRatio is given, callbackSpread should not be set
    assert.equal(capturedParams!["callbackSpread"], undefined);
    // activePx is optional: should not be set when not provided
    assert.equal(capturedParams!["activePx"], undefined);
  });

  it("passes callbackSpread and activePx instead of callbackRatio", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await muteStdout(() =>
      cmdFuturesAlgoTrailPlace(runner, {
        instId: "BTC-USD-250328",
        side: "buy",
        sz: "1",
        callbackSpread: "100",
        activePx: "50000",
        posSide: "long",
        tdMode: "isolated",
        json: false,
      }),
    );

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

    await muteStdout(() =>
      cmdFuturesAlgoTrailPlace(runner, {
        instId: "ETH-USD-250328",
        side: "sell",
        sz: "2",
        callbackRatio: "0.02",
        tdMode: "cross",
        reduceOnly: true,
        json: false,
      }),
    );

    assert.ok(capturedParams, "runner should have been called");
    assert.equal(capturedParams!["reduceOnly"], true);
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    const output = await captureStdout(() =>
      cmdFuturesAlgoTrailPlace(runner, {
        instId: "BTC-USD-250328",
        side: "sell",
        sz: "1",
        callbackRatio: "0.01",
        tdMode: "cross",
        json: true,
      }),
    );
    assert.doesNotThrow(() => JSON.parse(output), "output should be valid JSON");
  });

  it("outputs trailing stop placed message with algoId", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    const output = await captureStdout(() =>
      cmdFuturesAlgoTrailPlace(runner, {
        instId: "BTC-USD-250328",
        side: "sell",
        sz: "1",
        callbackRatio: "0.01",
        tdMode: "cross",
        json: false,
      }),
    );
    assert.ok(output.includes("987654"), "output should contain algoId");
    assert.ok(output.includes("OK"), "output should indicate success");
  });
});
