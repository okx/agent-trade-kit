/**
 * Parameter routing tests for Phase 2 new ordTypes (#181) on all applicable trade modules.
 *
 * Verifies that trigger / chase / iceberg / twap ordType-specific params
 * reach the tool runner as named flags — one table-driven suite shared across
 * swap / spot / futures to avoid Sonar duplication.
 *
 * Pattern mirrors Phase 1's new-flags-routing.test.ts; reuses makeCapture.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdSwapAlgoPlace } from "../src/commands/swap.js";
import { cmdSpotAlgoPlace } from "../src/commands/spot.js";
import { cmdFuturesAlgoPlace } from "../src/commands/futures.js";
import { setOutput, resetOutput } from "../src/formatter.js";

// ---------------------------------------------------------------------------
// Shared spy runner + output harness
// ---------------------------------------------------------------------------

interface Capture {
  runner: ToolRunner;
  get: () => Record<string, unknown>;
}

function makeCapture(): Capture {
  let captured: Record<string, unknown> = {};
  const runner: ToolRunner = async (_tool, args) => {
    captured = args as Record<string, unknown>;
    return {
      endpoint: "POST /api/v5/trade/order-algo",
      requestTime: new Date().toISOString(),
      data: [{ algoId: "ALGO001", sCode: "0", sMsg: "" }],
    };
  };
  return { runner, get: () => captured };
}

beforeEach(() => {
  setOutput({ out: () => {}, err: () => {} });
});
afterEach(() => resetOutput());

// ---------------------------------------------------------------------------
// Module table — one row per algo-place command
// (swap and futures support all 4 new ordTypes; spot supports all 4 too per OKX docs)
// ---------------------------------------------------------------------------

type AlgoCmd = (runner: ToolRunner, opts: Record<string, unknown>) => Promise<void>;

interface AlgoModule {
  name: string;
  cmd: AlgoCmd;
  instId: string;
  /** Does this module support cxlOnClosePos (swap + futures only)? */
  supportsCxlOnClosePos: boolean;
}

const ALGO_MODULES: AlgoModule[] = [
  { name: "swap",    cmd: cmdSwapAlgoPlace    as unknown as AlgoCmd, instId: "BTC-USDT-SWAP",    supportsCxlOnClosePos: true  },
  { name: "spot",    cmd: cmdSpotAlgoPlace    as unknown as AlgoCmd, instId: "BTC-USDT",          supportsCxlOnClosePos: false },
  { name: "futures", cmd: cmdFuturesAlgoPlace as unknown as AlgoCmd, instId: "BTC-USDT-250926", supportsCxlOnClosePos: true  },
];

function baseOpts(instId: string): Record<string, unknown> {
  return { instId, side: "sell", sz: "1", tdMode: "cross", json: false };
}

// ---------------------------------------------------------------------------
// trigger ordType
// ---------------------------------------------------------------------------

for (const { name, cmd, instId } of ALGO_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}AlgoPlace - trigger ordType`, () => {
    it("routes triggerPx + orderPx", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseOpts(instId), ordType: "trigger", triggerPx: "50000", orderPx: "50100" });
      assert.equal(c.get().ordType, "trigger");
      assert.equal(c.get().triggerPx, "50000");
      assert.equal(c.get().orderPx, "50100");
    });

    it("routes advanceOrdType + triggerPxType", async () => {
      const c = makeCapture();
      await cmd(c.runner, {
        ...baseOpts(instId), ordType: "trigger",
        triggerPx: "50000", orderPx: "50100",
        advanceOrdType: "fok", triggerPxType: "mark",
      });
      assert.equal(c.get().advanceOrdType, "fok");
      assert.equal(c.get().triggerPxType, "mark");
    });

    it("omits trigger-specific fields when not provided", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseOpts(instId), ordType: "trigger", triggerPx: "50000", orderPx: "-1" });
      assert.equal(c.get().chaseType,  undefined, "chaseType must not leak");
      assert.equal(c.get().pxVar,      undefined, "pxVar must not leak");
      assert.equal(c.get().szLimit,    undefined, "szLimit must not leak");
    });
  });
}

// ---------------------------------------------------------------------------
// chase ordType
// ---------------------------------------------------------------------------

for (const { name, cmd, instId } of ALGO_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}AlgoPlace - chase ordType`, () => {
    it("routes chaseType + chaseVal", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseOpts(instId), ordType: "chase", chaseType: "distance", chaseVal: "0.5" });
      assert.equal(c.get().ordType, "chase");
      assert.equal(c.get().chaseType, "distance");
      assert.equal(c.get().chaseVal, "0.5");
    });

    it("routes maxChaseType + maxChaseVal", async () => {
      const c = makeCapture();
      await cmd(c.runner, {
        ...baseOpts(instId), ordType: "chase",
        chaseType: "ratio", chaseVal: "0.001",
        maxChaseType: "ratio", maxChaseVal: "0.01",
      });
      assert.equal(c.get().maxChaseType, "ratio");
      assert.equal(c.get().maxChaseVal, "0.01");
    });

    it("omits chase-specific fields when not provided", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseOpts(instId), ordType: "chase" });
      assert.equal(c.get().triggerPx, undefined, "triggerPx must not leak");
      assert.equal(c.get().pxVar,     undefined, "pxVar must not leak");
    });
  });
}

// ---------------------------------------------------------------------------
// iceberg ordType
// ---------------------------------------------------------------------------

for (const { name, cmd, instId } of ALGO_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}AlgoPlace - iceberg ordType`, () => {
    it("routes pxVar + szLimit + pxLimit + timeInterval", async () => {
      const c = makeCapture();
      await cmd(c.runner, {
        ...baseOpts(instId), ordType: "iceberg",
        pxVar: "0.001", szLimit: "0.1", pxLimit: "50000", timeInterval: "10",
      });
      assert.equal(c.get().ordType, "iceberg");
      assert.equal(c.get().pxVar,       "0.001");
      assert.equal(c.get().szLimit,     "0.1");
      assert.equal(c.get().pxLimit,     "50000");
      assert.equal(c.get().timeInterval, "10");
    });

    it("routes pxSpread (alternative to pxVar)", async () => {
      const c = makeCapture();
      await cmd(c.runner, {
        ...baseOpts(instId), ordType: "iceberg",
        pxSpread: "50", szLimit: "0.5", pxLimit: "49000", timeInterval: "5",
      });
      assert.equal(c.get().pxSpread, "50");
      assert.equal(c.get().pxVar, undefined, "pxVar must not appear when pxSpread provided");
    });

    it("omits iceberg-specific fields when not provided", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseOpts(instId), ordType: "iceberg" });
      assert.equal(c.get().triggerPx,  undefined, "triggerPx must not leak");
      assert.equal(c.get().chaseType,  undefined, "chaseType must not leak");
    });
  });
}

// ---------------------------------------------------------------------------
// twap ordType
// ---------------------------------------------------------------------------

for (const { name, cmd, instId } of ALGO_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}AlgoPlace - twap ordType`, () => {
    it("routes pxVar + szLimit + pxLimit + timeInterval", async () => {
      const c = makeCapture();
      await cmd(c.runner, {
        ...baseOpts(instId), ordType: "twap",
        pxVar: "0.002", szLimit: "0.5", pxLimit: "49000", timeInterval: "30",
      });
      assert.equal(c.get().ordType, "twap");
      assert.equal(c.get().pxVar,       "0.002");
      assert.equal(c.get().szLimit,     "0.5");
      assert.equal(c.get().pxLimit,     "49000");
      assert.equal(c.get().timeInterval, "30");
    });

    it("routes pxSpread for twap", async () => {
      const c = makeCapture();
      await cmd(c.runner, {
        ...baseOpts(instId), ordType: "twap",
        pxSpread: "20", szLimit: "1", pxLimit: "48000", timeInterval: "60",
      });
      assert.equal(c.get().pxSpread, "20");
    });
  });
}

// ---------------------------------------------------------------------------
// Backward compat: existing ordTypes produce identical payload (no new fields injected)
// ---------------------------------------------------------------------------

for (const { name, cmd, instId, supportsCxlOnClosePos } of ALGO_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}AlgoPlace - backward compat`, () => {
    const NEW_PHASE2_KEYS = [
      "triggerPx", "orderPx", "advanceOrdType", "triggerPxType",
      "chaseType", "chaseVal", "maxChaseType", "maxChaseVal",
      "pxVar", "pxSpread", "szLimit", "pxLimit", "timeInterval",
    ];

    it("conditional ordType: no Phase 2 fields injected", async () => {
      const c = makeCapture();
      await cmd(c.runner, {
        ...baseOpts(instId), ordType: "conditional",
        tpTriggerPx: "50000", tpOrdPx: "-1",
        ...(supportsCxlOnClosePos ? { cxlOnClosePos: true } : {}),
      });
      assert.equal(c.get().ordType, "conditional");
      for (const k of NEW_PHASE2_KEYS) {
        assert.equal(c.get()[k], undefined, `${k} must not appear in conditional payload`);
      }
    });

    it("oco ordType: no Phase 2 fields injected", async () => {
      const c = makeCapture();
      await cmd(c.runner, {
        ...baseOpts(instId), ordType: "oco",
        tpTriggerPx: "50000", slTriggerPx: "45000",
      });
      assert.equal(c.get().ordType, "oco");
      for (const k of NEW_PHASE2_KEYS) {
        assert.equal(c.get()[k], undefined, `${k} must not appear in oco payload`);
      }
    });

    it("move_order_stop ordType: no Phase 2 fields injected", async () => {
      const c = makeCapture();
      await cmd(c.runner, {
        ...baseOpts(instId), ordType: "move_order_stop",
        callbackRatio: "0.01",
      });
      assert.equal(c.get().ordType, "move_order_stop");
      for (const k of NEW_PHASE2_KEYS) {
        assert.equal(c.get()[k], undefined, `${k} must not appear in move_order_stop payload`);
      }
    });
  });
}
