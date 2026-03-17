/**
 * MCP server diagnostics — `okx diagnose --mcp`
 *
 * All checks use Node.js built-ins only (no external dependencies).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { getConfigPath } from "@agent-tradekit/core";
import { Report, ok, fail, section, sanitize, readCliVersion, writeReportIfRequested } from "./diagnose-utils.js";

const _require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

function readMcpVersion(): string {
  // Try to read from the installed @okx_ai/okx-trade-mcp package
  const candidates = [
    // Installed as global or local dependency
    "@okx_ai/okx-trade-mcp/package.json",
    // Relative paths for monorepo dev layout
    "../../../mcp/package.json",
    "../../../../packages/mcp/package.json",
  ];
  for (const rel of candidates) {
    try {
      const pkg = _require(rel) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch (_e) {
      // try next
    }
  }
  return "(unknown)";
}

// ---------------------------------------------------------------------------
// Check helpers
// ---------------------------------------------------------------------------

function checkMcpPackageVersion(report: Report): void {
  section("MCP Package");
  const mcpVersion = readMcpVersion();
  const cliVersion = readCliVersion();
  ok("MCP version", mcpVersion);
  ok("CLI version", cliVersion);
  report.add("mcp_ver", mcpVersion);
  report.add("cli_ver", cliVersion);
}

function checkNodeCompat(report: Report): boolean {
  section("Node.js Compatibility");
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1), 10);
  if (nodeMajor >= 18) {
    ok("Node.js", `${nodeVersion} (>= 18 required)`);
    report.add("node", `${nodeVersion} OK`);
    return true;
  } else {
    fail("Node.js", `${nodeVersion} (>= 18 required)`, ["Upgrade Node.js to v18 or later"]);
    report.add("node", `${nodeVersion} FAIL`);
    return false;
  }
}

export function checkMcpEntryPoint(report: Report): { entryPath: string | null; passed: boolean } {
  section("MCP Entry Point");

  // Try to resolve the okx-trade-mcp binary
  let entryPath: string | null = null;

  // 1. Check PATH for the installed binary
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["okx-trade-mcp"], {
    encoding: "utf8",
  });
  if (which.status === 0 && which.stdout.trim()) {
    entryPath = which.stdout.trim().split("\n")[0].trim();
  }

  // 2. If not found in PATH, try common monorepo locations
  if (!entryPath) {
    const candidates = [
      // Installed locally
      path.join(process.cwd(), "node_modules", ".bin", "okx-trade-mcp"),
      // Monorepo workspace (e.g. running from source)
      path.join(__dirname, "..", "..", "..", "..", "mcp", "dist", "index.js"),
    ];
    for (const candidate of candidates) {
      try {
        fs.accessSync(candidate, fs.constants.X_OK | fs.constants.R_OK);
        entryPath = candidate;
        break;
      } catch (_e) {
        // not found or not accessible — try next
      }
    }
  }

  if (entryPath) {
    ok("entry point", entryPath);
    report.add("mcp_entry", entryPath);
    return { entryPath, passed: true };
  } else {
    fail("entry point", "okx-trade-mcp not found in PATH", [
      "Install globally: npm install -g @okx_ai/okx-trade-mcp",
      "Or install locally and use npx okx-trade-mcp",
    ]);
    report.add("mcp_entry", "NOT_FOUND");
    return { entryPath: null, passed: false };
  }
}

export function checkClaudeDesktopConfig(report: Report): boolean {
  section("Claude Desktop Config");

  const configPath = getConfigPath("claude-desktop");
  if (!configPath) {
    ok("config path", "(not applicable on this platform)");
    report.add("claude_cfg", "n/a");
    return true;
  }

  if (!fs.existsSync(configPath)) {
    fail("config file", `not found: ${configPath}`, [
      "Claude Desktop may not be installed",
      "Run: okx setup --client claude-desktop to configure",
    ]);
    report.add("claude_cfg", `MISSING ${sanitize(configPath)}`);
    return false;
  }

  ok("config file", configPath);
  report.add("claude_cfg", sanitize(configPath));

  // Try to parse and check for okx-trade-mcp entry
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mcpServers = parsed["mcpServers"] as Record<string, unknown> | undefined;
    if (!mcpServers) {
      fail("mcp entry", "no mcpServers section found", [
        "Run: okx setup --client claude-desktop",
      ]);
      report.add("claude_mcp", "NO_SECTION");
      return false;
    }

    // Look for any entry whose command or args reference okx-trade-mcp
    const entries = Object.entries(mcpServers);
    const mcpEntry = entries.find(([, v]) => {
      const val = v as Record<string, unknown>;
      const cmd = String(val["command"] ?? "");
      const args = (val["args"] as string[] | undefined) ?? [];
      return cmd.includes("okx-trade-mcp") || args.some((a) => a.includes("okx-trade-mcp"));
    });

    if (mcpEntry) {
      ok("mcp entry", `found: "${mcpEntry[0]}"`);
      report.add("claude_mcp", `found:${mcpEntry[0]}`);
      return true;
    } else {
      fail("mcp entry", "okx-trade-mcp not found in mcpServers", [
        "Run: okx setup --client claude-desktop",
      ]);
      report.add("claude_mcp", "NOT_CONFIGURED");
      return false;
    }
  } catch (e) {
    fail("config parse", `JSON parse error: ${e instanceof Error ? e.message : String(e)}`, [
      `Check ${configPath} for JSON syntax errors`,
    ]);
    report.add("claude_cfg_parse", "FAIL");
    return false;
  }
}

/**
 * Read the last 8 KB of a log file and return the last 5 non-empty lines.
 * Throws if the file does not exist or cannot be read.
 */
function readLogTail(logPath: string): string[] {
  const stat = fs.statSync(logPath);
  const readSize = Math.min(8192, stat.size);
  const buffer = Buffer.alloc(readSize);
  const fd = fs.openSync(logPath, "r");
  try {
    fs.readSync(fd, buffer, 0, readSize, Math.max(0, stat.size - readSize));
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString("utf8").split("\n").filter((l) => l.trim()).slice(-5);
}

/** Build the platform-specific list of MCP log file candidates. */
function getMcpLogCandidates(): string[] {
  if (process.platform === "darwin") {
    const logsDir = path.join(os.homedir(), "Library", "Logs", "Claude");
    const candidates = [
      path.join(logsDir, "mcp.log"),
      path.join(logsDir, "mcp-server-okx-trade-mcp.log"),
    ];
    try {
      const extra = fs.readdirSync(logsDir)
        .filter((f) => f.startsWith("mcp") && f.endsWith(".log"))
        .map((f) => path.join(logsDir, f));
      candidates.push(...extra);
    } catch (_e) {
      // logsDir not found or not readable — skip
    }
    return candidates;
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return [path.join(appData, "Claude", "logs", "mcp.log")];
  }
  // Linux — XDG
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return [path.join(configHome, "Claude", "logs", "mcp.log")];
}

/** Check recent MCP log lines (macOS-specific path, gracefully skipped elsewhere). */
export function checkMcpLogs(report: Report): void {
  section("MCP Server Logs (recent)");

  const seen = new Set<string>();
  for (const logPath of getMcpLogCandidates()) {
    if (seen.has(logPath)) continue;
    seen.add(logPath);

    try {
      const lines = readLogTail(logPath);
      ok("log file", logPath);
      report.add("mcp_log", logPath);
      if (lines.length > 0) {
        ok("last lines", `(${lines.length} shown)`);
        for (const line of lines) process.stdout.write(`    ${sanitize(line)}\n`);
      } else {
        ok("last lines", "(empty log)");
      }
      return;
    } catch (_e) {
      // File does not exist or is unreadable — try next candidate
    }
  }

  ok("log file", "(not found — logs only appear after MCP server has been started)");
  report.add("mcp_log", "not_found");
}

interface HandshakeResponse {
  ok: true; serverName: string; serverVer: string;
}
interface HandshakeError {
  ok: false; errMsg: string;
}
type ParsedHandshake = HandshakeResponse | HandshakeError | null;

/**
 * Parse a single newline-delimited JSON-RPC line from the MCP server's stdout.
 * Returns a typed result when the line is a response to request id=1, or null
 * if the line is not yet actionable (startup noise, unrelated message, etc.).
 */
function parseHandshakeResponse(line: string): ParsedHandshake {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed["id"] === 1 && parsed["result"]) {
      const result = parsed["result"] as Record<string, unknown>;
      const info = result["serverInfo"] as Record<string, unknown> | undefined;
      return {
        ok: true,
        serverName: String(info?.["name"] ?? "MCP server"),
        serverVer: String(info?.["version"] ?? "?"),
      };
    }
    if (parsed["id"] === 1 && parsed["error"]) {
      const errMsg = (parsed["error"] as Record<string, unknown>)["message"] ?? "unknown error";
      return { ok: false, errMsg: String(errMsg) };
    }
  } catch (_e) {
    // not valid JSON — possibly startup noise, keep buffering
  }
  return null;
}

/** Perform a stdio handshake with the MCP server (spawn, send initialize, check response). */
export async function checkStdioHandshake(entryPath: string, report: Report): Promise<boolean> {
  section("stdio Handshake");

  const TIMEOUT_MS = 5000;
  const initMessage = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "okx-diagnose", version: "1.0" },
    },
  });

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (passed: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(passed);
    };

    const child = spawn(process.execPath, [entryPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const timer = setTimeout(() => {
      child.kill();
      fail("handshake", `timed out after ${TIMEOUT_MS}ms`, [
        "MCP server may be hanging on startup (check credentials/config)",
        `Try: node ${entryPath} --help`,
      ]);
      report.add("handshake", `TIMEOUT ${TIMEOUT_MS}ms`);
      settle(false);
    }, TIMEOUT_MS);

    child.on("error", (err: Error) => {
      fail("handshake", `spawn error: ${err.message}`, [
        `Ensure ${entryPath} is executable`,
        "Check Node.js version compatibility",
      ]);
      report.add("handshake", `SPAWN_ERROR ${err.message}`);
      settle(false);
    });

    let responseBuffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      responseBuffer += chunk.toString("utf8");
      const lines = responseBuffer.split("\n");
      responseBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const parsed = parseHandshakeResponse(line);
        if (!parsed) continue;
        if (parsed.ok) {
          ok("handshake", `OK — ${parsed.serverName} v${parsed.serverVer}`);
          report.add("handshake", `OK ${parsed.serverName}@${parsed.serverVer}`);
        } else {
          fail("handshake", `JSON-RPC error: ${parsed.errMsg}`, [
            "MCP server returned an error during initialization",
          ]);
          report.add("handshake", `RPC_ERROR ${parsed.errMsg}`);
        }
        child.kill();
        settle(parsed.ok);
        return;
      }
    });

    child.stderr.on("data", (_chunk: Buffer) => {
      // Ignore stderr output (MCP server logs to stderr normally)
    });

    // Send the initialize request
    try {
      child.stdin.write(initMessage + "\n");
    } catch (_e) {
      fail("handshake", "failed to write to stdin", ["Check that MCP server accepts stdin"]);
      report.add("handshake", "STDIN_WRITE_FAIL");
      settle(false);
    }
  });
}

/** Check that the MCP module can be required without errors (module loading test). */
export function checkModuleLoading(entryPath: string | null, report: Report): boolean {
  section("Module Loading");

  if (!entryPath) {
    ok("module load", "(skipped — entry point not found)");
    report.add("module_load", "skipped");
    return true;
  }

  // Try a quick --version call as a smoke test for module loading
  const result = spawnSync(process.execPath, [entryPath, "--version"], {
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env },
  });

  if (result.status === 0 && result.stdout.trim()) {
    ok("module load", `version output: ${result.stdout.trim()}`);
    report.add("module_load", `OK v${result.stdout.trim()}`);
    return true;
  } else {
    const errMsg = result.stderr?.trim() || result.error?.message || "non-zero exit";
    fail("module load", `failed: ${sanitize(errMsg)}`, [
      "MCP server may have import errors or missing dependencies",
      `Try: node ${entryPath} --version`,
    ]);
    report.add("module_load", `FAIL ${sanitize(errMsg)}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DiagnoseMcpOptions {
  output?: string;
}

export async function cmdDiagnoseMcp(options: DiagnoseMcpOptions = {}): Promise<void> {
  process.stdout.write("\n  OKX MCP Server Diagnostics\n");
  process.stdout.write("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");

  const report = new Report();
  report.add("ts", new Date().toISOString());
  report.add("mode", "mcp");
  report.add("os", `${process.platform} ${process.arch} ${os.release()}`);

  checkMcpPackageVersion(report);
  const nodePassed = checkNodeCompat(report);
  const { entryPath, passed: entryPassed } = checkMcpEntryPoint(report);
  const cfgPassed = checkClaudeDesktopConfig(report);
  checkMcpLogs(report);

  const moduleLoadPassed = checkModuleLoading(entryPath, report);

  let handshakePassed = false;
  if (entryPath && entryPassed && moduleLoadPassed) {
    handshakePassed = await checkStdioHandshake(entryPath, report);
  } else {
    section("stdio Handshake");
    ok("handshake", "(skipped — entry point not available)");
    report.add("handshake", "skipped");
    handshakePassed = true; // don't count as failure if entry not found
  }

  const allPassed = nodePassed && entryPassed && cfgPassed && moduleLoadPassed && handshakePassed;

  // --- Result ---
  process.stdout.write("\n");
  if (allPassed) {
    process.stdout.write("  Result: All checks passed \u2713\n");
  } else {
    process.stdout.write("  Result: Some checks failed \u2717\n");
    process.exitCode = 1;
  }

  report.add("result", allPassed ? "PASS" : "FAIL");
  report.print();

  writeReportIfRequested(report, options.output);
}
