/**
 * `okx doh` command — DoH binary management.
 *
 * Sub-commands:
 *   status   — show local binary info + CDN match
 *   install  — download/update the binary
 *   remove   — delete the binary (with confirmation unless --force)
 */

import readline from "node:readline";
import {
  getDohStatus,
  fetchCdnChecksum,
  installDohBinary,
  removeDohBinary,
  readDohCache,
} from "@agent-tradekit/core";
import type { DohLocalStatus, CdnChecksum } from "@agent-tradekit/core";
import { outputLine, errorLine } from "../formatter.js";

// ---------------------------------------------------------------------------
// status helpers (extracted to reduce cognitive complexity of cmdDohStatus)
// ---------------------------------------------------------------------------

function resolveChecksumMatch(
  local: DohLocalStatus,
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
  local: DohLocalStatus,
  checksumMatch: string,
  cdnChecksum: CdnChecksum | null,
  runtimeMode: string,
): void {
  outputLine("");
  outputLine("  DoH Resolver Status");
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

export async function cmdDohStatus(json: boolean, binaryPath?: string): Promise<void> {
  const local: DohLocalStatus = getDohStatus(binaryPath);

  // Read runtime mode from DoH cache (best-effort)
  let runtimeMode: string = "no cache";
  try {
    const cacheEntry = readDohCache("www.okx.com");
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

export async function cmdDohInstall(json: boolean, binaryPath?: string): Promise<void> {
  const messages: string[] = [];
  const onProgress = (msg: string): void => {
    if (!json) {
      outputLine(`  ${msg}`);
    }
    messages.push(msg);
  };

  if (!json) {
    outputLine("");
    outputLine("  Installing DoH resolver...");
  }

  const result = await installDohBinary(binaryPath, undefined, onProgress);

  if (json) {
    outputLine(JSON.stringify({ status: result.status, source: result.source ?? null, error: result.error ?? null, messages }));
    if (result.status === "failed") {
      process.exitCode = 1;
    }
    return;
  }

  if (result.status === "installed") {
    outputLine(`  ✓ DoH resolver installed successfully (${result.source ?? ""})`);
  } else if (result.status === "up-to-date") {
    outputLine("  ✓ DoH resolver is already up to date");
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

export async function cmdDohRemove(force: boolean, json: boolean, binaryPath?: string): Promise<void> {
  const local: DohLocalStatus = getDohStatus(binaryPath);

  if (!local.exists) {
    if (json) {
      outputLine(JSON.stringify({ status: "not-installed" }));
    } else {
      outputLine("  DoH resolver is not installed.");
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
      `  Remove DoH resolver at ${local.binaryPath}? [y/N] `,
    );
    if (!confirmed) {
      outputLine("  Cancelled.");
      return;
    }
  }

  const result = removeDohBinary(binaryPath);

  if (json) {
    outputLine(JSON.stringify({ status: result.status, path: local.binaryPath }));
    return;
  }

  if (result.status === "removed") {
    outputLine(`  ✓ Removed: ${local.binaryPath}`);
  } else {
    outputLine("  DoH resolver is not installed.");
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
