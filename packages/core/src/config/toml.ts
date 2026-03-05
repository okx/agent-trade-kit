import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse } from "smol-toml";

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
 * Read a profile from ~/.okx/config.toml.
 * Returns an empty object if the file does not exist or the profile is not found.
 */
export function readTomlProfile(profileName?: string): OkxProfile {
  const path = configFilePath();
  if (!existsSync(path)) return {};

  const raw = readFileSync(path, "utf-8");
  const config = parse(raw) as unknown as OkxTomlConfig;

  const name = profileName ?? config.default_profile ?? "default";
  return config.profiles?.[name] ?? {};
}
