import { readFullConfig, configFilePath, OKX_SITES, SITE_IDS, tomlStringify } from "@agent-tradekit/core";
import type { SiteId } from "@agent-tradekit/core";
import { writeCliConfig } from "../config/toml.js";
import { printJson, printKv } from "../formatter.js";
import type { OkxTomlConfig, OkxProfile } from "@agent-tradekit/core";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";

export type Lang = "en" | "zh";

const messages = {
  en: {
    title: "OKX Trade CLI — Configuration Wizard",
    selectSite: "Select site:",
    sitePrompt: "Site (1/2/3, default: 1): ",
    demoPrompt: "Use demo trading? (Y/n) ",
    hintDemo: "The page will redirect to demo trading API management",
    hintLive: "The page will redirect to live trading API management",
    createApiKey: (url: string) => `\nGo to ${url} to create an API Key (trade permission required)\n`,
    hint: (h: string) => `Tip: ${h}\n\n`,
    profilePrompt: (name: string) => `Profile name (default: ${name}): `,
    profileExists: (name: string) => `Profile "${name}" already exists. Overwrite? (y/N) `,
    cancelled: "Cancelled.",
    emptyApiKey: "Error: API Key cannot be empty",
    emptySecretKey: "Error: Secret Key cannot be empty",
    emptyPassphrase: "Error: Passphrase cannot be empty",
    demoSelected: "Demo trading mode selected. Switch to live anytime via okx config set.",
    saved: (p: string) => `\nConfig saved to ${p}\n`,
    defaultProfile: (name: string) => `Default profile set to: ${name}\n`,
    usage: "Usage: okx account balance\n",
    writeFailed: (msg: string) => `Failed to write config: ${msg}\n`,
    permissionDenied: (p: string) => `Permission denied. Check read/write access for ${p} and its parent directory.\n`,
    manualWrite: (p: string) => `Please manually write the following to ${p}:\n\n`,
  },
  zh: {
    title: "OKX Trade CLI — 配置向导",
    selectSite: "请选择站点:",
    sitePrompt: "站点 (1/2/3, 默认: 1): ",
    demoPrompt: "使用模拟盘？(Y/n) ",
    hintDemo: "页面会自动跳转到模拟盘 API 管理",
    hintLive: "页面会自动跳转到实盘 API 管理",
    createApiKey: (url: string) => `\n请前往 ${url} 创建 API Key（需要 trade 权限）\n`,
    hint: (h: string) => `提示：${h}\n\n`,
    profilePrompt: (name: string) => `Profile 名称 (默认: ${name}): `,
    profileExists: (name: string) => `Profile "${name}" 已存在，是否覆盖？(y/N) `,
    cancelled: "已取消。",
    emptyApiKey: "错误: API Key 不能为空",
    emptySecretKey: "错误: Secret Key 不能为空",
    emptyPassphrase: "错误: Passphrase 不能为空",
    demoSelected: "已选择模拟盘模式，可随时通过 okx config set 切换为实盘。",
    saved: (p: string) => `\n配置已保存到 ${p}\n`,
    defaultProfile: (name: string) => `已设为默认 profile: ${name}\n`,
    usage: "使用方式: okx account balance\n",
    writeFailed: (msg: string) => `写入配置文件失败: ${msg}\n`,
    permissionDenied: (p: string) => `权限不足，请检查 ${p} 及其父目录的读写权限。\n`,
    manualWrite: (p: string) => `请手动将以下内容写入 ${p}:\n\n`,
  },
} as const;

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export function cmdConfigShow(json: boolean): void {
  const config = readFullConfig();
  if (json) return printJson(config);
  process.stdout.write(`Config: ${configFilePath()}\n\n`);
  process.stdout.write(`default_profile: ${config.default_profile ?? "(not set)"}\n\n`);
  for (const [name, profile] of Object.entries(config.profiles)) {
    process.stdout.write(`[${name}]\n`);
    printKv({
      api_key: profile.api_key ? maskSecret(profile.api_key) : "(not set)",
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

export type SiteKey = SiteId;

/** Maps raw user input ("1"/"2"/"3", site names like "global"/"eea"/"us", or empty) to a site key. */
export function parseSiteKey(raw: string): SiteKey {
  const lower = raw.toLowerCase();
  if (lower === "eea" || raw === "2") return "eea";
  if (lower === "us" || raw === "3") return "us";
  if (lower === "global" || raw === "1") return "global";
  return "global";
}

/** Infers site key from a base_url value (for backward-compat with old profiles lacking a site field). */
export function inferSiteFromBaseUrl(baseUrl?: string): SiteKey {
  if (!baseUrl) return "global";
  for (const id of SITE_IDS) {
    const site = OKX_SITES[id];
    if (baseUrl === site.apiBaseUrl || baseUrl === site.webUrl) return id;
  }
  return "global";
}

/** Masks a secret value, showing only the last 4 characters. */
export function maskSecret(value?: string): string {
  if (!value || value.length < 4) return "****";
  return "***" + value.slice(-4);
}

/** Builds the targeted API creation URL for the given site and trading mode. */
export function buildApiUrl(siteKey: SiteKey, demo: boolean): string {
  const query = demo ? "?go-demo-trading=1" : "?go-live-trading=1";
  return `${OKX_SITES[siteKey].webUrl}/account/my-api${query}`;
}

/** Builds a profile entry, omitting base_url for the global site. */
export function buildProfileEntry(
  siteKey: SiteKey,
  apiKey: string,
  secretKey: string,
  passphrase: string,
  demo: boolean,
): OkxProfile {
  const entry: OkxProfile = { api_key: apiKey, secret_key: secretKey, passphrase, demo };
  if (siteKey !== "global") {
    entry.base_url = OKX_SITES[siteKey].webUrl;
  }
  return entry;
}

export async function cmdConfigInit(lang: Lang = "en"): Promise<void> {
  const t = messages[lang];
  process.stdout.write(`${t.title}\n\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Step 1: site selection
    process.stdout.write(`${t.selectSite}\n`);
    process.stdout.write("  1) Global (www.okx.com)  [default]\n");
    process.stdout.write("  2) EEA   (my.okx.com)\n");
    process.stdout.write("  3) US    (app.okx.com)\n");
    const siteRaw = (await prompt(rl, t.sitePrompt)).trim();
    const siteKey = parseSiteKey(siteRaw);

    // Step 2: demo / live selection — must happen before URL construction
    const demoRaw = (await prompt(rl, t.demoPrompt)).trim().toLowerCase();
    const demo = demoRaw !== "n";

    // Step 3: open targeted API creation page
    const apiUrl = buildApiUrl(siteKey, demo);
    const hintText = demo ? t.hintDemo : t.hintLive;
    process.stdout.write(t.createApiKey(apiUrl));
    process.stdout.write(t.hint(hintText));

    // Try to open the URL; silently ignore failures
    try {
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      spawnSync(opener, [apiUrl], { stdio: "ignore", shell: process.platform === "win32" });
    } catch {
      // silently ignore
    }

    const defaultProfileName = demo ? "okx-demo" : "okx-prod";
    const profileNameRaw = await prompt(rl, t.profilePrompt(defaultProfileName));
    const profileName = profileNameRaw.trim() || defaultProfileName;

    // Check if profile already exists
    const config = readFullConfig();
    if (config.profiles[profileName]) {
      const overwrite = (await prompt(rl, t.profileExists(profileName))).trim().toLowerCase();
      if (overwrite !== "y") {
        process.stdout.write(`${t.cancelled}\n`);
        return;
      }
    }

    const apiKey = (await prompt(rl, "API Key: ")).trim();
    if (!apiKey) {
      process.stderr.write(`${t.emptyApiKey}\n`);
      process.exitCode = 1;
      return;
    }

    const secretKey = (await prompt(rl, "Secret Key: ")).trim();
    if (!secretKey) {
      process.stderr.write(`${t.emptySecretKey}\n`);
      process.exitCode = 1;
      return;
    }

    const passphrase = (await prompt(rl, "Passphrase: ")).trim();
    if (!passphrase) {
      process.stderr.write(`${t.emptyPassphrase}\n`);
      process.exitCode = 1;
      return;
    }

    if (demo) {
      process.stdout.write(`${t.demoSelected}\n`);
    }

    const profileEntry = buildProfileEntry(siteKey, apiKey, secretKey, passphrase, demo);
    config.profiles[profileName] = profileEntry;

    // Auto-set as default_profile
    if (!config.default_profile || config.default_profile !== profileName) {
      config.default_profile = profileName;
    }

    const configPath = configFilePath();
    try {
      writeCliConfig(config);
      process.stdout.write(t.saved(configPath));
      process.stdout.write(t.defaultProfile(profileName));
      process.stdout.write(t.usage);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isPermission = err instanceof Error && "code" in err && (err.code === "EACCES" || err.code === "EPERM");
      process.stderr.write(t.writeFailed(message));
      if (isPermission) {
        process.stderr.write(t.permissionDenied(configPath));
      }
      process.stderr.write(t.manualWrite(configPath));
      process.stdout.write(tomlStringify(config as unknown as Record<string, unknown>) + "\n");
      process.exitCode = 1;
    }
  } finally {
    rl.close();
  }
}

/**
 * Non-interactive profile creation / update.
 * Usage: okx config add-profile AK=xxx SK=yyy PP=zzz [site=global|eea|us] [demo=true|false] [name=xxx] [--force]
 */
export function cmdConfigAddProfile(kvPairs: string[], force: boolean): void {
  // Parse key=value pairs (split on first '=' only to handle values containing '=')
  const params: Record<string, string> = {};
  for (const pair of kvPairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1);
    params[key.toUpperCase()] = value;
  }

  const ak = params["AK"];
  const sk = params["SK"];
  const pp = params["PP"];

  // Validate required fields
  const missing: string[] = [];
  if (!ak) missing.push("AK");
  if (!sk) missing.push("SK");
  if (!pp) missing.push("PP");
  if (missing.length > 0) {
    process.stderr.write(`Error: missing required parameter(s): ${missing.join(", ")}\n`);
    process.stderr.write("Usage: okx config add-profile AK=<key> SK=<secret> PP=<passphrase> [site=global|eea|us] [demo=true|false] [name=<name>] [--force]\n");
    process.exitCode = 1;
    return;
  }

  const siteKey = parseSiteKey(params["SITE"] ?? "");
  const demo = params["DEMO"] !== undefined ? params["DEMO"].toLowerCase() !== "false" : true;
  const defaultName = demo ? "demo" : "live";
  const profileName = params["NAME"] ?? defaultName;

  const config = readFullConfig();

  // Check for conflict
  if (config.profiles[profileName] && !force) {
    process.stderr.write(`Error: profile "${profileName}" already exists. Use --force to overwrite.\n`);
    process.exitCode = 1;
    return;
  }

  // Build profile entry and set site field
  const entry = buildProfileEntry(siteKey, ak, sk, pp, demo);
  entry.site = siteKey;
  config.profiles[profileName] = entry;
  config.default_profile = profileName;

  writeCliConfig(config);
  process.stdout.write(`Profile "${profileName}" saved to ${configFilePath()}\n`);
  process.stdout.write(`Default profile set to: ${profileName}\n`);
}

/**
 * Lists all profiles, masking sensitive fields.
 * Default profile is marked with *.
 */
export function cmdConfigListProfile(): void {
  const config = readFullConfig();
  const entries = Object.entries(config.profiles);
  if (entries.length === 0) {
    process.stdout.write("No profiles found. Run: okx config add-profile AK=<key> SK=<secret> PP=<passphrase>\n");
    return;
  }
  process.stdout.write(`Config: ${configFilePath()}\n\n`);
  for (const [name, profile] of entries) {
    const isDefault = name === config.default_profile;
    const marker = isDefault ? " *" : "";
    const site = profile.site ?? inferSiteFromBaseUrl(profile.base_url);
    const mode = profile.demo !== false ? "demo (模拟盘)" : "live (实盘)";
    process.stdout.write(`[${name}]${marker}\n`);
    process.stdout.write(`  api_key:    ${maskSecret(profile.api_key)}\n`);
    process.stdout.write(`  secret_key: ${maskSecret(profile.secret_key)}\n`);
    process.stdout.write(`  passphrase: ${maskSecret(profile.passphrase)}\n`);
    process.stdout.write(`  site:       ${site}\n`);
    process.stdout.write(`  mode:       ${mode}\n`);
    process.stdout.write("\n");
  }
}

/**
 * Switches the default profile.
 * Usage: okx config use <profile-name>
 */
export function cmdConfigUse(profileName: string): void {
  if (!profileName) {
    process.stderr.write("Error: profile name is required.\nUsage: okx config use <profile-name>\n");
    process.exitCode = 1;
    return;
  }

  const config = readFullConfig();
  const available = Object.keys(config.profiles);

  if (!config.profiles[profileName]) {
    process.stderr.write(`Error: profile "${profileName}" does not exist.\n`);
    if (available.length > 0) {
      process.stderr.write(`Available profiles: ${available.join(", ")}\n`);
    } else {
      process.stderr.write("No profiles configured. Run: okx config add-profile AK=<key> SK=<secret> PP=<passphrase>\n");
    }
    process.exitCode = 1;
    return;
  }

  config.default_profile = profileName;
  writeCliConfig(config);
  process.stdout.write(`Default profile set to: "${profileName}"\n`);
}
