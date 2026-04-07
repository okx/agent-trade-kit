import { execDohBinary } from "./binary.js";
import { readCache, writeCache } from "./cache.js";
import type { DohNode, FailedNode } from "./types.js";

/** Failed nodes older than this are automatically removed (ms). */
const FAILED_NODE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface ResolveResult {
  /** "proxy" | "direct" | null (binary missing/failed, fallback to direct) */
  mode: "proxy" | "direct" | null;
  /** The proxy node, if mode=proxy */
  node: DohNode | null;
}

/**
 * Classify a binary result into mode + write cache.
 * Shared by resolveDoh and reResolveDoh to avoid duplication.
 */
function classifyAndCache(
  node: DohNode | null,
  hostname: string,
  failedNodes: FailedNode[],
): ResolveResult {
  if (!node) {
    if (failedNodes.length > 0) {
      // Had failed nodes → binary couldn't find an alternative → fall back
      writeCache(hostname, {
        mode: "direct", node: null, failedNodes, updatedAt: Date.now(),
      });
    }
    return { mode: null, node: null };
  }

  if (node.ip === hostname || node.host === hostname) {
    writeCache(hostname, {
      mode: "direct", node: null, failedNodes, updatedAt: Date.now(),
    });
    return { mode: "direct", node: null };
  }

  writeCache(hostname, {
    mode: "proxy", node, failedNodes, updatedAt: Date.now(),
  });
  return { mode: "proxy", node };
}

/**
 * Filter out failed nodes older than FAILED_NODE_TTL_MS.
 */
function getActiveFailedNodes(nodes: FailedNode[] | undefined): FailedNode[] {
  if (!nodes || nodes.length === 0) return [];
  const now = Date.now();
  return nodes.filter((n) => now - n.failedAt < FAILED_NODE_TTL_MS);
}

/**
 * Resolve DoH with cache-first strategy.
 *
 * 1. Read file cache → hit → return cached mode/node
 * 2. Cache miss → call binary → write cache → return
 * 3. Binary missing/fail → return null (caller falls back to direct)
 *
 * @param hostname - The target hostname (e.g. "www.okx.com")
 */
export async function resolveDoh(hostname: string): Promise<ResolveResult> {
  const entry = readCache(hostname);
  if (entry) {
    if (entry.mode === "direct") {
      return { mode: "direct", node: null };
    }
    if (entry.mode === "proxy" && entry.node) {
      return { mode: "proxy", node: entry.node };
    }
  }

  // No cache → let caller try direct first.
  // If direct fails, handleDohNetworkFailure() will call the binary.
  return { mode: null, node: null };
}

/**
 * Re-resolve after a proxy node failure.
 * Calls binary with --exclude to skip the bad node, updates cache.
 *
 * @param hostname - The target hostname
 * @param failedIp - The IP that just failed
 */
export async function reResolveDoh(
  hostname: string,
  failedIp: string,
  userAgent?: string,
): Promise<ResolveResult> {
  const entry = readCache(hostname);
  const active = getActiveFailedNodes(entry?.failedNodes);

  // Append the newly failed IP (deduplicated)
  const now = Date.now();
  const failedNodes: FailedNode[] = failedIp
    ? active.some((n) => n.ip === failedIp)
      ? active
      : [...active, { ip: failedIp, failedAt: now }]
    : active;

  const excludeIps = failedNodes.map((n) => n.ip);
  const node = await execDohBinary(hostname, excludeIps, userAgent);
  return classifyAndCache(node, hostname, failedNodes);
}
