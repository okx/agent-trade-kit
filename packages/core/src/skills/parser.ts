import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SkillMeta, SkillSigning } from "./types.js";

/**
 * Read and parse _meta.json from an extracted skill directory.
 * Throws if _meta.json is missing or invalid.
 */
export function readMetaJson(contentDir: string): SkillMeta {
  const metaPath = join(contentDir, "_meta.json");
  if (!existsSync(metaPath)) {
    throw new Error(`_meta.json not found in ${contentDir}. Invalid skill package.`);
  }

  const raw = readFileSync(metaPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse _meta.json: invalid JSON`);
  }

  const meta = parsed as Record<string, unknown>;
  if (typeof meta.name !== "string" || !meta.name) {
    throw new Error(`_meta.json: "name" field is required`);
  }
  if (typeof meta.version !== "string" || !meta.version) {
    throw new Error(`_meta.json: "version" field is required`);
  }

  return {
    name: String(meta.name),
    version: String(meta.version),
    title: typeof meta.title === "string" ? meta.title : "",
    description: typeof meta.description === "string" ? meta.description : "",
    signing: parseSigningBlock(meta.signing),
  };
}

/**
 * Graceful version of readMetaJson — returns null if _meta.json is missing or corrupted.
 * Used as fallback before server-side verification.
 */
export function tryReadMetaJson(contentDir: string): SkillMeta | null {
  try {
    return readMetaJson(contentDir);
  } catch {
    return null;
  }
}

function parseSigningBlock(raw: unknown): SkillSigning | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.signature !== "string" || typeof s.public_key_id !== "string" || !s.files) {
    return undefined;
  }
  // Validate files: drop entries whose value is not a string to avoid silent hash-mismatch confusion.
  const rawFiles = s.files as Record<string, unknown>;
  const files: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawFiles)) {
    if (typeof value === "string") files[key] = value;
  }

  return {
    signature: s.signature,
    public_key_id: s.public_key_id,
    files,
    ...(typeof s.name === "string" && {name: s.name}),
    ...(typeof s.version === "string" && {version: s.version}),
  };
}

/**
 * Validate that SKILL.md exists in the extracted skill directory.
 */
export function validateSkillMdExists(contentDir: string): void {
  const skillMdPath = join(contentDir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    throw new Error(`SKILL.md not found in ${contentDir}. Invalid skill package.`);
  }
}
