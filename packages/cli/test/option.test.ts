import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  cmdOptionOrders,
  cmdOptionGet,
  cmdOptionPositions,
  cmdOptionFills,
  cmdOptionInstruments,
  cmdOptionGreeks,
  cmdOptionPlace,
  cmdOptionCancel,
  cmdOptionAmend,
  cmdOptionBatchCancel,
  cmdOptionAlgoPlace,
  cmdOptionAlgoAmend,
  cmdOptionAlgoCancel,
  cmdOptionAlgoOrders,
} from "../src/commands/option.js";
import { cmdSpotBatch } from "../src/commands/spot.js";
import { cmdSwapBatch } from "../src/commands/swap.js";
import { cmdAccountAudit } from "../src/commands/account.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { setOutput, resetOutput } from "../src/formatter.js";

/** Find valid JSON in captured output (tolerates parallel test output mixing in Node 18). */
function findJson(output: string[]): string {
  const joined = output.join("");
  try { JSON.parse(joined); return joined; } catch {}
  for (const chunk of output) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try { JSON.parse(trimmed); return trimmed; } catch {}
    }
  }
  return joined;
}


let out: string[] = [];
let err: string[] = [];

beforeEach(() => {
  out = []; err = [];
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
});
afterEach(() => resetOutput());

function createMockRunner(data: unknown = [{ ordId: "123", sCode: "0" }]): ToolRunner {
  return async () => ({ endpoint: "GET /api/v5/test", requestTime: new Date().toISOString(), data });
}

// ---------------------------------------------------------------------------
// Option commands
// ---------------------------------------------------------------------------
describe("cmdOptionOrders", () => {
  it("outputs table for non-json mode", async () => {
    const runner = createMockRunner([{ ordId: "1", instId: "BTC-USD-241227-50000-C", side: "buy", ordType: "limit", px: "0.05", sz: "1", state: "live" }]);
    await cmdOptionOrders(runner, { status: "live", json: false });
    assert.ok(out.join("").includes("BTC-USD"), "should show instId");
  });

  it("outputs JSON in json mode", async () => {
    const runner = createMockRunner([{ ordId: "1" }]);
    await cmdOptionOrders(runner, { status: "live", json: true });
    assert.ok(out.join("").includes('"ordId"'), "should output JSON");
  });
});

describe("cmdOptionGet", () => {
  it("shows order details", async () => {
    const runner = createMockRunner([{ ordId: "1", instId: "BTC-USD-241227-50000-C", side: "buy", ordType: "limit", px: "0.05", sz: "1", fillSz: "0", avgPx: "0", state: "live", cTime: "1700000000000" }]);
    await cmdOptionGet(runner, { instId: "BTC-USD-241227-50000-C", json: false });
    assert.ok(out.join("").includes("ordId"), "should show ordId");
  });

  it("shows 'No data' when empty", async () => {
    const runner = createMockRunner([]);
    await cmdOptionGet(runner, { instId: "X", json: false });
    assert.ok(out.join("").includes("No data"));
  });
});

describe("cmdOptionPositions", () => {
  it("shows 'No open positions' when empty", async () => {
    const runner = createMockRunner([{ pos: "0" }]);
    await cmdOptionPositions(runner, { json: false });
    assert.ok(out.join("").includes("No open positions"));
  });

  it("shows positions with Greeks", async () => {
    const runner = createMockRunner([{ instId: "BTC-USD-241227-50000-C", posSide: "long", pos: "1", avgPx: "0.05", upl: "10", deltaPA: "0.5", gammaPA: "0.01", thetaPA: "-1", vegaPA: "100" }]);
    await cmdOptionPositions(runner, { json: false });
    assert.ok(out.join("").includes("delta"), "should show delta column");
  });
});

describe("cmdOptionFills", () => {
  it("outputs fill table", async () => {
    const runner = createMockRunner([{ instId: "BTC-USD-241227-50000-C", side: "buy", fillPx: "0.05", fillSz: "1", fee: "-0.001", ts: "1700000000000" }]);
    await cmdOptionFills(runner, { archive: false, json: false });
    assert.ok(out.join("").includes("fillPx"), "should show fillPx column");
  });
});

describe("cmdOptionInstruments", () => {
  it("outputs instruments table", async () => {
    const runner = createMockRunner([{ instId: "BTC-USD-241227-50000-C", uly: "BTC-USD", expTime: "241227", stk: "50000", optType: "C", state: "live" }]);
    await cmdOptionInstruments(runner, { uly: "BTC-USD", json: false });
    assert.ok(out.join("").includes("optType"), "should show optType column");
  });
});

describe("cmdOptionGreeks", () => {
  it("outputs greeks table", async () => {
    const runner = createMockRunner([{ instId: "BTC-USD-241227-50000-C", deltaBS: "0.5", gammaBS: "0.01", thetaBS: "-1", vegaBS: "100", markVol: "0.6", markPx: "0.05" }]);
    await cmdOptionGreeks(runner, { uly: "BTC-USD", json: false });
    assert.ok(out.join("").includes("delta"), "should show delta column");
    assert.ok(out.join("").includes("iv"), "should show iv column");
  });
});

describe("cmdOptionPlace", () => {
  it("outputs order confirmation", async () => {
    const runner = createMockRunner([{ ordId: "999", sCode: "0" }]);
    await cmdOptionPlace(runner, { instId: "BTC-USD-241227-50000-C", tdMode: "cash", side: "buy", ordType: "limit", sz: "1", px: "0.05", json: false });
    assert.ok(out.join("").includes("Order placed"));
    assert.ok(out.join("").includes("999"));
  });
});

describe("cmdOptionCancel", () => {
  it("outputs cancel confirmation", async () => {
    const runner = createMockRunner([{ ordId: "999", sCode: "0" }]);
    await cmdOptionCancel(runner, { instId: "BTC-USD-241227-50000-C", ordId: "999", json: false });
    assert.ok(out.join("").includes("Cancelled"));
  });
});

describe("cmdOptionAmend", () => {
  it("outputs amend confirmation", async () => {
    const runner = createMockRunner([{ ordId: "999", sCode: "0" }]);
    await cmdOptionAmend(runner, { instId: "BTC-USD-241227-50000-C", ordId: "999", newPx: "0.06", json: false });
    assert.ok(out.join("").includes("Amended"));
  });
});

describe("cmdOptionBatchCancel", () => {
  it("outputs batch cancel results", async () => {
    const runner = createMockRunner([{ ordId: "1", sCode: "0" }, { ordId: "2", sCode: "0" }]);
    await cmdOptionBatchCancel(runner, { orders: '[{"instId":"BTC-USD-241227-50000-C","ordId":"1"},{"instId":"BTC-USD-241227-50000-C","ordId":"2"}]', json: false });
    assert.ok(out.join("").includes("1: OK"));
    assert.ok(out.join("").includes("2: OK"));
  });

  it("rejects invalid JSON", async () => {
    const origCode = process.exitCode;
    const runner = createMockRunner();
    await cmdOptionBatchCancel(runner, { orders: "not json", json: false });
    assert.ok(err.join("").includes("valid JSON"));
    process.exitCode = origCode;
  });

  it("rejects empty array", async () => {
    const origCode = process.exitCode;
    const runner = createMockRunner();
    await cmdOptionBatchCancel(runner, { orders: "[]", json: false });
    assert.ok(err.join("").includes("non-empty"));
    process.exitCode = origCode;
  });
});

describe("cmdOptionPlace tgtCcy routing", () => {
  it("passes tgtCcy to runner when provided", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => {
      capturedArgs = args as Record<string, unknown>;
      return { endpoint: "POST /api/v5/trade/order", requestTime: new Date().toISOString(), data: [{ ordId: "1", sCode: "0" }] };
    };
    await cmdOptionPlace(runner, {
      instId: "BTC-USD-241227-50000-C",
      tdMode: "cash",
      side: "buy",
      ordType: "limit",
      sz: "1",
      px: "0.05",
      tgtCcy: "USDT",
      json: false,
    });
    assert.equal(capturedArgs["tgtCcy"], "USDT", "tgtCcy should be routed to runner");
  });

  it("tgtCcy is undefined when not provided", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => {
      capturedArgs = args as Record<string, unknown>;
      return { endpoint: "POST /api/v5/trade/order", requestTime: new Date().toISOString(), data: [{ ordId: "1", sCode: "0" }] };
    };
    await cmdOptionPlace(runner, {
      instId: "BTC-USD-241227-50000-C",
      tdMode: "cash",
      side: "buy",
      ordType: "limit",
      sz: "1",
      px: "0.05",
      json: false,
    });
    assert.equal(capturedArgs["tgtCcy"], undefined, "tgtCcy should be undefined when not passed");
  });
});

describe("cmdOptionPlace with TP/SL", () => {
  it("passes tpTriggerPx and slTriggerPx to runner", async () => {
    let capturedArgs: Record<string, unknown> = {};
    const runner: ToolRunner = async (_name, args) => {
      capturedArgs = args as Record<string, unknown>;
      return { endpoint: "POST /api/v5/trade/order", requestTime: new Date().toISOString(), data: [{ ordId: "1", sCode: "0" }] };
    };
    await cmdOptionPlace(runner, {
      instId: "BTC-USD-241227-50000-C",
      tdMode: "cash",
      side: "buy",
      ordType: "limit",
      sz: "1",
      px: "0.05",
      tpTriggerPx: "0.08",
      tpOrdPx: "-1",
      slTriggerPx: "0.03",
      slOrdPx: "-1",
      json: false,
    });
    assert.equal(capturedArgs["tpTriggerPx"], "0.08");
    assert.equal(capturedArgs["slTriggerPx"], "0.03");
  });
});

describe("cmdOptionAlgoPlace", () => {
  it("outputs algo order confirmation", async () => {
    const runner = createMockRunner([{ algoId: "A001", sCode: "0" }]);
    await cmdOptionAlgoPlace(runner, {
      instId: "BTC-USD-241227-50000-C",
      tdMode: "cash",
      side: "buy",
      ordType: "conditional",
      sz: "1",
      tpTriggerPx: "0.08",
      tpOrdPx: "-1",
      json: false,
    });
    assert.ok(out.join("").includes("Algo order placed"));
    assert.ok(out.join("").includes("A001"));
  });

  it("outputs JSON in json mode", async () => {
    const runner = createMockRunner([{ algoId: "A001", sCode: "0" }]);
    await cmdOptionAlgoPlace(runner, {
      instId: "BTC-USD-241227-50000-C",
      tdMode: "cash",
      side: "buy",
      ordType: "conditional",
      sz: "1",
      json: true,
    });
    assert.ok(out.join("").includes('"algoId"'));
  });
});

describe("cmdOptionAlgoAmend", () => {
  it("outputs amend confirmation", async () => {
    const runner = createMockRunner([{ algoId: "A001", sCode: "0" }]);
    await cmdOptionAlgoAmend(runner, {
      instId: "BTC-USD-241227-50000-C",
      algoId: "A001",
      newTpTriggerPx: "0.09",
      json: false,
    });
    assert.ok(out.join("").includes("Algo order amended"));
    assert.ok(out.join("").includes("A001"));
  });
});

describe("cmdOptionAlgoCancel", () => {
  it("outputs cancel confirmation", async () => {
    const runner = createMockRunner([{ algoId: "A001", sCode: "0" }]);
    await cmdOptionAlgoCancel(runner, { instId: "BTC-USD-241227-50000-C", algoId: "A001", json: false });
    assert.ok(out.join("").includes("Algo order cancelled"));
  });
});

describe("cmdOptionAlgoOrders", () => {
  it("shows 'No algo orders' when empty", async () => {
    const runner = createMockRunner([]);
    await cmdOptionAlgoOrders(runner, { status: "pending", json: false });
    assert.ok(out.join("").includes("No algo orders"));
  });

  it("outputs table for pending orders", async () => {
    const runner = createMockRunner([{
      algoId: "A001",
      instId: "BTC-USD-241227-50000-C",
      ordType: "conditional",
      side: "sell",
      sz: "1",
      tpTriggerPx: "0.08",
      slTriggerPx: "0.03",
      state: "live",
    }]);
    await cmdOptionAlgoOrders(runner, { status: "pending", json: false });
    assert.ok(out.join("").includes("algoId"), "should show algoId column");
  });

  it("outputs JSON in json mode", async () => {
    const runner = createMockRunner([{ algoId: "A001" }]);
    await cmdOptionAlgoOrders(runner, { status: "pending", json: true });
    assert.ok(out.join("").includes('"algoId"'));
  });
});

// ---------------------------------------------------------------------------
// Batch commands (spot + swap)
// ---------------------------------------------------------------------------
describe("cmdSpotBatch", () => {
  it("rejects invalid JSON", async () => {
    const origCode = process.exitCode;
    const runner = createMockRunner();
    await cmdSpotBatch(runner, { action: "place", orders: "{bad", json: false });
    assert.ok(err.join("").includes("valid JSON"));
    process.exitCode = origCode;
  });

  it("rejects invalid action", async () => {
    const origCode = process.exitCode;
    const runner = createMockRunner();
    await cmdSpotBatch(runner, { action: "nope", orders: '[{"instId":"BTC-USDT"}]', json: false });
    assert.ok(err.join("").includes("place, amend, cancel"));
    process.exitCode = origCode;
  });

  it("outputs results for valid batch", async () => {
    const runner = createMockRunner([{ ordId: "1", sCode: "0" }]);
    await cmdSpotBatch(runner, { action: "cancel", orders: '[{"instId":"BTC-USDT","ordId":"1"}]', json: false });
    assert.ok(out.join("").includes("OK"));
  });
});

describe("cmdSwapBatch", () => {
  it("rejects empty array", async () => {
    const origCode = process.exitCode;
    const runner = createMockRunner();
    await cmdSwapBatch(runner, { action: "place", orders: "[]", json: false });
    assert.ok(err.join("").includes("non-empty"));
    process.exitCode = origCode;
  });

  it("outputs results for valid batch", async () => {
    const runner = createMockRunner([{ ordId: "1", sCode: "0" }]);
    await cmdSwapBatch(runner, { action: "amend", orders: '[{"instId":"BTC-USDT-SWAP","ordId":"1","newPx":"50000"}]', json: false });
    assert.ok(out.join("").includes("OK"));
  });
});

// ---------------------------------------------------------------------------
// Audit command
// ---------------------------------------------------------------------------
describe("cmdAccountAudit", () => {
  it("shows 'No audit log entries' when no logs exist", async () => {
    cmdAccountAudit({ json: false });
    assert.ok(out.join("").includes("No audit log entries") || out.join("").includes("timestamp"), "should show empty message or log entries");
  });

  it("outputs JSON in json mode", async () => {
    cmdAccountAudit({ json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });

  it("respects --tool filter", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-audit-"));
    const logDir = path.join(tmpDir, ".okx", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const logFile = path.join(logDir, `trade-${yyyy}-${mm}-${dd}.log`);
    fs.writeFileSync(logFile, [
      JSON.stringify({ timestamp: now.toISOString(), tool: "spot_place_order", level: "INFO", durationMs: 100 }),
      JSON.stringify({ timestamp: now.toISOString(), tool: "swap_place_order", level: "INFO", durationMs: 200 }),
    ].join("\n"));

    const origHome = process.env.HOME;
    process.env.HOME = tmpDir;
    try {
      cmdAccountAudit({ tool: "spot_place_order", json: true });
      const entries = JSON.parse(findJson(out)) as unknown[];
      assert.equal(entries.length, 1, "should filter to 1 entry");
    } finally {
      process.env.HOME = origHome;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
