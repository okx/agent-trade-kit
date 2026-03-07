import * as fs from "node:fs";
import { runSetup, printSetupUsage, getConfigPath, SUPPORTED_CLIENTS } from "@agent-tradekit/core";
import type { ClientId, SetupOptions } from "@agent-tradekit/core";

export type { ClientId, SetupOptions };
export { runSetup, printSetupUsage, SUPPORTED_CLIENTS };

/** Clients whose config files can be auto-detected on disk. */
const DETECTABLE_CLIENTS: ClientId[] = ["claude-desktop", "cursor", "windsurf"];

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
  const detected: { id: ClientId; path: string }[] = [];
  for (const id of DETECTABLE_CLIENTS) {
    const p = getConfigPath(id);
    if (p && fs.existsSync(p)) {
      detected.push({ id, path: p });
    }
  }

  if (detected.length > 0) {
    process.stdout.write(`Detected clients:\n`);
    for (const { id, path } of detected) {
      process.stdout.write(`  ${id.padEnd(16)} ${path}\n`);
    }
    process.stdout.write(`\n`);
  }

  printSetupUsage();
}
