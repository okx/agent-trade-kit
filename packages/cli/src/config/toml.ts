import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { stringify } from "smol-toml";
import { configFilePath } from "@okx-hub/core";
import type { OkxTomlConfig } from "@okx-hub/core";

// Re-export for backward compat within CLI
export type { OkxTomlConfig as CliConfig };
export { configFilePath as configPath };

export function configDir(): string {
  return configFilePath().replace(/\/config\.toml$/, "");
}

export function writeCliConfig(config: OkxTomlConfig): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configFilePath(), stringify(config as unknown as Record<string, unknown>), "utf-8");
}
