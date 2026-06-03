import type {OkxRestClient} from "../client/rest-client.js";
import {ConfigError} from "../utils/errors.js";

export interface ServerVerifyResult {
  verified: boolean;
  version: string;
  mismatched: string[];
  message?: string;
}

/**
 * Call the server-side fallback verification endpoint POST /api/v5/skill/verify.
 * The server compares the client-computed file hashes against signing_info.files in the DB.
 *
 * @param version - Optional. If omitted the server matches the latest signed version.
 *                  Should be omitted when _meta.json is missing/corrupted (version unavailable).
 * @returns
 *   - `{verified: true, ...}`  — server confirmed the hashes match its DB.
 *   - `{verified: false, ...}` — server responded 200 and explicitly rejected the hashes.
 *   - `null`                   — infrastructure failure (network error, timeout, service unavailable);
 *                                caller should treat this as "server unavailable, cannot confirm".
 * @throws ConfigError — authentication not configured; caller must surface this to the user.
 */
export async function serverSideVerify(
  client: OkxRestClient,
  skillName: string,
  version: string | undefined,
  files: Record<string, string>,
): Promise<ServerVerifyResult | null> {
  try {
    const body: Record<string, unknown> = {skillName, files};
    if (version !== undefined) body.version = version;
    const result = await client.privatePost<ServerVerifyResult>(
      "/api/v5/skill/verify",
      body,
    );
    return result.data;
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    return null;
  }
}
