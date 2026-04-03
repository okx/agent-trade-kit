/**
 * Unit tests for indicator tool — resolveIndicatorCode, tool registration,
 * handler request body construction, and publicPost on OkxRestClient.
 *
 * No real network calls are made; globalThis.fetch is mocked.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveIndicatorCode, INDICATOR_BARS, registerIndicatorTools } from "../src/tools/indicator.js";
import { OkxRestClient } from "../src/client/rest-client.js";
import type { OkxConfig } from "../src/config.js";
import type { ModuleId } from "../src/constants.js";

// ---------------------------------------------------------------------------
// resolveIndicatorCode
// ---------------------------------------------------------------------------

describe("resolveIndicatorCode — CLI name → API code", () => {
  it("rainbow → BTCRAINBOW (override)", () => {
    assert.equal(resolveIndicatorCode("rainbow"), "BTCRAINBOW");
  });

  it("Rainbow (mixed case) → BTCRAINBOW (case-insensitive override)", () => {
    assert.equal(resolveIndicatorCode("Rainbow"), "BTCRAINBOW");
  });

  it("range-filter → RANGEFILTER (override)", () => {
    assert.equal(resolveIndicatorCode("range-filter"), "RANGEFILTER");
  });

  it("stoch-rsi → STOCHRSI (override)", () => {
    assert.equal(resolveIndicatorCode("stoch-rsi"), "STOCHRSI");
  });

  it("pi-cycle-top → PI_CYCLE_TOP (override)", () => {
    assert.equal(resolveIndicatorCode("pi-cycle-top"), "PI_CYCLE_TOP");
  });

  it("pi-cycle-bottom → PI_CYCLE_BOTTOM (override)", () => {
    assert.equal(resolveIndicatorCode("pi-cycle-bottom"), "PI_CYCLE_BOTTOM");
  });

  it("boll → BB (override)", () => {
    assert.equal(resolveIndicatorCode("boll"), "BB");
  });

  it("ma → MA (default uppercase transform)", () => {
    assert.equal(resolveIndicatorCode("ma"), "MA");
  });

  it("rsi → RSI (default uppercase transform)", () => {
    assert.equal(resolveIndicatorCode("rsi"), "RSI");
  });

  it("macd → MACD (default uppercase transform)", () => {
    assert.equal(resolveIndicatorCode("macd"), "MACD");
  });

  it("halftrend → HALFTREND (default uppercase transform)", () => {
    assert.equal(resolveIndicatorCode("halftrend"), "HALFTREND");
  });

  it("mayer → MAYER (default uppercase transform)", () => {
    assert.equal(resolveIndicatorCode("mayer"), "MAYER");
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
// registerIndicatorTools — spec shape
// ---------------------------------------------------------------------------

describe("registerIndicatorTools — tool spec", () => {
  const tools = registerIndicatorTools();

  it("registers exactly one tool", () => {
    assert.equal(tools.length, 1);
  });

  it("tool name is market_get_indicator", () => {
    assert.equal(tools[0]!.name, "market_get_indicator");
  });

  it("tool module is market", () => {
    assert.equal(tools[0]!.module, "market");
  });

  it("isWrite is false", () => {
    assert.equal(tools[0]!.isWrite, false);
  });

  it("inputSchema requires instId and indicator", () => {
    const schema = tools[0]!.inputSchema as { required: string[] };
    assert.ok(schema.required.includes("instId"));
    assert.ok(schema.required.includes("indicator"));
  });

  it("handler is a function", () => {
    assert.equal(typeof tools[0]!.handler, "function");
  });
});

// ---------------------------------------------------------------------------
// Tool handler — request body construction (via mock publicPost)
// ---------------------------------------------------------------------------

const BASE_CONFIG: OkxConfig = {
  hasAuth: false,
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

async function withFetch(mock: typeof globalThis.fetch, fn: () => Promise<void>): Promise<void> {
  const saved = globalThis.fetch;
  globalThis.fetch = mock;
  try { await fn(); } finally { globalThis.fetch = saved; }
}

const MOCK_RESPONSE = {
  code: "0",
  data: [{ data: [{ instId: "BTC-USDT", timeframes: { "1H": { indicators: { RSI: [{ ts: "1700000000000", values: { "14": "55.00" } }] } } } }], mode: "live", summary: {}, timestamp: 1700000000000 }],
  msg: "",
};

describe("market_get_indicator handler — request body", () => {
  const tool = registerIndicatorTools()[0]!;

  it("sends correct instId and indicator code", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
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
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
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
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", bar: "4H" }, { config: BASE_CONFIG, client });
    });
    assert.deepEqual((captured as Record<string, unknown>)["timeframes"], ["4H"]);
  });

  it("includes paramList when params provided", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await tool.handler({ instId: "BTC-USDT", indicator: "ma", params: [5, 20] }, { config: BASE_CONFIG, client });
    });
    const indicators = (captured as Record<string, unknown>)["indicators"] as Record<string, unknown>;
    const ma = indicators["MA"] as Record<string, unknown>;
    assert.deepEqual(ma["paramList"], [5, 20]);
  });

  it("omits paramList when params is empty array", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", params: [] }, { config: BASE_CONFIG, client });
    });
    const indicators = (captured as Record<string, unknown>)["indicators"] as Record<string, unknown>;
    const rsi = indicators["RSI"] as Record<string, unknown>;
    assert.equal(rsi["paramList"], undefined);
  });

  it("includes limit when returnList=true", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
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
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
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
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi", backtestTime: 1700000000000 }, { config: BASE_CONFIG, client });
    });
    assert.equal((captured as Record<string, unknown>)["backtestTime"], 1700000000000);
  });

  it("omits backtestTime when not provided", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi" }, { config: BASE_CONFIG, client });
    });
    assert.equal((captured as Record<string, unknown>)["backtestTime"], undefined);
  });

  it("applies boll → BB override in request", async () => {
    let captured: unknown;
    await withFetch(async (_url, init) => {
      captured = JSON.parse((init as RequestInit).body as string);
      return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
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
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await tool.handler({ instId: "BTC-USDT", indicator: "rsi" }, { config: BASE_CONFIG, client });
    });
    assert.ok(capturedUrl.includes("/api/v5/aigc/mcp/indicators"), `URL should contain indicator path, got: ${capturedUrl}`);
  });

  it("throws ValidationError when instId is missing", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      const { ValidationError } = await import("../src/utils/errors.js");
      await assert.rejects(
        () => tool.handler({ indicator: "rsi" }, { config: BASE_CONFIG, client }),
        (err) => err instanceof ValidationError,
      );
    });
  });

  it("throws ValidationError when indicator is missing", async () => {
    await withFetch(jsonFetch(MOCK_RESPONSE), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
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

describe("OkxRestClient.publicPost — unauthenticated POST", () => {
  it("completes successfully without credentials", async () => {
    await withFetch(jsonFetch({ code: "0", msg: "", data: [] }), async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      const result = await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
      assert.ok(result.data !== undefined);
    });
  });

  it("does not send OK-ACCESS-KEY header", async () => {
    const captured: { req?: Request } = {};
    await withFetch(async (input, init) => {
      captured.req = new Request(input, init);
      return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
    });
    assert.equal(captured.req?.headers.get("OK-ACCESS-KEY"), null);
  });

  it("sends POST method", async () => {
    const captured: { req?: Request } = {};
    await withFetch(async (input, init) => {
      captured.req = new Request(input, init);
      return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
    });
    assert.equal(captured.req?.method, "POST");
  });

  it("adds x-simulated-trading header in demo mode", async () => {
    const captured: { req?: Request } = {};
    await withFetch(async (input, init) => {
      captured.req = new Request(input, init);
      return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient({ ...BASE_CONFIG, demo: true });
      await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
    });
    assert.equal(captured.req?.headers.get("x-simulated-trading"), "1");
  });

  it("does not add x-simulated-trading header when demo=false", async () => {
    const captured: { req?: Request } = {};
    await withFetch(async (input, init) => {
      captured.req = new Request(input, init);
      return new Response(JSON.stringify({ code: "0", msg: "", data: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const client = new OkxRestClient(BASE_CONFIG);
      await client.publicPost("/api/v5/aigc/mcp/indicators", { instId: "BTC-USDT" });
    });
    assert.equal(captured.req?.headers.get("x-simulated-trading"), null);
  });
});
