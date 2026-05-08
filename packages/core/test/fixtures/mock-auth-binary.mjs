#!/usr/bin/env node
/**
 * Mock okx-auth binary for testing.
 *
 * Behavior is controlled by environment variables:
 *   MOCK_AUTH_EXIT           — exit code (default 0)
 *   MOCK_AUTH_TOKEN          — token value written to fd 3 for `token` subcommand
 *   MOCK_AUTH_STATUS_JSON    — JSON string written to stdout for `status --json`
 *   MOCK_AUTH_ARGS_FILE      — when set, write JSON-serialised argv (minus node+script) to this path
 *
 * Subcommands:
 *   token         — writes MOCK_AUTH_TOKEN to fd 3, exits with MOCK_AUTH_EXIT
 *   status --json — writes MOCK_AUTH_STATUS_JSON to stdout, exits with MOCK_AUTH_EXIT
 *   login         — exits with MOCK_AUTH_EXIT
 *   logout        — exits with MOCK_AUTH_EXIT
 */

import { writeSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";

const args = process.argv.slice(2);
const subcommand = args[0] ?? "";
const exitCode = parseInt(process.env.MOCK_AUTH_EXIT ?? "0", 10);

// When MOCK_AUTH_ARGS_FILE is set, dump received args for parameter routing tests
if (process.env.MOCK_AUTH_ARGS_FILE) {
  writeFileSync(process.env.MOCK_AUTH_ARGS_FILE, JSON.stringify(args));
}

/**
 * Write the token to OKX_AUTH_TOKEN_PIPE (Windows named pipe), mirroring what
 * the real okx-auth binary does. Returns a Promise that resolves once the pipe
 * is fully closed so the parent observes a clean EOF.
 */
function writeTokenToPipe(pipeName, token) {
  return new Promise((resolve) => {
    const sock = createConnection(pipeName);
    sock.on("error", (err) => {
      // Surface to test logs — silently swallowing makes failed-pipe debugging
      // miserable. The test parent has already failed by this point anyway.
      process.stderr.write(`mock-auth-binary: pipe connect failed: ${err.message}\n`);
      resolve();
    });
    sock.on("connect", () => {
      sock.end(token, () => resolve());
    });
  });
}

switch (subcommand) {
  case "token": {
    const token = process.env.MOCK_AUTH_TOKEN ?? "";
    const pipe = process.env.OKX_AUTH_TOKEN_PIPE;

    const done = () => process.exit(exitCode);

    if (pipe) {
      // Pipe-delivery path: real Windows binary writes here, and tests on
      // POSIX point this at a UNIX domain socket so the same code path is
      // covered without a Windows machine. Skip the fd-3 write either way.
      writeTokenToPipe(pipe, token).then(done, done);
      break;
    }

    if (token) {
      try {
        writeSync(3, token);
      } catch {
        // fd 3 may not be open — ignore
      }
    }
    process.exit(exitCode);
    break;
  }

  case "status": {
    const json = process.env.MOCK_AUTH_STATUS_JSON ?? "";
    if (json) {
      process.stdout.write(json);
    }
    process.exit(exitCode);
    break;
  }

  case "login":
  case "logout":
    process.exit(exitCode);
    break;

  default:
    process.stderr.write(`Unknown subcommand: ${subcommand}\n`);
    process.exit(1);
}
