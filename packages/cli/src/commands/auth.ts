import { spawn } from "node:child_process";
import readline from "node:readline";
import {
  getAuthBinaryPath,
  getAuthStatus,
  fetchAuthCdnChecksum,
  installAuthBinary,
  removeAuthBinary,
  ensureAuthBinaryLatest,
  updateAuthBinaryCache,
  clearAuthBinaryCache,
  readFullConfig,
} from "@agent-tradekit/core";
import type { AuthLocalStatus, CdnChecksum } from "@agent-tradekit/core";
import { outputLine, errorLine } from "../formatter.js";
import type { CliValues } from "../parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Spawn okx-auth with inherited stdio and wait for exit. */
function runOkxAuth(args: string[]): Promise<number> {
  const binPath = getAuthBinaryPath();

  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, {
      stdio: "inherit",
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn okx-auth: ${err.message}`));
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

/** Spawn okx-auth, pipe stdout to caller's stdout, inherit stderr + stdin. */
function runOkxAuthCapture(args: string[]): Promise<{ code: number; stdout: string }> {
  const binPath = getAuthBinaryPath();

  return new Promise((resolve, reject) => {
    const child = spawn(binPath, args, {
      stdio: ["inherit", "pipe", "inherit"],
    });

    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn okx-auth: ${err.message}`));
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(chunks).toString("utf-8"),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// okx auth login
// ---------------------------------------------------------------------------

export interface AuthLoginArgs {
  site?: string;
  manual?: boolean;
}

/**
 * Return the name of the first profile with a non-empty api_key, or null.
 * Used to short-circuit OAuth login when API key credentials are already present —
 * the REST client prefers API key over OAuth and never falls back (see
 * rest-client.ts applyAuth), so starting an OAuth flow in that state is wasted
 * effort and confuses the user.
 */
function findApiKeyProfile(): string | null {
  let config;
  try {
    config = readFullConfig();
  } catch {
    return null;
  }
  for (const [name, profile] of Object.entries(config.profiles ?? {})) {
    if (profile?.api_key) return name;
  }
  return null;
}

export async function cmdAuthLogin(args: AuthLoginArgs): Promise<void> {
  const apiKeyProfile = findApiKeyProfile();
  if (apiKeyProfile) {
    if (args.manual) {
      outputLine(JSON.stringify({
        status: "skipped",
        reason: "api_key_configured",
        profile: apiKeyProfile,
        message: `API key already configured (profile: ${apiKeyProfile}). OAuth login skipped — API key will be used automatically.`,
      }));
    } else {
      outputLine(`API key already configured (profile: ${apiKeyProfile}). OAuth login skipped — API key will be used automatically.`);
    }
    return;
  }

  const cliArgs = ["login"];
  if (args.site) cliArgs.push("--site", args.site);
  if (args.manual) cliArgs.push("--manual");

  const code = await runOkxAuth(cliArgs);
  if (code !== 0) {
    process.exitCode = code;
  }
}

// ---------------------------------------------------------------------------
// okx auth logout
// ---------------------------------------------------------------------------

export async function cmdAuthLogout(): Promise<void> {
  const code = await runOkxAuth(["logout"]);
  if (code !== 0) {
    process.exitCode = code;
  }
}

// ---------------------------------------------------------------------------
// okx auth status
// ---------------------------------------------------------------------------

export interface AuthStatusArgs {
  json?: boolean;
}

export async function cmdAuthStatus(args: AuthStatusArgs): Promise<void> {
  const cliArgs = ["status"];
  if (args.json) cliArgs.push("--json");

  const result = await runOkxAuthCapture(cliArgs);
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.code !== 0) {
    process.exitCode = result.code;
  }
}

// ---------------------------------------------------------------------------
// okx auth install-status
// ---------------------------------------------------------------------------

function resolveChecksumMatch(
  local: AuthLocalStatus,
  cdnChecksum: CdnChecksum | null,
  cdnError: string | null,
): "match" | "mismatch" | "unavailable" | "not-installed" {
  if (!local.exists) return "not-installed";
  if (cdnError || !cdnChecksum) return "unavailable";
  if (cdnChecksum.sha256 === local.sha256) return "match";
  return "mismatch";
}

function checksumMatchLabel(match: string): string {
  if (match === "match") return "✓ match";
  if (match === "mismatch") return "✗ mismatch (update available)";
  return "CDN unreachable";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function cmdAuthInstallStatus(json: boolean): Promise<void> {
  const local: AuthLocalStatus = getAuthStatus();

  let cdnChecksum: CdnChecksum | null = null;
  let cdnError: string | null = null;
  if (local.exists) {
    try {
      cdnChecksum = await fetchAuthCdnChecksum(undefined, 5_000);
    } catch (err) {
      cdnError = err instanceof Error ? err.message : String(err);
    }
  }

  const checksumMatch = resolveChecksumMatch(local, cdnChecksum, cdnError);

  if (json) {
    outputLine(
      JSON.stringify({
        binaryPath: local.binaryPath,
        exists: local.exists,
        platform: local.platform,
        fileSize: local.fileSize ?? null,
        sha256: local.sha256 ?? null,
        cdnMatch: checksumMatch,
        cdnSha256: cdnChecksum?.sha256 ?? null,
        cdnSource: cdnChecksum?.source ?? null,
      }),
    );
    return;
  }

  outputLine("");
  outputLine("  okx-auth Binary Status");
  outputLine("  " + "─".repeat(40));
  outputLine(`  Binary path : ${local.binaryPath}`);
  outputLine(`  Installed   : ${local.exists ? "yes" : "no"}`);
  outputLine(`  Platform    : ${local.platform ?? "(unsupported)"}`);
  if (local.exists) {
    outputLine(`  File size   : ${formatBytes(local.fileSize!)}`);
    outputLine(`  SHA-256     : ${local.sha256 ?? "(unknown)"}`);
    outputLine(`  CDN check   : ${checksumMatchLabel(checksumMatch)}`);
    if (cdnChecksum) {
      outputLine(`  CDN source  : ${cdnChecksum.source}`);
    }
  }
  outputLine("");
}

// ---------------------------------------------------------------------------
// okx auth install
// ---------------------------------------------------------------------------

export async function cmdAuthInstall(json: boolean): Promise<void> {
  const messages: string[] = [];
  const onProgress = (msg: string): void => {
    if (!json) {
      outputLine(`  ${msg}`);
    }
    messages.push(msg);
  };

  if (!json) {
    outputLine("");
    outputLine("  Installing okx-auth...");
  }

  const result = await installAuthBinary(undefined, undefined, onProgress);

  if (json) {
    outputLine(JSON.stringify({ status: result.status, source: result.source ?? null, error: result.error ?? null, messages }));
    if (result.status === "failed") {
      process.exitCode = 1;
    }
    return;
  }

  if (result.status === "installed" || result.status === "up-to-date") {
    const local = getAuthStatus();
    if (local.sha256) updateAuthBinaryCache(local.sha256);
  }

  if (result.status === "installed") {
    outputLine(`  ✓ okx-auth installed successfully (${result.source ?? ""})`);
  } else if (result.status === "up-to-date") {
    outputLine("  ✓ okx-auth is already up to date");
  } else {
    errorLine(`  ✗ Installation failed: ${result.error ?? "unknown error"}`);
    errorLine("  Hint: check network connectivity or try again later");
    process.exitCode = 1;
  }
  outputLine("");
}

// ---------------------------------------------------------------------------
// okx auth remove
// ---------------------------------------------------------------------------

export async function cmdAuthRemove(force: boolean, json: boolean): Promise<void> {
  const local: AuthLocalStatus = getAuthStatus(undefined, { skipHash: true });

  if (!local.exists) {
    if (json) {
      outputLine(JSON.stringify({ status: "not-installed" }));
    } else {
      outputLine("  okx-auth is not installed.");
    }
    return;
  }

  if (!(await confirmRemoval(force, local.binaryPath))) return;

  let result: ReturnType<typeof removeAuthBinary>;
  try {
    result = removeAuthBinary();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) {
      outputLine(JSON.stringify({ status: "failed", error: msg }));
    } else {
      errorLine(`  ✗ Failed to remove: ${msg}`);
    }
    process.exitCode = 1;
    return;
  }

  if (json) {
    outputLine(JSON.stringify({ status: result.status, path: local.binaryPath }));
    return;
  }

  if (result.status === "removed") {
    clearAuthBinaryCache();
    outputLine(`  ✓ Removed: ${local.binaryPath}`);
  } else {
    outputLine("  okx-auth is not installed.");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function confirmRemoval(force: boolean, binaryPath: string): Promise<boolean> {
  if (force) return true;
  if (!process.stdin.isTTY) {
    errorLine("  Error: stdin is not a TTY. Use --force to skip confirmation.");
    process.exitCode = 1;
    return false;
  }
  const confirmed = await askConfirmation(
    `  Remove okx-auth at ${binaryPath}? [y/N] `,
  );
  if (!confirmed) {
    outputLine("  Cancelled.");
    return false;
  }
  return true;
}

function askConfirmation(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export async function handleAuthCommand(
  action: string,
  _rest: string[],
  v: CliValues,
): Promise<void> {
  const site = v.site;
  const json = v.json;
  const manual = v.manual;
  const force = v.force;

  if (["login", "logout", "status"].includes(action)) {
    await ensureAuthBinaryLatest((msg) => errorLine(`  ${msg}`));
  }

  switch (action) {
    case "login":
      return cmdAuthLogin({ site, manual });
    case "logout":
      return cmdAuthLogout();
    case "status":
      return cmdAuthStatus({ json });
    case "install":
      return cmdAuthInstall(json ?? false);
    case "install-status":
      return cmdAuthInstallStatus(json ?? false);
    case "remove":
      return cmdAuthRemove(force ?? false, json ?? false);
    default:
      errorLine(`Unknown auth command: ${action}`);
      errorLine("Available: login, logout, status, install, install-status, remove");
      process.exitCode = 1;
  }
}
