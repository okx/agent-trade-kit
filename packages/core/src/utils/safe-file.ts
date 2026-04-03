import { writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { join, resolve, basename, sep } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Safely write binary data to a file.
 * - Writes to a .tmp file first, then atomically renames
 * - Validates the target path is within the expected directory
 * - Cleans up .tmp on failure
 */
export function safeWriteFile(
  targetDir: string,
  fileName: string,
  data: Buffer,
): string {
  // Sanitize fileName: strip path components, use only basename
  const safeName = basename(fileName);
  if (!safeName || safeName === "." || safeName === "..") {
    throw new Error(`Invalid file name: "${fileName}"`);
  }

  const resolvedDir = resolve(targetDir);
  const filePath = join(resolvedDir, safeName);
  const resolvedPath = resolve(filePath);

  // Path traversal check: resolved path must be within target directory
  if (!resolvedPath.startsWith(resolvedDir + sep)) {
    throw new Error(`Path traversal detected: "${fileName}" resolves outside target directory`);
  }

  mkdirSync(resolvedDir, { recursive: true });

  // Atomic write: write to temp file, then rename
  const tmpPath = `${resolvedPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmpPath, data);
    renameSync(tmpPath, resolvedPath);
  } catch (err) {
    // Cleanup temp file on failure
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }

  return resolvedPath;
}

/**
 * Validate that a zip entry path is safe (no path traversal, no symlinks in path).
 * Returns the resolved path within targetDir, or throws.
 */
export function validateZipEntryPath(targetDir: string, entryName: string): string {
  const resolvedDir = resolve(targetDir);
  const resolvedEntry = resolve(resolvedDir, entryName);

  // Must be within targetDir
  if (!resolvedEntry.startsWith(resolvedDir + sep) && resolvedEntry !== resolvedDir) {
    throw new Error(`Zip path traversal detected: "${entryName}" resolves outside extraction directory`);
  }

  return resolvedEntry;
}
