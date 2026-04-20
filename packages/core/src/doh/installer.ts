/**
 * DoH binary installer — TypeScript equivalent of scripts/postinstall-notice.js.
 *
 * Provides status, install, and remove operations for the okx-pilot binary.
 * The CDN list and checksum logic mirrors the postinstall script; if CDN sources
 * change, update both files.
 */

import {
  readFileSync,
  createWriteStream,
  mkdirSync,
  chmodSync,
  existsSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir, platform, arch } from "node:os";
import { join, dirname } from "node:path";
import { get as httpsGet } from "node:https";
import { get as httpGet } from "node:http";

import type { DohLocalStatus, CdnChecksum, CdnSource, InstallResult, RemoveResult } from "./installer-types.js";
import { getDohBinaryPath } from "./binary.js";

// ---------------------------------------------------------------------------
// Constants (mirrors postinstall-notice.js)
// ---------------------------------------------------------------------------

export const CDN_SOURCES: CdnSource[] = [
  { host: "static.jingyunyilian.com", protocol: "https" },
  { host: "static.okx.com", protocol: "https" },
  { host: "static.coinall.ltd", protocol: "https" },
];

export const CDN_PATH_PREFIX = "/upgradeapp/doh";
export const DOWNLOAD_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Platform helpers
// ---------------------------------------------------------------------------

/**
 * Return the platform directory string (e.g. "darwin-arm64"),
 * or null for unsupported platforms.
 */
export function getPlatformDir(): string | null {
  const p = platform();
  const a = arch();
  const map: Record<string, string> = {
    "darwin-arm64": "darwin-arm64",
    "darwin-x64": "darwin-x64",
    "linux-x64": "linux-x64",
    "win32-x64": "win32-x64",
  };
  return map[`${p}-${a}`] ?? null;
}

/**
 * Return the binary file name for the current platform.
 */
export function getBinaryName(): string {
  return platform() === "win32" ? "okx-pilot.exe" : "okx-pilot";
}

// ---------------------------------------------------------------------------
// File utilities
// ---------------------------------------------------------------------------

/**
 * Read a file and return its size + SHA-256 hex digest in one pass.
 */
export function hashFile(filePath: string): { size: number; sha256: string } {
  const buf = readFileSync(filePath);
  return {
    size: buf.byteLength,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return local DoH binary status synchronously (no network I/O).
 * Accepts an optional binaryPath override for testing.
 *
 * Pass `skipHash: true` for fast checks (e.g. --version output) that only
 * need existence info — avoids reading and hashing a multi-MB binary.
 */
export function getDohStatus(binaryPath?: string, opts?: { skipHash?: boolean }): DohLocalStatus {
  const resolvedPath = binaryPath ?? getDohBinaryPath();
  const platformDir = getPlatformDir();

  if (!existsSync(resolvedPath)) {
    return {
      binaryPath: resolvedPath,
      exists: false,
      platform: platformDir,
    };
  }

  if (opts?.skipHash) {
    return {
      binaryPath: resolvedPath,
      exists: true,
      platform: platformDir,
    };
  }

  const { size, sha256 } = hashFile(resolvedPath);
  return {
    binaryPath: resolvedPath,
    exists: true,
    platform: platformDir,
    fileSize: size,
    sha256,
  };
}

/**
 * Fetch the checksum.json from CDN for the current platform.
 * Returns null if all CDN sources fail or the platform is unsupported.
 * Never throws — all errors are swallowed and result in null.
 */
export async function fetchCdnChecksum(
  sources: CdnSource[] = CDN_SOURCES,
  timeoutMs: number = DOWNLOAD_TIMEOUT_MS,
): Promise<CdnChecksum | null> {
  const platformDir = getPlatformDir();
  if (!platformDir) return null;

  const checksumPath = `${CDN_PATH_PREFIX}/${platformDir}/checksum.json`;

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
      return {
        sha256: data.sha256,
        size: data.size,
        target: data.target,
        source: host,
      };
    } catch {
      // Try next source
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Install helpers (extracted to reduce cognitive complexity of installDohBinary)
// ---------------------------------------------------------------------------

interface ValidatedChecksum {
  sha256: string;
  size: number;
  target: string;
}

/**
 * Fetch checksum.json from a single CDN host and validate required fields + target platform.
 */
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
    throw new Error(
      `Target mismatch: expected ${platformDir}, got ${checksum.target as string}`,
    );
  }

  return { sha256: checksum.sha256, size: checksum.size as number, target: checksum.target as string };
}

/**
 * Download a binary to tmpPath and verify its hash against the expected checksum.
 */
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
    throw new Error(
      `Size mismatch: expected ${checksum.size}, got ${actual.size}`,
    );
  }
  if (actual.sha256 !== checksum.sha256) {
    throw new Error(
      `SHA-256 mismatch: expected ${checksum.sha256}, got ${actual.sha256}`,
    );
  }
}

/**
 * Platform-aware atomic replacement of the destination binary.
 */
function atomicReplace(tmpPath: string, resolvedDest: string): void {
  // On POSIX, rename(2) atomically replaces the destination — no pre-unlink needed.
  // On Windows, rename fails with EEXIST if the destination exists, so we must
  // unlink first. Risk: if unlink succeeds but rename fails (e.g. file lock),
  // the user loses both copies. We minimise the window by doing the unlink only
  // on Windows and immediately rethrowing any rename error to trigger cleanup.
  if (platform() === "win32") {
    try { unlinkSync(resolvedDest); } catch { /* ignore ENOENT */ }
  }
  renameSync(tmpPath, resolvedDest);

  if (platform() !== "win32") {
    chmodSync(resolvedDest, 0o755);
  }
}

// ---------------------------------------------------------------------------

/**
 * Download and install the DoH binary.
 * Verifies checksum and performs atomic replacement.
 *
 * @param destPath    Override the destination path (for testing).
 * @param sources     Override CDN sources (for testing).
 * @param onProgress  Optional progress callback.
 */
/** Pre-flight checks for installDohBinary. Returns an early InstallResult or null to continue. */
function installPreChecks(destPath: string | undefined, sources: CdnSource[]): InstallResult | null {
  if (!destPath && process.env.OKX_DOH_BINARY_PATH) {
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

/** Check if local binary matches the CDN checksum. */
function isLocalUpToDate(
  localHash: { size: number; sha256: string } | null,
  checksum: ValidatedChecksum,
): boolean {
  return localHash !== null && localHash.size === checksum.size && localHash.sha256 === checksum.sha256;
}

export async function installDohBinary(
  destPath?: string,
  sources: CdnSource[] = CDN_SOURCES,
  onProgress?: (msg: string) => void,
): Promise<InstallResult> {
  const earlyResult = installPreChecks(destPath, sources);
  if (earlyResult) return earlyResult;

  const platformDir = getPlatformDir()!;
  const binaryName = getBinaryName();
  const resolvedDest = destPath ?? join(homedir(), ".okx", "bin", binaryName);
  const tmpPath = resolvedDest + ".tmp";

  mkdirSync(dirname(resolvedDest), { recursive: true });

  const localHash = existsSync(resolvedDest) ? hashFile(resolvedDest) : null;
  const checksumPath = `${CDN_PATH_PREFIX}/${platformDir}/checksum.json`;
  const binaryPath = `${CDN_PATH_PREFIX}/${platformDir}/${binaryName}`;
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
 * Remove the DoH binary from disk.
 * Accepts an optional binaryPath override for testing.
 */
export function removeDohBinary(binaryPath?: string): RemoveResult {
  const resolvedPath = binaryPath ?? getDohBinaryPath();
  try {
    unlinkSync(resolvedPath);
    return { status: "removed" };
  } catch (err) {
    // ENOENT = file was already absent — treat as not-found, not an error.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { status: "not-found" };
    }
    // Other errors (e.g. Windows file lock) — re-throw with context.
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to remove ${resolvedPath}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP utilities (mirrors postinstall-notice.js)
// ---------------------------------------------------------------------------

function isRedirect(statusCode: number | undefined): boolean {
  return statusCode !== undefined && statusCode >= 300 && statusCode < 400;
}

/**
 * Validate a redirect and return the resolved location, or throw on error.
 */
function validateRedirect(
  res: import("node:http").IncomingMessage,
  requestUrl: string,
  redirectCount: number,
  maxRedirects: number,
): string {
  if (redirectCount > maxRedirects) {
    throw new Error(`Too many redirects (${maxRedirects})`);
  }
  const location = res.headers.location!;
  if (requestUrl.startsWith("https") && !location.startsWith("https")) {
    throw new Error("Refused HTTPS → HTTP redirect downgrade");
  }
  return location;
}

function fetchResponse(
  url: string,
  timeoutMs: number,
): Promise<import("node:http").IncomingMessage> {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const maxRedirects = 5;

    function doRequest(requestUrl: string): void {
      const reqFn = requestUrl.startsWith("https") ? httpsGet : httpGet;
      const req = reqFn(requestUrl, { timeout: timeoutMs }, (res) => {
        if (isRedirect(res.statusCode) && res.headers.location) {
          redirects++;
          try {
            const location = validateRedirect(res, requestUrl, redirects, maxRedirects);
            // Drain the redirect response body so the connection is returned to the pool.
            res.resume();
            doRequest(location);
          } catch (err) {
            reject(err);
          }
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode ?? "unknown"}`));
          return;
        }

        resolve(res);
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Download timed out"));
      });
    }

    doRequest(url);
  });
}

function download(url: string, destPath: string, timeoutMs: number): Promise<void> {
  return fetchResponse(url, timeoutMs).then(
    (res) =>
      new Promise<void>((resolve, reject) => {
        const file = createWriteStream(destPath);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", (err) => {
          try { unlinkSync(destPath); } catch { /* ignore */ }
          reject(err);
        });
      }),
  );
}

function downloadText(url: string, timeoutMs: number): Promise<string> {
  return fetchResponse(url, timeoutMs).then(
    (res) =>
      new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }),
  );
}
