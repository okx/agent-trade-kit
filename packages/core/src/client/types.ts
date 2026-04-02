import type { RateLimitConfig } from "../utils/rate-limiter.js";

export type HttpMethod = "GET" | "POST";
export type EndpointAuth = "public" | "private";

export type QueryValue = unknown;
export type QueryParams = Record<string, QueryValue>;
export type JsonRecord = Record<string, unknown>;

export interface OkxApiResponse<TData = unknown> {
  code: string;
  msg?: string;
  data?: TData;
  [key: string]: unknown;
}

export interface RequestConfig {
  method: HttpMethod;
  path: string;
  auth: EndpointAuth;
  query?: QueryParams;
  body?: JsonRecord | JsonRecord[];
  rateLimit?: RateLimitConfig;
  extraHeaders?: Record<string, string>;
}

export interface RequestResult<TData = unknown> {
  endpoint: string;
  requestTime: string;
  data: TData;
  raw: OkxApiResponse<TData>;
}

/** Options for binary (non-JSON) download requests. */
export interface BinaryRequestOptions {
  /** Maximum response size in bytes. Default: 50 MB. */
  maxBytes?: number;
  /** Expected Content-Type prefix. Default: "application/octet-stream". */
  expectedContentType?: string;
}

/** Result of a binary download request. */
export interface BinaryResult {
  endpoint: string;
  requestTime: string;
  data: Buffer;
  contentType: string;
  contentLength: number;
  traceId?: string;
}
