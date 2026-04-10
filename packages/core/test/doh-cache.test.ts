import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readCache, writeCache, invalidateCache } from "../src/doh/cache.js";
import type { DohCacheEntry, DohCacheFile } from "../src/doh/types.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "doh-cache-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("DohCache: readCache", () => {
  it("returns null when cache file does not exist", () => {
    const result = readCache("www.okx.com", join(tempDir, "nonexistent.json"));
    assert.equal(result, null);
  });

  it("returns null when cache file is corrupted JSON", () => {
    const cachePath = join(tempDir, "cache.json");
    writeFileSync(cachePath, "not json{{{");
    const result = readCache("www.okx.com", cachePath);
    assert.equal(result, null);
  });

  it("returns parsed cache entry for matching hostname", () => {
    const cachePath = join(tempDir, "cache.json");
    const entry: DohCacheEntry = {
      mode: "proxy",
      node: { ip: "192.0.2.1", host: "proxy.com", ttl: 120 },
      failedNodes: [],
      updatedAt: Date.now(),
    };
    const file: DohCacheFile = { "www.okx.com": entry };
    writeFileSync(cachePath, JSON.stringify(file));
    const result = readCache("www.okx.com", cachePath);
    assert.deepEqual(result, entry);
  });

  it("returns null when hostname not in cache", () => {
    const cachePath = join(tempDir, "cache.json");
    const file: DohCacheFile = {
      "www.okx.com": {
        mode: "direct", node: null, failedNodes: [], updatedAt: Date.now(),
      },
    };
    writeFileSync(cachePath, JSON.stringify(file));
    const result = readCache("www.other.com", cachePath);
    assert.equal(result, null);
  });
});

describe("DohCache: writeCache", () => {
  it("writes cache entry under hostname key", () => {
    const cachePath = join(tempDir, "cache.json");
    const entry: DohCacheEntry = {
      mode: "direct",
      node: null,
      failedNodes: [],
      updatedAt: Date.now(),
    };
    writeCache("www.okx.com", entry, cachePath);
    const raw = readFileSync(cachePath, "utf-8");
    const file = JSON.parse(raw) as DohCacheFile;
    assert.deepEqual(file["www.okx.com"], entry);
  });

  it("preserves entries for other hostnames", () => {
    const cachePath = join(tempDir, "cache.json");
    const existing: DohCacheFile = {
      "www.okx.com": {
        mode: "direct", node: null, failedNodes: [], updatedAt: 1000,
      },
    };
    writeFileSync(cachePath, JSON.stringify(existing));

    const newEntry: DohCacheEntry = {
      mode: "proxy",
      node: { ip: "198.51.100.2", host: "proxy2.com", ttl: 60 },
      failedNodes: [],
      updatedAt: Date.now(),
    };
    writeCache("www.other.com", newEntry, cachePath);

    const raw = readFileSync(cachePath, "utf-8");
    const file = JSON.parse(raw) as DohCacheFile;
    assert.deepEqual(file["www.okx.com"], existing["www.okx.com"]);
    assert.deepEqual(file["www.other.com"], newEntry);
  });

  it("creates parent directory if not exists", () => {
    const cachePath = join(tempDir, "sub", "dir", "cache.json");
    writeCache("www.okx.com", {
      mode: "direct",
      node: null,
      failedNodes: [],
      updatedAt: Date.now(),
    }, cachePath);
    assert.ok(readFileSync(cachePath, "utf-8").includes("www.okx.com"));
  });
});

describe("DohCache: invalidateCache", () => {
  it("deletes cache file", () => {
    const cachePath = join(tempDir, "cache.json");
    writeFileSync(cachePath, "{}");
    invalidateCache(cachePath);
    assert.equal(existsSync(cachePath), false);
  });

  it("does not throw when file does not exist", () => {
    assert.doesNotThrow(() => invalidateCache(join(tempDir, "nope.json")));
  });
});
