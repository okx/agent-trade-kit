import { readFullConfig, configFilePath, OKX_SITES, SITE_IDS, tomlStringify } from "@agent-tradekit/core";
import type { SiteId, OkxProfile, OkxTomlConfig } from "@agent-tradekit/core";
import { writeCliConfig } from "../config/toml.js";
import { output, errorOutput, outputLine, errorLine, printJson, printKv } from "../formatter.js";
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
  outputLine(`Config: ${configFilePath()}`);
  outputLine("");
  outputLine(`default_profile: ${config.default_profile ?? "(not set)"}`);
  outputLine("");
  for (const [name, profile] of Object.entries(config.profiles)) {
    outputLine(`[${name}]`);
    printKv({
      api_key: profile.api_key ? maskSecret(profile.api_key) : "(not set)",
      demo: profile.demo ?? false,
      base_url: profile.base_url ?? "(default)",
    }, 2);
    outputLine("");
  }
}

export function cmdConfigSet(key: string, value: string): void {
  const config = readFullConfig();
  if (key === "default_profile") {
    config.default_profile = value;
    writeCliConfig(config);
    outputLine(`default_profile set to "${value}"`);
  } else {
    errorLine(`Unknown config key: ${key}`);
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

/** Tries to open a URL in the system browser; silently ignores failures. */
function tryOpenUrl(url: string): void {
  try {
    let opener: string;
    if (process.platform === "darwin") {
      opener = "open";
    } else if (process.platform === "win32") {
      opener = "start";
    } else {
      opener = "xdg-open";
    }
    spawnSync(opener, [url], { stdio: "ignore", shell: process.platform === "win32" });
  } catch {
    // silently ignore
  }
}

/** Prompts for API credentials and returns them, or null if any field is empty. */
async function promptCredentials(
  rl: ReturnType<typeof createInterface>,
  t: (typeof messages)[Lang],
): Promise<{ apiKey: string; secretKey: string; passphrase: string } | null> {
  const apiKey = (await prompt(rl, "API Key: ")).trim();
  if (!apiKey) {
    errorLine(t.emptyApiKey);
    process.exitCode = 1;
    return null;
  }

  const secretKey = (await prompt(rl, "Secret Key: ")).trim();
  if (!secretKey) {
    errorLine(t.emptySecretKey);
    process.exitCode = 1;
    return null;
  }

  const passphrase = (await prompt(rl, "Passphrase: ")).trim();
  if (!passphrase) {
    errorLine(t.emptyPassphrase);
    process.exitCode = 1;
    return null;
  }

  return { apiKey, secretKey, passphrase };
}

/** Writes config to disk and outputs success messages, or prints manual fallback on error. */
function saveConfig(config: OkxTomlConfig, profileName: string, t: (typeof messages)[Lang]): void {
  const configPath = configFilePath();
  try {
    writeCliConfig(config);
    output(t.saved(configPath));
    output(t.defaultProfile(profileName));
    output(t.usage);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const isPermission = err instanceof Error && "code" in err && (err.code === "EACCES" || err.code === "EPERM");
    errorOutput(t.writeFailed(message));
    if (isPermission) errorOutput(t.permissionDenied(configPath));
    errorOutput(t.manualWrite(configPath));
    outputLine(tomlStringify(config as unknown as Record<string, unknown>));
    process.exitCode = 1;
  }
}

export async function cmdConfigInit(lang: Lang = "en"): Promise<void> {
  const t = messages[lang];
  outputLine(t.title);
  outputLine("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Step 1: site selection
    outputLine(t.selectSite);
    outputLine("  1) Global (www.okx.com)  [default]");
    outputLine("  2) EEA   (my.okx.com)");
    outputLine("  3) US    (app.okx.com)");
    const siteRaw = (await prompt(rl, t.sitePrompt)).trim();
    const siteKey = parseSiteKey(siteRaw);

    // Step 2: demo / live selection — must happen before URL construction
    const demoRaw = (await prompt(rl, t.demoPrompt)).trim().toLowerCase();
    const demo = demoRaw !== "n";

    // Step 3: open targeted API creation page
    const apiUrl = buildApiUrl(siteKey, demo);
    output(t.createApiKey(apiUrl));
    output(t.hint(demo ? t.hintDemo : t.hintLive));
    tryOpenUrl(apiUrl);

    const defaultProfileName = demo ? "okx-demo" : "okx-prod";
    const profileNameRaw = await prompt(rl, t.profilePrompt(defaultProfileName));
    const profileName = profileNameRaw.trim() || defaultProfileName;

    // Check if profile already exists
    const config = readFullConfig();
    if (config.profiles[profileName]) {
      const overwrite = (await prompt(rl, t.profileExists(profileName))).trim().toLowerCase();
      if (overwrite !== "y") {
        outputLine(t.cancelled);
        return;
      }
    }

    const credentials = await promptCredentials(rl, t);
    if (!credentials) return;

    if (demo) outputLine(t.demoSelected);

    config.profiles[profileName] = buildProfileEntry(siteKey, credentials.apiKey, credentials.secretKey, credentials.passphrase, demo);

    // Auto-set as default_profile
    if (!config.default_profile || config.default_profile !== profileName) {
      config.default_profile = profileName;
    }

    saveConfig(config, profileName, t);
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
    errorLine(`Error: missing required parameter(s): ${missing.join(", ")}`);
    errorLine("Usage: okx config add-profile AK=<key> SK=<secret> PP=<passphrase> [site=global|eea|us] [demo=true|false] [name=<name>] [--force]");
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
    errorLine(`Error: profile "${profileName}" already exists. Use --force to overwrite.`);
    process.exitCode = 1;
    return;
  }

  // Build profile entry and set site field
  const entry = buildProfileEntry(siteKey, ak, sk, pp, demo);
  entry.site = siteKey;
  config.profiles[profileName] = entry;
  config.default_profile = profileName;

  writeCliConfig(config);
  outputLine(`Profile "${profileName}" saved to ${configFilePath()}`);
  outputLine(`Default profile set to: ${profileName}`);
}

/**
 * Lists all profiles, masking sensitive fields.
 * Default profile is marked with *.
 */
export function cmdConfigListProfile(): void {
  const config = readFullConfig();
  const entries = Object.entries(config.profiles);
  if (entries.length === 0) {
    outputLine("No profiles found. Run: okx config add-profile AK=<key> SK=<secret> PP=<passphrase>");
    return;
  }
  outputLine(`Config: ${configFilePath()}`);
  outputLine("");
  for (const [name, profile] of entries) {
    const isDefault = name === config.default_profile;
    const marker = isDefault ? " *" : "";
    const site = profile.site ?? inferSiteFromBaseUrl(profile.base_url);
    const mode = profile.demo !== false ? "demo (模拟盘)" : "live (实盘)";
    outputLine(`[${name}]${marker}`);
    outputLine(`  api_key:    ${maskSecret(profile.api_key)}`);
    outputLine(`  secret_key: ${maskSecret(profile.secret_key)}`);
    outputLine(`  passphrase: ${maskSecret(profile.passphrase)}`);
    outputLine(`  site:       ${site}`);
    outputLine(`  mode:       ${mode}`);
    outputLine("");
  }
}

/**
 * Switches the default profile.
 * Usage: okx config use <profile-name>
 */
export function cmdConfigUse(profileName: string): void {
  if (!profileName) {
    errorLine("Error: profile name is required.");
    errorLine("Usage: okx config use <profile-name>");
    process.exitCode = 1;
    return;
  }

  const config = readFullConfig();
  const available = Object.keys(config.profiles);

  if (!config.profiles[profileName]) {
    errorLine(`Error: profile "${profileName}" does not exist.`);
    if (available.length > 0) {
      errorLine(`Available profiles: ${available.join(", ")}`);
    } else {
      errorLine("No profiles configured. Run: okx config add-profile AK=<key> SK=<secret> PP=<passphrase>");
    }
    process.exitCode = 1;
    return;
  }

  config.default_profile = profileName;
  writeCliConfig(config);
  outputLine(`Default profile set to: "${profileName}"`);
}
