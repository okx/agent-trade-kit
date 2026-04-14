/**
 * Tests for TP/SL amend discoverability in CLI registry (#151).
 *
 * Verifies that CLI registry descriptions contain routing hints guiding users
 * toward the correct path for modifying attached TP/SL orders:
 *   "algo amend" for regular amend commands
 *   "attached TP/SL" note for algo amend commands
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLI_REGISTRY } from "../src/cli-registry.js";

function getCommandDescription(module: string, command: string): string {
  const moduleEntry = CLI_REGISTRY[module];
  assert.ok(moduleEntry, `Module '${module}' not found in CLI_REGISTRY`);
  const commandEntry = moduleEntry.commands?.[command];
  assert.ok(commandEntry, `Command '${command}' not found in CLI_REGISTRY['${module}'].commands`);
  assert.ok(commandEntry.description, `Command '${module} ${command}' has no description`);
  return commandEntry.description!;
}

function getAlgoCommandDescription(module: string, command: string): string {
  const moduleEntry = CLI_REGISTRY[module];
  assert.ok(moduleEntry, `Module '${module}' not found in CLI_REGISTRY`);
  const algoEntry = moduleEntry.subgroups?.["algo"];
  assert.ok(algoEntry, `Subgroup 'algo' not found in CLI_REGISTRY['${module}']`);
  const commandEntry = algoEntry.commands?.[command];
  assert.ok(commandEntry, `Command '${command}' not found in CLI_REGISTRY['${module}'].subgroups.algo.commands`);
  assert.ok(commandEntry.description, `Command '${module} algo ${command}' has no description`);
  return commandEntry.description!;
}

describe("TP/SL amend discoverability — CLI registry descriptions", () => {
  describe("regular amend commands: must route users to algo amend for TP/SL", () => {
    it("spot amend description mentions 'algo amend' for TP/SL", () => {
      const desc = getCommandDescription("spot", "amend");
      assert.ok(
        desc.includes("algo amend"),
        `Expected spot amend description to mention 'algo amend'.\nGot: "${desc}"`,
      );
    });

    it("swap amend description mentions 'algo amend' for TP/SL", () => {
      const desc = getCommandDescription("swap", "amend");
      assert.ok(
        desc.includes("algo amend"),
        `Expected swap amend description to mention 'algo amend'.\nGot: "${desc}"`,
      );
    });

    it("futures amend description mentions 'algo amend' for TP/SL", () => {
      const desc = getCommandDescription("futures", "amend");
      assert.ok(
        desc.includes("algo amend"),
        `Expected futures amend description to mention 'algo amend'.\nGot: "${desc}"`,
      );
    });

    it("option amend description mentions 'algo amend' for TP/SL", () => {
      const desc = getCommandDescription("option", "amend");
      assert.ok(
        desc.includes("algo amend"),
        `Expected option amend description to mention 'algo amend'.\nGot: "${desc}"`,
      );
    });
  });

  describe("algo amend commands: must mention attached TP/SL coverage", () => {
    it("spot algo amend description mentions 'attached TP/SL'", () => {
      const desc = getAlgoCommandDescription("spot", "amend");
      assert.ok(
        desc.includes("including attached TP/SL"),
        `Expected spot algo amend description to contain 'including attached TP/SL'.\nGot: "${desc}"`,
      );
    });

    it("swap algo amend description mentions 'attached TP/SL'", () => {
      const desc = getAlgoCommandDescription("swap", "amend");
      assert.ok(
        desc.includes("including attached TP/SL"),
        `Expected swap algo amend description to contain 'including attached TP/SL'.\nGot: "${desc}"`,
      );
    });

    it("futures algo amend description mentions 'attached TP/SL'", () => {
      const desc = getAlgoCommandDescription("futures", "amend");
      assert.ok(
        desc.includes("including attached TP/SL"),
        `Expected futures algo amend description to contain 'including attached TP/SL'.\nGot: "${desc}"`,
      );
    });

    it("option algo amend description mentions 'attached TP/SL'", () => {
      const desc = getAlgoCommandDescription("option", "amend");
      assert.ok(
        desc.includes("including attached TP/SL"),
        `Expected option algo amend description to contain 'including attached TP/SL'.\nGot: "${desc}"`,
      );
    });
  });
});
