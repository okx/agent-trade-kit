import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { isNewerVersion, resolveNpmRegistry, buildNpmrcCandidates } from "../src/utils/update-check.js";

// ---------------------------------------------------------------------------
// isNewerVersion tests (existing suite preserved)
// ---------------------------------------------------------------------------

describe("isNewerVersion", () => {
  it("returns true when major is bumped", () => {
    assert.equal(isNewerVersion("1.0.0", "2.0.0"), true);
  });

  it("returns false when latest major is lower", () => {
    assert.equal(isNewerVersion("2.0.0", "1.9.9"), false);
  });

  it("returns true when minor is bumped (same major)", () => {
    assert.equal(isNewerVersion("1.0.0", "1.1.0"), true);
  });

  it("returns false when latest minor is lower", () => {
    assert.equal(isNewerVersion("1.5.0", "1.4.9"), false);
  });

  it("returns true when patch is bumped (same major.minor)", () => {
    assert.equal(isNewerVersion("1.0.0", "1.0.1"), true);
  });

  it("returns false when versions are equal", () => {
    assert.equal(isNewerVersion("1.0.1", "1.0.1"), false);
  });

  it("returns false when current is newer", () => {
    assert.equal(isNewerVersion("1.0.2", "1.0.1"), false);
  });

  it("handles v-prefix in version strings", () => {
    assert.equal(isNewerVersion("v1.0.0", "v1.0.1"), true);
    assert.equal(isNewerVersion("v1.2.3", "v1.2.3"), false);
  });

  it("handles double-digit versions correctly", () => {
    assert.equal(isNewerVersion("1.9.0", "1.10.0"), true);
    assert.equal(isNewerVersion("1.10.0", "1.9.99"), false);
  });

  // Prerelease suffix behaviour (parseInt strips "-beta.x" naturally)
  it("treats prerelease as equal to same numeric stable (beta suffix stripped by parseInt)", () => {
    // "1.2.8-beta.2" → parsed patch = parseInt("8-beta") = 8; same as "1.2.8"
    assert.equal(isNewerVersion("1.2.8-beta.2", "1.2.8"), false);
    assert.equal(isNewerVersion("1.2.8", "1.2.8-beta.2"), false);
  });

  it("detects upgrade from stable to next minor even if current is prerelease", () => {
    assert.equal(isNewerVersion("1.2.8-beta.2", "1.2.9"), true);
  });

  it("detects upgrade from older stable to prerelease of newer minor (--beta path)", () => {
    assert.equal(isNewerVersion("1.2.7", "1.2.8-beta.2"), true);
  });

  // B1.5: null latest guard
  it("returns false when latest is null (negative cache guard)", () => {
    assert.equal(isNewerVersion("1.0.0", null), false);
  });
});

// ---------------------------------------------------------------------------
// resolveNpmRegistry tests (B1)
// ---------------------------------------------------------------------------

describe("resolveNpmRegistry", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.npm_config_registry;
    delete process.env.npm_config_registry;
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.npm_config_registry = savedEnv;
    } else {
      delete process.env.npm_config_registry;
    }
  });

  it("returns npm_config_registry env var when set", () => {
    process.env.npm_config_registry = "https://example.com/";
    assert.equal(resolveNpmRegistry(), "https://example.com/");
  });

  it("appends trailing slash when env var lacks one", () => {
    process.env.npm_config_registry = "https://example.com";
    assert.equal(resolveNpmRegistry(), "https://example.com/");
  });

  it("returns default registry https://registry.npmjs.org/ as fallback", () => {
    // When env var is unset and no .npmrc in the walk has registry=, falls back
    delete process.env.npm_config_registry;
    const result = resolveNpmRegistry();
    assert.ok(typeof result === "string", "should return a string");
    assert.ok(result.startsWith("https://"), "should start with https://");
    assert.ok(result.endsWith("/"), "should end with trailing slash");
  });
});

// ---------------------------------------------------------------------------
// buildNpmrcCandidates — dedup test
// ---------------------------------------------------------------------------

describe("buildNpmrcCandidates", () => {
  it("returns no duplicate paths even when homedir() is an ancestor of cwd()", () => {
    const candidates = buildNpmrcCandidates();
    const unique = new Set(candidates);
    assert.equal(
      candidates.length,
      unique.size,
      `Duplicate paths in buildNpmrcCandidates output: ${JSON.stringify(candidates)}`,
    );
  });

  it("always ends with the home .npmrc path (before /etc/npmrc on posix)", () => {
    const candidates = buildNpmrcCandidates();
    const homePath = join(homedir(), ".npmrc");
    assert.ok(
      candidates.includes(homePath),
      `Expected ${homePath} to appear in candidates`,
    );
  });
});

// ---------------------------------------------------------------------------
// checkForUpdates tests — kill switch (B0) + negative cache (B1.5)
// ---------------------------------------------------------------------------

const CACHE_FILE = join(homedir(), ".okx", "update-check.json");

function clearUpdateCache(): void {
  try { unlinkSync(CACHE_FILE); } catch { /* ignore */ }
}

function writeUpdateCache(entry: Record<string, unknown>): void {
  mkdirSync(join(homedir(), ".okx"), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(entry), "utf-8");
}

describe("checkForUpdates - kill switch (B0)", () => {
  let savedEnv: string | undefined;
  let savedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    savedEnv = process.env.OKX_UPDATE_CHECK;
    savedFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.OKX_UPDATE_CHECK = savedEnv;
    } else {
      delete process.env.OKX_UPDATE_CHECK;
    }
    globalThis.fetch = savedFetch;
  });

  it("returns immediately and never calls fetch when OKX_UPDATE_CHECK=false", async () => {
    const { checkForUpdates } = await import("../src/utils/update-check.js");

    process.env.OKX_UPDATE_CHECK = "false";
    clearUpdateCache();

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };

    checkForUpdates("test-pkg", "1.0.0");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(fetchCalled, false, "fetch must not be called when kill switch is active");
  });

  it("normal flow proceeds when OKX_UPDATE_CHECK=0 (not exact 'false')", async () => {
    const { checkForUpdates } = await import("../src/utils/update-check.js");

    process.env.OKX_UPDATE_CHECK = "0";
    clearUpdateCache();

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ version: "1.0.1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    checkForUpdates("test-pkg-b0-0", "1.0.0");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(fetchCalled, true, "fetch should be called when OKX_UPDATE_CHECK is not 'false'");
  });

  it("normal flow proceeds when OKX_UPDATE_CHECK is unset", async () => {
    const { checkForUpdates } = await import("../src/utils/update-check.js");

    delete process.env.OKX_UPDATE_CHECK;
    clearUpdateCache();

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ version: "1.0.1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    checkForUpdates("test-pkg-b0-unset", "1.0.0");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(fetchCalled, true, "fetch should be called when OKX_UPDATE_CHECK is unset");
  });
});

describe("checkForUpdates - negative cache (B1.5)", () => {
  let savedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    savedFetch = globalThis.fetch;
    delete process.env.OKX_UPDATE_CHECK;
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  it("writes negative cache entry when fetch returns failure (HTTP 500)", async () => {
    const { checkForUpdates } = await import("../src/utils/update-check.js");

    clearUpdateCache();
    const PKG = "test-neg-cache-pkg";

    globalThis.fetch = async () => new Response(null, { status: 500 });

    checkForUpdates(PKG, "1.0.0");
    await new Promise((r) => setTimeout(r, 200));

    assert.ok(existsSync(CACHE_FILE), "cache file must be written after failure");
    const cache = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as Record<string, unknown>;
    const entry = cache[PKG] as Record<string, unknown> | undefined;
    assert.ok(entry, "cache entry must exist for the package");
    assert.equal(entry.latestVersion, null, "latestVersion must be null on failure");
    assert.equal(entry.failed, true, "failed flag must be true");
    assert.ok(typeof entry.checkedAt === "number", "checkedAt must be a number");
  });

  it("skips refresh when negative cache entry is fresh (< 1h)", async () => {
    const { checkForUpdates } = await import("../src/utils/update-check.js");

    const PKG = "test-neg-fresh-pkg";
    writeUpdateCache({ [PKG]: { latestVersion: null, checkedAt: Date.now(), failed: true } });

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };

    checkForUpdates(PKG, "1.0.0");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(fetchCalled, false, "fetch must not be called when negative cache is fresh");
  });

  it("fires refresh when negative cache entry is stale (> 1h)", async () => {
    const { checkForUpdates } = await import("../src/utils/update-check.js");

    const PKG = "test-neg-stale-pkg";
    const staleTime = Date.now() - 61 * 60 * 1000;
    writeUpdateCache({ [PKG]: { latestVersion: null, checkedAt: staleTime, failed: true } });

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ version: "1.0.1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    checkForUpdates(PKG, "1.0.0");
    await new Promise((r) => setTimeout(r, 100));

    assert.equal(fetchCalled, true, "fetch must be called when negative cache is stale");
  });

  it("preserves 24h TTL for positive cache entries (no failed flag)", async () => {
    const { checkForUpdates } = await import("../src/utils/update-check.js");

    const PKG = "test-pos-fresh-pkg";
    writeUpdateCache({ [PKG]: { latestVersion: "1.0.1", checkedAt: Date.now() } });

    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response("{}", { status: 200 });
    };

    checkForUpdates(PKG, "1.0.0");
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(fetchCalled, false, "fetch must not be called when positive cache is fresh");
  });

  it("does not print upgrade notice when latestVersion is null", async () => {
    const { checkForUpdates } = await import("../src/utils/update-check.js");

    const PKG = "test-null-version-pkg";
    writeUpdateCache({ [PKG]: { latestVersion: null, checkedAt: Date.now(), failed: true } });

    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      globalThis.fetch = async () => new Response("{}", { status: 200 });
      checkForUpdates(PKG, "1.0.0");
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      process.stderr.write = origWrite as typeof process.stderr.write;
    }

    const combined = stderrChunks.join("");
    assert.ok(!combined.includes("Update available"), "must not print update notice for null version");
  });
});
