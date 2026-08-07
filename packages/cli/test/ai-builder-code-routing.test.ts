/**
 * CLI routing tests for --aiBuilderCode flag (ALGO-44006).
 * Verifies that aiBuilderCode is correctly passed from --aiBuilderCode CLI
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
  handleBotDcaCommand,
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

const fakeBatchResult = {
  endpoint: "POST /api/v5/trade/batch-orders",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "111", sCode: "0", sMsg: "" }],
};

const fakeCloseResult = {
  endpoint: "POST /api/v5/trade/close-position",
  requestTime: new Date().toISOString(),
  data: [{ instId: "BTC-USDT-SWAP", posSide: "long" }],
};

const fakeDcaResult = {
  endpoint: "POST /api/v5/tradingBot/signal/create-signal-bot",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "777", sCode: "0", sMsg: "" }],
};

function makeSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    if ((tool as string).includes("algo")) return fakeAlgoResult;
    if ((tool as string).includes("grid")) return fakeBotResult;
    if ((tool as string).includes("batch")) return fakeBatchResult;
    if ((tool as string).includes("close")) return fakeCloseResult;
    if ((tool as string).includes("dca")) return fakeDcaResult;
    return fakePlaceResult;
  };
  return { spy, captured };
}

function makeErrorSpy(errorMsg: string): ToolRunner {
  return async () => ({ isError: true, error: errorMsg });
}

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

// ===========================================================================
// fail-fast: invalid aiBuilderCode → isError → process.exitCode = 1
// ===========================================================================

describe("handleSpotCommand - invalid aiBuilderCode fail-fast", () => {
  it("place: sets process.exitCode=1 and does not throw when spy returns isError", async () => {
    const errorSpy = makeErrorSpy('aiBuilderCode "bad-code!" is invalid (must be 1–16 alphanumeric chars)');
    await handleSpotCommand(
      errorSpy,
      "place",
      [],
      vals({ instId: "BTC-USDT", side: "buy", ordType: "market", sz: "0.01", aiBuilderCode: "bad-code!" }),
      false,
    );
    assert.equal(process.exitCode, 1);
  });
});

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

// ===========================================================================
// spot batch place
// ===========================================================================

describe("handleSpotCommand batch - aiBuilderCode routing", () => {
  it("batch place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotCommand(
      spy,
      "batch",
      [],
      vals({ action: "place", orders: '[{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"0.01"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("batch place: aiBuilderCode is NOT forwarded on amend", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotCommand(
      spy,
      "batch",
      [],
      vals({ action: "amend", orders: '[{"instId":"BTC-USDT","ordId":"123","newSz":"0.02"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], undefined);
  });
});

// ===========================================================================
// swap batch place
// ===========================================================================

describe("handleSwapCommand batch - aiBuilderCode routing", () => {
  it("batch place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapCommand(
      spy,
      "batch",
      [],
      vals({ action: "place", orders: '[{"instId":"BTC-USDT-SWAP","side":"buy","ordType":"market","sz":"1","tdMode":"cross"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// futures batch place
// ===========================================================================

describe("handleFuturesCommand batch - aiBuilderCode routing", () => {
  it("batch place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesCommand(
      spy,
      "batch",
      [],
      vals({ action: "place", orders: '[{"instId":"BTC-USDT-240329","side":"buy","ordType":"market","sz":"1","tdMode":"cross"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// spot algo trail
// ===========================================================================

describe("handleSpotAlgoCommand trail - aiBuilderCode routing", () => {
  it("trail: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotAlgoCommand(
      spy,
      "trail",
      vals({ instId: "BTC-USDT", side: "sell", sz: "0.01", callbackRatio: "0.05", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("trail: invalid aiBuilderCode sets process.exitCode=1", async () => {
    const errorSpy = makeErrorSpy('aiBuilderCode "bad!" is invalid');
    await handleSpotAlgoCommand(
      errorSpy,
      "trail",
      vals({ instId: "BTC-USDT", side: "sell", sz: "0.01", callbackRatio: "0.05", aiBuilderCode: "bad!" }),
      false,
    );
    assert.equal(process.exitCode, 1);
  });
});

// ===========================================================================
// swap algo trail
// ===========================================================================

describe("handleSwapAlgoCommand trail - aiBuilderCode routing", () => {
  it("trail: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapAlgoCommand(
      spy,
      "trail",
      vals({ instId: "BTC-USDT-SWAP", side: "sell", sz: "1", tdMode: "cross", callbackRatio: "0.05", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// futures algo trail
// ===========================================================================

describe("handleFuturesAlgoCommand trail - aiBuilderCode routing", () => {
  it("trail: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesAlgoCommand(
      spy,
      "trail",
      vals({ instId: "BTC-USDT-240329", side: "sell", sz: "1", tdMode: "cross", callbackRatio: "0.05", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// bot dca create
// ===========================================================================

describe("handleBotDcaCommand create - aiBuilderCode routing", () => {
  it("create: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleBotDcaCommand(
      spy,
      "create",
      vals({
        instId: "BTC-USDT",
        algoOrdType: "dca",
        direction: "long",
        initOrdAmt: "100",
        maxSafetyOrds: "5",
        tpPct: "0.05",
        aiBuilderCode: "MYBOT",
      }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("create: invalid aiBuilderCode sets process.exitCode=1", async () => {
    const errorSpy = makeErrorSpy('aiBuilderCode "bad!" is invalid');
    await handleBotDcaCommand(
      errorSpy,
      "create",
      vals({
        instId: "BTC-USDT",
        algoOrdType: "dca",
        direction: "long",
        initOrdAmt: "100",
        maxSafetyOrds: "5",
        tpPct: "0.05",
        aiBuilderCode: "bad!",
      }),
      false,
    );
    assert.equal(process.exitCode, 1);
  });
});

// ===========================================================================
// swap close
// ===========================================================================

describe("handleSwapCommand close - aiBuilderCode routing", () => {
  it("close: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapCommand(
      spy,
      "close",
      [],
      vals({ instId: "BTC-USDT-SWAP", mgnMode: "cross", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("close: invalid aiBuilderCode sets process.exitCode=1", async () => {
    const errorSpy = makeErrorSpy('aiBuilderCode "bad!" is invalid');
    await handleSwapCommand(
      errorSpy,
      "close",
      [],
      vals({ instId: "BTC-USDT-SWAP", mgnMode: "cross", aiBuilderCode: "bad!" }),
      false,
    );
    assert.equal(process.exitCode, 1);
  });
});

// ===========================================================================
// futures close
// ===========================================================================

describe("handleFuturesCommand close - aiBuilderCode routing", () => {
  it("close: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesCommand(
      spy,
      "close",
      [],
      vals({ instId: "BTC-USDT-240329", mgnMode: "cross", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});
