/**
 * Unit tests for skills module.
 * Tests tool specs, registry operations, parser, and extractor.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import yazl from "yazl";
import { registerSkillsTools } from "../src/tools/skills.js";
import { readMetaJson, validateSkillMdExists } from "../src/skills/parser.js";
import { extractSkillZip } from "../src/skills/extractor.js";
import { downloadSkillZip } from "../src/skills/downloader.js";
import { allToolSpecs } from "../src/tools/index.js";
import { safeWriteFile, validateZipEntryPath } from "../src/utils/safe-file.js";
import type { ToolContext } from "../src/tools/types.js";

// ---------------------------------------------------------------------------
// Zip creation helper (using yazl)
// ---------------------------------------------------------------------------

/** Create a zip file from a map of { fileName: content }. Returns a promise. */
function createTestZip(zipPath: string, files: Record<string, Buffer>): Promise<void> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const [name, data] of Object.entries(files)) {
      zip.addBuffer(data, name);
    }
    zip.end();
    const out = createWriteStream(zipPath);
    zip.outputStream.pipe(out);
    out.on("close", resolve);
    out.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface CapturedCall {
  method: "GET" | "POST";
  endpoint: string;
  params: Record<string, unknown>;
}

function makeMockClient() {
  let lastCall: CapturedCall | null = null;
  const fakeResponse = (endpoint: string) => ({
    endpoint,
    requestTime: "2026-03-28T00:00:00.000Z",
    data: [],
  });

  const client = {
    publicGet: async (endpoint: string, params: Record<string, unknown>) => {
      lastCall = { method: "GET", endpoint, params };
      return fakeResponse(endpoint);
    },
    privateGet: async (endpoint: string, params: Record<string, unknown>) => {
      lastCall = { method: "GET", endpoint, params };
      return fakeResponse(endpoint);
    },
    privatePost: async (endpoint: string, params: Record<string, unknown>) => {
      lastCall = { method: "POST", endpoint, params };
      return fakeResponse(endpoint);
    },
    privatePostBinary: async (endpoint: string, body: Record<string, unknown>) => {
      lastCall = { method: "POST", endpoint, params: body };
      return { data: Buffer.from("fake-zip-content"), contentType: "application/octet-stream" };
    },
  };

  return { client, getLastCall: () => lastCall };
}

function makeContext(client: unknown): ToolContext {
  return {
    client: client as ToolContext["client"],
    config: {
      baseUrl: "https://www.okx.com",
      hasAuth: true,
      apiKey: "test-key",
      secretKey: "test-secret",
      passphrase: "test-pass",
      demo: false,
      timeoutMs: 10000,
      site: "global",
    } as ToolContext["config"],
  };
}

// ---------------------------------------------------------------------------
// Tool spec registration
// ---------------------------------------------------------------------------

describe("skills module registration", () => {
  const tools = registerSkillsTools();

  it("registers exactly 3 tools", () => {
    assert.equal(tools.length, 3);
  });

  it("all tools belong to 'skills' module", () => {
    for (const tool of tools) {
      assert.equal(tool.module, "skills");
    }
  });

  it("tool names follow naming convention", () => {
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("skills_get_categories"));
    assert.ok(names.includes("skills_search"));
    assert.ok(names.includes("skills_download"));
  });

  it("skills_get_categories and skills_search are read-only", () => {
    const categories = tools.find((t) => t.name === "skills_get_categories")!;
    const search = tools.find((t) => t.name === "skills_search")!;
    assert.equal(categories.isWrite, false);
    assert.equal(search.isWrite, false);
  });

  it("skills_download is a write operation", () => {
    const download = tools.find((t) => t.name === "skills_download")!;
    assert.equal(download.isWrite, true);
  });

  it("skills tools are included in allToolSpecs()", () => {
    const all = allToolSpecs();
    const skillTools = all.filter((t) => t.module === "skills");
    assert.equal(skillTools.length, 3);
  });
});

// ---------------------------------------------------------------------------
// skills_get_categories handler
// ---------------------------------------------------------------------------

describe("skills_get_categories", () => {
  const tools = registerSkillsTools();
  const tool = tools.find((t) => t.name === "skills_get_categories")!;

  it("calls GET /api/v5/skill/categories", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    const call = getLastCall()!;
    assert.equal(call.method, "GET");
    assert.equal(call.endpoint, "/api/v5/skill/categories");
  });
});

// ---------------------------------------------------------------------------
// skills_search handler
// ---------------------------------------------------------------------------

describe("skills_search", () => {
  const tools = registerSkillsTools();
  const tool = tools.find((t) => t.name === "skills_search")!;

  it("calls GET /api/v5/skill/search with keyword", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({ keyword: "grid" }, makeContext(client));
    const call = getLastCall()!;
    assert.equal(call.method, "GET");
    assert.equal(call.endpoint, "/api/v5/skill/search");
    assert.equal(call.params.keyword, "grid");
  });

  it("passes all query params", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler(
      { keyword: "dca", categories: "trading-strategy", page: "2", limit: "10" },
      makeContext(client),
    );
    const call = getLastCall()!;
    assert.equal(call.params.keyword, "dca");
    assert.equal(call.params.categories, "trading-strategy");
    assert.equal(call.params.page, "2");
    assert.equal(call.params.limit, "10");
  });

  it("omits undefined params", async () => {
    const { client, getLastCall } = makeMockClient();
    await tool.handler({}, makeContext(client));
    const call = getLastCall()!;
    assert.equal(Object.keys(call.params).length, 0);
  });

  it("propagates totalPage from raw response", async () => {
    const mockClient = {
      privateGet: async () => ({
        endpoint: "GET /api/v5/skill/search",
        requestTime: "2026-03-28T00:00:00.000Z",
        data: [{ name: "test", latestVersion: "1.0.0" }],
        raw: { code: "0", data: [], totalPage: "5" },
      }),
    };
    const result = await tool.handler({ keyword: "test" }, makeContext(mockClient)) as Record<string, unknown>;
    assert.equal(result.totalPage, "5");
  });
});

// ---------------------------------------------------------------------------
// Parser: readMetaJson
// ---------------------------------------------------------------------------

describe("readMetaJson", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("parses valid _meta.json", () => {
    writeFileSync(
      join(testDir, "_meta.json"),
      JSON.stringify({ name: "grid-premium", version: "1.2.0", title: "Grid Premium", description: "A grid strategy" }),
    );
    const meta = readMetaJson(testDir);
    assert.equal(meta.name, "grid-premium");
    assert.equal(meta.version, "1.2.0");
    assert.equal(meta.title, "Grid Premium");
    assert.equal(meta.description, "A grid strategy");
  });

  it("throws when _meta.json is missing", () => {
    assert.throws(() => readMetaJson(testDir), /not found/);
  });

  it("throws when _meta.json has invalid JSON", () => {
    writeFileSync(join(testDir, "_meta.json"), "not json{{{");
    assert.throws(() => readMetaJson(testDir), /invalid JSON/);
  });

  it("throws when name is missing", () => {
    writeFileSync(join(testDir, "_meta.json"), JSON.stringify({ version: "1.0.0" }));
    assert.throws(() => readMetaJson(testDir), /name/);
  });

  it("throws when version is missing", () => {
    writeFileSync(join(testDir, "_meta.json"), JSON.stringify({ name: "test" }));
    assert.throws(() => readMetaJson(testDir), /version/);
  });

  it("defaults title and description to empty string", () => {
    writeFileSync(join(testDir, "_meta.json"), JSON.stringify({ name: "test", version: "1.0.0" }));
    const meta = readMetaJson(testDir);
    assert.equal(meta.title, "");
    assert.equal(meta.description, "");
  });
});

// ---------------------------------------------------------------------------
// Parser: validateSkillMdExists
// ---------------------------------------------------------------------------

describe("validateSkillMdExists", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("succeeds when SKILL.md exists", () => {
    writeFileSync(join(testDir, "SKILL.md"), "# Test Skill");
    assert.doesNotThrow(() => validateSkillMdExists(testDir));
  });

  it("throws when SKILL.md is missing", () => {
    assert.throws(() => validateSkillMdExists(testDir), /SKILL\.md not found/);
  });
});

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

describe("extractSkillZip", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("extracts zip contents to target directory", async () => {
    const zipPath = join(testDir, "test.zip");
    await createTestZip(zipPath, {
      "SKILL.md": Buffer.from("# Test Skill\n"),
      "_meta.json": Buffer.from(JSON.stringify({ name: "test", version: "1.0.0", title: "Test", description: "desc" })),
    });

    const outDir = join(testDir, "extracted");
    await extractSkillZip(zipPath, outDir);

    assert.ok(existsSync(join(outDir, "SKILL.md")));
    assert.ok(existsSync(join(outDir, "_meta.json")));

    const meta = JSON.parse(readFileSync(join(outDir, "_meta.json"), "utf-8"));
    assert.equal(meta.name, "test");
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("registry operations", () => {
  let registryPath: string;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-registry-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    registryPath = join(testDir, "registry.json");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("registry module is importable", async () => {
    const mod = await import("../src/skills/registry.js");
    assert.ok(typeof mod.readRegistry === "function");
    assert.ok(typeof mod.writeRegistry === "function");
    assert.ok(typeof mod.upsertSkillRecord === "function");
    assert.ok(typeof mod.removeSkillRecord === "function");
  });

  it("readRegistry returns empty registry when file does not exist", async () => {
    const { readRegistry } = await import("../src/skills/registry.js");
    const reg = readRegistry(registryPath);
    assert.deepEqual(reg, { version: 1, skills: {} });
  });

  it("upsert + read round-trip via registryPath", async () => {
    const { upsertSkillRecord, readRegistry } = await import("../src/skills/registry.js");
    upsertSkillRecord({ name: "test-skill", version: "1.0.0", title: "T", description: "d" }, registryPath);
    const reg = readRegistry(registryPath);
    assert.equal(reg.skills["test-skill"].version, "1.0.0");
    assert.equal(reg.skills["test-skill"].source, "marketplace");
  });

  it("removeSkillRecord removes the entry", async () => {
    const { upsertSkillRecord, removeSkillRecord, readRegistry } = await import("../src/skills/registry.js");
    upsertSkillRecord({ name: "rm-test", version: "1.0.0", title: "T", description: "d" }, registryPath);
    const removed = removeSkillRecord("rm-test", registryPath);
    assert.equal(removed, true);
    const reg = readRegistry(registryPath);
    assert.equal(reg.skills["rm-test"], undefined);
  });

  it("removeSkillRecord returns false for non-existent skill", async () => {
    const { removeSkillRecord } = await import("../src/skills/registry.js");
    const removed = removeSkillRecord("nonexistent", registryPath);
    assert.equal(removed, false);
  });

  it("getSkillRecord returns the record", async () => {
    const { upsertSkillRecord, getSkillRecord } = await import("../src/skills/registry.js");
    upsertSkillRecord({ name: "get-test", version: "2.0.0", title: "T", description: "d" }, registryPath);
    const record = getSkillRecord("get-test", registryPath);
    assert.equal(record?.version, "2.0.0");
  });

  it("upsert preserves installedAt on update", async () => {
    const { upsertSkillRecord, readRegistry } = await import("../src/skills/registry.js");
    upsertSkillRecord({ name: "up-test", version: "1.0.0", title: "T", description: "d" }, registryPath);
    const first = readRegistry(registryPath).skills["up-test"].installedAt;
    // Small delay to ensure updatedAt differs
    upsertSkillRecord({ name: "up-test", version: "2.0.0", title: "T2", description: "d2" }, registryPath);
    const reg = readRegistry(registryPath);
    assert.equal(reg.skills["up-test"].installedAt, first);
    assert.equal(reg.skills["up-test"].version, "2.0.0");
  });
});

// ---------------------------------------------------------------------------
// safeWriteFile — security
// ---------------------------------------------------------------------------

describe("safeWriteFile", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `safe-write-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("writes file to target directory", () => {
    const path = safeWriteFile(testDir, "test.zip", Buffer.from("data"));
    assert.ok(existsSync(path));
    assert.equal(readFileSync(path, "utf-8"), "data");
  });

  it("strips path components from fileName", () => {
    const path = safeWriteFile(testDir, "../../etc/passwd", Buffer.from("nope"));
    // Should write to testDir/passwd, not ../../etc/passwd
    assert.ok(path.startsWith(resolve(testDir)));
    assert.ok(path.endsWith("passwd"));
  });

  it("rejects empty fileName", () => {
    assert.throws(() => safeWriteFile(testDir, "", Buffer.from("data")), /Invalid file name/);
  });

  it("rejects '.' as fileName", () => {
    assert.throws(() => safeWriteFile(testDir, ".", Buffer.from("data")), /Invalid file name/);
  });

  it("rejects '..' as fileName", () => {
    assert.throws(() => safeWriteFile(testDir, "..", Buffer.from("data")), /Invalid file name/);
  });
});

// ---------------------------------------------------------------------------
// validateZipEntryPath — security
// ---------------------------------------------------------------------------

describe("validateZipEntryPath", () => {
  it("accepts normal path", () => {
    const result = validateZipEntryPath("/tmp/extract", "SKILL.md");
    assert.equal(result, resolve("/tmp/extract", "SKILL.md"));
  });

  it("accepts nested path", () => {
    const result = validateZipEntryPath("/tmp/extract", "reference/data.md");
    assert.equal(result, resolve("/tmp/extract", "reference/data.md"));
  });

  it("rejects path traversal with ../", () => {
    assert.throws(
      () => validateZipEntryPath("/tmp/extract", "../../etc/passwd"),
      /path traversal/i,
    );
  });

  it("rejects absolute path", () => {
    assert.throws(
      () => validateZipEntryPath("/tmp/extract", "/etc/passwd"),
      /path traversal/i,
    );
  });
});

// ---------------------------------------------------------------------------
// extractSkillZip — security
// ---------------------------------------------------------------------------

describe("extractSkillZip — security", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-extract-sec-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("rejects zip with too many files", async () => {
    const zipPath = join(testDir, "many.zip");
    const files: Record<string, Buffer> = {};
    for (let i = 0; i < 5; i++) {
      files[`file${i}.txt`] = Buffer.from("x");
    }
    await createTestZip(zipPath, files);

    await assert.rejects(
      () => extractSkillZip(zipPath, join(testDir, "out"), { maxFiles: 3 }),
      /exceeding limit/,
    );
  });

  it("rejects zip bomb (oversized extraction)", async () => {
    const zipPath = join(testDir, "bomb.zip");
    await createTestZip(zipPath, {
      "big.txt": Buffer.alloc(1024, 0x78), // 1 KB file, but set maxTotalBytes to 100 bytes
    });

    await assert.rejects(
      () => extractSkillZip(zipPath, join(testDir, "out"), { maxTotalBytes: 100 }),
      /exceeds limit/,
    );
  });

  // Note: yazl sanitizes "../" in entry names during addBuffer(),
  // so path traversal via zip entries is tested at the validateZipEntryPath level instead.
  // The extractor calls validateZipEntryPath for every entry before writing.

  it("rejects zip entry with high compression ratio", async () => {
    const zipPath = join(testDir, "ratio.zip");
    // Create a highly compressible file (all zeros)
    const bigData = Buffer.alloc(10_000, 0);
    await createTestZip(zipPath, { "zeros.bin": bigData });

    await assert.rejects(
      () => extractSkillZip(zipPath, join(testDir, "out"), { maxCompressionRatio: 1 }),
      /compression ratio/,
    );
  });

  it("rejects zip with symlink entry", async () => {
    // yazl caps mode at 0xFFFF so cannot set symlink mode directly.
    // Instead, create a valid zip then patch the external file attributes
    // in the central directory to set the symlink flag (0o120000 << 16).
    const zipPath = join(testDir, "symlink.zip");
    await createTestZip(zipPath, {
      "link.txt": Buffer.from("target"),
    });

    // Patch: find central directory entry and set external attributes to symlink mode
    const buf = readFileSync(zipPath);
    // Central directory file header signature: 0x02014b50
    const centralSig = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    const cdOffset = buf.indexOf(centralSig);
    assert.ok(cdOffset >= 0, "central directory not found in test zip");
    // External file attributes are at offset 38 from the central directory header start
    const symlinkAttrs = (0o120777 << 16) >>> 0;
    buf.writeUInt32LE(symlinkAttrs, cdOffset + 38);
    writeFileSync(zipPath, buf);

    await assert.rejects(
      () => extractSkillZip(zipPath, join(testDir, "out")),
      /symlink/i,
    );
  });
});

// ---------------------------------------------------------------------------
// downloadSkillZip
// ---------------------------------------------------------------------------

describe("downloadSkillZip", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-dl-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("downloads and writes zip to target directory", async () => {
    const { client } = makeMockClient();
    const filePath = await downloadSkillZip(client as any, "test-skill", testDir);
    assert.ok(filePath.endsWith("test-skill.zip"));
    assert.ok(existsSync(filePath));
    assert.equal(readFileSync(filePath, "utf-8"), "fake-zip-content");
  });

  it("calls privatePostBinary with correct endpoint and name", async () => {
    const { client, getLastCall } = makeMockClient();
    await downloadSkillZip(client as any, "my-skill", testDir);
    const call = getLastCall()!;
    assert.equal(call.method, "POST");
    assert.equal(call.endpoint, "/api/v5/skill/download");
    assert.equal(call.params.name, "my-skill");
  });
});

// ---------------------------------------------------------------------------
// skills_download handler
// ---------------------------------------------------------------------------

describe("skills_download handler", () => {
  const tools = registerSkillsTools();
  const tool = tools.find((t) => t.name === "skills_download")!;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-handler-dl-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns filePath and name on success", async () => {
    const { client } = makeMockClient();
    const result = await tool.handler(
      { name: "test-dl", targetDir: testDir },
      makeContext(client),
    ) as { data: { name: string; filePath: string } };
    assert.equal(result.data.name, "test-dl");
    assert.ok(result.data.filePath.endsWith("test-dl.zip"));
    assert.ok(existsSync(result.data.filePath));
  });
});
