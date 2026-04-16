/**
 * CLI parameter routing tests for the news module.
 *
 * Verifies that key flags (--coins, --sentiment, --keyword, --sort-by, etc.)
 * are routed from v.xxx (named flags) to the underlying ToolRunner,
 * not from positional args (rest[N]).
 *
 * Also guards the sortBy string type contract: --sort-by accepts
 * "hot"/"bullish"/"bearish" strings, not 0/1/2 numbers.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import { handleNewsCommand } from "../src/index.js";
import type { CliValues } from "../src/index.js";
import { setOutput, resetOutput } from "../src/formatter.js";

beforeEach(() => setOutput({ out: () => {}, err: () => {} }));
afterEach(() => resetOutput());

// ---------------------------------------------------------------------------
// Fake response shapes expected by each CLI formatter
// ---------------------------------------------------------------------------

const fakeNewsItem = {
  id: "123",
  cTime: "1711843200000",
  platformList: ["coindesk"],
  title: "Test headline",
  ccyList: ["BTC"],
  importance: "high",
  ccySentiments: [{ ccy: "BTC", sentiment: "bullish" }],
};
const fakeNewsPage = {
  endpoint: "GET /api/v5/orbit/news-search",
  requestTime: new Date().toISOString(),
  data: [{ details: [fakeNewsItem], nextCursor: "cursor_abc" }],
};
const fakeDetail = {
  endpoint: "GET /api/v5/orbit/news-detail",
  requestTime: new Date().toISOString(),
  data: [{ id: "123", title: "Full article", platformList: ["coindesk"], cTime: "1711843200000", sourceUrl: "https://example.com", ccyList: ["BTC"], importance: "high", summary: "A summary", content: "Full content text here" }],
};
const fakeSentimentItem = {
  ccy: "BTC",
  mentionCnt: 42,
  sentiment: { label: "bullish", bullishRatio: "0.7", bearishRatio: "0.3" },
};
const fakeSentiment = {
  endpoint: "GET /api/v5/orbit/currency-sentiment-query",
  requestTime: new Date().toISOString(),
  data: [{ details: [fakeSentimentItem], period: "24h", ts: "0" }],
};
const fakeTrend = {
  endpoint: "GET /api/v5/orbit/currency-sentiment-query",
  requestTime: new Date().toISOString(),
  data: [{ details: [{ ccy: "BTC", trend: [{ ts: "1711843200000", bullishRatio: "0.6", bearishRatio: "0.4", mentionCnt: 10 }] }], period: "1h", ts: "0" }],
};
const fakeRanking = {
  endpoint: "GET /api/v5/orbit/currency-sentiment-ranking",
  requestTime: new Date().toISOString(),
  data: [{ details: [fakeSentimentItem], period: "24h", ts: "0" }],
};
const fakeDomains = {
  endpoint: "GET /api/v5/orbit/news-platform",
  requestTime: new Date().toISOString(),
  data: [{ platform: ["coindesk", "cointelegraph"] }],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Sparse data: fields missing to exercise ?? fallback branches
const sparseNewsItem = { id: "999" };
const sparseNewsPage = {
  endpoint: "GET /api/v5/orbit/news-search",
  requestTime: new Date().toISOString(),
  data: [{ details: [sparseNewsItem], nextCursor: null }],
};
const sparseSentiment = {
  endpoint: "GET /api/v5/orbit/currency-sentiment-query",
  requestTime: new Date().toISOString(),
  data: [{ details: [{ ccy: "BTC" }], period: "24h", ts: "0" }],
};
const emptyTrend = {
  endpoint: "GET /api/v5/orbit/currency-sentiment-query",
  requestTime: new Date().toISOString(),
  data: [{ details: [], period: "1h", ts: "0" }],
};
const emptyDetail = {
  endpoint: "GET /api/v5/orbit/news-detail",
  requestTime: new Date().toISOString(),
  data: [],
};

function makeSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    const t = tool as string;
    if (t === "news_get_coin_sentiment") {
      return (args as Record<string, unknown>)["trendPoints"] ? fakeTrend : fakeSentiment;
    }
    if (t === "news_get_sentiment_ranking") return fakeRanking;
    if (t === "news_get_domains") return fakeDomains;
    if (t === "news_get_detail") return fakeDetail;
    return fakeNewsPage;
  };
  return { spy, captured };
}

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

// ===========================================================================
// news latest
// ===========================================================================

describe("handleNewsCommand latest — parameter routing", () => {
  it("--coins routes via v.coins as string", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "latest", [], vals({ coins: "BTC,ETH" }), false);
    assert.equal(captured.tool, "news_get_latest");
    assert.equal(captured.args["coins"], "BTC,ETH");
  });

  it("--importance routes via v.importance", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "latest", [], vals({ importance: "high" }), false);
    assert.equal(captured.args["importance"], "high");
  });

  it("--language routes via v.lang", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "latest", [], vals({ lang: "zh" }), false);
    assert.equal(captured.args["language"], "zh");
  });

  it("--limit routes via v.limit", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "latest", [], vals({ limit: "20" }), false);
    assert.equal(captured.args["limit"], 20);
  });

  it("--platform routes via v.platform", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "latest", [], vals({ platform: "blockbeats" }), false);
    assert.equal(captured.args["platform"], "blockbeats");
  });

  it("no --coins passes undefined", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "latest", [], vals({}), false);
    assert.equal(captured.args["coins"], undefined);
  });
});

// ===========================================================================
// news important
// ===========================================================================

describe("handleNewsCommand important — parameter routing", () => {
  it("--platform routes via v.platform", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "important", [], vals({ platform: "blockbeats" }), false);
    assert.equal(captured.tool, "news_get_latest");
    assert.equal(captured.args["importance"], "high");
    assert.equal(captured.args["platform"], "blockbeats");
  });
});

// ===========================================================================
// news by-coin
// ===========================================================================

describe("handleNewsCommand by-coin — parameter routing", () => {
  it("--coins named flag takes precedence over rest[0]", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "by-coin", ["REST_COIN"], vals({ coins: "BTC" }), false);
    assert.equal(captured.tool, "news_get_by_coin");
    assert.equal(captured.args["coins"], "BTC");
  });

  it("falls back to rest[0] when --coins absent", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "by-coin", ["ETH"], vals({}), false);
    assert.equal(captured.args["coins"], "ETH");
  });

  it("--importance routes via v.importance", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "by-coin", ["BTC"], vals({ importance: "high" }), false);
    assert.equal(captured.args["importance"], "high");
  });

  it("--platform routes via v.platform", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "by-coin", ["BTC"], vals({ platform: "odaily_flash" }), false);
    assert.equal(captured.args["platform"], "odaily_flash");
  });
});

// ===========================================================================
// news search
// ===========================================================================

describe("handleNewsCommand search — parameter routing", () => {
  it("--keyword named flag takes precedence over rest[0]", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "search", ["REST_KEYWORD"], vals({ keyword: "SEC ETF" }), false);
    assert.equal(captured.tool, "news_search");
    assert.equal(captured.args["keyword"], "SEC ETF");
  });

  it("falls back to rest[0] when --keyword absent", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "search", ["Bitcoin halving"], vals({}), false);
    assert.equal(captured.args["keyword"], "Bitcoin halving");
  });

  it("--sort-by passes as string, not number", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "search", ["BTC"], vals({ "sort-by": "latest" }), false);
    assert.equal(captured.args["sortBy"], "latest");
    assert.equal(typeof captured.args["sortBy"], "string");
  });

  it("--platform routes via v.platform", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "search", ["ETF"], vals({ platform: "chaincatcher" }), false);
    assert.equal(captured.args["platform"], "chaincatcher");
  });
});

// ===========================================================================
// news coin-sentiment
// ===========================================================================

describe("handleNewsCommand coin-sentiment — parameter routing", () => {
  it("--coins named flag takes precedence over rest[0]", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "coin-sentiment", ["REST_COIN"], vals({ coins: "BTC" }), false);
    assert.equal(captured.tool, "news_get_coin_sentiment");
    assert.equal(captured.args["coins"], "BTC");
  });

  it("falls back to rest[0] when --coins absent", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "coin-sentiment", ["ETH"], vals({}), false);
    assert.equal(captured.args["coins"], "ETH");
  });

  it("--period routes via v.period", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "coin-sentiment", ["BTC"], vals({ period: "1h" }), false);
    assert.equal(captured.args["period"], "1h");
  });
});

// ===========================================================================
// news coin-trend
// ===========================================================================

describe("handleNewsCommand coin-trend — parameter routing", () => {
  it("coin comes from rest[0]; --period and --points from flags", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "coin-trend", ["BTC"], vals({ period: "4h", points: "6" }), false);
    assert.equal(captured.tool, "news_get_coin_sentiment");
    assert.equal(captured.args["coins"], "BTC");
    assert.equal(captured.args["period"], "4h");
    assert.equal(captured.args["trendPoints"], 6);
  });

  it("--points defaults to 24 when not specified", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "coin-trend", ["ETH"], vals({}), false);
    assert.equal(captured.args["trendPoints"], 24);
  });
});

// ===========================================================================
// news sentiment-rank
// ===========================================================================

describe("handleNewsCommand sentiment-rank — parameter routing", () => {
  it("--sort-by 'bullish' passes as string (not number)", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "sentiment-rank", [], vals({ "sort-by": "bullish" }), false);
    assert.equal(captured.tool, "news_get_sentiment_ranking");
    assert.equal(captured.args["sortBy"], "bullish");
    assert.equal(typeof captured.args["sortBy"], "string");
  });

  it("--sort-by 'bearish' passes as string", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "sentiment-rank", [], vals({ "sort-by": "bearish" }), false);
    assert.equal(captured.args["sortBy"], "bearish");
  });

  it("--sort-by 'hot' passes as string", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "sentiment-rank", [], vals({ "sort-by": "hot" }), false);
    assert.equal(captured.args["sortBy"], "hot");
  });

  it("--period routes via v.period", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "sentiment-rank", [], vals({ period: "1h" }), false);
    assert.equal(captured.args["period"], "1h");
  });

  it("--limit routes via v.limit", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "sentiment-rank", [], vals({ limit: "20" }), false);
    assert.equal(captured.args["limit"], 20);
  });
});

// ===========================================================================
// Formatter coverage — exercises non-json output paths
// ===========================================================================

describe("news formatter paths — non-json output", () => {
  it("latest: formats news list with data items", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "latest", [], vals({}), false);
  });

  it("important: formats with importance column", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "important", [], vals({}), false);
  });

  it("by-coin: formats with coins column", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "by-coin", ["BTC"], vals({}), false);
  });

  it("search: formats search results", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "search", ["SEC"], vals({}), false);
  });

  it("by-sentiment: --sentiment routes via named flag", async () => {
    const { spy, captured } = makeSpy();
    await handleNewsCommand(spy, "by-sentiment", [], vals({ sentiment: "bullish" }), false);
    assert.equal(captured.tool, "news_search");
    assert.equal(captured.args["keyword"], undefined);
    assert.equal(captured.args["sentiment"], "bullish");
    assert.equal(captured.args["sortBy"], "latest");
  });

  it("detail: formats full article", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "detail", ["123"], vals({}), false);
  });

  it("platforms: formats platform list", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "platforms", [], vals({}), false);
  });

  it("coin-sentiment: formats sentiment snapshot", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "coin-sentiment", ["BTC"], vals({}), false);
  });

  it("coin-trend: formats trend table", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "coin-trend", ["BTC"], vals({ points: "24" }), false);
  });

  it("sentiment-rank: formats ranking table", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "sentiment-rank", [], vals({}), false);
  });

  it("latest --json: outputs raw json", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "latest", [], vals({}), true);
  });

  it("detail --json: outputs raw json", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "detail", ["123"], vals({}), true);
  });

  it("platforms --json: outputs raw json", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "platforms", [], vals({}), true);
  });

  it("coin-sentiment --json: outputs raw json", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "coin-sentiment", ["BTC"], vals({}), true);
  });

  it("sentiment-rank --json: outputs raw json", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "sentiment-rank", [], vals({}), true);
  });
});

// ===========================================================================
// Formatter edge cases — sparse/missing data to hit ?? fallback branches
// ===========================================================================

describe("news formatter — sparse data fallbacks", () => {
  function makeSparseSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
    const captured = { tool: "", args: {} as Record<string, unknown> };
    const spy: ToolRunner = async (tool, args) => {
      captured.tool = tool as string;
      captured.args = args as Record<string, unknown>;
      const t = tool as string;
      if (t === "news_get_coin_sentiment") {
        return (args as Record<string, unknown>)["trendPoints"] ? emptyTrend : sparseSentiment;
      }
      if (t === "news_get_sentiment_ranking") return sparseSentiment;
      if (t === "news_get_detail") return emptyDetail;
      return sparseNewsPage;
    };
    return { spy, captured };
  }

  it("latest: handles items with missing fields", async () => {
    const { spy } = makeSparseSpy();
    await handleNewsCommand(spy, "latest", [], vals({}), false);
  });

  it("important: handles items with missing fields", async () => {
    const { spy } = makeSparseSpy();
    await handleNewsCommand(spy, "important", [], vals({}), false);
  });

  it("by-coin: handles items with missing ccyList", async () => {
    const { spy } = makeSparseSpy();
    await handleNewsCommand(spy, "by-coin", ["BTC"], vals({}), false);
  });

  it("detail: handles empty article list", async () => {
    const { spy } = makeSparseSpy();
    await handleNewsCommand(spy, "detail", ["999"], vals({}), false);
  });

  it("coin-sentiment: handles items without sentiment object", async () => {
    const { spy } = makeSparseSpy();
    await handleNewsCommand(spy, "coin-sentiment", ["BTC"], vals({}), false);
  });

  it("coin-trend: handles empty trend data", async () => {
    const { spy } = makeSparseSpy();
    await handleNewsCommand(spy, "coin-trend", ["BTC"], vals({ points: "24" }), false);
  });

  it("sentiment-rank: handles items without sentiment object", async () => {
    const { spy } = makeSparseSpy();
    await handleNewsCommand(spy, "sentiment-rank", [], vals({}), false);
  });

  it("coin-trend: formats with actual trend data", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "coin-trend", ["BTC"], vals({ points: "24" }), false);
  });

  it("coin-trend --json: outputs raw json", async () => {
    const { spy } = makeSpy();
    await handleNewsCommand(spy, "coin-trend", ["BTC"], vals({ points: "24" }), true);
  });
});
