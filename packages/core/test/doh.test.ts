/**
 * Unit tests for DoH modules: binary path resolution.
 *
 * See doh-resolver.test.ts for resolver logic and doh-manager.test.ts for
 * DohManager state machine tests. rest-client DoH integration is not covered
 * by automated tests — verify manually in DNS-polluted environments.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// getDohBinaryPath (binary.ts)
// ---------------------------------------------------------------------------

describe("getDohBinaryPath", () => {
  const originalEnv = process.env.OKX_DOH_BINARY_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.OKX_DOH_BINARY_PATH;
    } else {
      process.env.OKX_DOH_BINARY_PATH = originalEnv;
    }
  });

  it("returns env override when OKX_DOH_BINARY_PATH is set", async () => {
    process.env.OKX_DOH_BINARY_PATH = "/custom/path/doh";
    const { getDohBinaryPath } = await import("../src/doh/binary.js");
    assert.equal(getDohBinaryPath(), "/custom/path/doh");
  });

  it("returns ~/.okx/bin/okx-pilot when env is not set", async () => {
    delete process.env.OKX_DOH_BINARY_PATH;
    const { getDohBinaryPath } = await import("../src/doh/binary.js");
    const path = getDohBinaryPath();
    assert.ok(path.includes(".okx"));
    assert.ok(path.includes("okx-pilot"));
  });
});
