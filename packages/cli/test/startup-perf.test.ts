/**
 * Regression test for TRDATA-3954: CLI startup must be fast even when the
 * npm registry is configured to an unreachable host.
 *
 * Tests B0 (OKX_UPDATE_CHECK=false kill switch) which guarantees fast startup
 * on any network. The underlying event-loop fix (AbortSignal.timeout with its
 * internal unref'd timer) is covered by unit tests in packages/core/test/.
 *
 * Skipped automatically when dist/index.js has not been built (pretest builds it).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "../dist/index.js");

// An unreachable registry — ensures no actual fetch can succeed even if the
// kill switch were somehow not working.
const UNREACHABLE_REGISTRY = "http://192.0.2.1/";

describe("CLI startup performance", () => {
  if (!existsSync(dist)) {
    it.skip("dist/index.js not built - run pnpm build first");
    return;
  }

  it("exits within 500 ms when OKX_UPDATE_CHECK=false (B0 kill switch)", () => {
    // Use an isolated tmpdir as HOME so the test never touches the developer's
    // real ~/.okx directory and cannot race with parallel test runs.
    const fakeHome = mkdtempSync(join(tmpdir(), "okx-test-"));
    try {
      const start = Date.now();
      const result = spawnSync("node", [dist, "--version"], {
        timeout: 2000,
        env: {
          ...process.env,
          HOME: fakeHome,
          npm_config_registry: UNREACHABLE_REGISTRY,
          OKX_UPDATE_CHECK: "false",
        },
      });
      const elapsed = Date.now() - start;

      assert.equal(
        result.status,
        0,
        `Expected exit 0, got ${result.status}. stderr: ${result.stderr?.toString() ?? ""}`,
      );
      assert.ok(
        elapsed < 500,
        `CLI took ${elapsed} ms with OKX_UPDATE_CHECK=false - expected < 500 ms`,
      );
    } finally {
      rmSync(fakeHome, { recursive: true, force: true });
    }
  });
});
