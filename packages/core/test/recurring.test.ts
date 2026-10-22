/**
 * Unit tests for the Recurring Buy (定投) tools (CLI-only module `bot.recurring`).
 *
 * Fixtures copy the real response shapes of the OpenAPI contract
 * (OKX_Recurring_Buy_API_openapi). The module is deliberately outside MODULES, so
 * these tests also guard that no recurring_* tool ever reaches the MCP surface.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerRecurringTools } from "../src/tools/bot/recurring.js";
import { allToolSpecs, buildTools } from "../src/tools/index.js";
import { loadConfig } from "../src/config.js";
import {
  BOT_SUB_MODULE_IDS,
  CLI_ONLY_MODULE_IDS,
  DEFAULT_MODULES,
  MODULES,
  MODULE_DESCRIPTIONS,
} from "../src/constants.js";
import { OkxApiError, ValidationError } from "../src/utils/errors.js";
import type { ToolContext, ToolSpec } from "../src/tools/types.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface Captured {
  method: "GET" | "POST";
  endpoint: string;
  payload: unknown;
  rateLimit: { key: string; capacity: number; refillPerSecond: number } | undefined;
}

const DEFAULT_DATA = Symbol("default-data");
/** Marks a response whose `data` field is absent (a plain `undefined` would select the default). */
const ABSENT = Symbol("absent-data");

function makeClient(data: unknown = DEFAULT_DATA) {
  let responseData = data;
  if (data === DEFAULT_DATA) responseData = [{ algoId: "1", sCode: "0", sMsg: "" }];
  if (data === ABSENT) responseData = undefined;
  const calls: Captured[] = [];
  const respond = (method: "GET" | "POST") =>
    async (endpoint: string, payload: unknown, rateLimit?: Captured["rateLimit"]) => {
      calls.push({ method, endpoint, payload, rateLimit });
      return { endpoint, requestTime: "2026-10-22T00:00:00.000Z", data: responseData };
    };
  const client = { privateGet: respond("GET"), privatePost: respond("POST") };
  return { client, calls };
}

function makeContext(client: unknown, sourceTag = "MCP"): ToolContext {
  return { config: { sourceTag } as ToolContext["config"], client: client as ToolContext["client"] };
}

const SPECS = registerRecurringTools();

function tool(name: string): ToolSpec {
  const spec = SPECS.find((s) => s.name === name);
  assert.ok(spec, `tool ${name} not registered`);
  return spec;
}

async function run(name: string, args: Record<string, unknown>, data: unknown = DEFAULT_DATA, sourceTag?: string) {
  const { client, calls } = makeClient(data);
  const result = await tool(name).handler(args, makeContext(client, sourceTag));
  return { result: result as { endpoint: string; requestTime: string; data: unknown }, calls };
}

async function assertRejects(name: string, args: Record<string, unknown>, pattern?: RegExp) {
  const { client, calls } = makeClient();
  await assert.rejects(
    () => tool(name).handler(args, makeContext(client)),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError, `expected ValidationError, got ${String(err)}`);
      if (pattern) assert.match((err as Error).message, pattern);
      return true;
    },
  );
  assert.equal(calls.length, 0, "no HTTP call may be made when validation fails");
}

const VALID_CREATE = {
  stgyName: "BTC|ETH recurring buy monthly",
  recurringList: '[{"ccy":"BTC","ratio":"0.2"},{"ccy":"ETH","ratio":"0.8"}]',
  period: "monthly",
  recurringDay: "1",
  recurringTime: "0",
  timeZone: "8",
  amt: "100",
  investmentCcy: "USDT",
  tdMode: "cross",
};

const MCP_TOOL_COUNT = 178;

// ---------------------------------------------------------------------------
// 1. Registration
// ---------------------------------------------------------------------------

describe("recurring tools — registration", () => {
  const WRITES = [
    "recurring_place_order",
    "recurring_pause",
    "recurring_restart",
    "recurring_stop",
    "recurring_amend_name",
    "recurring_amend_price_range",
    "recurring_amend_amount",
    "recurring_amend_time",
    "recurring_add_investment",
  ];
  const READS = ["recurring_get_order_details", "recurring_get_orders", "recurring_get_sub_orders"];

  it("registers exactly the 12 recurring_* tools in module bot.recurring", () => {
    assert.deepEqual(SPECS.map((s) => s.name).sort(), [...WRITES, ...READS].sort());
    assert.ok(SPECS.every((s) => s.module === "bot.recurring"));
  });

  it("flags 9 writes and 3 reads", () => {
    for (const name of WRITES) assert.equal(tool(name).isWrite, true, name);
    for (const name of READS) assert.equal(tool(name).isWrite, false, name);
  });

  it("is visible through allToolSpecs() (the CLI path)", () => {
    const names = allToolSpecs().map((s) => s.name);
    for (const s of SPECS) assert.ok(names.includes(s.name), s.name);
  });
});

// ---------------------------------------------------------------------------
// 2/3. MCP exposure regression
// ---------------------------------------------------------------------------

describe("recurring tools — never exposed through MCP", () => {
  const ENV = ["OKX_API_KEY", "OKX_SECRET_KEY", "OKX_PASSPHRASE", "OKX_AUTH_BIN"] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k];
    delete process.env.OKX_API_KEY;
    delete process.env.OKX_SECRET_KEY;
    delete process.env.OKX_PASSPHRASE;
    process.env.OKX_AUTH_BIN = "/nonexistent/path/okx-auth-test";
  });
  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const baseConfig = { baseUrl: "https://example.invalid", sourceTag: "MCP" };

  it("buildTools with every module enabled returns no recurring_* tool", () => {
    for (const readOnly of [false, true]) {
      const tools = buildTools({ ...baseConfig, modules: [...MODULES], readOnly } as never);
      assert.ok(tools.every((t) => !t.name.startsWith("recurring_")), `readOnly=${readOnly}`);
    }
  });

  it("MCP tool count with all modules stays unchanged", () => {
    const tools = buildTools({ ...baseConfig, modules: [...MODULES], readOnly: false } as never);
    assert.equal(tools.length, MCP_TOOL_COUNT);
    const mcpLoadable = allToolSpecs().filter((s) => (MODULES as readonly string[]).includes(s.module));
    assert.equal(mcpLoadable.length, MCP_TOOL_COUNT);
  });

  it("loadConfig 'bot.all' and 'all' never enable bot.recurring", async () => {
    for (const modules of ["bot.all", "all"]) {
      const config = await loadConfig({ readOnly: false, demo: false, modules });
      assert.ok(!(config.modules as string[]).includes("bot.recurring"), modules);
      const tools = buildTools(config);
      assert.ok(tools.every((t) => t.module !== "bot.recurring"), modules);
    }
  });

  it("loadConfig rejects --modules bot.recurring as an unknown module", async () => {
    await assert.rejects(
      () => loadConfig({ readOnly: false, demo: false, modules: "bot.recurring" }),
      /Unknown module/,
    );
  });

  it("module constants: CLI-only, not loadable, described", () => {
    assert.ok((CLI_ONLY_MODULE_IDS as readonly string[]).includes("bot.recurring"));
    assert.ok(!(MODULES as readonly string[]).includes("bot.recurring"));
    assert.ok(!(BOT_SUB_MODULE_IDS as readonly string[]).includes("bot.recurring"));
    assert.ok(!(DEFAULT_MODULES as string[]).includes("bot.recurring"));
    assert.ok(MODULE_DESCRIPTIONS["bot.recurring"].length > 0);
    assert.equal(MODULES.length, 18);
  });
});

// ---------------------------------------------------------------------------
// 4–6. recurring_place_order
// ---------------------------------------------------------------------------

describe("recurring_place_order — request", () => {
  it("POSTs order-algo with recurringList as an array of objects and tag from sourceTag", async () => {
    const { result, calls } = await run(
      "recurring_place_order",
      { ...VALID_CREATE, source: "1,2", algoClOrdId: "abc123", tradeQuoteCcy: "USDT", recurringTimeType: "1" },
      [{ algoId: "560472804207104000", algoClOrdId: "", sCode: "0", sMsg: "", tag: "" }],
      "MYTAG",
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, "POST");
    assert.equal(calls[0]!.endpoint, "/api/v5/tradingBot/recurring/order-algo");
    assert.deepEqual(calls[0]!.payload, {
      stgyName: "BTC|ETH recurring buy monthly",
      recurringList: [{ ccy: "BTC", ratio: "0.2" }, { ccy: "ETH", ratio: "0.8" }],
      period: "monthly",
      recurringDay: "1",
      recurringTime: "0",
      timeZone: "8",
      amt: "100",
      investmentCcy: "USDT",
      tdMode: "cross",
      algoClOrdId: "abc123",
      tradeQuoteCcy: "USDT",
      source: ["1", "2"],
      recurringTimeType: "1",
      tag: "MYTAG",
    });
    assert.equal(result.endpoint, "/api/v5/tradingBot/recurring/order-algo");
  });

  it("drops unset optionals and keeps per-coin price limits (including empty = no limit)", async () => {
    const list = '[{"ccy":"BTC","ratio":0.5,"minPx":"50000","maxPx":""},{"ccy":"ETH","ratio":0.5}]';
    const { calls } = await run("recurring_place_order", { ...VALID_CREATE, recurringList: list });
    const body = calls[0]!.payload as Record<string, unknown>;
    assert.deepEqual(body["recurringList"], [
      { ccy: "BTC", ratio: "0.5", minPx: "50000", maxPx: "" },
      { ccy: "ETH", ratio: "0.5" },
    ]);
    for (const k of ["algoClOrdId", "tradeQuoteCcy", "source", "recurringTimeType", "recurringHour"]) {
      assert.ok(!(k in body), `${k} must be omitted`);
    }
  });

  it("uses a 10 rps private rate limit keyed by the tool name", async () => {
    const { calls } = await run("recurring_place_order", VALID_CREATE);
    assert.deepEqual(calls[0]!.rateLimit, {
      key: "private:recurring_place_order",
      capacity: 10,
      refillPerSecond: 10,
    });
  });
});

describe("recurring_place_order — validation (no HTTP call)", () => {
  const cases: Array<[string, Record<string, unknown>, RegExp?]> = [
    ["missing tdMode (no default is applied)", { tdMode: undefined }, /tdMode/],
    ["tdMode isolated", { tdMode: "isolated" }, /tdMode/],
    ["period yearly", { period: "yearly" }, /period/],
    ["monthly without recurringDay", { recurringDay: undefined }, /recurringDay/],
    ["monthly day 29", { recurringDay: "29" }, /recurringDay/],
    ["monthly day 0", { recurringDay: "0" }, /recurringDay/],
    ["weekly day 8", { period: "weekly", recurringDay: "8" }, /recurringDay/],
    ["hourly without recurringHour", { period: "hourly", recurringDay: undefined }, /recurringHour/],
    ["hourly hour 3", { period: "hourly", recurringHour: "3" }, /recurringHour/],
    ["recurringTime 24", { recurringTime: "24" }, /recurringTime/],
    ["recurringTime non-integer", { recurringTime: "1.5" }, /recurringTime/],
    ["missing recurringTime", { recurringTime: undefined }, /recurringTime/],
    ["timeZone 15", { timeZone: "15" }, /timeZone/],
    ["timeZone -13", { timeZone: "-13" }, /timeZone/],
    ["timeZone abc", { timeZone: "abc" }, /timeZone/],
    ["investmentCcy BTC", { investmentCcy: "BTC" }, /investmentCcy/],
    ["stgyName 41 chars", { stgyName: "x".repeat(41) }, /stgyName/],
    ["recurringList invalid JSON", { recurringList: "[{" }, /recurringList/],
    ["recurringList empty array", { recurringList: "[]" }, /recurringList/],
    ["recurringList not an array", { recurringList: '{"ccy":"BTC"}' }, /recurringList/],
    ["recurringList item without ccy", { recurringList: '[{"ratio":"1"}]' }, /ccy/],
    ["recurringList non-numeric ratio", { recurringList: '[{"ccy":"BTC","ratio":"abc"}]' }, /ratio/],
    ["recurringList missing ratio", { recurringList: '[{"ccy":"BTC"}]' }, /ratio/],
    ["source 4", { source: "4" }, /source/],
    ["recurringTimeType 3", { recurringTimeType: "3" }, /recurringTimeType/],
  ];
  for (const [title, override, pattern] of cases) {
    it(`rejects ${title}`, async () => {
      await assertRejects("recurring_place_order", { ...VALID_CREATE, ...override }, pattern);
    });
  }

  it("rejects when a required argument is missing entirely", async () => {
    for (const key of ["stgyName", "recurringList", "period", "timeZone", "amt", "investmentCcy"]) {
      await assertRejects("recurring_place_order", { ...VALID_CREATE, [key]: undefined }, new RegExp(key));
    }
  });
});

describe("recurring_place_order — accepted boundaries", () => {
  const ok: Array<[string, Record<string, unknown>]> = [
    ["monthly day 1", { recurringDay: "1" }],
    ["monthly day 28", { recurringDay: "28" }],
    ["weekly day 1", { period: "weekly", recurringDay: "1" }],
    ["weekly day 7", { period: "weekly", recurringDay: "7" }],
    ["hourly 1", { period: "hourly", recurringDay: undefined, recurringHour: "1" }],
    ["hourly 4", { period: "hourly", recurringDay: undefined, recurringHour: "4" }],
    ["hourly 8", { period: "hourly", recurringDay: undefined, recurringHour: "8" }],
    ["hourly 12", { period: "hourly", recurringDay: undefined, recurringHour: "12" }],
    ["daily without recurringDay", { period: "daily", recurringDay: undefined }],
    ["hourly with a (tolerated) recurringDay", { period: "hourly", recurringDay: "1", recurringHour: "8" }],
    ["timeZone -12", { timeZone: "-12" }],
    ["timeZone 14", { timeZone: "14" }],
    ["timeZone 5.5 (server allows decimals)", { timeZone: "5.5" }],
    ["recurringTime 0", { recurringTime: "0" }],
    ["recurringTime 23", { recurringTime: "23" }],
    ["stgyName exactly 40 chars", { stgyName: "x".repeat(40) }],
    ["tdMode cash", { tdMode: "cash" }],
    ["tdMode cross", { tdMode: "cross" }],
    ["investmentCcy USDC", { investmentCcy: "USDC" }],
    ["recurringTimeType 2 (immediate) still sends recurringTime", { recurringTimeType: "2" }],
    ["source 1,2,3", { source: "1,2,3" }],
  ];
  for (const [title, override] of ok) {
    it(`accepts ${title}`, async () => {
      const { calls } = await run("recurring_place_order", { ...VALID_CREATE, ...override });
      assert.equal(calls.length, 1);
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Write result handling
// ---------------------------------------------------------------------------

describe("recurring write results", () => {
  it("throws OkxApiError carrying sCode/sMsg when an item reports failure", async () => {
    await assert.rejects(
      () => run("recurring_pause", { algoId: "1" }, [{ algoId: "1", sCode: "51000", sMsg: "Parameter error" }]),
      (err: unknown) => {
        assert.ok(err instanceof OkxApiError);
        assert.match((err as Error).message, /\[51000\] Parameter error/);
        return true;
      },
    );
  });

  it("returns {endpoint, requestTime, data} on sCode 0", async () => {
    const { result } = await run("recurring_pause", { algoId: "1" }, [{ algoId: "1", sCode: "0", sMsg: "" }]);
    assert.deepEqual(Object.keys(result).sort(), ["data", "endpoint", "requestTime"]);
    assert.deepEqual(result.data, [{ algoId: "1", sCode: "0", sMsg: "" }]);
  });

  it("treats empty or absent data (Void endpoints) as success", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [
      ["recurring_amend_amount", { algoId: "1", amount: "20" }],
      ["recurring_add_investment", { algoId: "1", amount: "20" }],
      ["recurring_amend_price_range", { algoId: "1", recurringList: '[{"ccy":"BTC","minPx":"1","maxPx":"2"}]' }],
      ["recurring_amend_time", { algoId: "1", recurringTimeType: "1", period: "daily", timeZone: "8", recurringTime: "1" }],
    ];
    for (const [name, args] of calls) {
      for (const data of [[], ABSENT]) {
        const { result } = await run(name, args, data);
        assert.equal(result.data, data === ABSENT ? undefined : data, `${name} data=${data === ABSENT ? "absent" : "[]"}`);
      }
    }
  });

  it("handles a response item without algoId (amend-recurring-time example)", async () => {
    const { result } = await run(
      "recurring_amend_time",
      { algoId: "1", recurringTimeType: "2", period: "daily", timeZone: "8" },
      [{ sCode: "0", sMsg: "" }],
    );
    assert.deepEqual(result.data, [{ sCode: "0", sMsg: "" }]);
  });
});

// ---------------------------------------------------------------------------
// 8–9. simple writes
// ---------------------------------------------------------------------------

describe("recurring simple write tools", () => {
  it("pause and restart POST {algoId}", async () => {
    for (const [name, path] of [["recurring_pause", "pause"], ["recurring_restart", "restart"]] as const) {
      const { calls } = await run(name, { algoId: "2837428373700509696" });
      assert.equal(calls[0]!.endpoint, `/api/v5/tradingBot/recurring/${path}`);
      assert.deepEqual(calls[0]!.payload, { algoId: "2837428373700509696" });
      assert.equal(calls[0]!.rateLimit?.key, `private:${name}`);
      await assertRejects(name, {}, /algoId/);
    }
  });

  it("amend_name POSTs {algoId, stgyName} and enforces the 40-char limit", async () => {
    const { calls } = await run("recurring_amend_name", { algoId: "448965992920907776", stgyName: "stg1" });
    assert.equal(calls[0]!.endpoint, "/api/v5/tradingBot/recurring/amend-order-algo");
    assert.deepEqual(calls[0]!.payload, { algoId: "448965992920907776", stgyName: "stg1" });
    await run("recurring_amend_name", { algoId: "1", stgyName: "x".repeat(40) });
    await assertRejects("recurring_amend_name", { algoId: "1", stgyName: "x".repeat(41) }, /stgyName/);
    await assertRejects("recurring_amend_name", { algoId: "1" }, /stgyName/);
    await assertRejects("recurring_amend_name", { stgyName: "a" }, /algoId/);
  });

  it("amend_amount and add_investment POST {algoId, amount}", async () => {
    for (const [name, path] of [
      ["recurring_amend_amount", "amend-recurring-amount"],
      ["recurring_add_investment", "add-investment"],
    ] as const) {
      const { calls } = await run(name, { algoId: "9", amount: "20" });
      assert.equal(calls[0]!.endpoint, `/api/v5/tradingBot/recurring/${path}`);
      assert.deepEqual(calls[0]!.payload, { algoId: "9", amount: "20" });
      await assertRejects(name, { algoId: "9" }, /amount/);
      await assertRejects(name, { amount: "20" }, /algoId/);
    }
  });

  it("stop POSTs a JSON array body [{algoId}] and never sends tag", async () => {
    const { calls } = await run("recurring_stop", { algoId: "560472804207104000" }, [
      { algoClOrdId: "", algoId: "560472804207104000", sCode: "0", sMsg: "", tag: "" },
    ], "MYTAG");
    assert.equal(calls[0]!.endpoint, "/api/v5/tradingBot/recurring/stop-order-algo");
    assert.ok(Array.isArray(calls[0]!.payload));
    assert.deepEqual(calls[0]!.payload, [{ algoId: "560472804207104000" }]);
    await assertRejects("recurring_stop", {}, /algoId/);
  });
});

// ---------------------------------------------------------------------------
// 10. amend_price_range
// ---------------------------------------------------------------------------

describe("recurring_amend_price_range", () => {
  it("sends recurringList as [{ccy,minPx,maxPx}] and accepts empty = no limit", async () => {
    const { calls } = await run("recurring_amend_price_range", {
      algoId: "2837428373700509696",
      recurringList: '[{"ccy":"btc","minPx":"80000","maxPx":"120000"},{"ccy":"ETH","minPx":"","maxPx":""}]',
    });
    assert.equal(calls[0]!.endpoint, "/api/v5/tradingBot/recurring/amend-price-range");
    assert.deepEqual(calls[0]!.payload, {
      algoId: "2837428373700509696",
      recurringList: [
        { ccy: "BTC", minPx: "80000", maxPx: "120000" },
        { ccy: "ETH", minPx: "", maxPx: "" },
      ],
    });
  });

  it("does not require ratio but requires ccy, minPx and maxPx keys", async () => {
    const base = { algoId: "1" };
    await assertRejects("recurring_amend_price_range", { ...base, recurringList: '[{"ccy":"BTC","maxPx":"1"}]' }, /minPx/);
    await assertRejects("recurring_amend_price_range", { ...base, recurringList: '[{"ccy":"BTC","minPx":"1"}]' }, /maxPx/);
    await assertRejects("recurring_amend_price_range", { ...base, recurringList: '[{"minPx":"1","maxPx":"2"}]' }, /ccy/);
    await assertRejects("recurring_amend_price_range", { ...base, recurringList: '[{"ccy":"BTC","minPx":"x","maxPx":"2"}]' }, /minPx/);
    await assertRejects("recurring_amend_price_range", { ...base, recurringList: "[]" }, /recurringList/);
    await assertRejects("recurring_amend_price_range", { recurringList: "[]" }, /algoId/);
  });
});

// ---------------------------------------------------------------------------
// 11. amend_time
// ---------------------------------------------------------------------------

describe("recurring_amend_time", () => {
  const BASE = { algoId: "2837428373700509696", period: "monthly", timeZone: "8" };

  it("type 1 monthly: sends day + time and the contract fields", async () => {
    const { calls } = await run("recurring_amend_time", {
      ...BASE, recurringTimeType: "1", recurringDay: "3", recurringTime: "11",
    });
    assert.equal(calls[0]!.endpoint, "/api/v5/tradingBot/recurring/amend-recurring-time");
    assert.deepEqual(calls[0]!.payload, {
      algoId: "2837428373700509696",
      recurringTimeType: "1",
      period: "monthly",
      timeZone: "8",
      recurringDay: "3",
      recurringTime: "11",
    });
  });

  it("type 1 requires recurringTime, and recurringDay for monthly/weekly", async () => {
    await assertRejects("recurring_amend_time", { ...BASE, recurringTimeType: "1", recurringDay: "3" }, /recurringTime/);
    await assertRejects("recurring_amend_time", { ...BASE, recurringTimeType: "1", recurringTime: "1" }, /recurringDay/);
    await assertRejects("recurring_amend_time", { ...BASE, period: "weekly", recurringTimeType: "1", recurringTime: "1", recurringDay: "8" }, /recurringDay/);
    await run("recurring_amend_time", { ...BASE, period: "daily", recurringTimeType: "1", recurringTime: "1" });
  });

  it("type 2 omits day/time without error", async () => {
    const { calls } = await run("recurring_amend_time", { ...BASE, recurringTimeType: "2" });
    assert.deepEqual(calls[0]!.payload, {
      algoId: "2837428373700509696", recurringTimeType: "2", period: "monthly", timeZone: "8",
    });
  });

  it("hourly requires recurringHour (1/4/8/12) in both types", async () => {
    const hourly = { ...BASE, period: "hourly" };
    await assertRejects("recurring_amend_time", { ...hourly, recurringTimeType: "2" }, /recurringHour/);
    await assertRejects("recurring_amend_time", { ...hourly, recurringTimeType: "1", recurringTime: "1", recurringHour: "5" }, /recurringHour/);
    const { calls } = await run("recurring_amend_time", { ...hourly, recurringTimeType: "1", recurringTime: "11", recurringHour: "8", recurringDay: "1" });
    assert.equal((calls[0]!.payload as Record<string, unknown>)["recurringHour"], "8");
  });

  it("requires algoId, recurringTimeType, period, timeZone and validates enums/ranges", async () => {
    await assertRejects("recurring_amend_time", { ...BASE, recurringTimeType: "1", recurringTime: "1", recurringDay: "1", algoId: undefined }, /algoId/);
    await assertRejects("recurring_amend_time", { ...BASE }, /recurringTimeType/);
    await assertRejects("recurring_amend_time", { ...BASE, recurringTimeType: "3" }, /recurringTimeType/);
    await assertRejects("recurring_amend_time", { ...BASE, recurringTimeType: "2", period: undefined }, /period/);
    await assertRejects("recurring_amend_time", { ...BASE, recurringTimeType: "2", timeZone: undefined }, /timeZone/);
    await assertRejects("recurring_amend_time", { ...BASE, recurringTimeType: "2", timeZone: "20" }, /timeZone/);
  });
});

// ---------------------------------------------------------------------------
// 12–14. reads
// ---------------------------------------------------------------------------

describe("recurring read tools", () => {
  it("get_order_details GETs orders-algo-details and passes per-coin stats through", async () => {
    const detail = [{
      algoId: "644497312047435776", algoOrdType: "recurring", state: "running",
      recurringList: [{ avgPx: "0", ccy: "BTC", profit: "0", px: "36683.2", ratio: "0.2", minPx: "", maxPx: "", totalAmt: "0" }],
      tradeQuoteCcy: "USDT", source: ["1"], recurringTimeType: "1", recurringTimeMinutes: "0",
    }];
    const { result, calls } = await run("recurring_get_order_details", { algoId: "644497312047435776" }, detail);
    assert.equal(calls[0]!.method, "GET");
    assert.equal(calls[0]!.endpoint, "/api/v5/tradingBot/recurring/orders-algo-details");
    assert.deepEqual(calls[0]!.payload, { algoId: "644497312047435776" });
    assert.deepEqual(result.data, detail);
    await assertRejects("recurring_get_order_details", {}, /algoId/);
  });

  it("get_orders defaults to pending, history switches endpoint, unset filters are omitted", async () => {
    let r = await run("recurring_get_orders", {});
    assert.equal(r.calls[0]!.endpoint, "/api/v5/tradingBot/recurring/orders-algo-pending");
    assert.deepEqual(r.calls[0]!.payload, {});
    r = await run("recurring_get_orders", { status: "active", algoId: "1", after: "2", before: "3", limit: "50" });
    assert.equal(r.calls[0]!.endpoint, "/api/v5/tradingBot/recurring/orders-algo-pending");
    assert.deepEqual(r.calls[0]!.payload, { algoId: "1", after: "2", before: "3", limit: "50" });
    r = await run("recurring_get_orders", { status: "history", limit: "10" });
    assert.equal(r.calls[0]!.endpoint, "/api/v5/tradingBot/recurring/orders-algo-history");
    assert.deepEqual(r.calls[0]!.payload, { limit: "10" });
    await assertRejects("recurring_get_orders", { status: "bogus" }, /status/);
  });

  it("get_sub_orders GETs sub-orders with algoId required and optional filters", async () => {
    const { calls } = await run("recurring_get_sub_orders", { algoId: "560516615079727104", ordId: "9", after: "1", before: "2", limit: "20" });
    assert.equal(calls[0]!.endpoint, "/api/v5/tradingBot/recurring/sub-orders");
    assert.deepEqual(calls[0]!.payload, { algoId: "560516615079727104", ordId: "9", after: "1", before: "2", limit: "20" });
    const minimal = await run("recurring_get_sub_orders", { algoId: "1" });
    assert.deepEqual(minimal.calls[0]!.payload, { algoId: "1" });
    await assertRejects("recurring_get_sub_orders", {}, /algoId/);
  });

  it("every tool uses a 10 rps private rate limit keyed by its name", async () => {
    const args: Record<string, Record<string, unknown>> = {
      recurring_place_order: VALID_CREATE,
      recurring_pause: { algoId: "1" },
      recurring_restart: { algoId: "1" },
      recurring_stop: { algoId: "1" },
      recurring_amend_name: { algoId: "1", stgyName: "a" },
      recurring_amend_price_range: { algoId: "1", recurringList: '[{"ccy":"BTC","minPx":"","maxPx":""}]' },
      recurring_amend_amount: { algoId: "1", amount: "1" },
      recurring_amend_time: { algoId: "1", recurringTimeType: "2", period: "daily", timeZone: "8" },
      recurring_add_investment: { algoId: "1", amount: "1" },
      recurring_get_order_details: { algoId: "1" },
      recurring_get_orders: {},
      recurring_get_sub_orders: { algoId: "1" },
    };
    for (const spec of SPECS) {
      const { calls } = await run(spec.name, args[spec.name]!);
      assert.deepEqual(calls[0]!.rateLimit, { key: `private:${spec.name}`, capacity: 10, refillPerSecond: 10 }, spec.name);
    }
  });
});
