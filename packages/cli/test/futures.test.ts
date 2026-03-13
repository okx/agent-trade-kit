import { describe, it } from "node:test";
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
} from "../src/commands/futures.js";

function muteStdout(fn: () => Promise<void>): Promise<void> {
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: typeof process.stdout.write }).write = () => true;
  return fn().finally(() => {
    process.stdout.write = orig;
  });
}

function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as { write: typeof process.stdout.write }).write = (chunk) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  return fn().finally(() => {
    process.stdout.write = orig;
  }).then(() => chunks.join(""));
}

function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  (process.stderr as { write: typeof process.stderr.write }).write = (chunk) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  return fn().finally(() => {
    process.stderr.write = orig;
  }).then(() => chunks.join(""));
}

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
// cmdFuturesAmend — amend futures order
// ---------------------------------------------------------------------------
describe("cmdFuturesAmend", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    const out = await captureStdout(() =>
      cmdFuturesAmend(runner, { instId: "BTC-USD-250328", ordId: "123456", json: true }),
    );
    assert.doesNotThrow(() => JSON.parse(out), "output should be valid JSON");
  });

  it("calls spot_amend_order with correct params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeOrderResult;
    };

    await muteStdout(() =>
      cmdFuturesAmend(runner, {
        instId: "BTC-USD-250328",
        ordId: "123456",
        newPx: "50000",
        json: false,
      }),
    );

    assert.equal(capturedTool, "spot_amend_order");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["ordId"], "123456");
    assert.equal(capturedParams!["newPx"], "50000");
  });

  it("passes clOrdId and newSz when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeOrderResult;
    };

    await muteStdout(() =>
      cmdFuturesAmend(runner, {
        instId: "ETH-USD-250328",
        clOrdId: "my-order-1",
        newSz: "5",
        json: false,
      }),
    );

    assert.equal(capturedParams!["clOrdId"], "my-order-1");
    assert.equal(capturedParams!["newSz"], "5");
    assert.equal(capturedParams!["ordId"], undefined);
  });

  it("outputs amended ordId on success", async () => {
    const runner: ToolRunner = async () => fakeOrderResult;
    const out = await captureStdout(() =>
      cmdFuturesAmend(runner, { instId: "BTC-USD-250328", ordId: "123456", json: false }),
    );
    assert.ok(out.includes("123456"), "output should contain ordId");
    assert.ok(out.includes("OK"), "output should indicate success");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesAlgoPlace — place futures algo order (TP/SL)
// ---------------------------------------------------------------------------
describe("cmdFuturesAlgoPlace", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    const out = await captureStdout(() =>
      cmdFuturesAlgoPlace(runner, {
        instId: "BTC-USD-250328",
        side: "sell",
        ordType: "conditional",
        sz: "1",
        tdMode: "cross",
        json: true,
      }),
    );
    assert.doesNotThrow(() => JSON.parse(out), "output should be valid JSON");
  });

  it("calls swap_place_algo_order with required params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await muteStdout(() =>
      cmdFuturesAlgoPlace(runner, {
        instId: "BTC-USD-250328",
        side: "sell",
        ordType: "conditional",
        sz: "1",
        tdMode: "cross",
        tpTriggerPx: "60000",
        tpOrdPx: "-1",
        json: false,
      }),
    );

    assert.equal(capturedTool, "swap_place_algo_order");
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
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await muteStdout(() =>
      cmdFuturesAlgoPlace(runner, {
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
      }),
    );

    assert.equal(capturedParams!["posSide"], "long");
    assert.equal(capturedParams!["reduceOnly"], true);
    assert.equal(capturedParams!["slTriggerPx"], "2000");
  });

  it("outputs algoId on success", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    const out = await captureStdout(() =>
      cmdFuturesAlgoPlace(runner, {
        instId: "BTC-USD-250328",
        side: "sell",
        ordType: "conditional",
        sz: "1",
        tdMode: "cross",
        json: false,
      }),
    );
    assert.ok(out.includes("987654"), "output should contain algoId");
    assert.ok(out.includes("OK"), "output should indicate success");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesAlgoAmend — amend futures algo order
// ---------------------------------------------------------------------------
describe("cmdFuturesAlgoAmend", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeAlgoResult;
    const out = await captureStdout(() =>
      cmdFuturesAlgoAmend(runner, {
        instId: "BTC-USD-250328",
        algoId: "987654",
        newTpTriggerPx: "62000",
        json: true,
      }),
    );
    assert.doesNotThrow(() => JSON.parse(out), "output should be valid JSON");
  });

  it("calls swap_amend_algo_order with correct params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await muteStdout(() =>
      cmdFuturesAlgoAmend(runner, {
        instId: "BTC-USD-250328",
        algoId: "987654",
        newTpTriggerPx: "62000",
        newSlTriggerPx: "48000",
        json: false,
      }),
    );

    assert.equal(capturedTool, "swap_amend_algo_order");
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
    const out = await captureStdout(() =>
      cmdFuturesAlgoCancel(runner, "BTC-USD-250328", "987654", true),
    );
    assert.doesNotThrow(() => JSON.parse(out), "output should be valid JSON");
  });

  it("calls swap_cancel_algo_orders with instId and algoId", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeAlgoResult;
    };

    await muteStdout(() =>
      cmdFuturesAlgoCancel(runner, "BTC-USD-250328", "987654", false),
    );

    assert.equal(capturedTool, "swap_cancel_algo_orders");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["algoId"], "987654");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesAlgoOrders — list futures algo orders
// ---------------------------------------------------------------------------
describe("cmdFuturesAlgoOrders", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => ({
      endpoint: "GET /api/v5/trade/orders-algo-pending",
      requestTime: new Date().toISOString(),
      data: [{ algoId: "987654", instId: "BTC-USD-250328", ordType: "conditional", side: "sell", sz: "1", state: "live" }],
    });
    const out = await captureStdout(() =>
      cmdFuturesAlgoOrders(runner, { status: "pending", json: true }),
    );
    assert.doesNotThrow(() => JSON.parse(out), "output should be valid JSON");
  });

  it("outputs 'No algo orders' when result is empty", async () => {
    const runner: ToolRunner = async () => ({
      endpoint: "GET /api/v5/trade/orders-algo-pending",
      requestTime: new Date().toISOString(),
      data: [],
    });
    const out = await captureStdout(() =>
      cmdFuturesAlgoOrders(runner, { status: "pending", json: false }),
    );
    assert.ok(out.includes("No algo orders"), "should indicate no orders");
  });

  it("calls swap_get_algo_orders with pending status by default", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return { endpoint: "GET /api/v5/trade/orders-algo-pending", requestTime: new Date().toISOString(), data: [] };
    };

    await muteStdout(() =>
      cmdFuturesAlgoOrders(runner, { status: "pending", json: false }),
    );

    assert.equal(capturedTool, "swap_get_algo_orders");
    assert.equal(capturedParams!["status"], "pending");
    assert.equal(capturedParams!["instId"], undefined);
  });

  it("passes instId and history status when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return { endpoint: "GET /api/v5/trade/orders-algo-history", requestTime: new Date().toISOString(), data: [] };
    };

    await muteStdout(() =>
      cmdFuturesAlgoOrders(runner, { instId: "BTC-USD-250328", status: "history", json: false }),
    );

    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["status"], "history");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesBatch — batch futures orders
// ---------------------------------------------------------------------------
describe("cmdFuturesBatch", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeBatchResult;
    const out = await captureStdout(() =>
      cmdFuturesBatch(runner, {
        action: "place",
        orders: '[{"instId":"BTC-USD-250328","side":"buy","ordType":"limit","sz":"1","px":"50000","tdMode":"cross"}]',
        json: true,
      }),
    );
    assert.doesNotThrow(() => JSON.parse(out), "output should be valid JSON");
  });

  it("writes error for empty JSON array", async () => {
    const runner: ToolRunner = async () => fakeBatchResult;
    const origCode = process.exitCode;
    const err = await captureStderr(() =>
      cmdFuturesBatch(runner, { action: "place", orders: "[]", json: false }),
    );
    assert.ok(err.includes("non-empty"), "should report non-empty array requirement");
    process.exitCode = origCode;
  });

  it("calls swap_batch_orders for place action", async () => {
    let capturedTool: string | undefined;
    const runner: ToolRunner = async (tool) => {
      capturedTool = tool;
      return fakeBatchResult;
    };

    await muteStdout(() =>
      cmdFuturesBatch(runner, {
        action: "place",
        orders: '[{"instId":"BTC-USD-250328","side":"buy","ordType":"limit","sz":"1","px":"50000","tdMode":"cross"}]',
        json: false,
      }),
    );

    assert.equal(capturedTool, "swap_batch_orders");
  });

  it("calls swap_batch_amend for amend action", async () => {
    let capturedTool: string | undefined;
    const runner: ToolRunner = async (tool) => {
      capturedTool = tool;
      return fakeBatchResult;
    };

    await muteStdout(() =>
      cmdFuturesBatch(runner, {
        action: "amend",
        orders: '[{"instId":"BTC-USD-250328","ordId":"123","newPx":"51000"}]',
        json: false,
      }),
    );

    assert.equal(capturedTool, "swap_batch_amend");
  });

  it("calls swap_batch_cancel for cancel action", async () => {
    let capturedTool: string | undefined;
    const runner: ToolRunner = async (tool) => {
      capturedTool = tool;
      return fakeBatchResult;
    };

    await muteStdout(() =>
      cmdFuturesBatch(runner, {
        action: "cancel",
        orders: '[{"instId":"BTC-USD-250328","ordId":"123"}]',
        json: false,
      }),
    );

    assert.equal(capturedTool, "swap_batch_cancel");
  });

  it("writes error for invalid JSON", async () => {
    const runner: ToolRunner = async () => fakeBatchResult;
    const origCode = process.exitCode;
    const err = await captureStderr(() =>
      cmdFuturesBatch(runner, { action: "place", orders: "not-json", json: false }),
    );
    assert.ok(err.includes("valid JSON"), "should report invalid JSON error");
    process.exitCode = origCode;
  });

  it("writes error for unknown action", async () => {
    const runner: ToolRunner = async () => fakeBatchResult;
    const origCode = process.exitCode;
    const err = await captureStderr(() =>
      cmdFuturesBatch(runner, { action: "unknown", orders: '[{"instId":"BTC"}]', json: false }),
    );
    assert.ok(err.includes("--action"), "should report invalid action error");
    process.exitCode = origCode;
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesClose — close futures position
// ---------------------------------------------------------------------------
describe("cmdFuturesClose", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeCloseResult;
    const out = await captureStdout(() =>
      cmdFuturesClose(runner, { instId: "BTC-USD-250328", mgnMode: "cross", json: true }),
    );
    assert.doesNotThrow(() => JSON.parse(out), "output should be valid JSON");
  });

  it("calls swap_close_position with required params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeCloseResult;
    };

    await muteStdout(() =>
      cmdFuturesClose(runner, {
        instId: "BTC-USD-250328",
        mgnMode: "cross",
        posSide: "long",
        json: false,
      }),
    );

    assert.equal(capturedTool, "swap_close_position");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["mgnMode"], "cross");
    assert.equal(capturedParams!["posSide"], "long");
  });

  it("outputs closed position info", async () => {
    const runner: ToolRunner = async () => fakeCloseResult;
    const out = await captureStdout(() =>
      cmdFuturesClose(runner, { instId: "BTC-USD-250328", mgnMode: "cross", json: false }),
    );
    assert.ok(out.includes("BTC-USD-250328"), "output should include instId");
  });
});

// ---------------------------------------------------------------------------
// cmdFuturesGetLeverage — get futures leverage
// ---------------------------------------------------------------------------
describe("cmdFuturesGetLeverage", () => {
  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeGetLeverResult;
    const out = await captureStdout(() =>
      cmdFuturesGetLeverage(runner, { instId: "BTC-USD-250328", mgnMode: "cross", json: true }),
    );
    assert.doesNotThrow(() => JSON.parse(out), "output should be valid JSON");
  });

  it("calls swap_get_leverage with instId and mgnMode", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeGetLeverResult;
    };

    await muteStdout(() =>
      cmdFuturesGetLeverage(runner, { instId: "BTC-USD-250328", mgnMode: "cross", json: false }),
    );

    assert.equal(capturedTool, "swap_get_leverage");
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
    const out = await captureStdout(() =>
      cmdFuturesSetLeverage(runner, { instId: "BTC-USD-250328", lever: "10", mgnMode: "cross", json: true }),
    );
    assert.doesNotThrow(() => JSON.parse(out), "output should be valid JSON");
  });

  it("calls swap_set_leverage with required params", async () => {
    let capturedTool: string | undefined;
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (tool, params) => {
      capturedTool = tool;
      capturedParams = params as Record<string, unknown>;
      return fakeLeverResult;
    };

    await muteStdout(() =>
      cmdFuturesSetLeverage(runner, {
        instId: "BTC-USD-250328",
        lever: "10",
        mgnMode: "cross",
        json: false,
      }),
    );

    assert.equal(capturedTool, "swap_set_leverage");
    assert.equal(capturedParams!["instId"], "BTC-USD-250328");
    assert.equal(capturedParams!["lever"], "10");
    assert.equal(capturedParams!["mgnMode"], "cross");
    assert.equal(capturedParams!["posSide"], undefined);
  });

  it("passes posSide when provided", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    const runner: ToolRunner = async (_tool, params) => {
      capturedParams = params as Record<string, unknown>;
      return fakeLeverResult;
    };

    await muteStdout(() =>
      cmdFuturesSetLeverage(runner, {
        instId: "BTC-USD-250328",
        lever: "20",
        mgnMode: "isolated",
        posSide: "long",
        json: false,
      }),
    );

    assert.equal(capturedParams!["posSide"], "long");
    assert.equal(capturedParams!["lever"], "20");
  });

  it("outputs leverage set confirmation", async () => {
    const runner: ToolRunner = async () => fakeLeverResult;
    const out = await captureStdout(() =>
      cmdFuturesSetLeverage(runner, { instId: "BTC-USD-250328", lever: "10", mgnMode: "cross", json: false }),
    );
    assert.ok(out.includes("10"), "output should include leverage value");
    assert.ok(out.includes("BTC-USD-250328"), "output should include instId");
  });
});
