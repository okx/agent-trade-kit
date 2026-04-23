/**
 * Unit tests for Pilot modules: binary path resolution.
 *
 * See pilot-resolver.test.ts for resolver logic and pilot-manager.test.ts for
 * PilotManager state machine tests. rest-client Pilot integration is not covered
 * by automated tests — verify manually in DNS-polluted environments.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// getPilotBinaryPath (binary.ts)
// ---------------------------------------------------------------------------

describe("getPilotBinaryPath", () => {
  const originalEnv = process.env.OKX_PILOT_BINARY_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OKX_PILOT_BINARY_PATH;
    } else {
      process.env.OKX_PILOT_BINARY_PATH = originalEnv;
    }
  });

  it("returns env override when OKX_PILOT_BINARY_PATH is set", async () => {
    process.env.OKX_PILOT_BINARY_PATH = "/custom/path/pilot";
    const { getPilotBinaryPath } = await import("../src/pilot/binary.js");
    assert.equal(getPilotBinaryPath(), "/custom/path/pilot");
  });

  it("returns ~/.okx/bin/okx-pilot when env is not set", async () => {
    delete process.env.OKX_PILOT_BINARY_PATH;
    const { getPilotBinaryPath } = await import("../src/pilot/binary.js");
    const path = getPilotBinaryPath();
    assert.ok(path.includes(".okx"));
    assert.ok(path.includes("okx-pilot"));
  });
});
