/**
 * Unit tests for DohManager state machine:
 * prepareDoh(), getConnectionParams(), handleNetworkFailure(), cacheDirectIfNeeded().
 *
 * Uses mock binary + temp cache files to control resolver behavior.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { DohManager } from "../src/doh/manager.js";
import type { DohCacheFile } from "../src/doh/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MOCK_BINARY = join(__dirname, "fixtures", "mock-doh-binary.mjs");
const BASE_URL = "https://www.okx.com";

let tempDir: string;
let cachePath: string;

// DohManager reads cache via resolveDoh which uses the default cache path.
// We override the env var to point the binary at our mock, and seed the cache
// file at the default location. To isolate tests we use a per-test cache path
// and monkey-patch the resolver's cache path via the environment.

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "doh-manager-test-"));
  cachePath = join(tempDir, "doh-cache.json");
  process.env.OKX_DOH_BINARY_PATH = MOCK_BINARY;
  // Point the cache module to our temp file
  process.env.OKX_DOH_CACHE_PATH = cachePath;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.OKX_DOH_BINARY_PATH;
  delete process.env.OKX_DOH_CACHE_PATH;
});

function seedCache(file: DohCacheFile): void {
  writeFileSync(cachePath, JSON.stringify(file));
}

function readCacheFile(): DohCacheFile {
  return JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
}

// ---------------------------------------------------------------------------
// prepareDoh
// ---------------------------------------------------------------------------

describe("DohManager.prepareDoh", () => {
  it("skips DoH entirely when hasCustomProxy is true", () => {
    const mgr = new DohManager({ baseUrl: BASE_URL, hasCustomProxy: true });
    mgr.prepareDoh();

    const conn = mgr.getConnectionParams();
    assert.equal(conn.baseUrl, BASE_URL);
    assert.equal(conn.dispatcher, undefined);
    assert.equal(conn.userAgent, undefined);
    assert.equal(mgr.isProxyActive, false);
  });

  it("returns direct params when no cache exists (directUnverified)", () => {
    const mgr = new DohManager({ baseUrl: BASE_URL });
    mgr.prepareDoh();

    const conn = mgr.getConnectionParams();
    assert.equal(conn.baseUrl, BASE_URL);
    assert.equal(mgr.isProxyActive, false);
  });

  it("returns direct params when cache says mode=direct", () => {
    seedCache({
      "www.okx.com": {
        mode: "direct", node: null, failedNodes: [], updatedAt: Date.now(),
      },
    });

    const mgr = new DohManager({ baseUrl: BASE_URL });
    mgr.prepareDoh();

    const conn = mgr.getConnectionParams();
    assert.equal(conn.baseUrl, BASE_URL);
    assert.equal(mgr.isProxyActive, false);
  });

  it("applies proxy node when cache says mode=proxy", () => {
    seedCache({
      "www.okx.com": {
        mode: "proxy",
        node: { ip: "192.0.2.1", host: "proxy1.com", ttl: 300 },
        failedNodes: [],
        updatedAt: Date.now(),
      },
    });

    const mgr = new DohManager({ baseUrl: BASE_URL });
    mgr.prepareDoh();

    const conn = mgr.getConnectionParams();
    assert.equal(conn.baseUrl, "https://proxy1.com");
    assert.ok(conn.dispatcher);
    assert.ok(conn.userAgent?.includes("OKX/@okx_ai/"));
    assert.equal(mgr.isProxyActive, true);
  });

  it("is idempotent — second call does nothing", () => {
    const mgr = new DohManager({ baseUrl: BASE_URL });
    mgr.prepareDoh();
    // Seed cache AFTER first call — should be ignored
    seedCache({
      "www.okx.com": {
        mode: "proxy",
        node: { ip: "192.0.2.1", host: "proxy1.com", ttl: 300 },
        failedNodes: [],
        updatedAt: Date.now(),
      },
    });
    mgr.prepareDoh();

    assert.equal(mgr.isProxyActive, false);
  });
});

// ---------------------------------------------------------------------------
// cacheDirectIfNeeded
// ---------------------------------------------------------------------------

describe("DohManager.cacheDirectIfNeeded", () => {
  it("caches mode=direct after first successful direct connection", () => {
    const mgr = new DohManager({ baseUrl: BASE_URL });
    mgr.prepareDoh(); // no cache → directUnverified=true

    mgr.cacheDirectIfNeeded();

    const file = readCacheFile();
    assert.equal(file["www.okx.com"].mode, "direct");
  });

  it("does nothing on second call (already verified)", () => {
    const mgr = new DohManager({ baseUrl: BASE_URL });
    mgr.prepareDoh();
    mgr.cacheDirectIfNeeded();

    // Modify cache to proxy — cacheDirectIfNeeded should NOT overwrite
    seedCache({
      "www.okx.com": {
        mode: "proxy",
        node: { ip: "192.0.2.1", host: "proxy1.com", ttl: 300 },
        failedNodes: [],
        updatedAt: Date.now(),
      },
    });

    mgr.cacheDirectIfNeeded();
    const file = readCacheFile();
    assert.equal(file["www.okx.com"].mode, "proxy"); // untouched
  });

  it("does nothing when proxy node is active", () => {
    seedCache({
      "www.okx.com": {
        mode: "proxy",
        node: { ip: "192.0.2.1", host: "proxy1.com", ttl: 300 },
        failedNodes: [],
        updatedAt: Date.now(),
      },
    });

    const mgr = new DohManager({ baseUrl: BASE_URL });
    mgr.prepareDoh();

    mgr.cacheDirectIfNeeded(); // should be no-op since proxy is active
    const file = readCacheFile();
    assert.equal(file["www.okx.com"].mode, "proxy"); // untouched
  });
});

// ---------------------------------------------------------------------------
// handleNetworkFailure
// ---------------------------------------------------------------------------

describe("DohManager.handleNetworkFailure", () => {
  it("re-resolves to proxy node when direct connection fails", async () => {
    // No cache → direct first → failure → calls binary for "www.okx.com"
    // Mock binary returns proxy node for domain not in its switch → "unknown domain" → fail
    // But we need to use a domain the mock recognizes
    // Use proxy.okx.com as base URL so mock returns a proxy node
    const mgr = new DohManager({ baseUrl: "https://proxy.okx.com" });
    mgr.prepareDoh(); // no cache → directUnverified

    const shouldRetry = await mgr.handleNetworkFailure();
    assert.equal(shouldRetry, true);
    assert.equal(mgr.isProxyActive, true);

    const conn = mgr.getConnectionParams();
    assert.equal(conn.baseUrl, "https://proxy1.com");
  });

  it("resets dohRetried after successful re-resolution (MCP long-running)", async () => {
    const mgr = new DohManager({ baseUrl: "https://proxy.okx.com" });
    mgr.prepareDoh();

    await mgr.handleNetworkFailure();
    assert.equal(mgr.hasRetried, false); // reset after successful proxy switch

    // Can handle another failure later
    const shouldRetry = await mgr.handleNetworkFailure();
    assert.equal(shouldRetry, true);
  });

  it("returns false on second failure if re-resolution failed", async () => {
    // Use fail.okx.com — mock binary returns code=1
    const mgr = new DohManager({ baseUrl: "https://fail.okx.com" });
    mgr.prepareDoh();

    const first = await mgr.handleNetworkFailure();
    assert.equal(first, true); // retries with direct
    assert.equal(mgr.hasRetried, true); // NOT reset because re-resolution failed

    const second = await mgr.handleNetworkFailure();
    assert.equal(second, false); // already retried
  });

  it("excludes failed proxy IP on re-resolution", async () => {
    seedCache({
      "multi.okx.com": {
        mode: "proxy",
        node: { ip: "192.0.2.1", host: "proxy1.com", ttl: 300 },
        failedNodes: [],
        updatedAt: Date.now(),
      },
    });

    const mgr = new DohManager({ baseUrl: "https://multi.okx.com" });
    mgr.prepareDoh(); // loads proxy node 192.0.2.1

    assert.equal(mgr.isProxyActive, true);

    // Simulate proxy failure → re-resolve excluding 192.0.2.1 → gets 198.51.100.2
    const shouldRetry = await mgr.handleNetworkFailure();
    assert.equal(shouldRetry, true);
    assert.equal(mgr.isProxyActive, true);

    const conn = mgr.getConnectionParams();
    assert.equal(conn.baseUrl, "https://proxy2.com");
  });
});
