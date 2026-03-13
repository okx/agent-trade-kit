import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdSpotAlgoTrailPlace } from "../src/commands/spot.js";

function muteStdout(fn: () => Promise<void>): Promise<void> {
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: typeof process.stdout.write }).write = () => true;
  return fn().finally(() => {
    process.stdout.write = orig;
  });
}

const fakeAlgoResult = {
  endpoint: "POST /api/v5/trade/order-algo",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "789012", sCode: "0" }],
};

// ---------------------------------------------------------------------------
// cmdSpotAlgoTrailPlace — trailing stop passthrough
// ---------------------------------------------------------------------------
describe("cmdSpotAlgoTrailPlace", () => {
  it("calls spot_place_algo_order with ordType=move_order_stop and callbackRatio", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await muteStdout(() =>
      cmdSpotAlgoTrailPlace(runner, {
        instId: "BTC-USDT",
        side: "sell",
        sz: "0.001",
        callbackRatio: "0.01",
        json: false,
      }),
    );

    assert.ok(capturedTool, "runner should have been called");
    assert.equal(capturedTool, "spot_place_algo_order");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["ordType"], "move_order_stop");
    assert.equal(capturedParams!["side"], "sell");
    assert.equal(capturedParams!["sz"], "0.001");
    assert.equal(capturedParams!["callbackRatio"], "0.01");
    assert.equal(capturedParams!["tdMode"], "cash");
  });

  it("calls spot_place_algo_order with callbackSpread instead of callbackRatio", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await muteStdout(() =>
      cmdSpotAlgoTrailPlace(runner, {
        instId: "ETH-USDT",
        side: "sell",
        sz: "0.1",
        callbackSpread: "50",
        activePx: "3000",
        json: false,
      }),
    );

    assert.ok(capturedParams, "runner should have been called");
    assert.equal(capturedParams!["ordType"], "move_order_stop");
    assert.equal(capturedParams!["callbackSpread"], "50");
    assert.equal(capturedParams!["activePx"], "3000");
    assert.equal(capturedParams!["callbackRatio"], undefined);
  });

  it("uses custom tdMode when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await muteStdout(() =>
      cmdSpotAlgoTrailPlace(runner, {
        instId: "BTC-USDT",
        side: "sell",
        sz: "0.001",
        callbackRatio: "0.02",
        tdMode: "cross",
        json: false,
      }),
    );

    assert.ok(capturedParams, "runner should have been called");
    assert.equal(capturedParams!["tdMode"], "cross");
  });

  it("outputs trailing stop placed message with algoId", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;

    const chunks: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as { write: typeof process.stdout.write }).write = (chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    };

    try {
      await cmdSpotAlgoTrailPlace(runner, {
        instId: "BTC-USDT",
        side: "sell",
        sz: "0.001",
        callbackRatio: "0.01",
        json: false,
      });
    } finally {
      process.stdout.write = orig;
    }

    const output = chunks.join("");
    assert.ok(output.includes("789012"), "output should contain algoId");
    assert.ok(output.includes("OK"), "output should indicate success");
  });
});
