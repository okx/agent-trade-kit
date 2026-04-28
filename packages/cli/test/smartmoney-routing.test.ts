import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { handleSmartmoneyCommand } from "../src/index.js";
import type { CliValues } from "../src/index.js";
import { setOutput, resetOutput } from "../src/formatter.js";

beforeEach(() => setOutput({ out: () => {}, err: () => {} }));
afterEach(() => resetOutput());

const fakeResult = {
  endpoint: "GET /api/v5/smartmoney",
  requestTime: new Date().toISOString(),
  data: [],
};

function makeSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    return fakeResult;
  };
  return { spy, captured };
}

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

/** Run the handler with stderr captured so error-path assertions can inspect the message. */
async function runWithErrCapture(
  fn: () => Promise<void> | void,
): Promise<{ errMsg: string }> {
  let errMsg = "";
  setOutput({ out: () => {}, err: (msg: string) => { errMsg += msg; } });
  await fn();
  return { errMsg };
}

function clearExitCode(): void {
  process.exitCode = undefined as unknown as number;
}

describe("handleSmartmoneyCommand — parameter routing", () => {
  /* ------------------------------------------------------------------ */
  /*  Trader family (5)                                                  */
  /* ------------------------------------------------------------------ */

  describe("top-traders", () => {
    it("dispatches to smartmoney_get_top_traders", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "top-traders", [], vals({}), false);
      assert.equal(captured.tool, "smartmoney_get_top_traders");
    });

    it("flows numeric-threshold pool filters (no `Tier` suffix) + sortBy + period", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "top-traders", [], vals({
        sortBy: "pnl",
        period: "30",
        pnl: "10000",
        winRate: "0.8",
        maxDrawdown: "0.2",
        asset: "1000",
      }), false);
      assert.equal(captured.args["sortBy"], "pnl");
      assert.equal(captured.args["period"], "30");
      assert.equal(captured.args["pnl"], "10000");
      assert.equal(captured.args["winRate"], "0.8");
      assert.equal(captured.args["maxDrawdown"], "0.2");
      assert.equal(captured.args["asset"], "1000");
    });

    it("flows updateTime + after/before/limit pagination + does NOT pass tier flags", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "top-traders", [], vals({
        updateTime: "202604021200",
        after: "100",
        before: "200",
        limit: "50",
        // Tier flags should not leak into top-traders (it uses numeric thresholds).
        pnlTier: "PNL_TOP20",
        winRateTier: "WR_GE_50",
      }), false);
      assert.equal(captured.args["updateTime"], "202604021200");
      assert.equal(captured.args["after"], "100");
      assert.equal(captured.args["before"], "200");
      assert.equal(captured.args["limit"], "50");
      assert.equal(captured.args["pnlTier"], undefined, "tier flags should not pass through to top-traders");
      assert.equal(captured.args["winRateTier"], undefined);
    });

    it("--period flag is honored even when positional rest args present (footgun guard)", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "top-traders", ["ignoredPositional"], vals({ period: "30" }), false);
      assert.equal(captured.tool, "smartmoney_get_top_traders");
      assert.equal(captured.args["period"], "30");
    });
  });

  describe("trader-performance", () => {
    it("dispatches to smartmoney_get_trader_performance with authorIds + period", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "trader-performance", [], vals({
        authorIds: "1001,1002", period: "30",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_trader_performance");
      assert.equal(captured.args["authorIds"], "1001,1002");
      assert.equal(captured.args["period"], "30");
    });

    it("errors when --authorIds is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "trader-performance", [], vals({}), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--authorIds/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });
  });

  describe("trader-positions", () => {
    it("dispatches with authorId + instCcy (not instId)", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "trader-positions", [], vals({
        authorId: "12345", instCcy: "BTC",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_trader_positions");
      assert.equal(captured.args["authorId"], "12345");
      assert.equal(captured.args["instCcy"], "BTC");
    });

    it("does not pass instId — endpoint filters by base currency only", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "trader-positions", [], vals({
        authorId: "12345", instCcy: "BTC", instId: "BTC-USDT-SWAP",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_trader_positions");
      assert.equal(captured.args["instCcy"], "BTC");
      assert.equal(captured.args["instId"], undefined, "trader-positions accepts instCcy, not instId");
    });

    it("errors when --authorId is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "trader-positions", [], vals({}), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--authorId/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });

    it("--authorId flag honored even with positional rest args (footgun guard)", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "trader-positions", ["ignoredPositional"], vals({
        authorId: "999",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_trader_positions");
      assert.equal(captured.args["authorId"], "999");
    });
  });

  describe("trader-position-history", () => {
    it("dispatches with authorId + instCcy + after/before/limit", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "trader-position-history", [], vals({
        authorId: "88", instCcy: "ETH",
        after: "p100", before: "p50", limit: "20",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_trader_position_history");
      assert.equal(captured.args["authorId"], "88");
      assert.equal(captured.args["instCcy"], "ETH");
      assert.equal(captured.args["after"], "p100");
      assert.equal(captured.args["before"], "p50");
      assert.equal(captured.args["limit"], "20");
    });

    it("errors when --authorId is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "trader-position-history", [], vals({}), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--authorId/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });
  });

  describe("trader-order-history", () => {
    it("dispatches with authorId + instCcy + after/before/limit", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "trader-order-history", [], vals({
        authorId: "77", instCcy: "SOL",
        after: "ord1", before: "ord2", limit: "10",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_trader_order_history");
      assert.equal(captured.args["authorId"], "77");
      assert.equal(captured.args["instCcy"], "SOL");
      assert.equal(captured.args["after"], "ord1");
      assert.equal(captured.args["before"], "ord2");
      assert.equal(captured.args["limit"], "10");
    });

    it("errors when --authorId is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "trader-order-history", [], vals({}), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--authorId/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Signal/Coin family (5)                                             */
  /* ------------------------------------------------------------------ */

  describe("top-coin-signals", () => {
    it("dispatches with ts + topInstruments + tier filters + lmtNum (and drops instCcy/instCcyList)", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "top-coin-signals", [], vals({
        ts: "1712000000000",
        topInstruments: "5",
        pnlTier: "PNL_TOP20",
        winRateTier: "WR_GE_50",
        maxDrawdownTier: "MD_LE_20",
        aumTier: "AUM_TOP50",
        lmtNum: "200",
        // Verify instCcy is dropped from top-coin-signals — it's not part of the surface.
        instCcy: "SOL",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_top_coin_signals");
      assert.equal(captured.args["ts"], "1712000000000");
      assert.equal(captured.args["topInstruments"], "5");
      assert.equal(captured.args["pnlTier"], "PNL_TOP20");
      assert.equal(captured.args["winRateTier"], "WR_GE_50");
      assert.equal(captured.args["maxDrawdownTier"], "MD_LE_20");
      assert.equal(captured.args["aumTier"], "AUM_TOP50");
      assert.equal(captured.args["lmtNum"], "200");
      assert.equal(captured.args["instCcy"], undefined, "instCcy dropped from top-coin-signals");
    });
  });

  describe("signal-by-coin", () => {
    it("dispatches with instId + tier filters + lmtNum (and does NOT pass ts — handler auto-fills)", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "signal-by-coin", [], vals({
        instId: "BTC-USDT-SWAP",
        pnlTier: "PNL_TOP5",
        winRateTier: "WR_GE_80",
        maxDrawdownTier: "MD_LE_50",
        aumTier: "AUM_TOP20",
        lmtNum: "150",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_signal_by_coin");
      assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
      assert.equal(captured.args["pnlTier"], "PNL_TOP5");
      assert.equal(captured.args["winRateTier"], "WR_GE_80");
      assert.equal(captured.args["maxDrawdownTier"], "MD_LE_50");
      assert.equal(captured.args["aumTier"], "AUM_TOP20");
      assert.equal(captured.args["lmtNum"], "150");
      // CLI does not surface ts; handler auto-resolves it to current hour.
      assert.equal(captured.args["ts"], undefined, "CLI should not pass ts; handler auto-fills it");
    });

    it("errors when --instId is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "signal-by-coin", [], vals({}), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--instId/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });
  });

  describe("signal-by-traders", () => {
    it("dispatches with instId + authorIds + lmtNum (no ts, no tier filters)", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "signal-by-traders", [], vals({
        instId: "BTC-USDT-SWAP",
        authorIds: "1001,1002",
        lmtNum: "50",
        // These should be dropped — signal-by-traders only takes instId/authorIds/lmtNum.
        pnlTier: "PNL_TOP20",
        winRateTier: "WR_GE_50",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_signal_by_traders");
      assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
      assert.equal(captured.args["authorIds"], "1001,1002");
      assert.equal(captured.args["lmtNum"], "50");
      assert.equal(captured.args["ts"], undefined, "CLI should not pass ts");
      assert.equal(captured.args["pnlTier"], undefined, "tier filters not part of signal-by-traders");
      assert.equal(captured.args["winRateTier"], undefined);
    });

    it("errors when --instId is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "signal-by-traders", [], vals({ authorIds: "1,2" }), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--instId/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });

    it("errors when --authorIds is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "signal-by-traders", [], vals({ instId: "BTC-USDT-SWAP" }), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--authorIds/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });
  });

  describe("signal-history-by-coin", () => {
    it("dispatches with instId + ts + granularity + limit + tier filters", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "signal-history-by-coin", [], vals({
        instId: "BTC-USDT-SWAP",
        ts: "1712000000000",
        granularity: "1d",
        limit: "48",
        pnlTier: "PNL_TOP20",
        winRateTier: "WR_GE_80",
        maxDrawdownTier: "MD_LE_20",
        aumTier: "AUM_TOP50",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_signal_history_by_coin");
      assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
      assert.equal(captured.args["ts"], "1712000000000");
      assert.equal(captured.args["granularity"], "1d");
      assert.equal(captured.args["limit"], "48");
      assert.equal(captured.args["pnlTier"], "PNL_TOP20");
      assert.equal(captured.args["winRateTier"], "WR_GE_80");
      assert.equal(captured.args["maxDrawdownTier"], "MD_LE_20");
      assert.equal(captured.args["aumTier"], "AUM_TOP50");
    });

    it("errors when --instId is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "signal-history-by-coin", [], vals({ ts: "1712000000000" }), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--instId/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });

    it("errors when --ts is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "signal-history-by-coin", [], vals({ instId: "BTC-USDT-SWAP" }), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--ts/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });
  });

  describe("signal-history-by-traders", () => {
    it("dispatches with instId + authorIds + ts + granularity + limit + lmtNum", async () => {
      const { spy, captured } = makeSpy();
      await handleSmartmoneyCommand(spy, "signal-history-by-traders", [], vals({
        instId: "BTC-USDT-SWAP",
        authorIds: "1001,1002",
        ts: "1712000000000",
        granularity: "1h",
        limit: "12",
        lmtNum: "50",
      }), false);
      assert.equal(captured.tool, "smartmoney_get_signal_history_by_traders");
      assert.equal(captured.args["instId"], "BTC-USDT-SWAP");
      assert.equal(captured.args["authorIds"], "1001,1002");
      assert.equal(captured.args["ts"], "1712000000000");
      assert.equal(captured.args["granularity"], "1h");
      assert.equal(captured.args["limit"], "12");
      assert.equal(captured.args["lmtNum"], "50");
    });

    it("errors when --instId is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "signal-history-by-traders", [], vals({
          authorIds: "1,2", ts: "1712000000000",
        }), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--instId/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });

    it("errors when --authorIds is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "signal-history-by-traders", [], vals({
          instId: "BTC-USDT-SWAP", ts: "1712000000000",
        }), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--authorIds/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });

    it("errors when --ts is missing", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "signal-history-by-traders", [], vals({
          instId: "BTC-USDT-SWAP", authorIds: "1,2",
        }), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /--ts/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Unknown action guard                                               */
  /* ------------------------------------------------------------------ */

  describe("unknown action", () => {
    it("errors and does not invoke the spy for unknown action", async () => {
      const { spy, captured } = makeSpy();
      const { errMsg } = await runWithErrCapture(() =>
        handleSmartmoneyCommand(spy, "legacy-overview", [], vals({}), false),
      );
      assert.equal(captured.tool, "");
      assert.match(errMsg, /Unknown smartmoney command/);
      assert.equal(process.exitCode, 1);
      clearExitCode();
    });
  });
});
