/**
 * Unit tests for OkxRestClient error handling and graceful degradation.
 *
 * All tests inject a mock fetch via the OkxRestClient constructor (_fetch arg).
 * No real network calls are made and globalThis.fetch is never patched.
 *
 * Coverage:
 *  - HTTP-level errors (network failure, timeout, 4xx/5xx)
 *  - OKX API error codes (non-zero sCode, auth codes)
 *  - Graceful degradation: missing/unexpected response fields do not crash
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { OkxRestClient } from "../src/client/rest-client.js";
import {
  NetworkError,
  OkxApiError,
  AuthenticationError,
  RateLimitError,
} from "../src/utils/errors.js";
import type { OkxConfig } from "../src/config.js";
import type { ModuleId, SiteId } from "../src/constants.js";

// ---------------------------------------------------------------------------
// Config & mock helpers
// ---------------------------------------------------------------------------

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

/**
 * Create an OkxRestClient with a mock fetch injected via the constructor.
 * This replaces the previous globalThis.fetch-patching strategy so tests
 * are compatible with the fix that imports fetch from undici directly.
 */
async function withFetch(
  mock: typeof globalThis.fetch,
  fn: (client: OkxRestClient) => Promise<void>,
  config: OkxConfig = BASE_CONFIG,
): Promise<void> {
  const client = new OkxRestClient(config, mock);
  await fn(client);
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
// File-level Pilot hermeticity guard
//
// Prevents any test from accidentally spawning the real ~/.okx/bin/okx-pilot
// binary or reading the real ~/.okx/pilot-cache.json on the runner.
//
// - OKX_PILOT_BINARY_PATH points to a non-existent path so execPilotBinary
//   returns null instantly (no exec, no timeout).
// - OKX_PILOT_CACHE_PATH points to a non-existent path so resolvePilot finds
//   no cache file and falls back to direct mode.
//
// The inner beforeEach inside "Pilot dead-node HTTP failover" runs AFTER this
// outer one and overrides both vars to the mock binary / temp cache, so those
// tests remain unaffected.
// ---------------------------------------------------------------------------

let _savedPilotBinaryPath: string | undefined;
let _savedPilotCachePath: string | undefined;

beforeEach(() => {
  _savedPilotBinaryPath = process.env.OKX_PILOT_BINARY_PATH;
  _savedPilotCachePath = process.env.OKX_PILOT_CACHE_PATH;
  process.env.OKX_PILOT_BINARY_PATH = "/nonexistent/okx-pilot-hermetic";
  process.env.OKX_PILOT_CACHE_PATH = "/nonexistent/pilot-cache-hermetic.json";
});

afterEach(() => {
  if (_savedPilotBinaryPath === undefined) {
    delete process.env.OKX_PILOT_BINARY_PATH;
  } else {
    process.env.OKX_PILOT_BINARY_PATH = _savedPilotBinaryPath;
  }
  if (_savedPilotCachePath === undefined) {
    delete process.env.OKX_PILOT_CACHE_PATH;
  } else {
    process.env.OKX_PILOT_CACHE_PATH = _savedPilotCachePath;
  }
});

// ---------------------------------------------------------------------------
// HTTP-level errors
// ---------------------------------------------------------------------------

describe("OkxRestClient: HTTP-level errors", () => {
  it("wraps fetch TypeError (connection refused) as NetworkError", async () => {
    await withFetch(throwingFetch(new TypeError("fetch failed")), async (client) => {
      await assert.rejects(
        () => client.publicGet("/api/v5/market/ticker"),
        (err) => err instanceof NetworkError,
      );
    });
  });

  it("wraps AbortError (request timeout) as NetworkError", async () => {
    const abortErr = new DOMException("signal timed out", "TimeoutError");
    await withFetch(throwingFetch(abortErr), async (client) => {
      await assert.rejects(
        () => client.publicGet("/api/v5/market/ticker"),
        (err) => err instanceof NetworkError,
      );
    });
  });

  it("throws OkxApiError for HTTP 500 with JSON body", async () => {
    await withFetch(
      jsonFetch({ code: "1", msg: "Internal Server Error", data: [] }, 500),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.code === "500",
        );
      },
    );
  });

  it("throws OkxApiError for HTTP 500 with non-JSON body", async () => {
    await withFetch(textFetch("upstream timeout", 500), async (client) => {
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
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError && err.code === "429",
        );
      },
    );
  });

  it("OkxApiError carries endpoint path", async () => {
    await withFetch(jsonFetch({ code: "1", msg: "error" }, 503), async (client) => {
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

describe("OkxRestClient: OKX API error codes", () => {
  it("throws OkxApiError for non-zero sCode", async () => {
    await withFetch(
      jsonFetch({ code: "51008", msg: "Insufficient margin balance", data: [] }),
      async (client) => {
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
      async (client) => {
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
      async (client) => {
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
      async (client) => {
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
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/account/balance"),
          (err) => err instanceof AuthenticationError,
        );
      },
    );
  });

  it("returns data successfully for sCode 0", async () => {
    const payload = [{ instId: "BTC-USDT", last: "50000" }];
    await withFetch(jsonFetch({ code: "0", msg: "", data: payload }), async (client) => {
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.deepEqual(result.data, payload);
    });
  });
});

// ---------------------------------------------------------------------------
// OKX API error code behaviors — suggestion + RateLimitError
// ---------------------------------------------------------------------------

describe("OkxRestClient: OKX error code behaviors", () => {
  it("throws RateLimitError for sCode 50011", async () => {
    await withFetch(
      jsonFetch({ code: "50011", msg: "Requests too frequent", data: [] }),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) => err instanceof RateLimitError,
        );
      },
    );
  });

  it("RateLimitError for 50011 carries suggestion", async () => {
    await withFetch(
      jsonFetch({ code: "50011", msg: "Requests too frequent", data: [] }),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof RateLimitError &&
            typeof err.suggestion === "string" &&
            err.suggestion.length > 0,
        );
      },
    );
  });

  it("throws RateLimitError for sCode 50061", async () => {
    await withFetch(
      jsonFetch({ code: "50061", msg: "Too many connections", data: [] }),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) => err instanceof RateLimitError,
        );
      },
    );
  });

  it("OkxApiError for region restriction (51155) carries 'Do not retry' suggestion", async () => {
    await withFetch(
      jsonFetch({ code: "51155", msg: "Requests from restricted location", data: [] }),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError &&
            err.code === "51155" &&
            typeof err.suggestion === "string" &&
            err.suggestion.includes("Do not retry"),
        );
      },
    );
  });

  it("OkxApiError for system busy (50013) carries retry suggestion", async () => {
    await withFetch(
      jsonFetch({ code: "50013", msg: "System busy", data: [] }),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError &&
            err.code === "50013" &&
            typeof err.suggestion === "string" &&
            err.suggestion.includes("Retry"),
        );
      },
    );
  });

  it("OkxApiError for insufficient balance (51008) carries suggestion", async () => {
    await withFetch(
      jsonFetch({ code: "51008", msg: "Insufficient margin balance", data: [] }),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError &&
            err.code === "51008" &&
            typeof err.suggestion === "string" &&
            err.suggestion.length > 0,
        );
      },
    );
  });

  it("OkxApiError for unknown code has no suggestion", async () => {
    await withFetch(
      jsonFetch({ code: "99999", msg: "Unknown error", data: [] }),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) =>
            err instanceof OkxApiError &&
            err.code === "99999" &&
            err.suggestion === undefined,
        );
      },
    );
  });

  // Some upstream endpoints (e.g. /orbit/public/*) return code != 0 with empty
  // msg. The generic "OKX API request failed." fallback hides the code from the
  // user. The fallback must include the code so the error remains diagnosable.
  it("OkxApiError fallback message includes code when msg is empty", async () => {
    await withFetch(
      jsonFetch({ code: "51000", msg: "", data: [] }),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/orbit/public/position-current"),
          (err: unknown) =>
            err instanceof OkxApiError &&
            err.code === "51000" &&
            err.message.includes("51000"),
        );
      },
    );
  });

  it("OkxApiError fallback message includes code when msg is missing", async () => {
    await withFetch(
      jsonFetch({ code: "51000", data: [] }),
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/orbit/public/position-current"),
          (err: unknown) =>
            err instanceof OkxApiError &&
            err.code === "51000" &&
            err.message.includes("51000"),
        );
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation: missing / unexpected response fields
// ---------------------------------------------------------------------------

describe("OkxRestClient: graceful degradation (missing/unexpected fields)", () => {
  it("does not crash when `code` field is absent (treats as success)", async () => {
    // OKX API format change: `code` field removed. The condition
    // `if (responseCode && responseCode !== "0")` evaluates to false
    // when responseCode is undefined, so the request succeeds.
    await withFetch(
      jsonFetch({ msg: "", data: [{ instId: "BTC-USDT" }] }),
      async (client) => {
        const result = await client.publicGet("/api/v5/market/ticker");
        assert.ok(result.data !== undefined);
      },
    );
  });

  it("returns null data when `data` field is absent (code=0)", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "" }), async (client) => {
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.equal(result.data, null);
    });
  });

  it("returns null data when response is an empty JSON object", async () => {
    await withFetch(jsonFetch({}), async (client) => {
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
      async (client) => {
        const result = await client.publicGet("/api/v5/market/ticker");
        assert.ok(Array.isArray(result.data));
      },
    );
  });

  it("does not crash when `data` is an empty array", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (client) => {
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.deepEqual(result.data, []);
    });
  });

  it("does not crash when `data` is null", async () => {
    await withFetch(
      jsonFetch({ code: "0", msg: "", data: null }),
      async (client) => {
        const result = await client.publicGet("/api/v5/market/ticker");
        assert.equal(result.data, null);
      },
    );
  });

  it("throws NetworkError (not crash) when response body is plain text with HTTP 200", async () => {
    // Non-JSON body with 200 status — parse fails but does not crash the server.
    await withFetch(textFetch("OK", 200), async (client) => {
      await assert.rejects(
        () => client.publicGet("/api/v5/market/ticker"),
        (err) => err instanceof NetworkError,
      );
    });
  });

  it("result always includes endpoint and requestTime fields", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (client) => {
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.ok(typeof result.endpoint === "string" && result.endpoint.length > 0);
      assert.ok(typeof result.requestTime === "string" && result.requestTime.length > 0);
    });
  });
});

// ---------------------------------------------------------------------------
// Trace ID extraction from response headers
// ---------------------------------------------------------------------------

describe("OkxRestClient: trace ID extraction", () => {
  it("populates traceId from x-trace-id header on API error", async () => {
    await withFetch(
      jsonFetch(
        { code: "51008", msg: "Insufficient margin balance", data: [] },
        200,
        { "x-trace-id": "abc123def456" },
      ),
      async (client) => {
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
      async (client) => {
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
      async (client) => {
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
      async (client) => {
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
      async (client) => {
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
      async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/account/balance"),
          (err: unknown) =>
            err instanceof AuthenticationError && err.traceId === "auth-trace-42",
        );
      },
    );
  });
});

// ---------------------------------------------------------------------------
// User-Agent header
// ---------------------------------------------------------------------------

/** Capture the Request object passed to fetch and return a success response. */
function capturingFetch(capture: { req?: Request }): typeof globalThis.fetch {
  return async (input, init) => {
    capture.req = new Request(input, init);
    return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("OkxRestClient: User-Agent header", () => {
  it("sets User-Agent when userAgent is configured", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.publicGet("/api/v5/market/ticker"); },
      { ...BASE_CONFIG, userAgent: "okx-trade-mcp/1.0.2" },
    );
    assert.equal(captured.req?.headers.get("User-Agent"), "okx-trade-mcp/1.0.2");
  });

  it("does not set User-Agent when userAgent is not configured", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.publicGet("/api/v5/market/ticker"); },
    );
    assert.equal(captured.req?.headers.get("User-Agent"), null);
  });
});

// ---------------------------------------------------------------------------
// privateGet / privatePost — authenticated requests
// ---------------------------------------------------------------------------

const AUTH_CONFIG: OkxConfig = {
  ...BASE_CONFIG,
  hasAuth: true,
  apiKey: "test-api-key",
  secretKey: "test-secret-key",
  passphrase: "test-passphrase",
};

const DEMO_CONFIG: OkxConfig = { ...AUTH_CONFIG, demo: true };

// ---------------------------------------------------------------------------
// Simulated-trading header (x-simulated-trading)
// ---------------------------------------------------------------------------

describe("OkxRestClient: x-simulated-trading header", () => {
  it("publicGet follows config.demo when simulatedTrading not specified", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.publicGet("/api/v5/market/ticker"); },
      DEMO_CONFIG,
    );
    assert.equal(captured.req?.headers.get("x-simulated-trading"), "1");
  });

  it("publicGet sets x-simulated-trading when simulatedTrading=true (explicit demo market data)", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.publicGet("/api/v5/market/ticker", undefined, undefined, true); },
      DEMO_CONFIG,
    );
    assert.equal(captured.req?.headers.get("x-simulated-trading"), "1");
  });

  it("publicGet does NOT set x-simulated-trading when simulatedTrading=false, overriding config.demo", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.publicGet("/api/v5/market/ticker", undefined, undefined, false); },
      DEMO_CONFIG,
    );
    assert.equal(captured.req?.headers.get("x-simulated-trading"), null);
  });

  it("privateGet sets x-simulated-trading when config.demo=true", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.privateGet("/api/v5/account/balance"); },
      DEMO_CONFIG,
    );
    assert.equal(captured.req?.headers.get("x-simulated-trading"), "1");
  });

  it("privatePost sets x-simulated-trading when config.demo=true", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.privatePost("/api/v5/trade/order", { instId: "BTC-USDT" }); },
      DEMO_CONFIG,
    );
    assert.equal(captured.req?.headers.get("x-simulated-trading"), "1");
  });

  it("privateGet does NOT set x-simulated-trading when config.demo=false", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.privateGet("/api/v5/account/balance"); },
      AUTH_CONFIG,
    );
    assert.equal(captured.req?.headers.get("x-simulated-trading"), null);
  });
});

describe("OkxRestClient: privateGet / privatePost", () => {
  it("privateGet completes successfully with auth credentials", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (client) => {
      const result = await client.privateGet("/api/v5/account/balance");
      assert.ok(result.data !== undefined);
    }, AUTH_CONFIG);
  });

  it("privatePost completes successfully with auth credentials", async () => {
    await withFetch(
      jsonFetch({ code: "0", msg: "", data: [{ ordId: "123" }] }),
      async (client) => {
        const result = await client.privatePost("/api/v5/trade/order", {
          instId: "BTC-USDT",
          side: "buy",
        });
        assert.ok(result.data !== undefined);
      },
      AUTH_CONFIG,
    );
  });

  it("privateGet sets OK-ACCESS-KEY header", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.privateGet("/api/v5/account/balance"); },
      AUTH_CONFIG,
    );
    assert.equal(captured.req?.headers.get("OK-ACCESS-KEY"), "test-api-key");
  });

  it("privatePost sets OK-ACCESS-PASSPHRASE header", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.privatePost("/api/v5/trade/order", { instId: "BTC-USDT" }); },
      AUTH_CONFIG,
    );
    assert.equal(captured.req?.headers.get("OK-ACCESS-PASSPHRASE"), "test-passphrase");
  });

  it("throws ConfigError when private endpoint called without credentials", async () => {
    const { ConfigError } = await import("../src/utils/errors.js");
    // Point OKX_AUTH_BIN to a nonexistent path so OAuth lookup also fails
    const origBin = process.env.OKX_AUTH_BIN;
    process.env.OKX_AUTH_BIN = "/nonexistent/okx-auth";
    try {
      await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (client) => {
        await assert.rejects(
          () => client.privateGet("/api/v5/account/balance"),
          (err: unknown) => err instanceof ConfigError,
        );
      });
    } finally {
      if (origBin === undefined) delete process.env.OKX_AUTH_BIN;
      else process.env.OKX_AUTH_BIN = origBin;
    }
  });
});

// ---------------------------------------------------------------------------
// Query string building edge cases
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Proxy dispatcher injection
// ---------------------------------------------------------------------------

/** Capture raw fetch init object (not through new Request, which drops dispatcher). */
function capturingFetchInit(capture: { init?: Record<string, unknown> }): typeof globalThis.fetch {
  return async (_input, init) => {
    capture.init = init as unknown as Record<string, unknown>;
    return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("OkxRestClient: proxy dispatcher", () => {
  it("passes dispatcher to fetch when proxyUrl is configured", async () => {
    const captured: { init?: Record<string, unknown> } = {};
    await withFetch(
      capturingFetchInit(captured),
      async (client) => { await client.publicGet("/api/v5/market/ticker"); },
      { ...BASE_CONFIG, proxyUrl: "http://127.0.0.1:7890" },
    );
    assert.ok(captured.init?.dispatcher !== undefined, "dispatcher should be set");
  });

  it("does not pass dispatcher when proxyUrl is not configured", async () => {
    const captured: { init?: Record<string, unknown> } = {};
    await withFetch(
      capturingFetchInit(captured),
      async (client) => { await client.publicGet("/api/v5/market/ticker"); },
    );
    assert.equal(captured.init?.dispatcher, undefined, "dispatcher should not be set");
  });

  it("passes dispatcher on privatePost as well", async () => {
    const captured: { init?: Record<string, unknown> } = {};
    await withFetch(
      capturingFetchInit(captured),
      async (client) => { await client.privatePost("/api/v5/trade/order", { instId: "BTC-USDT" }); },
      { ...AUTH_CONFIG, proxyUrl: "http://proxy.example.com:8080" },
    );
    assert.ok(captured.init?.dispatcher !== undefined, "dispatcher should be set on POST");
  });
});

// ---------------------------------------------------------------------------
// Query string building edge cases
// ---------------------------------------------------------------------------

describe("OkxRestClient: query string building", () => {
  it("omits '?' when query object is empty", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => { await client.publicGet("/api/v5/market/ticker", {}); },
    );
    assert.ok(!captured.req?.url.includes("?"), "URL should not contain '?'");
  });

  it("joins array query values with commas", async () => {
    const captured: { req?: Request } = {};
    await withFetch(
      capturingFetch(captured),
      async (client) => {
        await client.publicGet("/api/v5/market/tickers", {
          instId: ["BTC-USDT", "ETH-USDT"] as unknown as string,
        });
      },
    );
    const url = new URL(captured.req?.url ?? "");
    assert.equal(url.searchParams.get("instId"), "BTC-USDT,ETH-USDT");
  });
});

// ---------------------------------------------------------------------------
// Verbose mode output
// ---------------------------------------------------------------------------

describe("OkxRestClient: verbose mode", () => {
  /** Capture stderr writes during a callback. */
  async function captureStderr(fn: () => Promise<void>): Promise<string> {
    const chunks: string[] = [];
    const originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      await fn();
    } finally {
      process.stderr.write = originalWrite;
    }
    return chunks.join("");
  }

  const VERBOSE_CONFIG: OkxConfig = { ...BASE_CONFIG, verbose: true };

  it("writes request and response info to stderr when verbose=true", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (client) => {
      const output = await captureStderr(() => client.publicGet("/api/v5/market/ticker", { instId: "BTC-USDT" }));
      assert.ok(output.includes("[verbose]"), "should contain [verbose] prefix");
      assert.ok(output.includes("/api/v5/market/ticker"), "should contain request path");
      assert.ok(output.includes("200"), "should contain response status");
    }, VERBOSE_CONFIG);
  });

  it("does not write to stderr when verbose=false", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (client) => {
      const output = await captureStderr(() => client.publicGet("/api/v5/market/ticker"));
      assert.equal(output, "", "should not produce verbose output");
    }, { ...BASE_CONFIG, verbose: false });
  });

  it("logs network errors to stderr when verbose=true", async () => {
    await withFetch(throwingFetch(new TypeError("fetch failed")), async (client) => {
      const output = await captureStderr(async () => {
        try { await client.publicGet("/api/v5/market/ticker"); } catch { /* expected */ }
      });
      assert.ok(output.includes("NetworkError"), "should contain NetworkError");
      assert.ok(output.includes("fetch failed"), "should contain error cause");
    }, VERBOSE_CONFIG);
  });

  it("masks API key in verbose output", async () => {
    const authVerboseConfig: OkxConfig = {
      ...BASE_CONFIG,
      verbose: true,
      hasAuth: true,
      apiKey: "abcdefghijklmnop",
      secretKey: "test-secret",
      passphrase: "test-pass",
    };
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (client) => {
      const output = await captureStderr(() => client.privateGet("/api/v5/account/balance"));
      assert.ok(output.includes("abc***nop"), "should contain masked key");
      assert.ok(!output.includes("abcdefghijklmnop"), "should NOT contain full key");
    }, authVerboseConfig);
  });

  it("logs OKX API error details when verbose=true", async () => {
    await withFetch(
      jsonFetch({ code: "50111", msg: "Invalid OK-ACCESS-KEY", data: [] }),
      async (client) => {
        const output = await captureStderr(async () => {
          try { await client.publicGet("/api/v5/account/balance"); } catch { /* expected */ }
        });
        assert.ok(output.includes("50111"), "should contain error code");
      },
      VERBOSE_CONFIG,
    );
  });

// ---------------------------------------------------------------------------
// OkxRestClient: baseUrl getter
// ---------------------------------------------------------------------------

describe("OkxRestClient: baseUrl getter", () => {
  it("returns the configured baseUrl", () => {
    const client = new OkxRestClient({ ...BASE_CONFIG, baseUrl: "https://www.okx.com" });
    assert.equal(client.baseUrl, "https://www.okx.com");
  });
});

// ---------------------------------------------------------------------------
// OkxRestClient: publicGetBinary
// ---------------------------------------------------------------------------

/** Build a mock fetch that returns a binary (octet-stream) body. */
function binaryFetch(data: Buffer, status = 200, contentType = "application/octet-stream"): typeof globalThis.fetch {
  return async () =>
    new Response(data, {
      status,
      headers: { "Content-Type": contentType },
    });
}

describe("OkxRestClient: publicGetBinary", () => {
  it("returns buffer on successful binary response", async () => {
    const payload = Buffer.from("zip-content");
    await withFetch(binaryFetch(payload), async (client) => {
      const result = await client.publicGetBinary("/api/v5/skill/file", { token: "abc" });
      assert.ok(result.data.equals(payload));
      assert.equal(result.contentType, "application/octet-stream");
      assert.equal(result.endpoint, "GET /api/v5/skill/file");
    });
  });

  it("throws NetworkError when fetch throws (connection failure)", async () => {
    await withFetch(throwingFetch(new TypeError("fetch failed")), async (client) => {
      await assert.rejects(
        () => client.publicGetBinary("/api/v5/skill/file", { token: "abc" }),
        NetworkError,
      );
    });
  });

  it("throws OkxApiError for non-OK HTTP status with plain body", async () => {
    await withFetch(binaryFetch(Buffer.from("not found"), 404, "text/plain"), async (client) => {
      await assert.rejects(
        () => client.publicGetBinary("/api/v5/skill/file", { token: "abc" }),
        OkxApiError,
      );
    });
  });

  it("throws OkxApiError for non-OK HTTP status with JSON OKX error body", async () => {
    await withFetch(
      async () => new Response(JSON.stringify({ code: "70003", msg: "NO_APPROVED_VERSION" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
      async (client) => {
        await assert.rejects(
          () => client.publicGetBinary("/api/v5/skill/file", { token: "abc" }),
          (err: unknown) => err instanceof OkxApiError && (err as OkxApiError).code === "70003",
        );
      },
    );
  });

  it("throws OkxApiError when Content-Type is not octet-stream", async () => {
    await withFetch(binaryFetch(Buffer.from("hello"), 200, "text/html"), async (client) => {
      await assert.rejects(
        () => client.publicGetBinary("/api/v5/skill/file", { token: "abc" }),
        (err: unknown) => err instanceof OkxApiError && (err as OkxApiError).code === "UNEXPECTED_CONTENT_TYPE",
      );
    });
  });

  it("throws OkxApiError when response exceeds maxBytes limit", async () => {
    const big = Buffer.alloc(10);
    await withFetch(binaryFetch(big), async (client) => {
      await assert.rejects(
        () => client.publicGetBinary("/api/v5/skill/file", { token: "abc" }, { maxBytes: 5 }),
        (err: unknown) => err instanceof OkxApiError && (err as OkxApiError).code === "RESPONSE_TOO_LARGE",
      );
    });
  });

  it("appends query params to request path", async () => {
    const payload = Buffer.from("data");
    let capturedUrl = "";
    await withFetch(async (url) => {
      capturedUrl = url as string;
      return new Response(payload, { status: 200, headers: { "Content-Type": "application/octet-stream" } });
    }, async (client) => {
      await client.publicGetBinary("/api/v5/skill/file", { token: "my-token" });
      assert.ok(capturedUrl.includes("token=my-token"));
    });
  });
});
});

// ---------------------------------------------------------------------------
// OAuth Bearer token authentication
// ---------------------------------------------------------------------------

import { join } from "node:path";
import { fileURLToPath } from "node:url";

describe("OkxRestClient: OAuth Bearer token auth", () => {
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const MOCK_BINARY = join(__dirname, "fixtures", "mock-auth-binary.mjs");
  let savedBin: string | undefined;
  let savedExit: string | undefined;
  let savedToken: string | undefined;
  let savedStatus: string | undefined;

  function saveOAuthEnv(): void {
    savedBin = process.env.OKX_AUTH_BIN;
    savedExit = process.env.MOCK_AUTH_EXIT;
    savedToken = process.env.MOCK_AUTH_TOKEN;
    savedStatus = process.env.MOCK_AUTH_STATUS_JSON;
  }

  function restoreOAuthEnv(): void {
    const restore = (key: string, val: string | undefined) => {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    };
    restore("OKX_AUTH_BIN", savedBin);
    restore("MOCK_AUTH_EXIT", savedExit);
    restore("MOCK_AUTH_TOKEN", savedToken);
    restore("MOCK_AUTH_STATUS_JSON", savedStatus);
  }

  /** Config with no API key - forces OAuth path. */
  const OAUTH_CONFIG: OkxConfig = {
    ...BASE_CONFIG,
    hasAuth: true,
  };

  it("uses Bearer token header when no API key configured", async () => {
    saveOAuthEnv();
    try {
      process.env.OKX_AUTH_BIN = MOCK_BINARY;
      process.env.MOCK_AUTH_EXIT = "0";
      process.env.MOCK_AUTH_TOKEN = "oauth-test-token-abc";

      const captured: { req?: Request } = {};
      await withFetch(
        capturingFetch(captured),
        async (client) => { await client.privateGet("/api/v5/account/balance"); },
        OAUTH_CONFIG,
      );
      assert.equal(captured.req?.headers.get("Authorization"), `Bearer ${process.env.MOCK_AUTH_TOKEN}`);
      assert.equal(captured.req?.headers.get("OK-ACCESS-KEY"), null, "should NOT have HMAC key");
    } finally {
      restoreOAuthEnv();
    }
  });

  it("caches token across multiple requests", async () => {
    saveOAuthEnv();
    try {
      process.env.OKX_AUTH_BIN = MOCK_BINARY;
      process.env.MOCK_AUTH_EXIT = "0";
      process.env.MOCK_AUTH_TOKEN = "cached-token-xyz";

      // Single client — both requests must share the same cached token
      const capturedReqs: Request[] = [];
      const multiCaptureFetch: typeof globalThis.fetch = async (input, init) => {
        capturedReqs.push(new Request(input, init));
        return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      };

      const client = new OkxRestClient(OAUTH_CONFIG, multiCaptureFetch);
      await client.privateGet("/api/v5/account/balance");
      await client.privateGet("/api/v5/account/positions");

      assert.equal(capturedReqs[0]?.headers.get("Authorization"), "Bearer cached-token-xyz");
      assert.equal(capturedReqs[1]?.headers.get("Authorization"), "Bearer cached-token-xyz");
    } finally {
      restoreOAuthEnv();
    }
  });

  it("refreshes token after cache TTL expires", async () => {
    saveOAuthEnv();
    const realDateNow = Date.now;
    let fakeNow = realDateNow.call(Date);
    Date.now = () => fakeNow;
    try {
      process.env.OKX_AUTH_BIN = MOCK_BINARY;
      process.env.MOCK_AUTH_EXIT = "0";
      process.env.MOCK_AUTH_TOKEN = "token-first";

      // Single client — first request uses "token-first", second request
      // after TTL expiry uses "token-refreshed" (re-calls the binary)
      let lastAuth: string | null = null;
      const tokenCaptureFetch: typeof globalThis.fetch = async (input, init) => {
        const req = new Request(input, init);
        lastAuth = req.headers.get("Authorization");
        return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      };

      const client = new OkxRestClient(OAUTH_CONFIG, tokenCaptureFetch);

      // First request — caches "token-first"
      await client.privateGet("/api/v5/account/balance");
      assert.equal(lastAuth, "Bearer token-first");

      // Advance time past the 60s TTL and swap mock token
      fakeNow += 61_000;
      process.env.MOCK_AUTH_TOKEN = "token-refreshed";

      // Second request — cache expired, binary called again
      await client.privateGet("/api/v5/account/positions");
      assert.equal(lastAuth, "Bearer token-refreshed");
    } finally {
      Date.now = realDateNow;
      restoreOAuthEnv();
    }
  });

  it("throws ConfigError when not logged in and no API key", async () => {
    saveOAuthEnv();
    try {
      process.env.OKX_AUTH_BIN = MOCK_BINARY;
      process.env.MOCK_AUTH_EXIT = "2"; // NOT_LOGGED_IN
      delete process.env.MOCK_AUTH_TOKEN;

      const { ConfigError } = await import("../src/utils/errors.js");
      await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (client) => {
        await assert.rejects(
          () => client.privateGet("/api/v5/account/balance"),
          (err: unknown) =>
            err instanceof ConfigError &&
            err.message.includes("No credentials"),
        );
      }, OAUTH_CONFIG);
    } finally {
      restoreOAuthEnv();
    }
  });

  it("re-throws AuthenticationError for non-login failures", async () => {
    saveOAuthEnv();
    try {
      process.env.OKX_AUTH_BIN = MOCK_BINARY;
      process.env.MOCK_AUTH_EXIT = "1"; // UNAUTHORIZED_CALLER
      delete process.env.MOCK_AUTH_TOKEN;

      await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (client) => {
        await assert.rejects(
          () => client.privateGet("/api/v5/account/balance"),
          (err: unknown) => err instanceof AuthenticationError,
        );
      }, OAUTH_CONFIG);
    } finally {
      restoreOAuthEnv();
    }
  });
});

// ---------------------------------------------------------------------------
// Pilot dead-node HTTP failover
// ---------------------------------------------------------------------------

import { mkdtempSync, rmSync, writeFileSync as writeFileSyncPilot } from "node:fs";
import { tmpdir } from "node:os";
import { dirname as dirnameUtil } from "node:path";
import type { PilotCacheFile } from "../src/pilot/types.js";

{
  const __dirnameRestClient = dirnameUtil(fileURLToPath(import.meta.url));
  const MOCK_BINARY = join(__dirnameRestClient, "fixtures", "mock-doh-binary.mjs");

  let pilotTempDir: string;
  let pilotCachePath: string;

  function seedProxyCache(): void {
    const file: PilotCacheFile = {
      "www.okx.com": {
        mode: "proxy",
        node: { ip: "192.0.2.1", host: "proxy1.com", ttl: 300 },
        failedNodes: [],
        updatedAt: Date.now(),
      },
    };
    writeFileSyncPilot(pilotCachePath, JSON.stringify(file));
  }

  describe("OkxRestClient: Pilot dead-node HTTP failover", () => {
    beforeEach(() => {
      pilotTempDir = mkdtempSync(join(tmpdir(), "rest-client-pilot-test-"));
      pilotCachePath = join(pilotTempDir, "pilot-cache.json");
      process.env.OKX_PILOT_CACHE_PATH = pilotCachePath;
      process.env.OKX_PILOT_BINARY_PATH = MOCK_BINARY;
    });

    afterEach(() => {
      rmSync(pilotTempDir, { recursive: true, force: true });
      delete process.env.OKX_PILOT_CACHE_PATH;
      delete process.env.OKX_PILOT_BINARY_PATH;
    });

    it("proxy mode: 405 HTML triggers failover and retry succeeds (callCount=2)", async () => {
      seedProxyCache();
      let callCount = 0;
      const mockFetch: typeof globalThis.fetch = async () => {
        const call = callCount++;
        if (call === 0) {
          return new Response("<html><body>Method Not Allowed</body></html>", {
            status: 405,
            headers: { "Content-Type": "text/html" },
          });
        }
        return new Response(JSON.stringify({ code: "0", msg: "", data: [{ instId: "BTC-USDT" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
      await withFetch(mockFetch, async (client) => {
        const result = await client.publicGet("/api/v5/market/ticker");
        assert.equal(callCount, 2, "should make exactly 2 fetch calls");
        assert.ok(Array.isArray(result.data));
      });
    });

    it("proxy mode: 200 with OKX JSON code 51008 does NOT trigger failover (callCount=1)", async () => {
      seedProxyCache();
      let callCount = 0;
      const mockFetch: typeof globalThis.fetch = async () => {
        callCount++;
        return new Response(
          JSON.stringify({ code: "51008", msg: "Insufficient balance", data: [] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };
      await withFetch(mockFetch, async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) => err instanceof OkxApiError && (err as OkxApiError).code === "51008",
        );
        assert.equal(callCount, 1, "should make exactly 1 fetch call (no failover)");
      });
    });

    it("proxy mode: 401 with OKX JSON code does NOT trigger failover (callCount=1)", async () => {
      seedProxyCache();
      let callCount = 0;
      const mockFetch: typeof globalThis.fetch = async () => {
        callCount++;
        return new Response(
          JSON.stringify({ code: "50111", msg: "Invalid OK-ACCESS-KEY", data: [] }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      };
      await withFetch(mockFetch, async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) => err instanceof OkxApiError,
        );
        assert.equal(callCount, 1, "should make exactly 1 fetch call (no failover)");
      });
    });

    it("direct mode: 405 HTML does NOT trigger failover (callCount=1)", async () => {
      // No proxy cache -> directUnverified=true, isProxyActive=false
      let callCount = 0;
      const mockFetch: typeof globalThis.fetch = async () => {
        callCount++;
        return new Response("<html><body>Method Not Allowed</body></html>", {
          status: 405,
          headers: { "Content-Type": "text/html" },
        });
      };
      await withFetch(mockFetch, async (client) => {
        await assert.rejects(
          () => client.publicGet("/api/v5/market/ticker"),
          (err: unknown) => err instanceof OkxApiError && (err as OkxApiError).code === "405",
        );
        assert.equal(callCount, 1, "should make exactly 1 fetch call (no failover in direct mode)");
      });
    });

    it("proxy mode: POST without retryOnNetworkError on dead-node does NOT retry (callCount=1)", async () => {
      // Write-once POST must never auto-retry even when the dead-node guard fires.
      // The guard refreshes failover state but the retry branch is skipped because
      // reqConfig.method === "POST" and retryOnNetworkError is not set.
      seedProxyCache();
      let callCount = 0;
      const mockFetch: typeof globalThis.fetch = async () => {
        callCount++;
        return new Response("<html><body>Method Not Allowed</body></html>", {
          status: 405,
          headers: { "Content-Type": "text/html" },
        });
      };
      await withFetch(mockFetch, async (client) => {
        await assert.rejects(
          () => client.privatePost("/api/v5/trade/order", { instId: "BTC-USDT" }),
          (err: unknown) => err instanceof OkxApiError && (err as OkxApiError).code === "405",
        );
        assert.equal(callCount, 1, "POST without retryOnNetworkError must not auto-retry on dead-node");
      }, AUTH_CONFIG);
    });
  });
}
