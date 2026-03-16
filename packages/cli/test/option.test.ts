import { describe, it } from "node:test";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  const restore = () => { process.stdout.write = orig; };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => { restore(); return chunks.join(""); }, (e) => { restore(); throw e; });
    }
  } catch (e) { restore(); throw e; }
  restore();
  return Promise.resolve(chunks.join(""));
}

function captureStderr(fn: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  const restore = () => { process.stderr.write = orig; };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => { restore(); return chunks.join(""); }, (e) => { restore(); throw e; });
    }
  } catch (e) { restore(); throw e; }
  restore();
  return Promise.resolve(chunks.join(""));
}

// Mock runner returning fake data
function createMockRunner(data: unknown = [{ ordId: "123", sCode: "0" }]): ToolRunner {
  return async () => ({
    endpoint: "GET /api/v5/test",
    requestTime: new Date().toISOString(),
    data,
  });
}

// ---------------------------------------------------------------------------
// Option commands
// ---------------------------------------------------------------------------
describe("cmdOptionOrders", () => {
  it("outputs table for non-json mode", async () => {
    const runner = createMockRunner([{ ordId: "1", instId: "BTC-USD-241227-50000-C", side: "buy", ordType: "limit", px: "0.05", sz: "1", state: "live" }]);
    const out = await captureStdout(() => cmdOptionOrders(runner, { status: "live", json: false }));
    assert.ok(out.includes("BTC-USD"), "should show instId");
  });

  it("outputs JSON in json mode", async () => {
    const runner = createMockRunner([{ ordId: "1" }]);
    const out = await captureStdout(() => cmdOptionOrders(runner, { status: "live", json: true }));
    assert.ok(out.includes('"ordId"'), "should output JSON");
  });
});

describe("cmdOptionGet", () => {
  it("shows order details", async () => {
    const runner = createMockRunner([{ ordId: "1", instId: "BTC-USD-241227-50000-C", side: "buy", ordType: "limit", px: "0.05", sz: "1", fillSz: "0", avgPx: "0", state: "live", cTime: "1700000000000" }]);
    const out = await captureStdout(() => cmdOptionGet(runner, { instId: "BTC-USD-241227-50000-C", json: false }));
    assert.ok(out.includes("ordId"), "should show ordId");
  });

  it("shows 'No data' when empty", async () => {
    const runner = createMockRunner([]);
    const out = await captureStdout(() => cmdOptionGet(runner, { instId: "X", json: false }));
    assert.ok(out.includes("No data"));
  });
});

describe("cmdOptionPositions", () => {
  it("shows 'No open positions' when empty", async () => {
    const runner = createMockRunner([{ pos: "0" }]);
    const out = await captureStdout(() => cmdOptionPositions(runner, { json: false }));
    assert.ok(out.includes("No open positions"));
  });

  it("shows positions with Greeks", async () => {
    const runner = createMockRunner([{ instId: "BTC-USD-241227-50000-C", posSide: "long", pos: "1", avgPx: "0.05", upl: "10", deltaPA: "0.5", gammaPA: "0.01", thetaPA: "-1", vegaPA: "100" }]);
    const out = await captureStdout(() => cmdOptionPositions(runner, { json: false }));
    assert.ok(out.includes("delta"), "should show delta column");
  });
});

describe("cmdOptionFills", () => {
  it("outputs fill table", async () => {
    const runner = createMockRunner([{ instId: "BTC-USD-241227-50000-C", side: "buy", fillPx: "0.05", fillSz: "1", fee: "-0.001", ts: "1700000000000" }]);
    const out = await captureStdout(() => cmdOptionFills(runner, { archive: false, json: false }));
    assert.ok(out.includes("fillPx"), "should show fillPx column");
  });
});

describe("cmdOptionInstruments", () => {
  it("outputs instruments table", async () => {
    const runner = createMockRunner([{ instId: "BTC-USD-241227-50000-C", uly: "BTC-USD", expTime: "241227", stk: "50000", optType: "C", state: "live" }]);
    const out = await captureStdout(() => cmdOptionInstruments(runner, { uly: "BTC-USD", json: false }));
    assert.ok(out.includes("optType"), "should show optType column");
  });
});

describe("cmdOptionGreeks", () => {
  it("outputs greeks table", async () => {
    const runner = createMockRunner([{ instId: "BTC-USD-241227-50000-C", deltaBS: "0.5", gammaBS: "0.01", thetaBS: "-1", vegaBS: "100", markVol: "0.6", markPx: "0.05" }]);
    const out = await captureStdout(() => cmdOptionGreeks(runner, { uly: "BTC-USD", json: false }));
    assert.ok(out.includes("delta"), "should show delta column");
    assert.ok(out.includes("iv"), "should show iv column");
  });
});

describe("cmdOptionPlace", () => {
  it("outputs order confirmation", async () => {
    const runner = createMockRunner([{ ordId: "999", sCode: "0" }]);
    const out = await captureStdout(() => cmdOptionPlace(runner, { instId: "BTC-USD-241227-50000-C", tdMode: "cash", side: "buy", ordType: "limit", sz: "1", px: "0.05", json: false }));
    assert.ok(out.includes("Order placed"));
    assert.ok(out.includes("999"));
  });
});

describe("cmdOptionCancel", () => {
  it("outputs cancel confirmation", async () => {
    const runner = createMockRunner([{ ordId: "999", sCode: "0" }]);
    const out = await captureStdout(() => cmdOptionCancel(runner, { instId: "BTC-USD-241227-50000-C", ordId: "999", json: false }));
    assert.ok(out.includes("Cancelled"));
  });
});

describe("cmdOptionAmend", () => {
  it("outputs amend confirmation", async () => {
    const runner = createMockRunner([{ ordId: "999", sCode: "0" }]);
    const out = await captureStdout(() => cmdOptionAmend(runner, { instId: "BTC-USD-241227-50000-C", ordId: "999", newPx: "0.06", json: false }));
    assert.ok(out.includes("Amended"));
  });
});

describe("cmdOptionBatchCancel", () => {
  it("outputs batch cancel results", async () => {
    const runner = createMockRunner([{ ordId: "1", sCode: "0" }, { ordId: "2", sCode: "0" }]);
    const out = await captureStdout(() => cmdOptionBatchCancel(runner, { orders: '[{"instId":"BTC-USD-241227-50000-C","ordId":"1"},{"instId":"BTC-USD-241227-50000-C","ordId":"2"}]', json: false }));
    assert.ok(out.includes("1: OK"));
    assert.ok(out.includes("2: OK"));
  });

  it("rejects invalid JSON", async () => {
    const runner = createMockRunner();
    const origCode = process.exitCode;
    const err = await captureStderr(() => cmdOptionBatchCancel(runner, { orders: "not json", json: false }));
    assert.ok(err.includes("valid JSON"));
    process.exitCode = origCode;
  });

  it("rejects empty array", async () => {
    const runner = createMockRunner();
    const origCode = process.exitCode;
    const err = await captureStderr(() => cmdOptionBatchCancel(runner, { orders: "[]", json: false }));
    assert.ok(err.includes("non-empty"));
    process.exitCode = origCode;
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
    const out = await captureStdout(() => cmdOptionAlgoPlace(runner, {
      instId: "BTC-USD-241227-50000-C",
      tdMode: "cash",
      side: "buy",
      ordType: "conditional",
      sz: "1",
      tpTriggerPx: "0.08",
      tpOrdPx: "-1",
      json: false,
    }));
    assert.ok(out.includes("Algo order placed"));
    assert.ok(out.includes("A001"));
  });

  it("outputs JSON in json mode", async () => {
    const runner = createMockRunner([{ algoId: "A001", sCode: "0" }]);
    const out = await captureStdout(() => cmdOptionAlgoPlace(runner, {
      instId: "BTC-USD-241227-50000-C",
      tdMode: "cash",
      side: "buy",
      ordType: "conditional",
      sz: "1",
      json: true,
    }));
    assert.ok(out.includes('"algoId"'));
  });
});

describe("cmdOptionAlgoAmend", () => {
  it("outputs amend confirmation", async () => {
    const runner = createMockRunner([{ algoId: "A001", sCode: "0" }]);
    const out = await captureStdout(() => cmdOptionAlgoAmend(runner, {
      instId: "BTC-USD-241227-50000-C",
      algoId: "A001",
      newTpTriggerPx: "0.09",
      json: false,
    }));
    assert.ok(out.includes("Algo order amended"));
    assert.ok(out.includes("A001"));
  });
});

describe("cmdOptionAlgoCancel", () => {
  it("outputs cancel confirmation", async () => {
    const runner = createMockRunner([{ algoId: "A001", sCode: "0" }]);
    const out = await captureStdout(() => cmdOptionAlgoCancel(runner, { instId: "BTC-USD-241227-50000-C", algoId: "A001", json: false }));
    assert.ok(out.includes("Algo order cancelled"));
  });
});

describe("cmdOptionAlgoOrders", () => {
  it("shows 'No algo orders' when empty", async () => {
    const runner = createMockRunner([]);
    const out = await captureStdout(() => cmdOptionAlgoOrders(runner, { status: "pending", json: false }));
    assert.ok(out.includes("No algo orders"));
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
    const out = await captureStdout(() => cmdOptionAlgoOrders(runner, { status: "pending", json: false }));
    assert.ok(out.includes("algoId"), "should show algoId column");
  });

  it("outputs JSON in json mode", async () => {
    const runner = createMockRunner([{ algoId: "A001" }]);
    const out = await captureStdout(() => cmdOptionAlgoOrders(runner, { status: "pending", json: true }));
    assert.ok(out.includes('"algoId"'));
  });
});

// ---------------------------------------------------------------------------
// Batch commands (spot + swap)
// ---------------------------------------------------------------------------
describe("cmdSpotBatch", () => {
  it("rejects invalid JSON", async () => {
    const runner = createMockRunner();
    const origCode = process.exitCode;
    const err = await captureStderr(() => cmdSpotBatch(runner, { action: "place", orders: "{bad", json: false }));
    assert.ok(err.includes("valid JSON"));
    process.exitCode = origCode;
  });

  it("rejects invalid action", async () => {
    const runner = createMockRunner();
    const origCode = process.exitCode;
    const err = await captureStderr(() => cmdSpotBatch(runner, { action: "nope", orders: '[{"instId":"BTC-USDT"}]', json: false }));
    assert.ok(err.includes("place, amend, cancel"));
    process.exitCode = origCode;
  });

  it("outputs results for valid batch", async () => {
    const runner = createMockRunner([{ ordId: "1", sCode: "0" }]);
    const out = await captureStdout(() => cmdSpotBatch(runner, { action: "cancel", orders: '[{"instId":"BTC-USDT","ordId":"1"}]', json: false }));
    assert.ok(out.includes("OK"));
  });
});

describe("cmdSwapBatch", () => {
  it("rejects empty array", async () => {
    const runner = createMockRunner();
    const origCode = process.exitCode;
    const err = await captureStderr(() => cmdSwapBatch(runner, { action: "place", orders: "[]", json: false }));
    assert.ok(err.includes("non-empty"));
    process.exitCode = origCode;
  });

  it("outputs results for valid batch", async () => {
    const runner = createMockRunner([{ ordId: "1", sCode: "0" }]);
    const out = await captureStdout(() => cmdSwapBatch(runner, { action: "amend", orders: '[{"instId":"BTC-USDT-SWAP","ordId":"1","newPx":"50000"}]', json: false }));
    assert.ok(out.includes("OK"));
  });
});

// ---------------------------------------------------------------------------
// Audit command
// ---------------------------------------------------------------------------
describe("cmdAccountAudit", () => {
  it("shows 'No audit log entries' when no logs exist", async () => {
    const out = await captureStdout(() => cmdAccountAudit({ json: false }));
    assert.ok(out.includes("No audit log entries") || out.includes("timestamp"), "should show empty message or log entries");
  });

  it("outputs JSON in json mode", async () => {
    const out = await captureStdout(() => cmdAccountAudit({ json: true }));
    // Should be valid JSON (array)
    assert.doesNotThrow(() => JSON.parse(out));
  });

  it("respects --tool filter", async () => {
    // Create a temp log file
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
      const out = await captureStdout(() => cmdAccountAudit({ tool: "spot_place_order", json: true }));
      const entries = JSON.parse(out) as unknown[];
      assert.equal(entries.length, 1, "should filter to 1 entry");
    } finally {
      process.env.HOME = origHome;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
