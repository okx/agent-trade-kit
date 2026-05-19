/**
 * Windows-specific token delivery for the okx-auth binary.
 *
 * Windows has no fd inheritance like POSIX, so the consumer creates a named
 * pipe `\\.\pipe\okx-auth-<256-bit hex>` and passes the name to the child via
 * `OKX_AUTH_TOKEN_PIPE`. The child opens the pipe with
 * `CreateFileW(FILE_GENERIC_WRITE, OPEN_EXISTING)`, writes the access token,
 * and closes - signalling EOF to the parent.
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
 * socket has ended cleanly - resolving on either alone races on slow CI.
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

    // The dual-wait invariant: resolve only when we know there will be no
    // more pipe data - i.e. either (a) a connection happened and ended
    // cleanly, or (b) the child exited without ever connecting. On Windows
    // IOCP completions for the named pipe and process-exit notifications
    // ride different libuv paths, so we cannot assume socket data has been
    // dispatched by the time `child close` fires.
    let connectionMade = false;
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
      settle(() => finalizeToken(exitCode, token, resolve, reject));
    };

    server.on("connection", (socket) => {
      connectionMade = true;
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
        exitCode = code;
        // If no connection was ever made (e.g. exit 2 NOT_LOGGED_IN before
        // opening the pipe), unblock tryFinalize ourselves - socket.end will
        // never fire. If a connection WAS made, do NOT touch pipeClosed:
        // socket data may still be queued in libuv, and only socket.end can
        // tell us it has been drained.
        if (!connectionMade) pipeClosed = true;
        tryFinalize();
      });
    });
  });
}
