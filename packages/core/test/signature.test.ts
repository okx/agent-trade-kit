import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signOkxPayload, getNow } from "../src/utils/signature.js";

describe("signOkxPayload", () => {
  it("returns base64-encoded HMAC-SHA256", () => {
    const payload = "2024-01-01T00:00:00.000ZGET/api/v5/market/ticker?instId=BTC-USDT";
    const secret = "test-secret-key";

    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest("base64");

    assert.equal(signOkxPayload(payload, secret), expected);
  });

  it("produces different signatures for different payloads", () => {
    const secret = "my-secret";
    const sig1 = signOkxPayload("payloadA", secret);
    const sig2 = signOkxPayload("payloadB", secret);
    assert.notEqual(sig1, sig2);
  });

  it("produces different signatures for different secrets", () => {
    const payload = "same-payload";
    const sig1 = signOkxPayload(payload, "secret1");
    const sig2 = signOkxPayload(payload, "secret2");
    assert.notEqual(sig1, sig2);
  });

  it("output is valid base64", () => {
    const sig = signOkxPayload("test", "key");
    assert.match(sig, /^[A-Za-z0-9+/]+=*$/);
  });

  it("is deterministic — same inputs yield same output", () => {
    const payload = "2024-06-01T12:00:00.000ZPOST/api/v5/trade/order{\"instId\":\"BTC-USDT\"}";
    const secret = "stable-secret";
    assert.equal(signOkxPayload(payload, secret), signOkxPayload(payload, secret));
  });
});

describe("getNow", () => {
  it("returns an ISO 8601 string", () => {
    const ts = getNow();
    assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("is close to the current time", () => {
    const before = Date.now();
    const ts = getNow();
    const after = Date.now();
    const parsed = new Date(ts).getTime();
    assert.ok(parsed >= before && parsed <= after);
  });
});
