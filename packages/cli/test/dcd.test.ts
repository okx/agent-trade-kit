import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  cmdDcdPairs,
  cmdDcdProducts,
  cmdDcdRedeemExecute,
  cmdDcdOrderState,
  cmdDcdOrders,
  cmdDcdQuoteAndBuy,
} from "../src/commands/dcd.js";
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

function fakeResult(data: unknown) {
  return { endpoint: "GET /api/v5/dcd", requestTime: new Date().toISOString(), data };
}

// ---------------------------------------------------------------------------
// cmdDcdPairs
// ---------------------------------------------------------------------------
describe("cmdDcdPairs", () => {
  it("outputs 'No currency pairs available' when data is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdDcdPairs(runner, false);
    assert.ok(out.join("").includes("No currency pairs available"));
    assert.equal(err.join(""), "");
  });

  it("outputs table when pairs are present", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { baseCcy: "BTC", quoteCcy: "USDT", optType: "C" },
    ]);
    await cmdDcdPairs(runner, false);
    assert.ok(out.join("").includes("BTC"));
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ baseCcy: "BTC" }]);
    await cmdDcdPairs(runner, true);
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});

// ---------------------------------------------------------------------------
// cmdDcdProducts
// ---------------------------------------------------------------------------
describe("cmdDcdProducts", () => {
  const productsResult = {
    endpoint: "GET /api/v5/dcd/products",
    requestTime: new Date().toISOString(),
    data: {
      products: [
        { productId: "P1", baseCcy: "BTC", quoteCcy: "USDT", optType: "C", strike: "50000", annualizedYield: "0.2", minSize: "0.01", expTime: "1800000000000", interestAccrualTime: "1799913600000" },
      ],
    },
  };

  it("outputs 'No products matched' when data is empty", async () => {
    const runner: ToolRunner = async () => ({ ...productsResult, data: { products: [] } });
    await cmdDcdProducts(runner, { json: false });
    assert.ok(out.join("").includes("No products matched"));
    assert.equal(err.join(""), "");
  });

  it("outputs table when products are present", async () => {
    const runner: ToolRunner = async () => productsResult;
    await cmdDcdProducts(runner, { json: false });
    assert.ok(out.join("").includes("P1"));
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => productsResult;
    await cmdDcdProducts(runner, { json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });

  it("filters by minYield", async () => {
    const runner: ToolRunner = async () => productsResult;
    await cmdDcdProducts(runner, { minYield: 0.5, json: false }); // 0.2 < 0.5 → filtered out
    assert.ok(out.join("").includes("No products matched"));
  });
});

// ---------------------------------------------------------------------------
// cmdDcdRedeemExecute
// ---------------------------------------------------------------------------
describe("cmdDcdRedeemExecute", () => {
  it("outputs 'Failed to get redeem quote' when first call returns empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdDcdRedeemExecute(runner, { ordId: "ORD1", json: false });
    assert.ok(out.join("").includes("Failed to get redeem quote"));
    assert.equal(err.join(""), "");
  });

  it("outputs 'No response data' when second call returns empty", async () => {
    let call = 0;
    const runner: ToolRunner = async () => {
      call++;
      return call === 1
        ? fakeResult([{ quoteId: "Q1", redeemSz: "0.01", redeemCcy: "BTC", termRate: "5" }])
        : fakeResult([]);
    };
    await cmdDcdRedeemExecute(runner, { ordId: "ORD1", json: false });
    assert.ok(out.join("").includes("No response data"));
    assert.equal(err.join(""), "");
  });

  it("outputs redeem kv on success", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { quoteId: "Q1", redeemSz: "0.01", redeemCcy: "BTC", termRate: "5", ordId: "ORD1", state: "filled" },
    ]);
    await cmdDcdRedeemExecute(runner, { ordId: "ORD1", json: false });
    assert.ok(out.join("").includes("ORD1"));
    assert.equal(err.join(""), "");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { quoteId: "Q1", redeemSz: "0.01", redeemCcy: "BTC", termRate: "5", ordId: "ORD1", state: "filled" },
    ]);
    await cmdDcdRedeemExecute(runner, { ordId: "ORD1", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});

// ---------------------------------------------------------------------------
// cmdDcdOrderState
// ---------------------------------------------------------------------------
describe("cmdDcdOrderState", () => {
  it("outputs 'Order not found' when data is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdDcdOrderState(runner, { ordId: "ORD1", json: false });
    assert.ok(out.join("").includes("Order not found"));
    assert.equal(err.join(""), "");
  });

  it("outputs order state kv when data is present", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { ordId: "ORD1", state: "filled", productId: "P1", strike: "50000", notionalSz: "100", settleTime: "1700000000000" },
    ]);
    await cmdDcdOrderState(runner, { ordId: "ORD1", json: false });
    assert.ok(out.join("").includes("ORD1"));
    assert.ok(out.join("").includes("filled"));
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ ordId: "ORD1" }]);
    await cmdDcdOrderState(runner, { ordId: "ORD1", json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});

// ---------------------------------------------------------------------------
// cmdDcdOrders
// ---------------------------------------------------------------------------
describe("cmdDcdOrders", () => {
  it("outputs 'No orders found' when data is empty", async () => {
    const runner: ToolRunner = async () => fakeResult([]);
    await cmdDcdOrders(runner, { json: false });
    assert.ok(out.join("").includes("No orders found"));
    assert.equal(err.join(""), "");
  });

  it("outputs table when orders are present", async () => {
    const runner: ToolRunner = async () => fakeResult([
      { ordId: "ORD1", productId: "P1", state: "filled", baseCcy: "BTC", quoteCcy: "USDT", strike: "50000", notionalSz: "100", annualizedYield: "0.2", yieldSz: "5", settleTime: "1700000000000", settledTime: "" },
    ]);
    await cmdDcdOrders(runner, { json: false });
    assert.ok(out.join("").includes("ORD1"));
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => fakeResult([{ ordId: "ORD1" }]);
    await cmdDcdOrders(runner, { json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});

// ---------------------------------------------------------------------------
// cmdDcdQuoteAndBuy
// ---------------------------------------------------------------------------
describe("cmdDcdQuoteAndBuy", () => {
  const baseOpts = { productId: "P1", notionalSz: "100", notionalCcy: "USDT", json: false };

  it("outputs 'No quote returned' when trade data is empty", async () => {
    const runner: ToolRunner = async () => ({ data: [], quote: null });
    await cmdDcdQuoteAndBuy(runner, baseOpts);
    assert.ok(out.join("").includes("No quote returned"));
    assert.equal(err.join(""), "");
  });

  it("outputs order placed section when no quote object", async () => {
    let call = 0;
    const runner: ToolRunner = async () => {
      call++;
      if (call === 1) return { data: [{ ordId: "ORD1", quoteId: "Q1", state: "filled" }] };
      return fakeResult([]); // secondary dcd_get_orders call returns empty
    };
    await cmdDcdQuoteAndBuy(runner, baseOpts);
    const combined = out.join("");
    assert.ok(combined.includes("Order placed"));
    assert.ok(combined.includes("ORD1"));
    assert.equal(err.join(""), "");
  });

  it("outputs quote and order state sections when all data present", async () => {
    let call = 0;
    const runner: ToolRunner = async () => {
      call++;
      if (call === 1) return {
        data: [{ ordId: "ORD1", quoteId: "Q1", state: "filled" }],
        quote: { quoteId: "Q1", annualizedYield: "0.2", absYield: "5", notionalSz: "100", notionalCcy: "USDT" },
      };
      // secondary dcd_get_orders
      return fakeResult([{ ordId: "ORD1", state: "filled", productId: "P1", strike: "50000", notionalSz: "100", settleTime: "1700000000000" }]);
    };
    await cmdDcdQuoteAndBuy(runner, baseOpts);
    const combined = out.join("");
    assert.ok(combined.includes("Quote:"));
    assert.ok(combined.includes("Order placed:"));
    assert.ok(combined.includes("Order state:"));
    assert.equal(err.join(""), "");
  });

  it("outputs JSON when json=true", async () => {
    const runner: ToolRunner = async () => ({
      data: [{ ordId: "ORD1", quoteId: "Q1", state: "filled" }],
      quote: { quoteId: "Q1" },
    });
    await cmdDcdQuoteAndBuy(runner, { ...baseOpts, json: true });
    assert.doesNotThrow(() => JSON.parse(findJson(out)));
  });
});
