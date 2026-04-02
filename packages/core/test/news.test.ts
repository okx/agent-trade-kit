/**
 * Unit tests for the news module tools.
 * Tests parameter validation, default pre-fill, and routing logic.
 * Uses a mock client — no real API calls are made.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ToolContext } from "../src/tools/types.js";
import { registerNewsTools } from "../src/tools/news.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface CapturedCall {
  method: "GET" | "POST";
  endpoint: string;
  params: Record<string, unknown>;
  headers?: Record<string, string>;
}

function makeMockClient() {
  let lastCall: CapturedCall | null = null;

  const fakeResponse = (endpoint: string) => ({
    endpoint,
    requestTime: "2026-01-01T00:00:00.000Z",
    data: [{ dataList: [], nextCursor: null }],
  });

  const client = {
    publicGet: async (endpoint: string, params: Record<string, unknown>, _rl: unknown, headers?: Record<string, string>) => {
      lastCall = { method: "GET", endpoint, params, headers };
      return fakeResponse(endpoint);
    },
    privateGet: async (endpoint: string, params: Record<string, unknown>, _rl: unknown, headers?: Record<string, string>) => {
      lastCall = { method: "GET", endpoint, params, headers };
      return fakeResponse(endpoint);
    },
    privatePost: async (endpoint: string, params: Record<string, unknown>) => {
      lastCall = { method: "POST", endpoint, params };
      return fakeResponse(endpoint);
    },
  };

  return {
    client,
    getLastCall: () => lastCall,
    resetLastCall: () => { lastCall = null; },
  };
}

function makeContext(client: ReturnType<typeof makeMockClient>["client"]): ToolContext {
  return {
    client: client as unknown as ToolContext["client"],
    config: {
      apiKey: "test-key",
      secretKey: "test-secret",
      passphrase: "test-passphrase",
      hasAuth: true,
      modules: ["news"],
      readOnly: false,
      demo: false,
      site: "global",
      baseUrl: "https://www.okx.com",
      sourceTag: "MCP",
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("news tools registration", () => {
  it("should register exactly 7 news tools", () => {
    const tools = registerNewsTools();
    assert.equal(tools.length, 7);
  });

  it("should have expected tool names", () => {
    const tools = registerNewsTools();
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("news_get_latest"));
    assert.ok(names.includes("news_get_by_coin"));
    assert.ok(names.includes("news_search"));
    assert.ok(names.includes("news_get_detail"));
    assert.ok(names.includes("news_get_domains"));
    assert.ok(names.includes("news_get_coin_sentiment"));
    assert.ok(names.includes("news_get_sentiment_ranking"));
    // merged/removed tools
    assert.ok(!names.includes("news_get_important"));
    assert.ok(!names.includes("news_list_domains"));
    assert.ok(!names.includes("news_get_coin_trend"));
  });

  it("all news tools should be read-only (isWrite=false)", () => {
    const tools = registerNewsTools();
    for (const tool of tools) {
      assert.equal(tool.isWrite, false, `${tool.name} should be read-only`);
    }
  });

  it("all news tools should belong to 'news' module", () => {
    const tools = registerNewsTools();
    for (const tool of tools) {
      assert.equal(tool.module, "news", `${tool.name} should be in news module`);
    }
  });
});

describe("news_get_latest", () => {
  it("should pre-fill sortBy=latest and not send Accept-Language when language omitted", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_latest")!;

    await tool.handler({}, ctx);
    const call = getLastCall()!;
    assert.equal(call.endpoint, "/api/v5/orbit/news-search");
    assert.equal(call.params["sortBy"], "latest");
    assert.equal(call.params["importance"], undefined);
    assert.equal(call.headers?.["Accept-Language"], undefined);
    assert.equal(call.params["limit"], 10);
  });

  it("should send Accept-Language header when language=zh_CN", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_latest")!;

    await tool.handler({ language: "zh_CN" }, ctx);
    const call = getLastCall()!;
    assert.equal(call.headers?.["Accept-Language"], "zh_CN");
  });

  it("should pass importance when specified", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_latest")!;

    await tool.handler({ importance: "high" }, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["importance"], "high");
    assert.equal(call.params["sortBy"], "latest");
  });

  it("should pass coins as comma-separated ccyList", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_latest")!;

    await tool.handler({ coins: "BTC,ETH" }, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["ccyList"], "BTC,ETH");
  });

  it("should pass custom limit", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_latest")!;

    await tool.handler({ limit: 30 }, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["limit"], 30);
  });

  it("should not include ccyList when coins not provided", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_latest")!;

    await tool.handler({}, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["ccyList"], undefined);
  });
});

describe("news_get_by_coin", () => {
  it("should throw when coins is missing", async () => {
    const { client } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_by_coin")!;

    await assert.rejects(
      () => tool.handler({}, ctx),
      (err: Error) => err.message.includes("coins"),
    );
  });

  it("should throw when coins is empty string", async () => {
    const { client } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_by_coin")!;

    await assert.rejects(
      () => tool.handler({ coins: "" }, ctx),
      (err: Error) => err.message.includes("coins"),
    );
  });

  it("should pass coins and importance correctly", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_by_coin")!;

    await tool.handler({ coins: "BTC,ETH", importance: "high" }, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["ccyList"], "BTC,ETH");
    assert.equal(call.params["importance"], "high");
    assert.equal(call.params["sortBy"], "latest");
  });
});

describe("news_search", () => {
  it("should default sortBy=relevant", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_search")!;

    await tool.handler({ keyword: "SEC ETF" }, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["keyword"], "SEC ETF");
    assert.equal(call.params["sortBy"], "relevant");
  });

  it("should allow overriding sortBy", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_search")!;

    await tool.handler({ keyword: "BTC", sortBy: "latest" }, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["sortBy"], "latest");
  });

  it("should pass multi-field filters", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_search")!;

    await tool.handler({ keyword: "SEC", coins: "BTC", sentiment: "bullish", importance: "high" }, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["keyword"], "SEC");
    assert.equal(call.params["ccyList"], "BTC");
    assert.equal(call.params["sentiment"], "bullish");
    assert.equal(call.params["importance"], "high");
  });
});

describe("news_get_detail", () => {
  it("should call detail endpoint with id", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_detail")!;

    await tool.handler({ id: "70837884992672" }, ctx);
    const call = getLastCall()!;
    assert.equal(call.endpoint, "/api/v5/orbit/news-detail");
    assert.equal(call.params["id"], "70837884992672");
  });
});

describe("news_get_domains", () => {
  it("should call domains endpoint with no params", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_domains")!;

    await tool.handler({}, ctx);
    const call = getLastCall()!;
    assert.equal(call.endpoint, "/api/v5/orbit/news-platform");
  });
});

describe("news_get_coin_sentiment", () => {
  it("should throw when coins is missing", async () => {
    const { client } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_coin_sentiment")!;

    await assert.rejects(() => tool.handler({}, ctx));
  });

  it("should default period=24h and omit inclTrend when no trendPoints", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_coin_sentiment")!;

    await tool.handler({ coins: "BTC" }, ctx);
    const call = getLastCall()!;
    assert.equal(call.endpoint, "/api/v5/orbit/currency-sentiment-query");
    assert.equal(call.params["ccy"], "BTC");
    assert.equal(call.params["period"], "24h");
    assert.equal(call.params["inclTrend"], undefined);
    assert.equal(call.params["limit"], undefined);
  });

  it("should default period=1h and set includeTrend=true when trendPoints provided", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_coin_sentiment")!;

    await tool.handler({ coins: "BTC", trendPoints: 24 }, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["period"], "1h");
    assert.equal(call.params["inclTrend"], true);
    assert.equal(call.params["limit"], 24);
  });
});

describe("news_get_sentiment_ranking", () => {
  it("should use ranking endpoint with defaults", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_sentiment_ranking")!;

    await tool.handler({}, ctx);
    const call = getLastCall()!;
    assert.equal(call.endpoint, "/api/v5/orbit/currency-sentiment-ranking");
    assert.equal(call.params["period"], "24h");
    assert.equal(call.params["sortBy"], "hot");
    assert.equal(call.params["limit"], 10);
  });

  it("should pass custom sortBy for bullish ranking", async () => {
    const { client, getLastCall } = makeMockClient();
    const ctx = makeContext(client);
    const tools = registerNewsTools();
    const tool = tools.find((t) => t.name === "news_get_sentiment_ranking")!;

    await tool.handler({ sortBy: "bullish", limit: 20 }, ctx);
    const call = getLastCall()!;
    assert.equal(call.params["sortBy"], "bullish");
    assert.equal(call.params["limit"], 20);
  });
});
