import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns";
import { Agent } from "undici";
import { resolvePilot, reResolvePilot } from "./resolver.js";
import { writeCache } from "./cache.js";
import type { PilotNode } from "./types.js";

function vlog(message: string): void {
  process.stderr.write(`[verbose] ${message}\n`);
}

/** Connection parameters that rest-client needs per request. */
export interface PilotConnectionParams {
  /** Base URL to use (proxy host or original). */
  baseUrl: string;
  /** Custom undici Agent when Pilot proxy is active. */
  dispatcher?: Agent;
  /** User-Agent override when proxy is active. */
  userAgent?: string;
}

export interface PilotManagerOptions {
  /** The original base URL (e.g. "https://www.okx.com"). */
  baseUrl: string;
  /** Package-level User-Agent (e.g. "okx-trade-mcp/1.3.0"). */
  packageUserAgent?: string;
  /** Whether verbose logging is enabled. */
  verbose?: boolean;
  /** Whether a custom proxy (proxyUrl) is configured - skips Pilot entirely. */
  hasCustomProxy?: boolean;
}

/**
 * Encapsulates all Pilot proxy state and resolution logic.
 *
 * rest-client delegates to this class instead of managing Pilot state directly.
 */
export class PilotManager {
  private readonly opts: PilotManagerOptions;

  // Pilot proxy state (lazy-resolved on first request)
  private pilotResolved = false;
  private pilotRetried = false;
  private directUnverified = false; // The first direct connection has not yet been verified
  private pilotNode: PilotNode | null = null;
  private pilotAgent: Agent | null = null;
  private pilotBaseUrl: string | null = null;

  public constructor(opts: PilotManagerOptions) {
    this.opts = opts;
  }

  /**
   * Lazily resolve the Pilot proxy node on the first request.
   * Uses cache-first strategy via the resolver.
   */
  public preparePilot(): void {
    if (this.pilotResolved || this.opts.hasCustomProxy) return;
    this.pilotResolved = true;
    try {
      const { hostname, protocol } = new URL(this.opts.baseUrl);
      const result = resolvePilot(hostname);

      if (!result.mode) {
        // No cache -> try direct first. If it works, we'll cache "direct".
        this.directUnverified = true;
        if (this.opts.verbose) {
          vlog("Pilot: no cache, trying direct connection first");
        }
        return;
      }

      if (result.mode === "direct") {
        if (this.opts.verbose) {
          vlog("Pilot: mode=direct (overseas or cached), using direct connection");
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
        vlog(`Pilot resolution failed, falling back to direct: ${cause}`);
      }
    }
  }

  /** Get connection parameters for the current request. */
  public getConnectionParams(): PilotConnectionParams {
    const baseUrl = this.pilotNode ? this.pilotBaseUrl! : this.opts.baseUrl;
    const result: PilotConnectionParams = { baseUrl };
    if (this.pilotAgent) {
      result.dispatcher = this.pilotAgent;
    }
    if (this.pilotNode) {
      result.userAgent = this.pilotUserAgent;
    }
    return result;
  }

  /** Whether a Pilot proxy node is currently active. */
  public get isProxyActive(): boolean {
    return this.pilotNode !== null;
  }

  /** Whether we have already retried after network failure. */
  public get hasRetried(): boolean {
    return this.pilotRetried;
  }

  /**
   * Handle network failure: re-resolve with --exclude and retry once.
   * Returns true if retry should proceed, false if already retried.
   */
  public async handleNetworkFailure(): Promise<boolean> {
    if (this.pilotRetried) return false;
    this.pilotRetried = true;

    const failedIp = this.pilotNode?.ip ?? "";
    const { hostname, protocol } = new URL(this.opts.baseUrl);

    this.pilotNode = null;
    this.pilotAgent = null;
    this.pilotBaseUrl = null;
    if (!failedIp) this.directUnverified = false;

    if (this.opts.verbose) {
      vlog(failedIp
        ? `Pilot: proxy node ${failedIp} failed, re-resolving with --exclude`
        : "Pilot: direct connection failed, calling binary for Pilot resolution");
    }

    try {
      const result = await reResolvePilot(hostname, failedIp, this.pilotUserAgent);
      if (result.mode === "proxy" && result.node) {
        this.applyNode(result.node, protocol);
        this.pilotRetried = false; // Considering that MCP is a resident process
        return true;
      }
    } catch {
      // resolution failed - fall through to direct
    }

    if (this.opts.verbose) {
      vlog("Pilot: re-resolution failed or switched to direct, retrying with direct connection");
    }
    return true;
  }

  /**
   * After a successful HTTP response on direct connection, cache mode=direct.
   * (Even if the business response is an error, the network path is valid.)
   */
  public cacheDirectIfNeeded(): void {
    if (!this.directUnverified || this.pilotNode) return;
    this.directUnverified = false;
    const { hostname } = new URL(this.opts.baseUrl);
    writeCache(hostname, {
      mode: "direct", node: null, failedNodes: [], updatedAt: Date.now(),
    });
    if (this.opts.verbose) {
      vlog("Pilot: direct connection succeeded, cached mode=direct");
    }
  }

  /** User-Agent for Pilot proxy requests: OKX/@okx_ai/{packageName}/{version} */
  private get pilotUserAgent(): string {
    return `OKX/@okx_ai/${this.opts.packageUserAgent ?? "unknown"}`;
  }

  /**
   * Apply a Pilot node: set up the custom Agent + base URL.
   *
   * node.ip may be a real IP or a domain (CNAME like *.aliyunddos1021.com).
   * - Real IP -> use directly in lookup callback
   * - Domain  -> dns.lookup on every connection to get a fresh IP
   */
  private applyNode(node: PilotNode, protocol: string): void {
    this.pilotNode = node;
    this.pilotBaseUrl = `${protocol}//${node.host}`;
    const nodeIpIsRealIp = !!isIP(node.ip);
    this.pilotAgent = new Agent({
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
            // Domain (CNAME) -> resolve via system DNS each time
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
      vlog(`Pilot proxy active: \u2192 ${node.host} (${node.ip}), ttl=${node.ttl}s`);
    }
  }
}
