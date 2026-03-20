import { ProxyAgent } from "undici";
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

export class OkxRestClient {
  private readonly config: OkxConfig;
  private readonly rateLimiter: RateLimiter;
  private readonly dispatcher?: ProxyAgent;

  public constructor(config: OkxConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(30_000, config.verbose);
    if (config.proxyUrl) {
      this.dispatcher = new ProxyAgent(config.proxyUrl);
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

  private async request<TData = unknown>(
    reqConfig: RequestConfig,
  ): Promise<RequestResult<TData>> {
    const queryString = buildQueryString(reqConfig.query);
    const requestPath = queryString.length > 0 ? `${reqConfig.path}?${queryString}` : reqConfig.path;
    const url = `${this.config.baseUrl}${requestPath}`;
    const bodyJson = reqConfig.body ? JSON.stringify(reqConfig.body) : "";
    const timestamp = getNow();

    this.logRequest(reqConfig.method, url, reqConfig.auth);

    if (reqConfig.rateLimit) {
      await this.rateLimiter.consume(reqConfig.rateLimit);
    }

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
      }
      response = await fetch(url, fetchOptions as RequestInit);
    } catch (error) {
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
