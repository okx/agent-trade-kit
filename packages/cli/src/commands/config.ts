import { readFullConfig, configFilePath, OKX_SITES, tomlStringify } from "@agent-tradekit/core";
import type { SiteId } from "@agent-tradekit/core";
import { writeCliConfig } from "../config/toml.js";
import { printJson, printKv } from "../formatter.js";
import type { OkxTomlConfig, OkxProfile } from "@agent-tradekit/core";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";

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

export type SiteKey = SiteId;

/** Maps raw user input ("1"/"2"/"3" or empty) to a site key. */
export function parseSiteKey(raw: string): SiteKey {
  if (raw === "2") return "eea";
  if (raw === "3") return "us";
  return "global";
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

export async function cmdConfigInit(): Promise<void> {
  process.stdout.write("OKX Trade CLI — 配置向导\n\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Step 1: site selection
    process.stdout.write("请选择站点:\n");
    process.stdout.write("  1) Global (www.okx.com)  [默认]\n");
    process.stdout.write("  2) EEA   (my.okx.com)\n");
    process.stdout.write("  3) US    (app.okx.com)\n");
    const siteRaw = (await prompt(rl, "站点 (1/2/3, 默认: 1): ")).trim();
    const siteKey = parseSiteKey(siteRaw);

    // Step 2: demo / live selection — must happen before URL construction
    const demoRaw = (await prompt(rl, "使用模拟盘？(Y/n) ")).trim().toLowerCase();
    const demo = demoRaw !== "n";

    // Step 3: open targeted API creation page
    const apiUrl = buildApiUrl(siteKey, demo);
    const hint = demo ? "页面会自动跳转到模拟盘 API 管理" : "页面会自动跳转到实盘 API 管理";
    process.stdout.write(`\n请前往 ${apiUrl} 创建 API Key（需要 trade 权限）\n`);
    process.stdout.write(`提示：${hint}\n\n`);

    // Try to open the URL; silently ignore failures
    try {
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      spawnSync(opener, [apiUrl], { stdio: "ignore", shell: process.platform === "win32" });
    } catch {
      // silently ignore
    }

    const profileNameRaw = await prompt(rl, "Profile 名称 (默认: default): ");
    const profileName = profileNameRaw.trim() || "default";

    const apiKey = (await prompt(rl, "API Key: ")).trim();
    if (!apiKey) {
      process.stderr.write("错误: API Key 不能为空\n");
      process.exitCode = 1;
      return;
    }

    const secretKey = (await prompt(rl, "Secret Key: ")).trim();
    if (!secretKey) {
      process.stderr.write("错误: Secret Key 不能为空\n");
      process.exitCode = 1;
      return;
    }

    const passphrase = (await prompt(rl, "Passphrase: ")).trim();
    if (!passphrase) {
      process.stderr.write("错误: Passphrase 不能为空\n");
      process.exitCode = 1;
      return;
    }

    if (demo) {
      process.stdout.write("已选择模拟盘模式，可随时通过 okx config set 切换为实盘。\n");
    }

    const config = readFullConfig();
    const profileEntry = buildProfileEntry(siteKey, apiKey, secretKey, passphrase, demo);
    config.profiles[profileName] = profileEntry;

    const configPath = configFilePath();
    try {
      writeCliConfig(config);
      process.stdout.write(`\n配置已保存到 ${configPath}\n`);
      process.stdout.write(`使用方式: okx --profile ${profileName} account balance\n`);
      if (!config.default_profile) {
        process.stdout.write(`提示: 运行 okx config set default_profile ${profileName} 可将其设为默认\n`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isPermission = err instanceof Error && "code" in err && (err.code === "EACCES" || err.code === "EPERM");
      process.stderr.write(`写入配置文件失败: ${message}\n`);
      if (isPermission) {
        process.stderr.write(`权限不足，请检查 ${configPath} 及其父目录的读写权限。\n`);
      }
      process.stderr.write("请手动将以下内容写入 " + configPath + ":\n\n");
      process.stdout.write(tomlStringify(config as unknown as Record<string, unknown>) + "\n");
      process.exitCode = 1;
    }
  } finally {
    rl.close();
  }
}
