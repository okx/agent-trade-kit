/**
 * Unit tests for resolveQuoteCcySz (tgtCcy=quote_ccy conversion).
 *
 * This function converts a USDT amount (sz) to contract count for SWAP/FUTURES
 * orders when tgtCcy=quote_ccy is set, since OKX API silently ignores tgtCcy
 * for non-SPOT instruments.
 *
 * Formula: contracts = Math.floor(usdtAmount / (ctVal * lastPx))
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveQuoteCcySz } from "../src/tools/tgtccy-conversion.js";

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

interface MockPublicGetCall {
  endpoint: string;
  params: Record<string, unknown>;
}

function makeMockClient(
  instrumentsResponse: unknown[],
  tickerResponse: unknown[],
) {
  const calls: MockPublicGetCall[] = [];

  const client = {
    publicGet: async (endpoint: string, params: Record<string, unknown>) => {
      calls.push({ endpoint, params });
      if (endpoint.includes("/public/instruments")) {
        return {
          endpoint,
          requestTime: "2026-01-01T00:00:00.000Z",
          data: instrumentsResponse,
        };
      }
      if (endpoint.includes("/market/ticker")) {
        return {
          endpoint,
          requestTime: "2026-01-01T00:00:00.000Z",
          data: tickerResponse,
        };
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    },
  };

  return { client, calls };
}

// ---------------------------------------------------------------------------
// Tests: pass-through cases
// ---------------------------------------------------------------------------

describe("resolveQuoteCcySz — passthrough (no conversion)", () => {
  it("tgtCcy=base_ccy: returns original sz unchanged, no API calls", async () => {
    const { client, calls } = makeMockClient([], []);
    const result = await resolveQuoteCcySz(
      "BTC-USDT-SWAP",
      "10",
      "base_ccy",
      "SWAP",
      client as never,
    );
    assert.equal(result.sz, "10");
    assert.equal(result.tgtCcy, "base_ccy");
    assert.equal(result.conversionNote, undefined);
    assert.equal(calls.length, 0);
  });

  it("tgtCcy=undefined: returns original sz unchanged, no API calls", async () => {
    const { client, calls } = makeMockClient([], []);
    const result = await resolveQuoteCcySz(
      "ETH-USDT-SWAP",
      "5",
      undefined,
      "SWAP",
      client as never,
    );
    assert.equal(result.sz, "5");
    assert.equal(result.tgtCcy, undefined);
    assert.equal(result.conversionNote, undefined);
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: successful conversion cases
// ---------------------------------------------------------------------------

describe("resolveQuoteCcySz — conversion (tgtCcy=quote_ccy)", () => {
  it("BTC-USDT-SWAP: ctVal=0.01, lastPx=84000, sz=10000 → contracts=11", async () => {
    // 10000 / (0.01 * 84000) = 10000 / 840 = 11.904... → floor = 11
    const { client } = makeMockClient(
      [{ ctVal: "0.01" }],
      [{ last: "84000" }],
    );
    const result = await resolveQuoteCcySz(
      "BTC-USDT-SWAP",
      "10000",
      "quote_ccy",
      "SWAP",
      client as never,
    );
    assert.equal(result.sz, "11");
    assert.equal(result.tgtCcy, undefined);
    assert.ok(result.conversionNote, "conversionNote should be present");
    assert.ok(
      result.conversionNote!.includes("10000"),
      "conversionNote should mention original USDT amount",
    );
    assert.ok(
      result.conversionNote!.includes("11"),
      "conversionNote should mention resulting contract count",
    );
  });

  it("ETH-USDT-SWAP: ctVal=0.1, lastPx=3200, sz=1000 → contracts=3", async () => {
    // 1000 / (0.1 * 3200) = 1000 / 320 = 3.125 → floor = 3
    const { client } = makeMockClient(
      [{ ctVal: "0.1" }],
      [{ last: "3200" }],
    );
    const result = await resolveQuoteCcySz(
      "ETH-USDT-SWAP",
      "1000",
      "quote_ccy",
      "SWAP",
      client as never,
    );
    assert.equal(result.sz, "3");
    assert.equal(result.tgtCcy, undefined);
  });

  it("makes exactly 2 parallel API calls (instruments + ticker)", async () => {
    const { client, calls } = makeMockClient(
      [{ ctVal: "0.01" }],
      [{ last: "84000" }],
    );
    await resolveQuoteCcySz(
      "BTC-USDT-SWAP",
      "10000",
      "quote_ccy",
      "SWAP",
      client as never,
    );
    assert.equal(calls.length, 2);
    const endpoints = calls.map((c) => c.endpoint);
    assert.ok(
      endpoints.some((e) => e.includes("/public/instruments")),
      "should call instruments endpoint",
    );
    assert.ok(
      endpoints.some((e) => e.includes("/market/ticker")),
      "should call ticker endpoint",
    );
  });

  it("tgtCcy is removed (set to undefined) in result after conversion", async () => {
    const { client } = makeMockClient(
      [{ ctVal: "0.01" }],
      [{ last: "50000" }],
    );
    const result = await resolveQuoteCcySz(
      "BTC-USDT-SWAP",
      "500",
      "quote_ccy",
      "SWAP",
      client as never,
    );
    assert.equal(result.tgtCcy, undefined);
  });
});

// ---------------------------------------------------------------------------
// Tests: error cases
// ---------------------------------------------------------------------------

describe("resolveQuoteCcySz — error cases", () => {
  it("sz too small: floor=0 → throws descriptive error", async () => {
    // 100 / (0.01 * 84000) = 100 / 840 = 0.119... → floor = 0
    const { client } = makeMockClient(
      [{ ctVal: "0.01" }],
      [{ last: "84000" }],
    );
    await assert.rejects(
      () =>
        resolveQuoteCcySz(
          "BTC-USDT-SWAP",
          "100",
          "quote_ccy",
          "SWAP",
          client as never,
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("too small") ||
            err.message.includes("minimum") ||
            err.message.includes("at least"),
          `Expected error about minimum amount, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("instruments API returns empty array → throws error", async () => {
    const { client } = makeMockClient([], [{ last: "84000" }]);
    await assert.rejects(
      () =>
        resolveQuoteCcySz(
          "BTC-USDT-SWAP",
          "10000",
          "quote_ccy",
          "SWAP",
          client as never,
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.toLowerCase().includes("instrument") ||
            err.message.toLowerCase().includes("ctval"),
          `Expected error about instrument, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("ticker API returns empty array → throws error", async () => {
    const { client } = makeMockClient([{ ctVal: "0.01" }], []);
    await assert.rejects(
      () =>
        resolveQuoteCcySz(
          "BTC-USDT-SWAP",
          "10000",
          "quote_ccy",
          "SWAP",
          client as never,
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.toLowerCase().includes("ticker") ||
            err.message.toLowerCase().includes("price") ||
            err.message.toLowerCase().includes("last"),
          `Expected error about ticker/price, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("ctVal=0 → throws error (division by zero guard)", async () => {
    const { client } = makeMockClient([{ ctVal: "0" }], [{ last: "84000" }]);
    await assert.rejects(
      () =>
        resolveQuoteCcySz(
          "BTC-USDT-SWAP",
          "10000",
          "quote_ccy",
          "SWAP",
          client as never,
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.toLowerCase().includes("ctval") ||
            err.message.toLowerCase().includes("contract value"),
          `Expected error about ctVal, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("lastPx=0 → throws error (division by zero guard)", async () => {
    const { client } = makeMockClient([{ ctVal: "0.01" }], [{ last: "0" }]);
    await assert.rejects(
      () =>
        resolveQuoteCcySz(
          "BTC-USDT-SWAP",
          "10000",
          "quote_ccy",
          "SWAP",
          client as never,
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.toLowerCase().includes("price") ||
            err.message.toLowerCase().includes("last") ||
            err.message.toLowerCase().includes("zero"),
          `Expected error about price/zero, got: ${err.message}`,
        );
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: OPTION instType (ctVal=1 for BTC options)
// ---------------------------------------------------------------------------

describe("resolveQuoteCcySz — OPTION instType", () => {
  it("BTC option: ctVal=1, lastPx=84000, sz=100000 → contracts=1", async () => {
    // 100000 / (1 * 84000) = 1.19... → floor = 1
    const { client } = makeMockClient(
      [{ ctVal: "1" }],
      [{ last: "84000" }],
    );
    const result = await resolveQuoteCcySz(
      "BTC-USD-260405-90000-C",
      "100000",
      "quote_ccy",
      "OPTION",
      client as never,
    );
    assert.equal(result.sz, "1");
    assert.equal(result.tgtCcy, undefined);
    assert.ok(result.conversionNote);
  });

  it("BTC option: ctVal=1, lastPx=84000, sz=200000 → contracts=2", async () => {
    // 200000 / (1 * 84000) = 2.38... → floor = 2
    const { client } = makeMockClient(
      [{ ctVal: "1" }],
      [{ last: "84000" }],
    );
    const result = await resolveQuoteCcySz(
      "BTC-USD-260405-90000-C",
      "200000",
      "quote_ccy",
      "OPTION",
      client as never,
    );
    assert.equal(result.sz, "2");
    assert.equal(result.tgtCcy, undefined);
  });

  it("BTC option: sz too small (1000 USDT < 1 contract) → throws", async () => {
    // 1000 / (1 * 84000) = 0.011... → floor = 0
    const { client } = makeMockClient(
      [{ ctVal: "1" }],
      [{ last: "84000" }],
    );
    await assert.rejects(
      () =>
        resolveQuoteCcySz(
          "BTC-USD-260405-90000-C",
          "1000",
          "quote_ccy",
          "OPTION",
          client as never,
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("too small"));
        return true;
      },
    );
  });

  it("OPTION passthrough: tgtCcy=undefined, no conversion", async () => {
    const { client, calls } = makeMockClient([], []);
    const result = await resolveQuoteCcySz(
      "BTC-USD-260405-90000-C",
      "5",
      undefined,
      "OPTION",
      client as never,
    );
    assert.equal(result.sz, "5");
    assert.equal(result.tgtCcy, undefined);
    assert.equal(calls.length, 0);
  });
});
