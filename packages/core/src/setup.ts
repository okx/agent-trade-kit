import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";

export type ClientId = "claude-desktop" | "cursor" | "windsurf" | "vscode" | "claude-code";

export interface SetupOptions {
  client: ClientId;
  profile?: string;
  modules?: string;
}

const CLIENT_NAMES: Record<ClientId, string> = {
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  windsurf: "Windsurf",
  vscode: "VS Code",
  "claude-code": "Claude Code CLI",
};

export const SUPPORTED_CLIENTS = Object.keys(CLIENT_NAMES) as ClientId[];

function appData(): string {
  return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
}

function getConfigPath(client: ClientId): string | null {
  const home = os.homedir();
  const win = process.platform === "win32";
  switch (client) {
    case "claude-desktop":
      return win
        ? path.join(appData(), "Claude", "claude_desktop_config.json")
        : path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    case "cursor":
      return path.join(home, ".cursor", "mcp.json");
    case "windsurf":
      return path.join(home, ".codeium", "windsurf", "mcp_config.json");
    case "vscode":
      return path.join(process.cwd(), ".mcp.json");
    case "claude-code":
      return null;
  }
}

function buildEntry(
  client: ClientId,
  args: string[]
): Record<string, unknown> {
  if (client === "vscode") {
    return { type: "stdio", command: "okx-trade-mcp", args };
  }
  return { command: "okx-trade-mcp", args };
}

function buildArgs(options: SetupOptions): string[] {
  const args: string[] = [];
  if (options.profile) args.push("--profile", options.profile);
  args.push("--modules", options.modules ?? "all");
  return args;
}

function mergeJsonConfig(
  configPath: string,
  serverName: string,
  entry: Record<string, unknown>
): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let data: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf-8");
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`Failed to parse existing config at ${configPath}`);
    }
    // Backup before modifying
    const backupPath = configPath + ".bak";
    fs.copyFileSync(configPath, backupPath);
    process.stdout.write(`  Backup → ${backupPath}\n`);
  }

  if (typeof data.mcpServers !== "object" || data.mcpServers === null) {
    data.mcpServers = {};
  }
  (data.mcpServers as Record<string, unknown>)[serverName] = entry;

  fs.writeFileSync(configPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export function printSetupUsage(): void {
  process.stdout.write(
    `Usage: okx-trade-mcp setup --client <client> [--profile <name>] [--modules <list>]\n\n` +
      `Clients:\n` +
      SUPPORTED_CLIENTS.map((id) => `  ${id.padEnd(16)} ${CLIENT_NAMES[id]}`).join("\n") +
      `\n\nOptions:\n` +
      `  --profile <name>   Profile from ~/.okx/config.toml (default: uses default_profile)\n` +
      `  --modules <list>   Comma-separated modules or "all" (default: all)\n`
  );
}

export function runSetup(options: SetupOptions): void {
  const { client } = options;
  const name = CLIENT_NAMES[client];
  const args = buildArgs(options);
  const serverName = options.profile ? `okx-trade-mcp-${options.profile}` : "okx-trade-mcp";

  if (client === "claude-code") {
    const claudeArgs = [
      "mcp",
      "add",
      "--transport",
      "stdio",
      serverName,
      "--",
      "okx-trade-mcp",
      ...args,
    ];
    process.stdout.write(`Running: claude ${claudeArgs.join(" ")}\n`);
    execFileSync("claude", claudeArgs, { stdio: "inherit" }); // NOSONAR
    process.stdout.write(`✓ Configured ${name}\n`);
    return;
  }

  const configPath = getConfigPath(client);
  if (!configPath) {
    throw new Error(`${name} is not supported on this platform`);
  }

  const entry = buildEntry(client, args);
  mergeJsonConfig(configPath, serverName, entry);
  process.stdout.write(
    `✓ Configured ${name}\n` +
      `  ${configPath}\n` +
      `  Server args: ${args.join(" ")}\n`
  );
  if (client !== "vscode") {
    process.stdout.write(`  Restart ${name} to apply changes.\n`);
  }
}
