#!/usr/bin/env node
/**
 * Mock okx-outcomes binary for testing.
 *
 * Behavior is controlled by environment variables:
 *   MOCK_OUTCOMES_EXIT       — exit code (default 0)
 *   MOCK_OUTCOMES_STDOUT     — string written to stdout
 *   MOCK_OUTCOMES_STDERR     — string written to stderr
 *   MOCK_OUTCOMES_ARGS_FILE  — when set, write JSON-serialised argv (minus node+script) to this path
 */

import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const exitCode = parseInt(process.env.MOCK_OUTCOMES_EXIT ?? "0", 10);

if (process.env.MOCK_OUTCOMES_ARGS_FILE) {
  writeFileSync(process.env.MOCK_OUTCOMES_ARGS_FILE, JSON.stringify(args));
}

if (process.env.MOCK_OUTCOMES_STDOUT) {
  process.stdout.write(process.env.MOCK_OUTCOMES_STDOUT);
}
if (process.env.MOCK_OUTCOMES_STDERR) {
  process.stderr.write(process.env.MOCK_OUTCOMES_STDERR);
}

process.exit(exitCode);
