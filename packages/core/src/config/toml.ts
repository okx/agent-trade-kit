import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "smol-toml";

export { stringify as tomlStringify };

export interface OkxProfile {
  api_key?: string;
  secret_key?: string;
  passphrase?: string;
  base_url?: string;
  timeout_ms?: number;
  demo?: boolean;
  site?: string;
}

export interface OkxTomlConfig {
  default_profile?: string;
  profiles: Record<string, OkxProfile>;
}

export function configFilePath(): string {
  return join(homedir(), ".okx", "config.toml");
}

/**
 * Read the full config from ~/.okx/config.toml.
 * Returns a config with empty profiles if the file does not exist.
 */
export function readFullConfig(): OkxTomlConfig {
  const path = configFilePath();
  if (!existsSync(path)) return { profiles: {} };
  const raw = readFileSync(path, "utf-8");
  return parse(raw) as unknown as OkxTomlConfig;
}

/**
 * Read a profile from ~/.okx/config.toml.
 * Returns an empty object if the file does not exist or the profile is not found.
 */
export function readTomlProfile(profileName?: string): OkxProfile {
  const config = readFullConfig();
  const name = profileName ?? config.default_profile ?? "default";
  return config.profiles?.[name] ?? {};
}

/**
 * Write the full config to ~/.okx/config.toml.
 * Creates the parent directory if it does not exist.
 */
export function writeFullConfig(config: OkxTomlConfig): void {
  const path = configFilePath();
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, stringify(config as unknown as Record<string, unknown>), "utf-8");
}
