import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns";
import { Agent } from "undici";
import { resolveDoh, reResolveDoh } from "./resolver.js";
import { writeCache } from "./cache.js";
import type { DohNode } from "./types.js";

function vlog(message: string): void {
  process.stderr.write(`[verbose] ${message}\n`);
}

/** Connection parameters that rest-client needs per request. */
export interface DohConnectionParams {
  /** Base URL to use (proxy host or original). */
  baseUrl: string;
  /** Custom undici Agent when DoH proxy is active. */
  dispatcher?: Agent;
  /** User-Agent override when proxy is active. */
  userAgent?: string;
}

export interface DohManagerOptions {
  /** The original base URL (e.g. "https://www.okx.com"). */
  baseUrl: string;
  /** Package-level User-Agent (e.g. "okx-trade-mcp/1.3.0"). */
  packageUserAgent?: string;
  /** Whether verbose logging is enabled. */
  verbose?: boolean;
  /** Whether a custom proxy (proxyUrl) is configured — skips DoH entirely. */
  hasCustomProxy?: boolean;
}

/**
 * Encapsulates all DoH proxy state and resolution logic.
 *
 * rest-client delegates to this class instead of managing DoH state directly.
 */
export class DohManager {
  private readonly opts: DohManagerOptions;

  // DoH proxy state (lazy-resolved on first request)
  private dohResolved = false;
  private dohRetried = false;
  private directUnverified = false; // The first direct connection has not yet been verified
  private dohNode: DohNode | null = null;
  private dohAgent: Agent | null = null;
  private dohBaseUrl: string | null = null;

  public constructor(opts: DohManagerOptions) {
    this.opts = opts;
  }

  /**
   * Lazily resolve the DoH proxy node on the first request.
   * Uses cache-first strategy via the resolver.
   */
  public prepareDoh(): void {
    if (this.dohResolved || this.opts.hasCustomProxy) return;
    this.dohResolved = true;
    try {
      const { hostname, protocol } = new URL(this.opts.baseUrl);
      const result = resolveDoh(hostname);

      if (!result.mode) {
        // No cache → try direct first. If it works, we'll cache "direct".
        this.directUnverified = true;
        if (this.opts.verbose) {
          vlog("DoH: no cache, trying direct connection first");
        }
        return;
      }

      if (result.mode === "direct") {
        if (this.opts.verbose) {
          vlog("DoH: mode=direct (overseas or cached), using direct connection");
        }
        return;
      }

      // mode=proxy
      if (result.node) {
        this.applyNode(result.node, protocol);
      }
    } catch (err) {
      if (this.opts.verbose) {
        const cause = err instanceof Error ? err.message : String(err);
        vlog(`DoH resolution failed, falling back to direct: ${cause}`);
      }
    }
  }

  /** Get connection parameters for the current request. */
  public getConnectionParams(): DohConnectionParams {
    const baseUrl = this.dohNode ? this.dohBaseUrl! : this.opts.baseUrl;
    const result: DohConnectionParams = { baseUrl };
    if (this.dohAgent) {
      result.dispatcher = this.dohAgent;
    }
    if (this.dohNode) {
      result.userAgent = this.dohUserAgent;
    }
    return result;
  }

  /** Whether a DoH proxy node is currently active. */
  public get isProxyActive(): boolean {
    return this.dohNode !== null;
  }

  /** Whether we have already retried after network failure. */
  public get hasRetried(): boolean {
    return this.dohRetried;
  }

  /**
   * Handle network failure: re-resolve with --exclude and retry once.
   * Returns true if retry should proceed, false if already retried.
   */
  public async handleNetworkFailure(): Promise<boolean> {
    if (this.dohRetried) return false;
    this.dohRetried = true;

    const failedIp = this.dohNode?.ip ?? "";
    const { hostname, protocol } = new URL(this.opts.baseUrl);

    this.dohNode = null;
    this.dohAgent = null;
    this.dohBaseUrl = null;
    if (!failedIp) this.directUnverified = false;

    if (this.opts.verbose) {
      vlog(failedIp
        ? `DoH: proxy node ${failedIp} failed, re-resolving with --exclude`
        : "DoH: direct connection failed, calling binary for DoH resolution");
    }

    try {
      const result = await reResolveDoh(hostname, failedIp, this.dohUserAgent);
      if (result.mode === "proxy" && result.node) {
        this.applyNode(result.node, protocol);
        this.dohRetried = false; // Considering that MCP is a resident process
        return true;
      }
    } catch {
      // resolution failed — fall through to direct
    }

    if (this.opts.verbose) {
      vlog("DoH: re-resolution failed or switched to direct, retrying with direct connection");
    }
    return true;
  }

  /**
   * After a successful HTTP response on direct connection, cache mode=direct.
   * (Even if the business response is an error, the network path is valid.)
   */
  public cacheDirectIfNeeded(): void {
    if (!this.directUnverified || this.dohNode) return;
    this.directUnverified = false;
    const { hostname } = new URL(this.opts.baseUrl);
    writeCache(hostname, {
      mode: "direct", node: null, failedNodes: [], updatedAt: Date.now(),
    });
    if (this.opts.verbose) {
      vlog("DoH: direct connection succeeded, cached mode=direct");
    }
  }

  /** User-Agent for DoH proxy requests: OKX/@okx_ai/{packageName}/{version} */
  private get dohUserAgent(): string {
    return `OKX/@okx_ai/${this.opts.packageUserAgent ?? "unknown"}`;
  }

  /**
   * Apply a DoH node: set up the custom Agent + base URL.
   *
   * node.ip may be a real IP or a domain (CNAME like *.aliyunddos1021.com).
   * - Real IP → use directly in lookup callback
   * - Domain  → dns.lookup on every connection to get a fresh IP
   */
  private applyNode(node: DohNode, protocol: string): void {
    this.dohNode = node;
    this.dohBaseUrl = `${protocol}//${node.host}`;
    const nodeIpIsRealIp = !!isIP(node.ip);
    this.dohAgent = new Agent({
      connect: {
        lookup: (
          _hostname,
          options,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: any,
        ) => {
          if (nodeIpIsRealIp) {
            if ((options as { all?: boolean })?.all) {
              callback(null, [{ address: node.ip, family: 4 }]);
            } else {
              callback(null, node.ip, 4);
            }
          } else {
            // Domain (CNAME) → resolve via system DNS each time
            dnsLookup(node.ip, { family: 4 }, (err, address, family) => {
              if (err) {
                callback(err, "", 0);
              } else if ((options as { all?: boolean })?.all) {
                callback(null, [{ address, family }]);
              } else {
                callback(null, address, family);
              }
            });
          }
        },
      },
    });
    if (this.opts.verbose) {
      vlog(`DoH proxy active: \u2192 ${node.host} (${node.ip}), ttl=${node.ttl}s`);
    }
  }
}
