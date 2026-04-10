/** A resolved DoH proxy node returned by the okx-doh-resolver binary. */
export interface DohNode {
  /** Proxy node IP address (e.g. "47.242.161.22") */
  ip: string;
  /** Proxy hostname for Host header / TLS SNI (e.g. "okexweb.qqhrss.com") */
  host: string;
  /** Cache TTL in seconds */
  ttl: number;
}

/** A failed node with expiration tracking. */
export interface FailedNode {
  ip: string;
  /** Timestamp (ms) when this node was marked as failed */
  failedAt: number;
}

/** Raw JSON output from the okx-doh-resolver binary. */
export interface DohBinaryResponse {
  code: number;
  data?: DohNode;
  cached?: boolean;
  msg?: string;
}

/** Per-domain cache entry. */
export interface DohCacheEntry {
  /** "proxy" = use node, "direct" = use www.okx.com */
  mode: "proxy" | "direct";
  /** The proxy node (only when mode=proxy) */
  node: DohNode | null;
  /** Nodes that failed and should be excluded on next binary call */
  failedNodes: FailedNode[];
  /** Timestamp (ms) when cache was written */
  updatedAt: number;
}

/**
 * Persisted cache file at ~/.okx/doh-cache.json.
 * Keyed by hostname (e.g. "www.okx.com").
 */
export type DohCacheFile = Record<string, DohCacheEntry>;
