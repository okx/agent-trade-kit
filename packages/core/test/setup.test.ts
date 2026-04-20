import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runSetup, printSetupUsage, getConfigPath, SUPPORTED_CLIENTS } from "../src/setup.js";

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
describe("runSetup: cursor", () => {
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

  it("writes a valid mcpServers entry using npx", () => {
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, Record<string, unknown>>;
    assert.ok(servers?.["okx-trade-mcp"], "entry 'okx-trade-mcp' should exist");
    assert.equal(servers["okx-trade-mcp"].command, "npx");
    const args = servers["okx-trade-mcp"].args as string[];
    assert.ok(Array.isArray(args), "args should be an array");
    assert.equal(args[0], "-y");
    assert.equal(args[1], "@okx_ai/okx-trade-mcp");
  });

  it("cursor entry does not include a 'type' field", () => {
    const configPath = path.join(tmpDir, ".cursor", "mcp.json");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, Record<string, unknown>>;
    assert.equal(servers["okx-trade-mcp"].type, undefined);
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
    assert.ok(servers["okx-trade-mcp-live"], "server name should be suffixed with profile");
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
    assert.ok(servers["okx-trade-mcp"], "new server should be added");
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
describe("runSetup: vscode", () => {
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

  it("vscode entry includes type: 'stdio' and uses bare command (not npx)", () => {
    const configPath = path.join(tmpDir, ".mcp.json");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, Record<string, unknown>>;
    assert.equal(servers["okx-trade-mcp"]?.type, "stdio");
    assert.equal(servers["okx-trade-mcp"]?.command, "okx-trade-mcp");
  });

  it("does not print 'Restart' hint for vscode", () => {
    const out = captureStdout(() => runSetup({ client: "vscode", modules: "all" }));
    assert.ok(!out.includes("Restart VS Code"), "vscode should not prompt to restart");
  });
});

// ---------------------------------------------------------------------------
// runSetup — claude-desktop (macOS path)
// ---------------------------------------------------------------------------
describe("runSetup: claude-desktop", () => {
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
    if (process.platform !== "darwin") return; // macOS-only path
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
    assert.ok((data.mcpServers as Record<string, unknown>)?.["okx-trade-mcp"]);
  });

  it("prints 'Restart Claude Desktop' hint", () => {
    if (process.platform !== "darwin") return; // macOS-only path
    const out = captureStdout(() => runSetup({ client: "claude-desktop", modules: "all" }));
    assert.ok(out.includes("Restart Claude Desktop"));
  });
});

// ---------------------------------------------------------------------------
// runSetup — windsurf
// ---------------------------------------------------------------------------
describe("runSetup: windsurf", () => {
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
    assert.ok((data.mcpServers as Record<string, unknown>)?.["okx-trade-mcp"]);
  });

  it("windsurf entry does not include 'type' field", () => {
    const configPath = path.join(tmpDir, ".codeium", "windsurf", "mcp_config.json");
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    const servers = data.mcpServers as Record<string, Record<string, unknown>>;
    assert.equal(servers["okx-trade-mcp"].type, undefined);
  });
});

// ---------------------------------------------------------------------------
// getConfigPath — cross-platform path resolution
// ---------------------------------------------------------------------------
describe("getConfigPath", () => {
  let origPlatform: PropertyDescriptor | undefined;
  let origAppdata: string | undefined;
  let origXdgConfigHome: string | undefined;
  let origHome: string | undefined;

  before(() => {
    origPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    origAppdata = process.env.APPDATA;
    origXdgConfigHome = process.env.XDG_CONFIG_HOME;
    origHome = process.env.HOME;
  });

  after(() => {
    if (origPlatform) {
      Object.defineProperty(process, "platform", origPlatform);
    }
    if (origAppdata !== undefined) process.env.APPDATA = origAppdata;
    else delete process.env.APPDATA;
    if (origXdgConfigHome !== undefined) process.env.XDG_CONFIG_HOME = origXdgConfigHome;
    else delete process.env.XDG_CONFIG_HOME;
    if (origHome !== undefined) process.env.HOME = origHome;
    else delete process.env.HOME;
  });

  function setPlatform(p: string): void {
    Object.defineProperty(process, "platform", { value: p, writable: true, configurable: true });
  }

  // -- claude-desktop --

  it("claude-desktop on win32 uses APPDATA", () => {
    setPlatform("win32");
    process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";
    const result = getConfigPath("claude-desktop")!;
    assert.ok(result.includes("AppData"));
    assert.ok(result.includes("Roaming"));
    assert.ok(result.endsWith("claude_desktop_config.json"));
  });

  it("claude-desktop on darwin uses Library/Application Support", () => {
    setPlatform("darwin");
    const result = getConfigPath("claude-desktop")!;
    assert.ok(result.includes("Library"));
    assert.ok(result.includes("Application Support"));
    assert.ok(result.endsWith("claude_desktop_config.json"));
  });

  it("claude-desktop on linux uses XDG_CONFIG_HOME when set", () => {
    setPlatform("linux");
    process.env.XDG_CONFIG_HOME = "/custom/config";
    const result = getConfigPath("claude-desktop")!;
    assert.ok(result.startsWith("/custom/config"), `expected XDG prefix, got: ${result}`);
    assert.ok(result.endsWith("claude_desktop_config.json"));
  });

  it("claude-desktop on linux falls back to ~/.config when XDG_CONFIG_HOME is unset", () => {
    setPlatform("linux");
    delete process.env.XDG_CONFIG_HOME;
    const result = getConfigPath("claude-desktop")!;
    assert.ok(result.includes(".config"), `expected .config in path, got: ${result}`);
    assert.ok(result.endsWith("claude_desktop_config.json"));
  });

  // -- cursor (same on all platforms) --

  it("cursor resolves to ~/.cursor/mcp.json on any platform", () => {
    for (const p of ["win32", "darwin", "linux"] as const) {
      setPlatform(p);
      const result = getConfigPath("cursor")!;
      assert.ok(result.endsWith(path.join(".cursor", "mcp.json")), `cursor path wrong on ${p}: ${result}`);
    }
  });

  // -- windsurf (same on all platforms) --

  it("windsurf resolves to ~/.codeium/windsurf/mcp_config.json on any platform", () => {
    for (const p of ["win32", "darwin", "linux"] as const) {
      setPlatform(p);
      const result = getConfigPath("windsurf")!;
      assert.ok(
        result.endsWith(path.join(".codeium", "windsurf", "mcp_config.json")),
        `windsurf path wrong on ${p}: ${result}`,
      );
    }
  });

  // -- vscode --

  it("vscode resolves to cwd/.mcp.json", () => {
    const result = getConfigPath("vscode")!;
    assert.equal(result, path.join(process.cwd(), ".mcp.json"));
  });

  // -- claude-code --

  it("claude-code returns null", () => {
    assert.equal(getConfigPath("claude-code"), null);
  });

  // -- platform isolation --

  it("claude-desktop on win32 never includes macOS Library path", () => {
    setPlatform("win32");
    process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";
    const result = getConfigPath("claude-desktop")!;
    assert.ok(!result.includes("Library"), `win32 path should not contain 'Library': ${result}`);
    assert.ok(!result.includes("Application Support"), `win32 path should not contain 'Application Support': ${result}`);
  });

  it("claude-desktop on darwin never includes .config path", () => {
    setPlatform("darwin");
    const result = getConfigPath("claude-desktop")!;
    assert.ok(!result.includes(".config"), `darwin path should not contain '.config': ${result}`);
  });

  it("claude-desktop on linux never includes Library path", () => {
    setPlatform("linux");
    delete process.env.XDG_CONFIG_HOME;
    const result = getConfigPath("claude-desktop")!;
    assert.ok(!result.includes("Library"), `linux path should not contain 'Library': ${result}`);
    assert.ok(!result.includes("Application Support"), `linux path should not contain 'Application Support': ${result}`);
  });
});

// ---------------------------------------------------------------------------
// getConfigPath — Windows MS Store Claude Desktop detection
// ---------------------------------------------------------------------------
describe("getConfigPath: Windows MS Store Claude Desktop", () => {
  let tmpDir: string;
  let origPlatform: PropertyDescriptor | undefined;
  let origLocalAppData: string | undefined;
  let origAppdata: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-setup-msstore-"));
    origPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    origLocalAppData = process.env.LOCALAPPDATA;
    origAppdata = process.env.APPDATA;
  });

  after(() => {
    if (origPlatform) Object.defineProperty(process, "platform", origPlatform);
    if (origLocalAppData !== undefined) process.env.LOCALAPPDATA = origLocalAppData;
    else delete process.env.LOCALAPPDATA;
    if (origAppdata !== undefined) process.env.APPDATA = origAppdata;
    else delete process.env.APPDATA;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setPlatform(p: string): void {
    Object.defineProperty(process, "platform", { value: p, writable: true, configurable: true });
  }

  it("prefers MS Store path when Claude_<hash> package dir exists", () => {
    setPlatform("win32");

    // Simulate MS Store directory structure
    const msStoreClaudeDir = path.join(
      tmpDir, "Packages", "Claude_pzs8sxrjxfjjc", "LocalCache", "Roaming", "Claude",
    );
    fs.mkdirSync(msStoreClaudeDir, { recursive: true });

    process.env.LOCALAPPDATA = tmpDir;
    process.env.APPDATA = path.join(tmpDir, "Roaming"); // standard path (should NOT be used)

    const result = getConfigPath("claude-desktop")!;
    assert.ok(result.includes("Packages"), `should use MS Store path, got: ${result}`);
    assert.ok(result.includes("Claude_pzs8sxrjxfjjc"), `should contain package hash, got: ${result}`);
    assert.ok(result.endsWith("claude_desktop_config.json"));
  });

  it("falls back to standard APPDATA when no MS Store package exists", () => {
    setPlatform("win32");

    // Create Packages dir without Claude_ entry
    const packagesDir = path.join(tmpDir, "Packages-empty");
    fs.mkdirSync(packagesDir, { recursive: true });

    process.env.LOCALAPPDATA = path.join(tmpDir, "NoMsStore");
    process.env.APPDATA = path.join(tmpDir, "StandardRoaming");

    const result = getConfigPath("claude-desktop")!;
    assert.ok(result.includes("StandardRoaming"), `should use standard APPDATA, got: ${result}`);
    assert.ok(!result.includes("Packages"), `should not contain Packages, got: ${result}`);
    assert.ok(result.endsWith("claude_desktop_config.json"));
  });

  it("falls back to standard APPDATA when LOCALAPPDATA/Packages does not exist", () => {
    setPlatform("win32");

    process.env.LOCALAPPDATA = path.join(tmpDir, "nonexistent");
    process.env.APPDATA = path.join(tmpDir, "FallbackRoaming");

    const result = getConfigPath("claude-desktop")!;
    assert.ok(result.includes("FallbackRoaming"), `should fall back to APPDATA, got: ${result}`);
    assert.ok(result.endsWith("claude_desktop_config.json"));
  });

  it("does not trigger MS Store detection on non-win32 platforms", () => {
    for (const p of ["darwin", "linux"] as const) {
      setPlatform(p);

      // Even if LOCALAPPDATA has a Claude_ package, non-win32 should ignore it
      const msStoreDir = path.join(tmpDir, "Packages", "Claude_abc123", "LocalCache", "Roaming", "Claude");
      fs.mkdirSync(msStoreDir, { recursive: true });
      process.env.LOCALAPPDATA = tmpDir;

      const result = getConfigPath("claude-desktop")!;
      assert.ok(!result.includes("Packages"), `${p} should not use MS Store path, got: ${result}`);
    }
  });
});
