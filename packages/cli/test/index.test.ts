import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ToolRunner } from "@agent-tradekit/core";
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
  handleEarnCommand,
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

// Noop runner: safe to pass when action never matches (falls through all ifs)
const noopRunner = null as unknown as ToolRunner;

// Mock runner that returns fake tool results
const mockRunner: ToolRunner = async () => ({
  endpoint: "POST /api/v5/trade/amend-order",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "123", sCode: "0" }],
});

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
// handleMarketPublicCommand — dispatch coverage (noop runner, no action match)
// ---------------------------------------------------------------------------
describe("handleMarketPublicCommand", () => {
  it("returns undefined for unknown action (covers all if-check lines)", () => {
    const result = handleMarketPublicCommand(noopRunner, "noop", [], {}, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleMarketDataCommand — dispatch coverage
// ---------------------------------------------------------------------------
describe("handleMarketDataCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleMarketDataCommand(noopRunner, "noop", [], {}, false);
    assert.equal(result, undefined);
  });

  it("evaluates limit from v.limit when set", () => {
    const result = handleMarketDataCommand(noopRunner, "noop", [], { limit: "50" }, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleMarketCommand — thin dispatcher
// ---------------------------------------------------------------------------
describe("handleMarketCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleMarketCommand(noopRunner, "noop", [], {}, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleAccountWriteCommand — dispatch coverage
// ---------------------------------------------------------------------------
describe("handleAccountWriteCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleAccountWriteCommand(noopRunner, "noop", {}, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleBotGridCommand — dispatch coverage
// ---------------------------------------------------------------------------
describe("handleBotGridCommand", () => {
  it("returns undefined when rest[0] is undefined (no subAction match)", () => {
    const result = handleBotGridCommand(noopRunner, {}, [], false);
    assert.equal(result, undefined);
  });

  it("returns undefined for unknown subAction", () => {
    const result = handleBotGridCommand(noopRunner, {}, ["noop"], false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleBotCommand — dispatch coverage
// ---------------------------------------------------------------------------
describe("handleBotCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleBotCommand(noopRunner, "noop", [], {}, false);
    assert.equal(result, undefined);
  });
});

// ---------------------------------------------------------------------------
// handleSwapCommand — dispatch coverage including swap amend
// ---------------------------------------------------------------------------
describe("handleSwapCommand", () => {
  it("returns undefined for unknown action", () => {
    const result = handleSwapCommand(noopRunner, "noop", [], {}, false);
    assert.equal(result, undefined);
  });

  it("dispatches amend action (returns a Promise)", () => {
    const result = handleSwapCommand(mockRunner, "amend", [], { instId: "BTC-USDT-SWAP", ordId: "123", newPx: "50000", json: false } as never, false);
    assert.ok(result instanceof Promise, "amend should return a Promise");
  });
});

// ---------------------------------------------------------------------------
// handleEarnCommand — unified earn module dispatch coverage
// ---------------------------------------------------------------------------
describe("handleEarnCommand", () => {
  it("writes error for unknown earn sub-module", () => {
    const origCode = process.exitCode;
    const err = captureStderr(() => {
      handleEarnCommand(noopRunner, "noop", [], {}, false);
    });
    assert.ok(err.includes("Unknown earn sub-module"), "should report unknown sub-module");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
  });

  // earn.savings sub-module — balance / purchase / redeem
  it("dispatches savings balance (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "savings", ["balance", "USDT"], {}, false);
    assert.ok(result instanceof Promise, "savings balance should return a Promise");
  });

  it("dispatches savings purchase (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "savings", ["purchase"], { ccy: "USDT", amt: "100" } as never, false);
    assert.ok(result instanceof Promise, "savings purchase should return a Promise");
  });

  it("dispatches savings redeem (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "savings", ["redeem"], { ccy: "USDT", amt: "50" } as never, false);
    assert.ok(result instanceof Promise, "savings redeem should return a Promise");
  });

  // earn.savings sub-module — lending rate actions (belong to Simple Earn)
  it("dispatches savings set-rate (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "savings", ["set-rate"], { ccy: "USDT", rate: "0.02" } as never, false);
    assert.ok(result instanceof Promise, "savings set-rate should return a Promise");
  });

  it("dispatches savings lending-history (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "savings", ["lending-history"], {}, false);
    assert.ok(result instanceof Promise, "savings lending-history should return a Promise");
  });

  it("dispatches savings rate-summary (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "savings", ["rate-summary", "USDT"], {}, false);
    assert.ok(result instanceof Promise, "savings rate-summary should return a Promise");
  });

  it("dispatches savings rate-history (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "savings", ["rate-history"], {}, false);
    assert.ok(result instanceof Promise, "savings rate-history should return a Promise");
  });

  // earn onchain sub-module
  it("dispatches onchain offers (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "onchain", ["offers"], {}, false);
    assert.ok(result instanceof Promise, "onchain offers should return a Promise");
  });

  it("dispatches onchain orders (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "onchain", ["orders"], {}, false);
    assert.ok(result instanceof Promise, "onchain orders should return a Promise");
  });

  it("dispatches onchain history (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "onchain", ["history"], {}, false);
    assert.ok(result instanceof Promise, "onchain history should return a Promise");
  });
});

// ---------------------------------------------------------------------------
// CLI earn commands — output coverage
// ---------------------------------------------------------------------------
import {
  cmdEarnSavingsBalance,
  cmdEarnLendingHistory,
  cmdEarnLendingRateSummary,
  cmdEarnLendingRateHistory,
} from "../src/commands/earn.js";
import {
  cmdOnchainEarnPurchase,
  cmdOnchainEarnRedeem,
  cmdOnchainEarnCancel,
} from "../src/commands/onchain-earn.js";

// Runner that returns a list response
const listRunner: ToolRunner = async () => ({
  endpoint: "/api/v5/test",
  requestTime: new Date().toISOString(),
  data: [{ ccy: "USDT", amt: "100", earnings: "0.1", rate: "0.01", loanAmt: "0", pendingAmt: "0" }],
});

// Runner that returns empty list
const emptyRunner: ToolRunner = async () => ({
  endpoint: "/api/v5/test",
  requestTime: new Date().toISOString(),
  data: [],
});

describe("cmdEarnSavingsBalance output", () => {
  it("prints table when data exists", async () => {
    const out = await captureStdout(() => cmdEarnSavingsBalance(listRunner, "USDT", false));
    assert.ok(out.length > 0, "should produce output");
  });

  it("prints JSON when json=true", async () => {
    const out = await captureStdout(() => cmdEarnSavingsBalance(listRunner, undefined, true));
    assert.doesNotThrow(() => JSON.parse(out));
  });

  it("prints empty message when no data", async () => {
    const out = await captureStdout(() => cmdEarnSavingsBalance(emptyRunner, undefined, false));
    assert.ok(out.includes("No savings balance"));
  });
});

describe("cmdEarnLendingHistory output", () => {
  it("prints table when data exists", async () => {
    const runner: ToolRunner = async () => ({
      endpoint: "/api/v5/test", requestTime: "ts",
      data: [{ ccy: "USDT", amt: "100", earnings: "0.1", rate: "0.01", ts: "1700000000000" }],
    });
    const out = await captureStdout(() => cmdEarnLendingHistory(runner, { json: false }));
    assert.ok(out.length > 0);
  });

  it("prints empty message when no data", async () => {
    const out = await captureStdout(() => cmdEarnLendingHistory(emptyRunner, { json: false }));
    assert.ok(out.includes("No lending history"));
  });
});

describe("cmdEarnLendingRateSummary output", () => {
  it("prints table when data exists", async () => {
    const runner: ToolRunner = async () => ({
      endpoint: "/api/v5/test", requestTime: "ts",
      data: [{ ccy: "USDT", avgRate: "0.01", estRate: "0.02", avgAmt: "1000" }],
    });
    const out = await captureStdout(() => cmdEarnLendingRateSummary(runner, "USDT", false));
    assert.ok(out.length > 0);
  });

  it("prints empty message when no data", async () => {
    const out = await captureStdout(() => cmdEarnLendingRateSummary(emptyRunner, undefined, false));
    assert.ok(out.includes("No rate summary data"));
  });
});

describe("cmdEarnLendingRateHistory output", () => {
  it("prints table when data exists", async () => {
    const runner: ToolRunner = async () => ({
      endpoint: "/api/v5/test", requestTime: "ts",
      data: [{ ccy: "USDT", lendingRate: "0.01", rate: "0.02", ts: "1700000000000" }],
    });
    const out = await captureStdout(() => cmdEarnLendingRateHistory(runner, { json: false }));
    assert.ok(out.length > 0);
  });

  it("prints empty message when no data", async () => {
    const out = await captureStdout(() => cmdEarnLendingRateHistory(emptyRunner, { json: false }));
    assert.ok(out.includes("No rate history data"));
  });
});

describe("earn onchain CLI commands — full dispatch coverage", () => {
  it("dispatches onchain purchase (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "onchain", ["purchase"], { productId: "p1", ccy: "ETH", amt: "1" } as never, false);
    assert.ok(result instanceof Promise, "onchain purchase should return a Promise");
  });

  it("dispatches onchain redeem (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "onchain", ["redeem"], { ordId: "123", protocolType: "staking" } as never, false);
    assert.ok(result instanceof Promise, "onchain redeem should return a Promise");
  });

  it("dispatches onchain cancel (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "onchain", ["cancel"], { ordId: "123", protocolType: "staking" } as never, false);
    assert.ok(result instanceof Promise, "onchain cancel should return a Promise");
  });

  it("cmdOnchainEarnPurchase builds investData from ccy+amt", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const capturingRunner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return { endpoint: "/test", requestTime: "ts", data: [] };
    };
    await cmdOnchainEarnPurchase(capturingRunner, { ccy: "ETH", amt: "1", productId: "p1" } as never);
    assert.deepEqual(capturedArgs?.["investData"], [{ ccy: "ETH", amt: "1" }]);
  });

  it("cmdOnchainEarnPurchase sets investData=undefined when ccy missing", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const capturingRunner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return { endpoint: "/test", requestTime: "ts", data: [] };
    };
    await cmdOnchainEarnPurchase(capturingRunner, { productId: "p1" } as never);
    assert.equal(capturedArgs?.["investData"], undefined);
  });

  it("cmdOnchainEarnRedeem passes ordId and protocolType", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const capturingRunner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return { endpoint: "/test", requestTime: "ts", data: [] };
    };
    await cmdOnchainEarnRedeem(capturingRunner, { ordId: "456", protocolType: "defi" } as never);
    assert.equal(capturedArgs?.["ordId"], "456");
    assert.equal(capturedArgs?.["protocolType"], "defi");
  });

  it("cmdOnchainEarnCancel passes ordId and protocolType", async () => {
    let capturedArgs: Record<string, unknown> | undefined;
    const capturingRunner: ToolRunner = async (_tool, args) => {
      capturedArgs = args as Record<string, unknown>;
      return { endpoint: "/test", requestTime: "ts", data: [] };
    };
    await cmdOnchainEarnCancel(capturingRunner, { ordId: "789", protocolType: "staking" } as never);
    assert.equal(capturedArgs?.["ordId"], "789");
    assert.equal(capturedArgs?.["protocolType"], "staking");
  });
});
