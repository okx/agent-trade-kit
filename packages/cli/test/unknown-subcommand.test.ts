import { test } from "node:test";
import assert from "node:assert/strict";

import { unknownSubcommand, suggestSubcommand } from "../src/unknown-command.js";
import { setOutput, resetOutput } from "../src/formatter.js";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  handleSwapCommand,
  handleSpotCommand,
  handleBotCommand,
} from "../src/index.js";

function captureStderr(run: () => void | Promise<void>): Promise<{ exitCode: number | undefined; stderr: string[] }> {
  const lines: string[] = [];
  setOutput({
    out: () => {},
    err: (msg: string) => { lines.push(msg); },
  });
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  return Promise.resolve()
    .then(() => run())
    .then(() => ({ exitCode: process.exitCode, stderr: lines }))
    .finally(() => {
      process.exitCode = prevExit;
      resetOutput();
    });
}

test("unknownSubcommand emits diagnostic + sets exit code", async () => {
  const { exitCode, stderr } = await captureStderr(() => {
    unknownSubcommand("swap", "place-algo", ["place", "cancel", "algo"]);
  });

  assert.equal(exitCode, 1, "process.exitCode should be 1");
  const joined = stderr.join("\n");
  assert.match(joined, /Unknown command: okx swap place-algo/);
  assert.match(joined, /Available subcommands:/);
  assert.match(joined, /okx swap --help/);
});

test("unknownSubcommand suggests MCP-style 'x-y' → 'y x' rewrite", async () => {
  const { stderr } = await captureStderr(() => {
    unknownSubcommand("swap", "place-algo", ["positions", "orders", "place", "algo", "batch"]);
  });
  const joined = stderr.join("\n");
  // "place-algo" should invert to "algo place" because `algo` is a known action
  assert.match(joined, /Did you mean: okx swap algo place/);
});

test("unknownSubcommand shows no suggestion for random typos", async () => {
  const { stderr } = await captureStderr(() => {
    unknownSubcommand("swap", "palce", ["place", "cancel"]);
  });
  const joined = stderr.join("\n");
  assert.doesNotMatch(joined, /Did you mean/);
});

test("unknownSubcommand handles undefined action", async () => {
  const { exitCode, stderr } = await captureStderr(() => {
    unknownSubcommand("swap", undefined, ["place"]);
  });
  assert.equal(exitCode, 1);
  assert.match(stderr.join("\n"), /Unknown command: okx swap \(missing\)/);
});

test("suggestSubcommand: x-y form where y is a known action", () => {
  assert.equal(suggestSubcommand("place-algo", ["positions", "algo", "place"]), "algo place");
  assert.equal(suggestSubcommand("orders-algo", ["algo", "orders"]), "algo orders");
});

test("suggestSubcommand: no rewrite when neither part is a known action", () => {
  assert.equal(suggestSubcommand("foo-bar", ["place", "cancel"]), undefined);
});

test("suggestSubcommand: no rewrite for single-token or triple-hyphen", () => {
  assert.equal(suggestSubcommand("place", ["place"]), undefined);
  assert.equal(suggestSubcommand("a-b-c", ["a", "b", "c"]), undefined);
});

test("suggestSubcommand: no rewrite for undefined action", () => {
  assert.equal(suggestSubcommand(undefined, ["place"]), undefined);
});

// ---------------------------------------------------------------------------
// Handler-level integration: the original customer-facing regression.
// Before this fix, each handle*Command fell through silently on unknown
// actions, exit=0, no output. Verify each dispatch path now errors.
// ---------------------------------------------------------------------------

const spyRunner: ToolRunner = (async () => {
  throw new Error("spy runner should not be called for unknown-subcommand cases");
}) as ToolRunner;

function vals(overrides: Record<string, unknown> = {}) {
  return overrides as never;
}

test("handleSwapCommand(action='place-algo') errors + suggests 'algo place'", async () => {
  const { exitCode, stderr } = await captureStderr(async () => {
    await handleSwapCommand(spyRunner, "place-algo", [], vals(), false);
  });
  assert.equal(exitCode, 1);
  const joined = stderr.join("\n");
  assert.match(joined, /Unknown command: okx swap place-algo/);
  assert.match(joined, /Did you mean: okx swap algo place/);
});

test("handleSpotCommand(action='unknown-action') errors without a bad suggestion", async () => {
  const { exitCode, stderr } = await captureStderr(async () => {
    await handleSpotCommand(spyRunner, "some-typo", [], vals(), false);
  });
  assert.equal(exitCode, 1);
  assert.match(stderr.join("\n"), /Unknown command: okx spot some-typo/);
});

test("handleBotCommand(action='grrid') errors with available subcommands listed", async () => {
  const { exitCode, stderr } = await captureStderr(async () => {
    await handleBotCommand(spyRunner, "grrid", [], vals(), false);
  });
  assert.equal(exitCode, 1);
  const joined = stderr.join("\n");
  assert.match(joined, /Unknown command: okx bot grrid/);
  assert.match(joined, /Available subcommands: grid, dca/);
});
