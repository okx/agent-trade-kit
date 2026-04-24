/**
 * SKILL.md description length guard.
 *
 * Codex CLI enforces a 1024-character maximum on the "description" field in
 * SKILL.md frontmatter.  When any description exceeds this limit, Codex refuses
 * to load the skill pack with:
 *
 *   <skill>/SKILL.md: invalid description: exceeds maximum length of 1024 characters
 *
 * This test parses the YAML frontmatter of every skills/STAR/SKILL.md and asserts
 * that no description exceeds 1024 chars, reporting ALL offending files in one
 * assertion message so a single run surfaces all problems.
 *
 * See: issue #176
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../..");
const SKILLS_DIR = join(REPO_ROOT, "skills");
const MAX_DESCRIPTION_LENGTH = 1024;

// Extract the value of the description key from YAML frontmatter.
// Handles both double-quoted strings and unquoted single-line values.
// Returns null if the pattern is not found.
function extractDescription(content: string): string | null {
  // Match double-quoted: description: "..."
  const mQuoted = content.match(/^description:\s+"((?:[^"\\]|\\.)*)"/m);
  if (mQuoted) return mQuoted[1];
  // Match unquoted: description: some text (up to end of line)
  const mUnquoted = content.match(/^description:\s+([^"'\n][^\n]*)/m);
  return mUnquoted ? mUnquoted[1].trimEnd() : null;
}

// Collect all skill pack directories that contain a SKILL.md.
function findSkillFiles(): Array<{ name: string; path: string }> {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isDirectory()) return false;
      return existsSync(join(SKILLS_DIR, entry.name, "SKILL.md"));
    })
    .map((entry) => ({
      name: entry.name,
      path: join(SKILLS_DIR, entry.name, "SKILL.md"),
    }));
}

describe("SKILL.md descriptions comply with Codex 1024-char limit", () => {
  it("all skills/*/SKILL.md description fields are <= 1024 chars", () => {
    const skills = findSkillFiles();
    assert.ok(skills.length > 0, "No skill packs found under skills/ - check SKILLS_DIR path");

    const offenders: string[] = [];

    for (const { name, path } of skills) {
      const content = readFileSync(path, "utf-8");
      const desc = extractDescription(content);

      if (desc === null) {
        // Missing description is a separate authoring error; flag it as 0 chars
        // so it shows up in the report but doesn't conflate with length failures.
        offenders.push(`  ${name}/SKILL.md: description field not found (check YAML frontmatter format)`);
        continue;
      }

      if (desc.length > MAX_DESCRIPTION_LENGTH) {
        offenders.push(
          `  ${name}/SKILL.md: ${desc.length} chars (limit: ${MAX_DESCRIPTION_LENGTH}, over by ${desc.length - MAX_DESCRIPTION_LENGTH})`,
        );
      }
    }

    assert.equal(
      offenders.length,
      0,
      `${offenders.length} SKILL.md description(s) exceed the ${MAX_DESCRIPTION_LENGTH}-char Codex limit:\n${offenders.join("\n")}\n\n` +
        `Trim the description by deduping synonymous trigger phrases.\n` +
        `Keep all concrete instrument-type keywords; remove only redundant enumerations.`,
    );
  });
});
