/**
 * CLI tests for `okx bot recurring <sub>` (Recurring Buy, CLI-only module).
 *
 * Routing tests use a spy ToolRunner and assert that every argument comes from its
 * named --flag (issue #78: never from positional `rest[N]`).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  OkxApiError,
  allToolSpecs,
  type OkxConfig,
  type OkxRestClient,
  type ToolRunner,
} from "@agent-tradekit/core";
import {
  cmdRecurringAmendAmount,
  cmdRecurringAmendTime,
  cmdRecurringCreate,
  cmdRecurringDetails,
  cmdRecurringOrders,
  cmdRecurringPause,
  cmdRecurringStop,
  cmdRecurringSubOrders,
} from "../src/commands/bot-recurring.js";
import { checkToolCount } from "../src/commands/diagnose-mcp.js";
import { Report } from "../src/commands/diagnose-utils.js";
import { setOutput, resetOutput } from "../src/formatter.js";
import { CLI_REGISTRY } from "../src/cli-registry.js";
import {
  createCliToolRunner,
  handleBotCommand,
  handleBotRecurringCommand,
  validateCliAiBuilderCodeUsage,
} from "../src/index.js";
import { parseCli, type CliValues } from "../src/parser.js";

let out: string[] = [];
let err: string[] = [];

beforeEach(() => {
  out = []; err = [];
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
});
afterEach(() => resetOutput());

function fakeResult(data: unknown) {
  return { endpoint: "POST /api/v5/tradingBot/recurring", requestTime: "2026-10-22T00:00:00.000Z", data };
}

function spyRunner(data: unknown = [{ algoId: "A1", sCode: "0", sMsg: "" }]) {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const run: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    return fakeResult(data);
  };
  return { run, captured };
}

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

const output = () => out.join("");

// ---------------------------------------------------------------------------
// Routing — handleBotRecurringCommand
// ---------------------------------------------------------------------------

describe("handleBotRecurringCommand routing (named flags only)", () => {
  it("create forwards every flag to recurring_create_order", async () => {
    const { run, captured } = spyRunner();
    await handleBotRecurringCommand(run, "create", vals({
      stgyName: "n", recurringList: '[{"ccy":"BTC","ratio":"1"}]', period: "weekly", recurringDay: "3",
      recurringHour: "4", recurringTime: "9", timeZone: "-5", amt: "100", investmentCcy: "USDC", tdMode: "cash",
      algoClOrdId: "cl1", tradeQuoteCcy: "USDT", source: "1,2", recurringTimeType: "2", aiBuilderCode: "MYBOT",
    }), false);
    assert.equal(captured.tool, "recurring_create_order");
    assert.deepEqual(captured.args, {
      stgyName: "n", recurringList: '[{"ccy":"BTC","ratio":"1"}]', period: "weekly", recurringDay: "3",
      recurringHour: "4", recurringTime: "9", timeZone: "-5", amt: "100", investmentCcy: "USDC", tdMode: "cash",
      algoClOrdId: "cl1", tradeQuoteCcy: "USDT", source: "1,2", recurringTimeType: "2", aiBuilderCode: "MYBOT",
    });
    assert.match(output(), /Recurring Buy created: A1 \(OK\)/);
  });

  it("create without --tdMode passes undefined through (the tool rejects it, no CLI default)", async () => {
    const { run, captured } = spyRunner();
    await handleBotRecurringCommand(run, "create", vals({ stgyName: "n" }), false);
    assert.equal(captured.args["tdMode"], undefined);
    assert.equal("tdMode" in captured.args, true);
  });

  const SIMPLE: Array<[string, string, Partial<CliValues>, Record<string, unknown>]> = [
    ["pause", "recurring_pause", { algoId: "9" }, { algoId: "9" }],
    ["restart", "recurring_restart", { algoId: "9" }, { algoId: "9" }],
    ["stop", "recurring_stop_order", { algoId: "9" }, { algoId: "9" }],
    ["details", "recurring_get_order_details", { algoId: "9" }, { algoId: "9" }],
    ["amend-name", "recurring_amend_name", { algoId: "9", stgyName: "new" }, { algoId: "9", stgyName: "new" }],
    ["amend-price-range", "recurring_amend_price_range", { algoId: "9", recurringList: "[]" }, { algoId: "9", recurringList: "[]" }],
    ["amend-amount", "recurring_amend_amount", { algoId: "9", amount: "20" }, { algoId: "9", amount: "20" }],
    ["add-investment", "recurring_add_investment", { algoId: "9", amount: "20" }, { algoId: "9", amount: "20" }],
    [
      "amend-time", "recurring_amend_time",
      { algoId: "9", recurringTimeType: "1", period: "monthly", timeZone: "8", recurringDay: "2", recurringHour: "1", recurringTime: "7" },
      { algoId: "9", recurringTimeType: "1", period: "monthly", timeZone: "8", recurringDay: "2", recurringHour: "1", recurringTime: "7" },
    ],
    [
      "sub-orders", "recurring_get_sub_orders",
      { algoId: "9", ordId: "5", after: "1", before: "2", limit: "3" },
      { algoId: "9", ordId: "5", after: "1", before: "2", limit: "3" },
    ],
  ];
  for (const [sub, tool, flags, expected] of SIMPLE) {
    it(`${sub} -> ${tool}`, async () => {
      const { run, captured } = spyRunner([]);
      await handleBotRecurringCommand(run, sub, vals(flags), false);
      assert.equal(captured.tool, tool);
      assert.deepEqual(captured.args, expected);
    });
  }

  it("amend-amount and add-investment accept --amt as an alias of --amount", async () => {
    for (const [sub, tool] of [["amend-amount", "recurring_amend_amount"], ["add-investment", "recurring_add_investment"]]) {
      const { run, captured } = spyRunner([]);
      await handleBotRecurringCommand(run, sub!, vals({ algoId: "9", amt: "15" }), false);
      assert.equal(captured.tool, tool);
      assert.equal(captured.args["amount"], "15");
    }
  });

  it("orders maps --history to status and forwards filters", async () => {
    let r = spyRunner([]);
    await handleBotRecurringCommand(r.run, "orders", vals({ algoId: "1", after: "2", before: "3", limit: "4" }), false);
    assert.equal(r.captured.tool, "recurring_get_orders");
    assert.deepEqual(r.captured.args, { status: "active", algoId: "1", after: "2", before: "3", limit: "4" });
    r = spyRunner([]);
    await handleBotRecurringCommand(r.run, "orders", vals({ history: true }), false);
    assert.equal(r.captured.args["status"], "history");
  });

  it("handleBotCommand dispatches 'recurring' and lists it for unknown bot subcommands", async () => {
    const { run, captured } = spyRunner([]);
    await handleBotCommand(run, "recurring", ["pause"], vals({ algoId: "7" }), false);
    assert.equal(captured.tool, "recurring_pause");

    const before = process.exitCode;
    handleBotCommand(run, "bogus", [], vals({}), false);
    process.exitCode = before;
    assert.match(err.join(""), /recurring/);
  });

  it("unknown recurring subcommand lists the recurring subcommands", () => {
    const { run } = spyRunner();
    const before = process.exitCode;
    handleBotRecurringCommand(run, "bogus", vals({}), false);
    process.exitCode = before;
    const text = err.join("");
    for (const sub of ["create", "amend-time", "add-investment", "sub-orders"]) assert.match(text, new RegExp(sub));
  });
});

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

describe("recurring command output", () => {
  it("prints '(OK)' with the passed algoId for the empty-data endpoints (not an Error)", async () => {
    const { run } = spyRunner([]);
    await cmdRecurringAmendAmount(run, { algoId: "42", amount: "20", json: false });
    await cmdRecurringAmendTime(run, { algoId: "43", recurringTimeType: "2", period: "daily", timeZone: "8", json: false });
    const text = output();
    assert.match(text, /Recurring Buy amount amended: 42 \(OK\)/);
    assert.match(text, /Recurring Buy time amended: 43 \(OK\)/);
    assert.doesNotMatch(text, /undefined/);
    assert.equal(err.join(""), "");
  });

  it("amend-time response without algoId falls back to the requested algoId", async () => {
    const { run } = spyRunner([{ sCode: "0", sMsg: "" }]);
    await cmdRecurringAmendTime(run, { algoId: "44", recurringTimeType: "2", period: "daily", timeZone: "8", json: false });
    assert.match(output(), /: 44 \(OK\)/);
  });

  it("falls back to the requested algoId when the response item carries an empty algoId", async () => {
    const { run } = spyRunner([{ algoId: "", sCode: "0", sMsg: "" }]);
    await cmdRecurringPause(run, { algoId: "46", json: false });
    assert.match(output(), /Recurring Buy paused: 46 \(OK\)/);
  });

  it("--json prints the raw data array", async () => {
    const { run } = spyRunner([{ algoId: "5", sCode: "0", sMsg: "" }]);
    await cmdRecurringPause(run, { algoId: "5", json: true });
    assert.deepEqual(JSON.parse(output()), [{ algoId: "5", sCode: "0", sMsg: "" }]);
  });

  it("a failed write (thrown OkxApiError) propagates so main() can report it", async () => {
    const run: ToolRunner = async () => { throw new OkxApiError("[51000] Parameter error", { code: "51000", endpoint: "/x" }); };
    await assert.rejects(() => cmdRecurringStop(run, { algoId: "1", json: false }), /51000/);
  });

  it("orders prints a table, friendly empty messages, and JSON", async () => {
    const row = { algoId: "1", stgyName: "s", state: "running", period: "daily", amt: "10", investmentCcy: "USDT", cycles: "2", totalPnl: "1", pnlRatio: "0.1", cTime: "1699932133373" };
    await cmdRecurringOrders(spyRunner([row]).run, { json: false });
    assert.match(output(), /running/);
    out = [];
    await cmdRecurringOrders(spyRunner([]).run, { json: false });
    assert.match(output(), /No Recurring Buy strategies/);
    out = [];
    await cmdRecurringOrders(spyRunner([]).run, { history: true, json: false });
    assert.match(output(), /No Recurring Buy history/);
    out = [];
    await cmdRecurringOrders(spyRunner([row]).run, { json: true });
    assert.equal((JSON.parse(output()) as unknown[]).length, 1);
  });

  it("details prints key/values and the per-coin table; empty -> not found", async () => {
    const detail = {
      algoId: "644497312047435776", stgyName: "stg1", state: "running", period: "hourly", recurringHour: "1",
      amt: "100", investmentCcy: "USDC", cycles: "6", nextInvestTime: "1699956005500", totalPnl: "0",
      recurringList: [{ avgPx: "0", ccy: "BTC", profit: "0", px: "36683.2", ratio: "0.2", minPx: "", maxPx: "", totalAmt: "0" }],
    };
    await cmdRecurringDetails(spyRunner([detail]).run, { algoId: "644497312047435776", json: false });
    assert.match(output(), /stg1/);
    assert.match(output(), /BTC/);
    out = [];
    await cmdRecurringDetails(spyRunner([]).run, { algoId: "1", json: false });
    assert.match(output(), /not found/);
  });

  it("sub-orders prints a table and an empty message", async () => {
    const sub = { ordId: "o1", instId: "ETH-USDC", side: "buy", ordType: "market", sz: "80", avgPx: "1765.4", accFillSz: "0.045", state: "filled", cTime: "1679911222200" };
    await cmdRecurringSubOrders(spyRunner([sub]).run, { algoId: "1", json: false });
    assert.match(output(), /ETH-USDC/);
    out = [];
    await cmdRecurringSubOrders(spyRunner([]).run, { algoId: "1", json: false });
    assert.match(output(), /No Recurring Buy sub orders/);
  });

  it("create --json prints raw data", async () => {
    const { run } = spyRunner([{ algoId: "9", sCode: "0", sMsg: "" }]);
    await cmdRecurringCreate(run, {
      stgyName: "n", recurringList: "[]", period: "daily", recurringTime: "0", timeZone: "8",
      amt: "1", investmentCcy: "USDT", tdMode: "cash", json: true,
    });
    assert.equal((JSON.parse(output()) as Array<{ algoId: string }>)[0]!.algoId, "9");
  });
});

// ---------------------------------------------------------------------------
// --aiBuilderCode, registry, parser, CLI runner end-to-end
// ---------------------------------------------------------------------------

describe("recurring --aiBuilderCode", () => {
  it("is accepted on create and rejected on every other recurring subcommand", () => {
    assert.doesNotThrow(() => validateCliAiBuilderCodeUsage("bot", "recurring", ["create"], vals({ aiBuilderCode: "MYBOT" })));
    for (const sub of ["orders", "details", "sub-orders", "pause", "restart", "stop", "amend-name", "amend-price-range", "amend-amount", "amend-time", "add-investment"]) {
      assert.throws(
        () => validateCliAiBuilderCodeUsage("bot", "recurring", [sub], vals({ aiBuilderCode: "MYBOT" })),
        /not supported/,
        sub,
      );
    }
  });
});

describe("recurring registry", () => {
  const commands = CLI_REGISTRY["bot"]!.subgroups!["recurring"]!.commands!;

  it("maps the 12 subcommands to their recurring_* tools", () => {
    const expected: Record<string, string> = {
      create: "recurring_create_order", orders: "recurring_get_orders", details: "recurring_get_order_details",
      "sub-orders": "recurring_get_sub_orders", pause: "recurring_pause", restart: "recurring_restart",
      stop: "recurring_stop_order", "amend-name": "recurring_amend_name", "amend-price-range": "recurring_amend_price_range",
      "amend-amount": "recurring_amend_amount", "amend-time": "recurring_amend_time", "add-investment": "recurring_add_investment",
    };
    assert.deepEqual(Object.fromEntries(Object.entries(commands).map(([k, c]) => [k, c.toolName])), expected);
    const toolNames = new Set(allToolSpecs().map((s) => s.name));
    for (const c of Object.values(commands)) assert.ok(toolNames.has(c.toolName), c.toolName);
  });

  it("documents the negative time zone form and the tdMode mapping on create", () => {
    assert.match(commands["create"]!.usage, /--timeZone=-5/);
    assert.match(commands["create"]!.usage, /--tdMode/);
  });
});

describe("parseCli — recurring flags", () => {
  it("parses a negative --timeZone given as a separate argument", () => {
    for (const [argv, tz] of [
      [["bot", "recurring", "create", "--timeZone", "-5"], "-5"],
      [["bot", "recurring", "create", "--timeZone=-5"], "-5"],
      [["bot", "recurring", "create", "--timeZone", "5.5"], "5.5"],
      [["bot", "recurring", "create", "--timeZone", "-3.5"], "-3.5"],
      [["bot", "recurring", "create", "--timeZone", "8"], "8"],
    ] as Array<[string[], string]>) {
      assert.equal(parseCli(argv).values.timeZone, tz, argv.join(" "));
    }
  });

  it("does not swallow the next flag after --timeZone", () => {
    const { values } = parseCli(["bot", "recurring", "create", "--timeZone", "-5", "--amt", "10"]);
    assert.equal(values.timeZone, "-5");
    assert.equal(values.amt, "10");
  });

  it("parses the recurring-specific flags as strings", () => {
    const { values } = parseCli([
      "bot", "recurring", "create", "--recurringList", '[{"ccy":"BTC","ratio":"1"}]', "--recurringDay", "1",
      "--recurringHour", "4", "--recurringTime", "0", "--recurringTimeType", "2", "--source", "1,2", "--amount", "5",
    ]);
    assert.equal(values.recurringList, '[{"ccy":"BTC","ratio":"1"}]');
    assert.equal(values.recurringDay, "1");
    assert.equal(values.recurringHour, "4");
    assert.equal(values.recurringTime, "0");
    assert.equal(values.recurringTimeType, "2");
    assert.equal(values.source, "1,2");
    assert.equal(values.amount, "5");
  });
});

describe("createCliToolRunner with recurring tools", () => {
  function recorder(data: unknown = [{ algoId: "A1", sCode: "0", sMsg: "" }]) {
    const calls: Array<{ endpoint: string; body: unknown }> = [];
    const client = {
      privatePost: async (endpoint: string, body: unknown) => {
        calls.push({ endpoint, body });
        return { endpoint, requestTime: "2026-10-22T00:00:00.000Z", data };
      },
    } as unknown as OkxRestClient;
    const config: OkxConfig = {
      hasAuth: true, profile: "default", baseUrl: "https://www.okx.com", timeoutMs: 30000,
      // bot.recurring is deliberately not in modules: the CLI path ignores module gating.
      modules: ["spot"], readOnly: false, demo: true, site: "global", sourceTag: "CLI", verbose: false,
    };
    return { run: createCliToolRunner(client, config), calls };
  }

  it("create uses --aiBuilderCode as the order tag", async () => {
    const { run, calls } = recorder();
    await handleBotRecurringCommand(run, "create", vals({
      stgyName: "n", recurringList: '[{"ccy":"BTC","ratio":"1"}]', period: "daily", recurringTime: "0",
      timeZone: "8", amt: "10", investmentCcy: "USDT", tdMode: "cash", aiBuilderCode: "MYBOT",
    }), false);
    assert.equal(calls[0]!.endpoint, "/api/v5/tradingBot/recurring/order-algo");
    assert.equal((calls[0]!.body as Record<string, unknown>)["tag"], "MYBOT");
    assert.equal("aiBuilderCode" in (calls[0]!.body as object), false);
  });

  it("stop sends the array body and an empty-data amend prints OK end to end", async () => {
    const stop = recorder();
    await handleBotRecurringCommand(stop.run, "stop", vals({ algoId: "77" }), false);
    assert.deepEqual(stop.calls[0]!.body, [{ algoId: "77" }]);

    const amend = recorder([]);
    await handleBotRecurringCommand(amend.run, "amend-amount", vals({ algoId: "78", amount: "9" }), false);
    assert.match(output(), /Recurring Buy amount amended: 78 \(OK\)/);
  });

  it("surfaces a server sCode failure as a thrown OkxApiError", async () => {
    const { run } = recorder([{ algoId: "1", sCode: "51000", sMsg: "Parameter error" }]);
    await assert.rejects(
      async () => handleBotRecurringCommand(run, "pause", vals({ algoId: "1" }), false),
      (e: unknown) => e instanceof OkxApiError && /\[51000\]/.test(e.message),
    );
  });

  it("a core validation error stops before any HTTP call", async () => {
    const { run, calls } = recorder();
    await assert.rejects(
      async () => handleBotRecurringCommand(run, "create", vals({
        stgyName: "n", recurringList: '[{"ccy":"BTC","ratio":"1"}]', period: "daily", recurringTime: "0",
        timeZone: "8", amt: "10", investmentCcy: "USDT",
      }), false),
      /tdMode/,
    );
    assert.equal(calls.length, 0);
  });

  const CREATE_VALS = {
    stgyName: "n", recurringList: '[{"ccy":"BTC","ratio":"1"}]', period: "daily", recurringTime: "0",
    timeZone: "8", amt: "10", investmentCcy: "USDT", tdMode: "cash",
  };

  it("create fails instead of printing a blank '(OK)' when the server returns success without an algoId", async () => {
    for (const data of [[], [{ sCode: "0", sMsg: "" }], [{ algoId: "", sCode: "0", sMsg: "" }]]) {
      const { run } = recorder(data);
      await assert.rejects(
        async () => handleBotRecurringCommand(run, "create", vals(CREATE_VALS), false),
        (e: unknown) => e instanceof OkxApiError && /no algoId/.test(e.message),
      );
    }
    assert.equal(output(), "");
  });

  it("create rejects an invalid --aiBuilderCode before any HTTP call", async () => {
    for (const code of ["bad-code!", "ABCDEFGHIJKLMNOPQ"]) {
      const { run, calls } = recorder();
      await assert.rejects(
        async () => handleBotRecurringCommand(run, "create", vals({ ...CREATE_VALS, aiBuilderCode: code }), false),
        /aiBuilderCode .* is invalid/,
      );
      assert.equal(calls.length, 0, code);
    }
  });
});

// ---------------------------------------------------------------------------
// diagnose: CLI-only specs are not MCP tools
// ---------------------------------------------------------------------------

describe("checkToolCount excludes CLI-only modules", () => {
  it("counts only MCP-loadable specs", () => {
    const specs = [
      { name: "a", module: "spot" },
      { name: "b", module: "swap" },
      { name: "c", module: "bot.recurring" },
    ] as unknown as ReturnType<typeof allToolSpecs>;
    checkToolCount(new Report(), [], () => specs);
    assert.match(output(), /2 tools loaded/);
  });
});
