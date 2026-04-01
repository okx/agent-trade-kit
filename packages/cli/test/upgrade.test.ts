/**
 * Unit tests for cmdUpgrade (packages/cli/src/commands/upgrade.ts).
 *
 * Key behaviours under test:
 *  1. Prerelease-strip pure logic (/[-+].+$/ regex)
 *  2. Throttle: fresh cache → silent no-op (no stderr, no stdout)
 *  3. Throttle: fresh cache + --json → JSON up-to-date shape, no fetch call
 *  4. --check: reports update-available / up-to-date without installing
 *  5. --check: does NOT write the cache file (check-only, no side-effects)
 *  6. Prerelease current vs same stable latest → up-to-date  (1.2.8-beta.2 vs 1.2.8)
 *  7. Prerelease current vs newer stable latest → update-available (1.2.8-beta.2 vs 1.2.9)
 *  8. --beta: uses dist-tags.next instead of /latest
 *  9. Fetch failure → error status + exitCode 1
 * 10. Stale cache (> 12 h): proceeds to fetch instead of throttling
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { cmdUpgrade } from "../src/commands/upgrade.js";

// ---------------------------------------------------------------------------
// Constants matching upgrade.ts internals
// ---------------------------------------------------------------------------

const OKX_DIR = join(homedir(), ".okx");
const CACHE_FILE = join(OKX_DIR, "last_check");
const THROTTLE_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function writeFreshCache(): void {
  mkdirSync(OKX_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, String(Math.floor(Date.now() / 1000)), "utf-8");
}

function writeStaleCache(): void {
  mkdirSync(OKX_DIR, { recursive: true });
  const staleEpoch = Math.floor((Date.now() - THROTTLE_MS - 60_000) / 1000); // 12 h + 1 min ago
  writeFileSync(CACHE_FILE, String(staleEpoch), "utf-8");
}

function deleteCacheFile(): void {
  try {
    unlinkSync(CACHE_FILE);
  } catch {
    // ignore if not present
  }
}

// ---------------------------------------------------------------------------
// Output capture helper
// ---------------------------------------------------------------------------

interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}

async function captureOutput(fn: () => Promise<void>): Promise<CaptureResult> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    stderrChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stderr.write;

  const savedExitCode = process.exitCode;
  process.exitCode = undefined;

  try {
    await fn();
  } finally {
    process.stdout.write = origStdout as typeof process.stdout.write;
    process.stderr.write = origStderr as typeof process.stderr.write;
  }

  const capturedExitCode = process.exitCode as number | undefined;
  process.exitCode = savedExitCode;

  return {
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
    exitCode: capturedExitCode,
  };
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

/** Mocks globalThis.fetch to return a specific stable version from /latest. */
function mockFetchLatest(version: string): typeof globalThis.fetch {
  return async (_url: string | URL | Request) => {
    return new Response(JSON.stringify({ version }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

/**
 * Mocks globalThis.fetch to return full package metadata (dist-tags).
 * Used when --beta calls fetchDistTags (fetches the root package URL).
 */
function mockFetchDistTags(latest: string, next: string): typeof globalThis.fetch {
  return async (_url: string | URL | Request) => {
    return new Response(JSON.stringify({ "dist-tags": { latest, next } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

/** Mocks globalThis.fetch to simulate a registry failure (HTTP 500). */
function mockFetchFailure(): typeof globalThis.fetch {
  return async () => new Response(null, { status: 500 });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("cmdUpgrade", () => {
  let savedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    savedFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
  });

  // -------------------------------------------------------------------------
  // 1. Prerelease-strip pure logic
  // -------------------------------------------------------------------------

  describe("prerelease strip regex", () => {
    it("strips -beta.N suffix", () => {
      assert.equal("1.2.8-beta.2".replace(/[-+].+$/, ""), "1.2.8");
    });

    it("strips -rc.1 suffix", () => {
      assert.equal("2.0.0-rc.1".replace(/[-+].+$/, ""), "2.0.0");
    });

    it("strips -alpha suffix", () => {
      assert.equal("1.0.0-alpha".replace(/[-+].+$/, ""), "1.0.0");
    });

    it("leaves stable version unchanged", () => {
      assert.equal("1.2.8".replace(/[-+].+$/, ""), "1.2.8");
    });

    it("leaves double-digit patch unchanged", () => {
      assert.equal("1.10.22".replace(/[-+].+$/, ""), "1.10.22");
    });
  });

  // -------------------------------------------------------------------------
  // 2 & 3. Throttle: fresh cache
  // -------------------------------------------------------------------------

  describe("throttle — fresh cache", () => {
    it("returns silently (no stderr, no stdout) when no flags and cache is fresh", async () => {
      writeFreshCache();
      // If fetch were called, it would throw — proving it was NOT called
      globalThis.fetch = async () => {
        throw new Error("fetch must not be called during throttle");
      };

      const { stdout, stderr } = await captureOutput(() =>
        cmdUpgrade("1.2.8-beta.2", {}, false),
      );

      assert.equal(stdout, "");
      assert.equal(stderr, "");
    });

    it("emits JSON up-to-date shape when --json and cache is fresh", async () => {
      writeFreshCache();
      globalThis.fetch = async () => {
        throw new Error("fetch must not be called during throttle");
      };

      const { stdout, stderr } = await captureOutput(() =>
        cmdUpgrade("1.2.8-beta.2", {}, true),
      );

      assert.equal(stderr, "");
      const result = JSON.parse(stdout.trim());
      assert.equal(result.status, "up-to-date");
      assert.equal(result.updated, false);
      assert.equal(typeof result.currentVersion, "string");
      assert.equal(typeof result.latestVersion, "string");
    });
  });

  // -------------------------------------------------------------------------
  // 10. Stale cache bypasses throttle
  // -------------------------------------------------------------------------

  describe("throttle — stale cache", () => {
    it("proceeds to fetch when cache is older than 12 h", async () => {
      writeStaleCache();
      let fetchCalled = false;
      globalThis.fetch = async (_url: string | URL | Request) => {
        fetchCalled = true;
        return new Response(JSON.stringify({ version: "1.2.8" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      await captureOutput(() => cmdUpgrade("1.2.8", { check: true }, true));

      assert.ok(fetchCalled, "fetch should be called when cache is stale");
    });
  });

  // -------------------------------------------------------------------------
  // 4 & 5. --check flag
  // -------------------------------------------------------------------------

  describe("--check flag", () => {
    it("reports update-available when newer stable version exists", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchLatest("1.2.9");

      const { stdout } = await captureOutput(() =>
        cmdUpgrade("1.2.8", { check: true }, true),
      );

      const result = JSON.parse(stdout.trim());
      assert.equal(result.status, "update-available");
      assert.equal(result.currentVersion, "1.2.8");
      assert.equal(result.latestVersion, "1.2.9");
      assert.equal(result.updated, false);
    });

    it("reports up-to-date when already on latest", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchLatest("1.2.8");

      const { stdout } = await captureOutput(() =>
        cmdUpgrade("1.2.8", { check: true }, true),
      );

      const result = JSON.parse(stdout.trim());
      assert.equal(result.status, "up-to-date");
      assert.equal(result.updated, false);
    });

    it("does NOT write the cache file when --check only", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchLatest("1.2.9");

      await captureOutput(() => cmdUpgrade("1.2.8", { check: true }, false));

      assert.equal(existsSync(CACHE_FILE), false, "cache file must not be written for --check");
    });

    it("prints human-readable update hint to stderr (non-json)", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchLatest("1.2.9");

      const { stderr } = await captureOutput(() =>
        cmdUpgrade("1.2.8", { check: true }, false),
      );

      assert.ok(stderr.includes("1.2.8"), "stderr should include current version");
      assert.ok(stderr.includes("1.2.9"), "stderr should include latest version");
    });
  });

  // -------------------------------------------------------------------------
  // 6 & 7. Prerelease current version vs stable latest
  // -------------------------------------------------------------------------

  describe("prerelease current version comparison", () => {
    it("treats 1.2.8-beta.2 as up-to-date against stable 1.2.8", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchLatest("1.2.8");

      const { stdout } = await captureOutput(() =>
        cmdUpgrade("1.2.8-beta.2", { check: true }, true),
      );

      const result = JSON.parse(stdout.trim());
      // Strip: 1.2.8-beta.2 → 1.2.8; 1.2.8 == 1.2.8 → no update
      assert.equal(result.status, "up-to-date");
    });

    it("detects upgrade when on 1.2.8-beta.2 and stable 1.2.9 is available", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchLatest("1.2.9");

      const { stdout } = await captureOutput(() =>
        cmdUpgrade("1.2.8-beta.2", { check: true }, true),
      );

      const result = JSON.parse(stdout.trim());
      // Strip: 1.2.8-beta.2 → 1.2.8 < 1.2.9 → update available
      assert.equal(result.status, "update-available");
      assert.equal(result.latestVersion, "1.2.9");
    });

    it("detects no upgrade needed when on stable 1.2.7 and registry also has 1.2.7", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchLatest("1.2.7");

      const { stdout } = await captureOutput(() =>
        cmdUpgrade("1.2.7", { check: true }, true),
      );

      const result = JSON.parse(stdout.trim());
      assert.equal(result.status, "up-to-date");
    });
  });

  // -------------------------------------------------------------------------
  // 8. --beta uses dist-tags.next
  // -------------------------------------------------------------------------

  describe("--beta flag", () => {
    it("uses dist-tags.next as the comparison target", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchDistTags("1.2.8", "1.3.0-beta.1");

      const { stdout } = await captureOutput(() =>
        cmdUpgrade("1.2.7", { beta: true, check: true }, true),
      );

      const result = JSON.parse(stdout.trim());
      assert.equal(result.latestVersion, "1.3.0-beta.1");
      assert.equal(result.status, "update-available");
    });

    it("falls back to dist-tags.latest when next is absent", async () => {
      deleteCacheFile();
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: "1.2.8" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

      const { stdout } = await captureOutput(() =>
        cmdUpgrade("1.2.7", { beta: true, check: true }, true),
      );

      const result = JSON.parse(stdout.trim());
      assert.equal(result.latestVersion, "1.2.8");
    });
  });

  // -------------------------------------------------------------------------
  // 9. Fetch failure
  // -------------------------------------------------------------------------

  describe("fetch failure", () => {
    it("sets status error and exitCode 1 when registry returns HTTP 500", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchFailure();

      const { stdout, exitCode } = await captureOutput(() =>
        cmdUpgrade("1.2.8", { check: true }, true),
      );

      const result = JSON.parse(stdout.trim());
      assert.equal(result.status, "error");
      assert.equal(exitCode, 1);
    });

    it("prints error to stderr in non-json mode when fetch fails", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchFailure();

      const { stderr, exitCode } = await captureOutput(() =>
        cmdUpgrade("1.2.8", { check: true }, false),
      );

      assert.ok(stderr.includes("[error]"), `expected [error] in stderr, got: ${stderr}`);
      assert.equal(exitCode, 1);
    });
  });

  // -------------------------------------------------------------------------
  // JSON output shape (UpgradeResult)
  // -------------------------------------------------------------------------

  describe("UpgradeResult shape", () => {
    it("always contains currentVersion, latestVersion, status, updated fields", async () => {
      deleteCacheFile();
      globalThis.fetch = mockFetchLatest("1.2.9");

      const { stdout } = await captureOutput(() =>
        cmdUpgrade("1.2.8", { check: true }, true),
      );

      const result = JSON.parse(stdout.trim()) as Record<string, unknown>;
      assert.ok("currentVersion" in result, "missing currentVersion");
      assert.ok("latestVersion" in result, "missing latestVersion");
      assert.ok("status" in result, "missing status");
      assert.ok("updated" in result, "missing updated");
      assert.equal(typeof result.currentVersion, "string");
      assert.equal(typeof result.latestVersion, "string");
      assert.ok(
        ["up-to-date", "updated", "update-available", "error"].includes(result.status as string),
        `unexpected status: ${result.status}`,
      );
      assert.equal(typeof result.updated, "boolean");
    });
  });
});
