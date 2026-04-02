import yauzl from "yauzl";
import { createWriteStream, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { validateZipEntryPath } from "../utils/safe-file.js";

/** Limits for zip extraction to prevent abuse. */
export interface ExtractLimits {
  /** Maximum total extracted size in bytes. Default: 100 MB. */
  maxTotalBytes?: number;
  /** Maximum number of files in the zip. Default: 1000. */
  maxFiles?: number;
  /** Maximum compression ratio per entry. Default: 100. */
  maxCompressionRatio?: number;
}

const DEFAULT_MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_MAX_FILES = 1000;
const DEFAULT_MAX_COMPRESSION_RATIO = 100;

/** Mutable counters passed through entry validation. */
interface ExtractState {
  fileCount: number;
  totalBytes: number;
}

/**
 * Validate a single zip entry against all security checks.
 * Throws on violation. Returns the resolved output path on success.
 */
function validateEntry(
  entry: yauzl.Entry,
  targetDir: string,
  state: ExtractState,
  limits: { maxFiles: number; maxTotalBytes: number; maxCompressionRatio: number },
): string {
  // File count limit
  state.fileCount++;
  if (state.fileCount > limits.maxFiles) {
    throw new Error(
      `Zip contains more than ${limits.maxFiles} entries, exceeding limit of ${limits.maxFiles}. Possible zip bomb.`,
    );
  }

  // Path traversal check
  const resolvedPath = validateZipEntryPath(targetDir, entry.fileName);

  // Symlink check: Unix external attributes with symlink flag (0xA000)
  const externalAttrs = entry.externalFileAttributes;
  if (externalAttrs) {
    const unixMode = (externalAttrs >>> 16) & 0xFFFF;
    if ((unixMode & 0o120000) === 0o120000) {
      throw new Error(`Zip entry "${entry.fileName}" is a symlink. Symlinks are not allowed for security.`);
    }
  }

  // Compression ratio check: detect single-entry zip bombs
  if (entry.compressedSize > 0) {
    const ratio = entry.uncompressedSize / entry.compressedSize;
    if (ratio > limits.maxCompressionRatio) {
      throw new Error(
        `Zip entry "${entry.fileName}" has compression ratio ${ratio.toFixed(1)}, exceeding limit of ${limits.maxCompressionRatio}. Possible zip bomb.`,
      );
    }
  }

  // Zip bomb check: accumulated uncompressed size
  state.totalBytes += entry.uncompressedSize;
  if (state.totalBytes > limits.maxTotalBytes) {
    throw new Error(
      `Extracted size ${state.totalBytes} bytes exceeds limit of ${limits.maxTotalBytes} bytes. Possible zip bomb.`,
    );
  }

  return resolvedPath;
}

/**
 * Safely extract a skill zip file to a target directory.
 *
 * Security measures (validated per-entry in validateEntry):
 * - Path traversal check: every entry path must resolve within targetDir
 * - Zip bomb protection: total extracted size capped at maxTotalBytes
 * - File count limit: prevents zip with excessive entries
 * - Symlink rejection: entries with symlink external attributes are rejected
 *
 * Returns the target directory path.
 */
export async function extractSkillZip(
  zipPath: string,
  targetDir: string,
  limits?: ExtractLimits,
): Promise<string> {
  const maxTotalBytes = limits?.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxFiles = limits?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxCompressionRatio = limits?.maxCompressionRatio ?? DEFAULT_MAX_COMPRESSION_RATIO;
  const resolvedTarget = resolve(targetDir);

  mkdirSync(resolvedTarget, { recursive: true });

  // Security: archive expansion is guarded by validateEntry() which enforces
  // file count limits, size limits, path traversal checks, and symlink rejection.
  return new Promise<string>((resolvePromise, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      const state: ExtractState = { fileCount: 0, totalBytes: 0 };

      zipfile.readEntry();
      zipfile.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName.endsWith("/")) { zipfile.readEntry(); return; }

        let resolvedPath: string;
        try {
          resolvedPath = validateEntry(entry, resolvedTarget, state, { maxFiles, maxTotalBytes, maxCompressionRatio });
        } catch (e) {
          zipfile.close();
          return reject(e);
        }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) { zipfile.close(); return reject(streamErr); }
          mkdirSync(dirname(resolvedPath), { recursive: true });
          const writeStream = createWriteStream(resolvedPath);
          readStream.pipe(writeStream);
          writeStream.on("close", () => zipfile.readEntry());
          writeStream.on("error", (writeErr) => { zipfile.close(); reject(writeErr); });
        });
      });

      zipfile.on("end", () => resolvePromise(resolvedTarget));
      zipfile.on("error", reject);
    });
  });
}
