import type { OkxRestClient } from "../client/rest-client.js";
import { safeWriteFile } from "../utils/safe-file.js";

/** Maximum download size: 50 MB */
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

export interface PresignResult {
  /** Signed download credential (URL-safe Base64 + HMAC). */
  token: string;
  /** Credential expiry time (Unix milliseconds). */
  expiresAt: number;
}

/**
 * Step 1 of two-step download: obtain a pre-signed credential from the marketplace.
 * Requires OAuth authentication; the returned token is valid for ~5 minutes.
 *
 * @param format - Desired file extension: "zip" (default) or "skill". Content is identical.
 * Returns { token, expiresAt }. The token can be passed to downloadSkillZip (CLI) or surfaced
 * to agents (MCP) to construct the download URL: GET /api/v5/skill/file?token=<token>.
 */
export async function presignSkillDownload(
  client: OkxRestClient,
  name: string,
  format: "zip" | "skill" = "zip",
): Promise<PresignResult> {
  const result = await client.privatePost<{ token: string; expiresAt: number }>(
    "/api/v5/skill/download/presign",
    { name, type: format },
  );

  const data = result.data;
  const token = data.token;
  const expiresAt = data.expiresAt;

  return { token, expiresAt };
}

/**
 * Two-step download: presign then fetch the file via an unauthenticated GET.
 *
 * Security:
 * - Content-Type validation (must be octet-stream)
 * - Size limit enforced (50 MB)
 * - Atomic file write via safeWriteFile (temp + rename)
 * - File name is fixed to `{name}.{format}` (ignores server-supplied filename)
 *
 * @param format - Output file extension: "zip" (default) or "skill". Content is identical.
 * Returns the file path of the saved file.
 */
export async function downloadSkillZip(
  client: OkxRestClient,
  name: string,
  targetDir: string,
  format: "zip" | "skill" = "zip",
): Promise<string> {
  // Step 1: obtain pre-signed token (requires auth)
  const { token } = await presignSkillDownload(client, name, format);

  // Step 2: download file via unauthenticated GET (token embedded as query param)
  const result = await client.publicGetBinary(
    "/api/v5/skill/file",
    { token },
    { maxBytes: MAX_DOWNLOAD_BYTES },
  );

  // Fixed filename — never trust server-supplied Content-Disposition
  const ext = format === "skill" ? "skill" : "zip";
  const fileName = `${name}.${ext}`;
  const filePath = safeWriteFile(targetDir, fileName, result.data);

  return filePath;
}
