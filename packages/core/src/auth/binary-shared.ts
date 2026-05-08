/**
 * Shared helpers used by both Unix (fd 3) and Windows (named pipe) token
 * delivery paths in `binary.ts` / `binary-windows.ts`. Kept in a separate
 * module so neither platform-specific file needs to depend on the other.
 *
 * @internal
 */
import { AuthenticationError, ConfigError, NotLoggedInError } from "../utils/errors.js";
import { EXIT_CODES } from "./types.js";

/**
 * Map okx-auth's exit code + delivered token to the public-facing
 * resolve/reject. Both platforms route through this so error messages stay
 * identical regardless of OS.
 */
export function finalizeToken(
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

/** Wrap a spawn / IO error with a consistent ConfigError shape. */
export function spawnFailedError(err: Error): ConfigError {
  return new ConfigError(
    `Failed to spawn okx-auth: ${err.message}`,
    "Ensure the okx-auth binary exists and is executable.",
  );
}
