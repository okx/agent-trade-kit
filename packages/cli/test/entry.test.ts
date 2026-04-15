/**
 * Regression test for issue #21:
 * CLI should produce output when invoked through a symlink (as npm global install does).
 *
 * npm global install creates a symlink: ~/.../bin/okx -> .../dist/index.js
 * If an `import.meta.url === pathToFileURL(process.argv[1]).href` guard were added,
 * main() would never be called via symlink, causing silent exit with code 0.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { symlinkSync, unlinkSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "../dist/index.js");

describe("CLI --version flag", () => {
  it("prints version with --version", () => {
    const output = execFileSync("node", [dist, "--version"], {
      timeout: 10_000,
      encoding: "utf-8",
    }).trim();
    assert.match(output, /^\d+\.\d+\.\d+/, `Expected semver, got: ${output}`);
  });

  it("prints version with -v", () => {
    const output = execFileSync("node", [dist, "-v"], {
      timeout: 10_000,
      encoding: "utf-8",
    }).trim();
    assert.match(output, /^\d+\.\d+\.\d+/, `Expected semver, got: ${output}`);
  });
});

describe("CLI entry via symlink", () => {
  it("should produce output when invoked through a symlink (regression for issue #21)", () => {
    const dist = join(__dirname, "../dist/index.js");
    const tmp = mkdtempSync(join(tmpdir(), "okx-symlink-"));
    const link = join(tmp, "okx");
    symlinkSync(dist, link);
    try {
      let output = "";
      try {
        // --help exits with code 0 and prints to stdout
        output = execFileSync("node", [link, "--help"], {
          timeout: 10_000,
          encoding: "utf-8",
        });
      } catch (e: unknown) {
        // Some commands exit non-zero; capture stdout from the error
        const err = e as { stdout?: string; stderr?: string };
        output = (err.stdout ?? "") + (err.stderr ?? "");
      }
      // If main() was never called, there would be no output at all
      assert.ok(
        output.length > 0,
        "Expected output when CLI is invoked via symlink, but got none. " +
          "This likely means main() was skipped due to an import.meta.url guard. See issue #21.",
      );
    } finally {
      unlinkSync(link);
    }
  });
});

// ---------------------------------------------------------------------------
// Management command routing — sync void handlers must not fall through (#161)
// ---------------------------------------------------------------------------

describe("Management command routing (#161)", () => {
  it("list-tools does not print 'Unknown command'", () => {
    const result = execFileSync("node", [dist, "list-tools"], {
      timeout: 10_000,
      encoding: "utf-8",
    });
    assert.ok(result.includes("modules"), "Expected module summary output");
    assert.ok(!result.includes("Unknown command"), "list-tools should not fall through to Unknown command");
  });

  it("list-tools --json outputs valid JSON without Unknown command", () => {
    const stdout = execFileSync("node", [dist, "list-tools", "--json"], {
      timeout: 10_000,
      encoding: "utf-8",
    });
    assert.ok(!stdout.includes("Unknown command"), "JSON output should not contain Unknown command");
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.version, "JSON should have version field");
    assert.ok(Array.isArray(parsed.modules), "JSON should have modules array");
  });

  it("setup without args does not print 'Unknown command'", () => {
    try {
      execFileSync("node", [dist, "setup"], { timeout: 10_000, encoding: "utf-8" });
    } catch (e: unknown) {
      const err = e as { stderr?: string; stdout?: string };
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      assert.ok(!output.includes("Unknown command"), "setup should not fall through to Unknown command");
    }
  });

  it("config show does not print 'Unknown command'", () => {
    try {
      execFileSync("node", [dist, "config", "show"], { timeout: 10_000, encoding: "utf-8" });
    } catch (e: unknown) {
      const err = e as { stderr?: string; stdout?: string };
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      assert.ok(!output.includes("Unknown command"), "config should not fall through to Unknown command");
    }
  });

  // upgrade, doh, diagnose subprocess tests removed — they make network calls
  // that slow CI. In-process coverage in management-routing.test.ts is sufficient.
});
