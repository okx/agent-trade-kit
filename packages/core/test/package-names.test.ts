/**
 * Consistency test: package.json names must match the strings passed to checkForUpdates().
 * Prevents renaming a package without updating the update-notifier call.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("package name consistency", () => {
  it("@okx_ai/okx-trade-mcp package.json name matches checkForUpdates call", () => {
    const pkg = require("../../mcp/package.json") as { name: string };
    assert.equal(
      pkg.name,
      "@okx_ai/okx-trade-mcp",
      `packages/mcp/package.json name is "${pkg.name}" but checkForUpdates is called with "@okx_ai/okx-trade-mcp"`,
    );
  });

  it("@okx_ai/okx-trade-cli package.json name matches checkForUpdates call", () => {
    const pkg = require("../../cli/package.json") as { name: string };
    assert.equal(
      pkg.name,
      "@okx_ai/okx-trade-cli",
      `packages/cli/package.json name is "${pkg.name}" but checkForUpdates is called with "@okx_ai/okx-trade-cli"`,
    );
  });
});
