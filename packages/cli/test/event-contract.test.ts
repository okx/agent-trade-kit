import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  cmdEventBrowse,
  cmdEventSeries,
  cmdEventEvents,
  cmdEventMarkets,
  cmdEventOrders,
  cmdEventFills,
  cmdEventPlace,
  cmdEventAmend,
  cmdEventCancel,
} from "../src/commands/event-contract.js";
import { setOutput, resetOutput } from "../src/formatter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let out: string[];
let err: string[];
const originalWrite = process.stdout.write;
const originalErrWrite = process.stderr.write;

beforeEach(() => {
  out = [];
  err = [];
  // Capture formatter output (printTable, printJson)
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
  // Capture direct process.stdout.write calls in the source
  process.stdout.write = ((chunk: string | Buffer) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  // Capture direct process.stderr.write calls in the source
  process.stderr.write = ((chunk: string | Buffer) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
});
afterEach(() => {
  resetOutput();
  process.stdout.write = originalWrite;
  process.stderr.write = originalErrWrite;
  process.exitCode = undefined;
});

function joined(): string {
  return out.join("");
}

function makeRun(data: unknown, extras?: Record<string, unknown>): ToolRunner {
  return async () => ({ data, ...extras });
}

/** Sequential runner: each call returns the next response in order. */
function makeRunSequence(
  responses: Array<{ data?: unknown; error?: Error; extras?: Record<string, unknown> }>,
): ToolRunner {
  let callIdx = 0;
  return async () => {
    const resp = responses[callIdx++];
    if (resp?.error) throw resp.error;
    return { data: resp?.data ?? [], ...resp?.extras };
  };
}

// ---------------------------------------------------------------------------
// cmdEventBrowse
// ---------------------------------------------------------------------------

describe("cmdEventBrowse", () => {
  it("prints table with contract info", async () => {
    const run = makeRun([
      {
        method: "price_up_down",
        freq: "fifteen_min",
        underlying: "BTC",
        contracts: [
          { instId: "BTC-UPDOWN-15MIN-990101-0800-0815", expTime: "2099-01-01", floorStrike: "", px: "0.548", outcome: "pending" },
        ],
      },
    ]);
    await cmdEventBrowse(run, { json: false });
    const text = joined();
    assert.ok(text.includes("Up/Down"), "should show method label");
    assert.ok(text.includes("15min"), "should show freq label");
    assert.ok(text.includes("BTC"), "should show underlying");
    assert.ok(text.includes("54.8%"), "should show implied probability when px is present");
    assert.ok(text.includes("—"), "pending outcome shows dash (no incremental info)");
    assert.ok(text.includes("1 active contract(s)"), "should show total count");
    assert.ok(text.includes("Up/Down · 1/1"), "should show formatted contract name via formatDisplayTitle");
  });

  it("prints empty message when no data", async () => {
    const run = makeRun([]);
    await cmdEventBrowse(run, { json: false });
    assert.ok(joined().includes("No active event contracts found"));
  });

  it("prints empty message when data is null", async () => {
    const run = makeRun(null);
    await cmdEventBrowse(run, { json: false });
    assert.ok(joined().includes("No active event contracts found"));
  });

  it("outputs JSON when json=true", async () => {
    const run = makeRun([{ method: "price_above", contracts: [] }]);
    await cmdEventBrowse(run, { json: true });
    assert.doesNotThrow(() => JSON.parse(joined()), "should output valid JSON");
  });
});

// ---------------------------------------------------------------------------
// cmdEventSeries
// ---------------------------------------------------------------------------

describe("cmdEventSeries", () => {
  it("groups Up/Down and Price Above sections", async () => {
    const run = makeRun([
      { seriesId: "BTC-UPDOWN-15MIN", settlement: { method: "price_up_down", underlying: "BTC" }, freq: "fifteen_min", state: "live" },
      { seriesId: "ETH-ABOVE-DAILY", settlement: { method: "price_above", underlying: "ETH" }, freq: "daily", state: "live" },
    ]);
    await cmdEventSeries(run, { json: false });
    const text = joined();
    assert.ok(text.includes("Up/Down"), "should have Up/Down section");
    assert.ok(text.includes("Price Above"), "should have Price Above section");
    assert.ok(text.includes("BTC-UPDOWN-15MIN"), "should list featured series");
  });

  it("hides test series by default and shows count", async () => {
    const run = makeRun([
      { seriesId: "BTC-UPDOWN-15MIN", settlement: { method: "price_up_down", underlying: "BTC" }, freq: "fifteen_min", state: "live" },
      { seriesId: "TESTAAAA-UPDOWN-15MIN", settlement: { method: "price_up_down", underlying: "TESTAAAA" }, freq: "fifteen_min", state: "live" },
    ]);
    await cmdEventSeries(run, { json: false });
    const text = joined();
    assert.ok(text.includes("1 test series hidden"), "should show hidden test series count");
    assert.ok(text.includes("--all"), "should hint about --all flag");
    assert.ok(!text.includes("TESTAAAA"), "test series should not appear in output");
  });

  it("shows test series when --all is set", async () => {
    const run = makeRun([
      { seriesId: "TESTAAAA-UPDOWN-15MIN", settlement: { method: "price_up_down", underlying: "TESTAAAA" }, freq: "fifteen_min", state: "live" },
    ]);
    await cmdEventSeries(run, { all: true, json: false });
    const text = joined();
    assert.ok(text.includes("Test / Other"), "should show Test / Other section");
    assert.ok(text.includes("TESTAAAA"), "test series should appear when --all");
  });

  it("outputs JSON when json=true", async () => {
    const run = makeRun([{ seriesId: "BTC-UPDOWN-15MIN" }]);
    await cmdEventSeries(run, { json: true });
    assert.doesNotThrow(() => JSON.parse(joined()));
  });
});

// ---------------------------------------------------------------------------
// cmdEventEvents
// ---------------------------------------------------------------------------

describe("cmdEventEvents", () => {
  it("prints events table", async () => {
    const run = makeRun([
      { eventId: "evt001", state: "live", expTime: "1700000000000", settleTime: "1700003600000" },
    ]);
    await cmdEventEvents(run, { seriesId: "BTC-UPDOWN-15MIN", json: false });
    const text = joined();
    assert.ok(text.includes("evt001"), "should show eventId");
    assert.ok(text.includes("live"), "should show state");
  });

  it("outputs JSON when json=true", async () => {
    const run = makeRun([{ eventId: "evt001" }]);
    await cmdEventEvents(run, { seriesId: "BTC-UPDOWN-15MIN", json: true });
    assert.doesNotThrow(() => JSON.parse(joined()));
  });
});

// ---------------------------------------------------------------------------
// cmdEventMarkets
// ---------------------------------------------------------------------------

describe("cmdEventMarkets", () => {
  it("displays index price header and computes status", async () => {
    // Use a far-future instId so it won't be Settled
    const run = makeRun(
      [
        { instId: "BTC-ABOVE-DAILY-990101-0800-70000", expTime: "2099-01-01", floorStrike: "70000", px: "0.548", outcome: "pending", settleValue: "" },
      ],
      { currentIdxPx: "69500", underlying: "BTC" },
    );
    await cmdEventMarkets(run, { seriesId: "BTC-ABOVE-DAILY", json: false });
    const text = joined();
    assert.ok(text.includes("69500"), "should show current index price");
    assert.ok(text.includes("BTC"), "should show underlying");
    assert.ok(text.includes("54.8%"), "should show implied probability when px is present");
    assert.ok(!text.includes("In Progress"), "status column removed — no 'In Progress' in output");
  });

  it("shows settled outcome for expired contracts (status column removed)", async () => {
    // Past date instId
    const run = makeRun([
      { instId: "BTC-ABOVE-DAILY-200101-0800-70000", expTime: "2020-01-01", floorStrike: "70000", outcome: "YES", settleValue: "1" },
    ]);
    await cmdEventMarkets(run, { seriesId: "BTC-ABOVE-DAILY", json: false });
    const text = joined();
    assert.ok(text.includes("YES"), "expired contract should show outcome YES");
    assert.ok(!text.includes("Settled"), "status column removed — no 'Settled' in output");
  });

  it("shows UP for settled UPDOWN contracts when core already translated outcome to YES", async () => {
    const run = makeRun([
      { instId: "BTC-UPDOWN-15MIN-200101-0800-0815", expTime: "2020-01-01", floorStrike: "1", outcome: "YES", settleValue: "1" },
    ]);
    await cmdEventMarkets(run, { seriesId: "BTC-UPDOWN-15MIN", json: false });
    const text = joined();
    assert.ok(text.includes("UP"), "UPDOWN markets should render YES as UP");
  });

  it("renders contracts without floorStrike (status column removed)", async () => {
    // Far-future UPDOWN without started time
    const run = makeRun([
      { instId: "BTC-ABOVE-DAILY-990101-0800-70000", expTime: "2099-01-01", floorStrike: "", outcome: "", settleValue: "" },
    ]);
    await cmdEventMarkets(run, { seriesId: "BTC-ABOVE-DAILY", json: false });
    const text = joined();
    assert.ok(!text.includes("Upcoming"), "status column removed — no 'Upcoming' in output");
  });

  it("outputs JSON when json=true", async () => {
    const run = makeRun([{ instId: "BTC-ABOVE-DAILY-990101-0800-70000" }]);
    await cmdEventMarkets(run, { seriesId: "BTC-ABOVE-DAILY", json: true });
    assert.doesNotThrow(() => JSON.parse(joined()));
  });
});

// ---------------------------------------------------------------------------
// cmdEventOrders
// ---------------------------------------------------------------------------

describe("cmdEventOrders", () => {
  it("displays contract name, direction, price, size, status", async () => {
    const run = makeRun([
      {
        instId: "BTC-ABOVE-DAILY-990101-1600-70000",
        cTime: "1700000000000",
        side: "buy",
        outcome: "1",
        px: "0.65",
        fillSz: "5",
        sz: "10",
        state: "live",
        stateLabel: "Unfilled",
        ordId: "ord123",
      },
    ]);
    await cmdEventOrders(run, { json: false });
    const text = joined();
    assert.ok(text.includes("BTC above 70,000"), "should show formatted contract name");
    assert.ok(text.includes("BUY"), "should show direction");
    assert.ok(text.includes("YES"), "ABOVE series outcome 1 = YES");
    assert.ok(text.includes("0.65"), "should show price");
    assert.ok(text.includes("5 / 10"), "should show fill/total size");
    assert.ok(text.includes("Unfilled"), "should show stateLabel instead of raw state");
    assert.ok(text.includes("ord123"), "should show order number");
    assert.ok(text.includes("Order number"), "table header should be 'Order number'");
  });

  it("shows UP for UPDOWN series outcome 1", async () => {
    const run = makeRun([
      {
        instId: "BTC-UPDOWN-15MIN-990101-0800-0815",
        cTime: "1700000000000",
        side: "buy",
        outcome: "1",
        px: "0.5",
        fillSz: "0",
        sz: "10",
        state: "live",
        stateLabel: "Unfilled",
        ordId: "ord456",
      },
    ]);
    await cmdEventOrders(run, { json: false });
    const text = joined();
    assert.ok(text.includes("UP"), "UPDOWN series outcome 1 = UP");
    assert.ok(text.includes("Unfilled"), "should show stateLabel");
  });

  it("shows UP for UPDOWN series when core already translated outcome to YES", async () => {
    const run = makeRun([
      {
        instId: "BTC-UPDOWN-15MIN-990101-0800-0815",
        cTime: "1700000000000",
        side: "buy",
        outcome: "YES",
        px: "0.5",
        fillSz: "0",
        sz: "10",
        state: "live",
        stateLabel: "Unfilled",
        ordId: "ord457",
      },
    ]);
    await cmdEventOrders(run, { json: false });
    const text = joined();
    assert.ok(text.includes("UP"), "translated YES should still display as UP for UPDOWN");
    assert.ok(text.includes("Unfilled"), "should show stateLabel");
  });

  it("outputs JSON when json=true", async () => {
    const run = makeRun([{ instId: "BTC-ABOVE-DAILY-990101-1600-70000", ordId: "ord123" }]);
    await cmdEventOrders(run, { json: true });
    assert.doesNotThrow(() => JSON.parse(joined()));
  });
});

// ---------------------------------------------------------------------------
// cmdEventFills
// ---------------------------------------------------------------------------

describe("cmdEventFills", () => {
  it("displays fill data with direction", async () => {
    const run = makeRun([
      {
        instId: "BTC-ABOVE-DAILY-990101-1600-70000",
        side: "buy",
        outcome: "1",
        fillPx: "0.65",
        fillSz: "5",
        ts: "1700000000000",
        ordId: "ord789",
      },
    ]);
    await cmdEventFills(run, { json: false });
    const text = joined();
    assert.ok(text.includes("BUY"), "should show side");
    assert.ok(text.includes("YES"), "should show outcome");
    assert.ok(text.includes("0.65"), "should show fill price");
    assert.ok(text.includes("5"), "should show fill size");
    assert.ok(text.includes("ord789"), "should show order ID");
  });

  it("shows DOWN for UPDOWN series outcome 2", async () => {
    const run = makeRun([
      {
        instId: "BTC-UPDOWN-15MIN-990101-0800-0815",
        side: "sell",
        outcome: "2",
        fillPx: "0.4",
        fillSz: "3",
        ts: "1700000000000",
        ordId: "ord999",
      },
    ]);
    await cmdEventFills(run, { json: false });
    const text = joined();
    assert.ok(text.includes("SELL"), "should show side");
    assert.ok(text.includes("DOWN"), "UPDOWN outcome 2 = DOWN");
  });

  it("shows DOWN for UPDOWN series when core already translated outcome to NO", async () => {
    const run = makeRun([
      {
        instId: "BTC-UPDOWN-15MIN-990101-0800-0815",
        side: "sell",
        outcome: "NO",
        fillPx: "0.4",
        fillSz: "3",
        ts: "1700000000000",
        ordId: "ord998",
      },
    ]);
    await cmdEventFills(run, { json: false });
    const text = joined();
    assert.ok(text.includes("DOWN"), "translated NO should still display as DOWN for UPDOWN");
  });

  it("outputs JSON when json=true", async () => {
    const run = makeRun([{ instId: "BTC-ABOVE-DAILY-990101-1600-70000" }]);
    await cmdEventFills(run, { json: true });
    assert.doesNotThrow(() => JSON.parse(joined()));
  });
});

// ---------------------------------------------------------------------------
// cmdEventPlace
// ---------------------------------------------------------------------------

describe("cmdEventPlace", () => {
  it("outputs successful order with period and hints", async () => {
    const run = makeRun([{ ordId: "ord-place-1" }]);
    await cmdEventPlace(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      side: "buy",
      outcome: "YES",
      sz: "10",
      px: "0.65",
      ordType: "limit",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("ord-place-1"), "should show ordId");
    assert.ok(text.includes("Period:"), "should show period");
    assert.ok(text.includes("2099-01-01"), "should show date from instId");
    assert.ok(text.includes("BUY"), "should show side");
    assert.ok(text.includes("sz: 10"), "should show size");
    assert.ok(text.includes("px: 0.65"), "should show price");
    assert.ok(text.includes("limit order"), "should show order type hint");
  });

  it("market order shows conversion note", async () => {
    const run = makeRun([{ ordId: "ord-mkt-1" }]);
    await cmdEventPlace(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      side: "buy",
      outcome: "YES",
      sz: "10",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("market order"), "should mention market order");
    assert.ok(text.includes("converts sz"), "should show conversion note for market orders");
  });

  it("handles expired contract error with fallback suggestions", async () => {
    // Past-date instId so inferExpiryMsFromInstId returns a past timestamp
    const run = makeRunSequence([
      { error: new Error("Contract expired") },
      {
        data: [
          { instId: "BTC-ABOVE-DAILY-990201-1600-70000", expTime: "2020-02-01", floorStrike: "70000" },
        ],
      },
    ]);
    await cmdEventPlace(run, {
      instId: "BTC-ABOVE-DAILY-200101-1600-70000",
      side: "buy",
      outcome: "YES",
      sz: "10",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("has expired"), "should mention expired");
    assert.ok(text.includes("next available"), "should suggest next contracts");
    assert.ok(text.includes("BTC-ABOVE-DAILY-990201-1600-70000"), "should show fallback contract");
  });

  it("handles generic error for non-expired contract", async () => {
    // Far-future instId so it's NOT expired
    const run: ToolRunner = async () => { throw new Error("51001 instrument not found"); };
    await cmdEventPlace(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      side: "buy",
      outcome: "YES",
      sz: "10",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("Order failed"), "should show order failed");
    assert.ok(text.includes("not found"), "should show error detail");
  });

  it("errors when ordType=limit but --px is missing", async () => {
    const run = makeRun([{ ordId: "should-not-reach" }]);
    await cmdEventPlace(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      side: "buy",
      outcome: "YES",
      sz: "10",
      ordType: "limit",
      json: false,
    });
    const errText = err.join("");
    assert.ok(errText.includes("--px"), "should mention --px flag");
    assert.ok(errText.includes("required"), "should mention it is required");
    assert.ok(!joined().includes("should-not-reach"), "should not call runner");
  });

  it("outputs JSON when json=true on success", async () => {
    const run = makeRun([{ ordId: "ord-json-1" }]);
    await cmdEventPlace(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      side: "buy",
      outcome: "YES",
      sz: "10",
      json: true,
    });
    assert.doesNotThrow(() => JSON.parse(joined()));
  });
});

// ---------------------------------------------------------------------------
// cmdEventAmend
// ---------------------------------------------------------------------------

describe("cmdEventAmend", () => {
  it("outputs successful amend", async () => {
    const run = makeRun([{ ordId: "ord-amend-1", sCode: "0", sMsg: "" }]);
    await cmdEventAmend(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      ordId: "ord-amend-1",
      px: "0.70",
      sz: "20",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("Amended: ord-amend-1"), "should confirm amend");
    assert.ok(text.includes("new px: 0.70"), "should show new price");
    assert.ok(text.includes("new sz: 20"), "should show new size");
  });

  it("shows failure with sCode error", async () => {
    // MCP normalizeWrite throws on non-zero sCode, so simulate that here
    const run: ToolRunner = async () => { throw new Error("Instrument not found"); };
    await cmdEventAmend(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      ordId: "ord-amend-2",
      px: "0.70",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("Failed to amend"), "should show failure");
    assert.ok(text.includes("Instrument not found"), "should show error message");
  });

  it("handles thrown error", async () => {
    const run: ToolRunner = async () => { throw new Error("Network timeout"); };
    await cmdEventAmend(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      ordId: "ord-amend-3",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("Failed to amend order ord-amend-3"), "should show ordId in error");
    assert.ok(text.includes("Network timeout"), "should show error message");
  });

  it("outputs JSON when json=true", async () => {
    const run = makeRun([{ ordId: "ord-amend-1", sCode: "0" }]);
    await cmdEventAmend(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      ordId: "ord-amend-1",
      json: true,
    });
    assert.doesNotThrow(() => JSON.parse(joined()));
  });
});

// ---------------------------------------------------------------------------
// cmdEventCancel
// ---------------------------------------------------------------------------

describe("cmdEventCancel", () => {
  it("outputs successful cancel", async () => {
    const run = makeRun([{ ordId: "ord-cancel-1", sCode: "0", sMsg: "" }]);
    await cmdEventCancel(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      ordId: "ord-cancel-1",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("Cancelled: ord-cancel-1"), "should confirm cancel");
  });

  it("shows expired contract message when cancel fails on expired instId", async () => {
    // Past-date instId
    const run: ToolRunner = async () => { throw new Error("Contract expired"); };
    await cmdEventCancel(run, {
      instId: "BTC-ABOVE-DAILY-200101-1600-70000",
      ordId: "ord-cancel-2",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("already expired"), "should mention expired");
    assert.ok(text.includes("auto-cancelled"), "should mention auto-cancelled");
  });

  it("shows generic error for non-expired cancel failure", async () => {
    const run: ToolRunner = async () => { throw new Error("Server error"); };
    await cmdEventCancel(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      ordId: "ord-cancel-3",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("Failed to cancel order ord-cancel-3"), "should show failure");
    assert.ok(text.includes("Server error"), "should show error message");
  });

  it("shows cancel confirmation even when sCode is non-zero (normalizeWrite throws before reaching CLI)", async () => {
    // With normalizeWrite in the MCP layer, sCode !== "0" causes an OkxApiError throw
    // before the CLI handler sees the data. This test verifies the CLI still works
    // when the runner directly returns data (e.g. in non-MCP usage).
    const run = makeRun([{ ordId: "ord-cancel-4", sCode: "51400", sMsg: "Cancellation failed" }]);
    await cmdEventCancel(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      ordId: "ord-cancel-4",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("Cancelled: ord-cancel-4"), "should show cancel with ordId from response");
  });

  it("outputs JSON when json=true", async () => {
    const run = makeRun([{ ordId: "ord-cancel-1", sCode: "0" }]);
    await cmdEventCancel(run, {
      instId: "BTC-ABOVE-DAILY-990101-1600-70000",
      ordId: "ord-cancel-1",
      json: true,
    });
    assert.doesNotThrow(() => JSON.parse(joined()));
  });
});

// ---------------------------------------------------------------------------
// displayTitle in CLI output
// ---------------------------------------------------------------------------

describe("CLI displayTitle rendering", () => {
  it("cmdEventMarkets shows formatted contract name", async () => {
    const run = makeRun(
      [{ instId: "BTC-ABOVE-DAILY-260407-1600-70000", floorStrike: "70000", px: "0.45", outcome: "", settleValue: "", expTime: "" }],
      { currentIdxPx: "68000", underlying: "BTC-USDT" },
    );
    await cmdEventMarkets(run, { seriesId: "BTC-ABOVE-DAILY", json: false });
    const text = joined();
    assert.ok(text.includes("above 70,000"), "should show formatted contract name");
    assert.ok(text.includes("BTC-ABOVE-DAILY-260407-1600-70000"), "should still show raw instId");
  });
});

// ---------------------------------------------------------------------------
// cmdEventPlace pre-order summary
// ---------------------------------------------------------------------------

describe("cmdEventPlace pre-order summary", () => {
  it("prints cost summary for limit order", async () => {
    const run = makeRun([{ ordId: "ord-001", sCode: "0" }]);
    await cmdEventPlace(run, {
      instId: "BTC-ABOVE-DAILY-260407-1600-70000",
      side: "buy",
      outcome: "YES",
      sz: "10",
      px: "0.45",
      ordType: "limit",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("Placing:"), "should print placing summary");
    assert.ok(text.includes("above 70,000"), "should show formatted contract name");
    assert.ok(text.includes("cost ≈ 4.50"), "should show estimated cost (no currency unit)");
    assert.ok(text.includes("max gain ≈ 5.50"), "should show max gain (no currency unit)");
  });

  it("prints market order summary", async () => {
    const run = makeRun([{ ordId: "ord-002", sCode: "0" }]);
    await cmdEventPlace(run, {
      instId: "BTC-UPDOWN-15MIN-260407-1600-1615",
      side: "buy",
      outcome: "UP",
      sz: "5",
      ordType: "market",
      json: false,
    });
    const text = joined();
    assert.ok(text.includes("Placing:"), "should print placing summary");
    assert.ok(text.includes("market order"), "should mention market order");
    assert.ok(text.includes("sz=5"), "should show amount");
  });
});
