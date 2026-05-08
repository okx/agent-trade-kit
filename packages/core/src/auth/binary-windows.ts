/**
 * Windows-specific token delivery for the okx-auth binary.
 *
 * Windows has no fd inheritance like POSIX, so the consumer creates a named
 * pipe `\\.\pipe\okx-auth-<256-bit hex>` and passes the name to the child via
 * `OKX_AUTH_TOKEN_PIPE`. The child opens the pipe with
 * `CreateFileW(FILE_GENERIC_WRITE, OPEN_EXISTING)`, writes the access token,
 * and closes — signalling EOF to the parent.
 *
 * The Rust binary enforces the `\\.\pipe\okx-auth-` prefix and scrubs
 * `OKX_AUTH_TOKEN_PIPE` from its environment immediately after read so it
 * never leaks to grandchildren.
 *
 * @internal Imported by binary.ts (production dispatch) and the unit tests.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:net";
import { randomBytes } from "node:crypto";
import { finalizeToken, spawnFailedError } from "./binary-shared.js";

/** The okx-auth binary requires every pipe name to start with this prefix. */
const WIN_PIPE_PREFIX = String.raw`\\.\pipe\okx-auth-`;

/** Default pipe-name generator used in production. */
export function defaultWindowsPipeName(): string {
  return WIN_PIPE_PREFIX + randomBytes(32).toString("hex");
}

/**
 * Spawn `okx-auth token` and read the access token from a per-invocation
 * named pipe. Resolves only after **both** the child has exited AND the pipe
 * socket has ended cleanly — resolving on either alone races on slow CI.
 *
 * `makePipeName` is injectable so the unit tests can substitute a UNIX
 * domain socket path on POSIX hosts (Node's `net.createServer` abstracts the
 * transport, so the same code path is exercised without a Windows runner).
 */
export function execAuthTokenWindows(
  binPath: string,
  makePipeName: () => string = defaultWindowsPipeName,
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
        if (!pipeClosed) pipeClosed = true;
        exitCode = code;
        tryFinalize();
      });
    });
  });
}
