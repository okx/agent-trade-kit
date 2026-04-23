/**
 * `okx pilot` command — Pilot binary management.
 *
 * Sub-commands:
 *   status   — show local binary info + CDN match
 *   install  — download/update the binary
 *   remove   — delete the binary (with confirmation unless --force)
 */

import readline from "node:readline";
import {
  getPilotStatus,
  fetchCdnChecksum,
  installPilotBinary,
  removePilotBinary,
  readPilotCache,
} from "@agent-tradekit/core";
import type { PilotLocalStatus, CdnChecksum } from "@agent-tradekit/core";
import { outputLine, errorLine } from "../formatter.js";

// ---------------------------------------------------------------------------
// status helpers (extracted to reduce cognitive complexity of cmdPilotStatus)
// ---------------------------------------------------------------------------

function resolveChecksumMatch(
  local: PilotLocalStatus,
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

function formatStatusText(
  local: PilotLocalStatus,
  checksumMatch: string,
  cdnChecksum: CdnChecksum | null,
  runtimeMode: string,
): void {
  outputLine("");
  outputLine("  Pilot Status");
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
  outputLine(`  Runtime mode: ${runtimeMode}`);
  outputLine("");
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

export async function cmdPilotStatus(json: boolean, binaryPath?: string): Promise<void> {
  const local: PilotLocalStatus = getPilotStatus(binaryPath);

  // Read runtime mode from Pilot cache (best-effort)
  let runtimeMode: string = "no cache";
  try {
    const cacheEntry = readPilotCache("www.okx.com");
    if (cacheEntry) {
      runtimeMode = cacheEntry.mode; // "proxy" | "direct"
    }
  } catch {
    // Not critical
  }

  // Fetch CDN checksum asynchronously (with graceful degradation)
  let cdnChecksum: CdnChecksum | null = null;
  let cdnError: string | null = null;
  if (local.exists) {
    try {
      cdnChecksum = await fetchCdnChecksum(undefined, 5_000);
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
        runtimeMode,
      }),
    );
    return;
  }

  formatStatusText(local, checksumMatch, cdnChecksum, runtimeMode);
}

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

export async function cmdPilotInstall(json: boolean, binaryPath?: string): Promise<void> {
  const messages: string[] = [];
  const onProgress = (msg: string): void => {
    if (!json) {
      outputLine(`  ${msg}`);
    }
    messages.push(msg);
  };

  if (!json) {
    outputLine("");
    outputLine("  Installing Pilot...");
  }

  const result = await installPilotBinary(binaryPath, undefined, onProgress);

  if (json) {
    outputLine(JSON.stringify({ status: result.status, source: result.source ?? null, error: result.error ?? null, messages }));
    if (result.status === "failed") {
      process.exitCode = 1;
    }
    return;
  }

  if (result.status === "installed") {
    outputLine(`  ✓ Pilot installed successfully (${result.source ?? ""})`);
  } else if (result.status === "up-to-date") {
    outputLine("  ✓ Pilot is already up to date");
  } else {
    errorLine(`  ✗ Installation failed: ${result.error ?? "unknown error"}`);
    errorLine("  Hint: check network connectivity or try again later");
    process.exitCode = 1;
  }
  outputLine("");
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

export async function cmdPilotRemove(force: boolean, json: boolean, binaryPath?: string): Promise<void> {
  const local: PilotLocalStatus = getPilotStatus(binaryPath);

  if (!local.exists) {
    if (json) {
      outputLine(JSON.stringify({ status: "not-installed" }));
    } else {
      outputLine("  Pilot is not installed.");
    }
    return;
  }

  if (!force) {
    // Interactive confirmation
    if (!process.stdin.isTTY) {
      errorLine("  Error: stdin is not a TTY. Use --force to skip confirmation.");
      process.exitCode = 1;
      return;
    }

    const confirmed = await askConfirmation(
      `  Remove Pilot at ${local.binaryPath}? [y/N] `,
    );
    if (!confirmed) {
      outputLine("  Cancelled.");
      return;
    }
  }

  const result = removePilotBinary(binaryPath);

  if (json) {
    outputLine(JSON.stringify({ status: result.status, path: local.binaryPath }));
    return;
  }

  if (result.status === "removed") {
    outputLine(`  ✓ Removed: ${local.binaryPath}`);
  } else {
    outputLine("  Pilot is not installed.");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
