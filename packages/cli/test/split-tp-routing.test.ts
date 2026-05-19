/**
 * Phase 3b — split TP routing tests (issue #183, CLI-only no MCP/skill exposure)
 *
 * Verifies:
 * 1. --tpLevel (single) → tpLevels array of length 1 in runner args
 * 2. --tpLevel --tpLevel (two) → tpLevels array of length 2 with all fields preserved
 * 3. --tpLevel + --tpTriggerPx → conflict error thrown at dispatch
 * 4. --tpLevel + --tpOrdPx → conflict error thrown at dispatch
 * 5. Full kv key-set round-trips correctly (px, sz, kind, triggerPx, triggerPxType, amendPxOnTrigger, clOrdId)
 * 6. Invalid kv syntax throws helpful error
 * 7. Unknown kv key throws helpful error
 * 8. No --tpLevel + no single-TP → tpLevels absent from args (backward compat)
 * 9. buildAttachAlgoOrds with tpLevels array → returns array of correct length
 * 10. buildAttachAlgoOrds single-TP path unchanged (backward compat)
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { cmdSwapPlace, cmdSwapAlgoPlace } from "../src/commands/swap.js";
import { cmdSpotPlace, cmdSpotAlgoPlace } from "../src/commands/spot.js";
import { cmdFuturesPlace, cmdFuturesAlgoPlace } from "../src/commands/futures.js";
import { parseTpLevel } from "../src/parser.js";
import { buildAttachAlgoOrds } from "../../core/src/tools/helpers.js";
import { setOutput, resetOutput } from "../src/formatter.js";
import {
  assertNoTpConflict,
  handleSpotAlgoCommand,
  handleSwapAlgoCommand,
  handleFuturesAlgoCommand,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Shared spy runner + output harness (reuses makeCapture pattern from Phase 1+2)
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
// parseTpLevel unit tests
// ---------------------------------------------------------------------------

describe("parseTpLevel - kv mini-DSL", () => {
  it("parses px:price,sz:size,kind:limit", () => {
    const result = parseTpLevel("px:78000,sz:0.5,kind:limit");
    assert.equal(result.tpOrdPx, "78000");
    assert.equal(result.sz, "0.5");
    assert.equal(result.tpOrdKind, "limit");
  });

  it("parses triggerPx key -> tpTriggerPx", () => {
    const result = parseTpLevel("triggerPx:75000,sz:0.5");
    assert.equal(result.tpTriggerPx, "75000");
    assert.equal(result.sz, "0.5");
  });

  it("parses triggerPxType key -> tpTriggerPxType", () => {
    const result = parseTpLevel("px:78000,sz:0.5,triggerPxType:mark");
    assert.equal(result.tpTriggerPxType, "mark");
  });

  it("parses amendPxOnTrigger key -> amendPxOnTriggerType", () => {
    const result = parseTpLevel("px:78000,sz:0.5,amendPxOnTrigger:1");
    assert.equal(result.amendPxOnTriggerType, "1");
  });

  it("parses clOrdId key -> attachAlgoClOrdId", () => {
    const result = parseTpLevel("px:78000,sz:0.5,clOrdId:mytp1");
    assert.equal(result.attachAlgoClOrdId, "mytp1");
  });

  it("all valid keys round-trip", () => {
    const result = parseTpLevel(
      "px:78000,sz:0.5,kind:limit,triggerPx:77000,triggerPxType:last,amendPxOnTrigger:0,clOrdId:tp1",
    );
    assert.equal(result.tpOrdPx, "78000");
    assert.equal(result.sz, "0.5");
    assert.equal(result.tpOrdKind, "limit");
    assert.equal(result.tpTriggerPx, "77000");
    assert.equal(result.tpTriggerPxType, "last");
    assert.equal(result.amendPxOnTriggerType, "0");
    assert.equal(result.attachAlgoClOrdId, "tp1");
  });

  it("throws on invalid syntax (= instead of :)", () => {
    assert.throws(
      () => parseTpLevel("px=78000,sz:0.5"),
      (err: Error) => err.message.includes("Invalid --tpLevel format"),
    );
  });

  it("throws on unknown key", () => {
    assert.throws(
      () => parseTpLevel("unknownKey:value,sz:0.5"),
      (err: Error) => err.message.includes("Unknown --tpLevel key"),
    );
  });

  it("throws on empty string", () => {
    assert.throws(
      () => parseTpLevel(""),
      (err: Error) => err.message.includes("Invalid --tpLevel format"),
    );
  });
});

// ---------------------------------------------------------------------------
// buildAttachAlgoOrds — tpLevels multi-entry path
// ---------------------------------------------------------------------------

describe("buildAttachAlgoOrds - tpLevels multi-entry path", () => {
  it("single tpLevels entry -> array of length 1", () => {
    const result = buildAttachAlgoOrds({
      tpLevels: [{ tpOrdPx: "78000", sz: "0.5", tpOrdKind: "limit" }],
    });
    assert.ok(Array.isArray(result), "should return array");
    assert.equal(result!.length, 1);
    assert.equal(result![0]!.tpOrdPx, "78000");
    assert.equal(result![0]!.sz, "0.5");
    assert.equal(result![0]!.tpOrdKind, "limit");
  });

  it("two tpLevels entries -> array of length 2 with both fields preserved", () => {
    const result = buildAttachAlgoOrds({
      tpLevels: [
        { tpOrdPx: "78000", sz: "0.5" },
        { tpOrdPx: "81000", sz: "0.5" },
      ],
    });
    assert.ok(Array.isArray(result));
    assert.equal(result!.length, 2);
    assert.equal(result![0]!.tpOrdPx, "78000");
    assert.equal(result![1]!.tpOrdPx, "81000");
  });

  it("tpLevels with undefined values are compacted out", () => {
    const result = buildAttachAlgoOrds({
      tpLevels: [{ tpOrdPx: "78000", sz: undefined }],
    });
    assert.ok(Array.isArray(result));
    assert.equal(result!.length, 1);
    assert.equal(result![0]!.tpOrdPx, "78000");
    assert.equal("sz" in result![0]!, false);
  });

  it("empty tpLevels array -> falls through to single-entry path (returns undefined for no single-TP fields)", () => {
    const result = buildAttachAlgoOrds({ tpLevels: [] });
    assert.equal(result, undefined);
  });

  it("backward compat: single-TP fields path still works (no tpLevels)", () => {
    const result = buildAttachAlgoOrds({ tpTriggerPx: "75000", tpOrdPx: "76000" });
    assert.ok(Array.isArray(result));
    assert.equal(result!.length, 1);
    assert.equal(result![0]!.tpTriggerPx, "75000");
  });

  it("backward compat: no TP fields -> returns undefined", () => {
    const result = buildAttachAlgoOrds({ instId: "BTC-USDT-SWAP" });
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// Module table — cmdXxxPlace + cmdXxxAlgoPlace all accept tpLevels
// ---------------------------------------------------------------------------

type PlaceCmd = (runner: ToolRunner, opts: Record<string, unknown>) => Promise<void>;
type AlgoCmd = (runner: ToolRunner, opts: Record<string, unknown>) => Promise<void>;

const PLACE_MODULES: Array<{ name: string; cmd: PlaceCmd; instId: string; tdMode: string }> = [
  { name: "swap", cmd: cmdSwapPlace as unknown as PlaceCmd, instId: "BTC-USDT-SWAP", tdMode: "cross" },
  { name: "spot", cmd: cmdSpotPlace as unknown as PlaceCmd, instId: "BTC-USDT", tdMode: "cash" },
  { name: "futures", cmd: cmdFuturesPlace as unknown as PlaceCmd, instId: "BTC-USDT-250926", tdMode: "cross" },
];

const ALGO_MODULES: Array<{ name: string; cmd: AlgoCmd; instId: string }> = [
  { name: "swap", cmd: cmdSwapAlgoPlace as unknown as AlgoCmd, instId: "BTC-USDT-SWAP" },
  { name: "spot", cmd: cmdSpotAlgoPlace as unknown as AlgoCmd, instId: "BTC-USDT" },
  { name: "futures", cmd: cmdFuturesAlgoPlace as unknown as AlgoCmd, instId: "BTC-USDT-250926" },
];

function basePlaceOpts(instId: string, tdMode: string): Record<string, unknown> {
  return { instId, side: "buy", ordType: "limit", sz: "1", tdMode, px: "50000", json: false };
}

function baseAlgoOpts(instId: string): Record<string, unknown> {
  return { instId, side: "sell", ordType: "conditional", sz: "1", tdMode: "cross", json: false };
}

// ---------------------------------------------------------------------------
// Place commands: single --tpLevel forwarded as tpLevels array
// ---------------------------------------------------------------------------

for (const { name, cmd, instId, tdMode } of PLACE_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}Place - Phase 3b tpLevels`, () => {
    it("single tpLevels entry -> tpLevels array of length 1 forwarded to runner", async () => {
      const c = makeCapture();
      const tpLevels = [{ tpOrdPx: "78000", sz: "0.5", tpOrdKind: "limit" }];
      await cmd(c.runner, { ...basePlaceOpts(instId, tdMode), tpLevels });
      const got = c.get().tpLevels as unknown[];
      assert.ok(Array.isArray(got), "tpLevels should be array");
      assert.equal(got.length, 1);
      assert.equal((got[0] as Record<string, unknown>).tpOrdPx, "78000");
    });

    it("two tpLevels entries -> array of length 2 forwarded to runner", async () => {
      const c = makeCapture();
      const tpLevels = [
        { tpOrdPx: "78000", sz: "0.5" },
        { tpOrdPx: "81000", sz: "0.5" },
      ];
      await cmd(c.runner, { ...basePlaceOpts(instId, tdMode), tpLevels });
      const got = c.get().tpLevels as unknown[];
      assert.ok(Array.isArray(got));
      assert.equal(got.length, 2);
      assert.equal((got[0] as Record<string, unknown>).tpOrdPx, "78000");
      assert.equal((got[1] as Record<string, unknown>).tpOrdPx, "81000");
    });

    it("no tpLevels -> tpLevels not present in runner args (backward compat)", async () => {
      const c = makeCapture();
      await cmd(c.runner, basePlaceOpts(instId, tdMode));
      assert.equal(c.get().tpLevels, undefined);
    });
  });
}

// ---------------------------------------------------------------------------
// Algo-place commands: tpLevels forwarded
// ---------------------------------------------------------------------------

for (const { name, cmd, instId } of ALGO_MODULES) {
  describe(`cmd${name[0]!.toUpperCase()}${name.slice(1)}AlgoPlace - Phase 3b tpLevels`, () => {
    it("single tpLevels entry forwarded to runner", async () => {
      const c = makeCapture();
      const tpLevels = [{ tpOrdPx: "78000", sz: "0.5" }];
      await cmd(c.runner, { ...baseAlgoOpts(instId), tpLevels });
      const got = c.get().tpLevels as unknown[];
      assert.ok(Array.isArray(got));
      assert.equal(got.length, 1);
    });

    it("two tpLevels entries -> array of length 2", async () => {
      const c = makeCapture();
      const tpLevels = [{ tpOrdPx: "78000", sz: "0.5" }, { tpOrdPx: "82000", sz: "0.5" }];
      await cmd(c.runner, { ...baseAlgoOpts(instId), tpLevels });
      const got = c.get().tpLevels as unknown[];
      assert.ok(Array.isArray(got));
      assert.equal(got.length, 2);
    });

    it("no tpLevels -> tpLevels absent from runner args", async () => {
      const c = makeCapture();
      await cmd(c.runner, baseAlgoOpts(instId));
      assert.equal(c.get().tpLevels, undefined);
    });
  });
}

// ---------------------------------------------------------------------------
// Conflict detection: --tpLevel + single-TP fields → error in dispatch layer
// (tested via assertNoTpConflict exported from index.ts)
// ---------------------------------------------------------------------------

describe("conflict detection - tpLevel + single-TP fields", () => {
  it("throws when tpLevel array is non-empty AND tpTriggerPx is set", () => {
    assert.throws(
      () => assertNoTpConflict(["px:78000,sz:0.5"], { tpTriggerPx: "77000" }),
      (err: Error) => err.message.includes("--tpLevel") && err.message.includes("--tpTriggerPx"),
    );
  });

  it("throws when tpLevel array is non-empty AND tpOrdPx is set", () => {
    assert.throws(
      () => assertNoTpConflict(["px:78000,sz:0.5"], { tpOrdPx: "78000" }),
      (err: Error) => err.message.includes("--tpLevel") && err.message.includes("--tpOrdPx"),
    );
  });

  it("does not throw when tpLevel is empty array (no flag passed)", () => {
    // Should not throw
    assertNoTpConflict([], { tpTriggerPx: "77000" });
    assertNoTpConflict(undefined, { tpTriggerPx: "77000" });
  });

  it("does not throw when tpLevel is set but no single-TP fields", () => {
    assertNoTpConflict(["px:78000,sz:0.5"], {});
  });
});

// ---------------------------------------------------------------------------
// Conflict detection integration: handleXxxAlgoCommand dispatch layer
// Each test exercises the full dispatch path (not assertNoTpConflict in isolation)
// to confirm the guard is wired in handleSpotAlgoCommand / handleSwapAlgoCommand /
// handleFuturesAlgoCommand before cmdXxxAlgoPlace is called.
// ---------------------------------------------------------------------------

const ALGO_DISPATCH_CASES: Array<{
  name: string;
  handler: (run: ToolRunner, subAction: string, v: import("../src/parser.js").CliValues, json: boolean) => Promise<void> | void;
  instId: string;
}> = [
  { name: "spot",    handler: handleSpotAlgoCommand,    instId: "BTC-USDT" },
  { name: "swap",    handler: handleSwapAlgoCommand,    instId: "BTC-USDT-SWAP" },
  { name: "futures", handler: handleFuturesAlgoCommand, instId: "BTC-USDT-250926" },
];

for (const { name, handler, instId } of ALGO_DISPATCH_CASES) {
  describe(`handle${name[0]!.toUpperCase()}${name.slice(1)}AlgoCommand - conflict detection integration`, () => {
    it("throws when --tpLevel AND --tpTriggerPx are both passed to algo place", () => {
      const { runner } = makeCapture();
      const v: import("../src/parser.js").CliValues = {
        instId,
        side: "sell",
        ordType: "conditional",
        sz: "1",
        tdMode: "cross",
        tpLevel: ["px:78000,sz:0.5"],
        tpTriggerPx: "77000",
      };
      assert.throws(
        () => handler(runner, "place", v, false),
        (err: Error) => err.message.includes("--tpLevel") && err.message.includes("--tpTriggerPx"),
      );
    });

    it("throws when --tpLevel AND --tpOrdPx are both passed to algo place", () => {
      const { runner } = makeCapture();
      const v: import("../src/parser.js").CliValues = {
        instId,
        side: "sell",
        ordType: "conditional",
        sz: "1",
        tdMode: "cross",
        tpLevel: ["px:78000,sz:0.5"],
        tpOrdPx: "78000",
      };
      assert.throws(
        () => handler(runner, "place", v, false),
        (err: Error) => err.message.includes("--tpLevel") && err.message.includes("--tpOrdPx"),
      );
    });
  });
}
