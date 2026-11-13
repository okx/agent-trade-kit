/**
 * Unit tests for indicator tool — resolveIndicatorCode, tool registration,
 * handler request body construction, and publicPost on OkxRestClient.
 *
 * No real network calls are made; globalThis.fetch is mocked.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveIndicatorCode,
  INDICATOR_BARS,
  KNOWN_INDICATORS,
  registerIndicatorTools,
  DEFAULT_INDICATOR_PARAMS,
  getDefaultIndicatorParams,
} from "../src/tools/indicator.js";
import { OkxRestClient } from "../src/client/rest-client.js";
import type { OkxConfig } from "../src/config.js";
import type { ModuleId } from "../src/constants.js";

// ---------------------------------------------------------------------------
// resolveIndicatorCode
// ---------------------------------------------------------------------------

describe("resolveIndicatorCode - CLI name -> API code", () => {
  // Overrides: names that deviate from the default toUpperCase + hyphen→underscore rule
  it("rainbow -> BTCRAINBOW (override)", () => {
    assert.equal(resolveIndicatorCode("rainbow"), "BTCRAINBOW");
  });

  it("Rainbow (mixed case) -> BTCRAINBOW (case-insensitive override)", () => {
    assert.equal(resolveIndicatorCode("Rainbow"), "BTCRAINBOW");
  });

  it("stoch-rsi -> STOCHRSI (override, not STOCH_RSI)", () => {
    assert.equal(resolveIndicatorCode("stoch-rsi"), "STOCHRSI");
  });

  it("boll -> BB (alias override)", () => {
    assert.equal(resolveIndicatorCode("boll"), "BB");
  });

  // Candlestick pattern overrides (hyphen names → no-separator backend codes)
  it("bull-engulf -> BULLENGULF (override, not BULL_ENGULF)", () => {
    assert.equal(resolveIndicatorCode("bull-engulf"), "BULLENGULF");
  });

  it("bear-engulf -> BEARENGULF (override)", () => {
    assert.equal(resolveIndicatorCode("bear-engulf"), "BEARENGULF");
  });

  it("bull-harami -> BULLHARAMI (override)", () => {
    assert.equal(resolveIndicatorCode("bull-harami"), "BULLHARAMI");
  });

  it("bear-harami -> BEARHARAMI (override)", () => {
    assert.equal(resolveIndicatorCode("bear-harami"), "BEARHARAMI");
  });

  it("bull-harami-cross -> BULLHARAMICROSS (override)", () => {
    assert.equal(resolveIndicatorCode("bull-harami-cross"), "BULLHARAMICROSS");
  });

  it("bear-harami-cross -> BEARHARAMICROSS (override)", () => {
    assert.equal(resolveIndicatorCode("bear-harami-cross"), "BEARHARAMICROSS");
  });

  it("three-soldiers -> THREESOLDIERS (override)", () => {
    assert.equal(resolveIndicatorCode("three-soldiers"), "THREESOLDIERS");
  });

  it("three-crows -> THREECROWS (override)", () => {
    assert.equal(resolveIndicatorCode("three-crows"), "THREECROWS");
  });

  it("hanging-man -> HANGINGMAN (override)", () => {
    assert.equal(resolveIndicatorCode("hanging-man"), "HANGINGMAN");
  });

  it("inverted-hammer -> INVERTEDH (override, backend uses abbreviated code)", () => {
    assert.equal(resolveIndicatorCode("inverted-hammer"), "INVERTEDH");
  });

  it("shooting-star -> SHOOTINGSTAR (override)", () => {
    assert.equal(resolveIndicatorCode("shooting-star"), "SHOOTINGSTAR");
  });

  it("nvi-pvi -> NVIPVI (override)", () => {
    assert.equal(resolveIndicatorCode("nvi-pvi"), "NVIPVI");
  });

  it("top-long-short -> TOPLONGSHORT (override)", () => {
    assert.equal(resolveIndicatorCode("top-long-short"), "TOPLONGSHORT");
  });

  // Default rule: toUpperCase + hyphen→underscore (no override needed)
  it("range-filter -> RANGE_FILTER (default rule, no override needed)", () => {
    assert.equal(resolveIndicatorCode("range-filter"), "RANGE_FILTER");
  });

  it("ma -> MA (default uppercase transform)", () => {
    assert.equal(resolveIndicatorCode("ma"), "MA");
  });

  it("rsi -> RSI (default uppercase transform)", () => {
    assert.equal(resolveIndicatorCode("rsi"), "RSI");
  });

  it("macd -> MACD (default uppercase transform)", () => {
    assert.equal(resolveIndicatorCode("macd"), "MACD");
  });

  it("halftrend -> HALFTREND (default uppercase transform)", () => {
    assert.equal(resolveIndicatorCode("halftrend"), "HALFTREND");
  });

  it("UPPERCASE passthrough unchanged", () => {
    assert.equal(resolveIndicatorCode("RSI"), "RSI");
  });
});

// ---------------------------------------------------------------------------
// INDICATOR_BARS
// ---------------------------------------------------------------------------

describe("INDICATOR_BARS constant", () => {
  it("includes 1H", () => {
    assert.ok((INDICATOR_BARS as readonly string[]).includes("1H"));
  });

  it("includes 1Dutc", () => {
    assert.ok((INDICATOR_BARS as readonly string[]).includes("1Dutc"));
  });

  it("has 9 entries", () => {
    assert.equal(INDICATOR_BARS.length, 9);
  });
});

// ---------------------------------------------------------------------------
// KNOWN_INDICATORS
// ---------------------------------------------------------------------------

describe("KNOWN_INDICATORS", () => {
  it("is a non-empty array", () => {
    assert.ok(Array.isArray(KNOWN_INDICATORS));
    assert.ok(KNOWN_INDICATORS.length > 0);
  });

  it("every entry has name and description strings", () => {
    for (const entry of KNOWN_INDICATORS) {
      assert.equal(typeof entry.name, "string");
      assert.equal(typeof entry.description, "string");
      assert.ok(entry.name.length > 0, `empty name in entry: ${JSON.stringify(entry)}`);
      assert.ok(entry.description.length > 0, `empty description for: ${entry.name}`);
    }
  });

  it("no duplicate names", () => {
    const names = KNOWN_INDICATORS.map(e => e.name);
    const unique = new Set(names);
    assert.equal(unique.size, names.length, `duplicate names: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  });

  it("includes core indicators: ma, rsi, macd, bb, ahr999, rainbow", () => {
    const names = new Set(KNOWN_INDICATORS.map(e => e.name));
    for (const name of ["ma", "rsi", "macd", "bb", "ahr999", "rainbow"]) {
      assert.ok(names.has(name), `missing: ${name}`);
    }
  });

  it("includes candlestick patterns: bull-engulf, doji, shooting-star", () => {
    const names = new Set(KNOWN_INDICATORS.map(e => e.name));
    for (const name of ["bull-engulf", "doji", "shooting-star"]) {
      assert.ok(names.has(name), `missing: ${name}`);
    }
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_INDICATOR_PARAMS — period-based indicator default paramList (SSoT)
// ---------------------------------------------------------------------------

describe("DEFAULT_INDICATOR_PARAMS", () => {
  it("ma/ema follow the skill (5,20,60 / 5,20); wma/rsi default to [14]", () => {
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["ma"], [5, 20, 60]);
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["ema"], [5, 20]);
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["wma"], [14]);
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["rsi"], [14]);
  });

  it("matches the backend defaults that used to differ", () => {
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["supertrend"], [3, 10]); // [factor, atrPeriod]
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["stoch-rsi"], [14, 14, 3, 3]);
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["keltner"], [20, 10, 20]);
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["mvwap"], [14, 14]);
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["stoch"], [14, 3]);
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["aroon"], [25]);
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["trix"], [18]);
  });

  it("covers exactly the 39 indicators of the params contract", () => {
    assert.equal(Object.keys(DEFAULT_INDICATOR_PARAMS).length, 39);
  });

  it("macd defaults to [12, 26, 9] (PRD example)", () => {
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["macd"], [12, 26, 9]);
  });

  it("bb defaults to [20, 2] (PRD example)", () => {
    assert.deepEqual(DEFAULT_INDICATOR_PARAMS["bb"], [20, 2]);
  });

  it("does not contain non-period indicators (obv, vwap, sar, ad)", () => {
    for (const name of ["obv", "vwap", "sar", "ad"]) {
      assert.equal(DEFAULT_INDICATOR_PARAMS[name], undefined, `${name} must not have a default`);
    }
  });

  it("every key is a known indicator name (no typos)", () => {
    const knownNames = new Set(KNOWN_INDICATORS.map((entry) => entry.name));
    for (const key of Object.keys(DEFAULT_INDICATOR_PARAMS)) {
      assert.ok(knownNames.has(key), `unknown key "${key}" in DEFAULT_INDICATOR_PARAMS`);
    }
  });

  it("every value is a non-empty array of numbers", () => {
    for (const [key, value] of Object.entries(DEFAULT_INDICATOR_PARAMS)) {
      assert.ok(Array.isArray(value), `value for ${key} must be an array`);
      assert.ok(value.length > 0, `value for ${key} must be non-empty`);
      for (const item of value) {
        assert.equal(typeof item, "number", `value for ${key} must contain numbers`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// getDefaultIndicatorParams — alias + case resolution helper
// ---------------------------------------------------------------------------

describe("getDefaultIndicatorParams", () => {
  it("resolves lowercase period indicators", () => {
    assert.deepEqual(getDefaultIndicatorParams("ema"), [5, 20]);
    assert.deepEqual(getDefaultIndicatorParams("macd"), [12, 26, 9]);
    assert.deepEqual(getDefaultIndicatorParams("bb"), [20, 2]);
  });

  it("is case-insensitive (uppercase input)", () => {
    assert.deepEqual(getDefaultIndicatorParams("EMA"), [5, 20]);
    assert.deepEqual(getDefaultIndicatorParams("RSI"), [14]);
  });

  it("resolves the boll -> bb alias to [20, 2]", () => {
    assert.deepEqual(getDefaultIndicatorParams("boll"), [20, 2]);
    assert.deepEqual(getDefaultIndicatorParams("BOLL"), [20, 2]);
  });

  it("returns undefined for non-period indicators", () => {
    assert.equal(getDefaultIndicatorParams("obv"), undefined);
    assert.equal(getDefaultIndicatorParams("vwap"), undefined);
  });

  it("returns undefined for unknown names", () => {
    assert.equal(getDefaultIndicatorParams("not_real_indicator"), undefined);
  });
});

// ---------------------------------------------------------------------------
// registerIndicatorTools — spec shape
// ---------------------------------------------------------------------------

describe("registerIndicatorTools - tool spec", () => {
  const tools = registerIndicatorTools();
  const getTool = (name: string) => tools.find(t => t.name === name)!;

  it("registers exactly two tools", () => {
    assert.equal(tools.length, 2);
  });

  it("first tool is market_get_indicator", () => {
    assert.equal(tools[0]!.name, "market_get_indicator");
  });

  it("second tool is market_list_indicators", () => {
    assert.equal(tools[1]!.name, "market_list_indicators");
  });

  it("market_get_indicator: module is market", () => {
    assert.equal(getTool("market_get_indicator").module, "market");
  });

  it("market_get_indicator: isWrite is false", () => {
    assert.equal(getTool("market_get_indicator").isWrite, false);
  });

  it("market_get_indicator: inputSchema requires instId and indicator", () => {
    const schema = getTool("market_get_indicator").inputSchema as { required: string[] };
    assert.ok(schema.required.includes("instId"));
    assert.ok(schema.required.includes("indicator"));
  });

  it("market_get_indicator: handler is a function", () => {
    assert.equal(typeof getTool("market_get_indicator").handler, "function");
  });

  it("market_get_indicator: params description no longer claims server defaults", () => {
    const schema = getTool("market_get_indicator").inputSchema as {
      properties: { params: { description: string } };
    };
    const paramsDescription = schema.properties.params.description;
    assert.doesNotMatch(
      paramsDescription,
      /server defaults/i,
      "params description must not claim the server applies defaults (false for period indicators)",
    );
  });

  it("market_list_indicators: module is market", () => {
    assert.equal(getTool("market_list_indicators").module, "market");
  });

  it("market_list_indicators: isWrite is false", () => {
    assert.equal(getTool("market_list_indicators").isWrite, false);
  });

  it("market_list_indicators: handler returns KNOWN_INDICATORS", async () => {
    const result = await getTool("market_list_indicators").handler({}, {} as never) as { data: unknown };
    assert.deepEqual(result.data, KNOWN_INDICATORS);
  });
});

// ---------------------------------------------------------------------------
// Tool handler — request body construction (via mock publicPost)
// ---------------------------------------------------------------------------

const BASE_CONFIG: OkxConfig = {
  hasAuth: false,
  profile: "default",
  baseUrl: "https://www.okx.com",
  timeoutMs: 15_000,
  modules: ["market"] as ModuleId[],
  readOnly: false,
  demo: false,
  site: "global",
  sourceTag: "test",
  verbose: false,
};

function jsonFetch(body: unknown): typeof globalThis.fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

async function withFetch(mock: typeof globalThis.fetch, fn: (mock: typeof globalThis.fetch) => Promise<void>): Promise<void> {
  await fn(mock);
}

const MOCK_RESPONSE = {
  code: "0",
  data: [{ data: [{ instId: "BTC-USDT", timeframes: { "1H": { indicators: { RSI: [{ ts: "1700000000000", values: { "14": "55.00" } }] } } } }], mode: "live", summary: {}, timestamp: 1700000000000 }],
  msg: "",
};

describe("market_get_indicator handler - request body", () => {
  const tool = registerIndicatorTools()[0]!;

  it("sends correct instId and indicator code", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi" }, { config: BASE_CONFIG, client });
    });
    const body = captured as Record<string, unknown>;
    assert.equal(body["instId"], "BTC-USDT");
    assert.ok("RSI" in (body["indicators"] as object));
  });

  it("defaults bar to 1H when not provided", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi" }, { config: BASE_CONFIG, client });
    });
    const body = captured as Record<string, unknown>;
    assert.deepEqual(body["timeframes"], ["1H"]);
  });

  it("uses provided bar", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", bar: "4H" }, { config: BASE_CONFIG, client });
    });
    assert.deepEqual((captured as Record<string, unknown>)["timeframes"], ["4H"]);
  });

  it("includes paramList when params provided", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "ma", params: [5, 20] }, { config: BASE_CONFIG, client });
    });
    const indicators = (captured as Record<string, unknown>)["indicators"] as Record<string, unknown>;
    const ma = indicators["MA"] as Record<string, unknown>;
    assert.deepEqual(ma["paramList"], [5, 20]);
  });

  it("treats an empty params array as omitted and applies the default", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", params: [] }, { config: BASE_CONFIG, client });
    });
    const indicators = (captured as Record<string, unknown>)["indicators"] as Record<string, unknown>;
    const rsi = indicators["RSI"] as Record<string, unknown>;
    assert.deepEqual(rsi["paramList"], [14]);
  });

  it("includes limit when returnList=true", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", returnList: true, limit: 20 }, { config: BASE_CONFIG, client });
    });
    const indicators = (captured as Record<string, unknown>)["indicators"] as Record<string, unknown>;
    const rsi = indicators["RSI"] as Record<string, unknown>;
    assert.equal(rsi["returnList"], true);
    assert.equal(rsi["limit"], 20);
  });

  it("omits limit when returnList=false", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", returnList: false }, { config: BASE_CONFIG, client });
    });
    const indicators = (captured as Record<string, unknown>)["indicators"] as Record<string, unknown>;
    const rsi = indicators["RSI"] as Record<string, unknown>;
    assert.equal(rsi["limit"], undefined);
  });

  it("includes backtestTime when provided", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", backtestTime: 1700000000000 }, { config: BASE_CONFIG, client });
    });
    assert.equal((captured as Record<string, unknown>)["backtestTime"], 1700000000000);
  });

  it("omits backtestTime when not provided", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi" }, { config: BASE_CONFIG, client });
    });
    assert.equal((captured as Record<string, unknown>)["backtestTime"], undefined);
  });

  it("applies boll -> BB override in request", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "boll" }, { config: BASE_CONFIG, client });
    });
    const indicators = (captured as Record<string, unknown>)["indicators"] as Record<string, unknown>;
    assert.ok("BB" in indicators, "should use BB code, not BOLL");
    assert.ok(!("BOLL" in indicators), "should NOT use BOLL code");
  });

  it("uses POST /api/v5/aigc/mcp/indicators endpoint", async () => {
    let capturedUrl = "";
    await withFetch(async (input) => {
      capturedUrl = input.toString();
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi" }, { config: BASE_CONFIG, client });
    });
    assert.ok(capturedUrl.includes("/api/v5/aigc/mcp/indicators"), `URL should contain indicator path, got: ${capturedUrl}`);
  });

  it("throws ValidationError when instId is missing", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      const { ValidationError } = await import("../src/utils/errors.js");
      await assert.rejects(
        () => tool.handler({ indicator: "rsi" }, { config: BASE_CONFIG, client }),
        (err) => err instanceof ValidationError,
      );
    });
  });

  it("throws ValidationError when indicator is missing", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      const { ValidationError } = await import("../src/utils/errors.js");
      await assert.rejects(
        () => tool.handler({ instId: "BTC-USDT" }, { config: BASE_CONFIG, client }),
        (err) => err instanceof ValidationError,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// publicPost — no auth headers sent
// ---------------------------------------------------------------------------

describe("OkxRestClient.publicPost - unauthenticated POST", () => {
  it("completes successfully without credentials", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      const result = await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
      assert.ok(result.data !== undefined);
    });
  });

  it("does not send OK-ACCESS-KEY header", async () => {
    const captured: { req?: Request } = {};
    await withFetch(async (input, init) => {
      captured.req = new Request(input, init);
      return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
    });
    assert.equal(captured.req?.headers.get("OK-ACCESS-KEY"), null);
  });

  it("sends POST method", async () => {
    const captured: { req?: Request } = {};
    await withFetch(async (input, init) => {
      captured.req = new Request(input, init);
      return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
    });
    assert.equal(captured.req?.method, "POST");
  });

  it("adds x-simulated-trading header in demo mode", async () => {
    const captured: { req?: Request } = {};
    await withFetch(async (input, init) => {
      captured.req = new Request(input, init);
      return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient({ ...BASE_CONFIG, demo: true }, mock);
      await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
    });
    assert.equal(captured.req?.headers.get("x-simulated-trading"), "1");
  });

  it("does not add x-simulated-trading header when demo=false", async () => {
    const captured: { req?: Request } = {};
    await withFetch(async (input, init) => {
      captured.req = new Request(input, init);
      return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
    });
    assert.equal(captured.req?.headers.get("x-simulated-trading"), null);
  });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Bar validation (caseInsensitive)
// ---------------------------------------------------------------------------

describe("market_get_indicator - bar validation", () => {
  const tool = registerIndicatorTools()[0]!;

  it("throws ValidationError for invalid bar value '1D' (not in INDICATOR_BARS)", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      const { ValidationError } = await import("../src/utils/errors.js");
      await assert.rejects(
        () => tool.handler({ instId: "BTC-USDT", indicator: "rsi", bar: "1D" }, { config: BASE_CONFIG, client }),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.match((err as Error).message, /bar/);
          return true;
        },
      );
    });
  });

  it("accepts lowercase valid bar '1h' (case-insensitive match for '1H')", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await assert.doesNotReject(
        () => tool.handler({ instId: "BTC-USDT", indicator: "rsi", bar: "1h" }, { config: BASE_CONFIG, client }),
      );
    });
  });

  it("accepts uppercase valid bar '4H' exactly", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await assert.doesNotReject(
        () => tool.handler({ instId: "BTC-USDT", indicator: "rsi", bar: "4H" }, { config: BASE_CONFIG, client }),
      );
    });
  });

  it("accepts missing bar (uses default 1H, no error)", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await assert.doesNotReject(
        () => tool.handler({ instId: "BTC-USDT", indicator: "rsi" }, { config: BASE_CONFIG, client }),
      );
    });
  });

  it("forwards lowercase '1h' unchanged in timeframes (no normalization to '1H')", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", bar: "1h" }, { config: BASE_CONFIG, client });
    });
    assert.deepEqual((captured as Record<string, unknown>)["timeframes"], ["1h"]);
  });

  it("forwards uppercase '4H' unchanged in timeframes", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", bar: "4H" }, { config: BASE_CONFIG, client });
    });
    assert.deepEqual((captured as Record<string, unknown>)["timeframes"], ["4H"]);
  });
});

// Indicator name validation
// ---------------------------------------------------------------------------

describe("market_get_indicator - indicator name validation", () => {
  const tool = registerIndicatorTools()[0]!;

  it("rejects unknown indicator name", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      const { ValidationError } = await import("../src/utils/errors.js");
      await assert.rejects(
        () => tool.handler({ instId: "BTC-USDT", indicator: "not_real_indicator" }, { config: BASE_CONFIG, client }),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.match((err as Error).message, /Unknown indicator/);
          return true;
        },
      );
    });
  });

  it("accepts valid indicator name 'rsi'", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      // should not throw
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi" }, { config: BASE_CONFIG, client });
    });
  });

  it("accepts alias 'boll' (maps to BB)", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "boll" }, { config: BASE_CONFIG, client });
    });
  });

  it("suggests similar names for partial matches", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      const { ValidationError } = await import("../src/utils/errors.js");
      await assert.rejects(
        () => tool.handler({ instId: "BTC-USDT", indicator: "mac" }, { config: BASE_CONFIG, client }),
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.match((err as Error).message, /macd/);
          return true;
        },
      );
    });
  });
});

describe("market_get_indicator - params validation (handler level)", () => {
  const tool = registerIndicatorTools()[0]!;

  it("rejects wrong param count before any HTTP call", async () => {
    let called = false;
    const { ValidationError } = await import("../src/utils/errors.js");
    await withFetch(async () => {
      called = true;
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await assert.rejects(
        () => tool.handler({ instId: "BTC-USDT", indicator: "macd", params: [12] }, { config: BASE_CONFIG, client }),
        (err) => err instanceof ValidationError && /macd requires 3 params \(fast,slow,signal\), got 1: \[12\]/.test((err as Error).message),
      );
    });
    assert.equal(called, false);
  });

  it("rejects non-numeric params", async () => {
    const { ValidationError } = await import("../src/utils/errors.js");
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await assert.rejects(
        () => tool.handler({ instId: "BTC-USDT", indicator: "rsi", params: ["abc"] }, { config: BASE_CONFIG, client }),
        ValidationError,
      );
    });
  });

  it("accepts valid params and omitted params", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      await tool.handler({ instId: "BTC-USDT", indicator: "macd", params: [12, 26, 9] }, { config: BASE_CONFIG, client });
      await tool.handler({ instId: "BTC-USDT", indicator: "macd" }, { config: BASE_CONFIG, client });
    });
  });

  async function send(args: Record<string, unknown>): Promise<{ body: Record<string, unknown>; result: Record<string, unknown> }> {
    let body: Record<string, unknown> = {};
    let result: Record<string, unknown> = {};
    await withFetch(async (_url, init) => {
      body = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async (mock) => {
      const client = new OkxRestClient(BASE_CONFIG, mock);
      result = await tool.handler({ instId: "BTC-USDT", ...args }, { config: BASE_CONFIG, client }) as Record<string, unknown>;
    });
    return { body, result };
  }

  const paramListOf = (body: Record<string, unknown>, code: string): unknown =>
    ((body["indicators"] as Record<string, Record<string, unknown>>)[code])!["paramList"];

  it("applies the default paramList when params is omitted and reports it", async () => {
    const { body, result } = await send({ indicator: "macd" });
    assert.deepEqual(paramListOf(body, "MACD"), [12, 26, 9]);
    assert.deepEqual(result["appliedParams"], [12, 26, 9]);
    assert.equal(result["paramsSource"], "default");
  });

  it("applies the corrected supertrend default [factor, atrPeriod] = [3, 10]", async () => {
    const { body } = await send({ indicator: "supertrend" });
    assert.deepEqual(paramListOf(body, "SUPERTREND"), [3, 10]);
  });

  it("resolves the boll alias to bb's default", async () => {
    const { body } = await send({ indicator: "boll" });
    assert.deepEqual(paramListOf(body, "BB"), [20, 2]);
  });

  it("sends explicit params as-is and reports paramsSource=explicit", async () => {
    const { body, result } = await send({ indicator: "ma", params: [5, 10] });
    assert.deepEqual(paramListOf(body, "MA"), [5, 10]);
    assert.deepEqual(result["appliedParams"], [5, 10]);
    assert.equal(result["paramsSource"], "explicit");
  });

  it("indicators without a params contract are passed through untouched", async () => {
    const omitted = await send({ indicator: "obv" });
    assert.equal(paramListOf(omitted.body, "OBV"), undefined);
    assert.equal(omitted.result["appliedParams"], undefined);

    const explicit = await send({ indicator: "obv", params: [1, 2, 3] });
    assert.deepEqual(paramListOf(explicit.body, "OBV"), [1, 2, 3]);
    assert.equal(explicit.result["appliedParams"], undefined);
    assert.equal(explicit.result["paramsSource"], undefined);
  });

  it("envelope / alphatrend / halftrend / pmax: default applied when omitted, explicit params sent as-is", async () => {
    const defaults: Record<string, number[]> = { envelope: [20, 2], alphatrend: [14, 100], halftrend: [2, 20], pmax: [10, 30, 10] };
    for (const [indicator, def] of Object.entries(defaults)) {
      const omitted = await send({ indicator });
      assert.deepEqual(paramListOf(omitted.body, indicator.toUpperCase()), def, indicator);
      assert.equal(omitted.result["paramsSource"], "default");
      const explicit = await send({ indicator, params: def });
      assert.deepEqual(explicit.result["appliedParams"], def);
      assert.equal(explicit.result["paramsSource"], "explicit");
    }
  });

  it("envelope rejects the old documented example 20,0.1 and incomplete params", async () => {
    const { ValidationError } = await import("../src/utils/errors.js");
    await assert.rejects(() => send({ indicator: "envelope", params: [20, 0.1] }), ValidationError);
    await assert.rejects(() => send({ indicator: "pmax", params: [10, 30] }), ValidationError);
  });

  it("rejects incomplete and surplus fixed-length params", async () => {
    const { ValidationError } = await import("../src/utils/errors.js");
    for (const params of [[12, 26], [12, 26, 9, 1]]) {
      await assert.rejects(
        () => send({ indicator: "macd", params }),
        (err) => err instanceof ValidationError && /macd requires 3 params/.test((err as Error).message),
      );
    }
  });

  it("params description states the int32 exception and that unlisted indicators are not validated", () => {
    const schema = tool.inputSchema as { properties: { params: { description: string } } };
    const text = schema.properties.params.description;
    assert.match(text, /alphatrend and halftrend take any int32 integers/);
    assert.match(text, /Indicators not listed under Defaults are not validated/);
  });

  it("describes defaults in the params schema", () => {
    const schema = tool.inputSchema as { properties: { params: { description: string; items: { type: string } } } };
    assert.match(schema.properties.params.description, /Defaults:.*supertrend 3,10/);
    assert.equal(schema.properties.params.items.type, "integer");
  });

  it("rejects params that are not an array (no silent fallback to the default)", async () => {
    const { ValidationError } = await import("../src/utils/errors.js");
    for (const params of ["12,26,9", 14, { a: 1 }, true]) {
      await assert.rejects(
        () => send({ indicator: "macd", params }),
        (err) => err instanceof ValidationError && /must be an array of numbers/.test((err as Error).message),
      );
    }
  });

  it("rejects array items that are not numbers (null, boolean, empty string, nested)", async () => {
    const { ValidationError } = await import("../src/utils/errors.js");
    for (const item of [null, true, "", "abc", [26], Number.NaN]) {
      await assert.rejects(
        () => send({ indicator: "bb", params: [20, item] }),
        (err) => err instanceof ValidationError && /must be a finite number/.test((err as Error).message),
        String(item),
      );
    }
    // also for indicators without a params contract (previously NaN was sent as null)
    await assert.rejects(() => send({ indicator: "obv", params: [null] }), ValidationError);
  });

  it("accepts numeric strings (LLMs sometimes send \"14\")", async () => {
    const { body } = await send({ indicator: "rsi", params: ["14"] });
    assert.deepEqual(paramListOf(body, "RSI"), [14]);
  });

  it("an empty params array reports paramsSource=default", async () => {
    const { result } = await send({ indicator: "macd", params: [] });
    assert.equal(result["paramsSource"], "default");
    assert.deepEqual(result["appliedParams"], [12, 26, 9]);
  });

  it("validates with a mixed-case name and the boll alias", async () => {
    const { ValidationError } = await import("../src/utils/errors.js");
    await assert.rejects(
      () => send({ indicator: "MACD", params: [12, 26] }),
      (err) => err instanceof ValidationError && /macd requires 3 params/.test((err as Error).message),
    );
    await assert.rejects(
      () => send({ indicator: "boll", params: [20, 10] }),
      (err) => err instanceof ValidationError && /bb param #2 \(multiplier\)/.test((err as Error).message),
    );
  });

  it("type errors on an indicator with a params contract also carry its signature and default", async () => {
    const { ValidationError } = await import("../src/utils/errors.js");
    await assert.rejects(
      () => send({ indicator: "macd", params: [12, "abc", 9] }),
      (err) => err instanceof ValidationError
        && /params"\[1\] must be a finite number/.test((err as Error).message)
        && /macd requires 3 params \(fast,slow,signal\)\. Default: 12,26,9\. Example: params \[12,26,9\]/.test((err as Error).message),
    );
    await assert.rejects(
      () => send({ indicator: "ema", params: "5,20" }),
      (err) => err instanceof ValidationError
        && /must be an array of numbers/.test((err as Error).message)
        && /ema requires one or more periods/.test((err as Error).message),
    );
  });

  it("type errors on an indicator without a params contract stay generic", async () => {
    const { ValidationError } = await import("../src/utils/errors.js");
    await assert.rejects(
      () => send({ indicator: "obv", params: ["x"] }),
      (err) => err instanceof ValidationError && !/requires/.test((err as Error).message),
    );
  });

  it("a very long digit string (overflows to Infinity) is rejected instead of being sent as null", async () => {
    const { ValidationError } = await import("../src/utils/errors.js");
    for (const indicator of ["obv", "macd"]) {
      await assert.rejects(
        () => send({ indicator, params: ["9".repeat(400)] }),
        (err) => err instanceof ValidationError && /must be a finite number/.test((err as Error).message),
        indicator,
      );
    }
  });
});
