import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  cmdFuturesAmend,
  cmdFuturesAlgoPlace,
  cmdFuturesAlgoAmend,
  cmdFuturesAlgoCancel,
  cmdFuturesAlgoOrders,
  cmdFuturesBatch,
  cmdFuturesClose,
  cmdFuturesGetLeverage,
  cmdFuturesSetLeverage,
  cmdFuturesPlace,
  cmdFuturesCancel,
} from "../src/commands/futures.js";
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
  endpoint: "POST /api/v5/trade/amend-order",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "123456", sCode: "0" }],
};
const fakeAlgoResult = {
  endpoint: "POST /api/v5/trade/order-algo",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "987654", sCode: "0" }],
};
const fakeLeverResult = {
  endpoint: "POST /api/v5/account/set-leverage",
  requestTime: new Date().toISOString(),
  data: [{ instId: "BTC-USD-250328", lever: "10", mgnMode: "cross", posSide: "long" }],
};
const fakeGetLeverResult = {
  endpoint: "GET /api/v5/account/leverage-info",
  requestTime: new Date().toISOString(),
  data: [{ instId: "BTC-USD-250328", lever: "10", mgnMode: "cross", posSide: "long" }],
};
const fakeCloseResult = {
  endpoint: "POST /api/v5/trade/close-position",
  requestTime: new Date().toISOString(),
  data: [{ instId: "BTC-USD-250328", posSide: "long" }],
};
const fakeBatchResult = {
  endpoint: "POST /api/v5/trade/batch-orders",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "111", sCode: "0" }, { ordId: "222", sCode: "0" }],
};

// ---------------------------------------------------------------------------
// cmdFuturesAmend
// ---------------------------------------------------------------------------
describe("cmdFuturesAmend", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    await cmdFuturesAmend(runner, { instId: "BTC-USD-250328", ordId: "123456", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls futures_amend_order with correct params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeOrderResult;
    };
    await cmdFuturesAmend(runner, {
      instId: "BTC-USD-250328",
      ordId: "123456",
      newPx: "50000",
      json: false,
    });
    assert.equal(capturedTool, "futures_amend_order");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["ordId"], "123456");
    assert.equal(capturedParams!["newPx"], "50000");
  });

  it("passes clOrdId and newSz when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return fakeOrderResult;
    };
    await cmdFuturesAmend(runner, {
      instId: "ETH-USD-250328",
      clOrdId: "my-order-1",
      newSz: "5",
      json: false,
    });
    assert.equal(capturedParams!["clOrdId"], "my-order-1");
    assert.equal(capturedParams!["newSz"], "5");
    assert.equal(capturedParams!["ordId"], undefined);
  });

  it("outputs amended ordId on success", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    await cmdFuturesAmend(runner, { instId: "BTC-USD-250328", ordId: "123456", json: false });
    assert.ok(out.join("").includes("123456"), "output should contain ordId");
    assert.ok(out.join("").includes("OK"), "output should indicate success");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesAlgoPlace
// ---------------------------------------------------------------------------
describe("cmdFuturesAlgoPlace", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdFuturesAlgoPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      ordType: "conditional",
      sz: "1",
      tdMode: "cross",
      json: true,
    });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls futures_place_algo_order with required params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeAlgoResult;
    };
    await cmdFuturesAlgoPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      ordType: "conditional",
      sz: "1",
      tdMode: "cross",
      tpTriggerPx: "60000",
      tpOrdPx: "-1",
      json: false,
    });
    assert.equal(capturedTool, "futures_place_algo_order");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["side"], "sell");
    assert.equal(capturedParams!["ordType"], "conditional");
    assert.equal(capturedParams!["sz"], "1");
    assert.equal(capturedParams!["tdMode"], "cross");
    assert.equal(capturedParams!["tpTriggerPx"], "60000");
    assert.equal(capturedParams!["tpOrdPx"], "-1");
  });

  it("passes posSide and reduceOnly when set", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return fakeAlgoResult;
    };
    await cmdFuturesAlgoPlace(runner, {
      instId: "ETH-USD-250328",
      side: "sell",
      ordType: "conditional",
      sz: "2",
      tdMode: "isolated",
      posSide: "long",
      slTriggerPx: "2000",
      slOrdPx: "-1",
      reduceOnly: true,
      json: false,
    });
    assert.equal(capturedParams!["posSide"], "long");
    assert.equal(capturedParams!["reduceOnly"], true);
    assert.equal(capturedParams!["slTriggerPx"], "2000");
  });

  it("outputs algoId on success", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdFuturesAlgoPlace(runner, {
      instId: "BTC-USD-250328",
      side: "sell",
      ordType: "conditional",
      sz: "1",
      tdMode: "cross",
      json: false,
    });
    assert.ok(out.join("").includes("987654"), "output should contain algoId");
    assert.ok(out.join("").includes("OK"), "output should indicate success");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesAlgoAmend
// ---------------------------------------------------------------------------
describe("cmdFuturesAlgoAmend", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdFuturesAlgoAmend(runner, {
      instId: "BTC-USD-250328",
      algoId: "987654",
      newTpTriggerPx: "62000",
      json: true,
    });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls futures_amend_algo_order with correct params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeAlgoResult;
    };
    await cmdFuturesAlgoAmend(runner, {
      instId: "BTC-USD-250328",
      algoId: "987654",
      newTpTriggerPx: "62000",
      newSlTriggerPx: "48000",
      json: false,
    });
    assert.equal(capturedTool, "futures_amend_algo_order");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["algoId"], "987654");
    assert.equal(capturedParams!["newTpTriggerPx"], "62000");
    assert.equal(capturedParams!["newSlTriggerPx"], "48000");
    assert.equal(capturedParams!["newSz"], undefined);
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesAlgoCancel — cancel futures algo order
// ---------------------------------------------------------------------------
describe("cmdFuturesAlgoCancel", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    await cmdFuturesAlgoCancel(runner, "BTC-USD-250328", "987654", true);
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls futures_cancel_algo_orders with instId and algoId", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeAlgoResult;
    };
    await cmdFuturesAlgoCancel(runner, "BTC-USD-250328", "987654", false);
    assert.equal(capturedTool, "futures_cancel_algo_orders");
    const orders = capturedParams!["orders"] as Array<Record<string, unknown>>;
    assert.equal(orders[0]["instId"], "BTC-USD-250328");
    assert.equal(orders[0]["algoId"], "987654");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesAlgoOrders — list futures algo orders
// ---------------------------------------------------------------------------
describe("cmdFuturesAlgoOrders", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => ({ endpoint: "GET /api/v5/trade/orders-algo-pending", requestTime: new Date().toISOString(), data: [{ algoId: "987654", instId: "BTC-USD-250328", ordType: "conditional", side: "sell", sz: "1", state: "live" }] });
    await cmdFuturesAlgoOrders(runner, { status: "pending", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("outputs 'No algo orders' when result is empty", async () => {
    const runner: ToolRunner = async () => ({ endpoint: "GET /api/v5/trade/orders-algo-pending", requestTime: new Date().toISOString(), data: [] });
    await cmdFuturesAlgoOrders(runner, { status: "pending", json: false });
    assert.ok(out.join("").includes("No algo orders"), "should indicate no orders");
  });

  it("calls futures_get_algo_orders with pending status by default", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>;
      return { endpoint: "GET /api/v5/trade/orders-algo-pending", requestTime: new Date().toISOString(), data: [] };
    };
    await cmdFuturesAlgoOrders(runner, { status: "pending", json: false });
    assert.equal(capturedTool, "futures_get_algo_orders");
    assert.equal(capturedParams!["status"], "pending");
    assert.equal(capturedParams!["instId"], undefined);
  });

  it("passes instId and history status when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return { endpoint: "GET /api/v5/trade/orders-algo-history", requestTime: new Date().toISOString(), data: [] };
    };
    await cmdFuturesAlgoOrders(runner, { instId: "BTC-USD-250328", status: "history", json: false });
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["status"], "history");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesBatch
// ---------------------------------------------------------------------------
describe("cmdFuturesBatch", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeBatchResult;
    await cmdFuturesBatch(runner, {
      action: "place",
      orders: '[{"instId":"BTC-USD-250328","side":"buy","ordType":"limit","sz":"1","px":"50000","tdMode":"cross"}]',
      json: true,
    });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("writes error for empty JSON array", async () => {
    const origCode = process.exitCode;
    const runner: ToolRunner = async () => fakeBatchResult;
    await cmdFuturesBatch(runner, { action: "place", orders: "[]", json: false });
    assert.ok(err.join("").includes("non-empty"), "should report non-empty array requirement");
    process.exitCode = origCode;
  });

  it("calls futures_batch_orders for place action", async () => {
    let capturedTool: string | undefined;
    const runner: ToolRunner = async (tool) => { capturedTool = tool; return fakeBatchResult; };
    await cmdFuturesBatch(runner, {
      action: "place",
      orders: '[{"instId":"BTC-USD-250328","side":"buy","ordType":"limit","sz":"1","px":"50000","tdMode":"cross"}]',
      json: false,
    });
    assert.equal(capturedTool, "futures_batch_orders");
  });

  it("calls futures_batch_amend for amend action", async () => {
    let capturedTool: string | undefined;
    const runner: ToolRunner = async (tool) => { capturedTool = tool; return fakeBatchResult; };
    await cmdFuturesBatch(runner, {
      action: "amend",
      orders: '[{"instId":"BTC-USD-250328","ordId":"123","newPx":"51000"}]',
      json: false,
    });
    assert.equal(capturedTool, "futures_batch_amend");
  });

  it("calls futures_batch_cancel for cancel action", async () => {
    let capturedTool: string | undefined;
    const runner: ToolRunner = async (tool) => { capturedTool = tool; return fakeBatchResult; };
    await cmdFuturesBatch(runner, {
      action: "cancel",
      orders: '[{"instId":"BTC-USD-250328","ordId":"123"}]',
      json: false,
    });
    assert.equal(capturedTool, "futures_batch_cancel");
  });

  it("writes error for invalid JSON", async () => {
    const origCode = process.exitCode;
    const runner: ToolRunner = async () => fakeBatchResult;
    await cmdFuturesBatch(runner, { action: "place", orders: "not-json", json: false });
    assert.ok(err.join("").includes("valid JSON"), "should report invalid JSON error");
    process.exitCode = origCode;
  });

  it("writes error for unknown action", async () => {
    const origCode = process.exitCode;
    const runner: ToolRunner = async () => fakeBatchResult;
    await cmdFuturesBatch(runner, { action: "unknown", orders: '[{"instId":"BTC"}]', json: false });
    assert.ok(err.join("").includes("--action"), "should report invalid action error");
    process.exitCode = origCode;
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesClose
// ---------------------------------------------------------------------------
describe("cmdFuturesClose", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeCloseResult;
    await cmdFuturesClose(runner, { instId: "BTC-USD-250328", mgnMode: "cross", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls futures_close_position with required params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeCloseResult;
    };
    await cmdFuturesClose(runner, {
      instId: "BTC-USD-250328",
      mgnMode: "cross",
      posSide: "long",
      json: false,
    });
    assert.equal(capturedTool, "futures_close_position");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["mgnMode"], "cross");
    assert.equal(capturedParams!["posSide"], "long");
  });

  it("outputs closed position info", async () => {
    const runner: ToolRunner = async () => fakeCloseResult;
    await cmdFuturesClose(runner, { instId: "BTC-USD-250328", mgnMode: "cross", json: false });
    assert.ok(out.join("").includes("BTC-USD-250328"), "output should include instId");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesGetLeverage — get futures leverage
// ---------------------------------------------------------------------------
describe("cmdFuturesGetLeverage", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeGetLeverResult;
    await cmdFuturesGetLeverage(runner, { instId: "BTC-USD-250328", mgnMode: "cross", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls futures_get_leverage with instId and mgnMode", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeGetLeverResult;
    };
    await cmdFuturesGetLeverage(runner, { instId: "BTC-USD-250328", mgnMode: "cross", json: false });
    assert.equal(capturedTool, "futures_get_leverage");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["mgnMode"], "cross");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesSetLeverage — set futures leverage
// ---------------------------------------------------------------------------
describe("cmdFuturesSetLeverage", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeLeverResult;
    await cmdFuturesSetLeverage(runner, { instId: "BTC-USD-250328", lever: "10", mgnMode: "cross", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)), "output should be valid JSON");
  });

  it("calls futures_set_leverage with required params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool; capturedParams = params as Record<string, unknown>; return fakeLeverResult;
    };
    await cmdFuturesSetLeverage(runner, {
      instId: "BTC-USD-250328",
      lever: "10",
      mgnMode: "cross",
      json: false,
    });
    assert.equal(capturedTool, "futures_set_leverage");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["lever"], "10");
    assert.equal(capturedParams!["mgnMode"], "cross");
    assert.equal(capturedParams!["posSide"], undefined);
  });

  it("passes posSide when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>; return fakeLeverResult;
    };
    await cmdFuturesSetLeverage(runner, {
      instId: "BTC-USD-250328",
      lever: "20",
      mgnMode: "isolated",
      posSide: "long",
      json: false,
    });
    assert.equal(capturedParams!["posSide"], "long");
    assert.equal(capturedParams!["lever"], "20");
  });

  it("outputs leverage set confirmation", async () => {
    const runner: ToolRunner = async () => fakeLeverResult;
    await cmdFuturesSetLeverage(runner, { instId: "BTC-USD-250328", lever: "10", mgnMode: "cross", json: false });
    assert.ok(out.join("").includes("10"), "output should include leverage value");
    assert.ok(out.join("").includes("BTC-USD-250328"), "output should include instId");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesPlace — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
const fakePlaceResult = {
  endpoint: "POST /api/v5/trade/order",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "PLACE001", sCode: "0", sMsg: "" }],
};

describe("cmdFuturesPlace", () => {
  const placeOpts = {
    instId: "BTC-USD-250328", side: "buy", ordType: "limit",
    sz: "1", tdMode: "cross", px: "50000", json: false,
  };

  it("outputs success message to stdout when sCode='0'", async () => {
    const runner: ToolRunner = async () => fakePlaceResult;
    await cmdFuturesPlace(runner, placeOpts);
    assert.ok(out.join("").includes("Order placed"));
    assert.ok(out.join("").includes("PLACE001"));
    assert.ok(out.join("").includes("OK"));
    assert.equal(err.join(""), "");
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const errorResult = {
      endpoint: "POST /api/v5/trade/order",
      requestTime: new Date().toISOString(),
      data: [{ ordId: "", sCode: "51008", sMsg: "Insufficient margin" }],
    };
    const runner: ToolRunner = async () => errorResult;
    await cmdFuturesPlace(runner, placeOpts);
    assert.ok(err.join("").includes("Insufficient margin"));
    assert.ok(err.join("").includes("51008"));
    assert.equal(out.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesCancel — emitWriteResult success and error paths
// ---------------------------------------------------------------------------
describe("cmdFuturesCancel", () => {
  it("outputs success message to stdout when sCode='0'", async () => {
    const result = {
      endpoint: "POST /api/v5/trade/cancel-order",
      requestTime: new Date().toISOString(),
      data: [{ ordId: "PLACE001", sCode: "0", sMsg: "" }],
    };
    const runner: ToolRunner = async () => result;
    await cmdFuturesCancel(runner, { instId: "BTC-USD-250328", ordId: "PLACE001", json: false });
    assert.ok(out.join("").includes("Cancelled"));
    assert.ok(out.join("").includes("PLACE001"));
    assert.ok(out.join("").includes("OK"));
    assert.equal(err.join(""), "");
  });

  it("outputs error to stderr when sCode is non-zero", async () => {
    const result = {
      endpoint: "POST /api/v5/trade/cancel-order",
      requestTime: new Date().toISOString(),
      data: [{ ordId: "", sCode: "51401", sMsg: "Order does not exist" }],
    };
    const runner: ToolRunner = async () => result;
    await cmdFuturesCancel(runner, { instId: "BTC-USD-250328", ordId: "PLACE001", json: false });
    assert.ok(err.join("").includes("Order does not exist"));
    assert.ok(err.join("").includes("51401"));
    assert.equal(out.join(""), "");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesBatch — emitBatchResults error path
// ---------------------------------------------------------------------------
describe("cmdFuturesBatch — mixed success/error", () => {
  it("routes success lines to stdout and error lines to stderr", async () => {
    const mixedResult = {
      endpoint: "POST /api/v5/trade/batch-orders",
      requestTime: new Date().toISOString(),
      data: [
        { ordId: "111", sCode: "0", sMsg: "" },
        { ordId: "222", sCode: "51008", sMsg: "Margin not enough" },
      ],
    };
    const runner: ToolRunner = async () => mixedResult;
    await cmdFuturesBatch(runner, {
      action: "place",
      instId: "BTC-USD-250328",
      orders: JSON.stringify([
        { side: "buy", ordType: "limit", sz: "1", px: "50000" },
        { side: "sell", ordType: "limit", sz: "1", px: "60000" },
      ]),
      tdMode: "cross",
      json: false,
    });
    assert.ok(out.join("").includes("111: OK"));
    assert.ok(err.join("").includes("Margin not enough"));
    assert.ok(err.join("").includes("51008"));
  });
});
