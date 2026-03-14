/**
 * Tests for cmdSwapAlgoCancel — verifies that args are wrapped in an orders array.
 * Covers the fix for issue #76: flat { instId, algoId } was passed instead of
 * { orders: [{ instId, algoId }] }, causing "orders must be a non-empty array."
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdSwapAlgoCancel } from "../src/commands/swap.js";

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
  return fn()
    .finally(() => {
      process.stdout.write = orig;
    })
    .then(() => chunks.join(""));
}

const fakeCancelResult = {
  endpoint: "POST /api/v5/trade/cancel-algos",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "12345", sCode: "0" }],
};

describe("cmdSwapAlgoCancel — orders array format", () => {
  it("passes orders array with { instId, algoId } to swap_cancel_algo_orders", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;

    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeCancelResult;
    };

    await muteStdout(() =>
      cmdSwapAlgoCancel(runner, "BTC-USDT-SWAP", "12345", false),
    );

    assert.equal(capturedTool, "swap_cancel_algo_orders");
    assert.ok(
      Array.isArray(capturedParams!["orders"]),
      "orders should be an array",
    );
    const orders = capturedParams!["orders"] as Record<string, unknown>[];
    assert.equal(orders.length, 1);
    assert.equal(orders[0]!["instId"], "BTC-USDT-SWAP");
    assert.equal(orders[0]!["algoId"], "12345");
  });

  it("does not pass flat instId/algoId at top level", async () => {
    let capturedParams: Record<string, unknown> | undefined;

    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeCancelResult;
    };

    await muteStdout(() =>
      cmdSwapAlgoCancel(runner, "ETH-USDT-SWAP", "67890", false),
    );

    assert.equal(
      capturedParams!["instId"],
      undefined,
      "instId should not be at top level",
    );
    assert.equal(
      capturedParams!["algoId"],
      undefined,
      "algoId should not be at top level",
    );
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeCancelResult;
    const output = await captureStdout(() =>
      cmdSwapAlgoCancel(runner, "BTC-USDT-SWAP", "12345", true),
    );
    assert.doesNotThrow(() => JSON.parse(output), "output should be valid JSON");
  });

  it("outputs cancel confirmation with algoId when json=false", async () => {
    const runner: ToolRunner = async () => fakeCancelResult;
    const output = await captureStdout(() =>
      cmdSwapAlgoCancel(runner, "BTC-USDT-SWAP", "12345", false),
    );
    assert.ok(output.includes("12345"), "output should contain algoId");
    assert.ok(output.includes("OK"), "output should indicate success");
  });
});
