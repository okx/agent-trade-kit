/**
 * CLI routing tests for --ai-builder-code flag (ALGO-44006).
 * Verifies that aiBuilderCode is correctly passed from --ai-builder-code CLI
 * flag to the underlying ToolRunner for all order-placement paths.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  handleSpotCommand,
  handleSpotAlgoCommand,
  handleSwapCommand,
  handleSwapAlgoCommand,
  handleFuturesCommand,
  handleFuturesAlgoCommand,
  handleOptionCommand,
  handleOptionAlgoCommand,
  handleBotGridCommand,
} from "../src/index.js";
import type { CliValues } from "../src/index.js";
import { setOutput, resetOutput } from "../src/formatter.js";

beforeEach(() => setOutput({ out: () => {}, err: () => {} }));
afterEach(() => {
  resetOutput();
  process.exitCode = 0;
});

const fakePlaceResult = {
  endpoint: "POST /api/v5/trade/order",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "789", sCode: "0", sMsg: "" }],
};

const fakeAlgoResult = {
  endpoint: "POST /api/v5/trade/order-algo",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "456", sCode: "0", sMsg: "" }],
};

const fakeBotResult = {
  endpoint: "POST /api/v5/tradingBot/grid/order-algo",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "999", sCode: "0", sMsg: "" }],
};

function makeSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    if ((tool as string).includes("algo")) return fakeAlgoResult;
    if ((tool as string).includes("grid")) return fakeBotResult;
    return fakePlaceResult;
  };
  return { spy, captured };
}

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

// ===========================================================================
// spot place-order
// ===========================================================================

describe("handleSpotCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when --ai-builder-code provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USDT", side: "buy", ordType: "market", sz: "0.01", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("place: aiBuilderCode is undefined when flag not provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USDT", side: "buy", ordType: "market", sz: "0.01" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], undefined);
  });
});

// ===========================================================================
// spot algo place-order
// ===========================================================================

describe("handleSpotAlgoCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotAlgoCommand(
      spy,
      "place",
      vals({ instId: "BTC-USDT", side: "sell", ordType: "conditional", sz: "0.01", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// swap place-order
// ===========================================================================

describe("handleSwapCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when --ai-builder-code provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USDT-SWAP", side: "buy", ordType: "market", sz: "1", tdMode: "cross", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// swap algo place-order
// ===========================================================================

describe("handleSwapAlgoCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapAlgoCommand(
      spy,
      "place",
      vals({
        instId: "BTC-USDT-SWAP",
        side: "sell",
        ordType: "conditional",
        sz: "1",
        tdMode: "cross",
        aiBuilderCode: "MYBOT",
      }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// futures place-order
// ===========================================================================

describe("handleFuturesCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USDT-240329", side: "buy", ordType: "market", sz: "1", tdMode: "cross", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// futures algo place-order
// ===========================================================================

describe("handleFuturesAlgoCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesAlgoCommand(
      spy,
      "place",
      vals({
        instId: "BTC-USDT-240329",
        side: "sell",
        ordType: "conditional",
        sz: "1",
        tdMode: "cross",
        aiBuilderCode: "MYBOT",
      }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// option place-order
// ===========================================================================

describe("handleOptionCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleOptionCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USD-240329-50000-C", side: "buy", ordType: "limit", sz: "1", px: "500", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// option algo place-order
// ===========================================================================

describe("handleOptionAlgoCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleOptionAlgoCommand(
      spy,
      "place",
      vals({
        instId: "BTC-USD-240329-50000-C",
        side: "buy",
        ordType: "conditional",
        sz: "1",
        aiBuilderCode: "MYBOT",
      }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// bot grid create
// ===========================================================================

describe("handleBotGridCommand - aiBuilderCode routing", () => {
  it("create: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleBotGridCommand(
      spy,
      vals({
        instId: "BTC-USDT",
        algoOrdType: "grid",
        maxPx: "70000",
        minPx: "60000",
        gridNum: "10",
        quoteSz: "1000",
        aiBuilderCode: "MYBOT",
      }),
      ["create"],
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});
