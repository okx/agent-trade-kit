import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { DohCacheEntry, DohCacheFile } from "./types.js";

/** Default cache file path (overridable via OKX_DOH_CACHE_PATH for testing). */
export function getDefaultCachePath(): string {
  return process.env.OKX_DOH_CACHE_PATH || join(homedir(), ".okx", "doh-cache.json");
}

/**
 * Read the cache entry for a specific hostname.
 * Returns null on any error (missing, corrupted, key absent).
 */
export function readCache(
  hostname: string,
  cachePath: string = getDefaultCachePath(),
): DohCacheEntry | null {
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const file = JSON.parse(raw) as DohCacheFile;
    return file[hostname] ?? null;
  } catch {
    return null;
  }
}

/**
 * Write a cache entry for a specific hostname.
 * Merges with existing entries for other hostnames.
 * Writes atomically (write to .tmp then rename).
 */
export function writeCache(
  hostname: string,
  entry: DohCacheEntry,
  cachePath: string = getDefaultCachePath(),
): void {
  try {
    const dir = dirname(cachePath);
    mkdirSync(dir, { recursive: true });

    let file: DohCacheFile = {};
    try {
      file = JSON.parse(readFileSync(cachePath, "utf-8")) as DohCacheFile;
    } catch {
      // File missing or corrupted — start fresh
    }

    file[hostname] = entry;
    const tmpPath = `${cachePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(file));
    renameSync(tmpPath, cachePath);
  } catch {
    // Best-effort — do not crash
  }
}

/**
 * Delete the cache file. Does not throw.
 */
export function invalidateCache(
  cachePath: string = getDefaultCachePath(),
): void {
  try {
    unlinkSync(cachePath);
  } catch {
    // File may not exist — ignore
  }
}
