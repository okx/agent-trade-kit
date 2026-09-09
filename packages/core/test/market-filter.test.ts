import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerMarketFilterTools } from "../src/tools/market-filter.js";
import { OkxRestClient } from "../src/client/rest-client.js";
import { ValidationError } from "../src/utils/errors.js";
import type { OkxConfig } from "../src/config.js";
import type { ModuleId } from "../src/constants.js";

const BASE_CONFIG: OkxConfig = {
  hasAuth: false,
  profile: "default",
  baseUrl: "https://www.okx.com",
  timeoutMs: 15_000,
  modules: ["market"] as ModuleId[],
  readOnly: false,
  demo: false,
  site: "global",
  sourceTag: "test",
  verbose: false,
};

const MOCK_RESPONSE = { code: "0", data: [], msg: "" };

function jsonFetch(body: unknown): typeof globalThis.fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

function getTool(name: string) {
  return registerMarketFilterTools().find((t) => t.name === name)!;
}

/**
 * Captures the actual request body sent to the mocked endpoint, so tests can
 * assert on the real forwarded value instead of only "did not reject".
 */
function capturingFetch(): { fetchFn: typeof globalThis.fetch; getBody: () => Record<string, unknown> | undefined } {
  let body: Record<string, unknown> | undefined;
  const fetchFn: typeof globalThis.fetch = async (_url, init) => {
    body = JSON.parse((init as RequestInit).body as string);
    return new Response(JSON.stringify(MOCK_RESPONSE), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchFn, getBody: () => body };
}

describe("market_get_oi_history - bar validation", () => {
  const tool = getTool("market_get_oi_history");

  it("throws ValidationError for invalid bar '5H' (not in OI_BARS)", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.rejects(
      () => tool.handler({ instId: "BTC-USDT-SWAP", bar: "5H" }, { config: BASE_CONFIG, client }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match((err as Error).message, /bar/);
        return true;
      },
    );
  });

  it("accepts valid bar '1H' exactly", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instId: "BTC-USDT-SWAP", bar: "1H" }, { config: BASE_CONFIG, client }),
    );
  });

  it("accepts lowercase '1h' (case-insensitive match for '1H')", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instId: "BTC-USDT-SWAP", bar: "1h" }, { config: BASE_CONFIG, client }),
    );
  });

  it("accepts lowercase '1d' (case-insensitive match for '1D')", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instId: "BTC-USDT-SWAP", bar: "1d" }, { config: BASE_CONFIG, client }),
    );
  });

  it("accepts missing bar (no validation for undefined)", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instId: "BTC-USDT-SWAP" }, { config: BASE_CONFIG, client }),
    );
  });

  it("forwards lowercase '1h' unchanged in the request body (no normalization to '1H')", async () => {
    const { fetchFn, getBody } = capturingFetch();
    const client = new OkxRestClient(BASE_CONFIG, fetchFn);
    await tool.handler({ instId: "BTC-USDT-SWAP", bar: "1h" }, { config: BASE_CONFIG, client });
    assert.equal(getBody()?.["bar"], "1h");
  });

  it("forwards uppercase '1H' unchanged in the request body", async () => {
    const { fetchFn, getBody } = capturingFetch();
    const client = new OkxRestClient(BASE_CONFIG, fetchFn);
    await tool.handler({ instId: "BTC-USDT-SWAP", bar: "1H" }, { config: BASE_CONFIG, client });
    assert.equal(getBody()?.["bar"], "1H");
  });
});

describe("market_filter_oi_change - bar validation", () => {
  const tool = getTool("market_filter_oi_change");

  it("throws ValidationError for invalid bar '2H' (not in OI_BARS)", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.rejects(
      () => tool.handler({ instType: "SWAP", bar: "2H" }, { config: BASE_CONFIG, client }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match((err as Error).message, /bar/);
        return true;
      },
    );
  });

  it("accepts valid bar '4H' exactly", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instType: "SWAP", bar: "4H" }, { config: BASE_CONFIG, client }),
    );
  });

  it("accepts lowercase '4h' (case-insensitive match for '4H')", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instType: "SWAP", bar: "4h" }, { config: BASE_CONFIG, client }),
    );
  });

  it("accepts missing bar (no validation for undefined)", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instType: "SWAP" }, { config: BASE_CONFIG, client }),
    );
  });

  it("forwards lowercase '4h' unchanged in the request body (no normalization to '4H')", async () => {
    const { fetchFn, getBody } = capturingFetch();
    const client = new OkxRestClient(BASE_CONFIG, fetchFn);
    await tool.handler({ instType: "SWAP", bar: "4h" }, { config: BASE_CONFIG, client });
    assert.equal(getBody()?.["bar"], "4h");
  });

  it("forwards uppercase '4H' unchanged in the request body", async () => {
    const { fetchFn, getBody } = capturingFetch();
    const client = new OkxRestClient(BASE_CONFIG, fetchFn);
    await tool.handler({ instType: "SWAP", bar: "4H" }, { config: BASE_CONFIG, client });
    assert.equal(getBody()?.["bar"], "4H");
  });
});

describe("market_get_pair_spread - bar validation", () => {
  const tool = getTool("market_get_pair_spread");

  it("throws ValidationError for invalid bar '20m' without making a network request", async () => {
    let fetchCalled = false;
    const trackFetch: typeof globalThis.fetch = async (...args) => {
      fetchCalled = true;
      return jsonFetch(MOCK_RESPONSE)(...args);
    };
    const client = new OkxRestClient(BASE_CONFIG, trackFetch);
    await assert.rejects(
      () => tool.handler({ instIdA: "BTC-USDT-SWAP", instIdB: "BTC-USDT", bar: "20m" }, { config: BASE_CONFIG, client }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match((err as Error).message, /bar/);
        return true;
      },
    );
    assert.equal(fetchCalled, false, "fetch must not be called when validation fails");
  });

  it("accepts valid bar '5m'", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instIdA: "BTC-USDT-SWAP", instIdB: "BTC-USDT", bar: "5m" }, { config: BASE_CONFIG, client }),
    );
  });

  it("accepts valid bar '15m'", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instIdA: "BTC-USDT-SWAP", instIdB: "BTC-USDT", bar: "15m" }, { config: BASE_CONFIG, client }),
    );
  });

  it("rejects uppercase '5M' without making a network request (server for this endpoint accepts only exact lowercase '5m'/'15m')", async () => {
    let fetchCalled = false;
    const trackFetch: typeof globalThis.fetch = async (...args) => {
      fetchCalled = true;
      return jsonFetch(MOCK_RESPONSE)(...args);
    };
    const client = new OkxRestClient(BASE_CONFIG, trackFetch);
    await assert.rejects(
      () => tool.handler({ instIdA: "BTC-USDT-SWAP", instIdB: "BTC-USDT", bar: "5M" }, { config: BASE_CONFIG, client }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match((err as Error).message, /bar/);
        return true;
      },
    );
    assert.equal(fetchCalled, false, "fetch must not be called when validation fails");
  });

  it("rejects uppercase '15M' without making a network request", async () => {
    let fetchCalled = false;
    const trackFetch: typeof globalThis.fetch = async (...args) => {
      fetchCalled = true;
      return jsonFetch(MOCK_RESPONSE)(...args);
    };
    const client = new OkxRestClient(BASE_CONFIG, trackFetch);
    await assert.rejects(
      () => tool.handler({ instIdA: "BTC-USDT-SWAP", instIdB: "BTC-USDT", bar: "15M" }, { config: BASE_CONFIG, client }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match((err as Error).message, /bar/);
        return true;
      },
    );
    assert.equal(fetchCalled, false, "fetch must not be called when validation fails");
  });

  it("accepts missing bar (undefined is allowed)", async () => {
    const client = new OkxRestClient(BASE_CONFIG, jsonFetch(MOCK_RESPONSE));
    await assert.doesNotReject(
      () => tool.handler({ instIdA: "BTC-USDT-SWAP", instIdB: "BTC-USDT" }, { config: BASE_CONFIG, client }),
    );
  });

  it("rejects empty string bar without making a network request", async () => {
    let fetchCalled = false;
    const trackFetch: typeof globalThis.fetch = async (...args) => {
      fetchCalled = true;
      return jsonFetch(MOCK_RESPONSE)(...args);
    };
    const client = new OkxRestClient(BASE_CONFIG, trackFetch);
    await assert.rejects(
      () => tool.handler({ instIdA: "BTC-USDT-SWAP", instIdB: "BTC-USDT", bar: "" }, { config: BASE_CONFIG, client }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match((err as Error).message, /bar/);
        return true;
      },
    );
    assert.equal(fetchCalled, false, "fetch must not be called when validation fails");
  });

  it("rejects '5m ' (trailing whitespace) without making a network request", async () => {
    let fetchCalled = false;
    const trackFetch: typeof globalThis.fetch = async (...args) => {
      fetchCalled = true;
      return jsonFetch(MOCK_RESPONSE)(...args);
    };
    const client = new OkxRestClient(BASE_CONFIG, trackFetch);
    await assert.rejects(
      () => tool.handler({ instIdA: "BTC-USDT-SWAP", instIdB: "BTC-USDT", bar: "5m " }, { config: BASE_CONFIG, client }),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.match((err as Error).message, /bar/);
        return true;
      },
    );
    assert.equal(fetchCalled, false, "fetch must not be called when validation fails");
  });
});
