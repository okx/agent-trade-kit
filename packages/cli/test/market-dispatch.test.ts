/**
 * Regression tests for issue #175: market dispatcher emits spurious
 * "Unknown market command" error + exit 1 for orderbook/candles/trades/funding-rate.
 *
 * Root cause: handleMarketFilterCommand had a hardcoded errorLine + exitCode=1 at
 * its tail. Because handleMarketPublicCommand tail-calls handleMarketFilterCommand
 * as a fallback, the error fired before handleMarketDataCommand had a chance to
 * handle the action — producing real data on stdout AND an error on stderr.
 *
 * Fix: remove the side-effect block from handleMarketFilterCommand; add
 * unknownSubcommand() call in handleMarketCommand after both sub-dispatchers
 * return undefined (same pattern as swap/spot/futures/option/account/bot).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  handleMarketCommand,
  handleMarketPublicCommand,
  handleMarketDataCommand,
} from "../src/index.js";
import type { CliValues } from "../src/index.js";
import { setOutput, resetOutput } from "../src/formatter.js";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let capturedOut: string[] = [];
let capturedErr: string[] = [];

beforeEach(() => {
  capturedOut = [];
  capturedErr = [];
  setOutput({
    out: (m: string) => capturedOut.push(m),
    err: (m: string) => capturedErr.push(m),
  });
  // Reset exit code before each test so a leaked code from a prior test
  // doesn't confuse assertions.
  process.exitCode = 0;
});

afterEach(() => {
  resetOutput();
  process.exitCode = 0;
});

function fakeResult(data: unknown) {
  return {
    endpoint: "GET /api/v5/market/books",
    requestTime: new Date().toISOString(),
    data,
  };
}

/**
 * Minimal CliValues satisfying the type — only fields actually exercised
 * by the handleMarket*Command branches under test need to be present.
 */
function vals(overrides: Partial<Record<string, unknown>> = {}): CliValues {
  return overrides as CliValues;
}

// Runners that return minimal valid data for each data command
const orderbookRunner: ToolRunner = async () =>
  fakeResult([{ asks: [["100", "1"]], bids: [["99", "1"]], ts: "1700000000000" }]);
const candlesRunner: ToolRunner = async () =>
  fakeResult([["1700000000000", "100", "101", "99", "100", "1000"]]);
const tradesRunner: ToolRunner = async () =>
  fakeResult([{ tradeId: "1", instId: "BTC-USDT", px: "100", sz: "1", side: "buy", ts: "1700000000000" }]);
const fundingRateRunner: ToolRunner = async () =>
  fakeResult([{ instId: "BTC-USDT-SWAP", fundingRate: "0.0001", fundingTime: "1700000000000" }]);

// ---------------------------------------------------------------------------
// Regression: the 4 affected subcommands must NOT set exit 1 or emit stderr
// ---------------------------------------------------------------------------

describe("handleMarketCommand regression: affected subcommands exit 0 + empty stderr", () => {
  it("orderbook: process.exitCode stays 0 and stderr is empty", async () => {
    await handleMarketCommand(
      orderbookRunner,
      "orderbook",
      ["BTC-USDT"],
      vals({ sz: "5" }),
      false,
    );
    assert.equal(process.exitCode, 0, "exitCode must stay 0 for orderbook");
    assert.deepEqual(capturedErr, [], "stderr must be empty for orderbook");
  });

  it("candles: process.exitCode stays 0 and stderr is empty", async () => {
    await handleMarketCommand(
      candlesRunner,
      "candles",
      ["BTC-USDT"],
      vals({ bar: "1H" }),
      false,
    );
    assert.equal(process.exitCode, 0, "exitCode must stay 0 for candles");
    assert.deepEqual(capturedErr, [], "stderr must be empty for candles");
  });

  it("trades: process.exitCode stays 0 and stderr is empty", async () => {
    await handleMarketCommand(
      tradesRunner,
      "trades",
      ["BTC-USDT"],
      vals(),
      false,
    );
    assert.equal(process.exitCode, 0, "exitCode must stay 0 for trades");
    assert.deepEqual(capturedErr, [], "stderr must be empty for trades");
  });

  it("funding-rate: process.exitCode stays 0 and stderr is empty", async () => {
    await handleMarketCommand(
      fundingRateRunner,
      "funding-rate",
      ["BTC-USDT-SWAP"],
      vals({ history: false }),
      false,
    );
    assert.equal(process.exitCode, 0, "exitCode must stay 0 for funding-rate");
    assert.deepEqual(capturedErr, [], "stderr must be empty for funding-rate");
  });
});

// ---------------------------------------------------------------------------
// New behaviour: truly unknown market actions still error via unknownSubcommand
// ---------------------------------------------------------------------------

describe("handleMarketCommand: unknown action produces structured diagnostic", () => {
  it("unknown action sets process.exitCode = 1", () => {
    handleMarketCommand(
      (async () => { throw new Error("should not be called"); }) as ToolRunner,
      "totally-unknown-action",
      [],
      vals(),
      false,
    );
    assert.equal(process.exitCode, 1, "exitCode must be 1 for unknown action");
  });

  it("unknown action emits 'Unknown command: okx market ...' on stderr", () => {
    handleMarketCommand(
      (async () => { throw new Error("should not be called"); }) as ToolRunner,
      "bogus-cmd",
      [],
      vals(),
      false,
    );
    const joined = capturedErr.join("\n");
    assert.match(
      joined,
      /Unknown command: okx market bogus-cmd/,
      "stderr must include module-qualified unknown command message",
    );
  });

  it("unknown action lists available subcommands on stderr", () => {
    handleMarketCommand(
      (async () => { throw new Error("should not be called"); }) as ToolRunner,
      "totally-unknown",
      [],
      vals(),
      false,
    );
    const joined = capturedErr.join("\n");
    assert.match(joined, /Available subcommands:/, "stderr must list available subcommands");
    // Spot-check a few actions from different sub-dispatchers
    assert.match(joined, /orderbook/, "valid action 'orderbook' must appear in the list");
    assert.match(joined, /ticker/, "valid action 'ticker' must appear in the list");
    assert.match(joined, /filter/, "valid action 'filter' must appear in the list");
  });

  it("unknown action hints to run okx market --help", () => {
    handleMarketCommand(
      (async () => { throw new Error("should not be called"); }) as ToolRunner,
      "mystery",
      [],
      vals(),
      false,
    );
    const joined = capturedErr.join("\n");
    assert.match(joined, /okx market --help/, "stderr must suggest --help");
  });
});

// ---------------------------------------------------------------------------
// Invariant: handleMarketFilterCommand returns undefined (not error) when
// action is not a filter action — callers (handleMarketPublicCommand) must
// not see a side-effect from the filter fallback.
// ---------------------------------------------------------------------------

describe("handleMarketPublicCommand: filter fallback returns undefined silently for data actions", () => {
  it("handleMarketPublicCommand returns undefined for 'orderbook' (no stderr side-effect)", () => {
    const prevExit = process.exitCode;
    const result = handleMarketPublicCommand(
      (async () => { throw new Error("should not reach runner"); }) as ToolRunner,
      "orderbook",
      ["BTC-USDT"],
      vals(),
      false,
    );
    // Must return undefined so the ?? operator in handleMarketCommand
    // falls through to handleMarketDataCommand.
    assert.equal(result, undefined, "handleMarketPublicCommand must return undefined for 'orderbook'");
    assert.deepEqual(capturedErr, [], "no stderr side-effect from filter fallback");
    assert.equal(process.exitCode, prevExit, "exitCode must not be touched by filter fallback");
  });
});
