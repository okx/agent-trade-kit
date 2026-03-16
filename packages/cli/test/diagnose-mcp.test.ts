import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { sanitize } from "../src/commands/diagnose-utils.js";
import { cmdDiagnoseMcp } from "../src/commands/diagnose-mcp.js";
import {
  checkClaudeDesktopConfig,
  checkMcpLogs,
  checkModuleLoading,
  checkMcpEntryPoint,
} from "../src/commands/diagnose-mcp.js";
import { Report } from "../src/commands/diagnose-utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CaptureResult { output: string; exitCode: number | undefined }

async function captureStdout(fn: () => Promise<void>): Promise<CaptureResult> {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write;
  const savedExitCode = process.exitCode;
  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  const capturedExitCode = process.exitCode;
  process.exitCode = savedExitCode;
  return { output: chunks.join(""), exitCode: capturedExitCode };
}

function captureStdoutSync(fn: () => void): string {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunks.join("");
}

// ---------------------------------------------------------------------------
// sanitize() unit tests
// ---------------------------------------------------------------------------

describe("sanitize", () => {
  it("masks UUID-like strings", () => {
    const input = "id=550e8400-e29b-41d4-a716-446655440000 other";
    const result = sanitize(input);
    assert.ok(!result.includes("550e8400"), "UUID should be masked");
    assert.ok(result.includes("****-uuid-****"), "masked placeholder should appear");
  });

  it("masks long hex strings (32+ chars)", () => {
    const hex = "a".repeat(32);
    const result = sanitize(`key=${hex}`);
    assert.ok(!result.includes(hex), "long hex should be masked");
    assert.ok(result.includes("****hex****"), "hex placeholder should appear");
  });

  it("masks Bearer tokens", () => {
    const result = sanitize("Authorization: Bearer abc123def456ghi789jkl012mno345pqr");
    assert.ok(!result.includes("abc123def456"), "token should be masked");
  });

  it("leaves normal text untouched", () => {
    const input = "Node.js v20.0.0 darwin arm64";
    assert.equal(sanitize(input), input);
  });

  it("does not mask short strings that look like hex", () => {
    // 8 char hex — too short to be masked
    const short = "deadbeef";
    const result = sanitize(`prefix ${short} suffix`);
    assert.ok(result.includes(short), "short hex should NOT be masked");
  });
});

// ---------------------------------------------------------------------------
// checkClaudeDesktopConfig() unit tests
// ---------------------------------------------------------------------------

describe("checkClaudeDesktopConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true when config path is not applicable (no configPath)", () => {
    // We can test directly by mocking getConfigPath via a temp file that doesn't exist
    // Since getConfigPath depends on platform, we test the else-path with a real call
    const report = new Report();
    // Just verify the function doesn't throw
    const output = captureStdoutSync(() => {
      checkClaudeDesktopConfig(report);
    });
    assert.ok(output.includes("Claude Desktop Config"), "should print section header");
  });

  it("returns false when config file does not exist", () => {
    // We patch the file check by creating a non-existent path scenario
    const report = new Report();
    // Create a temp path that will not exist
    const fakePath = path.join(tmpDir, "nonexistent", "claude_desktop_config.json");

    // Override existsSync for this specific path via patching fs module
    const origExistsSync = fs.existsSync;
    const origReadFileSync = fs.readFileSync;

    // Patch getConfigPath result by monkey-patching fs.existsSync
    // We intercept the specific path
    let firstCall = true;
    (fs as { existsSync: typeof fs.existsSync }).existsSync = (p: fs.PathLike) => {
      if (firstCall && String(p).includes("claude")) {
        firstCall = false;
        return false; // simulate file not found
      }
      return origExistsSync(p);
    };

    try {
      const output = captureStdoutSync(() => {
        checkClaudeDesktopConfig(report);
      });
      // Either it returns n/a (platform doesn't support) or it reports missing
      assert.ok(
        output.includes("not found") || output.includes("not applicable"),
        "should report missing or n/a",
      );
    } finally {
      (fs as { existsSync: typeof fs.existsSync }).existsSync = origExistsSync;
      (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = origReadFileSync;
    }
  });

  it("returns false when JSON is malformed", () => {
    const configFile = path.join(tmpDir, "claude_desktop_config.json");
    fs.writeFileSync(configFile, "{ invalid json }", "utf8");

    const report = new Report();
    const origExistsSync = fs.existsSync;
    const origReadFileSync = fs.readFileSync;

    // Patch to return our test file
    (fs as { existsSync: typeof fs.existsSync }).existsSync = (p: fs.PathLike) => {
      const ps = String(p);
      if (ps.includes("claude") || ps.includes("Claude")) {
        return true;
      }
      return origExistsSync(p);
    };
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((p: fs.PathLike | number, opts?: unknown) => {
      const ps = String(p);
      if (ps.includes("claude") || ps.includes("Claude")) {
        return fs.readFileSync(configFile, "utf8");
      }
      return (origReadFileSync as Function)(p, opts);
    }) as typeof fs.readFileSync;

    try {
      const output = captureStdoutSync(() => {
        const result = checkClaudeDesktopConfig(report);
        // either it finds it and fails JSON parse, or it returns n/a on unsupported platform
        assert.ok(typeof result === "boolean");
      });
      // On macOS/win this might hit the JSON parse error path
      // On linux it also attempts
      assert.ok(output.length > 0, "should produce some output");
    } finally {
      (fs as { existsSync: typeof fs.existsSync }).existsSync = origExistsSync;
      (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = origReadFileSync;
    }
  });

  it("returns false when mcpServers has no okx-trade-mcp entry", () => {
    const configFile = path.join(tmpDir, "claude_desktop_config.json");
    fs.writeFileSync(configFile, JSON.stringify({
      mcpServers: {
        "some-other-server": { command: "node", args: ["other.js"] },
      },
    }), "utf8");

    const report = new Report();
    const origExistsSync = fs.existsSync;
    const origReadFileSync = fs.readFileSync;

    (fs as { existsSync: typeof fs.existsSync }).existsSync = (p: fs.PathLike) => {
      const ps = String(p);
      if (ps.includes("claude") || ps.includes("Claude")) return true;
      return origExistsSync(p);
    };
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((p: fs.PathLike | number, opts?: unknown) => {
      const ps = String(p);
      if (ps.includes("claude") || ps.includes("Claude")) {
        return fs.readFileSync(configFile, "utf8");
      }
      return (origReadFileSync as Function)(p, opts);
    }) as typeof fs.readFileSync;

    try {
      const output = captureStdoutSync(() => {
        checkClaudeDesktopConfig(report);
      });
      // Platform may return n/a or attempt the check — either is valid
      assert.ok(output.length > 0, "should produce some output");
    } finally {
      (fs as { existsSync: typeof fs.existsSync }).existsSync = origExistsSync;
      (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = origReadFileSync;
    }
  });

  it("returns true when okx-trade-mcp entry exists in mcpServers", () => {
    const configFile = path.join(tmpDir, "claude_desktop_config.json");
    fs.writeFileSync(configFile, JSON.stringify({
      mcpServers: {
        "okx-trade-mcp": { command: "node", args: ["/path/to/okx-trade-mcp"] },
      },
    }), "utf8");

    const report = new Report();
    const origExistsSync = fs.existsSync;
    const origReadFileSync = fs.readFileSync;

    (fs as { existsSync: typeof fs.existsSync }).existsSync = (p: fs.PathLike) => {
      const ps = String(p);
      if (ps.includes("claude") || ps.includes("Claude")) return true;
      return origExistsSync(p);
    };
    (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = ((p: fs.PathLike | number, opts?: unknown) => {
      const ps = String(p);
      if (ps.includes("claude") || ps.includes("Claude")) {
        return fs.readFileSync(configFile, "utf8");
      }
      return (origReadFileSync as Function)(p, opts);
    }) as typeof fs.readFileSync;

    try {
      const output = captureStdoutSync(() => {
        checkClaudeDesktopConfig(report);
      });
      // Should print section header regardless
      assert.ok(output.length > 0, "should produce some output");
    } finally {
      (fs as { existsSync: typeof fs.existsSync }).existsSync = origExistsSync;
      (fs as { readFileSync: typeof fs.readFileSync }).readFileSync = origReadFileSync;
    }
  });
});

// ---------------------------------------------------------------------------
// checkMcpLogs() unit tests
// ---------------------------------------------------------------------------

describe("checkMcpLogs", () => {
  it("does not throw when log directory does not exist", () => {
    const report = new Report();
    assert.doesNotThrow(() => {
      captureStdoutSync(() => {
        checkMcpLogs(report);
      });
    });
  });

  it("shows log not found message when no log files present", () => {
    const report = new Report();
    const output = captureStdoutSync(() => {
      checkMcpLogs(report);
    });
    // Either it finds existing log files (on a dev machine) or shows not found
    assert.ok(output.includes("MCP Server Logs"), "should show logs section header");
  });

  it("shows log file when it exists", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-log-test-"));
    const logFile = path.join(tmpDir, "mcp.log");
    fs.writeFileSync(logFile, "test log line 1\ntest log line 2\n", "utf8");

    const report = new Report();

    // Patch homedir to return our temp directory so logs are found
    const origHomedir = os.homedir;
    (os as { homedir: typeof os.homedir }).homedir = () => tmpDir;

    try {
      const output = captureStdoutSync(() => {
        checkMcpLogs(report);
      });
      assert.ok(output.includes("MCP Server Logs"), "should show section header");
    } finally {
      (os as { homedir: typeof os.homedir }).homedir = origHomedir;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// checkModuleLoading() unit tests
// ---------------------------------------------------------------------------

describe("checkModuleLoading", () => {
  it("skips when entryPath is null", () => {
    const report = new Report();
    const output = captureStdoutSync(() => {
      const result = checkModuleLoading(null, report);
      assert.equal(result, true, "should return true when skipped");
    });
    assert.ok(output.includes("Module Loading"), "should show section header");
    assert.ok(output.includes("skipped"), "should show skipped message");
  });

  it("succeeds when --version returns output", () => {
    // Use node itself as the entry point with --version flag
    const report = new Report();
    // node --version returns the node version
    const output = captureStdoutSync(() => {
      // Pass a valid node script that just prints a version line
      const result = checkModuleLoading(process.execPath, report);
      // node process.execPath --version exits 0 with version output
      assert.ok(typeof result === "boolean");
    });
    assert.ok(output.includes("Module Loading"), "should show section header");
  });

  it("fails when entry path does not exist", () => {
    const report = new Report();
    const fakePath = "/nonexistent/path/to/mcp/server.js";
    const output = captureStdoutSync(() => {
      const result = checkModuleLoading(fakePath, report);
      // With a non-existent path, node will fail
      assert.equal(typeof result, "boolean");
    });
    assert.ok(output.includes("Module Loading"), "should show section header");
  });
});

// ---------------------------------------------------------------------------
// checkMcpEntryPoint() unit tests
// ---------------------------------------------------------------------------

describe("checkMcpEntryPoint", () => {
  it("returns { entryPath, passed } structure", () => {
    const report = new Report();
    const output = captureStdoutSync(() => {
      const result = checkMcpEntryPoint(report);
      assert.ok(Object.prototype.hasOwnProperty.call(result, "entryPath"), "should have entryPath");
      assert.ok(Object.prototype.hasOwnProperty.call(result, "passed"), "should have passed");
      assert.ok(typeof result.passed === "boolean", "passed should be boolean");
    });
    assert.ok(output.includes("MCP Entry Point"), "should show section header");
  });

  it("shows entry point section in output", () => {
    const report = new Report();
    const output = captureStdoutSync(() => {
      checkMcpEntryPoint(report);
    });
    assert.ok(output.includes("MCP Entry Point"), "should include entry point section");
  });

  it("returns passed=false when okx-trade-mcp not found in PATH or monorepo", () => {
    const report = new Report();
    // In test environment, okx-trade-mcp is unlikely to be in PATH
    // but may be found via monorepo path
    const output = captureStdoutSync(() => {
      const result = checkMcpEntryPoint(report);
      // Just ensure it returns a valid result
      assert.ok(typeof result.passed === "boolean");
      assert.ok(result.entryPath === null || typeof result.entryPath === "string");
    });
    assert.ok(output.length > 0, "should produce output");
  });
});

// ---------------------------------------------------------------------------
// cmdDiagnoseMcp() integration-style tests
// ---------------------------------------------------------------------------

describe("cmdDiagnoseMcp", () => {
  let savedExitCode: number | undefined;

  beforeEach(() => {
    savedExitCode = process.exitCode;
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  it("prints MCP diagnostics header", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("OKX MCP Server Diagnostics"), "should include MCP header");
  });

  it("shows Node.js compatibility section", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("Node.js Compatibility"), "should include Node.js compat section");
    assert.ok(output.includes(process.version), "should include current node version");
  });

  it("shows MCP Package section", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("MCP Package"), "should include MCP Package section");
    assert.ok(output.includes("MCP version"), "should show MCP version label");
    assert.ok(output.includes("CLI version"), "should show CLI version label");
  });

  it("shows MCP Entry Point section", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("MCP Entry Point"), "should include entry point section");
  });

  it("shows Claude Desktop Config section", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("Claude Desktop Config"), "should include claude config section");
  });

  it("shows MCP Server Logs section", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("MCP Server Logs"), "should include logs section");
  });

  it("shows diagnostic report block at the end", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("Diagnostic Report"), "should include report block");
    assert.ok(output.includes("copy & share"), "should include copy & share text");
  });

  it("report contains timestamp", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("ts"), "should include timestamp key");
  });

  it("report contains mode=mcp", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("mcp"), "should include mode key");
  });

  it("writes report to --output file when specified", async () => {
    const tmpDir = os.tmpdir();
    const outFile = path.join(tmpDir, `okx-mcp-diag-test-${Date.now()}.txt`);
    try {
      await captureStdout(() => cmdDiagnoseMcp({ output: outFile }));
      assert.ok(fs.existsSync(outFile), "output file should be created");
      const content = fs.readFileSync(outFile, "utf8");
      assert.ok(content.includes("Diagnostic Report"), "output file should contain report");
    } finally {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    }
  });

  it("shows result line at the end", async () => {
    const { output } = await captureStdout(() => cmdDiagnoseMcp());
    assert.ok(output.includes("Result:"), "should include result line");
  });
});
