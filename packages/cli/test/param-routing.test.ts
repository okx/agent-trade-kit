/**
 * Systematic parameter routing tests for CLI handlers.
 *
 * These tests verify that key parameters (instId, ordId, algoId, side, sz)
 * are correctly routed from CLI flags (v.xxx) to the underlying ToolRunner —
 * NOT from positional args (rest[N]).
 *
 * Background: MR !140 fixed a bug where spot/swap/futures cancel used rest[0]
 * instead of v.instId, which meant --instId flag was silently ignored for 11 days.
 * (See issue #78 / issue #79)
 *
 * NOTE on `rest[0] ?? v.instId` patterns:
 * - handleSwapCommand "positions": uses rest[0] ?? v.instId (line ~482)
 * - handleFuturesCommand "get": uses rest[0] ?? v.instId (line ~748)
 * Tests below verify that when rest=[] and v.instId is provided, v.instId is used.
 */
import { describe, it } from "node:test";
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
} from "../src/index.js";
import type { CliValues } from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureStdout(fn: () => Promise<void> | void): Promise<void> {
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: typeof process.stdout.write }).write = () => true;
  const restore = () => { process.stdout.write = orig; };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(restore, (e) => { restore(); throw e; });
    }
  } catch (e) { restore(); throw e; }
  restore();
  return Promise.resolve();
}

// Fake results matching ToolResult shape used by each cmd
const fakeOrderResult = {
  endpoint: "POST /api/v5/trade/cancel-order",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "123", sCode: "0", sMsg: "" }],
};

const fakeAlgoResult = {
  endpoint: "POST /api/v5/trade/cancel-algos",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "456", sCode: "0", sMsg: "" }],
};

const fakePlaceResult = {
  endpoint: "POST /api/v5/trade/order",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "789", sCode: "0", sMsg: "" }],
};

const fakeOrdersResult = {
  endpoint: "GET /api/v5/trade/orders-pending",
  requestTime: new Date().toISOString(),
  data: [],
};

const fakeFillsResult = {
  endpoint: "GET /api/v5/trade/fills",
  requestTime: new Date().toISOString(),
  data: [],
};

const fakePositionsResult = {
  endpoint: "GET /api/v5/account/positions",
  requestTime: new Date().toISOString(),
  data: [],
};

// Helper: create a spy ToolRunner that captures tool name and args
function makeSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    // Return appropriate result based on tool name pattern
    if (tool.includes("algo")) return fakeAlgoResult;
    if (tool.includes("place") || (tool.includes("order") && !tool.includes("get") && !tool.includes("list"))) return fakePlaceResult;
    if (tool.includes("cancel") || tool.includes("amend")) return fakeOrderResult;
    if (tool.includes("fills")) return fakeFillsResult;
    if (tool.includes("positions")) return fakePositionsResult;
    return fakeOrdersResult;
  };
  return { spy, captured };
}

// Shorthand: build a minimal CliValues with only the fields we care about
function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

// ===========================================================================
// SPOT
// ===========================================================================

describe("handleSpotCommand — parameter routing", () => {
  it("cancel: instId and ordId come from v (not rest)", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotCommand(spy, "cancel", [], vals({ instId: "ETH-USDT", ordId: "123" }), false)
    );
    assert.equal(captured.args["instId"], "ETH-USDT");
    assert.equal(captured.args["ordId"], "123");
  });

  it("amend: instId and ordId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotCommand(spy, "amend", [], vals({ instId: "ETH-USDT", ordId: "111", newPx: "2000" }), false)
    );
    assert.equal(captured.args["instId"], "ETH-USDT");
    assert.equal(captured.args["ordId"], "111");
  });

  it("amend: clOrdId comes from v when ordId absent", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotCommand(spy, "amend", [], vals({ instId: "ETH-USDT", clOrdId: "my-ord", newPx: "2000" }), false)
    );
    assert.equal(captured.args["instId"], "ETH-USDT");
    assert.equal(captured.args["clOrdId"], "my-ord");
  });

  it("place: instId, side, sz come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotCommand(spy, "place", [], vals({ instId: "ETH-USDT", side: "buy", sz: "1", ordType: "market" }), false)
    );
    assert.equal(captured.args["instId"], "ETH-USDT");
    assert.equal(captured.args["side"], "buy");
    assert.equal(captured.args["sz"], "1");
  });

  it("get: instId and ordId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotCommand(spy, "get", [], vals({ instId: "BTC-USDT", ordId: "123" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT");
    assert.equal(captured.args["ordId"], "123");
  });

  it("orders: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotCommand(spy, "orders", [], vals({ instId: "BTC-USDT" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT");
  });

  it("fills: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotCommand(spy, "fills", [], vals({ instId: "BTC-USDT" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT");
  });
});

// ===========================================================================
// SPOT ALGO
// ===========================================================================

describe("handleSpotAlgoCommand — parameter routing", () => {
  it("cancel: instId and algoId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotAlgoCommand(spy, "cancel", vals({ instId: "ETH-USDT", algoId: "456" }), false)
    );
    // cmdSpotAlgoCancel passes { instId, algoId } directly (not wrapped in orders array)
    assert.equal(captured.args["instId"], "ETH-USDT");
    assert.equal(captured.args["algoId"], "456");
  });

  it("amend: instId and algoId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotAlgoCommand(
        spy,
        "amend",
        vals({ instId: "ETH-USDT", algoId: "456", newTpTriggerPx: "3000" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "ETH-USDT");
    assert.equal(captured.args["algoId"], "456");
  });

  it("place: instId, side, sz come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSpotAlgoCommand(
        spy,
        "place",
        vals({ instId: "ETH-USDT", side: "buy", sz: "1", ordType: "conditional" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "ETH-USDT");
    assert.equal(captured.args["side"], "buy");
    assert.equal(captured.args["sz"], "1");
  });
});

// ===========================================================================
// SWAP
// ===========================================================================

describe("handleSwapCommand — parameter routing", () => {
  it("cancel: instId and ordId come from v (not rest)", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapCommand(spy, "cancel", [], vals({ instId: "BTC-USDT-SWAP", ordId: "123" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    assert.equal(captured.args["ordId"], "123");
  });

  it("amend: instId and ordId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapCommand(spy, "amend", [], vals({ instId: "BTC-USDT-SWAP", ordId: "111", newPx: "50000" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    assert.equal(captured.args["ordId"], "111");
  });

  it("amend: clOrdId comes from v when ordId absent", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapCommand(spy, "amend", [], vals({ instId: "BTC-USDT-SWAP", clOrdId: "swap-ord-1", newPx: "50000" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    assert.equal(captured.args["clOrdId"], "swap-ord-1");
  });

  it("place: instId, side, sz come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapCommand(
        spy,
        "place",
        [],
        vals({ instId: "BTC-USDT-SWAP", side: "sell", sz: "0.1", ordType: "market" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    assert.equal(captured.args["side"], "sell");
    assert.equal(captured.args["sz"], "0.1");
  });

  it("get: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapCommand(spy, "get", [], vals({ instId: "BTC-USDT-SWAP", ordId: "123" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
  });

  it("orders: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapCommand(spy, "orders", [], vals({ instId: "BTC-USDT-SWAP" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
  });

  it("fills: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapCommand(spy, "fills", [], vals({ instId: "BTC-USDT-SWAP" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
  });

  // NOTE: positions uses `rest[0] ?? v.instId` — verify fallback to v.instId when rest=[]
  it("positions: instId comes from v when rest is empty", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapCommand(spy, "positions", [], vals({ instId: "BTC-USDT-SWAP" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
  });
});

// ===========================================================================
// SWAP ALGO
// ===========================================================================

describe("handleSwapAlgoCommand — parameter routing", () => {
  it("cancel: instId and algoId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapAlgoCommand(spy, "cancel", vals({ instId: "BTC-USDT-SWAP", algoId: "456" }), false)
    );
    const orders = captured.args["orders"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(orders), "orders should be an array");
    assert.equal(orders[0]!["instId"], "BTC-USDT-SWAP");
    assert.equal(orders[0]!["algoId"], "456");
  });

  it("amend: instId and algoId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapAlgoCommand(
        spy,
        "amend",
        vals({ instId: "BTC-USDT-SWAP", algoId: "456", newTpTriggerPx: "60000" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    assert.equal(captured.args["algoId"], "456");
  });

  it("place: instId, side, sz come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleSwapAlgoCommand(
        spy,
        "place",
        vals({ instId: "BTC-USDT-SWAP", side: "sell", sz: "1", ordType: "conditional" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    assert.equal(captured.args["side"], "sell");
    assert.equal(captured.args["sz"], "1");
  });
});

// ===========================================================================
// FUTURES
// ===========================================================================

describe("handleFuturesCommand — parameter routing", () => {
  it("cancel: instId and ordId come from v (not rest)", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesCommand(spy, "cancel", [], vals({ instId: "BTC-USD-250328", ordId: "123" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328");
    assert.equal(captured.args["ordId"], "123");
  });

  it("amend: instId and ordId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesCommand(spy, "amend", [], vals({ instId: "BTC-USD-250328", ordId: "111", newPx: "50000" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328");
    assert.equal(captured.args["ordId"], "111");
  });

  it("amend: clOrdId comes from v when ordId absent", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesCommand(spy, "amend", [], vals({ instId: "BTC-USD-250328", clOrdId: "fut-ord-1", newPx: "50000" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328");
    assert.equal(captured.args["clOrdId"], "fut-ord-1");
  });

  it("place: instId, side, sz come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesCommand(
        spy,
        "place",
        [],
        vals({ instId: "BTC-USD-250328", side: "buy", sz: "1", ordType: "limit", px: "50000" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328");
    assert.equal(captured.args["side"], "buy");
    assert.equal(captured.args["sz"], "1");
  });

  // NOTE: get uses `rest[0] ?? v.instId` — verify fallback to v.instId when rest=[]
  it("get: instId comes from v when rest is empty", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesCommand(spy, "get", [], vals({ instId: "BTC-USD-250328", ordId: "456" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328");
  });

  it("orders: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesCommand(spy, "orders", [], vals({ instId: "BTC-USD-250328" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328");
  });

  it("fills: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesCommand(spy, "fills", [], vals({ instId: "BTC-USD-250328" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328");
  });
});

// ===========================================================================
// FUTURES ALGO
// ===========================================================================

describe("handleFuturesAlgoCommand — parameter routing", () => {
  it("cancel: instId and algoId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesAlgoCommand(spy, "cancel", vals({ instId: "BTC-USD-250328", algoId: "456" }), false)
    );
    const orders = captured.args["orders"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(orders), "orders should be an array");
    assert.equal(orders[0]!["instId"], "BTC-USD-250328");
    assert.equal(orders[0]!["algoId"], "456");
  });

  it("amend: instId and algoId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesAlgoCommand(
        spy,
        "amend",
        vals({ instId: "BTC-USD-250328", algoId: "456", newTpTriggerPx: "60000" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328");
    assert.equal(captured.args["algoId"], "456");
  });

  it("place: instId, side, sz come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleFuturesAlgoCommand(
        spy,
        "place",
        vals({ instId: "BTC-USD-250328", side: "sell", sz: "1", ordType: "conditional" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328");
    assert.equal(captured.args["side"], "sell");
    assert.equal(captured.args["sz"], "1");
  });
});

// ===========================================================================
// OPTION
// ===========================================================================

describe("handleOptionCommand — parameter routing", () => {
  it("cancel: instId and ordId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionCommand(spy, "cancel", [], vals({ instId: "BTC-USD-250328-50000-C", ordId: "123" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
    assert.equal(captured.args["ordId"], "123");
  });

  it("amend: instId and ordId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionCommand(spy, "amend", [], vals({ instId: "BTC-USD-250328-50000-C", ordId: "111", newPx: "100" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
    assert.equal(captured.args["ordId"], "111");
  });

  it("amend: clOrdId comes from v when ordId absent", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionCommand(spy, "amend", [], vals({ instId: "BTC-USD-250328-50000-C", clOrdId: "opt-ord-1", newPx: "100" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
    assert.equal(captured.args["clOrdId"], "opt-ord-1");
  });

  it("place: instId, side, sz come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionCommand(
        spy,
        "place",
        [],
        vals({ instId: "BTC-USD-250328-50000-C", side: "buy", sz: "1", ordType: "limit", tdMode: "cash", px: "100" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
    assert.equal(captured.args["side"], "buy");
    assert.equal(captured.args["sz"], "1");
  });

  it("get: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionCommand(spy, "get", [], vals({ instId: "BTC-USD-250328-50000-C", ordId: "123" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
  });

  it("orders: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionCommand(spy, "orders", [], vals({ instId: "BTC-USD-250328-50000-C" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
  });

  it("fills: instId comes from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionCommand(spy, "fills", [], vals({ instId: "BTC-USD-250328-50000-C" }), false)
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
  });
});

// ===========================================================================
// OPTION ALGO
// ===========================================================================

describe("handleOptionAlgoCommand — parameter routing", () => {
  it("cancel: instId and algoId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionAlgoCommand(spy, "cancel", vals({ instId: "BTC-USD-250328-50000-C", algoId: "456" }), false)
    );
    // cmdOptionAlgoCancel wraps in orders array: { orders: [{ instId, algoId }] }
    const orders = captured.args["orders"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(orders), "orders should be an array");
    assert.equal(orders[0]!["instId"], "BTC-USD-250328-50000-C");
    assert.equal(orders[0]!["algoId"], "456");
  });

  it("amend: instId and algoId come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionAlgoCommand(
        spy,
        "amend",
        vals({ instId: "BTC-USD-250328-50000-C", algoId: "456", newTpTriggerPx: "200" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
    assert.equal(captured.args["algoId"], "456");
  });

  it("place: instId, side, sz come from v", async () => {
    const { spy, captured } = makeSpy();
    await captureStdout(() =>
      handleOptionAlgoCommand(
        spy,
        "place",
        vals({ instId: "BTC-USD-250328-50000-C", side: "buy", sz: "1", ordType: "conditional", tdMode: "cash" }),
        false
      )
    );
    assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
    assert.equal(captured.args["side"], "buy");
    assert.equal(captured.args["sz"], "1");
  });
});
