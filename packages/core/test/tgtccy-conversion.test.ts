/**
 * Unit tests for resolveQuoteCcySz (tgtCcy=quote_ccy conversion).
 *
 * This function converts a USDT amount (sz) to contract count for SWAP/FUTURES
 * orders when tgtCcy=quote_ccy is set, since OKX API silently ignores tgtCcy
 * for non-SPOT instruments.
 *
 * Formula: contracts = floor(usdtAmount / (ctVal * lastPx), lotSz precision)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveQuoteCcySz } from "../src/tools/tgtccy-conversion.js";
import { ValidationError } from "../src/utils/errors.js";

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
  leverageResponse?: unknown[],
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
    privateGet: async (endpoint: string, params: Record<string, unknown>) => {
      calls.push({ endpoint, params });
      if (endpoint.includes("/account/leverage-info")) {
        return {
          endpoint,
          requestTime: "2026-01-01T00:00:00.000Z",
          data: leverageResponse ?? [],
        };
      }
      throw new Error(`Unexpected private endpoint: ${endpoint}`);
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
// Tests: unknown tgtCcy validation (#133)
// ---------------------------------------------------------------------------

describe("resolveQuoteCcySz — unknown tgtCcy throws ValidationError (#133)", () => {
  it('tgtCcy="margin_ccy" (typo) → throws ValidationError with "Unknown tgtCcy"', async () => {
    const { client } = makeMockClient([], []);
    await assert.rejects(
      () => resolveQuoteCcySz("BTC-USDT-SWAP", "10", "margin_ccy", "SWAP", client as never),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError, `Expected ValidationError, got ${(err as Error).constructor.name}`);
        assert.ok((err as Error).message.includes("Unknown tgtCcy"), `Expected "Unknown tgtCcy" in message, got: ${(err as Error).message}`);
        assert.ok((err as Error).message.includes("margin_ccy"), `Expected "margin_ccy" in message`);
        return true;
      },
    );
  });

  it('tgtCcy="cost" → throws ValidationError', async () => {
    const { client } = makeMockClient([], []);
    await assert.rejects(
      () => resolveQuoteCcySz("BTC-USDT-SWAP", "10", "cost", "SWAP", client as never),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError, `Expected ValidationError, got ${(err as Error).constructor.name}`);
        assert.ok((err as Error).message.includes("Unknown tgtCcy"));
        return true;
      },
    );
  });

  it('tgtCcy="QUOTE_CCY" (uppercase) → throws ValidationError (case-sensitive)', async () => {
    const { client } = makeMockClient([], []);
    await assert.rejects(
      () => resolveQuoteCcySz("BTC-USDT-SWAP", "10", "QUOTE_CCY", "SWAP", client as never),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError, `Expected ValidationError, got ${(err as Error).constructor.name}`);
        assert.ok((err as Error).message.includes("Unknown tgtCcy"));
        return true;
      },
    );
  });

  it("tgtCcy=undefined → passthrough (no error)", async () => {
    const { client, calls } = makeMockClient([], []);
    const result = await resolveQuoteCcySz("BTC-USDT-SWAP", "10", undefined, "SWAP", client as never);
    assert.equal(result.sz, "10");
    assert.equal(result.tgtCcy, undefined);
    assert.equal(result.conversionNote, undefined);
    assert.equal(calls.length, 0);
  });

  it('tgtCcy="base_ccy" → passthrough (no error)', async () => {
    const { client, calls } = makeMockClient([], []);
    const result = await resolveQuoteCcySz("BTC-USDT-SWAP", "10", "base_ccy", "SWAP", client as never);
    assert.equal(result.sz, "10");
    assert.equal(result.tgtCcy, "base_ccy");
    assert.equal(result.conversionNote, undefined);
    assert.equal(calls.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: successful conversion cases
// ---------------------------------------------------------------------------

describe("resolveQuoteCcySz — conversion (tgtCcy=quote_ccy)", () => {
  it("BTC-USDT-SWAP: ctVal=0.01, lastPx=84000, sz=10000, lotSz=1, minSz=1 → contracts=11", async () => {
    // 10000 / (0.01 * 84000) = 10000 / 840 = 11.904... → floor(11.904/1)*1 = 11
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
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
    assert.ok(
      result.conversionNote!.includes("minSz=1"),
      "conversionNote should mention minSz",
    );
    assert.ok(
      result.conversionNote!.includes("lotSz=1"),
      "conversionNote should mention lotSz",
    );
  });

  it("ETH-USDT-SWAP: ctVal=0.1, lastPx=3200, sz=1000, lotSz=1, minSz=1 → contracts=3", async () => {
    // 1000 / (0.1 * 3200) = 1000 / 320 = 3.125 → floor(3.125/1)*1 = 3
    const { client } = makeMockClient(
      [{ ctVal: "0.1", minSz: "1", lotSz: "1" }],
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
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
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
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
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

  it("defaults minSz=1, lotSz=1 when instrument response omits them", async () => {
    // Backward compatibility: old mock data without minSz/lotSz
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
  });
});

// ---------------------------------------------------------------------------
// Tests: error cases
// ---------------------------------------------------------------------------

describe("resolveQuoteCcySz — error cases", () => {
  it("sz too small: contracts < minSz → throws descriptive error", async () => {
    // 100 / (0.01 * 84000) = 100 / 840 = 0.119... → floor(0.119/1)*1 = 0 < minSz=1
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
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
            err.message.includes("Minimum") ||
            err.message.includes("minSz"),
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
    // 100000 / (1 * 84000) = 1.19... → floor(1.19/1)*1 = 1
    const { client } = makeMockClient(
      [{ ctVal: "1", minSz: "1", lotSz: "1" }],
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
    // 200000 / (1 * 84000) = 2.38... → floor(2.38/1)*1 = 2
    const { client } = makeMockClient(
      [{ ctVal: "1", minSz: "1", lotSz: "1" }],
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
    // 1000 / (1 * 84000) = 0.011... → floor(0.011/1)*1 = 0 < minSz=1
    const { client } = makeMockClient(
      [{ ctVal: "1", minSz: "1", lotSz: "1" }],
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

// ---------------------------------------------------------------------------
// Tests: fractional minSz and lotSz (#127)
// ---------------------------------------------------------------------------

describe("resolveQuoteCcySz — fractional minSz/lotSz (#127)", () => {
  it("lotSz=0.01: rounds down to lotSz precision", async () => {
    // ctVal=0.01, lastPx=84000 → contractValue=840
    // 1000 / 840 = 1.1904... → floor(1.1904/0.01)*0.01 = 1.19
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "0.01", lotSz: "0.01" }],
      [{ last: "84000" }],
    );
    const result = await resolveQuoteCcySz(
      "BTC-USDT-SWAP",
      "1000",
      "quote_ccy",
      "SWAP",
      client as never,
    );
    assert.equal(result.sz, "1.19");
    assert.equal(result.tgtCcy, undefined);
  });

  it("lotSz=0.1: rounds down to lotSz precision", async () => {
    // ctVal=0.01, lastPx=84000 → contractValue=840
    // 1000 / 840 = 1.1904... → floor(1.1904/0.1)*0.1 = 1.1
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "0.1", lotSz: "0.1" }],
      [{ last: "84000" }],
    );
    const result = await resolveQuoteCcySz(
      "BTC-USDT-SWAP",
      "1000",
      "quote_ccy",
      "SWAP",
      client as never,
    );
    assert.equal(result.sz, "1.1");
    assert.equal(result.tgtCcy, undefined);
  });

  it("minSz=0.5, lotSz=0.01: result between lotSz and minSz throws", async () => {
    // ctVal=0.01, lastPx=84000 → contractValue=840
    // 100 / 840 = 0.1190... → floor(0.1190/0.01)*0.01 = 0.11 < minSz=0.5
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "0.5", lotSz: "0.01" }],
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
          err.message.includes("too small") && err.message.includes("0.5"),
          `Expected error about minSz=0.5, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("minSz=0.01, lotSz=0.01: small but valid amount succeeds", async () => {
    // ctVal=0.001, lastPx=100 → contractValue=0.1
    // 0.01 / 0.1 = 0.1 → floor(0.1/0.01)*0.01 = 0.10 → 0.10 >= minSz=0.01
    const { client } = makeMockClient(
      [{ ctVal: "0.001", minSz: "0.01", lotSz: "0.01" }],
      [{ last: "100" }],
    );
    const result = await resolveQuoteCcySz(
      "SOME-USDT-SWAP",
      "0.01",
      "quote_ccy",
      "SWAP",
      client as never,
    );
    assert.equal(result.sz, "0.10");
    assert.equal(result.tgtCcy, undefined);
  });

  it("error message includes minSz and minimum USDT amount", async () => {
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "0.5", lotSz: "0.01" }],
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
          err.message.includes("minSz=0.5"),
          `Expected error to mention minSz, got: ${err.message}`,
        );
        assert.ok(
          err.message.includes("420.00"),
          `Expected error to show min USDT (0.5*840=420), got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("lotSz=0 → throws validation error", async () => {
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "1", lotSz: "0" }],
      [{ last: "84000" }],
    );
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
          err.message.toLowerCase().includes("lotsz"),
          `Expected error about lotSz, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("minSz=0 → throws validation error", async () => {
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "0", lotSz: "1" }],
      [{ last: "84000" }],
    );
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
          err.message.toLowerCase().includes("minsz"),
          `Expected error about minSz, got: ${err.message}`,
        );
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: margin mode (tgtCcy=margin)
// ---------------------------------------------------------------------------

describe("resolveQuoteCcySz — margin mode (tgtCcy=margin)", () => {
  it("BTC-USDT-SWAP: margin=500, lever=10, ctVal=0.01, lastPx=84000 → 5 contracts", async () => {
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
      [{ last: "84000" }],
      [{ lever: "10" }],
    );
    const result = await resolveQuoteCcySz("BTC-USDT-SWAP", "500", "margin", "SWAP", client as never, "cross");
    assert.equal(result.sz, "5");
    assert.equal(result.tgtCcy, undefined);
    assert.ok(result.conversionNote!.includes("margin"));
    assert.ok(result.conversionNote!.includes("10x"));
  });

  it("ETH-USDT-SWAP: margin=100, lever=20, ctVal=0.1, lastPx=3200 → 6 contracts", async () => {
    const { client } = makeMockClient(
      [{ ctVal: "0.1", minSz: "1", lotSz: "1" }],
      [{ last: "3200" }],
      [{ lever: "20" }],
    );
    const result = await resolveQuoteCcySz("ETH-USDT-SWAP", "100", "margin", "SWAP", client as never, "isolated");
    assert.equal(result.sz, "6");
    assert.equal(result.tgtCcy, undefined);
  });

  it("makes 3 parallel API calls (instruments + ticker + leverage-info)", async () => {
    const { client, calls } = makeMockClient(
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
      [{ last: "84000" }],
      [{ lever: "10" }],
    );
    await resolveQuoteCcySz("BTC-USDT-SWAP", "1000", "margin", "SWAP", client as never, "cross");
    assert.equal(calls.length, 3);
    assert.ok(calls.some((c) => c.endpoint.includes("/public/instruments")));
    assert.ok(calls.some((c) => c.endpoint.includes("/market/ticker")));
    assert.ok(calls.some((c) => c.endpoint.includes("/account/leverage-info")));
  });

  it("passes correct mgnMode to leverage-info API", async () => {
    const { client, calls } = makeMockClient(
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
      [{ last: "84000" }],
      [{ lever: "10" }],
    );
    await resolveQuoteCcySz("BTC-USDT-SWAP", "1000", "margin", "SWAP", client as never, "isolated");
    const leverageCall = calls.find((c) => c.endpoint.includes("/account/leverage-info"));
    assert.ok(leverageCall);
    assert.equal(leverageCall!.params.mgnMode, "isolated");
  });

  it("throws when tdMode is not provided for margin mode", async () => {
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
      [{ last: "84000" }],
      [{ lever: "10" }],
    );
    await assert.rejects(
      () => resolveQuoteCcySz("BTC-USDT-SWAP", "500", "margin", "SWAP", client as never),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("tdMode"));
        return true;
      },
    );
  });

  it("throws when leverage-info returns empty response", async () => {
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
      [{ last: "84000" }],
      [],
    );
    await assert.rejects(
      () => resolveQuoteCcySz("BTC-USDT-SWAP", "500", "margin", "SWAP", client as never, "cross"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("leverage") || err.message.includes("lever"));
        return true;
      },
    );
  });

  it("margin too small: throws descriptive error", async () => {
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "1", lotSz: "1" }],
      [{ last: "84000" }],
      [{ lever: "10" }],
    );
    await assert.rejects(
      () => resolveQuoteCcySz("BTC-USDT-SWAP", "5", "margin", "SWAP", client as never, "cross"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("too small"));
        return true;
      },
    );
  });

  it("margin mode respects lotSz precision", async () => {
    // margin=100, lever=10, notional=1000, contractValue=0.01*68862=688.62
    // 1000/688.62=1.4522 → lotSz=0.01 → floor(round(1.4522/0.01))*0.01 = 1.45
    const { client } = makeMockClient(
      [{ ctVal: "0.01", minSz: "0.01", lotSz: "0.01" }],
      [{ last: "68862" }],
      [{ lever: "10" }],
    );
    const result = await resolveQuoteCcySz("BTC-USDT-SWAP", "100", "margin", "SWAP", client as never, "cross");
    assert.equal(result.sz, "1.45");
  });
});
