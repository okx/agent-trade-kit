/**
 * Tests for okx list-tools --json command (agent self-discovery).
 * Verifies structured JSON output for programmatic tool enumeration.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDiscoveryOutput } from "../src/commands/discovery.js";

describe("getDiscoveryOutput() — agent discovery JSON", () => {
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
});
