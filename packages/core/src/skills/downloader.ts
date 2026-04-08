import type { OkxRestClient } from "../client/rest-client.js";
import { safeWriteFile } from "../utils/safe-file.js";

/** Maximum download size: 50 MB */
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Download a skill package from the marketplace API using OkxRestClient.
 * Inherits all client capabilities: auth, proxy, rate-limit, verbose, user-agent.
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
  const result = await client.privatePostBinary(
    "/api/v5/skill/download",
    { name },
    { maxBytes: MAX_DOWNLOAD_BYTES },
  );

  // Fixed filename — never trust server-supplied Content-Disposition
  const ext = format === "skill" ? "skill" : "zip";
  const fileName = `${name}.${ext}`;
  const filePath = safeWriteFile(targetDir, fileName, result.data);

  return filePath;
}
