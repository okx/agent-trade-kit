/**
 * Tests for DoH resolver logic: resolveDoh, reResolveDoh, classifyAndCache.
 *
 * Uses a mock binary (test/fixtures/mock-doh-binary.mjs) controlled by domain name,
 * and temp-dir cache files to avoid touching real user cache.
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
import { resolveDoh, reResolveDoh } from "../src/doh/resolver.js";
import type { DohCacheFile } from "../src/doh/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MOCK_BINARY = join(__dirname, "fixtures", "mock-doh-binary.mjs");

let tempDir: string;
let cachePath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "doh-resolver-test-"));
  cachePath = join(tempDir, "doh-node-cache.json");
  process.env.OKX_DOH_BINARY_PATH = MOCK_BINARY;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.OKX_DOH_BINARY_PATH;
});

// ---------------------------------------------------------------------------
// resolveDoh (synchronous, cache-only)
// ---------------------------------------------------------------------------

describe("resolveDoh", () => {
  it("returns mode=null when no cache file exists", () => {
    const result = resolveDoh("www.okx.com", cachePath);
    assert.equal(result.mode, null);
    assert.equal(result.node, null);
  });

  it("returns mode=direct from cached direct entry", () => {
    const file: DohCacheFile = {
      "www.okx.com": {
        mode: "direct", node: null, failedNodes: [], updatedAt: Date.now(),
      },
    };
    writeFileSync(cachePath, JSON.stringify(file));

    const result = resolveDoh("www.okx.com", cachePath);
    assert.equal(result.mode, "direct");
    assert.equal(result.node, null);
  });

  it("returns mode=proxy with cached node", () => {
    const node = { ip: "192.0.2.1", host: "proxy1.com", ttl: 300 };
    const file: DohCacheFile = {
      "www.okx.com": {
        mode: "proxy", node, failedNodes: [], updatedAt: Date.now(),
      },
    };
    writeFileSync(cachePath, JSON.stringify(file));

    const result = resolveDoh("www.okx.com", cachePath);
    assert.equal(result.mode, "proxy");
    assert.deepEqual(result.node, node);
  });

  it("returns mode=null when cached proxy has null node (treated as cache miss)", () => {
    const file: DohCacheFile = {
      "www.okx.com": {
        mode: "proxy", node: null, failedNodes: [{ ip: "192.0.2.1", failedAt: Date.now() }],
        updatedAt: Date.now(),
      },
    };
    writeFileSync(cachePath, JSON.stringify(file));

    const result = resolveDoh("www.okx.com", cachePath);
    assert.equal(result.mode, null);
    assert.equal(result.node, null);
  });

  it("returns mode=null for a different hostname not in cache", () => {
    const file: DohCacheFile = {
      "www.okx.com": {
        mode: "direct", node: null, failedNodes: [], updatedAt: Date.now(),
      },
    };
    writeFileSync(cachePath, JSON.stringify(file));

    const result = resolveDoh("other.okx.com", cachePath);
    assert.equal(result.mode, null);
  });
});

// ---------------------------------------------------------------------------
// reResolveDoh — calls binary, classifies result, manages failedNodes
// ---------------------------------------------------------------------------

describe("reResolveDoh", () => {
  it("returns proxy node and writes cache when binary succeeds", async () => {
    const result = await reResolveDoh("proxy.okx.com", "", undefined, cachePath);

    assert.equal(result.mode, "proxy");
    assert.equal(result.node?.ip, "192.0.2.1");
    assert.equal(result.node?.host, "proxy1.com");

    // Verify cache was written
    const file = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    assert.equal(file["proxy.okx.com"].mode, "proxy");
    assert.equal(file["proxy.okx.com"].node?.ip, "192.0.2.1");
  });

  it("detects direct mode when binary returns node matching hostname", async () => {
    const result = await reResolveDoh("direct.okx.com", "", undefined, cachePath);

    assert.equal(result.mode, "direct");
    assert.equal(result.node, null);

    const file = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    assert.equal(file["direct.okx.com"].mode, "direct");
  });

  it("classifies as proxy when ip differs from hostname even if host matches", async () => {
    // This is the key bug fix: binary returns { ip: CDN, host: original_hostname }
    // which should be treated as proxy (CDN bypasses DNS pollution), not direct.
    const result = await reResolveDoh("cdnhost.okx.com", "", undefined, cachePath);

    assert.equal(result.mode, "proxy");
    assert.equal(result.node?.ip, "d1a9ug9i3w9ke0.cloudfront.net");
    assert.equal(result.node?.host, "cdnhost.okx.com");

    const file = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    assert.equal(file["cdnhost.okx.com"].mode, "proxy");
    assert.equal(file["cdnhost.okx.com"].node?.ip, "d1a9ug9i3w9ke0.cloudfront.net");
  });

  it("returns mode=null and does NOT write cache when binary fails", async () => {
    const result = await reResolveDoh("fail.okx.com", "", undefined, cachePath);

    assert.equal(result.mode, null);
    assert.equal(result.node, null);

    // Cache should not exist
    assert.throws(() => readFileSync(cachePath, "utf-8"), { code: "ENOENT" });
  });

  it("appends failed IP to exclude list and persists with new node", async () => {
    // First: get nodeA (192.0.2.1)
    await reResolveDoh("multi.okx.com", "", undefined, cachePath);
    const file1 = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    assert.equal(file1["multi.okx.com"].node?.ip, "192.0.2.1");

    // nodeA fails → exclude 192.0.2.1 → get nodeB (198.51.100.2)
    const result = await reResolveDoh("multi.okx.com", "192.0.2.1", undefined, cachePath);
    assert.equal(result.mode, "proxy");
    assert.equal(result.node?.ip, "198.51.100.2");

    const file2 = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    assert.equal(file2["multi.okx.com"].node?.ip, "198.51.100.2");
    assert.equal(file2["multi.okx.com"].failedNodes.length, 1);
    assert.equal(file2["multi.okx.com"].failedNodes[0].ip, "192.0.2.1");
  });

  it("does not duplicate failed IP when already in list", async () => {
    // Seed cache with a failed node
    const file: DohCacheFile = {
      "proxy.okx.com": {
        mode: "proxy",
        node: { ip: "203.0.113.9", host: "old.com", ttl: 60 },
        failedNodes: [{ ip: "192.0.2.1", failedAt: Date.now() }],
        updatedAt: Date.now(),
      },
    };
    writeFileSync(cachePath, JSON.stringify(file));

    // Re-resolve with same failed IP
    const result = await reResolveDoh("proxy.okx.com", "192.0.2.1", undefined, cachePath);
    assert.equal(result.mode, "proxy");

    const updated = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    // Should still be 1, not 2
    assert.equal(updated["proxy.okx.com"].failedNodes.length, 1);
  });

  it("all nodes exhausted → no cache write, returns null", async () => {
    // Seed cache with both nodes already failed
    const file: DohCacheFile = {
      "multi.okx.com": {
        mode: "proxy",
        node: { ip: "198.51.100.2", host: "proxy2.com", ttl: 120 },
        failedNodes: [{ ip: "192.0.2.1", failedAt: Date.now() }],
        updatedAt: Date.now(),
      },
    };
    writeFileSync(cachePath, JSON.stringify(file));

    // nodeB (198.51.100.2) also fails → exclude both → binary returns null
    const result = await reResolveDoh("multi.okx.com", "198.51.100.2", undefined, cachePath);
    assert.equal(result.mode, null);
    assert.equal(result.node, null);

    // Cache should still have OLD entry (not overwritten with bad data)
    const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    assert.equal(cached["multi.okx.com"].node?.ip, "198.51.100.2");
  });

  it("expired failed nodes (>1h) are filtered out", async () => {
    const ONE_HOUR_AGO = Date.now() - 61 * 60 * 1000;
    const file: DohCacheFile = {
      "multi.okx.com": {
        mode: "proxy",
        node: { ip: "198.51.100.2", host: "proxy2.com", ttl: 120 },
        failedNodes: [{ ip: "192.0.2.1", failedAt: ONE_HOUR_AGO }],
        updatedAt: ONE_HOUR_AGO,
      },
    };
    writeFileSync(cachePath, JSON.stringify(file));

    // 198.51.100.2 fails, but 192.0.2.1 is expired → only exclude 198.51.100.2
    // mock binary: exclude=[198.51.100.2] (not 192.0.2.1) → returns 192.0.2.1
    const result = await reResolveDoh("multi.okx.com", "198.51.100.2", undefined, cachePath);
    assert.equal(result.mode, "proxy");
    assert.equal(result.node?.ip, "192.0.2.1");

    const cached = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    // failedNodes should only contain 198.51.100.2 (192.0.2.1 was expired and removed)
    assert.equal(cached["multi.okx.com"].failedNodes.length, 1);
    assert.equal(cached["multi.okx.com"].failedNodes[0].ip, "198.51.100.2");
  });

  it("empty failedIp does not add phantom entry", async () => {
    const result = await reResolveDoh("proxy.okx.com", "", undefined, cachePath);
    assert.equal(result.mode, "proxy");

    const file = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    assert.equal(file["proxy.okx.com"].failedNodes.length, 0);
  });
});
