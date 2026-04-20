import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdSpotAlgoTrailPlace } from "../src/commands/spot.js";
import { setOutput, resetOutput } from "../src/formatter.js";

let out: string[] = [];
let err: string[] = [];

beforeEach(() => {
  out = []; err = [];
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
});
afterEach(() => resetOutput());

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

    await cmdSpotAlgoTrailPlace(runner, {
      instId: "BTC-USDT",
      side: "sell",
      sz: "0.001",
      callbackRatio: "0.01",
      json: false,
    });

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

    await cmdSpotAlgoTrailPlace(runner, {
      instId: "ETH-USDT",
      side: "sell",
      sz: "0.1",
      callbackSpread: "50",
      activePx: "3000",
      json: false,
    });

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

    await cmdSpotAlgoTrailPlace(runner, {
      instId: "BTC-USDT",
      side: "sell",
      sz: "0.001",
      callbackRatio: "0.02",
      tdMode: "cross",
      json: false,
    });

    assert.ok(capturedParams, "runner should have been called");
    assert.equal(capturedParams!["tdMode"], "cross");
  });

  it("outputs trailing stop placed message with algoId", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;

    await cmdSpotAlgoTrailPlace(runner, {
      instId: "BTC-USDT",
      side: "sell",
      sz: "0.001",
      callbackRatio: "0.01",
      json: false,
    });

    assert.ok(out.join("").includes("789012"), "output should contain algoId");
    assert.ok(out.join("").includes("OK"), "output should indicate success");
  });
});
