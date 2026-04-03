/**
 * Unit tests for DoH binary discovery and resolver.
 *
 * These tests mock child_process.execFile and fs.access — no real binary or
 * filesystem calls are made.
 */
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// doh/binary.ts tests
// ---------------------------------------------------------------------------

describe("getDohBinaryPath", () => {
  const originalEnv = process.env.OKX_DOH_BINARY_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OKX_DOH_BINARY_PATH;
    } else {
      process.env.OKX_DOH_BINARY_PATH = originalEnv;
    }
  });

  it("returns env override when OKX_DOH_BINARY_PATH is set", async () => {
    process.env.OKX_DOH_BINARY_PATH = "/custom/path/doh";
    // Re-import to pick up env change (module is simple enough for this)
    const { getDohBinaryPath } = await import("../src/doh/binary.js");
    assert.equal(getDohBinaryPath(), "/custom/path/doh");
  });

  it("returns ~/.okx/bin/okx-doh-resolver when env is not set", async () => {
    delete process.env.OKX_DOH_BINARY_PATH;
    const { getDohBinaryPath } = await import("../src/doh/binary.js");
    const path = getDohBinaryPath();
    assert.ok(path.includes(".okx"));
    assert.ok(path.includes("okx-doh-resolver"));
  });
});

describe("getDohCachePath", () => {
  it("returns path under ~/.okx/", async () => {
    const { getDohCachePath } = await import("../src/doh/binary.js");
    const cachePath = getDohCachePath();
    assert.ok(cachePath.includes(".okx"));
    assert.ok(cachePath.includes(".doh-cache.json"));
  });
});

// ---------------------------------------------------------------------------
// DoH integration in OkxRestClient
// ---------------------------------------------------------------------------

import { OkxRestClient } from "../src/client/rest-client.js";
import type { DohResolver } from "../src/client/rest-client.js";
import { NetworkError } from "../src/utils/errors.js";
import type { OkxConfig } from "../src/config.js";
import type { ModuleId } from "../src/constants.js";

const BASE_CONFIG: OkxConfig = {
  hasAuth: false,
  baseUrl: "https://www.okx.com",
  timeoutMs: 15_000,
  modules: ["market"] as ModuleId[],
  readOnly: false,
  demo: false,
  site: "global",
  sourceTag: "test",
  verbose: false,
};

const NO_DOH: { resolveDoh: null } = { resolveDoh: null };

async function withFetch(
  mockFetch: typeof globalThis.fetch,
  fn: () => Promise<void>,
): Promise<void> {
  const saved = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = saved;
  }
}

function jsonFetch(body: unknown, status = 200): typeof globalThis.fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

function capturingFetchInit(capture: { init?: Record<string, unknown> }): typeof globalThis.fetch {
  return async (_input, init) => {
    capture.init = init as unknown as Record<string, unknown>;
    return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("OkxRestClient: DoH integration", () => {
  it("uses direct connection when resolveDoh is null (disabled)", async () => {
    const captured: { init?: Record<string, unknown> } = {};
    const client = new OkxRestClient(BASE_CONFIG, NO_DOH);
    await withFetch(capturingFetchInit(captured), () =>
      client.publicGet("/api/v5/market/ticker"),
    );
    assert.equal(captured.init?.dispatcher, undefined, "no dispatcher when DoH disabled");
  });

  it("uses DoH proxy when resolver returns a node", async () => {
    const mockResolver: DohResolver = async () => ({
      ip: "1.2.3.4",
      host: "proxy.example.com",
      ttl: 120,
    });

    const captured: { init?: Record<string, unknown> } = {};
    const client = new OkxRestClient(BASE_CONFIG, { resolveDoh: mockResolver });
    await withFetch(capturingFetchInit(captured), () =>
      client.publicGet("/api/v5/market/ticker"),
    );
    assert.ok(captured.init?.dispatcher !== undefined, "should have DoH dispatcher");
  });

  it("uses direct connection when resolver returns null", async () => {
    const mockResolver: DohResolver = async () => null;

    const captured: { init?: Record<string, unknown> } = {};
    const client = new OkxRestClient(BASE_CONFIG, { resolveDoh: mockResolver });
    await withFetch(capturingFetchInit(captured), () =>
      client.publicGet("/api/v5/market/ticker"),
    );
    assert.equal(captured.init?.dispatcher, undefined, "no dispatcher when resolver returns null");
  });

  it("uses direct connection when DoH ip matches hostname (overseas user)", async () => {
    const mockResolver: DohResolver = async () => ({
      ip: "www.okx.com",
      host: "www.okx.com",
      ttl: 120,
    });

    const captured: { init?: Record<string, unknown> } = {};
    const client = new OkxRestClient(BASE_CONFIG, { resolveDoh: mockResolver });
    await withFetch(capturingFetchInit(captured), () =>
      client.publicGet("/api/v5/market/ticker"),
    );
    assert.equal(captured.init?.dispatcher, undefined, "direct connection for overseas user");
  });

  it("falls back to direct connection when resolver throws", async () => {
    const mockResolver: DohResolver = async () => {
      throw new Error("binary crashed");
    };

    const captured: { init?: Record<string, unknown> } = {};
    const client = new OkxRestClient(BASE_CONFIG, { resolveDoh: mockResolver });
    await withFetch(capturingFetchInit(captured), () =>
      client.publicGet("/api/v5/market/ticker"),
    );
    assert.equal(captured.init?.dispatcher, undefined, "should fallback to direct");
  });

  it("sets User-Agent OKX/2.7.2 when DoH proxy is active", async () => {
    const mockResolver: DohResolver = async () => ({
      ip: "1.2.3.4",
      host: "proxy.example.com",
      ttl: 120,
    });

    let capturedHeaders: Headers | undefined;
    const capturingFetch: typeof globalThis.fetch = async (input, init) => {
      capturedHeaders = new Headers((init as RequestInit)?.headers);
      return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const client = new OkxRestClient(BASE_CONFIG, { resolveDoh: mockResolver });
    await withFetch(capturingFetch, () =>
      client.publicGet("/api/v5/market/ticker"),
    );
    assert.equal(capturedHeaders?.get("User-Agent"), "OKX/2.7.2");
  });

  it("proxy_url takes precedence over DoH", async () => {
    let resolverCalled = false;
    const mockResolver: DohResolver = async () => {
      resolverCalled = true;
      return { ip: "1.2.3.4", host: "proxy.example.com", ttl: 120 };
    };

    const captured: { init?: Record<string, unknown> } = {};
    const client = new OkxRestClient(
      { ...BASE_CONFIG, proxyUrl: "http://127.0.0.1:7890" },
      { resolveDoh: mockResolver },
    );
    await withFetch(capturingFetchInit(captured), () =>
      client.publicGet("/api/v5/market/ticker"),
    );
    assert.equal(resolverCalled, false, "resolver should not be called when proxy_url is set");
  });

  it("only resolves DoH once (cached after first request)", async () => {
    let resolveCount = 0;
    const mockResolver: DohResolver = async () => {
      resolveCount++;
      return { ip: "1.2.3.4", host: "proxy.example.com", ttl: 120 };
    };

    const client = new OkxRestClient(BASE_CONFIG, { resolveDoh: mockResolver });
    await withFetch(
      jsonFetch({ code: "0", msg: "", data: [] }),
      async () => {
        await client.publicGet("/api/v5/market/ticker");
        await client.publicGet("/api/v5/market/ticker");
        await client.publicGet("/api/v5/market/ticker");
      },
    );
    assert.equal(resolveCount, 1, "resolver should only be called once");
  });
});

describe("OkxRestClient: DoH network failure retry", () => {
  it("retries with direct connection on network failure via DoH", async () => {
    const mockResolver: DohResolver = async () => ({
      ip: "1.2.3.4",
      host: "proxy.example.com",
      ttl: 120,
    });

    let callCount = 0;
    const mockFetch: typeof globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        // First call via DoH proxy — simulate network error
        throw new TypeError("fetch failed");
      }
      // Second call (retry via direct) — succeed
      return new Response(JSON.stringify({ code: "0", msg: "", data: [{ ok: true }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const client = new OkxRestClient(BASE_CONFIG, { resolveDoh: mockResolver });
    await withFetch(mockFetch, async () => {
      const result = await client.publicGet("/api/v5/market/ticker");
      assert.deepEqual(result.data, [{ ok: true }]);
    });
    assert.equal(callCount, 2, "should have retried after DoH failure");
  });

  it("throws NetworkError if both DoH and direct fail", async () => {
    // First resolution succeeds (DoH node), retry resolution returns null (no binary → direct)
    let resolveCount = 0;
    const mockResolver: DohResolver = async () => {
      resolveCount++;
      if (resolveCount === 1) return { ip: "1.2.3.4", host: "proxy.example.com", ttl: 120 };
      return null; // binary "not found" on retry
    };

    const alwaysFail: typeof globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };

    const client = new OkxRestClient(BASE_CONFIG, { resolveDoh: mockResolver });
    await withFetch(alwaysFail, async () => {
      await assert.rejects(
        () => client.publicGet("/api/v5/market/ticker"),
        (err) => err instanceof NetworkError,
      );
    });
  });
});
