import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { SkillMeta, SkillRecord, SkillRegistry } from "./types.js";

const DEFAULT_REGISTRY_PATH = join(homedir(), ".okx", "skills", "registry.json");

/** Read the local skill registry. Returns empty registry if file doesn't exist. */
export function readRegistry(registryPath = DEFAULT_REGISTRY_PATH): SkillRegistry {
  if (!existsSync(registryPath)) {
    return { version: 1, skills: {} };
  }
  try {
    const raw = readFileSync(registryPath, "utf-8");
    return JSON.parse(raw) as SkillRegistry;
  } catch {
    return { version: 1, skills: {} };
  }
}

/** Write the registry back to disk. */
export function writeRegistry(registry: SkillRegistry, registryPath = DEFAULT_REGISTRY_PATH): void {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", "utf-8");
}

/** Add or update a skill record from _meta.json data. */
export function upsertSkillRecord(meta: SkillMeta, registryPath = DEFAULT_REGISTRY_PATH): void {
  const registry = readRegistry(registryPath);
  const now = new Date().toISOString();
  const existing = registry.skills[meta.name];

  registry.skills[meta.name] = {
    name: meta.name,
    version: meta.version,
    description: meta.description,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
    source: "marketplace",
  };

  writeRegistry(registry, registryPath);
}

/** Remove a skill from the registry. Returns true if the skill was found and removed. */
export function removeSkillRecord(name: string, registryPath = DEFAULT_REGISTRY_PATH): boolean {
  const registry = readRegistry(registryPath);
  if (!(name in registry.skills)) return false;
  delete registry.skills[name];
  writeRegistry(registry, registryPath);
  return true;
}

/** Get a single skill record by name. */
export function getSkillRecord(name: string, registryPath = DEFAULT_REGISTRY_PATH): SkillRecord | undefined {
  const registry = readRegistry(registryPath);
  return registry.skills[name];
}

/** Get the registry file path (for display). */
export function getRegistryPath(): string {
  return DEFAULT_REGISTRY_PATH;
}
