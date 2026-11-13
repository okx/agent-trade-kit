/**
 * Unit tests for the four Smart Portfolio operation tools:
 * manual_pause, manual_resume, add_investment, edit_portfolio.
 *
 * Success is `code=0, msg="", data=[]` (the REST client already validates the outer
 * code, so handlers must not look at data[0] / sCode).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerSmartPortfolioTools } from "../src/tools/bot/smart-portfolio.js";
import { registerSmartPortfolioOperationTools } from "../src/tools/bot/smart-portfolio-operations.js";
import { buildTools } from "../src/tools/index.js";
import { BOT_SUB_MODULE_IDS, DEFAULT_MODULES, MODULES } from "../src/constants.js";
import { OkxApiError, RateLimitError, ValidationError } from "../src/utils/errors.js";
import type { ToolContext, ToolSpec } from "../src/tools/types.js";

const BASE = "/api/v5/tradingBot/smart-portfolio";
const NEW_TOOLS = [
  "smart_portfolio_manual_pause",
  "smart_portfolio_manual_resume",
  "smart_portfolio_add_investment",
  "smart_portfolio_edit_portfolio",
] as const;

interface Call {
  endpoint: string;
  body: Record<string, unknown>;
  rateLimit: { key: string; capacity: number; refillPerSecond: number } | undefined;
  extraArgs: unknown[];
}

function makeClient(opts: { data?: unknown; reject?: Error } = {}) {
  const calls: Call[] = [];
  const client = {
    privatePost: async (endpoint: string, body: Record<string, unknown>, rateLimit?: Call["rateLimit"], ...extraArgs: unknown[]) => {
      calls.push({ endpoint, body, rateLimit, extraArgs });
      if (opts.reject) throw opts.reject;
      return { endpoint, requestTime: "2026-11-13T00:00:00.000Z", data: "data" in opts ? opts.data : [] };
    },
  };
  return { client, calls };
}

const ctx = (client: unknown): ToolContext => ({
  client: client as ToolContext["client"],
  config: { sourceTag: "MCP" } as ToolContext["config"],
});

const TOOLS = registerSmartPortfolioOperationTools();
const tool = (name: string): ToolSpec => {
  const t = TOOLS.find((s) => s.name === name);
  assert.ok(t, `tool ${name} not registered`);
  return t;
};

async function run(name: string, args: Record<string, unknown>, opts: Parameters<typeof makeClient>[0] = {}) {
  const { client, calls } = makeClient(opts);
  const result = (await tool(name).handler(args, ctx(client))) as { endpoint: string; data: unknown };
  return { result, calls, body: calls[0]?.body };
}

async function assertRejectsLocally(name: string, args: Record<string, unknown>, re?: RegExp) {
  const { client, calls } = makeClient();
  await assert.rejects(
    () => tool(name).handler(args, ctx(client)),
    (err: unknown) => {
      assert.ok(err instanceof ValidationError, `expected ValidationError, got ${String(err)}`);
      if (re) assert.match(err.message, re);
      return true;
    },
  );
  assert.equal(calls.length, 0, "no HTTP call may be made when validation fails");
}

const PORTFOLIO = '[{"ccy":"btc","ratio":"0.4"},{"ccy":"eth","ratio":"0.4"},{"ccy":"sol","ratio":"0.2"}]';

describe("smart portfolio operation tools — registration", () => {
  it("registerSmartPortfolioOperationTools returns the four new tools", () => {
    assert.deepEqual(TOOLS.map((t) => t.name).sort(), [...NEW_TOOLS].sort());
  });

  it("registerSmartPortfolioTools now exposes 12 tools: 4 read / 8 write", () => {
    const all = registerSmartPortfolioTools();
    assert.equal(all.length, 12);
    assert.equal(all.filter((t) => t.isWrite).length, 8);
    assert.equal(all.filter((t) => !t.isWrite).length, 4);
    assert.equal(new Set(all.map((t) => t.name)).size, 12);
    for (const name of NEW_TOOLS) assert.ok(all.some((t) => t.name === name), name);
  });

  it("new tools are write tools in bot.smartportfolio, outside the default modules", () => {
    for (const t of TOOLS) {
      assert.equal(t.module, "bot.smartportfolio");
      assert.equal(t.isWrite, true, t.name);
      assert.equal(t.destructiveHint, false, t.name);
    }
    assert.ok(!(DEFAULT_MODULES as string[]).includes("bot.smartportfolio"));
    assert.ok((BOT_SUB_MODULE_IDS as readonly string[]).includes("bot.smartportfolio"));
  });

  it("new tools are removed in readOnly mode", () => {
    const names = (readOnly: boolean) =>
      buildTools({ modules: [...MODULES], readOnly } as never).map((t) => t.name);
    for (const name of NEW_TOOLS) {
      assert.ok(names(false).includes(name), `${name} should be present`);
      assert.ok(!names(true).includes(name), `${name} must be hidden in readOnly mode`);
    }
  });

  it("descriptions are intent-oriented, flag real funds, and avoid unverified server claims", () => {
    for (const t of TOOLS) {
      assert.match(t.description, /real (funds|trades)|CAUTION/i, t.name);
      assert.doesNotMatch(t.description, /\/api\/v5|rate.?limit of|requests? per/i, t.name);
      assert.ok(t.description.length < 700, `${t.name} description too long for the token budget`);
    }
    assert.match(tool("smart_portfolio_add_investment").description, /not .*(arrived|credited)|not mean/i);
  });

  it("schemas are flat strings with the documented required fields", () => {
    const req = (n: string) => (tool(n).inputSchema as { required: string[] }).required;
    assert.deepEqual(req("smart_portfolio_manual_pause"), ["algoId"]);
    assert.deepEqual(req("smart_portfolio_manual_resume"), ["algoId"]);
    assert.deepEqual(req("smart_portfolio_add_investment"), ["algoId", "addInvest"]);
    assert.deepEqual(req("smart_portfolio_edit_portfolio"), ["algoId", "portfolioList"]);
    for (const t of TOOLS) {
      const props = (t.inputSchema as { properties: Record<string, { type: string }> }).properties;
      for (const [key, def] of Object.entries(props)) assert.equal(def.type, "string", `${t.name}.${key}`);
    }
  });
});

describe("manual_pause / manual_resume", () => {
  for (const [name, path] of [
    ["smart_portfolio_manual_pause", "manual-pause"],
    ["smart_portfolio_manual_resume", "manual-resume"],
  ] as const) {
    describe(name, () => {
      it(`POSTs ${path} with only algoId (string, never Number)`, async () => {
        const { calls, body } = await run(name, { algoId: "532177187189760000" });
        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.endpoint, `${BASE}/${path}`);
        assert.deepEqual(body, { algoId: "532177187189760000" });
        assert.equal(typeof body!["algoId"], "string");
      });

      it("treats code=0 / data=[] as success", async () => {
        const { result } = await run(name, { algoId: "1" }, { data: [] });
        assert.deepEqual(result.data, []);
        assert.equal(result.endpoint, `${BASE}/${path}`);
      });

      it("does not require data[0] or sCode when data is absent", async () => {
        const { result } = await run(name, { algoId: "1" }, { data: undefined });
        assert.equal(result.data, undefined);
      });

      it("rejects a missing / empty / non-string algoId without any HTTP call", async () => {
        await assertRejectsLocally(name, {}, /algoId/);
        await assertRejectsLocally(name, { algoId: "" }, /algoId/);
        await assertRejectsLocally(name, { algoId: 123 }, /algoId/);
      });

      it("does not forward unrelated fields or inject tag", async () => {
        const { body } = await run(name, { algoId: "1", addInvest: "5", portfolioList: "[]", tag: "x", userId: "u" });
        assert.deepEqual(body, { algoId: "1" });
      });
    });
  }
});

describe("add_investment", () => {
  const name = "smart_portfolio_add_investment";

  it("POSTs add-investment with algoId, addInvest and tradeQuoteCcy", async () => {
    const { calls, body } = await run(name, { algoId: "9", addInvest: "100", tradeQuoteCcy: "USDT" });
    assert.equal(calls[0]!.endpoint, `${BASE}/add-investment`);
    assert.deepEqual(body, { algoId: "9", addInvest: "100", tradeQuoteCcy: "USDT" });
  });

  it("omits tradeQuoteCcy when missing / null / empty / blank", async () => {
    for (const ccy of [undefined, null, "", "   ", "\t"]) {
      const { body } = await run(name, { algoId: "9", addInvest: "100", tradeQuoteCcy: ccy });
      assert.deepEqual(body, { algoId: "9", addInvest: "100" }, JSON.stringify(ccy));
    }
  });

  it("trims but never upper-cases tradeQuoteCcy", async () => {
    assert.equal((await run(name, { algoId: "9", addInvest: "1", tradeQuoteCcy: "USDT" })).body!["tradeQuoteCcy"], "USDT");
    assert.equal((await run(name, { algoId: "9", addInvest: "1", tradeQuoteCcy: "usdt" })).body!["tradeQuoteCcy"], "usdt");
    assert.equal((await run(name, { algoId: "9", addInvest: "1", tradeQuoteCcy: "  USDT  " })).body!["tradeQuoteCcy"], "USDT");
  });

  it("rejects non-string tradeQuoteCcy locally", async () => {
    await assertRejectsLocally(name, { algoId: "9", addInvest: "1", tradeQuoteCcy: 5 }, /tradeQuoteCcy/);
    await assertRejectsLocally(name, { algoId: "9", addInvest: "1", tradeQuoteCcy: {} }, /tradeQuoteCcy/);
  });

  it("rejects missing / zero / negative / invalid addInvest without any HTTP call", async () => {
    for (const bad of [undefined, null, "", "  ", "0", "0.00", "-5", "abc", "1e400", "NaN", "Infinity", "0x1"]) {
      await assertRejectsLocally(name, { algoId: "9", addInvest: bad }, /addInvest/);
    }
  });

  it("rejects a missing algoId", async () => {
    await assertRejectsLocally(name, { addInvest: "5" }, /algoId/);
  });

  it("treats data=[] as success and returns the endpoint metadata", async () => {
    const { result } = await run(name, { algoId: "9", addInvest: "10" }, { data: [] });
    assert.deepEqual(result.data, []);
  });

  it("does not send edit-only or unrelated fields", async () => {
    const { body } = await run(name, { algoId: "9", addInvest: "10", portfolioList: PORTFOLIO, deltaRatio: "0.1" });
    assert.deepEqual(Object.keys(body!).sort(), ["addInvest", "algoId"]);
  });
});

describe("edit_portfolio", () => {
  const name = "smart_portfolio_edit_portfolio";

  it("POSTs edit-portfolio with a real JSON array, normalised ccy and exact ratios", async () => {
    const { calls, body } = await run(name, { algoId: "9", portfolioList: PORTFOLIO });
    assert.equal(calls[0]!.endpoint, `${BASE}/edit-portfolio`);
    assert.deepEqual(body, {
      algoId: "9",
      portfolioList: [
        { ccy: "BTC", ratio: "0.4" },
        { ccy: "ETH", ratio: "0.4" },
        { ccy: "SOL", ratio: "0.2" },
      ],
    });
    assert.ok(Array.isArray(body!["portfolioList"]));
  });

  it("sends neither addInvest nor tradeQuoteCcy when no top-up is requested", async () => {
    for (const add of [undefined, null, "", "  ", "0", "0.0"]) {
      const { body } = await run(name, { algoId: "9", portfolioList: PORTFOLIO, addInvest: add, tradeQuoteCcy: "USDT" });
      assert.ok(!("addInvest" in body!), `addInvest should be omitted for ${JSON.stringify(add)}`);
      assert.ok(!("tradeQuoteCcy" in body!), `tradeQuoteCcy should be omitted for ${JSON.stringify(add)}`);
    }
  });

  it("keeps the amount for a positive top-up even when tradeQuoteCcy is blank", async () => {
    for (const ccy of [undefined, null, "", "   "]) {
      const { body } = await run(name, { algoId: "9", portfolioList: PORTFOLIO, addInvest: "50", tradeQuoteCcy: ccy });
      assert.equal(body!["addInvest"], "50");
      assert.ok(!("tradeQuoteCcy" in body!));
    }
  });

  it("sends a trimmed, case-preserved tradeQuoteCcy with a positive top-up", async () => {
    assert.equal((await run(name, { algoId: "9", portfolioList: PORTFOLIO, addInvest: "50", tradeQuoteCcy: " USDT " })).body!["tradeQuoteCcy"], "USDT");
    assert.equal((await run(name, { algoId: "9", portfolioList: PORTFOLIO, addInvest: "50", tradeQuoteCcy: "usdt" })).body!["tradeQuoteCcy"], "usdt");
  });

  it("rejects negative / invalid addInvest without any HTTP call", async () => {
    for (const bad of ["-1", "abc", "1e400", "NaN"]) {
      await assertRejectsLocally(name, { algoId: "9", portfolioList: PORTFOLIO, addInvest: bad }, /addInvest/);
    }
  });

  it("rejects invalid JSON, bad combinations and null elements locally", async () => {
    await assertRejectsLocally(name, { algoId: "9", portfolioList: "not json" }, /not valid JSON/);
    await assertRejectsLocally(name, { algoId: "9", portfolioList: '[{"ccy":"BTC","ratio":"1"}]' }, /at least 2 items/);
    await assertRejectsLocally(name, { algoId: "9", portfolioList: '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.40001"}]' }, /sum to 1\.0/);
    await assertRejectsLocally(name, { algoId: "9", portfolioList: '[null,{"ccy":"ETH","ratio":"1"}]' }, /must be an object/);
    await assertRejectsLocally(name, { algoId: "9", portfolioList: '{"ccy":"BTC"}' }, /at least 2 items/);
  });

  it("rejects missing algoId / portfolioList", async () => {
    await assertRejectsLocally(name, { portfolioList: PORTFOLIO }, /algoId/);
    await assertRejectsLocally(name, { algoId: "9" }, /portfolioList/);
  });

  it("does not send creation-only fields", async () => {
    const { body } = await run(name, { algoId: "9", portfolioList: PORTFOLIO, deltaRatio: "0.1", interval: "5", stgyName: "x" });
    assert.deepEqual(Object.keys(body!).sort(), ["algoId", "portfolioList"]);
  });
});

describe("all operation tools — request safety and error propagation", () => {
  const VALID: Record<(typeof NEW_TOOLS)[number], Record<string, unknown>> = {
    smart_portfolio_manual_pause: { algoId: "1" },
    smart_portfolio_manual_resume: { algoId: "1" },
    smart_portfolio_add_investment: { algoId: "1", addInvest: "10" },
    smart_portfolio_edit_portfolio: { algoId: "1", portfolioList: PORTFOLIO },
  };

  it("never injects tag, order-type, userId or brokerId", async () => {
    for (const name of NEW_TOOLS) {
      const { body } = await run(name, VALID[name]);
      for (const key of ["tag", "order-type", "userId", "brokerId"]) {
        assert.ok(!(key in body!), `${name} must not send ${key}`);
      }
    }
  });

  it("uses the module-default client rate limit keyed by tool name", async () => {
    for (const name of NEW_TOOLS) {
      const { calls } = await run(name, VALID[name]);
      assert.deepEqual(calls[0]!.rateLimit, { key: `private:${name}`, capacity: 20, refillPerSecond: 20 });
    }
  });

  it("never opts into network retries (top-ups are not idempotent)", async () => {
    for (const name of NEW_TOOLS) {
      const { calls } = await run(name, VALID[name]);
      assert.ok(calls[0]!.extraArgs.every((a) => a !== true), `${name} must not pass retryOnNetworkError=true`);
    }
  });

  const BACKEND_CODES: Record<(typeof NEW_TOOLS)[number], string[]> = {
    smart_portfolio_manual_pause: ["50014", "51000", "51059", "51293"],
    smart_portfolio_manual_resume: ["50014", "51000", "51059", "51293"],
    smart_portfolio_add_investment: ["50014", "51000", "51059", "51293", "51318", "51360", "51361"],
    smart_portfolio_edit_portfolio: ["50014", "51000", "51059", "51293", "51318", "51320", "51360", "51361"],
  };

  for (const name of NEW_TOOLS) {
    it(`${name}: backend error codes pass through unchanged (code / message / endpoint)`, async () => {
      for (const code of BACKEND_CODES[name]) {
        const err = new OkxApiError(`backend says ${code}`, { code, endpoint: `${BASE}/x`, traceId: "t-1" });
        const { client } = makeClient({ reject: err });
        await assert.rejects(
          () => tool(name).handler(VALID[name], ctx(client)),
          (thrown: unknown) => {
            assert.equal(thrown, err, "the original error must propagate untouched");
            assert.ok(thrown instanceof OkxApiError);
            assert.equal(thrown.code, code);
            assert.equal(thrown.endpoint, `${BASE}/x`);
            return true;
          },
        );
      }
    });
  }

  it("51320 from edit_portfolio is not rewritten into 51318 / 51361", async () => {
    const err = new OkxApiError("weight out of range", { code: "51320", endpoint: `${BASE}/edit-portfolio` });
    const { client } = makeClient({ reject: err });
    await assert.rejects(() => tool("smart_portfolio_edit_portfolio").handler(VALID.smart_portfolio_edit_portfolio, ctx(client)), (e: unknown) => {
      assert.equal((e as OkxApiError).code, "51320");
      return true;
    });
  });

  it("rate-limit and system errors are not swallowed", async () => {
    for (const reject of [new RateLimitError("too many requests", "slow down", `${BASE}/manual-pause`), new OkxApiError("system busy", { code: "50013", endpoint: `${BASE}/manual-pause` })]) {
      const { client } = makeClient({ reject });
      await assert.rejects(() => tool("smart_portfolio_manual_pause").handler({ algoId: "1" }, ctx(client)), (e: unknown) => e === reject);
    }
  });
});
