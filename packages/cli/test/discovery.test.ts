/**
 * Tests for okx list-tools --json command (agent self-discovery).
 * Verifies structured JSON output for programmatic tool enumeration.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLI_REGISTRY, type CliModuleEntry } from "../src/cli-registry.js";
import { getDiscoveryOutput } from "../src/commands/discovery.js";

function collectAiBuilderUsagePaths(modulePath: string, mod: CliModuleEntry, paths: string[] = []): string[] {
  for (const [cmdName, entry] of Object.entries(mod.commands ?? {})) {
    if (entry.usage.includes("--aiBuilderCode")) {
      paths.push(`${modulePath} ${cmdName}`);
    }
  }
  for (const [sgName, subgroup] of Object.entries(mod.subgroups ?? {})) {
    collectAiBuilderUsagePaths(`${modulePath} ${sgName}`, subgroup, paths);
  }
  return paths;
}

describe("getDiscoveryOutput() - agent discovery JSON", () => {
  it("returns an object with version, modules, totalTools", () => {
    const result = getDiscoveryOutput();
    assert.ok(typeof result.version === "string", "should have version string");
    assert.ok(Array.isArray(result.modules), "should have modules array");
    assert.ok(typeof result.totalTools === "number", "should have totalTools count");
  });

  it("modules have name, description, commands", () => {
    const result = getDiscoveryOutput();
    assert.ok(result.modules.length > 0, "should have at least one module");
    for (const mod of result.modules) {
      assert.ok(typeof mod.name === "string", "module should have name");
      assert.ok(typeof mod.description === "string", "module should have description");
      assert.ok(Array.isArray(mod.commands), "module should have commands array");
    }
  });

  it("includes market module with ticker command", () => {
    const result = getDiscoveryOutput();
    const marketMod = result.modules.find((m) => m.name === "market");
    assert.ok(marketMod, "should include market module");
    const tickerCmd = marketMod!.commands.find((c) => c.path === "okx market ticker");
    assert.ok(tickerCmd, "market module should include ticker command");
    assert.ok(typeof tickerCmd!.toolName === "string", "ticker command should have toolName");
    assert.ok(typeof tickerCmd!.description === "string", "ticker command should have description");
    assert.ok(Array.isArray(tickerCmd!.parameters), "ticker command should have parameters array");
  });

  it("includes indicator command in market module", () => {
    const result = getDiscoveryOutput();
    const marketMod = result.modules.find((m) => m.name === "market");
    assert.ok(marketMod, "should include market module");
    // indicator is a subgroup — commands under it should be prefixed with market.indicator
    const indicatorCmds = marketMod!.commands.filter((c) => c.path.includes("indicator"));
    assert.ok(indicatorCmds.length > 0, "market module should include indicator commands");
  });

  it("totalTools matches the actual number of commands with toolNames", () => {
    const result = getDiscoveryOutput();
    let count = 0;
    for (const mod of result.modules) {
      count += mod.commands.filter((c) => c.toolName !== null).length;
    }
    assert.equal(result.totalTools, count, "totalTools should equal commands with non-null toolNames");
  });

  it("ticker command has instId as a required parameter", () => {
    const result = getDiscoveryOutput();
    const marketMod = result.modules.find((m) => m.name === "market");
    const tickerCmd = marketMod!.commands.find((c) => c.path === "okx market ticker");
    assert.ok(tickerCmd, "should find ticker command");
    const instIdParam = tickerCmd!.parameters.find((p) => p.name === "instId");
    assert.ok(instIdParam, "ticker should have instId parameter");
    assert.equal(instIdParam!.required, true, "instId should be required");
  });

  it("includes aiBuilderCode for CLI commands that advertise the flag", () => {
    const result = getDiscoveryOutput();
    const expectedPaths = Object.entries(CLI_REGISTRY)
      .flatMap(([moduleKey, moduleEntry]) => collectAiBuilderUsagePaths(`okx ${moduleKey}`, moduleEntry))
      .sort();
    const actualPaths = result.modules
      .flatMap((m) => m.commands)
      .filter((c) => c.parameters.some((p) => p.name === "aiBuilderCode" && p.required === false))
      .map((c) => c.path)
      .sort();

    assert.deepEqual(actualPaths, expectedPaths);
  });

  it("describes aiBuilderCode as an order-placement attribution parameter", () => {
    const result = getDiscoveryOutput();
    const params = result.modules
      .flatMap((m) => m.commands)
      .flatMap((c) => c.parameters)
      .filter((p) => p.name === "aiBuilderCode");

    assert.ok(params.length > 0, "should expose aiBuilderCode on at least one command");
    for (const param of params) {
      assert.match(param.description ?? "", /order-placement actions/);
    }
  });
});
