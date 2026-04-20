import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DohBinaryResponse, DohNode } from "./types.js";

/** Default timeout for the DoH binary (ms). */
const EXEC_TIMEOUT_MS = 30_000;

/** Only allow *.okx.com domains */
const ALLOWED_DOMAIN_RE = /^[\w.-]+\.okx\.com$/;

/** Directory under the user's home where the binary lives. */
const DOH_BIN_DIR = join(homedir(), ".okx", "bin");

/**
 * Return the expected path to the okx-pilot binary.
 * Respects the `OKX_DOH_BINARY_PATH` environment variable.
 */
export function getDohBinaryPath(): string {
  if (process.env.OKX_DOH_BINARY_PATH) {
    return process.env.OKX_DOH_BINARY_PATH;
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  return join(DOH_BIN_DIR, `okx-pilot${ext}`);
}

/**
 * Execute the okx-pilot binary for the given domain.
 *
 * @returns The resolved DohNode, or null on any failure (binary missing,
 *          timeout, non-zero exit, malformed output).
 */
export function execDohBinary(
  domain: string,
  exclude: string[] = [],
  userAgent?: string,
): Promise<DohNode | null> {
  if (!ALLOWED_DOMAIN_RE.test(domain)) {
    return Promise.resolve(null);
  }
  const binPath = getDohBinaryPath();
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
          const result: DohBinaryResponse = JSON.parse(stdout);
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
