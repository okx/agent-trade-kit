/**
 * Unit tests for getPublicKey (packages/core/src/skills/signing-keys.ts).
 * Uses a mock OkxRestClient so no real network calls are made.
 * Covers AC #7: revoked key (status !== "active") returns null.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OkxRestClient } from "../src/client/rest-client.js";
import { ConfigError } from "../src/utils/errors.js";
import { getPublicKey } from "../src/skills/signing-keys.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type PrivateGetResult = { data: unknown };

function makeClient(result: PrivateGetResult | null, throws?: unknown): OkxRestClient {
  return {
    privateGet: async () => {
      if (throws !== undefined) throw throws;
      return result as any;
    },
  } as unknown as OkxRestClient;
}

function keyEntry(status: string, publicKey = "AAAAC3NzaC1lZDI1NTE5AAAAITestKey") {
  return { data: { publicKey, algorithm: "ed25519", status, createdAt: 0 } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getPublicKey", () => {
  it("returns publicKey when status is 'active'", async () => {
    const client = makeClient(keyEntry("active", "abc123"));
    const result = await getPublicKey(client, "key-1");
    assert.equal(result, "abc123");
  });

  it("returns null when status is 'revoked' (AC #7: revoked key blocked)", async () => {
    const client = makeClient(keyEntry("revoked"));
    assert.equal(await getPublicKey(client, "key-1"), null);
  });

  it("returns null when status is 'expired'", async () => {
    const client = makeClient(keyEntry("expired"));
    assert.equal(await getPublicKey(client, "key-1"), null);
  });

  it("returns null when status is an unexpected string", async () => {
    const client = makeClient(keyEntry("pending"));
    assert.equal(await getPublicKey(client, "key-1"), null);
  });

  it("returns null when result.data is null", async () => {
    const client = makeClient({ data: null });
    assert.equal(await getPublicKey(client, "key-1"), null);
  });

  it("returns null on network error (non-ConfigError swallowed)", async () => {
    const client = makeClient(null, new Error("connection refused"));
    assert.equal(await getPublicKey(client, "key-1"), null);
  });

  it("re-throws ConfigError so caller can surface auth guidance", async () => {
    const client = makeClient(null, new ConfigError("Not configured."));
    await assert.rejects(() => getPublicKey(client, "key-1"), ConfigError);
  });

  it("passes keyId as query parameter", async () => {
    let capturedQuery: Record<string, string> | undefined;
    const client = {
      privateGet: async (_path: string, query: Record<string, string>) => {
        capturedQuery = query;
        return keyEntry("active") as any;
      },
    } as unknown as OkxRestClient;
    await getPublicKey(client, "my-key-id");
    assert.deepEqual(capturedQuery, { keyId: "my-key-id" });
  });

  it("omits keyId query parameter when keyId is undefined", async () => {
    let capturedQuery: Record<string, string> | undefined;
    const client = {
      privateGet: async (_path: string, query: Record<string, string>) => {
        capturedQuery = query;
        return keyEntry("active") as any;
      },
    } as unknown as OkxRestClient;
    await getPublicKey(client);
    assert.deepEqual(capturedQuery, {});
  });
});
