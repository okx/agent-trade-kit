/**
 * Unit tests for okx-auth binary auto-update check.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test the private cache helpers indirectly through the public API.
// For direct cache file testing, we import the module internals via a
// re-export trick — but since the cache path is hardcoded to ~/.okx/,
// we test the public functions with controlled env + filesystem state.

// ---------------------------------------------------------------------------
// Helpers: direct cache file manipulation for assertions
// ---------------------------------------------------------------------------

const CACHE_FILENAME = "auth-binary-check.json";

function writeFakeCache(dir: string, cdnSha256: string, checkedAt: number): string {
  const path = join(dir, CACHE_FILENAME);
  writeFileSync(path, JSON.stringify({ cdnSha256, checkedAt }), "utf-8");
  return path;
}

function readFakeCache(dir: string): { cdnSha256: string; checkedAt: number } | null {
  const path = join(dir, CACHE_FILENAME);
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test: updateAuthBinaryCache / clearAuthBinaryCache
// ---------------------------------------------------------------------------

// These functions write to ~/.okx/ which is not ideal for unit tests.
// We verify the module loads and exports correctly; integration tests
// cover the full flow.

describe("auth update-check module", () => {
  it("exports ensureAuthBinaryLatest as a function", async () => {
    const mod = await import("../src/auth/update-check.js");
    assert.equal(typeof mod.ensureAuthBinaryLatest, "function");
  });

  it("exports updateAuthBinaryCache as a function", async () => {
    const mod = await import("../src/auth/update-check.js");
    assert.equal(typeof mod.updateAuthBinaryCache, "function");
  });

  it("exports clearAuthBinaryCache as a function", async () => {
    const mod = await import("../src/auth/update-check.js");
    assert.equal(typeof mod.clearAuthBinaryCache, "function");
  });

  it("ensureAuthBinaryLatest returns void (does not throw on missing binary)", async () => {
    // With OKX_AUTH_BIN set to a non-existent path, the function should
    // short-circuit immediately (custom binary → skip).
    const orig = process.env.OKX_AUTH_BIN;
    try {
      process.env.OKX_AUTH_BIN = "/tmp/does-not-exist-okx-auth";
      const mod = await import("../src/auth/update-check.js");
      await mod.ensureAuthBinaryLatest();
      // If we get here without throwing, the test passes.
    } finally {
      if (orig === undefined) {
        delete process.env.OKX_AUTH_BIN;
      } else {
        process.env.OKX_AUTH_BIN = orig;
      }
    }
  });
});
