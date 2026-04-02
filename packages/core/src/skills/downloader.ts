import type { OkxRestClient } from "../client/rest-client.js";
import { safeWriteFile } from "../utils/safe-file.js";

/** Maximum download size: 50 MB */
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Download a skill zip from the marketplace API using OkxRestClient.
 * Inherits all client capabilities: auth, proxy, rate-limit, verbose, user-agent.
 *
 * Security:
 * - Content-Type validation (must be octet-stream)
 * - Size limit enforced (50 MB)
 * - Atomic file write via safeWriteFile (temp + rename)
 * - File name is fixed to `{name}.zip` (ignores server-supplied filename)
 *
 * Returns the file path of the saved zip.
 */
export async function downloadSkillZip(
  client: OkxRestClient,
  name: string,
  targetDir: string,
): Promise<string> {
  const result = await client.privatePostBinary(
    "/api/v5/skill/download",
    { name },
    { maxBytes: MAX_DOWNLOAD_BYTES },
  );

  // Fixed filename — never trust server-supplied Content-Disposition
  const fileName = `${name}.zip`;
  const filePath = safeWriteFile(targetDir, fileName, result.data);

  return filePath;
}
