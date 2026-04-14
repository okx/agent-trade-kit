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
import {describe, it, beforeEach, afterEach} from "node:test";
import assert from "node:assert/strict";
import type {ToolRunner} from "@agent-tradekit/core";
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
    handleEarnCommand,
    handleMarketCommand,
    handleEventCommand,
} from "../src/index.js";
import type {CliValues} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import {setOutput, resetOutput} from "../src/formatter.js";

beforeEach(() => setOutput({
    out: () => {
    }, err: () => {
    }
}));
afterEach(() => resetOutput());

// Fake results matching ToolResult shape used by each cmd
const fakeOrderResult = {
    endpoint: "POST /api/v5/trade/cancel-order",
    requestTime: new Date().toISOString(),
    data: [{ordId: "123", sCode: "0", sMsg: ""}],
};
const fakeAlgoResult = {
    endpoint: "POST /api/v5/trade/cancel-algos",
    requestTime: new Date().toISOString(),
    data: [{algoId: "456", sCode: "0", sMsg: ""}],
};
const fakePlaceResult = {
    endpoint: "POST /api/v5/trade/order",
    requestTime: new Date().toISOString(),
    data: [{ordId: "789", sCode: "0", sMsg: ""}],
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
    const captured = {tool: "", args: {} as Record<string, unknown>};
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
    return {spy, captured};
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
        const {spy, captured} = makeSpy();
        await handleSpotCommand(spy, "cancel", [], vals({instId: "ETH-USDT", ordId: "123"}), false);
        assert.equal(captured.args["instId"], "ETH-USDT");
        assert.equal(captured.args["ordId"], "123");
    });

    it("cancel: instId falls back to rest[0] when flag absent", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(spy, "cancel", ["ETH-USDT"], vals({ordId: "123"}), false);
        assert.equal(captured.args["instId"], "ETH-USDT");
        assert.equal(captured.args["ordId"], "123");
    });

    it("cancel: --instId flag takes precedence over rest[0]", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(spy, "cancel", ["WRONG-PAIR"], vals({instId: "ETH-USDT", ordId: "123"}), false);
        assert.equal(captured.args["instId"], "ETH-USDT");
    });

    it("cancel: clOrdId can be used instead of ordId", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(spy, "cancel", [], vals({instId: "ETH-USDT", clOrdId: "my-client-id"}), false);
        assert.equal(captured.args["instId"], "ETH-USDT");
        assert.equal(captured.args["clOrdId"], "my-client-id");
        assert.equal(captured.args["ordId"], undefined);
    });

    it("amend: instId and ordId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(spy, "amend", [], vals({instId: "ETH-USDT", ordId: "111", newPx: "2000"}), false);
        assert.equal(captured.args["instId"], "ETH-USDT");
        assert.equal(captured.args["ordId"], "111");
    });

    it("amend: clOrdId comes from v when ordId absent", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(
            spy,
            "amend",
            [],
            vals({instId: "ETH-USDT", clOrdId: "my-ord", newPx: "2000"}),
            false
        );
        assert.equal(captured.args["instId"], "ETH-USDT");
        assert.equal(captured.args["clOrdId"], "my-ord");
    });

    it("place: instId, side, sz come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(spy, "place", [], vals({
            instId: "ETH-USDT",
            side: "buy",
            sz: "1",
            ordType: "market"
        }), false);
        assert.equal(captured.args["instId"], "ETH-USDT");
        assert.equal(captured.args["side"], "buy");
        assert.equal(captured.args["sz"], "1");
    });

    it("place: clOrdId comes from v.clOrdId", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(spy, "place", [], vals({
            instId: "ETH-USDT",
            side: "buy",
            sz: "1",
            ordType: "market",
            clOrdId: "my-spot-place-id",
        }), false);
        assert.equal(captured.args["clOrdId"], "my-spot-place-id");
    });

    it("get: instId and ordId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(
            spy,
            "get",
            [],
            vals({instId: "BTC-USDT", ordId: "123"}),
            false
        );
        assert.equal(captured.args["instId"], "BTC-USDT");
        assert.equal(captured.args["ordId"], "123");
    });

    it("orders: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(
            spy,
            "orders",
            [],
            vals({instId: "BTC-USDT"}),
            false
        );
        assert.equal(captured.args["instId"], "BTC-USDT");
    });

    it("fills: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotCommand(
            spy,
            "fills",
            [],
            vals({instId: "BTC-USDT"}),
            false
        );
        assert.equal(captured.args["instId"], "BTC-USDT");
    });
});

// ===========================================================================
// SPOT ALGO
// ===========================================================================

describe("handleSpotAlgoCommand — parameter routing", () => {
    it("cancel: instId and algoId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotAlgoCommand(spy, "cancel", vals({instId: "ETH-USDT", algoId: "456"}), false);
        // cmdSpotAlgoCancel passes { instId, algoId } directly (not wrapped in orders array)
        assert.equal(captured.args["instId"], "ETH-USDT");
        assert.equal(captured.args["algoId"], "456");
    });

    it("amend: instId and algoId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotAlgoCommand(
            spy,
            "amend",
            vals({instId: "ETH-USDT", algoId: "456", newTpTriggerPx: "3000"}),
            false
        );
        assert.equal(captured.args["instId"], "ETH-USDT");
        assert.equal(captured.args["algoId"], "456");
    });

    it("place: instId, side, sz come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotAlgoCommand(spy, "place", vals({
            instId: "ETH-USDT",
            side: "buy",
            sz: "1",
            ordType: "conditional"
        }), false);
        assert.equal(captured.args["instId"], "ETH-USDT");
        assert.equal(captured.args["side"], "buy");
        assert.equal(captured.args["sz"], "1");
    });

    it("place: clOrdId comes from v.clOrdId", async () => {
        const {spy, captured} = makeSpy();
        await handleSpotAlgoCommand(spy, "place", vals({
            instId: "ETH-USDT",
            side: "buy",
            sz: "1",
            ordType: "conditional",
            clOrdId: "my-spot-algo-id",
        }), false);
        assert.equal(captured.args["clOrdId"], "my-spot-algo-id");
    });
});

// ===========================================================================
// SWAP
// ===========================================================================

describe("handleSwapCommand — parameter routing", () => {
    it("cancel: instId and ordId come from v (not rest)", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "cancel", [], vals({instId: "BTC-USDT-SWAP", ordId: "123"}), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
        assert.equal(captured.args["ordId"], "123");
    });

    it("cancel: instId falls back to rest[0] when flag absent", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "cancel", ["BTC-USDT-SWAP"], vals({ordId: "123"}), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    });

    it("cancel: --instId flag takes precedence over rest[0]", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "cancel", ["WRONG-PAIR"], vals({instId: "BTC-USDT-SWAP", ordId: "123"}), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    });

    it("cancel: clOrdId can be used instead of ordId", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "cancel", [], vals({instId: "BTC-USDT-SWAP", clOrdId: "my-swap-id"}), false);
        assert.equal(captured.args["clOrdId"], "my-swap-id");
        assert.equal(captured.args["ordId"], undefined);
    });

    it("amend: instId and ordId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "amend", [], vals({instId: "BTC-USDT-SWAP", ordId: "111", newPx: "50000"}), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
        assert.equal(captured.args["ordId"], "111");
    });

    it("amend: clOrdId comes from v when ordId absent", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "amend", [], vals({
            instId: "BTC-USDT-SWAP",
            clOrdId: "swap-ord-1",
            newPx: "50000"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
        assert.equal(captured.args["clOrdId"], "swap-ord-1");
    });

    it("place: instId, side, sz come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "place", [], vals({
            instId: "BTC-USDT-SWAP",
            side: "sell",
            sz: "0.1",
            ordType: "market"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
        assert.equal(captured.args["side"], "sell");
        assert.equal(captured.args["sz"], "0.1");
    });

    it("place: clOrdId comes from v.clOrdId", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "place", [], vals({
            instId: "BTC-USDT-SWAP",
            side: "sell",
            sz: "0.1",
            ordType: "market",
            clOrdId: "my-swap-place-id",
        }), false);
        assert.equal(captured.args["clOrdId"], "my-swap-place-id");
    });

    it("place: reduceOnly comes from v.reduceOnly", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "place", [], vals({
            instId: "BTC-USDT-SWAP",
            side: "sell",
            sz: "0.1",
            ordType: "market",
            reduceOnly: true,
        }), false);
        assert.equal(captured.args["reduceOnly"], true);
    });

    it("get: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "get", [], vals({instId: "BTC-USDT-SWAP", ordId: "123"}), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    });

    it("orders: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "orders", [], vals({instId: "BTC-USDT-SWAP"}), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    });

    it("fills: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "fills", [], vals({instId: "BTC-USDT-SWAP"}), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    });

    it("positions: instId comes from v when rest is empty", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapCommand(spy, "positions", [], vals({instId: "BTC-USDT-SWAP"}), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    });
});

// ===========================================================================
// SWAP ALGO
// ===========================================================================

describe("handleSwapAlgoCommand — parameter routing", () => {
    it("cancel: instId and algoId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapAlgoCommand(spy, "cancel", vals({instId: "BTC-USDT-SWAP", algoId: "456"}), false);
        const orders = captured.args["orders"] as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(orders), "orders should be an array");
        assert.equal(orders[0]!["instId"], "BTC-USDT-SWAP");
        assert.equal(orders[0]!["algoId"], "456");
    });

    it("amend: instId and algoId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapAlgoCommand(spy, "amend", vals({
            instId: "BTC-USDT-SWAP",
            algoId: "456",
            newTpTriggerPx: "60000"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
        assert.equal(captured.args["algoId"], "456");
    });

    it("place: instId, side, sz come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapAlgoCommand(spy, "place", vals({
            instId: "BTC-USDT-SWAP",
            side: "sell",
            sz: "1",
            ordType: "conditional"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
        assert.equal(captured.args["side"], "sell");
        assert.equal(captured.args["sz"], "1");
    });

    it("place: clOrdId comes from v.clOrdId", async () => {
        const {spy, captured} = makeSpy();
        await handleSwapAlgoCommand(spy, "place", vals({
            instId: "BTC-USDT-SWAP",
            side: "sell",
            sz: "1",
            ordType: "conditional",
            clOrdId: "my-swap-algo-id",
        }), false);
        assert.equal(captured.args["clOrdId"], "my-swap-algo-id");
    });
});

// ===========================================================================
// FUTURES
// ===========================================================================

describe("handleFuturesCommand — parameter routing", () => {
    it("cancel: instId and ordId come from v (not rest)", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "cancel", [], vals({instId: "BTC-USD-250328", ordId: "123"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
        assert.equal(captured.args["ordId"], "123");
    });

    it("cancel: instId falls back to rest[0] when flag absent", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "cancel", ["BTC-USD-250328"], vals({ordId: "123"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
    });

    it("cancel: --instId flag takes precedence over rest[0]", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "cancel", ["WRONG-PAIR"], vals({
            instId: "BTC-USD-250328",
            ordId: "123"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
    });

    it("cancel: clOrdId can be used instead of ordId", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "cancel", [], vals({instId: "BTC-USD-250328", clOrdId: "my-fut-id"}), false);
        assert.equal(captured.args["clOrdId"], "my-fut-id");
        assert.equal(captured.args["ordId"], undefined);
    });

    it("amend: instId and ordId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "amend", [], vals({
            instId: "BTC-USD-250328",
            ordId: "111",
            newPx: "50000"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
        assert.equal(captured.args["ordId"], "111");
    });

    it("amend: clOrdId comes from v when ordId absent", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "amend", [], vals({
            instId: "BTC-USD-250328",
            clOrdId: "fut-ord-1",
            newPx: "50000"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
        assert.equal(captured.args["clOrdId"], "fut-ord-1");
    });

    it("place: instId, side, sz come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "place", [], vals({
            instId: "BTC-USD-250328",
            side: "buy",
            sz: "1",
            ordType: "limit",
            px: "50000"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
        assert.equal(captured.args["side"], "buy");
        assert.equal(captured.args["sz"], "1");
    });

    it("place: clOrdId comes from v.clOrdId", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "place", [], vals({
            instId: "BTC-USD-250328",
            side: "buy",
            sz: "1",
            ordType: "market",
            clOrdId: "my-fut-place-id",
        }), false);
        assert.equal(captured.args["clOrdId"], "my-fut-place-id");
    });

    it("get: instId comes from v when rest is empty", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "get", [], vals({instId: "BTC-USD-250328", ordId: "456"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
    });

    it("get: clOrdId comes from v.clOrdId", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "get", [], vals({instId: "BTC-USD-250328", clOrdId: "my-get-id"}), false);
        assert.equal(captured.args["clOrdId"], "my-get-id");
    });

    it("orders: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "orders", [], vals({instId: "BTC-USD-250328"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
    });

    it("fills: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "fills", [], vals({instId: "BTC-USD-250328"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
    });
});

// ===========================================================================
// FUTURES ALGO
// ===========================================================================

describe("handleFuturesAlgoCommand — parameter routing", () => {
    it("cancel: instId and algoId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesAlgoCommand(spy, "cancel", vals({instId: "BTC-USD-250328", algoId: "456"}), false);
        const orders = captured.args["orders"] as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(orders), "orders should be an array");
        assert.equal(orders[0]!["instId"], "BTC-USD-250328");
        assert.equal(orders[0]!["algoId"], "456");
    });

    it("amend: instId and algoId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesAlgoCommand(spy, "amend", vals({
            instId: "BTC-USD-250328",
            algoId: "456",
            newTpTriggerPx: "60000"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
        assert.equal(captured.args["algoId"], "456");
    });

    it("place: instId, side, sz come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesAlgoCommand(spy, "place", vals({
            instId: "BTC-USD-250328",
            side: "sell",
            sz: "1",
            ordType: "conditional"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
        assert.equal(captured.args["side"], "sell");
        assert.equal(captured.args["sz"], "1");
    });

    it("place: clOrdId comes from v.clOrdId", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesAlgoCommand(spy, "place", vals({
            instId: "BTC-USD-250328",
            side: "sell",
            sz: "1",
            ordType: "conditional",
            clOrdId: "my-futures-algo-id",
        }), false);
        assert.equal(captured.args["clOrdId"], "my-futures-algo-id");
    });
});

// ===========================================================================
// OPTION
// ===========================================================================

describe("handleOptionCommand — parameter routing", () => {
    it("cancel: instId and ordId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionCommand(spy, "cancel", [], vals({instId: "BTC-USD-250328-50000-C", ordId: "123"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
        assert.equal(captured.args["ordId"], "123");
    });

    it("amend: instId and ordId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionCommand(spy, "amend", [], vals({
            instId: "BTC-USD-250328-50000-C",
            ordId: "111",
            newPx: "100"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
        assert.equal(captured.args["ordId"], "111");
    });

    it("amend: clOrdId comes from v when ordId absent", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionCommand(spy, "amend", [], vals({
            instId: "BTC-USD-250328-50000-C",
            clOrdId: "opt-ord-1",
            newPx: "100"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
        assert.equal(captured.args["clOrdId"], "opt-ord-1");
    });

    it("place: instId, side, sz come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionCommand(spy, "place", [], vals({
            instId: "BTC-USD-250328-50000-C",
            side: "buy",
            sz: "1",
            ordType: "limit",
            tdMode: "cash",
            px: "100"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
        assert.equal(captured.args["side"], "buy");
        assert.equal(captured.args["sz"], "1");
    });

    it("get: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionCommand(spy, "get", [], vals({instId: "BTC-USD-250328-50000-C", ordId: "123"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
    });

    it("orders: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionCommand(spy, "orders", [], vals({instId: "BTC-USD-250328-50000-C"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
    });

    it("fills: instId comes from v", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionCommand(spy, "fills", [], vals({instId: "BTC-USD-250328-50000-C"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
    });
});

// ===========================================================================
// OPTION ALGO
// ===========================================================================

describe("handleOptionAlgoCommand — parameter routing", () => {
    it("cancel: instId and algoId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionAlgoCommand(spy, "cancel", vals({instId: "BTC-USD-250328-50000-C", algoId: "456"}), false);
        const orders = captured.args["orders"] as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(orders), "orders should be an array");
        assert.equal(orders[0]!["instId"], "BTC-USD-250328-50000-C");
        assert.equal(orders[0]!["algoId"], "456");
    });

    it("amend: instId and algoId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionAlgoCommand(spy, "amend", vals({
            instId: "BTC-USD-250328-50000-C",
            algoId: "456",
            newTpTriggerPx: "200"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
        assert.equal(captured.args["algoId"], "456");
    });

    it("place: instId, side, sz come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleOptionAlgoCommand(spy, "place", vals({
            instId: "BTC-USD-250328-50000-C",
            side: "buy",
            sz: "1",
            ordType: "conditional",
            tdMode: "cash"
        }), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328-50000-C");
        assert.equal(captured.args["side"], "buy");
        assert.equal(captured.args["sz"], "1");
    });
});

// ===========================================================================
// BOT GRID
// ===========================================================================

describe("handleBotGridCommand — parameter routing", () => {
    it("create: tpTriggerPx and slTriggerPx come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleBotGridCommand(spy, vals({
            instId: "BTC-USDT-SWAP", algoOrdType: "contract_grid",
            maxPx: "120000", minPx: "80000", gridNum: "5",
            direction: "long", lever: "5", sz: "100",
            tpTriggerPx: "130000", slTriggerPx: "75000",
        }), ["create"], false);
        assert.equal(captured.args["tpTriggerPx"], "130000");
        assert.equal(captured.args["slTriggerPx"], "75000");
    });

    it("create: tpRatio, slRatio, algoClOrdId come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleBotGridCommand(spy, vals({
            instId: "BTC-USDT-SWAP", algoOrdType: "contract_grid",
            maxPx: "120000", minPx: "80000", gridNum: "5",
            direction: "long", lever: "5", sz: "100",
            tpRatio: "0.1", slRatio: "0.05", algoClOrdId: "myGrid001",
        }), ["create"], false);
        assert.equal(captured.args["tpRatio"], "0.1");
        assert.equal(captured.args["slRatio"], "0.05");
        assert.equal(captured.args["algoClOrdId"], "myGrid001");
    });

    it("create: instId and algoOrdType come from v", async () => {
        const {spy, captured} = makeSpy();
        await handleBotGridCommand(spy, vals({
            instId: "BTC-USD-SWAP", algoOrdType: "contract_grid",
            maxPx: "100000", minPx: "80000", gridNum: "20",
            direction: "long", lever: "5", sz: "0.1",
        }), ["create"], false);
        assert.equal(captured.args["instId"], "BTC-USD-SWAP");
        assert.equal(captured.args["algoOrdType"], "contract_grid");
    });
});

// ===========================================================================
// EARN — FLASH EARN
// ===========================================================================

const fakeFlashEarnResult = {
    endpoint: "GET /api/v5/finance/flash-earn/projects",
    requestTime: new Date().toISOString(),
    data: [],
};

describe("handleEarnCommand flash-earn — parameter routing", () => {
    it("projects: --status flag is passed as integer array", async () => {
        const captured = {tool: "", args: {} as Record<string, unknown>};
        const spy: ToolRunner = async (tool, args) => {
            captured.tool = tool as string;
            captured.args = args as Record<string, unknown>;
            return fakeFlashEarnResult;
        };
        await handleEarnCommand(spy, "flash-earn", ["projects"], vals({status: "0,100"}), false);
        assert.equal(captured.tool, "earn_get_flash_earn_projects");
        assert.deepEqual(captured.args["status"], [0, 100]);
    });

    it("projects: omits status when --status is omitted", async () => {
        const captured = {tool: "", args: {} as Record<string, unknown>};
        const spy: ToolRunner = async (tool, args) => {
            captured.tool = tool as string;
            captured.args = args as Record<string, unknown>;
            return fakeFlashEarnResult;
        };
        await handleEarnCommand(spy, "flash-earn", ["projects"], vals({}), false);
        assert.equal(captured.tool, "earn_get_flash_earn_projects");
        assert.equal(captured.args["status"], undefined);
    });

    it("projects: single status value is passed as integer array", async () => {
        const captured = {tool: "", args: {} as Record<string, unknown>};
        const spy: ToolRunner = async (tool, args) => {
            captured.tool = tool as string;
            captured.args = args as Record<string, unknown>;
            return fakeFlashEarnResult;
        };
        await handleEarnCommand(spy, "flash-earn", ["projects"], vals({status: "100"}), false);
        assert.equal(captured.tool, "earn_get_flash_earn_projects");
        assert.deepEqual(captured.args["status"], [100]);
    });
});

// ---------------------------------------------------------------------------
// Earn Savings Fixed — parameter routing
// ---------------------------------------------------------------------------

const fakeEarnResult = {
    endpoint: "GET /api/v5/finance/simple-earn-fixed/order-list",
    requestTime: new Date().toISOString(),
    data: [],
};

const fakeEarnPreview = {
    preview: true,
    ccy: "USDT",
    amt: "100",
    term: "90D",
    offer: null,
    currentFlexibleRate: null,
    warning: "test warning",
};

function makeEarnSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
    const captured = {tool: "", args: {} as Record<string, unknown>};
    const spy: ToolRunner = async (tool, args) => {
        captured.tool = tool as string;
        captured.args = args as Record<string, unknown>;
        if (tool === "earn_fixed_purchase") return fakeEarnPreview;
        return fakeEarnResult;
    };
    return {spy, captured};
}

describe("earn savings fixed-orders: params come from v (named flags)", () => {
    it("ccy and state come from v.ccy and v.state", async () => {
        const {spy, captured} = makeEarnSpy();
        await handleEarnCommand(spy, "savings", ["fixed-orders"], vals({
            ccy: "USDT", state: "earning",
        }), false);
        assert.equal(captured.tool, "earn_get_fixed_order_list");
        assert.equal(captured.args["ccy"], "USDT");
        assert.equal(captured.args["state"], "earning");
    });
});

describe("earn savings fixed-purchase: params come from v (named flags)", () => {
    it("ccy, amt, term, confirm come from v", async () => {
        const {spy, captured} = makeEarnSpy();
        await handleEarnCommand(spy, "savings", ["fixed-purchase"], vals({
            ccy: "USDT", amt: "100", term: "90D", confirm: false,
        }), false);
        assert.equal(captured.tool, "earn_fixed_purchase");
        assert.equal(captured.args["ccy"], "USDT");
        assert.equal(captured.args["amt"], "100");
        assert.equal(captured.args["term"], "90D");
        assert.equal(captured.args["confirm"], false);
    });
});

describe("earn savings fixed-redeem: reqId comes from v (named flag)", () => {
    it("reqId from v.reqId, not rest[0]", async () => {
        const {spy, captured} = makeEarnSpy();
        await handleEarnCommand(spy, "savings", ["fixed-redeem"], vals({
            reqId: "REQ-FROM-FLAG",
        }), false);
        assert.equal(captured.tool, "earn_fixed_redeem");
        assert.equal(captured.args["reqId"], "REQ-FROM-FLAG");
    });

    it("does NOT fall back to rest[0] — positional args are ignored (issue #78)", async () => {
        const {spy, captured} = makeEarnSpy();
        await handleEarnCommand(spy, "savings", ["fixed-redeem", "REQ-FROM-POS"], vals({}), false);
        assert.equal(captured.tool, "earn_fixed_redeem");
        assert.equal(captured.args["reqId"], undefined, "reqId must come from v.reqId, not rest[0]");
    });
});

// ===========================================================================
// MARKET — demo flag routing
// ===========================================================================

const fakeMarketResult = {
    endpoint: "GET /api/v5/market/ticker",
    requestTime: new Date().toISOString(),
    data: [],
};

function makeMarketSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
    const captured = {tool: "", args: {} as Record<string, unknown>};
    const spy: ToolRunner = async (tool, args) => {
        captured.tool = tool as string;
        captured.args = args as Record<string, unknown>;
        return fakeMarketResult;
    };
    return {spy, captured};
}

describe("handleMarketCommand — demo flag routing", () => {
    it("ticker: demo=true comes from v.demo", async () => {
        const {spy, captured} = makeMarketSpy();
        await handleMarketCommand(spy, "ticker", ["BTC-USDT"], vals({demo: true}), false);
        assert.equal(captured.args["demo"], true);
    });

    it("ticker: demo defaults to false when v.demo absent", async () => {
        const {spy, captured} = makeMarketSpy();
        await handleMarketCommand(spy, "ticker", ["BTC-USDT"], vals({}), false);
        assert.equal(captured.args["demo"], false);
    });

    it("candles: demo=true comes from v.demo", async () => {
        const {spy, captured} = makeMarketSpy();
        await handleMarketCommand(spy, "candles", ["BTC-USDT"], vals({demo: true}), false);
        assert.equal(captured.args["demo"], true);
    });

    it("funding-rate: demo=true comes from v.demo", async () => {
        const {spy, captured} = makeMarketSpy();
        await handleMarketCommand(spy, "funding-rate", ["BTC-USDT-SWAP"], vals({demo: true}), false);
        assert.equal(captured.args["demo"], true);
    });

    it("instruments: demo=true comes from v.demo", async () => {
        const {spy, captured} = makeMarketSpy();
        await handleMarketCommand(spy, "instruments", [], vals({instType: "SWAP", demo: true}), false);
        assert.equal(captured.args["demo"], true);
    });
});

// ===========================================================================
// EVENT
// ===========================================================================

describe("handleEventCommand — parameter routing", () => {
    it("place: instId, side, outcome, sz come from v (not rest)", async () => {
        const {spy, captured} = makeSpy();
        await handleEventCommand(spy, "place", [], vals({
            instId: "BTC-ABOVE-DAILY-260224-1600-120000",
            side: "buy",
            outcome: "UP",
            sz: "10",
        }), false);
        assert.equal(captured.args["instId"], "BTC-ABOVE-DAILY-260224-1600-120000");
        assert.equal(captured.args["side"], "buy");
        assert.equal(captured.args["outcome"], "UP");
        assert.equal(captured.args["sz"], "10");
    });

    it("place: --instId flag takes precedence over rest[0]", async () => {
        const {spy, captured} = makeSpy();
        await handleEventCommand(spy, "place", ["WRONG-ID"], vals({
            instId: "BTC-ABOVE-DAILY-260224-1600-120000",
            side: "buy",
            outcome: "UP",
            sz: "10",
        }), false);
        assert.equal(captured.args["instId"], "BTC-ABOVE-DAILY-260224-1600-120000");
    });

    it("cancel: instId and ordId come from v (not rest)", async () => {
        const {spy, captured} = makeSpy();
        await handleEventCommand(spy, "cancel", [], vals({
            instId: "BTC-ABOVE-DAILY-260224-1600-120000",
            ordId: "123456",
        }), false);
        assert.equal(captured.args["instId"], "BTC-ABOVE-DAILY-260224-1600-120000");
        assert.equal(captured.args["ordId"], "123456");
    });

    it("cancel: --instId flag takes precedence over rest[0]", async () => {
        const {spy, captured} = makeSpy();
        await handleEventCommand(spy, "cancel", ["WRONG-ID"], vals({
            instId: "BTC-ABOVE-DAILY-260224-1600-120000",
            ordId: "123456",
        }), false);
        assert.equal(captured.args["instId"], "BTC-ABOVE-DAILY-260224-1600-120000");
    });

    it("amend: instId and ordId come from v (not rest)", async () => {
        const {spy, captured} = makeSpy();
        await handleEventCommand(spy, "amend", [], vals({
            instId: "BTC-ABOVE-DAILY-260224-1600-120000",
            ordId: "123456",
            px: "0.55",
        }), false);
        assert.equal(captured.args["instId"], "BTC-ABOVE-DAILY-260224-1600-120000");
        assert.equal(captured.args["ordId"], "123456");
    });

    it("events: seriesId comes from v (not rest)", async () => {
        const {spy, captured} = makeSpy();
        await handleEventCommand(spy, "events", [], vals({
            seriesId: "BTC-ABOVE-DAILY",
        }), false);
        assert.equal(captured.args["seriesId"], "BTC-ABOVE-DAILY");
    });

    it("markets: seriesId comes from v (not rest)", async () => {
        const {spy, captured} = makeSpy();
        await handleEventCommand(spy, "markets", [], vals({
            seriesId: "BTC-ABOVE-DAILY",
        }), false);
        assert.equal(captured.args["seriesId"], "BTC-ABOVE-DAILY");
    });
});

// ===========================================================================
// MARKET FILTER / OI-HISTORY / OI-CHANGE
// ===========================================================================

const fakeFilterResult = {
    endpoint: "POST /api/v5/aigc/mcp/market-filter",
    requestTime: new Date().toISOString(),
    data: {total: 0, rows: []},
};

const fakeOiHistoryResult = {
    endpoint: "POST /api/v5/aigc/mcp/oi-history",
    requestTime: new Date().toISOString(),
    data: {instId: "BTC-USDT-SWAP", bar: "1H", rows: []},
};

const fakeOiChangeResult = {
    endpoint: "POST /api/v5/aigc/mcp/oi-change-filter",
    requestTime: new Date().toISOString(),
    data: [],
};

function makeFilterSpy(result: typeof fakeFilterResult | typeof fakeOiHistoryResult | typeof fakeOiChangeResult) {
    const captured = {tool: "", args: {} as Record<string, unknown>};
    const spy: ToolRunner = async (tool, args) => {
        captured.tool = tool as string;
        captured.args = args as Record<string, unknown>;
        return result;
    };
    return {spy, captured};
}

describe("handleMarketCommand — filter/oi-history/oi-change parameter routing", () => {
    // ── market filter ──────────────────────────────────────────────────────
    it("filter: instType comes from v.instType (not rest)", async () => {
        const {spy, captured} = makeFilterSpy(fakeFilterResult);
        await handleMarketCommand(spy, "filter", [], vals({instType: "SWAP"}), false);
        assert.equal(captured.args["instType"], "SWAP");
    });

    it("filter: sortBy comes from v.sortBy", async () => {
        const {spy, captured} = makeFilterSpy(fakeFilterResult);
        await handleMarketCommand(spy, "filter", [], vals({instType: "SWAP", sortBy: "oiUsd"}), false);
        assert.equal(captured.args["sortBy"], "oiUsd");
    });

    it("filter: sortOrder comes from v.sortOrder", async () => {
        const {spy, captured} = makeFilterSpy(fakeFilterResult);
        await handleMarketCommand(spy, "filter", [], vals({instType: "SPOT", sortOrder: "asc"}), false);
        assert.equal(captured.args["sortOrder"], "asc");
    });

    it("filter: limit comes from v.limit (string → number)", async () => {
        const {spy, captured} = makeFilterSpy(fakeFilterResult);
        await handleMarketCommand(spy, "filter", [], vals({instType: "FUTURES", limit: "50"}), false);
        assert.equal(captured.args["limit"], 50);
    });

    it("filter: minVolUsd24h comes from v.minVolUsd24h", async () => {
        const {spy, captured} = makeFilterSpy(fakeFilterResult);
        await handleMarketCommand(spy, "filter", [], vals({instType: "SWAP", minVolUsd24h: "100000000"}), false);
        assert.equal(captured.args["minVolUsd24h"], "100000000");
    });

    it("filter: minOiUsd comes from v.minOiUsd", async () => {
        const {spy, captured} = makeFilterSpy(fakeFilterResult);
        await handleMarketCommand(spy, "filter", [], vals({instType: "SWAP", minOiUsd: "500000000"}), false);
        assert.equal(captured.args["minOiUsd"], "500000000");
    });

    it("filter: minFundingRate comes from v.minFundingRate", async () => {
        const {spy, captured} = makeFilterSpy(fakeFilterResult);
        await handleMarketCommand(spy, "filter", [], vals({instType: "SWAP", minFundingRate: "0.0001"}), false);
        assert.equal(captured.args["minFundingRate"], "0.0001");
    });

    it("filter: ctType comes from v.ctType", async () => {
        const {spy, captured} = makeFilterSpy(fakeFilterResult);
        await handleMarketCommand(spy, "filter", [], vals({instType: "SWAP", ctType: "linear"}), false);
        assert.equal(captured.args["ctType"], "linear");
    });

    // ── market oi-history ──────────────────────────────────────────────────
    it("oi-history: instId comes from rest[0]", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiHistoryResult);
        await handleMarketCommand(spy, "oi-history", ["BTC-USDT-SWAP"], vals({}), false);
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    });

    it("oi-history: bar comes from v.bar (not rest)", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiHistoryResult);
        await handleMarketCommand(spy, "oi-history", ["BTC-USDT-SWAP"], vals({bar: "4H"}), false);
        assert.equal(captured.args["bar"], "4H");
        assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    });

    it("oi-history: limit comes from v.limit (string → number)", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiHistoryResult);
        await handleMarketCommand(spy, "oi-history", ["ETH-USDT-SWAP"], vals({limit: "100"}), false);
        assert.equal(captured.args["limit"], 100);
    });

    it("oi-history: ts comes from v.ts (string → number)", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiHistoryResult);
        await handleMarketCommand(spy, "oi-history", ["BTC-USDT-SWAP"], vals({ts: "1700000000000"}), false);
        assert.equal(captured.args["ts"], 1700000000000);
    });

    it("oi-history: instId is rest[0], NOT overridden by v.instId", async () => {
        // Verify that instId routing uses rest[0] correctly (the documented behavior for this command)
        const {spy, captured} = makeFilterSpy(fakeOiHistoryResult);
        await handleMarketCommand(spy, "oi-history", ["SOL-USDT-SWAP"], vals({}), false);
        assert.equal(captured.args["instId"], "SOL-USDT-SWAP");
    });

    // ── market oi-change ───────────────────────────────────────────────────
    it("oi-change: instType comes from v.instType (not rest)", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiChangeResult);
        await handleMarketCommand(spy, "oi-change", [], vals({instType: "FUTURES"}), false);
        assert.equal(captured.args["instType"], "FUTURES");
    });

    it("oi-change: bar comes from v.bar", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiChangeResult);
        await handleMarketCommand(spy, "oi-change", [], vals({instType: "SWAP", bar: "15m"}), false);
        assert.equal(captured.args["bar"], "15m");
    });

    it("oi-change: minAbsOiDeltaPct comes from v.minAbsOiDeltaPct", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiChangeResult);
        await handleMarketCommand(spy, "oi-change", [], vals({instType: "SWAP", minAbsOiDeltaPct: "1.5"}), false);
        assert.equal(captured.args["minAbsOiDeltaPct"], "1.5");
    });

    it("oi-change: sortBy comes from v.sortBy", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiChangeResult);
        await handleMarketCommand(spy, "oi-change", [], vals({instType: "SWAP", sortBy: "oiDeltaUsd"}), false);
        assert.equal(captured.args["sortBy"], "oiDeltaUsd");
    });

    it("oi-change: limit comes from v.limit (string → number)", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiChangeResult);
        await handleMarketCommand(spy, "oi-change", [], vals({instType: "SWAP", limit: "30"}), false);
        assert.equal(captured.args["limit"], 30);
    });

    it("oi-change: minOiUsd comes from v.minOiUsd", async () => {
        const {spy, captured} = makeFilterSpy(fakeOiChangeResult);
        await handleMarketCommand(spy, "oi-change", [], vals({instType: "SWAP", minOiUsd: "100000000"}), false);
        assert.equal(captured.args["minOiUsd"], "100000000");
    });
});
