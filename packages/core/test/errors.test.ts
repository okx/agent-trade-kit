import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ConfigError,
  ValidationError,
  RateLimitError,
  AuthenticationError,
  OkxApiError,
  NetworkError,
  OkxMcpError,
  toToolErrorPayload,
} from "../src/utils/errors.js";

describe("Error classes", () => {
  it("ConfigError has correct type", () => {
    const err = new ConfigError("missing key");
    assert.equal(err.type, "ConfigError");
    assert.equal(err.message, "missing key");
    assert.ok(err instanceof OkxMcpError);
    assert.ok(err instanceof Error);
  });

  it("ValidationError carries suggestion", () => {
    const err = new ValidationError("bad param", "use a number");
    assert.equal(err.type, "ValidationError");
    assert.equal(err.suggestion, "use a number");
  });

  it("RateLimitError carries endpoint", () => {
    const err = new RateLimitError("too fast", "slow down", "/api/v5/trade/order");
    assert.equal(err.type, "RateLimitError");
    assert.equal(err.endpoint, "/api/v5/trade/order");
  });

  it("AuthenticationError has correct type", () => {
    const err = new AuthenticationError("invalid signature");
    assert.equal(err.type, "AuthenticationError");
  });

  it("OkxApiError carries code", () => {
    const err = new OkxApiError("order failed", { code: "51008", endpoint: "POST /api/v5/trade/order" });
    assert.equal(err.type, "OkxApiError");
    assert.equal(err.code, "51008");
    assert.equal(err.endpoint, "POST /api/v5/trade/order");
  });

  it("OkxApiError carries traceId", () => {
    const err = new OkxApiError("order failed", { traceId: "abc123def456" });
    assert.equal(err.traceId, "abc123def456");
  });

  it("AuthenticationError carries traceId", () => {
    const err = new AuthenticationError("invalid key", undefined, undefined, "trace-xyz");
    assert.equal(err.traceId, "trace-xyz");
  });

  it("NetworkError sets suggestion automatically", () => {
    const err = new NetworkError("connection refused", "/api/v5/market/ticker");
    assert.equal(err.type, "NetworkError");
    assert.ok(err.suggestion?.includes("network"));
    assert.equal(err.endpoint, "/api/v5/market/ticker");
  });
});

describe("toToolErrorPayload", () => {
  it("serializes OkxMcpError subclass correctly", () => {
    const err = new OkxApiError("rate exceeded", { code: "50011", endpoint: "GET /api/v5/market/ticker" });
    const payload = toToolErrorPayload(err);
    assert.equal(payload.error, true);
    assert.equal(payload.type, "OkxApiError");
    assert.equal(payload.code, "50011");
    assert.equal(payload.message, "rate exceeded");
    assert.equal(payload.endpoint, "GET /api/v5/market/ticker");
    assert.match(payload.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("serializes traceId when present", () => {
    const err = new OkxApiError("order failed", { traceId: "abc123def456" });
    const payload = toToolErrorPayload(err);
    assert.equal(payload.traceId, "abc123def456");
  });

  it("omits traceId when not set", () => {
    const err = new OkxApiError("order failed");
    const payload = toToolErrorPayload(err);
    assert.equal(payload.traceId, undefined);
    // traceId should not appear in JSON when undefined
    const json = JSON.stringify(payload);
    assert.ok(!json.includes("traceId"));
  });

  it("uses fallbackEndpoint when error has none", () => {
    const err = new ConfigError("no key");
    const payload = toToolErrorPayload(err, "GET /fallback");
    assert.equal(payload.endpoint, "GET /fallback");
  });

  it("error's own endpoint takes precedence over fallback", () => {
    const err = new OkxApiError("err", { endpoint: "POST /own" });
    const payload = toToolErrorPayload(err, "GET /fallback");
    assert.equal(payload.endpoint, "POST /own");
  });

  it("serializes unknown Error as InternalError", () => {
    const err = new Error("unexpected crash");
    const payload = toToolErrorPayload(err);
    assert.equal(payload.error, true);
    assert.equal(payload.type, "InternalError");
    assert.equal(payload.message, "unexpected crash");
    assert.ok(payload.suggestion?.includes("server error"));
  });

  it("serializes non-Error as InternalError", () => {
    const payload = toToolErrorPayload("just a string");
    assert.equal(payload.type, "InternalError");
    assert.equal(payload.message, "just a string");
  });

  it("timestamp is close to now", () => {
    const before = Date.now();
    const payload = toToolErrorPayload(new ConfigError("x"));
    const after = Date.now();
    const ts = new Date(payload.timestamp).getTime();
    assert.ok(ts >= before && ts <= after);
  });
});
