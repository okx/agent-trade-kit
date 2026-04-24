import { spawn, execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { AuthenticationError, ConfigError, NotLoggedInError } from "../utils/errors.js";
import { EXIT_CODES } from "./types.js";
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
 * Spawn `okx-auth token` and read the access token from fd 3.
 *
 * The binary writes the token to fd 3 and closes it (EOF).
 * Node.js `spawn` with `stdio[3] = 'pipe'` creates the pipe automatically.
 *
 * Unlike the pilot binary (which returns null on failure), this function throws typed errors
 * because callers need to distinguish "not logged in" from "binary missing".
 */
export function execAuthToken(): Promise<string> {
  const binPath = getAuthBinaryPath();

  return new Promise((resolve, reject) => {
    const child = spawn(binPath, ["token"], {
      stdio: ["ignore", "ignore", "inherit", "pipe"],
      //       stdin    stdout    stderr     fd3 (pipe)
    });

    const chunks: Buffer[] = [];
    const fd3 = child.stdio[3]!;

    fd3.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("error", (err) => {
      reject(new ConfigError(
        `Failed to spawn okx-auth: ${err.message}`,
        "Ensure the okx-auth binary exists and is executable.",
      ));
    });

    child.on("close", (code) => {
      if (code === EXIT_CODES.SUCCESS) {
        const token = Buffer.concat(chunks).toString("utf-8").trim();
        if (!token) {
          reject(new AuthenticationError(
            "okx-auth returned empty token.",
            "Run `okx auth login` to re-authenticate.",
          ));
          return;
        }
        resolve(token);
        return;
      }

      if (code === EXIT_CODES.NOT_LOGGED_IN) {
        reject(new NotLoggedInError());
        return;
      }

      if (code === EXIT_CODES.UNAUTHORIZED_CALLER) {
        reject(new AuthenticationError(
          "okx-auth rejected the caller (unauthorized).",
          "Ensure you are running from a trusted OKX tool.",
        ));
        return;
      }

      if (code === EXIT_CODES.REFRESH_FAILED) {
        reject(new AuthenticationError(
          "Token refresh failed.",
          "Run `okx auth login` to re-authenticate.",
        ));
        return;
      }

      reject(new AuthenticationError(
        `okx-auth token exited with code ${code}.`,
        "Run `okx auth login` to re-authenticate.",
      ));
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
