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

    it("get: instId comes from v when rest is empty", async () => {
        const {spy, captured} = makeSpy();
        await handleFuturesCommand(spy, "get", [], vals({instId: "BTC-USD-250328", ordId: "456"}), false);
        assert.equal(captured.args["instId"], "BTC-USD-250328");
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
