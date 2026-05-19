/**
 * okx-auth binary installer - TypeScript equivalent of the postinstall section.
 *
 * Provides status, install, and remove operations for the okx-auth binary.
 * Mirrors the pilot binary installer pattern (pilot/installer.ts).
 */

import {
  mkdirSync,
  chmodSync,
  existsSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { download, downloadText } from "../utils/http.js";

import type { AuthLocalStatus } from "./installer-types.js";
import type { CdnChecksum, CdnSource, InstallResult, RemoveResult } from "../pilot/installer-types.js";
import { getPlatformDir, hashFile, CDN_SOURCES, DOWNLOAD_TIMEOUT_MS } from "../pilot/installer.js";
import { getAuthBinaryPath } from "./binary.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTH_CDN_PATH_PREFIX = "/upgradeapp/tools/oauth";

// ---------------------------------------------------------------------------
// Binary name
// ---------------------------------------------------------------------------

export function getAuthBinaryName(): string {
  return platform() === "win32" ? "okx-auth.exe" : "okx-auth";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return local okx-auth binary status synchronously (no network I/O).
 */
export function getAuthStatus(binaryPath?: string, opts?: { skipHash?: boolean }): AuthLocalStatus {
  const resolvedPath = binaryPath ?? getAuthBinaryPath();
  const platformDir = getPlatformDir();

  if (!existsSync(resolvedPath)) {
    return { binaryPath: resolvedPath, exists: false, platform: platformDir };
  }

  if (opts?.skipHash) {
    return { binaryPath: resolvedPath, exists: true, platform: platformDir };
  }

  const { size, sha256 } = hashFile(resolvedPath);
  return { binaryPath: resolvedPath, exists: true, platform: platformDir, fileSize: size, sha256 };
}

/**
 * Fetch the checksum.json from CDN for the current platform.
 * Returns null if all CDN sources fail or the platform is unsupported.
 */
export async function fetchAuthCdnChecksum(
  sources: CdnSource[] = CDN_SOURCES,
  timeoutMs: number = DOWNLOAD_TIMEOUT_MS,
): Promise<CdnChecksum | null> {
  const platformDir = getPlatformDir();
  if (!platformDir) return null;

  const checksumPath = `${AUTH_CDN_PATH_PREFIX}/${platformDir}/checksum.json`;

  for (const { host, protocol } of sources) {
    try {
      const url = `${protocol}://${host}${checksumPath}`;
      const raw = await downloadText(url, timeoutMs);
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (
        typeof data.sha256 !== "string" ||
        typeof data.size !== "number" ||
        typeof data.target !== "string"
      ) {
        continue;
      }
      return { sha256: data.sha256, size: data.size, target: data.target, source: host };
    } catch {
      // Try next source
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Install helpers
// ---------------------------------------------------------------------------

interface ValidatedChecksum {
  sha256: string;
  size: number;
  target: string;
}

async function fetchAndValidateChecksum(
  host: string,
  protocol: string,
  checksumPath: string,
  platformDir: string,
  timeoutMs: number,
  onProgress?: (msg: string) => void,
): Promise<ValidatedChecksum> {
  const checksumUrl = `${protocol}://${host}${checksumPath}`;
  onProgress?.(`Fetching checksum from ${host}...`);
  const raw = await downloadText(checksumUrl, timeoutMs);
  const checksum = JSON.parse(raw) as Record<string, unknown>;

  if (
    typeof checksum.sha256 !== "string" ||
    typeof checksum.size !== "number" ||
    typeof checksum.target !== "string"
  ) {
    throw new Error("Invalid checksum.json: missing sha256, size, or target");
  }

  if (checksum.target !== platformDir) {
    throw new Error(`Target mismatch: expected ${platformDir}, got ${checksum.target}`);
  }

  return { sha256: checksum.sha256, size: checksum.size, target: checksum.target };
}

async function downloadAndVerify(
  host: string,
  protocol: string,
  binaryPath: string,
  tmpPath: string,
  checksum: ValidatedChecksum,
  timeoutMs: number,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const binaryUrl = `${protocol}://${host}${binaryPath}`;
  onProgress?.(`Downloading binary from ${host}...`);
  await download(binaryUrl, tmpPath, timeoutMs);

  const actual = hashFile(tmpPath);
  if (actual.size !== checksum.size) {
    throw new Error(`Size mismatch: expected ${checksum.size}, got ${actual.size}`);
  }
  if (actual.sha256 !== checksum.sha256) {
    throw new Error(`SHA-256 mismatch: expected ${checksum.sha256}, got ${actual.sha256}`);
  }
}

function atomicReplace(tmpPath: string, resolvedDest: string): void {
  if (platform() === "win32") {
    try { unlinkSync(resolvedDest); } catch { /* ignore ENOENT */ }
  }
  renameSync(tmpPath, resolvedDest);
  if (platform() !== "win32") {
    chmodSync(resolvedDest, 0o755);
  }
}

// ---------------------------------------------------------------------------

function installPreChecks(destPath: string | undefined, sources: CdnSource[]): InstallResult | null {
  if (!destPath && process.env.OKX_AUTH_BIN) {
    return { status: "up-to-date", source: "(env override)" };
  }
  if (!getPlatformDir()) {
    return { status: "failed", error: "Unsupported platform" };
  }
  if (sources.length === 0) {
    return { status: "failed", error: "No CDN sources available" };
  }
  return null;
}

function isLocalUpToDate(
  localHash: { size: number; sha256: string } | null,
  checksum: ValidatedChecksum,
): boolean {
  return localHash !== null && localHash.size === checksum.size && localHash.sha256 === checksum.sha256;
}

/**
 * Download and install the okx-auth binary.
 * Verifies checksum and performs atomic replacement.
 */
export async function installAuthBinary(
  destPath?: string,
  sources: CdnSource[] = CDN_SOURCES,
  onProgress?: (msg: string) => void,
): Promise<InstallResult> {
  const earlyResult = installPreChecks(destPath, sources);
  if (earlyResult) return earlyResult;

  const platformDir = getPlatformDir()!;
  const binaryName = getAuthBinaryName();
  const resolvedDest = destPath ?? join(homedir(), ".okx", "bin", binaryName);
  const tmpPath = resolvedDest + ".tmp";

  mkdirSync(dirname(resolvedDest), { recursive: true });

  const localHash = existsSync(resolvedDest) ? hashFile(resolvedDest) : null;
  const checksumPath = `${AUTH_CDN_PATH_PREFIX}/${platformDir}/checksum.json`;
  const binaryPath = `${AUTH_CDN_PATH_PREFIX}/${platformDir}/${binaryName}`;
  const errors: string[] = [];

  for (const { host, protocol } of sources) {
    try {
      const checksum = await fetchAndValidateChecksum(
        host, protocol, checksumPath, platformDir, DOWNLOAD_TIMEOUT_MS, onProgress,
      );

      if (isLocalUpToDate(localHash, checksum)) {
        onProgress?.("Already up to date (checksum match)");
        return { status: "up-to-date", source: host };
      }

      await downloadAndVerify(host, protocol, binaryPath, tmpPath, checksum, DOWNLOAD_TIMEOUT_MS, onProgress);
      atomicReplace(tmpPath, resolvedDest);
      onProgress?.(`Downloaded and verified from ${host}`);
      return { status: "installed", source: host };
    } catch (err) {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${host}: ${msg}`);
      onProgress?.(`${host} failed: ${msg}`);
    }
  }

  return { status: "failed", error: `All CDN sources failed:\n${errors.join("\n")}` };
}

/**
 * Remove the okx-auth binary from disk.
 */
export function removeAuthBinary(binaryPath?: string): RemoveResult {
  const resolvedPath = binaryPath ?? getAuthBinaryPath();
  try {
    unlinkSync(resolvedPath);
    return { status: "removed" };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "not-found" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to remove ${resolvedPath}: ${msg}`);
  }
}
