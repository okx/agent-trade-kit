import { spawn, execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { execAuthTokenWindows } from "./binary-windows.js";
import { finalizeToken, spawnFailedError } from "./binary-shared.js";
import type { AuthStatusResult } from "./types.js";

/** Default timeout for status/token commands (ms). */
const EXEC_TIMEOUT_MS = 5_000;

/** Directory under the user's home where the binary lives. */
const AUTH_BIN_DIR = join(homedir(), ".okx", "bin");

/**
 * Return the expected path to the okx-auth binary.
 * Respects the `OKX_AUTH_BIN` environment variable.
 */
export function getAuthBinaryPath(): string {
  if (process.env.OKX_AUTH_BIN) {
    return process.env.OKX_AUTH_BIN;
  }
  const ext = process.platform === "win32" ? ".exe" : "";
  return join(AUTH_BIN_DIR, `okx-auth${ext}`);
}

/**
 * Spawn `okx-auth token` and read the access token from the platform-specific
 * delivery channel.
 *
 * - Unix: child writes the token to fd 3 and closes (EOF). Node's
 *   `stdio[3] = 'pipe'` creates the pipe automatically.
 * - Windows: parent creates a named pipe `\\.\pipe\okx-auth-<random>` and
 *   passes the name via `OKX_AUTH_TOKEN_PIPE` (see `binary-windows.ts`).
 *
 * Throws typed errors so callers can distinguish "not logged in" from
 * "binary missing".
 */
export function execAuthToken(): Promise<string> {
  const binPath = getAuthBinaryPath();
  return process.platform === "win32"
    ? execAuthTokenWindows(binPath)
    : execAuthTokenUnix(binPath);
}

/** Unix token delivery via fd 3. */
function execAuthTokenUnix(binPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binPath, ["token"], {
      stdio: ["ignore", "ignore", "inherit", "pipe"],
      //       stdin    stdout    stderr     fd3 (pipe)
    });

    const chunks: Buffer[] = [];
    const fd3 = child.stdio[3]!;

    fd3.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("error", (err) => {
      reject(spawnFailedError(err));
    });

    child.on("close", (code) => {
      const token = Buffer.concat(chunks).toString("utf-8").trim();
      finalizeToken(code, token, resolve, reject);
    });
  });
}

/**
 * Execute `okx-auth status --json` asynchronously.
 *
 * @returns Parsed status result, or null on any failure (binary missing,
 *          timeout, non-zero exit, malformed output).
 */
export function execAuthStatus(): Promise<AuthStatusResult | null> {
  const binPath = getAuthBinaryPath();
  return new Promise((resolve) => {
    execFile(
      binPath,
      ["status", "--json"],
      { timeout: EXEC_TIMEOUT_MS, encoding: "utf-8" },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        try {
          const result = JSON.parse(stdout) as AuthStatusResult;
          resolve(result);
        } catch {
          resolve(null);
        }
      },
    );
  });
}
