import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdSpotPlace } from "../src/commands/spot.js";
import { cmdSwapPlace } from "../src/commands/swap.js";
import { cmdFuturesPlace } from "../src/commands/futures.js";
import { setOutput, resetOutput } from "../src/formatter.js";

beforeEach(() => setOutput({ out: () => {}, err: () => {} }));
afterEach(() => resetOutput());

const fakeResult = {
  endpoint: "POST /api/v5/trade/order",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "123456", sCode: "0" }],
};

// ---------------------------------------------------------------------------
// cmdSpotPlace — TP/SL passthrough
// ---------------------------------------------------------------------------
describe("cmdSpotPlace TP/SL passthrough", () => {
  it("passes TP/SL params to core when provided", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      captured = params as Record<string, unknown>;
      return fakeResult;
    };

    await cmdSpotPlace(runner, {
      instId: "BTC-USDT",
      side: "buy",
      ordType: "market",
      sz: "0.001",
      tpTriggerPx: "105000",
      tpOrdPx: "-1",
      slTriggerPx: "95000",
      slOrdPx: "-1",
      json: false,
    });

    assert.ok(captured, "runner should have been called");
    assert.equal(captured!["tpTriggerPx"], "105000");
    assert.equal(captured!["tpOrdPx"], "-1");
    assert.equal(captured!["slTriggerPx"], "95000");
    assert.equal(captured!["slOrdPx"], "-1");
  });

  it("does not pass TP/SL params when omitted", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      captured = params as Record<string, unknown>;
      return fakeResult;
    };

    await cmdSpotPlace(runner, {
      instId: "BTC-USDT",
      side: "buy",
      ordType: "market",
      sz: "0.001",
      json: false,
    });

    assert.ok(captured, "runner should have been called");
    assert.equal(captured!["tpTriggerPx"], undefined);
    assert.equal(captured!["tpOrdPx"], undefined);
    assert.equal(captured!["slTriggerPx"], undefined);
    assert.equal(captured!["slOrdPx"], undefined);
  });
});

// ---------------------------------------------------------------------------
// cmdSwapPlace — TP/SL passthrough
// ---------------------------------------------------------------------------
describe("cmdSwapPlace TP/SL passthrough", () => {
  it("passes TP/SL params to core when provided", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      captured = params as Record<string, unknown>;
      return fakeResult;
    };

    await cmdSwapPlace(runner, {
      instId: "BTC-USDT-SWAP",
      side: "buy",
      ordType: "market",
      sz: "1",
      tdMode: "cross",
      tpTriggerPx: "70000",
      tpOrdPx: "-1",
      slTriggerPx: "60000",
      slOrdPx: "-1",
      json: false,
    });

    assert.ok(captured, "runner should have been called");
    assert.equal(captured!["tpTriggerPx"], "70000");
    assert.equal(captured!["tpOrdPx"], "-1");
    assert.equal(captured!["slTriggerPx"], "60000");
    assert.equal(captured!["slOrdPx"], "-1");
  });

  it("does not pass TP/SL params when omitted", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      captured = params as Record<string, unknown>;
      return fakeResult;
    };

    await cmdSwapPlace(runner, {
      instId: "BTC-USDT-SWAP",
      side: "buy",
      ordType: "market",
      sz: "1",
      tdMode: "cross",
      json: false,
    });

    assert.ok(captured, "runner should have been called");
    assert.equal(captured!["tpTriggerPx"], undefined);
    assert.equal(captured!["tpOrdPx"], undefined);
    assert.equal(captured!["slTriggerPx"], undefined);
    assert.equal(captured!["slOrdPx"], undefined);
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesPlace — TP/SL passthrough
// ---------------------------------------------------------------------------
describe("cmdFuturesPlace TP/SL passthrough", () => {
  it("passes TP/SL params to core when provided", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      captured = params as Record<string, unknown>;
      return fakeResult;
    };

    await cmdFuturesPlace(runner, {
      instId: "BTC-USD-250328",
      side: "buy",
      ordType: "market",
      sz: "1",
      tdMode: "cross",
      tpTriggerPx: "110000",
      tpOrdPx: "-1",
      slTriggerPx: "90000",
      slOrdPx: "-1",
      json: false,
    });

    assert.ok(captured, "runner should have been called");
    assert.equal(captured!["tpTriggerPx"], "110000");
    assert.equal(captured!["tpOrdPx"], "-1");
    assert.equal(captured!["slTriggerPx"], "90000");
    assert.equal(captured!["slOrdPx"], "-1");
  });

  it("does not pass TP/SL params when omitted", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      captured = params as Record<string, unknown>;
      return fakeResult;
    };

    await cmdFuturesPlace(runner, {
      instId: "BTC-USD-250328",
      side: "buy",
      ordType: "market",
      sz: "1",
      tdMode: "cross",
      json: false,
    });

    assert.ok(captured, "runner should have been called");
    assert.equal(captured!["tpTriggerPx"], undefined);
    assert.equal(captured!["tpOrdPx"], undefined);
    assert.equal(captured!["slTriggerPx"], undefined);
    assert.equal(captured!["slOrdPx"], undefined);
  });

  it("passes TP-only without SL", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      captured = params as Record<string, unknown>;
      return fakeResult;
    };

    await cmdFuturesPlace(runner, {
      instId: "BTC-USD-250328",
      side: "buy",
      ordType: "market",
      sz: "1",
      tdMode: "cross",
      tpTriggerPx: "110000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.ok(captured, "runner should have been called");
    assert.equal(captured!["tpTriggerPx"], "110000");
    assert.equal(captured!["tpOrdPx"], "-1");
    assert.equal(captured!["slTriggerPx"], undefined);
    assert.equal(captured!["slOrdPx"], undefined);
  });
});
