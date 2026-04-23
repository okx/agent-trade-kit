import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PilotBinaryResponse, PilotNode } from "./types.js";

/** Default timeout for the Pilot binary (ms). */
const EXEC_TIMEOUT_MS = 30_000;

/** Only allow *.okx.com domains */
const ALLOWED_DOMAIN_RE = /^[\w.-]+\.okx\.com$/;

/** Directory under the user's home where the binary lives. */
const PILOT_BIN_DIR = join(homedir(), ".okx", "bin");

/**
 * Return the expected path to the okx-pilot binary.
 * Respects the `OKX_PILOT_BINARY_PATH` environment variable.
 */
export function getPilotBinaryPath(): string {
  if (process.env.OKX_PILOT_BINARY_PATH) {
    return process.env.OKX_PILOT_BINARY_PATH;
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  return join(PILOT_BIN_DIR, `okx-pilot${ext}`);
}

/**
 * Execute the okx-pilot binary for the given domain.
 *
 * @returns The resolved PilotNode, or null on any failure (binary missing,
 *          timeout, non-zero exit, malformed output).
 */
export function execPilotBinary(
  domain: string,
  exclude: string[] = [],
  userAgent?: string,
): Promise<PilotNode | null> {
  if (!ALLOWED_DOMAIN_RE.test(domain)) {
    return Promise.resolve(null);
  }
  const binPath = getPilotBinaryPath();
  const args = ["--domain", domain];
  if (exclude.length > 0) {
    args.push("--exclude", exclude.join(","));
  }
  if (userAgent) {
    args.push("--user-agent", userAgent);
  }
  return new Promise((resolve) => {
    execFile(
      binPath,
      args,
      { timeout: EXEC_TIMEOUT_MS, encoding: "utf-8" },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        try {
          const result: PilotBinaryResponse = JSON.parse(stdout);
          if (result.code === 0 && result.data) {
            resolve(result.data);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      },
    );
  });
}
