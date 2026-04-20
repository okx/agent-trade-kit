import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  cmdSpotOrders,
  cmdSpotPlace,
  cmdSpotCancel,
  cmdSpotAlgoPlace,
  cmdSpotAlgoAmend,
  cmdSpotAlgoCancel,
  cmdSpotGet,
  cmdSpotAmend,
  cmdSpotAlgoOrders,
  cmdSpotFills,
  cmdSpotBatch,
} from "../src/commands/spot.js";
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

const fakeOrderResult = {
  endpoint: "POST /api/v5/trade/order",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "111222", sCode: "0", sMsg: "" }],
};
const fakeAlgoResult = {
  endpoint: "POST /api/v5/trade/order-algo",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "789012", sCode: "0", sMsg: "" }],
};
const fakeBatchResult = {
  endpoint: "POST /api/v5/trade/batch-orders",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "111", sCode: "0" }, { ordId: "222", sCode: "0" }],
};
const fakeOrdersResult = {
  endpoint: "GET /api/v5/trade/orders-pending",
  requestTime: new Date().toISOString(),
  data: [
    { ordId: "111", instId: "BTC-USDT", side: "buy", ordType: "limit", px: "50000", sz: "0.01", fillSz: "0", state: "live" },
  ],
};
const fakeFillsResult = {
  endpoint: "GET /api/v5/trade/fills",
  requestTime: new Date().toISOString(),
  data: [
    { instId: "BTC-USDT", side: "buy", fillPx: "50000", fillSz: "0.01", fee: "-0.001", ts: "1700000000000" },
  ],
};

// ---------------------------------------------------------------------------
// cmdSpotOrders
// ---------------------------------------------------------------------------
describe("cmdSpotOrders", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeOrdersResult;
    await cmdSpotOrders(runner, { status: "open", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_get_orders with status and optional instId", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeOrdersResult;
    };
    await cmdSpotOrders(runner, { instId: "BTC-USDT", status: "open", json: false });
    assert.equal(capturedTool, "spot_get_orders");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["status"], "open");
  });

  it("renders a table with order fields when json=false", async () => {
    const runner: ToolRunner = async () => fakeOrdersResult;
    await cmdSpotOrders(runner, { status: "open", json: false });
    const combined = out.join("");
    assert.ok(combined.includes("111"), "table should include ordId");
    assert.ok(combined.includes("BTC-USDT"), "table should include instId");
  });

  it("renders (no data) for empty orders list when json=false", async () => {
    const runner: ToolRunner = async () => ({ ...fakeOrdersResult, data: [] });
    await cmdSpotOrders(runner, { status: "open", json: false });
    assert.ok(out.join("").includes("no data"), "should show no data placeholder");
  });

  it("uses history status when specified", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return { ...fakeOrdersResult, data: [] };
    };
    await cmdSpotOrders(runner, { status: "history", json: false });
    assert.equal(capturedParams!["status"], "history");
  });
});

// ---------------------------------------------------------------------------
// cmdSpotPlace
// ---------------------------------------------------------------------------
describe("cmdSpotPlace", () => {
  const baseOpts = { instId: "BTC-USDT", side: "buy", ordType: "limit", sz: "0.01", px: "50000", json: false };

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    await cmdSpotPlace(runner, { ...baseOpts, json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_place_order with required params and defaults tdMode to cash", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeOrderResult;
    };
    await cmdSpotPlace(runner, baseOpts);
    assert.equal(capturedTool, "spot_place_order");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["tdMode"], "cash");
    assert.equal(capturedParams!["side"], "buy");
    assert.equal(capturedParams!["ordType"], "limit");
    assert.equal(capturedParams!["sz"], "0.01");
    assert.equal(capturedParams!["px"], "50000");
  });

  it("uses custom tdMode when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return fakeOrderResult;
    };
    await cmdSpotPlace(runner, { ...baseOpts, tdMode: "cross" });
    assert.equal(capturedParams!["tdMode"], "cross");
  });

  it("passes TP/SL params when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return fakeOrderResult;
    };
    await cmdSpotPlace(runner, {
      ...baseOpts,
      tpTriggerPx: "55000", tpOrdPx: "-1", slTriggerPx: "45000", slOrdPx: "-1",
    });
    assert.equal(capturedParams!["tpTriggerPx"], "55000");
    assert.equal(capturedParams!["tpOrdPx"], "-1");
    assert.equal(capturedParams!["slTriggerPx"], "45000");
    assert.equal(capturedParams!["slOrdPx"], "-1");
  });

  it("outputs success message with ordId when sCode=0", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    await cmdSpotPlace(runner, baseOpts);
    assert.ok(out.join("").includes("111222"), "output should contain ordId");
    assert.ok(out.join("").includes("OK"), "output should indicate success");
    assert.equal(err.join(""), "");
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const errorResult = { ...fakeOrderResult, data: [{ ordId: "", sCode: "51008", sMsg: "Insufficient balance" }] };
    const runner: ToolRunner = async () => errorResult;
    await cmdSpotPlace(runner, baseOpts);
    assert.ok(err.join("").includes("Insufficient balance"));
    assert.ok(err.join("").includes("51008"));
    assert.equal(out.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdSpotCancel
// ---------------------------------------------------------------------------
describe("cmdSpotCancel", () => {
  it("throws when neither ordId nor clOrdId is provided", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    await assert.rejects(
      () => cmdSpotCancel(runner, { instId: "BTC-USDT", json: false }),
      /ordId.*clOrdId|clOrdId.*ordId/i,
    );
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    await cmdSpotCancel(runner, { instId: "BTC-USDT", ordId: "111222", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_cancel_order with ordId", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeOrderResult;
    };
    await cmdSpotCancel(runner, { instId: "BTC-USDT", ordId: "111222", json: false });
    assert.equal(capturedTool, "spot_cancel_order");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["ordId"], "111222");
    assert.equal(capturedParams!["clOrdId"], undefined);
  });

  it("calls spot_cancel_order with clOrdId when ordId is absent", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return fakeOrderResult;
    };
    await cmdSpotCancel(runner, { instId: "BTC-USDT", clOrdId: "my-order", json: false });
    assert.equal(capturedParams!["clOrdId"], "my-order");
    assert.equal(capturedParams!["ordId"], undefined);
  });

  it("outputs success message on cancel", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    await cmdSpotCancel(runner, { instId: "BTC-USDT", ordId: "111222", json: false });
    assert.ok(out.join("").includes("Cancelled"));
    assert.ok(out.join("").includes("111222"));
    assert.ok(out.join("").includes("OK"));
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const errorResult = { ...fakeOrderResult, data: [{ ordId: "", sCode: "51401", sMsg: "Order does not exist" }] };
    const runner: ToolRunner = async () => errorResult;
    await cmdSpotCancel(runner, { instId: "BTC-USDT", ordId: "bad-id", json: false });
    assert.ok(err.join("").includes("Order does not exist"));
    assert.ok(err.join("").includes("51401"));
  });
});

// ---------------------------------------------------------------------------
// cmdSpotAlgoPlace
// ---------------------------------------------------------------------------
describe("cmdSpotAlgoPlace", () => {
  const baseOpts = {
    instId: "BTC-USDT", side: "buy", ordType: "conditional", sz: "0.01",
    tpTriggerPx: "55000", slTriggerPx: "45000", json: false,
  };

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdSpotAlgoPlace(runner, { ...baseOpts, json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_place_algo_order with required params and defaults tdMode to cash", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeAlgoResult;
    };
    await cmdSpotAlgoPlace(runner, baseOpts);
    assert.equal(capturedTool, "spot_place_algo_order");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["tdMode"], "cash");
    assert.equal(capturedParams!["ordType"], "conditional");
    assert.equal(capturedParams!["tpTriggerPx"], "55000");
    assert.equal(capturedParams!["slTriggerPx"], "45000");
  });

  it("passes callbackRatio and activePx when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return fakeAlgoResult;
    };
    await cmdSpotAlgoPlace(runner, {
      ...baseOpts, callbackRatio: "0.05", activePx: "50000",
    });
    assert.equal(capturedParams!["callbackRatio"], "0.05");
    assert.equal(capturedParams!["activePx"], "50000");
  });

  it("outputs algoId on success", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdSpotAlgoPlace(runner, baseOpts);
    assert.ok(out.join("").includes("789012"), "output should contain algoId");
    assert.ok(out.join("").includes("OK"), "output should indicate success");
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const errorResult = { ...fakeAlgoResult, data: [{ algoId: "", sCode: "51008", sMsg: "Balance not enough" }] };
    const runner: ToolRunner = async () => errorResult;
    await cmdSpotAlgoPlace(runner, baseOpts);
    assert.ok(err.join("").includes("Balance not enough"));
    assert.ok(err.join("").includes("51008"));
  });
});

// ---------------------------------------------------------------------------
// cmdSpotAlgoAmend
// ---------------------------------------------------------------------------
describe("cmdSpotAlgoAmend", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdSpotAlgoAmend(runner, { instId: "BTC-USDT", algoId: "789012", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_amend_algo_order with correct params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeAlgoResult;
    };
    await cmdSpotAlgoAmend(runner, {
      instId: "BTC-USDT",
      algoId: "789012",
      newTpTriggerPx: "56000",
      newSlTriggerPx: "44000",
      json: false,
    });
    assert.equal(capturedTool, "spot_amend_algo_order");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["algoId"], "789012");
    assert.equal(capturedParams!["newTpTriggerPx"], "56000");
    assert.equal(capturedParams!["newSlTriggerPx"], "44000");
    assert.equal(capturedParams!["newSz"], undefined);
  });

  it("outputs algoId on success", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdSpotAlgoAmend(runner, { instId: "BTC-USDT", algoId: "789012", json: false });
    assert.ok(out.join("").includes("789012"));
    assert.ok(out.join("").includes("OK"));
  });
});

// ---------------------------------------------------------------------------
// cmdSpotAlgoCancel
// ---------------------------------------------------------------------------
describe("cmdSpotAlgoCancel", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdSpotAlgoCancel(runner, "BTC-USDT", "789012", true);
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_cancel_algo_order with instId and algoId", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeAlgoResult;
    };
    await cmdSpotAlgoCancel(runner, "BTC-USDT", "789012", false);
    assert.equal(capturedTool, "spot_cancel_algo_order");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["algoId"], "789012");
  });

  it("outputs cancelled algoId on success", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdSpotAlgoCancel(runner, "BTC-USDT", "789012", false);
    assert.ok(out.join("").includes("789012"));
    assert.ok(out.join("").includes("OK"));
  });
});

// ---------------------------------------------------------------------------
// cmdSpotGet
// ---------------------------------------------------------------------------
describe("cmdSpotGet", () => {
  const fakeGetResult = {
    endpoint: "GET /api/v5/trade/order",
    requestTime: new Date().toISOString(),
    data: [{
      ordId: "111222", instId: "BTC-USDT", side: "buy", ordType: "limit",
      px: "50000", sz: "0.01", fillSz: "0", avgPx: "0", state: "live",
      cTime: "1700000000000",
    }],
  };

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeGetResult;
    await cmdSpotGet(runner, { instId: "BTC-USDT", ordId: "111222", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_get_order with instId and ordId", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeGetResult;
    };
    await cmdSpotGet(runner, { instId: "BTC-USDT", ordId: "111222", json: false });
    assert.equal(capturedTool, "spot_get_order");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["ordId"], "111222");
  });

  it("renders key-value output with order fields when json=false", async () => {
    const runner: ToolRunner = async () => fakeGetResult;
    await cmdSpotGet(runner, { instId: "BTC-USDT", ordId: "111222", json: false });
    const combined = out.join("");
    assert.ok(combined.includes("111222"), "output should include ordId");
    assert.ok(combined.includes("BTC-USDT"), "output should include instId");
    assert.ok(combined.includes("50000"), "output should include price");
  });

  it("outputs 'No data' when data array is empty", async () => {
    const runner: ToolRunner = async () => ({ ...fakeGetResult, data: [] });
    await cmdSpotGet(runner, { instId: "BTC-USDT", ordId: "111222", json: false });
    assert.ok(out.join("").includes("No data"), "should indicate no data");
  });

  it("passes clOrdId when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return fakeGetResult;
    };
    await cmdSpotGet(runner, { instId: "BTC-USDT", clOrdId: "my-order", json: false });
    assert.equal(capturedParams!["clOrdId"], "my-order");
  });
});

// ---------------------------------------------------------------------------
// cmdSpotAmend
// ---------------------------------------------------------------------------
describe("cmdSpotAmend", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    await cmdSpotAmend(runner, { instId: "BTC-USDT", ordId: "111222", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_amend_order with correct params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeOrderResult;
    };
    await cmdSpotAmend(runner, { instId: "BTC-USDT", ordId: "111222", newPx: "51000", newSz: "0.02", json: false });
    assert.equal(capturedTool, "spot_amend_order");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["ordId"], "111222");
    assert.equal(capturedParams!["newPx"], "51000");
    assert.equal(capturedParams!["newSz"], "0.02");
  });

  it("outputs success message with ordId", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    await cmdSpotAmend(runner, { instId: "BTC-USDT", ordId: "111222", json: false });
    assert.ok(out.join("").includes("111222"));
    assert.ok(out.join("").includes("OK"));
  });
});

// ---------------------------------------------------------------------------
// cmdSpotAlgoOrders
// ---------------------------------------------------------------------------
describe("cmdSpotAlgoOrders", () => {
  const fakeAlgoOrdersResult = {
    endpoint: "GET /api/v5/trade/orders-algo-pending",
    requestTime: new Date().toISOString(),
    data: [
      { algoId: "789012", instId: "BTC-USDT", ordType: "conditional", side: "buy", sz: "0.01", tpTriggerPx: "55000", slTriggerPx: "45000", state: "live" },
    ],
  };

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoOrdersResult;
    await cmdSpotAlgoOrders(runner, { status: "pending", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_get_algo_orders with status and optional params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeAlgoOrdersResult;
    };
    await cmdSpotAlgoOrders(runner, { instId: "BTC-USDT", status: "pending", ordType: "conditional", json: false });
    assert.equal(capturedTool, "spot_get_algo_orders");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["status"], "pending");
    assert.equal(capturedParams!["ordType"], "conditional");
  });

  it("renders a table with algo order fields when json=false and data is present", async () => {
    const runner: ToolRunner = async () => fakeAlgoOrdersResult;
    await cmdSpotAlgoOrders(runner, { status: "pending", json: false });
    const combined = out.join("");
    assert.ok(combined.includes("789012"), "table should include algoId");
    assert.ok(combined.includes("BTC-USDT"), "table should include instId");
  });

  it("outputs 'No algo orders' when data is empty", async () => {
    const runner: ToolRunner = async () => ({ ...fakeAlgoOrdersResult, data: [] });
    await cmdSpotAlgoOrders(runner, { status: "pending", json: false });
    assert.ok(out.join("").includes("No algo orders"));
  });

  it("passes history status when specified", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return { ...fakeAlgoOrdersResult, data: [] };
    };
    await cmdSpotAlgoOrders(runner, { status: "history", json: false });
    assert.equal(capturedParams!["status"], "history");
  });
});

// ---------------------------------------------------------------------------
// cmdSpotFills
// ---------------------------------------------------------------------------
describe("cmdSpotFills", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeFillsResult;
    await cmdSpotFills(runner, { json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_get_fills with optional instId and ordId", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeFillsResult;
    };
    await cmdSpotFills(runner, { instId: "BTC-USDT", ordId: "111222", json: false });
    assert.equal(capturedTool, "spot_get_fills");
    assert.equal(capturedParams!["instId"], "BTC-USDT");
    assert.equal(capturedParams!["ordId"], "111222");
  });

  it("renders a table with fill fields when json=false", async () => {
    const runner: ToolRunner = async () => fakeFillsResult;
    await cmdSpotFills(runner, { json: false });
    const combined = out.join("");
    assert.ok(combined.includes("BTC-USDT"), "table should include instId");
    assert.ok(combined.includes("50000"), "table should include fillPx");
  });

  it("renders (no data) for empty fills list when json=false", async () => {
    const runner: ToolRunner = async () => ({ ...fakeFillsResult, data: [] });
    await cmdSpotFills(runner, { json: false });
    assert.ok(out.join("").includes("no data"), "should show no data placeholder");
  });
});

// ---------------------------------------------------------------------------
// cmdSpotBatch
// ---------------------------------------------------------------------------
describe("cmdSpotBatch", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeBatchResult;
    await cmdSpotBatch(runner, {
      action: "place",
      orders: '[{"instId":"BTC-USDT","side":"buy","ordType":"limit","sz":"0.01","px":"50000"}]',
      json: true,
    });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls spot_batch_orders for place action", async () => {
    let capturedTool: string | undefined;
    const runner: ToolRunner = async (tool) => { capturedTool = tool; return fakeBatchResult; };
    await cmdSpotBatch(runner, {
      action: "place",
      orders: '[{"instId":"BTC-USDT","side":"buy","ordType":"limit","sz":"0.01","px":"50000"}]',
      json: false,
    });
    assert.equal(capturedTool, "spot_batch_orders");
  });

  it("calls spot_batch_amend for amend action", async () => {
    let capturedTool: string | undefined;
    const runner: ToolRunner = async (tool) => { capturedTool = tool; return fakeBatchResult; };
    await cmdSpotBatch(runner, {
      action: "amend",
      orders: '[{"instId":"BTC-USDT","ordId":"111","newPx":"51000"}]',
      json: false,
    });
    assert.equal(capturedTool, "spot_batch_amend");
  });

  it("calls spot_batch_cancel for cancel action", async () => {
    let capturedTool: string | undefined;
    const runner: ToolRunner = async (tool) => { capturedTool = tool; return fakeBatchResult; };
    await cmdSpotBatch(runner, {
      action: "cancel",
      orders: '[{"instId":"BTC-USDT","ordId":"111"}]',
      json: false,
    });
    assert.equal(capturedTool, "spot_batch_cancel");
  });

  it("writes error to stderr for invalid JSON", async () => {
    const origCode = process.exitCode;
    const runner: ToolRunner = async () => fakeBatchResult;
    await cmdSpotBatch(runner, { action: "place", orders: "not-json", json: false });
    assert.ok(err.join("").includes("valid JSON"), "should report invalid JSON error");
    process.exitCode = origCode;
  });

  it("writes error to stderr for empty JSON array", async () => {
    const origCode = process.exitCode;
    const runner: ToolRunner = async () => fakeBatchResult;
    await cmdSpotBatch(runner, { action: "place", orders: "[]", json: false });
    assert.ok(err.join("").includes("non-empty"), "should report non-empty requirement");
    process.exitCode = origCode;
  });

  it("writes error to stderr for unknown action", async () => {
    const origCode = process.exitCode;
    const runner: ToolRunner = async () => fakeBatchResult;
    await cmdSpotBatch(runner, { action: "unknown", orders: '[{"instId":"BTC-USDT"}]', json: false });
    assert.ok(err.join("").includes("--action"), "should report invalid action");
    process.exitCode = origCode;
  });

  it("routes success lines to stdout and error lines to stderr for mixed results", async () => {
    const mixedResult = {
      ...fakeBatchResult,
      data: [
        { ordId: "111", sCode: "0", sMsg: "" },
        { ordId: "222", sCode: "51008", sMsg: "Insufficient balance" },
      ],
    };
    const runner: ToolRunner = async () => mixedResult;
    await cmdSpotBatch(runner, {
      action: "place",
      orders: '[{"instId":"BTC-USDT","side":"buy"},{"instId":"BTC-USDT","side":"sell"}]',
      json: false,
    });
    assert.ok(out.join("").includes("111: OK"));
    assert.ok(err.join("").includes("Insufficient balance"));
    assert.ok(err.join("").includes("51008"));
  });

  it("outputs batch success lines to stdout for all-success results", async () => {
    const runner: ToolRunner = async () => fakeBatchResult;
    await cmdSpotBatch(runner, {
      action: "place",
      orders: '[{"instId":"BTC-USDT","side":"buy"},{"instId":"BTC-USDT","side":"sell"}]',
      json: false,
    });
    assert.ok(out.join("").includes("111: OK"));
    assert.ok(out.join("").includes("222: OK"));
    assert.equal(err.join(""), "");
  });
});
