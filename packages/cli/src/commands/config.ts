import { readTomlProfile, configFilePath } from "@agent-tradekit/core";
import { writeCliConfig } from "../config/toml.js";
import { printJson, printKv } from "../formatter.js";
import { existsSync, readFileSync } from "node:fs";
import { parse, stringify } from "smol-toml";
import type { OkxTomlConfig } from "@agent-tradekit/core";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";

function readFullConfig(): OkxTomlConfig {
  const path = configFilePath();
  if (!existsSync(path)) return { profiles: {} };
  const raw = readFileSync(path, "utf-8");
  return parse(raw) as unknown as OkxTomlConfig;
}

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

export async function cmdConfigInit(): Promise<void> {
  const apiUrl = "https://www.okx.com/account/my-api";

  process.stdout.write("OKX Trade CLI — 配置向导\n\n");
  process.stdout.write(`请前往 ${apiUrl} 创建 API Key（需要 trade 权限）\n\n`);

  // Try to open the URL; silently ignore failures
  try {
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    spawnSync(opener, [apiUrl], { stdio: "ignore" });
  } catch {
    // silently ignore
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
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

    const demoRaw = (await prompt(rl, "使用模拟盘？(Y/n) ")).trim().toLowerCase();
    const demo = demoRaw !== "n";
    if (demo) {
      process.stdout.write("已选择模拟盘模式，可随时通过 okx config set 切换为实盘。\n");
    }

    const config = readFullConfig();
    config.profiles[profileName] = { api_key: apiKey, secret_key: secretKey, passphrase, demo };

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
      process.stdout.write(stringify(config as unknown as Record<string, unknown>) + "\n");
      process.exitCode = 1;
    }
  } finally {
    rl.close();
  }
}
