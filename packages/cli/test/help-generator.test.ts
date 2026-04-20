/**
 * Tests for help-generator.ts — resolveCommandDescription sentence splitting.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveCommandDescription } from "../src/help-generator.js";
import type { ToolSpec } from "@agent-tradekit/core";
import type { CliCommandEntry } from "../src/cli-registry.js";

function makeSpec(description: string): ToolSpec {
  return {
    name: "test_tool",
    module: "market",
    description,
    inputSchema: { type: "object" },
    isWrite: false,
    handler: async () => ({}),
  };
}

function makeEntry(toolName: string | null, description?: string): CliCommandEntry {
  return { toolName, usage: "okx test", description };
}

describe("resolveCommandDescription", () => {
  it("returns entry.description when explicitly set", () => {
    const specMap = new Map<string, ToolSpec>();
    const entry = makeEntry("test_tool", "Custom CLI description");
    assert.equal(resolveCommandDescription(entry, specMap), "Custom CLI description");
  });

  it("falls back to ToolSpec first sentence", () => {
    const spec = makeSpec("Get latest ticker data. Also supports historical data.");
    const specMap = new Map([["test_tool", spec]]);
    const entry = makeEntry("test_tool");
    assert.equal(resolveCommandDescription(entry, specMap), "Get latest ticker data.");
  });

  it("does not split on e.g. abbreviation", () => {
    const spec = makeSpec("Get order details for instruments e.g. BTC-USDT. Returns full fill history.");
    const specMap = new Map([["test_tool", spec]]);
    const entry = makeEntry("test_tool");
    assert.equal(
      resolveCommandDescription(entry, specMap),
      "Get order details for instruments e.g. BTC-USDT.",
    );
  });

  it("does not split on i.e. abbreviation", () => {
    const spec = makeSpec("Returns the net position i.e. long minus short. Use for margin calc.");
    const specMap = new Map([["test_tool", spec]]);
    const entry = makeEntry("test_tool");
    assert.equal(
      resolveCommandDescription(entry, specMap),
      "Returns the net position i.e. long minus short.",
    );
  });

  it("does not split on vs. abbreviation", () => {
    const spec = makeSpec("Compare spot vs. futures prices for an instrument. Useful for basis trading.");
    const specMap = new Map([["test_tool", spec]]);
    const entry = makeEntry("test_tool");
    assert.equal(
      resolveCommandDescription(entry, specMap),
      "Compare spot vs. futures prices for an instrument.",
    );
  });

  it("handles single sentence without trailing period-space", () => {
    const spec = makeSpec("Get the current funding rate for a perpetual swap.");
    const specMap = new Map([["test_tool", spec]]);
    const entry = makeEntry("test_tool");
    assert.equal(
      resolveCommandDescription(entry, specMap),
      "Get the current funding rate for a perpetual swap.",
    );
  });

  it("returns fallback when no toolName and no description", () => {
    const specMap = new Map<string, ToolSpec>();
    const entry = makeEntry(null);
    assert.equal(resolveCommandDescription(entry, specMap), "(no description)");
  });

  it("returns custom fallback when provided", () => {
    const specMap = new Map<string, ToolSpec>();
    const entry = makeEntry(null);
    assert.equal(resolveCommandDescription(entry, specMap, "N/A"), "N/A");
  });
});
