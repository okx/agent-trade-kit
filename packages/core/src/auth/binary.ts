import { spawn, execFile, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { AuthenticationError, ConfigError, NotLoggedInError } from "../utils/errors.js";
import { EXIT_CODES } from "./types.js";
import type { AuthStatusResult } from "./types.js";

/** Default timeout for status/token commands (ms). */
const EXEC_TIMEOUT_MS = 5_000;

/** Directory under the user's home where the binary lives. */
const AUTH_BIN_DIR = join(homedir(), ".okx", "bin");

/** Windows-only: prefix the okx-auth binary requires for the token pipe name. */
const WIN_PIPE_PREFIX = String.raw`\\.\pipe\okx-auth-`;

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
 *   passes the name via `OKX_AUTH_TOKEN_PIPE`. The child opens it for write,
 *   emits the token, and closes (EOF).
 *
 * Throws typed errors so callers can distinguish "not logged in" from
 * "binary missing".
 */
export function execAuthToken(): Promise<string> {
  const binPath = getAuthBinaryPath();
  return process.platform === "win32"
    ? execAuthTokenWindows(binPath, defaultWindowsPipeName)
    : execAuthTokenUnix(binPath);
}

/** Default pipe-name generator. The okx-auth binary requires the `okx-auth-` prefix. */
function defaultWindowsPipeName(): string {
  return WIN_PIPE_PREFIX + randomBytes(32).toString("hex");
}

/**
 * Internal test hook — exposes the Windows code path so it can be exercised
 * on POSIX hosts via a UNIX domain socket (Node abstracts the listen/connect
 * semantics across platforms). NOT a public API.
 */
export const __test__ = {
  execAuthTokenWindows,
};

/**
 * Unix token delivery via fd 3.
 */
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
 * Windows token delivery via a per-invocation named pipe.
 *
 * Steps:
 *   1. Generate `\\.\pipe\okx-auth-<256-bit hex>`.
 *   2. Listen on it (Node maps `net.createServer` → Windows named pipe with a
 *      current-user DACL by default).
 *   3. Spawn the child with `OKX_AUTH_TOKEN_PIPE=<name>`. The child enforces
 *      the `okx-auth-` prefix and scrubs the env var after read.
 *   4. Resolve once both (a) the child has exited 0 AND (b) the pipe socket
 *      ended cleanly. Resolving on either alone races on slow Windows CI.
 */
function execAuthTokenWindows(
  binPath: string,
  makePipeName: () => string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const pipeName = makePipeName();
    const server: Server = createServer();
    const chunks: Buffer[] = [];

    let pipeClosed = false;
    let exitCode: number | null | undefined;
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch { /* already closing */ }
      fn();
    };

    const tryFinalize = (): void => {
      if (!pipeClosed || exitCode === undefined) return;
      const token = Buffer.concat(chunks).toString("utf-8").trim();
      settle(() => finalizeToken(exitCode!, token, resolve, reject));
    };

    server.on("connection", (socket) => {
      socket.on("data", (c: Buffer) => chunks.push(c));
      socket.on("end", () => { pipeClosed = true; tryFinalize(); });
      socket.on("error", (err) => settle(() => reject(spawnFailedError(err))));
    });

    server.on("error", (err) => settle(() => reject(spawnFailedError(err))));

    server.listen(pipeName, () => {
      let child: ChildProcess;
      try {
        child = spawn(binPath, ["token"], {
          stdio: ["ignore", "ignore", "inherit"],
          env: { ...process.env, OKX_AUTH_TOKEN_PIPE: pipeName },
          windowsHide: true,
        });
      } catch (err) {
        settle(() => reject(spawnFailedError(err as Error)));
        return;
      }

      child.on("error", (err) => settle(() => reject(spawnFailedError(err))));
      child.on("close", (code) => {
        // Treat "no pipe data observed" as empty token — finalizeToken handles it.
        if (!pipeClosed) pipeClosed = true;
        exitCode = code;
        tryFinalize();
      });
    });
  });
}

/**
 * Map exit code + delivered token to the public-facing resolve/reject.
 * Shared by both platforms so error messages stay identical.
 */
function finalizeToken(
  code: number | null | undefined,
  token: string,
  resolve: (token: string) => void,
  reject: (err: Error) => void,
): void {
  if (code === EXIT_CODES.SUCCESS) {
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
}

function spawnFailedError(err: Error): ConfigError {
  return new ConfigError(
    `Failed to spawn okx-auth: ${err.message}`,
    "Ensure the okx-auth binary exists and is executable.",
  );
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
