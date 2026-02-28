import { readTomlProfile, configFilePath } from "@okx-hub/core";
import { writeCliConfig } from "../config/toml.js";
import { printJson, printKv } from "../formatter.js";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "smol-toml";
import type { OkxTomlConfig } from "@okx-hub/core";

function readFullConfig(): OkxTomlConfig {
  const path = configFilePath();
  if (!existsSync(path)) return { profiles: {} };
  const raw = readFileSync(path, "utf-8");
  return parse(raw) as unknown as OkxTomlConfig;
}

export function cmdConfigShow(json: boolean): void {
  const config = readFullConfig();
  if (json) return printJson(config);
  process.stdout.write(`Config: ${configFilePath()}\n\n`);
  process.stdout.write(`default_profile: ${config.default_profile ?? "(not set)"}\n\n`);
  for (const [name, profile] of Object.entries(config.profiles)) {
    process.stdout.write(`[${name}]\n`);
    printKv({
      api_key: profile.api_key ? "***" + profile.api_key.slice(-4) : "(not set)",
      demo: profile.demo ?? false,
      base_url: profile.base_url ?? "(default)",
    }, 2);
    process.stdout.write("\n");
  }
}

export function cmdConfigSet(key: string, value: string): void {
  const config = readFullConfig();
  if (key === "default_profile") {
    config.default_profile = value;
    writeCliConfig(config);
    process.stdout.write(`default_profile set to "${value}"\n`);
  } else {
    process.stderr.write(`Unknown config key: ${key}\n`);
    process.exitCode = 1;
  }
}
