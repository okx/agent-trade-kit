import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CACHE_FILE = join(homedir(), ".okx", "update-check.json");
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NEGATIVE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";
// AbortSignal.timeout uses setTimeout().unref() internally in Node.js, so it
// doesn't keep the event loop alive by itself. Max hang time is 3 s on slow
// or unreachable hosts (until the socket is aborted and closed).
const FETCH_TIMEOUT_MS = 3000;

interface PackageCache {
  latestVersion: string | null;
  checkedAt: number;
  failed?: boolean;
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

/**
 * Resolve the npm registry URL for update checks.
 *
 * Precedence (highest wins):
 *   1. npm_config_registry env var
 *   2. registry= key in .npmrc, walking cwd -> home -> /etc/npmrc
 *   3. DEFAULT_REGISTRY fallback
 */
export function resolveNpmRegistry(): string {
  const envRegistry = process.env.npm_config_registry;
  if (envRegistry) {
    return envRegistry.endsWith("/") ? envRegistry : `${envRegistry}/`;
  }

  for (const filePath of buildNpmrcCandidates()) {
    const registry = readNpmrcRegistry(filePath);
    if (registry) {
      return registry.endsWith("/") ? registry : `${registry}/`;
    }
  }

  return DEFAULT_REGISTRY;
}

export function buildNpmrcCandidates(): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  const add = (p: string): void => {
    if (!seen.has(p)) {
      seen.add(p);
      paths.push(p);
    }
  };

  let dir = process.cwd();
  const root = dir.startsWith("/") ? "/" : dir.slice(0, 3);
  while (true) {
    add(join(dir, ".npmrc"));
    if (dir === root) break;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  add(join(homedir(), ".npmrc"));
  if (process.platform !== "win32") {
    add("/etc/npmrc");
  }

  return paths;
}

function readNpmrcRegistry(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    const lines = readFileSync(filePath, "utf-8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eqIdx = trimmed.indexOf("=");
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key === "registry" && value) return value;
    }
  } catch {
    // ignore unreadable files
  }
  return null;
}

/**
 * Fetch a JSON resource from the npm registry.
 *
 * Uses AbortSignal.timeout which internally creates an unref'd timer, so the
 * pending fetch never keeps the Node.js event loop alive beyond FETCH_TIMEOUT_MS.
 * On fast-failing networks (DNS error, ICMP unreachable) the socket closes
 * immediately and the process can exit without waiting for the timeout.
 */
async function fetchFromRegistry(packageName: string, suffix = ""): Promise<Response | null> {
  const registry = resolveNpmRegistry();
  const url = `${registry}${encodeURIComponent(packageName)}${suffix}`;
  try {
    return await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch {
    return null;
  }
}

export function isNewerVersion(current: string, latest: string | null): boolean {
  if (!latest) return false;
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
    const res = await fetchFromRegistry(packageName);
    if (!res || !res.ok) return null;
    const data = (await res.json()) as { "dist-tags"?: Record<string, string> };
    return data["dist-tags"] ?? null;
  } catch {
    return null;
  }
}

export async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const res = await fetchFromRegistry(packageName, "/latest");
    if (!res || !res.ok) return null;
    const data = (await res.json()) as { version: string };
    return data.version ?? null;
  } catch {
    return null;
  }
}

function refreshCacheInBackground(packageName: string): void {
  fetchLatestVersion(packageName)
    .then((latest) => {
      const cache = readCache();
      if (latest) {
        cache[packageName] = { latestVersion: latest, checkedAt: Date.now() };
      } else {
        cache[packageName] = { latestVersion: null, checkedAt: Date.now(), failed: true };
      }
      writeCache(cache);
    })
    .catch(() => {
      // ignore
    });
}

/**
 * Check if an update is available and print a notice to stderr.
 * Uses a local cache (~/.okx/update-check.json) so network calls happen at
 * most once per 24 h (positive) or 1 h (negative-cache), in the background
 * without blocking startup.
 *
 * Set OKX_UPDATE_CHECK=false to disable entirely.
 */
export function checkForUpdates(packageName: string, currentVersion: string): void {
  // B0: kill switch - exact string "false" only
  if (process.env.OKX_UPDATE_CHECK === "false") return;

  const cache = readCache();
  const entry = cache[packageName];

  if (entry && entry.latestVersion && isNewerVersion(currentVersion, entry.latestVersion)) {
    process.stderr.write(
      `\nUpdate available for ${packageName}: ${currentVersion} -> ${entry.latestVersion}\n` +
        `Run: npm install -g ${packageName}\n\n`,
    );
  }

  // B1.5: use shorter 1 h TTL for negative-cache entries
  const ttl = entry?.failed ? NEGATIVE_CHECK_INTERVAL_MS : CHECK_INTERVAL_MS;
  if (!entry || Date.now() - entry.checkedAt > ttl) {
    refreshCacheInBackground(packageName);
  }
}
