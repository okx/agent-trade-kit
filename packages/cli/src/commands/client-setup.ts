import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";

interface ClientConfig {
  name: string;
  configPath: string;
  mcpKey: string;
}

const CLIENTS: ClientConfig[] = [
  {
    name: "Claude Desktop",
    configPath: path.join(os.homedir(), "Library/Application Support/Claude/claude_desktop_config.json"),
    mcpKey: "mcpServers",
  },
  {
    name: "Cursor",
    configPath: path.join(os.homedir(), ".cursor/mcp.json"),
    mcpKey: "mcpServers",
  },
  {
    name: "Windsurf",
    configPath: path.join(os.homedir(), ".codeium/windsurf/mcp_config.json"),
    mcpKey: "mcpServers",
  },
];

const MCP_ENTRY = {
  command: "okx-trade-mcp",
  args: ["--modules", "all"],
};

const MCP_SERVER_NAME = "okx-trade-mcp";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

export async function cmdSetupClients(): Promise<void> {
  const detected = CLIENTS.filter((c) => fs.existsSync(c.configPath));

  if (detected.length === 0) {
    process.stdout.write(
      "No supported IDE/client installations detected.\n" +
        "Checked:\n" +
        CLIENTS.map((c) => `  - ${c.name}: ${c.configPath}`).join("\n") +
        "\n"
    );
    return;
  }

  process.stdout.write(`Detected ${detected.length} client(s):\n`);
  for (const c of detected) {
    process.stdout.write(`  - ${c.name}\n`);
  }
  process.stdout.write("\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    for (const client of detected) {
      const answer = await prompt(rl, `Configure ${client.name}? (y/N) `);
      if (answer.trim().toLowerCase() !== "y") {
        process.stdout.write(`  Skipped ${client.name}.\n`);
        continue;
      }

      // Read existing config or initialize a new one
      let data: Record<string, unknown> = { [client.mcpKey]: {} };
      if (fs.existsSync(client.configPath)) {
        const raw = fs.readFileSync(client.configPath, "utf-8");
        try {
          data = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          process.stderr.write(
            `  Error: Failed to parse JSON for ${client.name} at ${client.configPath}. Skipping.\n`
          );
          continue;
        }
      }

      // Ensure the mcpKey object exists
      if (typeof data[client.mcpKey] !== "object" || data[client.mcpKey] === null) {
        data[client.mcpKey] = {};
      }

      const servers = data[client.mcpKey] as Record<string, unknown>;

      if (Object.prototype.hasOwnProperty.call(servers, MCP_SERVER_NAME)) {
        process.stdout.write(`  Already configured in ${client.name}. Skipping.\n`);
        continue;
      }

      servers[MCP_SERVER_NAME] = MCP_ENTRY;

      const jsonOutput = JSON.stringify(data, null, 2);

      try {
        fs.writeFileSync(client.configPath, jsonOutput, "utf-8");
        process.stdout.write(`  Configured ${client.name} successfully.\n`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `  Error: Failed to write config for ${client.name}: ${reason}\n` +
            `  Add the following to "${client.configPath}" manually:\n\n` +
            `  "${MCP_SERVER_NAME}": ${JSON.stringify(MCP_ENTRY, null, 2)
              .split("\n")
              .join("\n  ")}\n\n`
        );
      }
    }
  } finally {
    rl.close();
  }

  process.stdout.write(
    "\nDone. Please restart any configured IDE/client for the changes to take effect.\n"
  );
}
