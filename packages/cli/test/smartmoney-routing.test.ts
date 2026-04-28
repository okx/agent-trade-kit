import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { handleSmartmoneyCommand } from "../src/index.js";
import type { CliValues } from "../src/index.js";
import { setOutput, resetOutput } from "../src/formatter.js";

beforeEach(() => setOutput({ out: () => {}, err: () => {} }));
afterEach(() => resetOutput());

const fakeResult = {
  endpoint: "GET /api/v5/journal/smartmoney/overview",
  requestTime: new Date().toISOString(),
  data: [],
};

const fakeCompositeResult = {
  endpoint: "smartmoney_get_trader_detail (composite)",
  requestTime: new Date().toISOString(),
  data: { profile: [], positions: [], trades: [] },
};

function makeSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    if (tool === "smartmoney_get_trader_detail") return fakeCompositeResult;
    return fakeResult;
  };
  return { spy, captured };
}

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

describe("handleSmartmoneyCommand — parameter routing", () => {
  // --- Overview ---
  it("overview: dataVersion comes from v.dataVersion flag", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "overview", [], vals({ dataVersion: "202604021200" }), false);
    assert.equal(captured.tool, "smartmoney_get_overview");
    assert.equal(captured.args["dataVersion"], "202604021200");
  });

  it("overview: ts comes from v.ts flag", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "overview", [], vals({ ts: "1712000000000" }), false);
    assert.equal(captured.tool, "smartmoney_get_overview");
    assert.equal(captured.args["ts"], "1712000000000");
  });

  it("overview: instType, instCcyList, instCcy, topInstruments from v flags", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "overview", [], vals({
      dataVersion: "1712000000000",
      instType: "SWAP",
      instCcyList: "BTC,ETH",
      instCcy: "SOL",
      topInstruments: "5",
    }), false);
    assert.equal(captured.args["instType"], "SWAP");
    assert.equal(captured.args["instCcyList"], "BTC,ETH");
    assert.equal(captured.args["instCcy"], "SOL");
    assert.equal(captured.args["topInstruments"], "5");
  });

  it("overview: pool filter params from v flags (signal-side new names)", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "overview", [], vals({
      dataVersion: "1712000000000",
      pnlTier: "PNL_TOP20",
      winRateTier: "WR_GE_50",
      maxDrawdownTier: "MR_LE_20",
      aumTier: "AUM_TOP50",
    }), false);
    assert.equal(captured.tool, "smartmoney_get_overview");
    // CLI passes the public names through to the tool handler; handler translates to API names.
    assert.equal(captured.args["pnlTier"], "PNL_TOP20");
    assert.equal(captured.args["winRateTier"], "WR_GE_50");
    assert.equal(captured.args["maxDrawdownTier"], "MR_LE_20");
    assert.equal(captured.args["aumTier"], "AUM_TOP50");
  });

  // --- Signal ---
  it("signal: instId and instCcy from v flags", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "signal", [], vals({ instId: "BTC-USDT-SWAP", ts: "1712000000000" }), false);
    assert.equal(captured.tool, "smartmoney_get_signal");
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
  });

  it("signal: instCcy, dataVersion, authorIds from v flags", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "signal", [], vals({ dataVersion: "1712000000000", instCcy: "BTC", authorIds: "1001,1002" }), false);
    assert.equal(captured.tool, "smartmoney_get_signal");
    assert.equal(captured.args["instCcy"], "BTC");
    assert.equal(captured.args["authorIds"], "1001,1002");
  });

  it("signal: ts from v.ts flag", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "signal", [], vals({ ts: "1712000000000", instCcy: "ETH" }), false);
    assert.equal(captured.tool, "smartmoney_get_signal");
    assert.equal(captured.args["ts"], "1712000000000");
    assert.equal(captured.args["instCcy"], "ETH");
  });

  // --- Signal History ---
  it("signal-history: instId, dataVersion, granularity, limit from v flags", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "signal-history", [], vals({ instId: "BTC-USDT-SWAP", dataVersion: "1712000000000", granularity: "1h", limit: "48" }), false);
    assert.equal(captured.tool, "smartmoney_get_signal_history");
    assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
    assert.equal(captured.args["dataVersion"], "1712000000000");
    assert.equal(captured.args["granularity"], "1h");
    assert.equal(captured.args["limit"], "48");
  });

  it("signal-history: ts and sortBy from v flags (signal-side)", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "signal-history", [], vals({ instId: "BTC-USDT-SWAP", ts: "1712000000000", sortBy: "pnlRatio" }), false);
    assert.equal(captured.tool, "smartmoney_get_signal_history");
    assert.equal(captured.args["ts"], "1712000000000");
    assert.equal(captured.args["sortBy"], "pnlRatio");
  });

  // --- Traders ---
  it("traders: sortType and period come from v flags", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "traders", [], vals({ sortType: "pnl_ratio", period: "7" }), false);
    assert.equal(captured.tool, "smartmoney_get_traders");
    assert.equal(captured.args["sortType"], "pnl_ratio");
    assert.equal(captured.args["period"], "7");
  });

  it("traders: authorIds come from v.authorIds flag", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "traders", [], vals({ authorIds: "123,456" }), false);
    assert.equal(captured.tool, "smartmoney_get_traders");
    assert.equal(captured.args["authorIds"], "123,456");
  });

  it("traders: dataVersion, after, before, limit from v flags", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "traders", [], vals({
      dataVersion: "202604021200",
      after: "100",
      before: "200",
      limit: "50",
    }), false);
    assert.equal(captured.tool, "smartmoney_get_traders");
    assert.equal(captured.args["dataVersion"], "202604021200");
    assert.equal(captured.args["after"], "100");
    assert.equal(captured.args["before"], "200");
    assert.equal(captured.args["limit"], "50");
  });

  // --- Trader Detail ---
  it("trader: authorId comes from v.authorId flag", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "trader", [], vals({ authorId: "12345" }), false);
    assert.equal(captured.tool, "smartmoney_get_trader_detail");
    assert.equal(captured.args["authorId"], "12345");
  });

  it("trader: period and instCcy from v flags", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "trader", [], vals({ authorId: "12345", period: "30", instCcy: "ETH" }), false);
    assert.equal(captured.tool, "smartmoney_get_trader_detail");
    assert.equal(captured.args["period"], "30");
    assert.equal(captured.args["instCcy"], "ETH");
  });

  it("trader: tradeLimit from v flags", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "trader", [], vals({ authorId: "99", tradeLimit: "50" }), false);
    assert.equal(captured.tool, "smartmoney_get_trader_detail");
    assert.equal(captured.args["tradeLimit"], "50");
  });

  // --- Missing required params ---
  it("signal-history: errors when --instId is missing", async () => {
    const { spy, captured } = makeSpy();
    let errMsg = "";
    setOutput({ out: () => {}, err: (msg: string) => { errMsg += msg; } });
    await handleSmartmoneyCommand(spy, "signal-history", [], vals({}), false);
    assert.equal(captured.tool, "", "should not call any tool");
    assert.match(errMsg, /--instId/);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined as unknown as number;
  });

  it("trader: errors when --authorId is missing", async () => {
    const { spy, captured } = makeSpy();
    let errMsg = "";
    setOutput({ out: () => {}, err: (msg: string) => { errMsg += msg; } });
    await handleSmartmoneyCommand(spy, "trader", [], vals({}), false);
    assert.equal(captured.tool, "", "should not call any tool");
    assert.match(errMsg, /--authorId/);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined as unknown as number;
  });

  // --- Atomic trader endpoints (positions / trades / position-history) ---
  it("positions: authorId and instCcy from v flags", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "positions", [], vals({ authorId: "12345", instCcy: "BTC" }), false);
    assert.equal(captured.tool, "smartmoney_get_trader_positions");
    assert.equal(captured.args["authorId"], "12345");
    assert.equal(captured.args["instCcy"], "BTC");
  });

  it("positions: errors when --authorId is missing", async () => {
    const { spy, captured } = makeSpy();
    let errMsg = "";
    setOutput({ out: () => {}, err: (msg: string) => { errMsg += msg; } });
    await handleSmartmoneyCommand(spy, "positions", [], vals({}), false);
    assert.equal(captured.tool, "", "should not call any tool");
    assert.match(errMsg, /--authorId/);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined as unknown as number;
  });

  it("trades: authorId, instCcy, pagination flags from v", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "trades", [], vals({
      authorId: "99", instCcy: "ETH",
      after: "ord100", before: "ord200", limit: "20",
    }), false);
    assert.equal(captured.tool, "smartmoney_get_trader_trades");
    assert.equal(captured.args["authorId"], "99");
    assert.equal(captured.args["instCcy"], "ETH");
    assert.equal(captured.args["after"], "ord100");
    assert.equal(captured.args["before"], "ord200");
    assert.equal(captured.args["limit"], "20");
  });

  it("trades: errors when --authorId is missing", async () => {
    const { spy, captured } = makeSpy();
    let errMsg = "";
    setOutput({ out: () => {}, err: (msg: string) => { errMsg += msg; } });
    await handleSmartmoneyCommand(spy, "trades", [], vals({}), false);
    assert.equal(captured.tool, "", "should not call any tool");
    assert.match(errMsg, /--authorId/);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined as unknown as number;
  });

  it("position-history: authorId and pagination flags from v", async () => {
    const { spy, captured } = makeSpy();
    await handleSmartmoneyCommand(spy, "position-history", [], vals({
      authorId: "88", after: "pos50", limit: "5",
    }), false);
    assert.equal(captured.tool, "smartmoney_get_trader_position_history");
    assert.equal(captured.args["authorId"], "88");
    assert.equal(captured.args["after"], "pos50");
    assert.equal(captured.args["limit"], "5");
  });

  it("position-history: errors when --authorId is missing", async () => {
    const { spy, captured } = makeSpy();
    let errMsg = "";
    setOutput({ out: () => {}, err: (msg: string) => { errMsg += msg; } });
    await handleSmartmoneyCommand(spy, "position-history", [], vals({}), false);
    assert.equal(captured.tool, "", "should not call any tool");
    assert.match(errMsg, /--authorId/);
    assert.equal(process.exitCode, 1);
    process.exitCode = undefined as unknown as number;
  });
});
