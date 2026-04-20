import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CACHE_FILE = join(homedir(), ".okx", "update-check.json");
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PackageCache {
  latestVersion: string;
  checkedAt: number;
}

type UpdateCache = Record<string, PackageCache>;

function readCache(): UpdateCache {
  try {
    if (existsSync(CACHE_FILE)) {
      return JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as UpdateCache;
    }
  } catch {
    // ignore corrupt cache
  }
  return {};
}

function writeCache(cache: UpdateCache): void {
  try {
    mkdirSync(join(homedir(), ".okx"), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch {
    // ignore write failures
  }
}

export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10));
  const [cMaj, cMin, cPat] = parse(current);
  const [lMaj, lMin, lPat] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

export async function fetchDistTags(packageName: string): Promise<Record<string, string> | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { "dist-tags"?: Record<string, string> };
    return data["dist-tags"] ?? null;
  } catch {
    return null;
  }
}

export async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { version: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

function refreshCacheInBackground(packageName: string): void {
  fetchLatestVersion(packageName)
    .then((latest) => {
      if (!latest) return;
      const cache = readCache();
      cache[packageName] = { latestVersion: latest, checkedAt: Date.now() };
      writeCache(cache);
    })
    .catch(() => {
      // ignore
    });
}

/**
 * Check if an update is available and print a notice to stderr.
 * Uses a local cache (~/.okx/update-check.json) so network calls happen
 * at most once per 24 hours, in the background without blocking startup.
 */
export function checkForUpdates(packageName: string, currentVersion: string): void {
  const cache = readCache();
  const entry = cache[packageName];

  if (entry && isNewerVersion(currentVersion, entry.latestVersion)) {
    process.stderr.write(
      `\nUpdate available for ${packageName}: ${currentVersion} → ${entry.latestVersion}\n` +
        `Run: npm install -g ${packageName}\n\n`,
    );
  }

  if (!entry || Date.now() - entry.checkedAt > CHECK_INTERVAL_MS) {
    refreshCacheInBackground(packageName);
  }
}
