/**
 * Tests for trailing stop param passthrough in cmdXxxAlgoPlace functions.
 * Covers the fix for issue #74: callbackRatio/callbackSpread/activePx were
 * silently dropped when ordType=move_order_stop was used via algo place.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdSpotAlgoPlace } from "../src/commands/spot.js";
import { cmdSwapAlgoPlace } from "../src/commands/swap.js";
import { cmdFuturesAlgoPlace } from "../src/commands/futures.js";
import { cmdOptionAlgoPlace } from "../src/commands/option.js";
import { setOutput, resetOutput } from "../src/formatter.js";

beforeEach(() => setOutput({ out: () => {}, err: () => {} }));
afterEach(() => resetOutput());

const fakeAlgoResult = {
  endpoint: "POST /api/v5/trade/order-algo",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "123456", sCode: "0" }],
};

// ---------------------------------------------------------------------------
// cmdSpotAlgoPlace
// ---------------------------------------------------------------------------
describe("cmdSpotAlgoPlace — trailing stop params passthrough", () => {
  it("passes callbackRatio and activePx when ordType=move_order_stop", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSpotAlgoPlace(runner, {
      instId: "BTC-USDT",
      side: "sell",
      ordType: "move_order_stop",
      sz: "0.01",
      callbackRatio: "0.05",
      activePx: "100000",
      json: false,
    });

    assert.equal(capturedTool, "spot_place_algo_order");
    assert.equal(capturedParams!["callbackRatio"], "0.05");
    assert.equal(capturedParams!["activePx"], "100000");
    assert.equal(capturedParams!["callbackSpread"], undefined);
  });

  it("passes callbackSpread when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSpotAlgoPlace(runner, {
      instId: "BTC-USDT",
      side: "sell",
      ordType: "move_order_stop",
      sz: "0.01",
      callbackSpread: "500",
      json: false,
    });

    assert.equal(capturedParams!["callbackSpread"], "500");
    assert.equal(capturedParams!["callbackRatio"], undefined);
    assert.equal(capturedParams!["activePx"], undefined);
  });

  it("does not pass trailing stop params for conditional ordType (no regression)", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSpotAlgoPlace(runner, {
      instId: "BTC-USDT",
      side: "buy",
      ordType: "conditional",
      sz: "0.01",
      tpTriggerPx: "90000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tpTriggerPx"], "90000");
    assert.equal(capturedParams!["tpOrdPx"], "-1");
    assert.equal(capturedParams!["callbackRatio"], undefined);
    assert.equal(capturedParams!["callbackSpread"], undefined);
    assert.equal(capturedParams!["activePx"], undefined);
  });
});

// ---------------------------------------------------------------------------
// cmdSwapAlgoPlace
// ---------------------------------------------------------------------------
describe("cmdSwapAlgoPlace — trailing stop params passthrough", () => {
  it("passes callbackRatio and activePx when ordType=move_order_stop", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSwapAlgoPlace(runner, {
      instId: "BTC-USDT-SWAP",
      side: "sell",
      ordType: "move_order_stop",
      sz: "1",
      tdMode: "cross",
      callbackRatio: "0.01",
      activePx: "100000",
      json: false,
    });

    assert.equal(capturedTool, "swap_place_algo_order");
    assert.equal(capturedParams!["callbackRatio"], "0.01");
    assert.equal(capturedParams!["activePx"], "100000");
    assert.equal(capturedParams!["callbackSpread"], undefined);
  });

  it("passes callbackSpread when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSwapAlgoPlace(runner, {
      instId: "BTC-USDT-SWAP",
      side: "sell",
      ordType: "move_order_stop",
      sz: "1",
      tdMode: "cross",
      callbackSpread: "200",
      json: false,
    });

    assert.equal(capturedParams!["callbackSpread"], "200");
    assert.equal(capturedParams!["callbackRatio"], undefined);
    assert.equal(capturedParams!["activePx"], undefined);
  });

  it("does not pass trailing stop params for conditional ordType (no regression)", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSwapAlgoPlace(runner, {
      instId: "BTC-USDT-SWAP",
      side: "buy",
      ordType: "conditional",
      sz: "1",
      tdMode: "cross",
      tpTriggerPx: "100000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tpTriggerPx"], "100000");
    assert.equal(capturedParams!["callbackRatio"], undefined);
    assert.equal(capturedParams!["callbackSpread"], undefined);
    assert.equal(capturedParams!["activePx"], undefined);
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesAlgoPlace
// ---------------------------------------------------------------------------
describe("cmdFuturesAlgoPlace — trailing stop params passthrough", () => {
  it("passes callbackRatio and activePx when ordType=move_order_stop", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdFuturesAlgoPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      ordType: "move_order_stop",
      sz: "1",
      tdMode: "cross",
      callbackRatio: "0.02",
      activePx: "95000",
      json: false,
    });

    assert.equal(capturedTool, "futures_place_algo_order");
    assert.equal(capturedParams!["callbackRatio"], "0.02");
    assert.equal(capturedParams!["activePx"], "95000");
    assert.equal(capturedParams!["callbackSpread"], undefined);
  });

  it("passes callbackSpread when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdFuturesAlgoPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      ordType: "move_order_stop",
      sz: "1",
      tdMode: "cross",
      callbackSpread: "300",
      json: false,
    });

    assert.equal(capturedParams!["callbackSpread"], "300");
    assert.equal(capturedParams!["callbackRatio"], undefined);
    assert.equal(capturedParams!["activePx"], undefined);
  });

  it("does not pass trailing stop params for conditional ordType (no regression)", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdFuturesAlgoPlace(runner, {
      instId: "BTC-USD-250328",
      side: "buy",
      ordType: "conditional",
      sz: "1",
      tdMode: "cross",
      tpTriggerPx: "100000",
      json: false,
    });

    assert.equal(capturedParams!["tpTriggerPx"], "100000");
    assert.equal(capturedParams!["callbackRatio"], undefined);
    assert.equal(capturedParams!["callbackSpread"], undefined);
    assert.equal(capturedParams!["activePx"], undefined);
  });
});

// ---------------------------------------------------------------------------
// tgtCcy passthrough (issue #86)
// ---------------------------------------------------------------------------
describe("cmdSpotAlgoPlace — tgtCcy passthrough", () => {
  it("passes tgtCcy=quote_ccy when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSpotAlgoPlace(runner, {
      instId: "BTC-USDT",
      side: "buy",
      ordType: "conditional",
      sz: "100",
      tgtCcy: "quote_ccy",
      tpTriggerPx: "90000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tgtCcy"], "quote_ccy");
  });

  it("omits tgtCcy when not provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSpotAlgoPlace(runner, {
      instId: "BTC-USDT",
      side: "buy",
      ordType: "conditional",
      sz: "0.01",
      tpTriggerPx: "90000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tgtCcy"], undefined);
  });
});

describe("cmdSwapAlgoPlace — tgtCcy passthrough", () => {
  it("passes tgtCcy=quote_ccy when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSwapAlgoPlace(runner, {
      instId: "BTC-USDT-SWAP",
      side: "sell",
      ordType: "conditional",
      sz: "100",
      tdMode: "cross",
      tgtCcy: "quote_ccy",
      tpTriggerPx: "100000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tgtCcy"], "quote_ccy");
  });

  it("omits tgtCcy when not provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdSwapAlgoPlace(runner, {
      instId: "BTC-USDT-SWAP",
      side: "sell",
      ordType: "conditional",
      sz: "1",
      tdMode: "cross",
      tpTriggerPx: "100000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tgtCcy"], undefined);
  });
});

describe("cmdFuturesAlgoPlace — tgtCcy passthrough", () => {
  it("passes tgtCcy=quote_ccy when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdFuturesAlgoPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      ordType: "conditional",
      sz: "100",
      tdMode: "cross",
      tgtCcy: "quote_ccy",
      tpTriggerPx: "100000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tgtCcy"], "quote_ccy");
  });

  it("omits tgtCcy when not provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdFuturesAlgoPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      ordType: "conditional",
      sz: "1",
      tdMode: "cross",
      tpTriggerPx: "100000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tgtCcy"], undefined);
  });
});

describe("cmdOptionAlgoPlace — tgtCcy conversion (options use resolveQuoteCcySz)", () => {
  it("passes tgtCcy=quote_ccy for conversion in handler", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdOptionAlgoPlace(runner, {
      instId: "BTC-USD-241227-50000-C",
      tdMode: "cross",
      side: "sell",
      ordType: "conditional",
      sz: "1",
      tgtCcy: "quote_ccy",
      tpTriggerPx: "60000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tgtCcy"], "quote_ccy");
  });

  it("omits tgtCcy when not provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await cmdOptionAlgoPlace(runner, {
      instId: "BTC-USD-241227-50000-C",
      tdMode: "cross",
      side: "sell",
      ordType: "conditional",
      sz: "1",
      tpTriggerPx: "60000",
      tpOrdPx: "-1",
      json: false,
    });

    assert.equal(capturedParams!["tgtCcy"], undefined);
  });
});
