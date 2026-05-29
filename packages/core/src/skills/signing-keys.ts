import type {OkxRestClient} from "../client/rest-client.js";
import {ConfigError} from "../utils/errors.js";

interface KeyEntry {
  publicKey: string;
  algorithm: string;
  status: string;
  createdAt: number;
}

/**
 * Fetch the Ed25519 public key for skill signature verification.
 *
 * - If keyId is provided: returns the matching key's publicKey (OpenSSH wire-format base64),
 *   or null if not found or not active.
 * - If keyId is omitted: returns the current active key, or null if none exists.
 *
 * Returns null on network/API errors (caller should handle fallback).
 * @throws ConfigError — authentication not configured; caller must surface this to the user.
 */
export async function getPublicKey(
  client: OkxRestClient,
  keyId?: string,
): Promise<string | null> {
  try {
    const query: Record<string, string> = {};
    if (keyId !== undefined) query.keyId = keyId;
    const result = await client.privateGet<KeyEntry | null>(
      "/api/v5/skill/signing-key",
      query,
    );
    if (!result.data || result.data.status !== "active") return null;
    return result.data.publicKey;
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    return null;
  }
}
