import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runSetup, printSetupUsage, SUPPORTED_CLIENTS } from "../src/setup.js";

// ---------------------------------------------------------------------------
// Helper: capture stdout without actually writing to the terminal
// ---------------------------------------------------------------------------
function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

// ---------------------------------------------------------------------------
// SUPPORTED_CLIENTS
// ---------------------------------------------------------------------------
describe("SUPPORTED_CLIENTS", () => {
  it("contains all expected client IDs", () => {
    const expected = ["claude-desktop", "cursor", "windsurf", "vscode", "claude-code"];
    for (const c of expected) {
      assert.ok(SUPPORTED_CLIENTS.includes(c as never), `Missing client: ${c}`);
    }
  });

  it("is a non-empty array", () => {
    assert.ok(Array.isArray(SUPPORTED_CLIENTS));
    assert.ok(SUPPORTED_CLIENTS.length > 0);
  });
});

// ---------------------------------------------------------------------------
// printSetupUsage
// ---------------------------------------------------------------------------
describe("printSetupUsage", () => {
  it("outputs usage text to stdout", () => {
    const out = captureStdout(() => printSetupUsage());
    assert.ok(out.includes("Usage:"), "should include 'Usage:'");
    assert.ok(out.includes("--client"), "should include --client");
    assert.ok(out.includes("--profile"), "should include --profile");
    assert.ok(out.includes("--modules"), "should include --modules");
  });

  it("lists every supported client in the usage output", () => {
    const out = captureStdout(() => printSetupUsage());
    for (const c of SUPPORTED_CLIENTS) {
      assert.ok(out.includes(c), `Usage should list client '${c}'`);
    }
  });
});

// ---------------------------------------------------------------------------
// runSetup — cursor
// ---------------------------------------------------------------------------
describe("runSetup — cursor", () => {
  let tmpDir: string;
  let origHome: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-setup-cursor-"));
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  after(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the config file and parent directories when they do not exist", () => {
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    assert.ok(!fs.existsSync(configPath), "file should not exist before setup");
    captureStdout(() => runSetup({ client: "cursor", modules: "all" }));
    assert.ok(fs.existsSync(configPath), "config file should have been created");
  });

  it("writes a valid mcpServers entry", () => {
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, Record<string, unknown>>;
    assert.ok(servers?.["agent-tradekit-mcp"], "entry 'agent-tradekit-mcp' should exist");
    assert.equal(servers["agent-tradekit-mcp"].command, "agent-tradekit-mcp");
    assert.ok(Array.isArray(servers["agent-tradekit-mcp"].args), "args should be an array");
  });

  it("cursor entry does not include a 'type' field", () => {
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, Record<string, unknown>>;
    assert.equal(servers["agent-tradekit-mcp"].type, undefined);
  });

  it("default modules arg is 'all'", () => {
    const out = captureStdout(() => runSetup({ client: "cursor", modules: "all" }));
    assert.ok(out.includes("--modules all"));
  });

  it("includes --profile in args and uses profile-suffixed server name", () => {
    captureStdout(() => runSetup({ client: "cursor", profile: "live", modules: "all" }));
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, unknown>;
    assert.ok(servers["agent-tradekit-mcp-live"], "server name should be suffixed with profile");
  });

  it("output shows server args (profile + modules)", () => {
    const out = captureStdout(() =>
      runSetup({ client: "cursor", profile: "live", modules: "market,spot" }),
    );
    assert.ok(out.includes("--profile live"), "output should contain --profile live");
    assert.ok(out.includes("--modules market,spot"), "output should contain --modules market,spot");
  });

  it("preserves existing mcpServers entries when merging", () => {
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    const existing = { mcpServers: { "other-server": { command: "other" } } };
    fs.writeFileSync(configPath, JSON.stringify(existing), "utf-8");
    captureStdout(() => runSetup({ client: "cursor", modules: "all" }));
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, unknown>;
    assert.ok(servers["other-server"], "pre-existing server should be preserved");
    assert.ok(servers["agent-tradekit-mcp"], "new server should be added");
  });

  it("creates a .bak backup when config file already exists", () => {
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    const backupPath = configPath + ".bak";
    // Ensure the file exists (from previous test)
    assert.ok(fs.existsSync(configPath), "pre-condition: config must exist");
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    captureStdout(() => runSetup({ client: "cursor", modules: "all" }));
    assert.ok(fs.existsSync(backupPath), ".bak backup should be created");
  });

  it("output mentions the backup path", () => {
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    const out = captureStdout(() => runSetup({ client: "cursor", modules: "all" }));
    assert.ok(out.includes(configPath + ".bak"), "output should mention backup path");
  });

  it("throws an error when existing config contains invalid JSON", () => {
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    fs.writeFileSync(configPath, "{ this is not valid json }", "utf-8");
    assert.throws(
      () => captureStdout(() => runSetup({ client: "cursor", modules: "all" })),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes("Failed to parse"), "error should mention 'Failed to parse'");
        return true;
      },
    );
    // Clean up so subsequent tests can proceed
    fs.unlinkSync(configPath);
  });

  it("prints 'Restart' hint for cursor", () => {
    const out = captureStdout(() => runSetup({ client: "cursor", modules: "all" }));
    assert.ok(out.includes("Restart Cursor"), "should remind user to restart Cursor");
  });

  it("prints success confirmation with client name", () => {
    const out = captureStdout(() => runSetup({ client: "cursor", modules: "all" }));
    assert.ok(out.includes("✓ Configured Cursor"), "should confirm configuration");
  });
});

// ---------------------------------------------------------------------------
// runSetup — vscode (writes to cwd)
// ---------------------------------------------------------------------------
describe("runSetup — vscode", () => {
  let tmpDir: string;
  let origCwd: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-setup-vscode-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  after(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes .mcp.json in the current working directory", () => {
    captureStdout(() => runSetup({ client: "vscode", modules: "all" }));
    const configPath = path.join(tmpDir, ".mcp.json");
    assert.ok(fs.existsSync(configPath), ".mcp.json should exist in cwd");
  });

  it("vscode entry includes type: 'stdio'", () => {
    const configPath = path.join(tmpDir, ".mcp.json");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, Record<string, unknown>>;
    assert.equal(servers["agent-tradekit-mcp"]?.type, "stdio");
  });

  it("does not print 'Restart' hint for vscode", () => {
    const out = captureStdout(() => runSetup({ client: "vscode", modules: "all" }));
    assert.ok(!out.includes("Restart VS Code"), "vscode should not prompt to restart");
  });
});

// ---------------------------------------------------------------------------
// runSetup — claude-desktop (macOS path)
// ---------------------------------------------------------------------------
describe("runSetup — claude-desktop", () => {
  let tmpDir: string;
  let origHome: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-setup-cd-"));
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  after(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates config under Library/Application Support/Claude on non-Windows", () => {
    if (process.platform === "win32") return; // skip on Windows
    captureStdout(() => runSetup({ client: "claude-desktop", modules: "all" }));
    const configPath = path.join(
      tmpDir,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
    assert.ok(fs.existsSync(configPath), "config file should be created");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    assert.ok((data.mcpServers as Record<string, unknown>)?.["agent-tradekit-mcp"]);
  });

  it("prints 'Restart Claude Desktop' hint", () => {
    if (process.platform === "win32") return;
    const out = captureStdout(() => runSetup({ client: "claude-desktop", modules: "all" }));
    assert.ok(out.includes("Restart Claude Desktop"));
  });
});

// ---------------------------------------------------------------------------
// runSetup — windsurf
// ---------------------------------------------------------------------------
describe("runSetup — windsurf", () => {
  let tmpDir: string;
  let origHome: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-setup-ws-"));
    origHome = process.env.HOME;
    process.env.HOME = tmpDir;
  });

  after(() => {
    process.env.HOME = origHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates windsurf config under .codeium/windsurf/", () => {
    captureStdout(() => runSetup({ client: "windsurf", modules: "all" }));
    const configPath = path.join(tmpDir, ".codeium", "windsurf", "mcp_config.json");
    assert.ok(fs.existsSync(configPath), "windsurf config should be created");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    assert.ok((data.mcpServers as Record<string, unknown>)?.["agent-tradekit-mcp"]);
  });

  it("windsurf entry does not include 'type' field", () => {
    const configPath = path.join(tmpDir, ".codeium", "windsurf", "mcp_config.json");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, Record<string, unknown>>;
    assert.equal(servers["agent-tradekit-mcp"].type, undefined);
  });
});
