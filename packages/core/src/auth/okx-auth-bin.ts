import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuthenticationError, ConfigError } from "../utils/errors.js";

// Exit codes from the okx-auth binary (mirrors src/error.rs)
const EXIT_UNAUTHORIZED_CALLER = 1;
const EXIT_NOT_LOGGED_IN = 2;
const EXIT_REFRESH_FAILED = 3;

/** Platform-appropriate binary name and subdirectory. */
const BIN_NAME = process.platform === "win32" ? "okx-auth.exe" : "okx-auth";
const PLATFORM_DIR = `${process.platform}-${process.arch}`;

let resolvedBinPath: string | undefined;

/**
 * Resolve the okx-auth binary path.
 *
 * Priority:
 *   1. OKX_AUTH_BIN env var (explicit override)
 *   2. Walk up from this module's location, at each level check:
 *      a. bin/<platform-arch>/okx-auth[.exe]  (platform-specific)
 *      b. bin/okx-auth[.exe]                  (fallback)
 */
export function resolveOkxAuthBin(): string {
  // OKX_AUTH_BIN env var always takes priority (no caching — allows runtime override)
  const envPath = process.env.OKX_AUTH_BIN?.trim();
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new ConfigError(
        `OKX_AUTH_BIN points to "${envPath}" but the file does not exist.`,
        "Set OKX_AUTH_BIN to the absolute path of the okx-auth binary.",
      );
    }
    return envPath;
  }

  if (resolvedBinPath) return resolvedBinPath;

  const thisDir = dirname(fileURLToPath(import.meta.url));
  let dir = thisDir;
  for (let i = 0; i < 10; i++) {
    // a. Platform-specific: bin/darwin-arm64/okx-auth
    const platformCandidate = join(dir, "bin", PLATFORM_DIR, BIN_NAME);
    if (existsSync(platformCandidate)) {
      resolvedBinPath = platformCandidate;
      return resolvedBinPath;
    }
    // b. Fallback: bin/okx-auth
    const rootCandidate = join(dir, "bin", BIN_NAME);
    if (existsSync(rootCandidate)) {
      resolvedBinPath = rootCandidate;
      return resolvedBinPath;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }

  throw new ConfigError(
    "Could not find the okx-auth binary.",
    `Set OKX_AUTH_BIN to the absolute path of the okx-auth binary, or place it in bin/${BIN_NAME} at the project root.`,
  );
}

/**
 * Spawn `okx-auth token` and read the access token from fd 3.
 *
 * The binary writes the token to fd 3 and closes it (EOF).
 * Node.js `spawn` with `stdio[3] = 'pipe'` creates the pipe automatically.
 */
export function requestTokenViaFd3(): Promise<string> {
  const binPath = resolveOkxAuthBin();

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
      if (code === 0) {
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

      if (code === EXIT_NOT_LOGGED_IN) {
        reject(new ConfigError(
          "Not logged in.",
          "Run `okx auth login` to authenticate.",
        ));
        return;
      }

      if (code === EXIT_UNAUTHORIZED_CALLER) {
        reject(new AuthenticationError(
          "okx-auth rejected the caller (unauthorized).",
          "Ensure you are running from a trusted OKX tool.",
        ));
        return;
      }

      if (code === EXIT_REFRESH_FAILED) {
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
 * Synchronous check: is the user currently logged in via OAuth?
 *
 * Runs `okx-auth status --json` and parses the result.
 * Returns false on any error (binary missing, not logged in, etc.).
 * Used at config load time to set `hasAuth`.
 */
export function checkOAuthStatus(): boolean {
  try {
    const binPath = resolveOkxAuthBin();
    const stdout = execFileSync(binPath, ["status", "--json"], {
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
    });
    const result = JSON.parse(stdout) as { status?: string };
    return result.status === "logged_in";
  } catch {
    return false;
  }
}
