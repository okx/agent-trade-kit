import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DohBinaryResponse, DohNode } from "./types.js";

/** Default timeout for the DoH binary (ms). */
const EXEC_TIMEOUT_MS = 15_000;

/** Directory under the user's home where the binary lives. */
const DOH_BIN_DIR = join(homedir(), ".okx", "bin");

/** Cache file managed by the binary itself. */
const DOH_CACHE_FILE = join(homedir(), ".okx", ".doh-cache.json");

/**
 * Return the expected path to the okx-doh-resolver binary.
 * Respects the `OKX_DOH_BINARY_PATH` environment variable.
 */
export function getDohBinaryPath(): string {
  if (process.env.OKX_DOH_BINARY_PATH) {
    return process.env.OKX_DOH_BINARY_PATH;
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  return join(DOH_BIN_DIR, `okx-doh-resolver${ext}`);
}

/** Return the path to the binary's own cache file. */
export function getDohCachePath(): string {
  return DOH_CACHE_FILE;
}

/** Check whether the DoH binary exists and is executable. */
export async function dohBinaryExists(): Promise<boolean> {
  try {
    const flag = process.platform === "win32" ? constants.F_OK : constants.X_OK;
    await access(getDohBinaryPath(), flag);
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute the okx-doh-resolver binary for the given domain.
 *
 * @returns The resolved DohNode, or null on any failure (binary missing,
 *          timeout, non-zero exit, malformed output).
 */
export function execDohBinary(domain: string): Promise<DohNode | null> {
  const binPath = getDohBinaryPath();
  return new Promise((resolve) => {
    execFile(
      binPath,
      ["--domain", domain],
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
