import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fetchLatestVersion, fetchDistTags, isNewerVersion } from "@agent-tradekit/core";

const PACKAGES = ["@okx_ai/okx-trade-mcp", "@okx_ai/okx-trade-cli"];
const CACHE_FILE = join(homedir(), ".okx", "last_check");
const THROTTLE_MS = 12 * 60 * 60 * 1000; // 12 h

export interface UpgradeOptions {
  beta?: boolean;
  check?: boolean;
  force?: boolean;
}

export interface UpgradeResult {
  currentVersion: string;
  latestVersion: string;
  status: "up-to-date" | "updated" | "update-available" | "error";
  updated: boolean;
}

function readLastCheck(): number {
  try {
    return parseInt(readFileSync(CACHE_FILE, "utf-8").trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function writeLastCheck(): void {
  try {
    mkdirSync(join(homedir(), ".okx"), { recursive: true });
    writeFileSync(CACHE_FILE, String(Math.floor(Date.now() / 1000)), "utf-8");
  } catch {
    // ignore write failures
  }
}

function printResult(result: UpgradeResult, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(result) + "\n");
  } else {
    switch (result.status) {
      case "up-to-date":
        process.stderr.write(`[ok]    Already up to date: ${result.currentVersion}\n`);
        break;
      case "update-available":
        process.stderr.write(
          `[info]  Update available: ${result.currentVersion} → ${result.latestVersion}\n` +
            `        Run: okx upgrade\n`,
        );
        break;
      case "updated":
        process.stderr.write(`[ok]    Upgraded: ${result.currentVersion} → ${result.latestVersion}\n`);
        break;
      case "error":
        process.stderr.write(`[error] Failed to fetch latest version from npm registry\n`);
        break;
    }
  }
}

export async function cmdUpgrade(
  currentVersion: string,
  options: UpgradeOptions,
  json: boolean,
): Promise<void> {
  // Throttle: skip silently if last check < 12 h ago (unless --force or --check)
  if (!options.force && !options.check) {
    const lastCheck = readLastCheck();
    if (Date.now() - lastCheck * 1000 < THROTTLE_MS) {
      if (json) {
        process.stdout.write(
          JSON.stringify({ currentVersion, latestVersion: currentVersion, status: "up-to-date", updated: false }) + "\n",
        );
      }
      return;
    }
  }

  // Fetch latest version
  let latestVersion: string | null = null;
  if (options.beta) {
    const tags = await fetchDistTags("@okx_ai/okx-trade-cli");
    latestVersion = tags?.["next"] ?? tags?.["latest"] ?? null;
  } else {
    latestVersion = await fetchLatestVersion("@okx_ai/okx-trade-cli");
  }

  if (!latestVersion) {
    printResult({ currentVersion, latestVersion: "unknown", status: "error", updated: false }, json);
    process.exitCode = 1;
    return;
  }

  // Strip prerelease suffix before comparing against stable latest (Bug #1 fix)
  const stableCurrentVersion = currentVersion.replace(/[-+].+$/, "");
  const needsUpdate = options.force || isNewerVersion(stableCurrentVersion, latestVersion);

  if (!needsUpdate) {
    if (!options.check) writeLastCheck();
    printResult({ currentVersion, latestVersion, status: "up-to-date", updated: false }, json);
    return;
  }

  if (options.check) {
    printResult({ currentVersion, latestVersion, status: "update-available", updated: false }, json);
    return;
  }

  // Execute upgrade
  // Use spawnSync with array args (no shell interpreter) to avoid S4721 false positives.
  // Bug #2 fix: when --json, suppress npm stdout to avoid polluting JSON output.
  try {
    const result = spawnSync("npm", ["install", "-g", ...PACKAGES], {
      stdio: json ? ["inherit", "ignore", process.stderr] : "inherit",
      shell: false,
    });
    if (result.status !== 0) throw new Error("npm exited with non-zero status");
    writeLastCheck();
    printResult({ currentVersion, latestVersion, status: "updated", updated: true }, json);
  } catch {
    printResult({ currentVersion, latestVersion, status: "error", updated: false }, json);
    process.exitCode = 1;
  }
}
