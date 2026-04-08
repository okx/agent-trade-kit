import dns from "node:dns/promises";
import net from "node:net";
import os from "node:os";
import tls from "node:tls";
import type { OkxConfig } from "@agent-tradekit/core";
import { OkxRestClient, readFullConfig, configFilePath } from "@agent-tradekit/core";
import { Report, ok, fail, section, readCliVersion, writeReportIfRequested } from "./diagnose-utils.js";
import { outputLine } from "../formatter.js";
import { cmdDiagnoseMcp } from "./diagnose-mcp.js";

const CLI_VERSION = readCliVersion();

declare const __GIT_HASH__: string;
const GIT_HASH: string = typeof __GIT_HASH__ !== "undefined" ? __GIT_HASH__ : "dev";


function maskKey(key: string | undefined): string {
  if (!key) return "(not set)";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 2)}****${key.slice(-2)}`;
}

// ---------------------------------------------------------------------------
// Network probes
// ---------------------------------------------------------------------------

interface ProbeResult { ok: boolean; ms: number; ip?: string; error?: string }

async function checkDns(hostname: string): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const addresses = await dns.resolve4(hostname);
    return { ok: true, ip: addresses[0], ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function checkSocket(
  createFn: () => net.Socket | tls.TLSSocket,
  successEvent: string,
  timeoutMs: number,
): Promise<ProbeResult> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = createFn();
    const cleanup = (): void => { socket.removeAllListeners(); socket.destroy(); };
    socket.once(successEvent, () => {
      cleanup();
      resolve({ ok: true, ms: Date.now() - t0 });
    });
    socket.once("timeout", () => {
      cleanup();
      resolve({ ok: false, ms: Date.now() - t0, error: `timed out after ${timeoutMs}ms` });
    });
    socket.once("error", (err: Error) => {
      cleanup();
      resolve({ ok: false, ms: Date.now() - t0, error: err.message });
    });
  });
}

async function checkTcp(hostname: string, port: number, timeoutMs = 5000): Promise<ProbeResult> {
  return checkSocket(
    () => net.createConnection({ host: hostname, port, timeout: timeoutMs }),
    "connect",
    timeoutMs,
  );
}

async function checkTls(hostname: string, port: number, timeoutMs = 5000): Promise<ProbeResult> {
  return checkSocket(
    () => tls.connect({ host: hostname, port, timeout: timeoutMs, servername: hostname }),
    "secureConnect",
    timeoutMs,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Diagnostic check helpers (extracted to reduce cmdDiagnose complexity)
// ---------------------------------------------------------------------------

function checkProxyEnv(report: Report): void {
  const httpProxy = process.env.HTTP_PROXY ?? process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
  if (httpProxy || httpsProxy) {
    ok("HTTP_PROXY", httpProxy ?? "(not set)");
    ok("HTTPS_PROXY", httpsProxy ?? "(not set)");
    if (noProxy) ok("NO_PROXY", noProxy);
    report.add("http_proxy", httpProxy ?? "-");
    report.add("https_proxy", httpsProxy ?? "-");
    if (noProxy) report.add("no_proxy", noProxy);
  } else {
    ok("Proxy", "(none)");
    report.add("proxy", "none");
  }
}

function checkEnvironment(report: Report): boolean {
  let passed = true;
  section("Environment");

  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1), 10);
  if (nodeMajor >= 18) {
    ok("Node.js", `${nodeVersion} (>= 18 required)`);
  } else {
    fail("Node.js", `${nodeVersion} (>= 18 required)`, ["Upgrade Node.js to v18 or later"]);
    passed = false;
  }
  ok("CLI", `v${CLI_VERSION} (${GIT_HASH})`);
  ok("OS", `${process.platform} ${process.arch}`);
  ok("OS release", os.release());
  ok("Shell", process.env.SHELL ?? "(unknown)");
  ok("Locale", `${process.env.LANG ?? process.env.LC_ALL ?? "(unknown)"}`);
  ok("Timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

  report.add("cli", `${CLI_VERSION} (${GIT_HASH})`);
  report.add("node", `${nodeVersion} ${process.platform} ${process.arch}`);
  // os.machine() available since Node 19.9 — fall back to process.arch for Node 18
  const machine = typeof os.machine === "function" ? os.machine() : process.arch;
  report.add("os", `${os.type()} ${os.release()} ${machine}`);
  report.add("shell", process.env.SHELL ?? "-");
  report.add("locale", process.env.LANG ?? process.env.LC_ALL ?? "-");
  report.add("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);

  checkProxyEnv(report);

  return passed;
}

function checkConfig(config: OkxConfig, profile: string, report: Report): boolean {
  let passed = true;
  section(`Config (profile: ${profile})`);

  if (config.hasAuth) {
    ok("API key", maskKey(config.apiKey));
    ok("Secret", "****");
    ok("Passphrase", "****");
  } else {
    fail("Credentials", "not configured", [
      "Set OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE env vars",
      "Or run: okx config init",
    ]);
    passed = false;
  }
  ok("Demo mode", String(config.demo));
  ok("Site", config.site);
  ok("Base URL", config.baseUrl);
  ok("Timeout", `${config.timeoutMs}ms`);

  report.add("profile", profile);
  report.add("site", config.site);
  report.add("base", config.baseUrl);
  report.add("auth", config.hasAuth ? `true (key=${maskKey(config.apiKey)})` : "false");
  report.add("demo", String(config.demo));
  report.add("timeout", `${config.timeoutMs}ms`);

  return passed;
}

async function checkTcpTls(
  hostname: string, port: number, protocol: string, report: Report,
): Promise<boolean> {
  let passed = true;
  const tcpResult = await checkTcp(hostname, port);
  if (tcpResult.ok) {
    ok("TCP connect", `port ${port} (${tcpResult.ms}ms)`);
    report.add("tcp", `${port} OK (${tcpResult.ms}ms)`);
  } else {
    fail("TCP connect", `port ${port} \u2014 ${tcpResult.error}`, [
      "Check firewall/proxy/VPN settings",
      `Try: nc -zv ${hostname} ${port}`,
    ]);
    report.add("tcp", `FAIL ${port} ${tcpResult.error} (${tcpResult.ms}ms)`);
    return false;
  }

  if (protocol === "https:") {
    const tlsResult = await checkTls(hostname, port);
    if (tlsResult.ok) {
      ok("TLS handshake", `(${tlsResult.ms}ms)`);
      report.add("tls", `OK (${tlsResult.ms}ms)`);
    } else {
      fail("TLS handshake", tlsResult.error ?? "failed", [
        "Check system certificates or proxy MITM settings",
      ]);
      passed = false;
      report.add("tls", `FAIL ${tlsResult.error} (${tlsResult.ms}ms)`);
    }
  }
  return passed;
}

async function checkNetwork(config: OkxConfig, client: OkxRestClient, report: Report): Promise<boolean> {
  let passed = true;
  section("Network");

  const url = new URL(config.baseUrl);
  const hostname = url.hostname;
  const defaultPort = url.protocol === "https:" ? 443 : 80;
  const port = url.port ? parseInt(url.port, 10) : defaultPort;

  const dnsResult = await checkDns(hostname);
  if (dnsResult.ok) {
    ok("DNS resolve", `${hostname} \u2192 ${dnsResult.ip} (${dnsResult.ms}ms)`);
    report.add("dns", `${hostname} \u2192 ${dnsResult.ip} (${dnsResult.ms}ms)`);
  } else {
    fail("DNS resolve", `${hostname} \u2014 ${dnsResult.error}`, [
      "Check DNS settings or network connection",
      `Try: nslookup ${hostname}`,
    ]);
    passed = false;
    report.add("dns", `FAIL ${hostname} ${dnsResult.error} (${dnsResult.ms}ms)`);
  }

  if (dnsResult.ok) {
    const tcpTlsPassed = await checkTcpTls(hostname, port, url.protocol, report);
    if (!tcpTlsPassed) passed = false;
  }

  // Public API check
  const t0 = Date.now();
  try {
    await client.publicGet("/api/v5/public/time");
    const ms = Date.now() - t0;
    ok("API /public/time", `200 (${ms}ms)`);
    report.add("api", `/public/time 200 (${ms}ms)`);
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    fail("API /public/time", msg, [
      "OKX API may be down or blocked in your network",
      `Try: curl ${config.baseUrl}/api/v5/public/time`,
    ]);
    passed = false;
    report.add("api", `FAIL /public/time ${msg} (${ms}ms)`);
  }

  return passed;
}

function getAuthHints(msg: string, baseUrl: string): string[] {
  const accountUrl = baseUrl.replace(/\/+$/, "") + "/account/my-api";
  if (msg.includes("50111") || msg.includes("Invalid OK-ACCESS-KEY")) {
    return ["API key is invalid or expired", `Regenerate at ${accountUrl}`];
  }
  if (msg.includes("50112") || msg.includes("Invalid Sign")) {
    return ["Secret key or passphrase may be wrong", `Regenerate API key at ${accountUrl}`];
  }
  if (msg.includes("50113")) {
    return ["Passphrase is incorrect"];
  }
  if (msg.includes("50100")) {
    return ["API key lacks required permissions", `Update permissions at ${accountUrl}`];
  }
  return ["Check API credentials and permissions"];
}

async function checkAuth(client: OkxRestClient, config: OkxConfig, report: Report): Promise<boolean> {
  if (!config.hasAuth) {
    report.add("auth_api", "skipped (no credentials)");
    return true;
  }

  let passed = true;
  section("Authentication");

  const t1 = Date.now();
  try {
    await client.privateGet("/api/v5/account/balance");
    const ms = Date.now() - t1;
    ok("Account balance", `200 (${ms}ms)`);
    if (config.demo) {
      ok("Demo header", "x-simulated-trading: 1");
    }
    report.add("auth_api", `/account/balance 200 (${ms}ms)`);
  } catch (e) {
    const ms = Date.now() - t1;
    const msg = e instanceof Error ? e.message : String(e);
    const hints = getAuthHints(msg, config.baseUrl);
    fail("Account balance", msg, hints);
    passed = false;
    report.add("auth_api", `FAIL /account/balance ${msg} (${ms}ms)`);
  }

  return passed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export interface DiagnoseOptions {
  mcp?: boolean;
  cli?: boolean;
  all?: boolean;
  output?: string;
}

export async function cmdDiagnose(config: OkxConfig | undefined, profile: string, options: DiagnoseOptions = {}): Promise<void> {
  // --mcp only: run MCP server checks
  if (options.mcp && !options.all) {
    return cmdDiagnoseMcp({ output: options.output });
  }

  // --all: run CLI checks first, then MCP checks
  if (options.all) {
    await runCliChecks(config, profile, options.output);
    return cmdDiagnoseMcp({ output: options.output });
  }

  // --cli or no flag (default): run CLI/general checks only
  return runCliChecks(config, profile, options.output);
}

function checkConfigFile(report: Report): boolean {
  section("Config File");
  const path = configFilePath();
  try {
    readFullConfig();
    ok("Config parse", `${path} OK`);
    report.add("config_parse", "OK");
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail("Config parse", msg, [
      "If passphrase contains special characters (# \\ \" '), wrap in quotes:",
      "  Contains # \\ \"  → passphrase = 'value'",
      "  Contains '       → passphrase = \"value\"",
      "  Contains both    → passphrase = '''value'''",
      "Or re-run: okx config init",
    ]);
    report.add("config_parse", `FAIL ${msg}`);
    return false;
  }
}

async function runCliChecks(config: OkxConfig | undefined, profile: string, outputPath?: string): Promise<void> {
  process.stdout.write("\n  OKX Trade CLI Diagnostics\n");
  process.stdout.write("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");

  const report = new Report();
  report.add("ts", new Date().toISOString());

  const configFilePassed = checkConfigFile(report);
  const envPassed = checkEnvironment(report);

  if (!config) {
    // Config parse failed — skip remaining checks that need config
    fail("Config", "Could not load config (see Config File check above)", []);
    report.add("result", "FAIL");
    report.print();
    writeReportIfRequested(report, outputPath);
    process.exitCode = 1;
    return;
  }

  const cfgPassed = checkConfig(config, profile, report);
  const client = new OkxRestClient(config);
  const netPassed = await checkNetwork(config, client, report);
  const authPassed = await checkAuth(client, config, report);

  const allPassed = configFilePassed && envPassed && cfgPassed && netPassed && authPassed;

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

  writeReportIfRequested(report, outputPath);
}
