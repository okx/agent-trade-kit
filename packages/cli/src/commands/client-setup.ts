import * as fs from "node:fs";
import { runSetup, printSetupUsage, SUPPORTED_CLIENTS } from "@agent-tradekit/core";
import type { ClientId, SetupOptions } from "@agent-tradekit/core";

export type { ClientId, SetupOptions };
export { runSetup, printSetupUsage, SUPPORTED_CLIENTS };

/**
 * Non-interactive setup for a specific client.
 */
export function cmdSetupClient(options: SetupOptions): void {
  runSetup(options);
}

/**
 * Auto-detect installed clients and print what was found.
 * Kept for backward compatibility with `okx config setup-clients`.
 */
export function cmdSetupClients(): void {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const detectedPaths: Record<string, string> = {
    "claude-desktop": `${home}/Library/Application Support/Claude/claude_desktop_config.json`,
    cursor: `${home}/.cursor/mcp.json`,
    windsurf: `${home}/.codeium/windsurf/mcp_config.json`,
  };

  const detected = (Object.entries(detectedPaths) as [ClientId, string][]).filter(([, p]) =>
    fs.existsSync(p)
  );

  if (detected.length > 0) {
    process.stdout.write(`Detected clients:\n`);
    for (const [id] of detected) {
      process.stdout.write(`  ${id}\n`);
    }
    process.stdout.write(`\n`);
  }

  printSetupUsage();
}
