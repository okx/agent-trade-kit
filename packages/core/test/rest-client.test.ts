/**
 * Unit tests for OkxRestClient error handling and graceful degradation.
 *
 * All tests mock globalThis.fetch — no real network calls are made.
 *
 * Coverage:
 *  - HTTP-level errors (network failure, timeout, 4xx/5xx)
 *  - OKX API error codes (non-zero sCode, auth codes)
 *  - Graceful degradation: missing/unexpected response fields do not crash
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OkxRestClient } from "../src/client/rest-client.js";
import {
  NetworkError,
  OkxApiError,
  AuthenticationError,
} from "../src/utils/errors.js";
import type { OkxConfig } from "../src/config.js";
import type { ModuleId } from "../src/constants.js";

// ---------------------------------------------------------------------------
// Config & mock helpers
// ---------------------------------------------------------------------------

const BASE_CONFIG: OkxConfig = {
  hasAuth: false,
  baseUrl: "https://www.okx.com",
  timeoutMs: 15_000,
  modules: ["market"] as ModuleId[],
  readOnly: false,
  demo: false,
};

/** Mock globalThis.fetch for the duration of a single test. */
async function withFetch(
  mock: typeof globalThis.fetch,
  fn: () => Promise<void>,
): Promise<void> {
  const saved = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await fn();
  } finally {
    globalThis.fetch = saved;
  }
}

/** Build a mock fetch that returns a JSON body with the given HTTP status. */
function jsonFetch(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): typeof globalThis.fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...extraHeaders },
    });
}

/** Build a mock fetch that returns a plain-text body with the given HTTP status. */
function textFetch(body: string, status = 200): typeof globalThis.fetch {
  return async () => new Response(body, { status });
}

/** Build a mock fetch that throws the given error (network failure). */
function throwingFetch(error: unknown): typeof globalThis.fetch {
  return async () => {
    throw error;
  };
}

// ---------------------------------------------------------------------------
// HTTP-level errors
// ---------------------------------------------------------------------------

describe("OkxRestClient — HTTP-level errors", () => {
  it("wraps fetch TypeError (connection refused) as NetworkError", async () => {
    await withFetch(throwingFetch(new TypeError("fetch failed")), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await assert.rejects(
        () => client.publicGet("/api/v5/market/ticker"),
        (err) => err instanceof NetworkError,
      );
    });
  });

  it("wraps AbortError (request timeout) as NetworkError", async () => {
    const abortErr = new DOMException("signal timed out", "TimeoutError");
    await withFetch(throwingFetch(abortErr), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await assert.rejects(
        () => client.publicGet("/api/v5/market/ticker"),
        (err) => err instanceof NetworkError,
      );
    });
  });

  it("throws OkxApiError for HTTP 500 with JSON body", async () => {
    await withFetch(
      jsonFetch({ code: "1", msg: "Internal Server Error", data: [] }, 500),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.code === "500",
        );
      },
    );
  });

  it("throws OkxApiError for HTTP 500 with non-JSON body", async () => {
    await withFetch(textFetch("upstream timeout", 500), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await assert.rejects(
        () => client.publicGet("/api/v5/market/ticker"),
        (err: unknown) =>
          err instanceof OkxApiError && err.code === "500",
      );
    });
  });

  it("throws OkxApiError for HTTP 429 (rate limited by server)", async () => {
    await withFetch(
      jsonFetch({ code: "429", msg: "Too Many Requests", data: [] }, 429),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.code === "429",
        );
      },
    );
  });

  it("OkxApiError carries endpoint path", async () => {
    await withFetch(jsonFetch({ code: "1", msg: "error" }, 503), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await assert.rejects(
        () => client.publicGet("/api/v5/market/ticker"),
        (err: unknown) =>
          err instanceof OkxApiError &&
          err.endpoint?.includes("/api/v5/market/ticker") === true,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// OKX API error codes (HTTP 200 but sCode != "0")
// ---------------------------------------------------------------------------

describe("OkxRestClient — OKX API error codes", () => {
  it("throws OkxApiError for non-zero sCode", async () => {
    await withFetch(
      jsonFetch({ code: "51008", msg: "Insufficient margin balance", data: [] }),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.code === "51008",
        );
      },
    );
  });

  it("OkxApiError message matches OKX msg field", async () => {
    await withFetch(
      jsonFetch({ code: "51008", msg: "Insufficient margin balance", data: [] }),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError &&
            err.message === "Insufficient margin balance",
        );
      },
    );
  });

  it("throws AuthenticationError for sCode 50111", async () => {
    await withFetch(
      jsonFetch({ code: "50111", msg: "Invalid OK-ACCESS-KEY", data: [] }),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/account/balance"),
          (err) => err instanceof AuthenticationError,
        );
      },
    );
  });

  it("throws AuthenticationError for sCode 50112", async () => {
    await withFetch(
      jsonFetch({ code: "50112", msg: "Invalid OK-ACCESS-SIGN", data: [] }),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/account/balance"),
          (err) => err instanceof AuthenticationError,
        );
      },
    );
  });

  it("throws AuthenticationError for sCode 50113", async () => {
    await withFetch(
      jsonFetch({ code: "50113", msg: "Invalid OK-ACCESS-PASSPHRASE", data: [] }),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/account/balance"),
          (err) => err instanceof AuthenticationError,
        );
      },
    );
  });

  it("returns data successfully for sCode 0", async () => {
    const payload = [{ instId: "BTC-USDT", last: "50000" }];
    await withFetch(jsonFetch({ code: "0", msg: "", data: payload }), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.deepEqual(result.data, payload);
    });
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation: missing / unexpected response fields
// ---------------------------------------------------------------------------

describe("OkxRestClient — graceful degradation (missing/unexpected fields)", () => {
  it("does not crash when `code` field is absent — treats as success", async () => {
    // OKX API format change: `code` field removed. The condition
    // `if (responseCode && responseCode !== "0")` evaluates to false
    // when responseCode is undefined, so the request succeeds.
    await withFetch(
      jsonFetch({ msg: "", data: [{ instId: "BTC-USDT" }] }),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        const result = await client.publicGet("/api/v5/market/ticker");
        assert.ok(result.data !== undefined);
      },
    );
  });

  it("returns null data when `data` field is absent (code=0)", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "" }), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.equal(result.data, null);
    });
  });

  it("returns null data when response is an empty JSON object", async () => {
    await withFetch(jsonFetch({}), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.equal(result.data, null);
    });
  });

  it("does not crash when response has unexpected extra fields", async () => {
    await withFetch(
      jsonFetch({
        code: "0",
        msg: "",
        data: [{ instId: "BTC-USDT" }],
        newField: "future_expansion",
        nested: { a: 1, b: [1, 2, 3] },
      }),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        const result = await client.publicGet("/api/v5/market/ticker");
        assert.ok(Array.isArray(result.data));
      },
    );
  });

  it("does not crash when `data` is an empty array", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.deepEqual(result.data, []);
    });
  });

  it("does not crash when `data` is null", async () => {
    await withFetch(
      jsonFetch({ code: "0", msg: "", data: null }),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        const result = await client.publicGet("/api/v5/market/ticker");
        assert.equal(result.data, null);
      },
    );
  });

  it("throws NetworkError (not crash) when response body is plain text with HTTP 200", async () => {
    // Non-JSON body with 200 status — parse fails but does not crash the server.
    await withFetch(textFetch("OK", 200), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await assert.rejects(
        () => client.publicGet("/api/v5/market/ticker"),
        (err) => err instanceof NetworkError,
      );
    });
  });

  it("result always includes endpoint and requestTime fields", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.ok(typeof result.endpoint === "string" && result.endpoint.length > 0);
      assert.ok(typeof result.requestTime === "string" && result.requestTime.length > 0);
    });
  });
});

// ---------------------------------------------------------------------------
// Trace ID extraction from response headers
// ---------------------------------------------------------------------------

describe("OkxRestClient — trace ID extraction", () => {
  it("populates traceId from x-trace-id header on API error", async () => {
    await withFetch(
      jsonFetch(
        { code: "51008", msg: "Insufficient margin balance", data: [] },
        200,
        { "x-trace-id": "abc123def456" },
      ),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.traceId === "abc123def456",
        );
      },
    );
  });

  it("populates traceId from x-request-id header when x-trace-id absent", async () => {
    await withFetch(
      jsonFetch(
        { code: "51008", msg: "error", data: [] },
        200,
        { "x-request-id": "req-999" },
      ),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.traceId === "req-999",
        );
      },
    );
  });

  it("x-trace-id takes precedence over x-request-id", async () => {
    await withFetch(
      jsonFetch(
        { code: "51008", msg: "error", data: [] },
        200,
        { "x-trace-id": "trace-first", "x-request-id": "req-second" },
      ),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.traceId === "trace-first",
        );
      },
    );
  });

  it("traceId is undefined when no trace header present", async () => {
    await withFetch(
      jsonFetch({ code: "51008", msg: "error", data: [] }),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.traceId === undefined,
        );
      },
    );
  });

  it("populates traceId on HTTP 500 error", async () => {
    await withFetch(
      jsonFetch(
        { code: "1", msg: "Internal Server Error", data: [] },
        500,
        { "x-trace-id": "http-err-trace" },
      ),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.traceId === "http-err-trace",
        );
      },
    );
  });

  it("populates traceId on AuthenticationError", async () => {
    await withFetch(
      jsonFetch(
        { code: "50111", msg: "Invalid OK-ACCESS-KEY", data: [] },
        200,
        { "x-trace-id": "auth-trace-42" },
      ),
      async () => {
        const client = new OkxRestClient(BASE_CONFIG);
        await assert.rejects(
          () => client.publicGet("/api/v5/account/balance"),
          (err: unknown) =>
            err instanceof AuthenticationError && err.traceId === "auth-trace-42",
        );
      },
    );
  });
});
