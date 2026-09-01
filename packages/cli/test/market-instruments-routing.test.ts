/**
 * Routing tests for market instruments conditional params (issue ALGO-45742).
 *
 * Root cause: handleMarketPublicCommand called cmdMarketInstruments without
 * forwarding --uly, --instFamily, --seriesId, causing HTTP 400 from OKX for
 * OPTION and EVENTS instTypes.
 *
 * Pattern: spy ToolRunner captures the args passed to market_get_instruments;
 * assert each named flag reaches the tool invocation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { handleMarketPublicCommand } from "../src/index.js";
import type { CliValues } from "../src/index.js";

function vals(overrides: Partial<Record<string, unknown>> = {}): CliValues {
  return overrides as CliValues;
}

type SpyCaptured = { tool: string; args: Record<string, unknown> }[];

function spyRunner(captured: SpyCaptured): ToolRunner {
  return async (tool: string, args: Record<string, unknown>) => {
    captured.push({ tool, args });
    return { endpoint: "", requestTime: "", data: [] };
  };
}

describe("market instruments routing — conditional params forwarded", () => {
  it("--uly BTC-USD is forwarded for OPTION instType", async () => {
    const captured: SpyCaptured = [];
    await handleMarketPublicCommand(
      spyRunner(captured),
      "instruments",
      [],
      vals({ instType: "OPTION", uly: "BTC-USD" }),
      false,
    );
    assert.equal(captured.length, 1, "runner must be called exactly once");
    assert.equal(captured[0].tool, "market_get_instruments");
    assert.equal(captured[0].args["uly"], "BTC-USD", "--uly must be forwarded");
  });

  it("--instFamily BTC-USD is forwarded for OPTION instType", async () => {
    const captured: SpyCaptured = [];
    await handleMarketPublicCommand(
      spyRunner(captured),
      "instruments",
      [],
      vals({ instType: "OPTION", instFamily: "BTC-USD" }),
      false,
    );
    assert.equal(captured.length, 1);
    assert.equal(captured[0].tool, "market_get_instruments");
    assert.equal(captured[0].args["instFamily"], "BTC-USD", "--instFamily must be forwarded");
  });

  it("--seriesId BTC-ABOVE-DAILY is forwarded for EVENTS instType", async () => {
    const captured: SpyCaptured = [];
    await handleMarketPublicCommand(
      spyRunner(captured),
      "instruments",
      [],
      vals({ instType: "EVENTS", seriesId: "BTC-ABOVE-DAILY" }),
      false,
    );
    assert.equal(captured.length, 1);
    assert.equal(captured[0].tool, "market_get_instruments");
    assert.equal(captured[0].args["seriesId"], "BTC-ABOVE-DAILY", "--seriesId must be forwarded");
  });

  it("SPOT with no conditional params passes undefined for uly/instFamily/seriesId", async () => {
    const captured: SpyCaptured = [];
    await handleMarketPublicCommand(
      spyRunner(captured),
      "instruments",
      [],
      vals({ instType: "SPOT" }),
      false,
    );
    assert.equal(captured.length, 1);
    assert.equal(captured[0].tool, "market_get_instruments");
    assert.equal(captured[0].args["uly"], undefined, "uly must be undefined for SPOT");
    assert.equal(captured[0].args["instFamily"], undefined, "instFamily must be undefined for SPOT");
    assert.equal(captured[0].args["seriesId"], undefined, "seriesId must be undefined for SPOT");
  });
});
