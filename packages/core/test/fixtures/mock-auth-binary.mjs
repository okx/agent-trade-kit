#!/usr/bin/env node
/**
 * Mock okx-auth binary for testing.
 *
 * Behavior is controlled by environment variables:
 *   MOCK_AUTH_EXIT           — exit code (default 0)
 *   MOCK_AUTH_TOKEN          — token value written to fd 3 for `token` subcommand
 *   MOCK_AUTH_STATUS_JSON    — JSON string written to stdout for `status --json`
 *
 * Subcommands:
 *   token         — writes MOCK_AUTH_TOKEN to fd 3, exits with MOCK_AUTH_EXIT
 *   status --json — writes MOCK_AUTH_STATUS_JSON to stdout, exits with MOCK_AUTH_EXIT
 *   login         — exits with MOCK_AUTH_EXIT
 *   logout        — exits with MOCK_AUTH_EXIT
 */

import { writeSync } from "node:fs";

const args = process.argv.slice(2);
const subcommand = args[0] ?? "";
const exitCode = parseInt(process.env.MOCK_AUTH_EXIT ?? "0", 10);

switch (subcommand) {
  case "token": {
    const token = process.env.MOCK_AUTH_TOKEN ?? "";
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
