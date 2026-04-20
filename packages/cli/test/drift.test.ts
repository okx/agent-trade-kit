/**
 * Bidirectional drift test — ensures CLI Registry and ToolSpec registry stay in sync.
 *
 * Direction 1 (ToolSpec → CLI): every name from allToolSpecs() must appear as
 * `toolName` or in `alternateTools` somewhere in CLI_REGISTRY, OR be explicitly
 * listed in EXCLUDED_FROM_CLI with a justification comment.
 *
 * Direction 2 (CLI → ToolSpec): every non-null toolName and alternateTools entry
 * in CLI_REGISTRY must correspond to a name in allToolSpecs().
 *
 * This test prevents a repeat of the `indicator` drift incident (issue #140).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allToolSpecs } from "@agent-tradekit/core";
import { CLI_REGISTRY, getAllRegisteredToolNames } from "../src/cli-registry.js";

/**
 * ToolSpecs that have no direct CLI registry entry.
 * Key = tool name, value = justification.
 *
 * Keep this list as short as possible; every entry is a gap in CLI coverage.
 */
const EXCLUDED_FROM_CLI: Record<string, string> = {
  // Currently none — all ToolSpecs are accessible via CLI.
};

describe("CLI registry ↔ ToolSpec drift test", () => {
  const specs = allToolSpecs();
  const specNames = new Set(specs.map((s) => s.name));
  const registeredNames = getAllRegisteredToolNames();

  // ── Direction 1: ToolSpec → Registry ──────────────────────────────────────
  describe("every ToolSpec has a CLI registry entry (or is explicitly excluded)", () => {
    for (const spec of specs) {
      const name = spec.name;
      it(`ToolSpec '${name}' is registered in CLI registry`, () => {
        const isInRegistry = registeredNames.has(name);
        const isExcluded = name in EXCLUDED_FROM_CLI;
        assert.ok(
          isInRegistry || isExcluded,
          `ToolSpec '${name}' has no CLI registry entry.\n` +
            `  → Add an entry to CLI_REGISTRY in packages/cli/src/cli-registry.ts,\n` +
            `    or add to EXCLUDED_FROM_CLI in this test with a justification comment.`,
        );
      });
    }
  });

  // ── Direction 2: Registry → ToolSpec ──────────────────────────────────────
  describe("every CLI registry toolName exists in allToolSpecs()", () => {
    for (const name of registeredNames) {
      it(`CLI registry toolName '${name}' exists in allToolSpecs()`, () => {
        assert.ok(
          specNames.has(name),
          `CLI registry references non-existent ToolSpec '${name}'.\n` +
            `  → Remove or fix this entry in packages/cli/src/cli-registry.ts.`,
        );
      });
    }
  });
});
