import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Recursively list all files under a directory.
 * Returns paths relative to the given base directory.
 *
 * Note: uses `statSync` (follows symlinks). If the skill content directory contains
 * a symlink whose target lies outside the directory, its resolved content will be
 * included in the listing and subsequently hashed by `computeFileHashes`. This does
 * not introduce a signing bypass — `checkFileIntegrity` in verifier.ts guards against
 * crafted paths in the signing manifest — but it means the server-side verify call
 * may include hashes for files outside the skill's own directory. The risk is low
 * in the current trust model (content was already downloaded and extracted), but
 * callers that require strict containment should filter symlinks with `lstatSync`
 * before passing entries to further processing.
 */
export function listFilesRecursive(dir: string, base = ""): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relPath = base ? `${base}/${entry}` : entry;
    if (statSync(fullPath).isDirectory()) {
      results.push(...listFilesRecursive(fullPath, relPath));
    } else {
      results.push(relPath);
    }
  }
  return results;
}

/**
 * Compute SHA-256 hashes for all files in a skill directory, excluding _meta.json.
 * Returns a map of relative path → "sha256:<hex>".
 *
 * Symlink behaviour: delegates enumeration to `listFilesRecursive` — see that
 * function's JSDoc for the symlink-following note and its implications.
 */
export function computeFileHashes(contentDir: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const relPath of listFilesRecursive(contentDir)) {
    if (relPath === "_meta.json") continue;
    const bytes = readFileSync(join(contentDir, relPath));
    hashes[relPath] = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  }
  return hashes;
}
