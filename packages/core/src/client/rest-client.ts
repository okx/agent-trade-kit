import { Agent, ProxyAgent } from "undici";
import { unlink } from "node:fs/promises";
import { resolveDoh } from "../doh/resolver.js";
import { getDohCachePath } from "../doh/binary.js";
import type { DohNode } from "../doh/types.js";
import { getNow, signOkxPayload } from "../utils/signature.js";
import {
  AuthenticationError,
  ConfigError,
  NetworkError,
  OkxApiError,
  RateLimitError,
} from "../utils/errors.js";

type CodeBehavior =
  | { retry: true; suggestion: string }
  | { retry: false; suggestion: string };

const OKX_CODE_BEHAVIORS: Record<string, CodeBehavior> = {
  // Rate limit → throw RateLimitError
  "50011": { retry: true,  suggestion: "Rate limited. Back off and retry after a delay." },
  "50061": { retry: true,  suggestion: "Too many connections. Reduce request frequency and retry." },

  // Server temporarily unavailable → retryable
  "50001": { retry: true,  suggestion: "OKX system upgrade in progress. Retry in a few minutes." },
  "50004": { retry: true,  suggestion: "Endpoint temporarily unavailable. Retry later." },
  "50013": { retry: true,  suggestion: "System busy. Retry after 1-2 seconds." },
  "50026": { retry: true,  suggestion: "Order book system upgrading. Retry in a few minutes." },

  // Region / compliance restriction → do not retry
  "51155": { retry: false, suggestion: "Feature unavailable in your region (site: {site}). Verify your site setting matches your account registration region. Available sites: global, eea, us. Do not retry." },
  "51734": { retry: false, suggestion: "Feature not supported for your KYC country (site: {site}). Verify your site setting matches your account registration region. Available sites: global, eea, us. Do not retry." },

  // Account issues → do not retry
  "50007": { retry: false, suggestion: "Account suspended. Contact OKX support. Do not retry." },
  "50009": { retry: false, suggestion: "Account blocked by risk control. Contact OKX support. Do not retry." },
  "51009": { retry: false, suggestion: "Account mode not supported for this operation. Check account settings." },

  // API key permission / expiry → do not retry
  "50100": { retry: false, suggestion: "API key lacks required permissions. Update API key permissions." },
  "50110": { retry: false, suggestion: "API key expired. Generate a new API key." },

  // Insufficient funds / margin → do not retry
  "51008": { retry: false, suggestion: "Insufficient balance in trading account. Check funding account via account_get_asset_balance — funds may be there. Use account_transfer (from=18, to=6) to move funds to trading account, then retry." },
  "51119": { retry: false, suggestion: "Insufficient margin. Add margin or check funding account (account_get_asset_balance). Transfer via account_transfer (from=18, to=6) if needed." },
  "51127": { retry: false, suggestion: "Insufficient available margin. Reduce position, add margin, or transfer from funding account (account_transfer from=18 to=6)." },

  // Instrument unavailable → do not retry
  "51021": { retry: false, suggestion: "Instrument does not exist. Check instId." },
  "51022": { retry: false, suggestion: "Instrument not available for trading." },
  "51027": { retry: false, suggestion: "Contract has expired." },
};
import { RateLimiter } from "../utils/rate-limiter.js";
import type { OkxConfig } from "../config.js";
import type {
  BinaryRequestOptions,
  BinaryResult,
  OkxApiResponse,
  QueryParams,
  QueryValue,
  RequestConfig,
  RequestResult,
} from "./types.js";

function isDefined(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function extractTraceId(headers: Headers): string | undefined {
  return (
    headers.get("x-trace-id") ??
    headers.get("x-request-id") ??
    headers.get("traceid") ??
    undefined
  );
}

function stringifyQueryValue(value: QueryValue): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(",");
  }
  return String(value);
}

function buildQueryString(query?: QueryParams): string {
  if (!query) {
    return "";
  }

  const entries = Object.entries(query).filter(([, value]) => isDefined(value));
  if (entries.length === 0) {
    return "";
  }

  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    params.set(key, stringifyQueryValue(value));
  }
  return params.toString();
}

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return `${key.slice(0, 3)}***${key.slice(-3)}`;
}

function vlog(message: string): void {
  process.stderr.write(`[verbose] ${message}\n`);
}

export type DohResolver = (domain: string) => Promise<DohNode | null>;

export class OkxRestClient {
  private readonly config: OkxConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly dispatcher?: ProxyAgent;

  // DoH proxy state (lazy-resolved on first request)
  private readonly dohResolverFn: DohResolver | null;
  private dohResolved = false;
  private dohNode: DohNode | null = null;
  private dohAgent: Agent | null = null;
  private dohBaseUrl: string | null = null;

  /**
   * @param config - OKX API client configuration
   * @param options - Optional overrides (e.g. custom DoH resolver for testing).
   *                  Pass `{ resolveDoh: null }` to disable DoH entirely.
   */
  public constructor(
    config: OkxConfig,
    options?: { resolveDoh?: DohResolver | null },
  ) {
    this.config = config;
    this.rateLimiter = new RateLimiter(30_000, config.verbose);
    if (config.proxyUrl) {
      this.dispatcher = new ProxyAgent(config.proxyUrl);
    }
    this.dohResolverFn = options?.resolveDoh !== undefined
      ? options.resolveDoh
      : resolveDoh;
  }

  /**
   * Lazily resolve the DoH proxy node on the first request.
   * Skipped entirely when the user has configured proxy_url or DoH is disabled.
   * On failure, silently falls back to direct connection.
   */
  private async ensureDoh(): Promise<void> {
    if (this.dohResolved || this.dispatcher || !this.dohResolverFn) return;
    this.dohResolved = true;
    try {
      const { hostname, protocol } = new URL(this.config.baseUrl);
      const node = await this.dohResolverFn(hostname);
      if (!node) return;

      // If returned ip matches the original hostname, the user is overseas —
      // direct connection is fastest, skip DoH proxy.
      if (node.ip === hostname) {
        if (this.config.verbose) {
          vlog(`DoH: resolved ip matches hostname (${hostname}), using direct connection`);
        }
        return;
      }

      this.dohNode = node;
      this.dohBaseUrl = `${protocol}//${node.host}`;
      this.dohAgent = new Agent({
        connect: {
          lookup: (
            _hostname,
            options,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            callback: any,
          ) => {
            if ((options as { all?: boolean })?.all) {
              callback(null, [{ address: node.ip, family: 4 }]);
            } else {
              callback(null, node.ip, 4);
            }
          },
        },
      });
      if (this.config.verbose) {
        vlog(`DoH proxy active: ${hostname} → ${node.host} (${node.ip}), ttl=${node.ttl}s`);
      }
    } catch (err) {
      if (this.config.verbose) {
        const cause = err instanceof Error ? err.message : String(err);
        vlog(`DoH resolution failed, falling back to direct: ${cause}`);
      }
    }
  }

  /**
   * Invalidate DoH state and delete the binary's cache file so the next
   * resolution performs a fresh lookup.  Called on network-level failures
   * when a DoH proxy node was in use.
   */
  private async invalidateDoh(): Promise<void> {
    this.dohNode = null;
    this.dohAgent = null;
    this.dohBaseUrl = null;
    this.dohResolved = false;
    try {
      await unlink(getDohCachePath());
    } catch {
      // cache file may not exist — ignore
    }
  }

  private logRequest(method: string, url: string, auth: string): void {
    if (!this.config.verbose) return;
    vlog(`\u2192 ${method} ${url}`);
    const authInfo = auth === "private" && this.config.apiKey
      ? `auth=\u2713(${maskKey(this.config.apiKey)})` : `auth=${auth}`;
    vlog(`  ${authInfo} demo=${this.config.demo} timeout=${this.config.timeoutMs}ms`);
  }

  private logResponse(
    status: number, rawLen: number, elapsed: number,
    traceId: string | undefined, code?: string, msg?: string,
  ): void {
    if (!this.config.verbose) return;
    if (code && code !== "0" && code !== "1") {
      vlog(`\u2717 ${status} | code=${code} | msg=${msg ?? "-"} | ${rawLen}B | ${elapsed}ms | trace=${traceId ?? "-"}`);
    } else {
      vlog(`\u2190 ${status} | code=${code ?? "0"} | ${rawLen}B | ${elapsed}ms | trace=${traceId ?? "-"}`);
    }
  }

  public async publicGet<TData = unknown>(
    path: string,
    query?: QueryParams,
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({
      method: "GET",
      path,
      auth: "public",
      query,
      rateLimit,
    });
  }

  public async privateGet<TData = unknown>(
    path: string,
    query?: QueryParams,
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({
      method: "GET",
      path,
      auth: "private",
      query,
      rateLimit,
    });
  }

  public async publicPost<TData = unknown>(
    path: string,
    body?: RequestConfig["body"],
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({
      method: "POST",
      path,
      auth: "public",
      body,
      rateLimit,
    });
  }

  public async privatePost<TData = unknown>(
    path: string,
    body?: RequestConfig["body"],
    rateLimit?: RequestConfig["rateLimit"],
  ): Promise<RequestResult<TData>> {
    return this.request<TData>({
      method: "POST",
      path,
      auth: "private",
      body,
      rateLimit,
    });
  }

  private setAuthHeaders(
    headers: Headers, method: string, requestPath: string, bodyJson: string, timestamp: string,
  ): void {
    if (!this.config.hasAuth) {
      throw new ConfigError(
        "Private endpoint requires API credentials.",
        "Configure OKX_API_KEY, OKX_SECRET_KEY and OKX_PASSPHRASE.",
      );
    }

    if (!this.config.apiKey || !this.config.secretKey || !this.config.passphrase) {
      throw new ConfigError(
        "Invalid private API credentials state.",
        "Ensure all OKX credentials are set.",
      );
    }

    // OKX signature: timestamp + METHOD + requestPath + body
    const payload = `${timestamp}${method.toUpperCase()}${requestPath}${bodyJson}`;
    const signature = signOkxPayload(payload, this.config.secretKey);
    headers.set("OK-ACCESS-KEY", this.config.apiKey);
    headers.set("OK-ACCESS-SIGN", signature);
    headers.set("OK-ACCESS-PASSPHRASE", this.config.passphrase);
    headers.set("OK-ACCESS-TIMESTAMP", timestamp);
  }

  private throwOkxError(
    code: string, msg: string | undefined, reqConfig: RequestConfig, traceId: string | undefined,
  ): never {
    const message = msg || "OKX API request failed.";
    const endpoint = `${reqConfig.method} ${reqConfig.path}`;

    if (code === "50111" || code === "50112" || code === "50113") {
      throw new AuthenticationError(
        message,
        "Check API key, secret, passphrase and permissions.",
        endpoint,
        traceId,
      );
    }

    const behavior = OKX_CODE_BEHAVIORS[code];
    const suggestion = behavior?.suggestion?.replace("{site}", this.config.site);

    if (code === "50011" || code === "50061") {
      throw new RateLimitError(message, suggestion, endpoint, traceId);
    }

    throw new OkxApiError(message, {
      code,
      endpoint,
      suggestion,
      traceId,
    });
  }

  private processResponse<TData>(
    rawText: string,
    response: Response,
    elapsed: number,
    traceId: string | undefined,
    reqConfig: RequestConfig,
    requestPath: string,
  ): RequestResult<TData> {
    let parsed: OkxApiResponse<TData>;
    try {
      parsed = (rawText ? JSON.parse(rawText) : {}) as OkxApiResponse<TData>;
    } catch (error) {
      this.logResponse(response.status, rawText.length, elapsed, traceId, "non-JSON");
      if (!response.ok) {
        const messagePreview = rawText.slice(0, 160).replace(/\s+/g, " ").trim();
        throw new OkxApiError(
          `HTTP ${response.status} from OKX: ${messagePreview || "Non-JSON response body"}`,
          {
            code: String(response.status),
            endpoint: `${reqConfig.method} ${reqConfig.path}`,
            suggestion: "Verify endpoint path and request parameters.",
            traceId,
          },
        );
      }
      throw new NetworkError(
        `OKX returned non-JSON response for ${reqConfig.method} ${requestPath}.`,
        `${reqConfig.method} ${requestPath}`,
        error,
      );
    }

    if (!response.ok) {
      this.logResponse(response.status, rawText.length, elapsed, traceId, parsed.code ?? "-", parsed.msg);
      throw new OkxApiError(
        `HTTP ${response.status} from OKX: ${parsed.msg ?? "Unknown error"}`,
        {
          code: String(response.status),
          endpoint: `${reqConfig.method} ${reqConfig.path}`,
          suggestion: "Retry later or verify endpoint parameters.",
          traceId,
        },
      );
    }

    const responseCode = parsed.code;
    this.logResponse(response.status, rawText.length, elapsed, traceId, responseCode, parsed.msg);

    if (responseCode && responseCode !== "0" && responseCode !== "1") {
      this.throwOkxError(responseCode, parsed.msg, reqConfig, traceId);
    }

    return {
      endpoint: `${reqConfig.method} ${reqConfig.path}`,
      requestTime: new Date().toISOString(),
      data: (parsed.data ?? null) as TData,
      raw: parsed,
    };
  }

  // ---------------------------------------------------------------------------
  // Binary (non-JSON) download — reuses auth, proxy, rate-limit, verbose
  // ---------------------------------------------------------------------------

  private static readonly DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

  /**
   * Try to parse a text body as OKX JSON error and throw the appropriate error.
   * Re-throws OkxApiError / AuthenticationError / RateLimitError if matched.
   * Returns the parsed message string (or fallback) if no specific error was thrown.
   */
  private tryThrowJsonError(text: string, path: string, traceId: string | undefined): string {
    try {
      const parsed = JSON.parse(text) as { code?: string; msg?: string };
      if (parsed.code && parsed.code !== "0") {
        this.throwOkxError(parsed.code, parsed.msg, { method: "POST", path, auth: "private" } as RequestConfig, traceId);
      }
      return parsed.msg ?? "";
    } catch (e) {
      if (e instanceof OkxApiError || e instanceof AuthenticationError || e instanceof RateLimitError) throw e;
      return "";
    }
  }

  /**
   * Send a signed POST request and return the raw binary response.
   * Inherits all client capabilities: auth, proxy, rate-limit, verbose, user-agent.
   * Security: validates Content-Type and enforces maxBytes limit.
   */
  public async privatePostBinary(
    path: string,
    body?: Record<string, unknown>,
    opts?: BinaryRequestOptions,
  ): Promise<BinaryResult> {
    await this.ensureDoh();

    const maxBytes = opts?.maxBytes ?? OkxRestClient.DEFAULT_MAX_BYTES;
    const expectedCT = opts?.expectedContentType ?? "application/octet-stream";
    const bodyJson = body ? JSON.stringify(body) : "";
    const endpoint = `POST ${path}`;
    const baseUrl = this.dohNode ? this.dohBaseUrl! : this.config.baseUrl;

    this.logRequest("POST", `${baseUrl}${path}`, "private");

    const reqConfig = { method: "POST", path, auth: "private" } as RequestConfig;
    const headers = this.buildHeaders(reqConfig, path, bodyJson, getNow());
    if (this.dohNode) {
      headers.set("User-Agent", "OKX/2.7.2");
    }

    const t0 = Date.now();
    const response = await this.fetchBinary(path, endpoint, headers, bodyJson, t0);
    const elapsed = Date.now() - t0;
    const traceId = extractTraceId(response.headers);

    if (!response.ok) {
      const text = await response.text();
      this.logResponse(response.status, text.length, elapsed, traceId, String(response.status));
      const msg = this.tryThrowJsonError(text, path, traceId) || `HTTP ${response.status}`;
      throw new OkxApiError(msg, { code: String(response.status), endpoint, traceId });
    }

    const ct = response.headers.get("content-type") ?? "";
    if (!ct.includes(expectedCT)) {
      const text = await response.text();
      this.logResponse(response.status, text.length, elapsed, traceId, "unexpected-ct");
      this.tryThrowJsonError(text, path, traceId);
      throw new OkxApiError(`Expected binary response (${expectedCT}) but got: ${ct}`, { code: "UNEXPECTED_CONTENT_TYPE", endpoint, traceId });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new OkxApiError(`Response size ${buffer.length} bytes exceeds limit of ${maxBytes} bytes.`, { code: "RESPONSE_TOO_LARGE", endpoint, traceId });
    }

    if (this.config.verbose) {
      vlog(`\u2190 ${response.status} | binary ${buffer.length}B | ${elapsed}ms | trace=${traceId ?? "-"}`);
    }

    return { endpoint, requestTime: new Date().toISOString(), data: buffer, contentType: ct, contentLength: buffer.length, traceId };
  }

  /** Execute fetch for binary endpoint, wrapping network errors. */
  private async fetchBinary(path: string, endpoint: string, headers: Headers, bodyJson: string, t0: number): Promise<Response> {
    try {
      const baseUrl = this.dohNode ? this.dohBaseUrl! : this.config.baseUrl;
      const fetchOptions: Record<string, unknown> = {
        method: "POST", headers, body: bodyJson || undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      };
      if (this.dispatcher) {
        fetchOptions.dispatcher = this.dispatcher;
      } else if (this.dohAgent) {
        fetchOptions.dispatcher = this.dohAgent;
      }
      return await fetch(`${baseUrl}${path}`, fetchOptions as RequestInit);
    } catch (error) {
      if (this.config.verbose) {
        vlog(`\u2717 NetworkError after ${Date.now() - t0}ms: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw new NetworkError(`Failed to call OKX endpoint ${endpoint}.`, endpoint, error);
    }
  }

  // ---------------------------------------------------------------------------
  // Header building
  // ---------------------------------------------------------------------------

  private buildHeaders(reqConfig: RequestConfig, requestPath: string, bodyJson: string, timestamp: string): Headers {
    const headers = new Headers({
      "Content-Type": "application/json",
      Accept: "application/json",
    });

    if (this.config.userAgent) {
      headers.set("User-Agent", this.config.userAgent);
    }

    if (reqConfig.auth === "private") {
      this.setAuthHeaders(headers, reqConfig.method, requestPath, bodyJson, timestamp);
    }

    if (this.config.demo) {
      headers.set("x-simulated-trading", "1");
    }


    return headers;
  }

  // ---------------------------------------------------------------------------
  // JSON request
  // ---------------------------------------------------------------------------

  private async request<TData = unknown>(
    reqConfig: RequestConfig,
  ): Promise<RequestResult<TData>> {
    await this.ensureDoh();

    const queryString = buildQueryString(reqConfig.query);
    const requestPath = queryString.length > 0 ? `${reqConfig.path}?${queryString}` : reqConfig.path;

    // Route: proxy_url → DoH proxy → direct
    const baseUrl = this.dohNode ? this.dohBaseUrl! : this.config.baseUrl;
    const url = `${baseUrl}${requestPath}`;
    const bodyJson = reqConfig.body ? JSON.stringify(reqConfig.body) : "";
    const timestamp = getNow();

    this.logRequest(reqConfig.method, url, reqConfig.auth);

    if (reqConfig.rateLimit) {
      await this.rateLimiter.consume(reqConfig.rateLimit);
    }

    const headers = this.buildHeaders(reqConfig, requestPath, bodyJson, timestamp);
    if (this.dohNode) {
      headers.set("User-Agent", "OKX/2.7.2");
    }

    const t0 = Date.now();
    let response: Response;
    try {
      const fetchOptions: Record<string, unknown> = {
        method: reqConfig.method,
        headers,
        body: reqConfig.method === "POST" ? bodyJson : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      };
      if (this.dispatcher) {
        fetchOptions.dispatcher = this.dispatcher;
      } else if (this.dohAgent) {
        fetchOptions.dispatcher = this.dohAgent;
      }
      response = await fetch(url, fetchOptions as RequestInit);
    } catch (error) {
      // Network-level failure while using DoH proxy → invalidate cache, retry once
      if (this.dohNode) {
        if (this.config.verbose) {
          vlog(`DoH request failed, invalidating cache and retrying: ${error instanceof Error ? error.message : String(error)}`);
        }
        await this.invalidateDoh();
        return this.request(reqConfig);
      }

      if (this.config.verbose) {
        const elapsed = Date.now() - t0;
        const cause = error instanceof Error ? error.message : String(error);
        vlog(`\u2717 NetworkError after ${elapsed}ms: ${cause}`);
      }
      throw new NetworkError(
        `Failed to call OKX endpoint ${reqConfig.method} ${requestPath}.`,
        `${reqConfig.method} ${requestPath}`,
        error,
      );
    }

    const rawText = await response.text();
    const elapsed = Date.now() - t0;
    const traceId = extractTraceId(response.headers);
    return this.processResponse<TData>(rawText, response, elapsed, traceId, reqConfig, requestPath);
  }
}
