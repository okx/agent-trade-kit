/**
 * Parameter routing tests for Phase 1 new flags (#178) on all three trade modules.
 *
 * Verifies that tpOrdKind / tpTriggerPxType / slTriggerPxType / stpMode / cxlOnClosePos
 * reach the tool runner as named flags (not positional args) — one table-driven suite
 * shared across swap / spot / futures to avoid Sonar duplication.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdSwapPlace, cmdSwapAlgoPlace } from "../src/commands/swap.js";
import { cmdSpotPlace, cmdSpotAlgoPlace } from "../src/commands/spot.js";
import { cmdFuturesPlace, cmdFuturesAlgoPlace } from "../src/commands/futures.js";
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
      endpoint: "POST /api/v5/trade/order",
      requestTime: new Date().toISOString(),
      data: [{ ordId: "ORD001", algoId: "ALGO001", sCode: "0", sMsg: "" }],
    };
  };
  return { runner, get: () => captured };
}

beforeEach(() => {
  setOutput({ out: () => {}, err: () => {} });
});
afterEach(() => resetOutput());

// ---------------------------------------------------------------------------
// Module table — one row per place / algo-place command pair
// ---------------------------------------------------------------------------

type PlaceCmd = (runner: ToolRunner, opts: Record<string, unknown>) => Promise<void>;
type AlgoCmd = (runner: ToolRunner, opts: Record<string, unknown>) => Promise<void>;

const PLACE_MODULES: Array<{ name: string; cmd: PlaceCmd; instId: string }> = [
  { name: "swap", cmd: cmdSwapPlace as unknown as PlaceCmd, instId: "BTC-USDT-SWAP" },
  { name: "spot", cmd: cmdSpotPlace as unknown as PlaceCmd, instId: "BTC-USDT" },
  { name: "futures", cmd: cmdFuturesPlace as unknown as PlaceCmd, instId: "BTC-USDT-250926" },
];

const ALGO_MODULES: Array<{
  name: string;
  cmd: AlgoCmd;
  instId: string;
  supportsCxlOnClosePos: boolean;
}> = [
  { name: "swap", cmd: cmdSwapAlgoPlace as unknown as AlgoCmd, instId: "BTC-USDT-SWAP", supportsCxlOnClosePos: true },
  { name: "spot", cmd: cmdSpotAlgoPlace as unknown as AlgoCmd, instId: "BTC-USDT", supportsCxlOnClosePos: false },
  { name: "futures", cmd: cmdFuturesAlgoPlace as unknown as AlgoCmd, instId: "BTC-USDT-250926", supportsCxlOnClosePos: true },
];

function basePlaceOpts(instId: string): Record<string, unknown> {
  return { instId, side: "buy", ordType: "limit", sz: "1", tdMode: "cross", px: "50000", json: false };
}
function baseAlgoOpts(instId: string): Record<string, unknown> {
  return { instId, side: "sell", ordType: "conditional", sz: "1", tdMode: "cross", json: false };
}

// ---------------------------------------------------------------------------
// Place: new flags forwarded as named args
// ---------------------------------------------------------------------------

for (const { name, cmd, instId } of PLACE_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}Place — Phase 1 flags`, () => {
    it("forwards tpOrdKind", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...basePlaceOpts(instId), tpOrdKind: "limit" });
      assert.equal(c.get().tpOrdKind, "limit");
    });

    it("forwards stpMode", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...basePlaceOpts(instId), stpMode: "cancel_maker" });
      assert.equal(c.get().stpMode, "cancel_maker");
    });

    it("forwards tpTriggerPxType + slTriggerPxType", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...basePlaceOpts(instId), tpTriggerPxType: "mark", slTriggerPxType: "index" });
      assert.equal(c.get().tpTriggerPxType, "mark");
      assert.equal(c.get().slTriggerPxType, "index");
    });

    it("omits new flags when not provided (backward compat)", async () => {
      const c = makeCapture();
      await cmd(c.runner, basePlaceOpts(instId));
      for (const k of ["tpOrdKind", "stpMode", "tpTriggerPxType", "slTriggerPxType"]) {
        assert.equal(c.get()[k], undefined, `${k} must not leak into payload`);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Algo place: all 5 flags (cxlOnClosePos skipped on spot — not supported)
// ---------------------------------------------------------------------------

for (const { name, cmd, instId, supportsCxlOnClosePos } of ALGO_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}AlgoPlace — Phase 1 flags`, () => {
    it("forwards tpOrdKind", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseAlgoOpts(instId), tpOrdKind: "condition" });
      assert.equal(c.get().tpOrdKind, "condition");
    });

    it("forwards tpTriggerPxType + slTriggerPxType", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseAlgoOpts(instId), tpTriggerPxType: "mark", slTriggerPxType: "index" });
      assert.equal(c.get().tpTriggerPxType, "mark");
      assert.equal(c.get().slTriggerPxType, "index");
    });

    it("forwards stpMode", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseAlgoOpts(instId), stpMode: "cancel_taker" });
      assert.equal(c.get().stpMode, "cancel_taker");
    });

    if (supportsCxlOnClosePos) {
      it("forwards cxlOnClosePos=true", async () => {
        const c = makeCapture();
        await cmd(c.runner, { ...baseAlgoOpts(instId), cxlOnClosePos: true });
        assert.equal(c.get().cxlOnClosePos, true);
      });

      it("forwards all 5 flags simultaneously", async () => {
        const c = makeCapture();
        await cmd(c.runner, {
          ...baseAlgoOpts(instId),
          tpOrdKind: "limit",
          tpTriggerPxType: "mark",
          slTriggerPxType: "index",
          stpMode: "cancel_both",
          cxlOnClosePos: true,
        });
        assert.equal(c.get().tpOrdKind, "limit");
        assert.equal(c.get().tpTriggerPxType, "mark");
        assert.equal(c.get().slTriggerPxType, "index");
        assert.equal(c.get().stpMode, "cancel_both");
        assert.equal(c.get().cxlOnClosePos, true);
      });
    }

    it("omits new flags when not provided (backward compat)", async () => {
      const c = makeCapture();
      await cmd(c.runner, baseAlgoOpts(instId));
      const keys = ["tpOrdKind", "tpTriggerPxType", "slTriggerPxType", "stpMode"];
      if (supportsCxlOnClosePos) keys.push("cxlOnClosePos");
      for (const k of keys) {
        assert.equal(c.get()[k], undefined, `${k} must not leak into payload`);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Phase 3a+c: CLI power-user flags (issue #182, CLI-only no MCP/skill exposure)
// ---------------------------------------------------------------------------

// Place: pxAmendType forwarded from all 3 modules
for (const { name, cmd, instId } of PLACE_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}Place — Phase 3c flags`, () => {
    it("forwards pxAmendType", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...basePlaceOpts(instId), pxAmendType: "1" });
      assert.equal(c.get().pxAmendType, "1");
    });

    it("omits Phase 3c flags when not provided (backward compat)", async () => {
      const c = makeCapture();
      await cmd(c.runner, basePlaceOpts(instId));
      assert.equal(c.get().pxAmendType, undefined, "pxAmendType must not leak");
    });
  });
}

// Spot place: tradeQuoteCcy and banAmend
describe("cmdSpotPlace — Phase 3c spot-specific flags", () => {
  it("forwards tradeQuoteCcy", async () => {
    const c = makeCapture();
    await cmdSpotPlace(c.runner, { ...basePlaceOpts("BTC-USDT"), tradeQuoteCcy: "USDC" } as Record<string, unknown> as Parameters<typeof cmdSpotPlace>[1]);
    assert.equal(c.get().tradeQuoteCcy, "USDC");
  });

  it("forwards banAmend=true", async () => {
    const c = makeCapture();
    await cmdSpotPlace(c.runner, { ...basePlaceOpts("BTC-USDT"), banAmend: true } as Record<string, unknown> as Parameters<typeof cmdSpotPlace>[1]);
    assert.equal(c.get().banAmend, true);
  });

  it("omits tradeQuoteCcy and banAmend when not provided (backward compat)", async () => {
    const c = makeCapture();
    await cmdSpotPlace(c.runner, basePlaceOpts("BTC-USDT") as Parameters<typeof cmdSpotPlace>[1]);
    assert.equal(c.get().tradeQuoteCcy, undefined, "tradeQuoteCcy must not leak");
    assert.equal(c.get().banAmend, undefined, "banAmend must not leak");
  });
});

// Algo place: tpTriggerRatio, slTriggerRatio, closeFraction, pxAmendType
for (const { name, cmd, instId } of ALGO_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}AlgoPlace — Phase 3a flags`, () => {
    it("forwards tpTriggerRatio", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseAlgoOpts(instId), tpTriggerRatio: "0.3" });
      assert.equal(c.get().tpTriggerRatio, "0.3");
    });

    it("forwards slTriggerRatio", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseAlgoOpts(instId), slTriggerRatio: "0.05" });
      assert.equal(c.get().slTriggerRatio, "0.05");
    });

    it("forwards closeFraction", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseAlgoOpts(instId), closeFraction: "0.5" });
      assert.equal(c.get().closeFraction, "0.5");
    });

    it("forwards pxAmendType", async () => {
      const c = makeCapture();
      await cmd(c.runner, { ...baseAlgoOpts(instId), pxAmendType: "0" });
      assert.equal(c.get().pxAmendType, "0");
    });

    it("omits Phase 3a flags when not provided (backward compat)", async () => {
      const c = makeCapture();
      await cmd(c.runner, baseAlgoOpts(instId));
      for (const k of ["tpTriggerRatio", "slTriggerRatio", "closeFraction", "pxAmendType"]) {
        assert.equal(c.get()[k], undefined, `${k} must not leak into payload`);
      }
    });
  });
}
