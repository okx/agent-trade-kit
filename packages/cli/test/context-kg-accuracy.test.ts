/**
 * context-kg accuracy drift test
 *
 * Verifies that the numbers declared in context-kg/ markdown files match the
 * actual code state. Similar in spirit to drift.test.ts (CLI ↔ ToolSpec sync)
 * but focused on documentation accuracy.
 *
 * Pattern: extract declared numbers from markdown via regex, compare to actual
 * runtime values. Fails loudly if:
 *   - A declared number doesn't match actual state  → stale documentation
 *   - A regex pattern is not found                  → markdown structure changed
 *
 * This prevents a repeat of the "context-kg numbers drifting silently" pattern
 * observed in MR !238, !246, etc. (see issue #160).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { allToolSpecs, MODULES } from "@agent-tradekit/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");

// Cache to avoid re-invoking allToolSpecs() across multiple tests.
const TOOL_SPECS = allToolSpecs();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readKgFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, "context-kg", relativePath), "utf-8");
}

/**
 * Extract a number from markdown content using a regex with one capture group.
 * Throws if the pattern is not found — this is intentional: a missing pattern
 * means the markdown structure changed and the regex needs to be updated.
 */
function extractNumber(content: string, pattern: RegExp, fileHint: string): number {
  const match = content.match(pattern);
  assert.ok(
    match !== null,
    `Pattern ${pattern} not found in context-kg/${fileHint}.\n` +
      `  -> The markdown structure may have changed - update the regex in this test file.`,
  );
  return parseInt(match[1], 10);
}

/** Count *.test.ts files in a package's test/ directory. */
function countTestFiles(packageName: string): number {
  const testDir = join(REPO_ROOT, "packages", packageName, "test");
  return readdirSync(testDir).filter((f) => f.endsWith(".test.ts")).length;
}

/** Count skill packs - directories inside skills/ that contain a SKILL.md file. */
function countSkillPacks(): number {
  const skillsDir = join(REPO_ROOT, "skills");
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(skillsDir, e.name, "SKILL.md")))
    .length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("context-kg accuracy: numbers match actual code state", () => {
  describe("business/01-overview.md", () => {
    const overview = readKgFile("business/01-overview.md");

    it("declared MCP tool count matches allToolSpecs().length", () => {
      const declared = extractNumber(overview, /\*\*~?(\d+) MCP tools\*\*/, "business/01-overview.md");
      const actual = TOOL_SPECS.length;
      assert.strictEqual(
        declared,
        actual,
        `context-kg/business/01-overview.md declares ${declared} MCP tools, but allToolSpecs() returns ${actual}.\n` +
          `  -> Update the tool count in context-kg/business/01-overview.md to ${actual}.`,
      );
    });

    it("declared module count matches MODULES.length", () => {
      const declared = extractNumber(overview, /\*\*(\d+) modules\*\*/, "business/01-overview.md");
      const actual = MODULES.length;
      assert.strictEqual(
        declared,
        actual,
        `context-kg/business/01-overview.md declares ${declared} modules, but MODULES.length is ${actual}.\n` +
          `  -> Update the module count in context-kg/business/01-overview.md to ${actual}.`,
      );
    });

    it("declared skill pack count matches actual skills/ directory", () => {
      const declared = extractNumber(overview, /\*\*(\d+) skill packs?\*\*/, "business/01-overview.md");
      const actual = countSkillPacks();
      assert.strictEqual(
        declared,
        actual,
        `context-kg/business/01-overview.md declares ${declared} skill packs, but skills/ contains ${actual}.\n` +
          `  -> Update the skill pack count in context-kg/business/01-overview.md to ${actual}.`,
      );
    });
  });

  describe("technical/01-architecture.md", () => {
    const arch = readKgFile("technical/01-architecture.md");

    // Package name → regex that finds the file count on the corresponding line in the architecture doc.
    // Pattern stops at "files" without requiring the closing ")" so it handles both
    // "(N files)" (core/cli) and "(N files: bundle and server)" (mcp) formats.
    const PKG_TEST_CHECKS = [
      { pkg: "core", pattern: /packages\/core\/test\/[^\n]*\((\d+) files/ },
      { pkg: "cli",  pattern: /packages\/cli\/test\/[^\n]*\((\d+) files/ },
      { pkg: "mcp",  pattern: /packages\/mcp\/test\/[^\n]*\((\d+) files/ },
    ] as const;

    for (const { pkg, pattern } of PKG_TEST_CHECKS) {
      it(`declared ${pkg} test file count matches packages/${pkg}/test/`, () => {
        const declared = extractNumber(arch, pattern, "technical/01-architecture.md");
        const actual = countTestFiles(pkg);
        assert.strictEqual(
          declared,
          actual,
          `context-kg/technical/01-architecture.md declares ${declared} ${pkg} test files, but packages/${pkg}/test/ has ${actual}.\n` +
            `  -> Update the count in context-kg/technical/01-architecture.md to ${actual}.`,
        );
      });
    }
  });
});
