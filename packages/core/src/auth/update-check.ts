/**
 * okx-auth binary auto-update check.
 *
 * Ensures the local binary matches the latest CDN version before use.
 * Uses a 2-hour cache to avoid hitting CDN on every invocation.
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { getAuthStatus, fetchAuthCdnChecksum, installAuthBinary } from "./installer.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PATH = join(homedir(), ".okx", "auth-binary-check.json");
const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

interface BinaryCache {
  cdnSha256: string;
  checkedAt: number;
}

function readCache(): BinaryCache | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const data = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as Record<string, unknown>;
    if (typeof data.cdnSha256 !== "string" || typeof data.checkedAt !== "number") return null;
    return { cdnSha256: data.cdnSha256, checkedAt: data.checkedAt };
  } catch {
    return null;
  }
}

function writeCache(cdnSha256: string): void {
  try {
    mkdirSync(join(homedir(), ".okx"), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify({ cdnSha256, checkedAt: Date.now() }, null, 2), "utf-8");
  } catch {
    // ignore write failures
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure the local okx-auth binary is the latest CDN version.
 *
 * Straight-line flow with early returns:
 * 1. Skip if OKX_AUTH_BIN env is set (custom binary)
 * 2. Skip if cache says binary was verified within the last 2 hours
 * 3. Fetch CDN checksum → compare with local → auto-install if mismatch
 * 4. Any network error → proceed silently (best-effort)
 */
export async function ensureAuthBinaryLatest(
  onProgress?: (msg: string) => void,
): Promise<void> {
  if (process.env.OKX_AUTH_BIN) return;

  const cache = readCache();
  if (cache && Date.now() - cache.checkedAt < CHECK_INTERVAL_MS) return;

  try {
    const cdn = await fetchAuthCdnChecksum(undefined, 5_000);
    if (!cdn) return; // CDN unreachable — proceed with current binary

    const local = getAuthStatus();
    if (local.exists && local.sha256 === cdn.sha256) {
      writeCache(cdn.sha256);
      return;
    }

    // Stale or not installed — auto-update
    onProgress?.("Updating okx-auth binary...");
    const result = await installAuthBinary(undefined, undefined, onProgress);
    if (result.status === "installed" || result.status === "up-to-date") {
      const updated = getAuthStatus();
      if (updated.sha256) writeCache(updated.sha256);
      if (result.status === "installed") {
        onProgress?.("✓ okx-auth updated successfully");
      }
    }
  } catch {
    // Network or install error — proceed with current binary
  }
}

/**
 * Write cache entry after a successful manual install.
 */
export function updateAuthBinaryCache(sha256: string): void {
  writeCache(sha256);
}

/**
 * Clear cache after binary removal.
 */
export function clearAuthBinaryCache(): void {
  try {
    unlinkSync(CACHE_PATH);
  } catch {
    // ignore ENOENT
  }
}
