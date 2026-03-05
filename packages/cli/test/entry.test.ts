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
