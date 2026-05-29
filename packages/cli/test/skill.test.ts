/**
 * Unit tests for skill CLI commands.
 * Tests parameter routing, output formatting, and local-only operations.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { ToolRunner } from "@agent-tradekit/core";
import { handleSkillCommand } from "../src/index.js";
import {
  cmdSkillList,
  cmdSkillRemove,
  cmdSkillSearch,
  cmdSkillCategories,
  cmdSkillCheck,
  THIRD_PARTY_INSTALL_NOTICE,
  printSkillInstallResult,
  npxEnv,
} from "../src/commands/skill.js";
import { setOutput, resetOutput } from "../src/formatter.js";
import type { CliValues } from "../src/index.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let out: string[];
let err: string[];

beforeEach(() => {
  out = [];
  err = [];
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
});

afterEach(() => resetOutput());

const fakeSearchResult = {
  endpoint: "GET /api/v5/skill/search",
  requestTime: new Date().toISOString(),
  data: [
    { name: "grid-premium", latestVersion: "1.2.0", description: "Enhanced grid trading" },
    { name: "dca-smart", latestVersion: "2.0.0", description: "Smart DCA strategy" },
  ],
  totalPage: "3",
};

const fakeCategoriesResult = {
  endpoint: "GET /api/v5/skill/categories",
  requestTime: new Date().toISOString(),
  data: [
    { categoryId: "trading-strategy", name: "Trading Strategy" },
    { categoryId: "risk-management", name: "Risk Management" },
  ],
};

const fakeEmptyResult = {
  endpoint: "GET /api/v5/skill/search",
  requestTime: new Date().toISOString(),
  data: [],
};

function makeSpy(result?: unknown): {
  spy: ToolRunner;
  captured: { tool: string; args: Record<string, unknown> };
} {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool;
    captured.args = args as Record<string, unknown>;
    if (result) return result as any;
    if (tool === "skills_search") return fakeSearchResult;
    if (tool === "skills_get_categories") return fakeCategoriesResult;
    return fakeEmptyResult;
  };
  return { spy, captured };
}

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

const fakeConfig = {
  baseUrl: "https://www.okx.com",
  hasAuth: true,
  apiKey: "test",
  secretKey: "test",
  passphrase: "test",
  demo: false,
  timeoutMs: 10000,
  site: "global" as const,
  modules: [],
  readOnly: false,
  verbose: false,
  userAgent: "test",
  sourceTag: "CLI",
  proxyUrl: undefined,
} as any;

// ---------------------------------------------------------------------------
// handleSkillCommand — parameter routing
// ---------------------------------------------------------------------------

describe("handleSkillCommand - parameter routing", () => {
  it("search: keyword from rest[0]", async () => {
    const { spy, captured } = makeSpy();
    await handleSkillCommand(spy, "search", ["grid"], vals({}), false, fakeConfig);
    assert.equal(captured.tool, "skills_search");
    assert.equal(captured.args.keyword, "grid");
  });

  it("search: keyword from --keyword flag", async () => {
    const { spy, captured } = makeSpy();
    await handleSkillCommand(spy, "search", [], vals({ keyword: "dca" }), false, fakeConfig);
    assert.equal(captured.tool, "skills_search");
    assert.equal(captured.args.keyword, "dca");
  });

  it("search: passes categories, page, limit", async () => {
    const { spy, captured } = makeSpy();
    await handleSkillCommand(
      spy, "search", [], vals({ keyword: "grid", categories: "trading-strategy", page: "2", limit: "10" }), false, fakeConfig,
    );
    assert.equal(captured.args.categories, "trading-strategy");
    assert.equal(captured.args.page, "2");
    assert.equal(captured.args.limit, "10");
  });

  it("categories: calls skills_get_categories", async () => {
    const { spy, captured } = makeSpy();
    await handleSkillCommand(spy, "categories", [], vals({}), false, fakeConfig);
    assert.equal(captured.tool, "skills_get_categories");
  });

  it("add: requires name argument", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "add", [], vals({}), false, fakeConfig);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });

  it("download: requires name argument", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "download", [], vals({}), false, fakeConfig);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });

  it("download: --format flag is read from v.format, not positional args", async () => {
    // Verify that format="skill" in vals is accepted by the routing layer.
    // handleSkillDownload reads v.format (named flag), not rest[N].
    const { spy } = makeSpy();
    try {
      await handleSkillCommand(spy, "download", ["test-skill"], vals({ format: "skill" }), false, fakeConfig);
    } catch {
      // Download fails because spy doesn't provide a real OkxRestClient — expected.
    }
    // Key: routing accepted the input (no missing-name exitCode)
    assert.notEqual(process.exitCode, 1);
  });

  it("download: format defaults to zip when --format is omitted", async () => {
    const { spy } = makeSpy();
    try {
      await handleSkillCommand(spy, "download", ["test-skill"], vals({}), false, fakeConfig);
    } catch {
      // Download fails with mock — expected
    }
    assert.notEqual(process.exitCode, 1);
  });

  it("remove: requires name argument", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "remove", [], vals({}), false, fakeConfig);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });

  it("check: requires name argument", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "check", [], vals({}), false, fakeConfig);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });

  it("add: --force flag is read from v.force, not positional args", async () => {
    // Routing reads v.force (named flag). Without a real HTTP client cmdSkillAdd throws,
    // but the routing layer should not set exitCode=1 (no missing-name error).
    const { spy } = makeSpy();
    try {
      await handleSkillCommand(spy, "add", ["test-skill"], vals({ force: true }), false, fakeConfig);
    } catch {
      // Expected — no real HTTP client available
    }
    assert.notEqual(process.exitCode, 1);
  });

  it("verify: requires name argument", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "verify", [], vals({}), false, fakeConfig);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });

  it("unknown subcommand: sets exitCode", async () => {
    const { spy } = makeSpy();
    handleSkillCommand(spy, "nonexistent", [], vals({}), false, fakeConfig);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });
});

// ---------------------------------------------------------------------------
// Search output
// ---------------------------------------------------------------------------

describe("cmdSkillSearch - output formatting", () => {
  it("displays tabular results with pagination info", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "search", ["grid"], vals({}), false, fakeConfig);
    const output = out.join("");
    assert.ok(output.includes("grid-premium"));
    assert.ok(output.includes("1.2.0"));
    assert.ok(output.includes("2 skills found"));
    assert.ok(output.includes("(page 1/3)"));
  });

  it("displays page number from --page flag", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "search", ["grid"], vals({ page: "2" }), false, fakeConfig);
    const output = out.join("");
    assert.ok(output.includes("(page 2/3)"));
  });

  it("displays 'No skills found' for empty results", async () => {
    const { spy } = makeSpy(fakeEmptyResult);
    await handleSkillCommand(spy, "search", ["nonexistent"], vals({}), false, fakeConfig);
    const output = out.join("");
    assert.ok(output.includes("No skills found"));
  });

  it("outputs JSON when --json flag is set (includes totalPage)", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "search", ["grid"], vals({}), true, fakeConfig);
    const output = out.join("");
    const parsed = JSON.parse(output);
    assert.ok(parsed.data);
    assert.equal(parsed.totalPage, "3");
  });
});

// ---------------------------------------------------------------------------
// Categories output
// ---------------------------------------------------------------------------

describe("cmdSkillCategories - output formatting", () => {
  it("displays category list", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "categories", [], vals({}), false, fakeConfig);
    const output = out.join("");
    assert.ok(output.includes("trading-strategy"));
    assert.ok(output.includes("Trading Strategy"));
  });
});

// ---------------------------------------------------------------------------
// List (local-only, no API calls)
// ---------------------------------------------------------------------------

describe("cmdSkillList", () => {
  it("displays 'No skills installed' when registry is empty", () => {
    // cmdSkillList reads from ~/.okx/skills/registry.json
    // With default HOME, if no skills installed, should show empty message
    cmdSkillList(false);
    const output = out.join("");
    assert.ok(output.includes("No skills installed") || output.includes("skills installed"));
  });

  it("outputs JSON when flag is set", () => {
    cmdSkillList(true);
    const output = out.join("");
    // Should be valid JSON
    assert.doesNotThrow(() => JSON.parse(output));
  });
});

// ---------------------------------------------------------------------------
// Remove (local-only)
// ---------------------------------------------------------------------------

describe("cmdSkillRemove", () => {
  it("reports error when skill is not installed", () => {
    cmdSkillRemove(`nonexistent-${randomUUID()}`, false);
    assert.equal(process.exitCode, 1);
    const output = err.join("");
    assert.ok(output.includes("not installed"));
    process.exitCode = undefined;
  });
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

describe("handleSkillCommand check", () => {
  it("reports error when skill is not locally installed", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "check", [`nonexistent-${randomUUID()}`], vals({}), false, fakeConfig);
    assert.equal(process.exitCode, 1);
    const output = err.join("");
    assert.ok(output.includes("not installed"));
    process.exitCode = undefined;
  });
});

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

describe("handleSkillCommand verify", () => {
  it("name from rest[0] — reports 'not installed' for unknown skill", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "verify", [`nonexistent-${randomUUID()}`], vals({}), false, fakeConfig);
    assert.equal(process.exitCode, 1);
    const output = err.join("");
    assert.ok(output.includes("not installed"));
    process.exitCode = undefined;
  });
});

// ---------------------------------------------------------------------------
// cmdSkillCheck — with installed skill (uses real registry)
// ---------------------------------------------------------------------------

import {
  upsertSkillRecord,
  removeSkillRecord,
  getSkillRecord,
} from "@agent-tradekit/core";
import {
  cmdSkillAdd,
  cmdSkillVerify,
  type SkillAddDeps,
} from "../src/commands/skill.js";

describe("cmdSkillCheck - installed skill", () => {
  const testSkill = `test-check-${randomUUID()}`;

  beforeEach(() => {
    upsertSkillRecord({ name: testSkill, version: "1.0.0", title: "Test", description: "test" });
  });
  afterEach(() => {
    removeSkillRecord(testSkill);
  });

  it("shows 'up to date' when versions match", async () => {
    const { spy } = makeSpy({
      endpoint: "GET /api/v5/skill/search",
      requestTime: new Date().toISOString(),
      data: [{ name: testSkill, latestVersion: "1.0.0" }],
    });
    await cmdSkillCheck(spy, testSkill, false);
    const output = out.join("");
    assert.ok(output.includes("up to date"));
    assert.ok(output.includes("v1.0.0"));
  });

  it("shows 'update available' when remote version is newer", async () => {
    const { spy } = makeSpy({
      endpoint: "GET /api/v5/skill/search",
      requestTime: new Date().toISOString(),
      data: [{ name: testSkill, latestVersion: "2.0.0" }],
    });
    await cmdSkillCheck(spy, testSkill, false);
    const output = out.join("");
    assert.ok(output.includes("update available"));
    assert.ok(output.includes("v1.0.0"));
    assert.ok(output.includes("v2.0.0"));
  });

  it("outputs JSON when flag is set", async () => {
    const { spy } = makeSpy({
      endpoint: "GET /api/v5/skill/search",
      requestTime: new Date().toISOString(),
      data: [{ name: testSkill, latestVersion: "1.0.0" }],
    });
    await cmdSkillCheck(spy, testSkill, true);
    const parsed = JSON.parse(out.join(""));
    assert.equal(parsed.name, testSkill);
    assert.equal(parsed.installedVersion, "1.0.0");
    assert.equal(parsed.latestVersion, "1.0.0");
    assert.equal(parsed.upToDate, true);
  });

  it("reports error when skill not found in marketplace", async () => {
    const { spy } = makeSpy({
      endpoint: "GET /api/v5/skill/search",
      requestTime: new Date().toISOString(),
      data: [{ name: "other-skill", latestVersion: "1.0.0" }],
    });
    await cmdSkillCheck(spy, testSkill, false);
    assert.equal(process.exitCode, 1);
    const output = err.join("");
    assert.ok(output.includes("not found in marketplace"));
    process.exitCode = undefined;
  });
});

// ---------------------------------------------------------------------------
// cmdSkillCategories — additional branches
// ---------------------------------------------------------------------------

describe("cmdSkillCategories - additional", () => {
  it("displays 'No categories found' for empty results", async () => {
    const { spy } = makeSpy({
      endpoint: "GET /api/v5/skill/categories",
      requestTime: new Date().toISOString(),
      data: [],
    });
    await cmdSkillCategories(spy, false);
    const output = out.join("");
    assert.ok(output.includes("No categories found"));
  });

  it("outputs JSON when flag is set", async () => {
    const { spy } = makeSpy();
    await cmdSkillCategories(spy, true);
    const parsed = JSON.parse(out.join(""));
    assert.ok(parsed.data);
  });
});

// ---------------------------------------------------------------------------
// cmdSkillList — with installed skills
// ---------------------------------------------------------------------------

describe("cmdSkillList - with installed skill", () => {
  const testSkill = `test-list-${randomUUID()}`;

  beforeEach(() => {
    upsertSkillRecord({ name: testSkill, version: "1.0.0", title: "Test", description: "test" });
  });
  afterEach(() => {
    removeSkillRecord(testSkill);
  });

  it("displays installed skill in table", () => {
    cmdSkillList(false);
    const output = out.join("");
    assert.ok(output.includes(testSkill));
    assert.ok(output.includes("1.0.0"));
    assert.ok(output.includes("skills installed"));
  });
});

// ---------------------------------------------------------------------------
// cmdSkillRemove — JSON output
// ---------------------------------------------------------------------------

describe("cmdSkillRemove - additional", () => {
  it("reports error with JSON flag when skill not installed", () => {
    cmdSkillRemove(`nonexistent-${randomUUID()}`, true);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined;
  });

  it("removes installed skill and outputs text", () => {
    const name = `test-rm-${randomUUID()}`;
    upsertSkillRecord({ name, version: "1.0.0", title: "T", description: "d" });
    const noopExec = (() => Buffer.from("")) as unknown as Parameters<typeof cmdSkillRemove>[2];
    cmdSkillRemove(name, false, noopExec);
    const output = out.join("");
    assert.ok(output.includes(`[ok] Skill "${name}" removed`));
  });

  it("removes installed skill and outputs JSON", () => {
    const name = `test-rm-json-${randomUUID()}`;
    upsertSkillRecord({ name, version: "1.0.0", title: "T", description: "d" });
    const noopExec = (() => Buffer.from("")) as unknown as Parameters<typeof cmdSkillRemove>[2];
    cmdSkillRemove(name, true, noopExec);
    const parsed = JSON.parse(out.join(""));
    assert.equal(parsed.name, name);
    assert.equal(parsed.status, "removed");
  });

  it("falls back to manual cleanup when injected exec throws", () => {
    const name = `test-rm-fallback-${randomUUID()}`;
    upsertSkillRecord({ name, version: "1.0.0", title: "T", description: "d" });
    const throwingExec = (() => {
      throw new Error("simulated npx failure");
    }) as unknown as Parameters<typeof cmdSkillRemove>[2];
    cmdSkillRemove(name, false, throwingExec);
    // remove still succeeds at the registry level + best-effort manual cleanup
    const output = out.join("");
    assert.ok(output.includes(`[ok] Skill "${name}" removed`));
  });
});

// ---------------------------------------------------------------------------
// handleSkillCommand — list route
// ---------------------------------------------------------------------------

describe("handleSkillCommand - list route", () => {
  it("list: routes to cmdSkillList", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "list", [], vals({}), false, fakeConfig);
    const output = out.join("");
    // Should show either installed skills or "No skills installed"
    assert.ok(output.includes("skills installed") || output.includes("No skills installed"));
  });

  it("list: outputs JSON", async () => {
    const { spy } = makeSpy();
    await handleSkillCommand(spy, "list", [], vals({}), true, fakeConfig);
    const parsed = JSON.parse(out.join(""));
    assert.ok("version" in parsed);
    assert.ok("skills" in parsed);
  });
});

// ---------------------------------------------------------------------------
// printSkillInstallResult — third-party notice output
// ---------------------------------------------------------------------------

describe("printSkillInstallResult", () => {
  it("outputs success message with third-party notice", () => {
    printSkillInstallResult({ name: "my-skill", version: "1.0.0" }, false);
    const output = out.join("");
    assert.ok(output.includes('✓ Skill "my-skill" v1.0.0 installed'));
    assert.ok(output.includes(THIRD_PARTY_INSTALL_NOTICE));
  });

  it("outputs JSON without third-party notice when --json is set", () => {
    printSkillInstallResult({ name: "my-skill", version: "1.0.0" }, true);
    const parsed = JSON.parse(out.join(""));
    assert.equal(parsed.name, "my-skill");
    assert.equal(parsed.version, "1.0.0");
    assert.equal(parsed.status, "installed");
  });
});

// ---------------------------------------------------------------------------
// npxEnv() — subprocess env builder for ANSI stripping
// ---------------------------------------------------------------------------

describe("npxEnv", () => {
  it("sets NO_COLOR=1 to suppress ANSI escape codes from spawned npx", () => {
    const env = npxEnv();
    assert.equal(env.NO_COLOR, "1");
  });

  it("sets FORCE_COLOR=0 so libraries respecting that flag also strip color", () => {
    const env = npxEnv();
    assert.equal(env.FORCE_COLOR, "0");
  });

  it("inherits all existing process.env entries", () => {
    process.env.OKX_NPX_ENV_TEST_INHERIT = "leaked-value";
    try {
      const env = npxEnv();
      assert.equal(env.OKX_NPX_ENV_TEST_INHERIT, "leaked-value");
    } finally {
      delete process.env.OKX_NPX_ENV_TEST_INHERIT;
    }
  });

  it("returns a fresh object (does not mutate process.env)", () => {
    const env = npxEnv();
    env.OKX_NPX_ENV_MUTATION_TEST = "should-not-leak";
    assert.equal(process.env.OKX_NPX_ENV_MUTATION_TEST, undefined);
  });
});

// ---------------------------------------------------------------------------
// cmdSkillAdd --force bypass: registry + stderr outcomes
//
// Uses injectable _deps to bypass the network download/extract steps and reach
// the verification bypass code path directly.
// ---------------------------------------------------------------------------

describe("cmdSkillAdd --force bypass outcomes", () => {
  let contentDir: string;
  let skillName: string;

  beforeEach(() => {
    skillName = `test-bypass-${randomUUID()}`;
    contentDir = join(tmpdir(), `bypass-content-${randomUUID()}`);
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, "SKILL.md"), "# Test");
    // Invalid signing block — signature won't verify, key fetch will fail (no network),
    // triggering verifyResult.status === "failed" without any real server interaction.
    writeFileSync(join(contentDir, "_meta.json"), JSON.stringify({
      name: skillName,
      version: "1.0.0",
      title: "Test",
      description: "test",
      signing: {
        files: { "SKILL.md": "sha256:invalid" },
        public_key_id: "test-key-id",
        signature: "AAAA",
      },
    }));
  });

  afterEach(() => {
    rmSync(contentDir, { recursive: true, force: true });
    removeSkillRecord(skillName);
    process.exitCode = undefined;
  });

  const noopExec = (() => Buffer.from("")) as unknown as Parameters<typeof cmdSkillAdd>[4];

  function makeDeps(): SkillAddDeps {
    return {
      download: async (_client, _name, dir) => join(dir, "fake.zip"),
      extract: async () => contentDir,
    };
  }

  it("persists 'bypassed' verification status to registry when --force is used", async () => {
    await cmdSkillAdd(skillName, fakeConfig, false, true, noopExec, makeDeps());
    const record = getSkillRecord(skillName);
    assert.equal(record?.verification, "bypassed");
  });

  it("warning is written to stderr (not stdout) when --force bypasses failed verification", async () => {
    const stderrMessages: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (c: string) => boolean }).write = (chunk: string) => {
      stderrMessages.push(chunk);
      return true;
    };
    try {
      await cmdSkillAdd(skillName, fakeConfig, false, true, noopExec, makeDeps());
    } finally {
      (process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
    }
    assert.ok(stderrMessages.some(m => m.includes("WARNING:")), "warning must appear on stderr");
    assert.ok(stderrMessages.some(m => m.includes("--force")), "warning must mention --force");
    assert.ok(!out.some(m => m.includes("WARNING:")), "warning must NOT appear on stdout");
  });

  it("--json mode still emits bypass warning to stderr (not silenced by json flag)", async () => {
    const stderrMessages: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (c: string) => boolean }).write = (chunk: string) => {
      stderrMessages.push(chunk);
      return true;
    };
    try {
      await cmdSkillAdd(skillName, fakeConfig, true, true, noopExec, makeDeps());
    } finally {
      (process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
    }
    assert.ok(stderrMessages.some(m => m.includes("WARNING:")), "warning must appear on stderr even in --json mode");
  });
});

// ---------------------------------------------------------------------------
// cmdSkillVerify — exitCode = 1 on verification failure (AC #9)
//
// Creates a real skill content dir at ~/.agents/skills/<name>/ (the path that
// cmdSkillVerify resolves internally via getSkillContentDir) with a signing
// block that cannot pass — key fetch returns null (network error swallowed),
// server fallback also returns null, so verifySkillSignature yields "failed".
// ---------------------------------------------------------------------------

describe("cmdSkillVerify — exitCode on verification failure (AC #9)", () => {
  let skillName: string;
  let contentDir: string;

  beforeEach(() => {
    skillName = `test-verify-fail-${randomUUID()}`;
    contentDir = join(homedir(), ".agents", "skills", skillName);
    mkdirSync(contentDir, { recursive: true });
    writeFileSync(join(contentDir, "SKILL.md"), "# Test");
    writeFileSync(join(contentDir, "_meta.json"), JSON.stringify({
      name: skillName,
      version: "1.0.0",
      title: "Test",
      description: "test",
      signing: {
        files: { "SKILL.md": "sha256:invalid-hash" },
        public_key_id: "nonexistent-key-id",
        signature: "AAAA",
      },
    }));
    upsertSkillRecord({ name: skillName, version: "1.0.0", title: "Test", description: "test" });
  });

  afterEach(() => {
    rmSync(contentDir, { recursive: true, force: true });
    removeSkillRecord(skillName);
    process.exitCode = undefined;
  });

  it("sets exitCode = 1 when signature verification fails", async () => {
    await cmdSkillVerify(skillName, fakeConfig, false);
    assert.equal(process.exitCode, 1);
    assert.ok(err.join("").match(/verification failed/i));
  });

  it("sets exitCode = 1 in --json mode (verification failure always exits 1)", async () => {
    await cmdSkillVerify(skillName, fakeConfig, true);
    assert.equal(process.exitCode, 1);
  });
});
