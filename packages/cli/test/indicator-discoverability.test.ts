/**
 * Tests for indicator --list flag discoverability in CLI registry (ALGO-44118).
 *
 * Verifies that the CLI registry usage and description for `<indicator> <instId>`
 * correctly surface the --list flag, so users know a series requires --list + --limit.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLI_REGISTRY } from "../src/cli-registry.js";

function getIndicatorCommand() {
  const market = CLI_REGISTRY["market"];
  assert.ok(market, "market module not found in CLI_REGISTRY");
  const indicator = market.subgroups?.["indicator"];
  assert.ok(indicator, "indicator subgroup not found in CLI_REGISTRY['market']");
  const cmd = indicator.commands?.["<indicator> <instId>"];
  assert.ok(cmd, "'<indicator> <instId>' command not found in indicator subgroup");
  return cmd;
}

describe("indicator command discoverability - CLI registry (ALGO-44118)", () => {
  it("usage contains [--list]", () => {
    const cmd = getIndicatorCommand();
    assert.ok(
      cmd.usage.includes("[--list]"),
      `Expected usage to include '[--list]'.\nGot: "${cmd.usage}"`,
    );
  });

  it("usage places [--list] before [--limit]", () => {
    const cmd = getIndicatorCommand();
    const listIdx = cmd.usage.indexOf("[--list]");
    const limitIdx = cmd.usage.indexOf("[--limit");
    assert.ok(listIdx !== -1, "usage must include [--list]");
    assert.ok(limitIdx !== -1, "usage must include [--limit]");
    assert.ok(
      listIdx < limitIdx,
      `Expected [--list] to appear before [--limit] in usage.\nGot: "${cmd.usage}"`,
    );
  });

  it("description mentions --list", () => {
    const cmd = getIndicatorCommand();
    assert.ok(
      cmd.description.includes("--list"),
      `Expected description to mention '--list'.\nGot: "${cmd.description}"`,
    );
  });

  it("description explains default behavior (returns latest value)", () => {
    const cmd = getIndicatorCommand();
    const desc = cmd.description.toLowerCase();
    const mentionsDefault = desc.includes("latest") || desc.includes("default");
    assert.ok(
      mentionsDefault,
      `Expected description to mention default behavior (\"latest\" or \"default\").\nGot: "${cmd.description}"`,
    );
  });
});
