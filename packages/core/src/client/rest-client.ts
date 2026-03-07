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
  "51008": { retry: false, suggestion: "Insufficient balance. Top up account before retrying." },
  "51119": { retry: false, suggestion: "Insufficient margin. Add margin before retrying." },
  "51127": { retry: false, suggestion: "Insufficient available margin. Reduce position or add margin." },

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

export class OkxRestClient {
  private readonly config: OkxConfig;
  private readonly rateLimiter = new RateLimiter();

  public constructor(config: OkxConfig) {
    this.config = config;
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

  private async request<TData = unknown>(
    config: RequestConfig,
  ): Promise<RequestResult<TData>> {
    const queryString = buildQueryString(config.query);
    const requestPath = queryString.length > 0 ? `${config.path}?${queryString}` : config.path;
    const url = `${this.config.baseUrl}${requestPath}`;
    const bodyJson = config.body ? JSON.stringify(config.body) : "";
    const timestamp = getNow();

    if (config.rateLimit) {
      await this.rateLimiter.consume(config.rateLimit);
    }

    const headers = new Headers({
      "Content-Type": "application/json",
      Accept: "application/json",
    });

    if (this.config.userAgent) {
      headers.set("User-Agent", this.config.userAgent);
    }

    if (config.auth === "private") {
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
      const payload = `${timestamp}${config.method.toUpperCase()}${requestPath}${bodyJson}`;
      const signature = signOkxPayload(payload, this.config.secretKey);
      headers.set("OK-ACCESS-KEY", this.config.apiKey);
      headers.set("OK-ACCESS-SIGN", signature);
      headers.set("OK-ACCESS-PASSPHRASE", this.config.passphrase);
      headers.set("OK-ACCESS-TIMESTAMP", timestamp);
    }

    if (this.config.demo) {
      headers.set("x-simulated-trading", "1");
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: config.method,
        headers,
        body: config.method === "POST" ? bodyJson : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw new NetworkError(
        `Failed to call OKX endpoint ${config.method} ${requestPath}.`,
        `${config.method} ${requestPath}`,
        error,
      );
    }

    const rawText = await response.text();
    const traceId = extractTraceId(response.headers);
    let parsed: OkxApiResponse<TData>;
    try {
      parsed = (rawText ? JSON.parse(rawText) : {}) as OkxApiResponse<TData>;
    } catch (error) {
      if (!response.ok) {
        const messagePreview = rawText.slice(0, 160).replace(/\s+/g, " ").trim();
        throw new OkxApiError(
          `HTTP ${response.status} from OKX: ${messagePreview || "Non-JSON response body"}`,
          {
            code: String(response.status),
            endpoint: `${config.method} ${config.path}`,
            suggestion: "Verify endpoint path and request parameters.",
            traceId,
          },
        );
      }
      throw new NetworkError(
        `OKX returned non-JSON response for ${config.method} ${requestPath}.`,
        `${config.method} ${requestPath}`,
        error,
      );
    }

    if (!response.ok) {
      throw new OkxApiError(
        `HTTP ${response.status} from OKX: ${parsed.msg ?? "Unknown error"}`,
        {
          code: String(response.status),
          endpoint: `${config.method} ${config.path}`,
          suggestion: "Retry later or verify endpoint parameters.",
          traceId,
        },
      );
    }

    const responseCode = parsed.code;
    if (responseCode && responseCode !== "0" && responseCode !== "1") {
      const message = parsed.msg || "OKX API request failed.";
      const endpoint = `${config.method} ${config.path}`;

      if (
        responseCode === "50111" ||
        responseCode === "50112" ||
        responseCode === "50113"
      ) {
        throw new AuthenticationError(
          message,
          "Check API key, secret, passphrase and permissions.",
          endpoint,
          traceId,
        );
      }

      const behavior = OKX_CODE_BEHAVIORS[responseCode];
      const suggestion = behavior?.suggestion?.replace("{site}", this.config.site);

      if (responseCode === "50011" || responseCode === "50061") {
        throw new RateLimitError(message, suggestion, endpoint, traceId);
      }

      throw new OkxApiError(message, {
        code: responseCode,
        endpoint,
        suggestion,
        traceId,
      });
    }

    return {
      endpoint: `${config.method} ${config.path}`,
      requestTime: new Date().toISOString(),
      data: (parsed.data ?? null) as TData,
      raw: parsed,
    };
  }
}
