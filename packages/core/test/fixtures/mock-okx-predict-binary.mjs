#!/usr/bin/env node
/**
 * Mock okx-predict binary for testing.
 *
 * Behavior is controlled by environment variables:
 *   MOCK_PREDICT_EXIT       — exit code (default 0)
 *   MOCK_PREDICT_STDOUT     — string written to stdout
 *   MOCK_PREDICT_STDERR     — string written to stderr
 *   MOCK_PREDICT_ARGS_FILE  — when set, write JSON-serialised argv (minus node+script) to this path
 */

import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const exitCode = parseInt(process.env.MOCK_PREDICT_EXIT ?? "0", 10);

if (process.env.MOCK_PREDICT_ARGS_FILE) {
  writeFileSync(process.env.MOCK_PREDICT_ARGS_FILE, JSON.stringify(args));
}

if (process.env.MOCK_PREDICT_STDOUT) {
  process.stdout.write(process.env.MOCK_PREDICT_STDOUT);
}
if (process.env.MOCK_PREDICT_STDERR) {
  process.stderr.write(process.env.MOCK_PREDICT_STDERR);
}

process.exit(exitCode);
