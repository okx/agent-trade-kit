import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SkillMeta } from "./types.js";

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
