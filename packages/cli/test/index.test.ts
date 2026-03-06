import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { OkxRestClient } from "@agent-tradekit/core";
import {
  printHelp,
  handleConfigCommand,
  handleSetupCommand,
  handleMarketPublicCommand,
  handleMarketDataCommand,
  handleMarketCommand,
  handleAccountWriteCommand,
  handleBotGridCommand,
  handleBotCommand,
  handleSwapCommand,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helper: capture stdout without writing to the terminal
// ---------------------------------------------------------------------------
function captureStdout(fn: () => void | Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  const restore = () => {
    process.stdout.write = orig;
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => { restore(); return chunks.join(""); }, (e) => { restore(); throw e; });
    }
  } catch (e) {
    restore();
    throw e;
  }
  restore();
  return Promise.resolve(chunks.join(""));
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = orig;
  }
  return chunks.join("");
}

// Null client: safe to pass when action never matches (falls through all ifs)
const noopClient = null as unknown as OkxRestClient;

// ---------------------------------------------------------------------------
// printHelp
// ---------------------------------------------------------------------------
describe("printHelp", () => {
  it("outputs usage text to stdout", async () => {
    const out = await captureStdout(() => printHelp());
    assert.ok(out.includes("Usage: okx"), "should include Usage line");
    assert.ok(out.includes("market"), "should include market commands");
    assert.ok(out.includes("account"), "should include account commands");
    assert.ok(out.includes("setup"), "should include setup command");
  });

  it("includes all major command groups", async () => {
    const out = await captureStdout(() => printHelp());
    for (const cmd of ["spot", "swap", "futures", "bot", "config"]) {
      assert.ok(out.includes(cmd), `should mention '${cmd}'`);
    }
  });
});

// ---------------------------------------------------------------------------
// handleSetupCommand
// ---------------------------------------------------------------------------
describe("handleSetupCommand", () => {
  it("prints setup usage when --client is not provided", async () => {
    const out = await captureStdout(() => handleSetupCommand({}));
    assert.ok(out.includes("Usage:"), "should print usage");
  });

  it("writes error and sets exitCode for unknown client", () => {
    const origCode = process.exitCode;
    const err = captureStderr(() => handleSetupCommand({ client: "not-a-valid-client" }));
    assert.ok(err.includes("Unknown client"), "should report unknown client");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });

  describe("with temp HOME directory", () => {
    let tmpDir: string;
    let origHome: string | undefined;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "okx-cli-setup-"));
      origHome = process.env.HOME;
      process.env.HOME = tmpDir;
    });

    after(() => {
      process.env.HOME = origHome;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("creates cursor config when --client cursor is provided", async () => {
      const out = await captureStdout(() =>
        handleSetupCommand({ client: "cursor", modules: "all" })
      );
      const configPath = path.join(tmpDir, ".cursor", "mcp.json");
      assert.ok(fs.existsSync(configPath), "config file should be created");
      assert.ok(out.includes("Configured Cursor"), "should confirm configuration");
    });
  });
});

// ---------------------------------------------------------------------------
// handleConfigCommand
// ---------------------------------------------------------------------------
describe("handleConfigCommand", () => {
  it("writes error for unknown action", () => {
    const origCode = process.exitCode;
    const err = captureStderr(() => handleConfigCommand("unknown-action-xyz", [], false));
    assert.ok(err.includes("Unknown config command"), "should report unknown command");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });

  it("calls setup-clients action without throwing", async () => {
    await assert.doesNotReject(async () => {
      await captureStdout(() => handleConfigCommand("setup-clients", [], false));
    });
  });

  it("calls show action without throwing", async () => {
    await assert.doesNotReject(async () => {
      await captureStdout(() => handleConfigCommand("show", [], false));
    });
  });
});

// ---------------------------------------------------------------------------
// handleMarketPublicCommand — dispatch coverage (noop client, no action match)
// ---------------------------------------------------------------------------
describe("handleMarketPublicCommand", () => {
  it("returns undefined for unknown action (covers all if-check lines)", () => {
    const result = handleMarketPublicCommand(noopClient, "noop", [], {}, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleMarketDataCommand — dispatch coverage
// ---------------------------------------------------------------------------
describe("handleMarketDataCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleMarketDataCommand(noopClient, "noop", [], {}, false);
    assert.equal(result, undefined);
  });

  it("evaluates limit from v.limit when set", () => {
    const result = handleMarketDataCommand(noopClient, "noop", [], { limit: "50" }, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleMarketCommand — thin dispatcher
// ---------------------------------------------------------------------------
describe("handleMarketCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleMarketCommand(noopClient, "noop", [], {}, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleAccountWriteCommand — dispatch coverage
// ---------------------------------------------------------------------------
describe("handleAccountWriteCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleAccountWriteCommand(noopClient, "noop", {}, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleBotGridCommand — dispatch coverage
// ---------------------------------------------------------------------------
describe("handleBotGridCommand", () => {
  it("returns undefined when rest[0] is undefined (no subAction match)", () => {
    const result = handleBotGridCommand(noopClient, {}, [], false);
    assert.equal(result, undefined);
  });

  it("returns undefined for unknown subAction", () => {
    const result = handleBotGridCommand(noopClient, {}, ["noop"], false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleBotCommand — dispatch coverage
// ---------------------------------------------------------------------------
describe("handleBotCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleBotCommand(noopClient, "noop", [], {}, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleSwapCommand — dispatch coverage including swap amend
// ---------------------------------------------------------------------------
describe("handleSwapCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleSwapCommand(noopClient, "noop", [], {}, false);
    assert.equal(result, undefined);
  });

  it("dispatches amend action (returns a Promise)", () => {
    const mockClient = {
      privatePost: () => Promise.resolve({ data: [{ ordId: "123", sCode: "0" }] }),
    } as unknown as OkxRestClient;
    const result = handleSwapCommand(mockClient, "amend", [], { instId: "BTC-USDT-SWAP", ordId: "123", newPx: "50000", json: false } as never, false);
    assert.ok(result instanceof Promise, "amend should return a Promise");
  });
});
