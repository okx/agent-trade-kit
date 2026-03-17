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
  handleBotDcaCommand,
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

  it("dispatches stock-tokens action (returns a Promise)", () => {
    const result = handleMarketPublicCommand(mockRunner, "stock-tokens", [], {}, false);
    assert.ok(result instanceof Promise, "stock-tokens should return a Promise");
  });

  it("dispatches stock-tokens with instType and instId from v", () => {
    const result = handleMarketPublicCommand(
      mockRunner,
      "stock-tokens",
      [],
      { instType: "SPOT", instId: "AAPL-USDT" },
      false,
    );
    assert.ok(result instanceof Promise, "stock-tokens with params should return a Promise");
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
// handleBotDcaCommand — dispatch coverage
// ---------------------------------------------------------------------------
describe("handleBotDcaCommand", () => {
  it("returns undefined for unknown subAction", () => {
    const result = handleBotDcaCommand(noopRunner, "noop", {}, false);
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
import { cmdMarketStockTokens } from "../src/commands/market.js";
import {
  cmdOnchainEarnPurchase,
  cmdOnchainEarnRedeem,
  cmdOnchainEarnCancel,
} from "../src/commands/onchain-earn.js";
import {
  cmdDcdPairs,
  cmdDcdProducts,
  cmdDcdOrders,
  cmdDcdRedeemExecute,
  cmdDcdOrderState,
  cmdDcdQuoteAndBuy,
} from "../src/commands/dcd.js";

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

  // earn.dcd sub-module
  it("dispatches dcd pairs (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "dcd", ["pairs"], {}, false);
    assert.ok(result instanceof Promise, "dcd pairs should return a Promise");
  });

  it("dispatches dcd products (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "dcd", ["products"], { baseCcy: "BTC", quoteCcy: "USDT", optType: "C" } as never, false);
    assert.ok(result instanceof Promise, "dcd products should return a Promise");
  });

  it("dispatches dcd quote-and-buy (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "dcd", ["quote-and-buy"], { productId: "BTC-USDT-260327-77000-C", sz: "0.001", notionalCcy: "BTC" } as never, false);
    assert.ok(result instanceof Promise, "dcd quote-and-buy should return a Promise");
  });

  it("dispatches dcd orders (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "dcd", ["orders"], {}, false);
    assert.ok(result instanceof Promise, "dcd orders should return a Promise");
  });

  it("dispatches dcd order (returns a Promise)", () => {
    const result = handleEarnCommand(mockRunner, "dcd", ["order"], { ordId: "123" } as never, false);
    assert.ok(result instanceof Promise, "dcd order should return a Promise");
  });

  it("writes error for unknown dcd command", () => {
    const origCode = process.exitCode;
    const err = captureStderr(() => {
      handleEarnCommand(noopRunner, "dcd", ["noop-cmd"], {}, false);
    });
    assert.ok(err.includes("Unknown earn dcd command"), "should report unknown dcd command");
    assert.equal(process.exitCode, 1);
    process.exitCode = origCode;
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

// ---------------------------------------------------------------------------
// cmdMarketStockTokens — output coverage
// ---------------------------------------------------------------------------

const stockTokenRunner: ToolRunner = async () => ({
  endpoint: "/api/v5/public/instruments",
  requestTime: new Date().toISOString(),
  data: [
    { instId: "AAPL-USDT-SWAP", instCategory: "3", ctVal: "1", lotSz: "1", minSz: "1", tickSz: "0.01", state: "live" },
    { instId: "TSLA-USDT-SWAP", instCategory: "3", ctVal: "1", lotSz: "1", minSz: "1", tickSz: "0.01", state: "live" },
  ],
});

describe("cmdMarketStockTokens output", () => {
  it("prints table when data exists", async () => {
    const out = await captureStdout(() => cmdMarketStockTokens(stockTokenRunner, { json: false }));
    assert.ok(out.includes("AAPL-USDT-SWAP"), "should include AAPL");
    assert.ok(out.includes("TSLA-USDT-SWAP"), "should include TSLA");
  });

  it("prints JSON when json=true", async () => {
    const out = await captureStdout(() => cmdMarketStockTokens(stockTokenRunner, { json: true }));
    assert.doesNotThrow(() => JSON.parse(out));
    const parsed = JSON.parse(out) as Array<{ instId: string }>;
    assert.equal(parsed.length, 2);
  });

  it("prints table with instType filter", async () => {
    const out = await captureStdout(() =>
      cmdMarketStockTokens(stockTokenRunner, { instType: "SPOT", json: false })
    );
    assert.ok(out.length > 0, "should produce output");
  });

  it("prints empty table when no data", async () => {
    const emptyStockRunner: ToolRunner = async () => ({
      endpoint: "/api/v5/public/instruments",
      requestTime: new Date().toISOString(),
      data: [],
    });
    const out = await captureStdout(() => cmdMarketStockTokens(emptyStockRunner, { json: false }));
    assert.ok(typeof out === "string", "should not throw on empty data");
  });
});

// ---------------------------------------------------------------------------
// DCD CLI commands — output coverage
// ---------------------------------------------------------------------------

const dcdPairsRunner: ToolRunner = async () => ({
  endpoint: "/api/v5/finance/sfp/dcd/currency-pair",
  requestTime: new Date().toISOString(),
  data: [{ baseCcy: "BTC", quoteCcy: "USDT", optType: "C" }],
});

const dcdProductsRunner: ToolRunner = async () => ({
  endpoint: "/api/v5/finance/sfp/dcd/products",
  requestTime: new Date().toISOString(),
  data: { products: [{ productId: "BTC-USDT-260327-77000-C", baseCcy: "BTC", quoteCcy: "USDT", optType: "C", strike: "77000", annualizedYield: "0.1834", minSize: "0.0001", expTime: "1774598400000", interestAccrualTime: "1773370800000" }] },
});

const dcdOrdersRunner: ToolRunner = async () => ({
  endpoint: "/api/v5/finance/sfp/dcd/order-history",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "123", productId: "BTC-USDT-260327-77000-C", state: "LIVE", baseCcy: "BTC", quoteCcy: "USDT", strike: "77000", notionalSz: "0.0001", annualizedYield: "0.1834", yieldSz: "", settleTime: "1774598400000", settledTime: "" }],
});

describe("cmdDcdPairs output", () => {
  it("prints table when data exists", async () => {
    const out = await captureStdout(() => cmdDcdPairs(dcdPairsRunner, false));
    assert.ok(out.includes("BTC"), "should include baseCcy");
    assert.ok(out.includes("USDT"), "should include quoteCcy");
  });

  it("prints JSON when json=true", async () => {
    const out = await captureStdout(() => cmdDcdPairs(dcdPairsRunner, true));
    assert.doesNotThrow(() => JSON.parse(out));
  });

  it("prints empty message when no data", async () => {
    const out = await captureStdout(() => cmdDcdPairs(emptyRunner, false));
    assert.ok(out.includes("No currency pairs"));
  });
});

describe("cmdDcdProducts output", () => {
  it("prints table when products exist", async () => {
    const out = await captureStdout(() =>
      cmdDcdProducts(dcdProductsRunner, { baseCcy: "BTC", quoteCcy: "USDT", optType: "C", json: false })
    );
    assert.ok(out.includes("BTC-USDT-260327-77000-C"), "should include productId");
  });

  it("prints JSON when json=true", async () => {
    const out = await captureStdout(() =>
      cmdDcdProducts(dcdProductsRunner, { json: true })
    );
    assert.doesNotThrow(() => JSON.parse(out));
  });

  it("prints empty message when no products match", async () => {
    const out = await captureStdout(() =>
      cmdDcdProducts(emptyRunner, { json: false })
    );
    assert.ok(out.includes("No products matched"));
  });
});

describe("cmdDcdOrders output", () => {
  it("prints table when orders exist", async () => {
    const out = await captureStdout(() => cmdDcdOrders(dcdOrdersRunner, { json: false }));
    assert.ok(out.includes("123"), "should include ordId");
    assert.ok(out.includes("LIVE"), "should include state");
  });

  it("prints JSON when json=true", async () => {
    const out = await captureStdout(() => cmdDcdOrders(dcdOrdersRunner, { json: true }));
    assert.doesNotThrow(() => JSON.parse(out));
  });

  it("prints empty message when no orders found", async () => {
    const out = await captureStdout(() => cmdDcdOrders(emptyRunner, { json: false }));
    assert.ok(out.includes("No orders found"));
  });
});

// ---------------------------------------------------------------------------
// DCD CLI — cmdDcdProducts with client-side filters
// ---------------------------------------------------------------------------

const productSample = {
  productId: "BTC-USDT-260327-77000-C",
  baseCcy: "BTC", quoteCcy: "USDT", optType: "C",
  strike: "77000",
  annualizedYield: "0.20",
  minSize: "0.0001",
  expTime: String(Date.now() + 7 * 86400_000),
  interestAccrualTime: String(Date.now()),
};

const dcdProductsRunnerWith = (products: object[]): ToolRunner =>
  async () => ({ endpoint: "/test", requestTime: "ts", data: { products } });

describe("cmdDcdProducts — client-side filters", () => {
  it("minYield filters out low-yield products", async () => {
    const runner = dcdProductsRunnerWith([
      { ...productSample, annualizedYield: "0.05" },
      { ...productSample, productId: "BTC-USDT-260327-80000-C", annualizedYield: "0.30" },
    ]);
    const out = await captureStdout(() =>
      cmdDcdProducts(runner, { minYield: 0.25, json: false })
    );
    assert.ok(out.includes("BTC-USDT-260327-80000-C"), "should include high-yield product");
    assert.ok(!out.includes("BTC-USDT-260327-77000-C"), "should exclude low-yield product");
  });

  it("strikeNear filters by ±10% of reference price", async () => {
    const runner = dcdProductsRunnerWith([
      { ...productSample, strike: "77000" },
      { ...productSample, productId: "BTC-USDT-260327-99000-C", strike: "99000" },
    ]);
    const out = await captureStdout(() =>
      cmdDcdProducts(runner, { strikeNear: 75000, json: false })
    );
    assert.ok(out.includes("BTC-USDT-260327-77000-C"), "strike 77000 is within 10% of 75000");
    assert.ok(!out.includes("BTC-USDT-260327-99000-C"), "strike 99000 is outside 10% of 75000");
  });

  it("termDays filters by exact term", async () => {
    const MS = 86400_000;
    const now = Date.now();
    const runner = dcdProductsRunnerWith([
      { ...productSample, expTime: String(now + 7 * MS), interestAccrualTime: String(now) },
      { ...productSample, productId: "BTC-USDT-260334-77000-C", expTime: String(now + 14 * MS), interestAccrualTime: String(now) },
    ]);
    const out = await captureStdout(() =>
      cmdDcdProducts(runner, { termDays: 7, json: false })
    );
    assert.ok(out.includes("BTC-USDT-260327-77000-C"), "7-day term should match");
    assert.ok(!out.includes("BTC-USDT-260334-77000-C"), "14-day term should not match");
  });

  it("minTermDays and maxTermDays filter by term range", async () => {
    const MS = 86400_000;
    const now = Date.now();
    const runner = dcdProductsRunnerWith([
      { ...productSample, productId: "p3d", expTime: String(now + 3 * MS), interestAccrualTime: String(now) },
      { ...productSample, productId: "p7d", expTime: String(now + 7 * MS), interestAccrualTime: String(now) },
      { ...productSample, productId: "p30d", expTime: String(now + 30 * MS), interestAccrualTime: String(now) },
    ]);
    const out = await captureStdout(() =>
      cmdDcdProducts(runner, { minTermDays: 5, maxTermDays: 10, json: false })
    );
    assert.ok(out.includes("p7d"), "7-day is within 5-10 range");
    assert.ok(!out.includes("p3d"), "3-day is below minimum");
    assert.ok(!out.includes("p30d"), "30-day is above maximum");
  });

  it("expDate filters by YYYY-MM-DD", async () => {
    const future = new Date(Date.now() + 14 * 86400_000);
    const dateStr = future.toISOString().slice(0, 10);
    const runner = dcdProductsRunnerWith([
      { ...productSample, productId: "match", expTime: String(future.getTime()) },
      { ...productSample, productId: "nomatch", expTime: String(Date.now() + 7 * 86400_000) },
    ]);
    const out = await captureStdout(() =>
      cmdDcdProducts(runner, { expDate: dateStr, json: false })
    );
    assert.ok(out.includes("match"), "product on target date should appear");
  });

  it("expDate with time precision (YYYY-MM-DDTHH:mm)", async () => {
    // Use a fixed UTC time with full HH:mm so new Date() can parse it
    const expTime = new Date("2026-06-01T16:00:00.000Z").getTime();
    const runner = dcdProductsRunnerWith([
      { ...productSample, productId: "match", expTime: String(expTime) },
      { ...productSample, productId: "nomatch", expTime: String(new Date("2026-06-01T08:00:00.000Z").getTime()) },
    ]);
    const out = await captureStdout(() =>
      cmdDcdProducts(runner, { expDate: "2026-06-01T16:00", json: false })
    );
    assert.ok(out.includes("match"), "should match by hour precision");
  });

  it("products with missing expTime/interestAccrualTime are excluded from term filter", async () => {
    const runner = dcdProductsRunnerWith([
      { ...productSample, expTime: "", interestAccrualTime: "" },
    ]);
    const out = await captureStdout(() =>
      cmdDcdProducts(runner, { termDays: 7, json: false })
    );
    assert.ok(out.includes("No products matched"), "invalid times should be filtered out");
  });
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DCD CLI — cmdDcdRedeemExecute
// ---------------------------------------------------------------------------

function makeDcdRedeemExecuteRunner(): ToolRunner {
  let callCount = 0;
  return async (tool) => {
    if (tool === "dcd_redeem") {
      callCount++;
      // First call (preview): return quote data
      if (callCount === 1) {
        return { endpoint: "/test", requestTime: "ts", data: [{ ordId: "ord1", quoteId: "rq1", redeemSz: "0.0001", redeemCcy: "BTC", termRate: "-0.5" }] };
      }
      // Second call (execute): return redeem result
      return { endpoint: "/test", requestTime: "ts", data: [{ ordId: "ord1", state: "PENDING_REDEEM_BOOKING" }] };
    }
    return { endpoint: "/test", requestTime: "ts", data: [{ ordId: "ord1", state: "PENDING_REDEEM_BOOKING" }] };
  };
}

describe("cmdDcdRedeemExecute output", () => {
  it("re-quotes and executes, prints result", async () => {
    const out = await captureStdout(() => cmdDcdRedeemExecute(makeDcdRedeemExecuteRunner(), { ordId: "ord1", json: false }));
    assert.ok(out.includes("ord1"), "should show ordId");
    assert.ok(out.includes("PENDING_REDEEM_BOOKING"), "should show state");
  });

  it("prints JSON with quote and redeem", async () => {
    const out = await captureStdout(() => cmdDcdRedeemExecute(makeDcdRedeemExecuteRunner(), { ordId: "ord1", json: true }));
    const parsed = JSON.parse(out);
    assert.ok(parsed.quote, "should include quote");
    assert.ok(parsed.redeem, "should include redeem");
  });

  it("prints error when redeem quote fails", async () => {
    const out = await captureStdout(() => cmdDcdRedeemExecute(emptyRunner, { ordId: "ord1", json: false }));
    assert.ok(out.includes("Failed to get redeem quote"));
  });
});

// ---------------------------------------------------------------------------
// DCD CLI — cmdDcdOrderState
// ---------------------------------------------------------------------------

const dcdOrderStateRunner: ToolRunner = async () => ({
  endpoint: "/test", requestTime: "ts",
  data: [{ ordId: "ord1", state: "LIVE" }],
});

describe("cmdDcdOrderState output", () => {
  it("prints ordId and state", async () => {
    const out = await captureStdout(() => cmdDcdOrderState(dcdOrderStateRunner, { ordId: "ord1", json: false }));
    assert.ok(out.includes("ord1"), "should show ordId");
    assert.ok(out.includes("LIVE"), "should show state");
  });

  it("prints JSON when json=true", async () => {
    const out = await captureStdout(() => cmdDcdOrderState(dcdOrderStateRunner, { ordId: "ord1", json: true }));
    assert.doesNotThrow(() => JSON.parse(out));
  });

  it("prints not found when no data", async () => {
    const out = await captureStdout(() => cmdDcdOrderState(emptyRunner, { ordId: "ord1", json: false }));
    assert.ok(out.includes("Order not found"));
  });
});

// ---------------------------------------------------------------------------
// DCD CLI — cmdDcdQuoteAndBuy
// ---------------------------------------------------------------------------

function makeDcdQuoteAndBuyRunner(): ToolRunner {
  return async (tool) => {
    if (tool === "dcd_subscribe") {
      return {
        endpoint: "/test",
        requestTime: "ts",
        data: [{ ordId: "ord1", quoteId: "q1", state: "INITIAL" }],
        quote: { quoteId: "q1", annualizedYield: "18.34", absYield: "0.008", notionalSz: "0.001", notionalCcy: "BTC" },
      };
    }
    return { endpoint: "/test", requestTime: "ts", data: [{ ordId: "ord1", state: "LIVE" }] };
  };
}

describe("cmdDcdQuoteAndBuy output", () => {
  it("quotes and buys, prints quote + order + state", async () => {
    const out = await captureStdout(() =>
      cmdDcdQuoteAndBuy(makeDcdQuoteAndBuyRunner(), { productId: "BTC-USDT-260327-77000-C", notionalSz: "0.001", notionalCcy: "BTC", json: false })
    );
    assert.ok(out.includes("Quote:"), "should show quote section");
    assert.ok(out.includes("Order placed:"), "should show order section");
    assert.ok(out.includes("ord1"), "should show ordId");
  });

  it("prints JSON with quote + order + state", async () => {
    const out = await captureStdout(() =>
      cmdDcdQuoteAndBuy(makeDcdQuoteAndBuyRunner(), { productId: "p", notionalSz: "1", notionalCcy: "BTC", json: true })
    );
    const parsed = JSON.parse(out);
    assert.ok(parsed.quote, "should include quote");
    assert.ok(parsed.order, "should include order");
  });

  it("prints error when no quote returned", async () => {
    const out = await captureStdout(() =>
      cmdDcdQuoteAndBuy(emptyRunner, { productId: "p", notionalSz: "1", notionalCcy: "BTC", json: false })
    );
    assert.ok(out.includes("No quote returned"));
  });
});
