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
import {
  getConfigPath,
  allToolSpecs,
  CLIENT_NAMES,
  DEFAULT_MODULES,
} from "@agent-tradekit/core";
import type { ClientId } from "@agent-tradekit/core";
import {
  Report,
  ok,
  fail,
  warn,
  section,
  sanitize,
  readCliVersion,
  writeReportIfRequested,
} from "./diagnose-utils.js";
import { outputLine } from "../formatter.js";

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

/** Server name token used to detect okx-trade-mcp entries in any client config. */
const MCP_SERVER_NAME = "okx-trade-mcp";

// ---------------------------------------------------------------------------
// MCP client tool count limits (as of 2026-03)
// Source: Cursor docs & community reports; update when clients change limits.
// ---------------------------------------------------------------------------
const CLIENT_LIMITS: Partial<Record<ClientId, { perServer: number; total: number }>> = {
  cursor: { perServer: 40, total: 80 },
};

/**
 * Check if a JSON config file (mcpServers format) contains an okx-trade-mcp entry.
 * Returns "found" | "not-configured" | "parse-error" | "missing".
 */
function checkJsonMcpConfig(configPath: string): "found" | "not-configured" | "parse-error" | "missing" {
  if (!fs.existsSync(configPath)) return "missing";
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const mcpServers = parsed["mcpServers"] as Record<string, unknown> | undefined;
    if (!mcpServers) return "not-configured";
    const entries = Object.entries(mcpServers);
    const found = entries.find(([name, v]) => {
      if (name.includes(MCP_SERVER_NAME)) return true;
      const val = v as Record<string, unknown>;
      const cmd = String(val["command"] ?? "");
      const args = (val["args"] as string[] | undefined) ?? [];
      return cmd.includes(MCP_SERVER_NAME) || args.some((a) => a.includes(MCP_SERVER_NAME));
    });
    return found ? "found" : "not-configured";
  } catch (_e) {
    return "parse-error";
  }
}

/**
 * Check Claude Code configuration by looking at ~/.claude/settings.json
 * and ~/.claude.json for mcpServers entries containing okx-trade-mcp.
 * Iterates all candidates: a parse error in one file does not prevent
 * checking the other.
 */
function checkClaudeCodeConfig(): "found" | "not-configured" | "parse-error" | "missing" {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".claude", "settings.json"),
    path.join(home, ".claude.json"),
  ];
  let anyFound = false;
  let anyParseError = false;
  for (const cfgPath of candidates) {
    if (!fs.existsSync(cfgPath)) continue;
    anyFound = true;
    const result = checkJsonMcpConfig(cfgPath);
    if (result === "found") return "found";
    if (result === "parse-error") anyParseError = true;
  }
  if (!anyFound) return "missing";
  if (anyParseError) return "parse-error";
  return "not-configured";
}

/**
 * Handle a single JSON-config client. Returns true if a failure was recorded.
 */
function handleJsonClient(
  clientId: ClientId,
  report: Report,
  configuredClients: ClientId[],
): boolean {
  const configPath = getConfigPath(clientId);
  if (!configPath) return false; // platform doesn't support this client

  const name = CLIENT_NAMES[clientId];
  const status = checkJsonMcpConfig(configPath);

  if (status === "missing") return false; // client not installed — skip silently

  if (status === "found") {
    ok(name, `configured (${sanitize(configPath)})`);
    report.add(`client_${clientId}`, `OK ${sanitize(configPath)}`);
    configuredClients.push(clientId);
    return false;
  }

  if (status === "not-configured") {
    fail(name, "okx-trade-mcp not found in mcpServers", [`Run: okx setup --client ${clientId}`]);
    report.add(`client_${clientId}`, "NOT_CONFIGURED");
  } else {
    fail(name, `JSON parse error in ${sanitize(configPath)}`, [
      `Check ${sanitize(configPath)} for JSON syntax errors`,
      `Then run: okx setup --client ${clientId}`,
    ]);
    report.add(`client_${clientId}`, "PARSE_ERROR");
  }
  return true;
}

/**
 * Handle Claude Code client. Returns true if a hard failure was recorded.
 * "not-configured" is a warning only — Claude Code may be used for other purposes.
 */
function handleClaudeCodeClient(report: Report, configuredClients: ClientId[]): boolean {
  const status = checkClaudeCodeConfig();
  if (status === "missing") return false;

  const name = CLIENT_NAMES["claude-code"];

  if (status === "found") {
    ok(name, "configured");
    report.add("client_claude-code", "OK");
    configuredClients.push("claude-code");
    return false;
  }

  if (status === "not-configured") {
    warn(name, "installed but okx-trade-mcp not configured", [
      "Run: okx setup --client claude-code",
    ]);
    report.add("client_claude-code", "NOT_CONFIGURED");
    return false; // not a hard failure
  }

  fail(name, "settings file has JSON parse error", ["Run: okx setup --client claude-code"]);
  report.add("client_claude-code", "PARSE_ERROR");
  return true;
}

/**
 * Check all known MCP clients and return overall pass/fail and list of configured clients.
 * - Found + valid → ✓, added to configuredClients
 * - Found + invalid → ✗ with fix guidance
 * - Not found → skip (no output, no fail)
 * - At least one client configured → overall pass
 */
export function checkMcpClients(report: Report): { passed: boolean; configuredClients: ClientId[] } {
  section("MCP Client Config");

  const jsonClients: ClientId[] = ["claude-desktop", "cursor", "windsurf"];
  const configuredClients: ClientId[] = [];
  let anyFailed = false;

  for (const clientId of jsonClients) {
    if (handleJsonClient(clientId, report, configuredClients)) anyFailed = true;
  }

  // Claude Code — special handling (uses claude mcp add, config paths vary)
  if (handleClaudeCodeClient(report, configuredClients)) anyFailed = true;

  // vscode is project-level — skip for global diagnose

  if (configuredClients.length === 0 && !anyFailed) {
    // No client config found at all
    fail("no client", "no MCP client configuration found", [
      "Run: okx setup --client <client>",
      "Supported clients: claude-desktop, cursor, windsurf, claude-code",
    ]);
    report.add("client_cfg", "NONE_FOUND");
    return { passed: false, configuredClients };
  }

  const passed = configuredClients.length > 0 && !anyFailed;
  report.add("client_cfg", passed ? `OK (${configuredClients.join(",")})` : "FAIL");
  return { passed, configuredClients };
}

/**
 * Check tool count and warn if exceeding known client limits.
 * Tool count warnings do not affect overall pass/fail — they are advisory only.
 *
 * @param getSpecs - Optional override for retrieving tool specs (used in tests).
 */
export function checkToolCount(
  report: Report,
  configuredClients: ClientId[],
  getSpecs: () => ReturnType<typeof allToolSpecs> = allToolSpecs,
): void {
  section("Tool Count");

  const specs = getSpecs();
  const totalCount = specs.length;

  // Count tools for default modules (the suggested --modules set)
  const defaultModuleSet = new Set<string>(DEFAULT_MODULES);
  const defaultCount = specs.filter((s) => defaultModuleSet.has(s.module)).length;
  const defaultModulesArg = DEFAULT_MODULES.join(",");

  // Determine which limits apply based on configured clients
  const applicableLimits = configuredClients
    .map((id) => ({ id, limits: CLIENT_LIMITS[id] }))
    .filter((x): x is { id: ClientId; limits: { perServer: number; total: number } } => x.limits !== undefined);

  if (applicableLimits.length === 0) {
    // No clients with known limits — just report count
    ok("total tools", `${totalCount} tools loaded`);
    report.add("tool_count", `${totalCount}`);
    return;
  }

  // Check against each limit
  let anyExceeded = false;
  for (const { id, limits } of applicableLimits) {
    const name = CLIENT_NAMES[id];
    if (totalCount > limits.total) {
      warn(
        "tool count",
        `${totalCount} tools loaded — exceeds ${name} limit (${limits.total} total / ${limits.perServer} per server)`,
        [
          `Use --modules to reduce: okx-trade-mcp --modules ${defaultModulesArg} (${defaultCount} tools)`,
        ],
      );
      report.add("tool_count", `${totalCount} EXCEEDS_${id.toUpperCase()}_LIMIT`);
      anyExceeded = true;
    } else if (totalCount > limits.perServer) {
      warn(
        "tool count",
        `${totalCount} tools loaded — exceeds ${name} per-server limit (${limits.perServer})`,
        [
          `Use --modules to reduce: okx-trade-mcp --modules ${defaultModulesArg} (${defaultCount} tools)`,
        ],
      );
      report.add("tool_count", `${totalCount} EXCEEDS_${id.toUpperCase()}_PER_SERVER_LIMIT`);
      anyExceeded = true;
    }
  }

  if (!anyExceeded) {
    ok("total tools", `${totalCount} tools loaded (within limits for all configured clients)`);
    report.add("tool_count", `${totalCount} OK`);
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
        for (const line of lines) outputLine(`    ${sanitize(line)}`);
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
  outputLine("");
  outputLine("  OKX MCP Server Diagnostics");
  outputLine("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");

  const report = new Report();
  report.add("ts", new Date().toISOString());
  report.add("mode", "mcp");
  report.add("os", `${process.platform} ${process.arch} ${os.release()}`);

  checkMcpPackageVersion(report);
  const nodePassed = checkNodeCompat(report);
  const { entryPath, passed: entryPassed } = checkMcpEntryPoint(report);
  const { passed: cfgPassed, configuredClients } = checkMcpClients(report);
  checkMcpLogs(report);

  const moduleLoadPassed = checkModuleLoading(entryPath, report);

  // Tool count check — advisory only, does not affect pass/fail
  checkToolCount(report, configuredClients);

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
  outputLine("");
  if (allPassed) {
    outputLine("  Result: All checks passed \u2713");
  } else {
    outputLine("  Result: Some checks failed \u2717");
    process.exitCode = 1;
  }

  report.add("result", allPassed ? "PASS" : "FAIL");
  report.print();

  writeReportIfRequested(report, options.output);
}
