import type { ToolSpec } from "./types.js";
import { asRecord, compactObject, normalizeResponse, readNumber, readString } from "./helpers.js";
import { publicRateLimit } from "./common.js";

const NEWS_SEARCH = "/api/v5/orbit/news-search";
const NEWS_DETAIL = "/api/v5/orbit/news-detail";
const NEWS_DOMAINS = "/api/v5/orbit/news-platform";
const SENTIMENT_QUERY = "/api/v5/orbit/currency-sentiment-query";
const SENTIMENT_RANKING = "/api/v5/orbit/currency-sentiment-ranking";

const NEWS_LANGUAGE = ["en_US", "zh_CN"] as const;

function langHeader(lang: string | undefined): Record<string, string> | undefined {
  if (lang === "zh_CN" || lang === "en_US") return { "Accept-Language": lang };
  return undefined;
}

const NEWS_DETAIL_LVL = ["brief", "summary", "full"] as const;
const NEWS_IMPORTANCE = ["high", "medium", "low"] as const;
const NEWS_SENTIMENT = ["bullish", "bearish", "neutral"] as const;
const NEWS_SORT = ["latest", "relevant"] as const;
const SENTIMENT_PERIOD = ["1h", "4h", "24h"] as const;

// Shared parameter descriptions
const D_COINS_NEWS = "Comma-separated uppercase ticker symbols (e.g. \"BTC,ETH\"). Normalize names/aliases to standard tickers.";
const D_COINS_SENTIMENT = "Comma-separated uppercase ticker symbols, max 20 (e.g. \"BTC,ETH\"). Normalize names/aliases to standard tickers.";
const D_LANGUAGE = "Content language: zh_CN or en_US. Infer from user's message. No server default.";
const D_BEGIN = "Start time, Unix epoch milliseconds. Parse relative time if given (e.g. 'yesterday', 'last 7 days').";
const D_END = "End time, Unix epoch milliseconds. Parse relative time if given. Omit for no upper bound.";
const D_IMPORTANCE = "Importance filter: high (server default), medium, low. Omit unless user wants broader coverage.";
const D_LIMIT = "Number of results (default 10, max 50).";

export function registerNewsTools(): ToolSpec[] {
  return [
    // -----------------------------------------------------------------------
    // News browsing tools
    // -----------------------------------------------------------------------

    {
      name: "news_get_latest",
      module: "news",
      description: "Get crypto news sorted by time. Omitting importance still returns only high-importance news (server default). Pass importance='medium' or 'low' explicitly to broaden results. Use when user asks 'what happened recently', 'latest news', 'any big news today', or wants to browse without a keyword.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          coins: { type: "string", description: D_COINS_NEWS + " Optional." },
          importance: { type: "string", enum: [...NEWS_IMPORTANCE], description: D_IMPORTANCE },
          begin: { type: "number", description: D_BEGIN },
          end: { type: "number", description: D_END },
          language: { type: "string", enum: [...NEWS_LANGUAGE], description: D_LANGUAGE },
          detailLvl: {
            type: "string",
            enum: [...NEWS_DETAIL_LVL],
            description: "Content level: summary (AI summary, default), full (original text), brief (title only).",
          },
          limit: { type: "number", description: D_LIMIT },
          after: { type: "string", description: "Pagination cursor from previous response nextCursor." },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          NEWS_SEARCH,
          compactObject({
            sortBy: "latest",
            importance: readString(args, "importance"),
            ccyList: readString(args, "coins"),
            begin: readNumber(args, "begin"),
            end: readNumber(args, "end"),
            detailLvl: readString(args, "detailLvl"),
            limit: readNumber(args, "limit") ?? 10,
            cursor: readString(args, "after"),
          }),
          publicRateLimit("news_get_latest", 20),
          langHeader(readString(args, "language")),
        );
        return normalizeResponse(response);
      },
    },

    {
      name: "news_get_by_coin",
      module: "news",
      description: "Get news for specific coins or tokens. Use when user mentions a coin: 'BTC news', 'any SOL updates'. Supports multiple coins (comma-separated).",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          coins: { type: "string", description: D_COINS_NEWS + " Required." },
          importance: { type: "string", enum: [...NEWS_IMPORTANCE], description: D_IMPORTANCE },
          begin: { type: "number", description: D_BEGIN },
          end: { type: "number", description: D_END },
          language: { type: "string", enum: [...NEWS_LANGUAGE], description: D_LANGUAGE },
          detailLvl: { type: "string", enum: [...NEWS_DETAIL_LVL] },
          limit: { type: "number", description: D_LIMIT },
        },
        required: ["coins"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const coins = readString(args, "coins");
        if (!coins) {
          throw new Error(`Missing required parameter "coins".`);
        }
        const response = await context.client.privateGet(
          NEWS_SEARCH,
          compactObject({
            sortBy: "latest",
            ccyList: coins,
            importance: readString(args, "importance"),
            begin: readNumber(args, "begin"),
            end: readNumber(args, "end"),
            detailLvl: readString(args, "detailLvl"),
            limit: readNumber(args, "limit") ?? 10,
          }),
          publicRateLimit("news_get_by_coin", 20),
          langHeader(readString(args, "language")),
        );
        return normalizeResponse(response);
      },
    },

    {
      name: "news_search",
      module: "news",
      description: "Search crypto news by keyword with optional filters. Use when user provides specific search terms: 'SEC ETF news', 'stablecoin regulation', 'Bitcoin halving'. For coin-only queries prefer news_get_by_coin.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description: "Search keyword(s) extracted from user query (topic/entity). Multiple words are AND-combined. Omit to browse by filters only.",
          },
          coins: { type: "string", description: D_COINS_NEWS + " Optional." },
          importance: { type: "string", enum: [...NEWS_IMPORTANCE], description: D_IMPORTANCE },
          sentiment: {
            type: "string",
            enum: [...NEWS_SENTIMENT],
            description: "Filter by sentiment if mentioned alongside the keyword.",
          },
          sortBy: {
            type: "string",
            enum: [...NEWS_SORT],
            description: "Sort order: relevant (by relevance, default for keyword search), latest (by time).",
          },
          begin: { type: "number", description: D_BEGIN },
          end: { type: "number", description: D_END },
          language: { type: "string", enum: [...NEWS_LANGUAGE], description: D_LANGUAGE },
          detailLvl: { type: "string", enum: [...NEWS_DETAIL_LVL] },
          limit: { type: "number", description: D_LIMIT },
          after: { type: "string", description: "Pagination cursor from previous response nextCursor." },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          NEWS_SEARCH,
          compactObject({
            keyword: readString(args, "keyword") || undefined,
            sortBy: readString(args, "sortBy") ?? "relevant",
            importance: readString(args, "importance"),
            ccyList: readString(args, "coins"),
            sentiment: readString(args, "sentiment"),
            begin: readNumber(args, "begin"),
            end: readNumber(args, "end"),
            detailLvl: readString(args, "detailLvl"),
            limit: readNumber(args, "limit") ?? 10,
            cursor: readString(args, "after"),
          }),
          publicRateLimit("news_search", 20),
          langHeader(readString(args, "language")),
        );
        return normalizeResponse(response);
      },
    },

    {
      name: "news_get_detail",
      module: "news",
      description: "Get full article content by news ID (returns title + summary + full original text). Use when user says 'show full article', 'read more', or provides a specific news ID from a previous result.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "News article ID from a previous news_get_latest / news_get_by_coin / news_search result. Required.",
          },
          language: { type: "string", enum: [...NEWS_LANGUAGE], description: D_LANGUAGE },
        },
        required: ["id"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const id = readString(args, "id");
        if (!id) {
          throw new Error(`Missing required parameter "id".`);
        }
        const response = await context.client.privateGet(
          NEWS_DETAIL,
          { id },
          publicRateLimit("news_get_detail", 20),
          langHeader(readString(args, "language")),
        );
        return normalizeResponse(response);
      },
    },

    {
      name: "news_get_domains",
      module: "news",
      description: "List available news source domains (e.g. coindesk, cointelegraph). Use when user asks what news sources are available or which platforms are covered.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
      handler: async (_rawArgs, context) => {
        const response = await context.client.privateGet(
          NEWS_DOMAINS,
          {},
          publicRateLimit("news_get_domains", 20),
        );
        return normalizeResponse(response);
      },
    },

    // -----------------------------------------------------------------------
    // Token sentiment tools
    // -----------------------------------------------------------------------

    {
      name: "news_get_coin_sentiment",
      module: "news",
      description: "Get sentiment snapshot or time-series trend for coins. Returns bullish/bearish ratios and mention counts. Pass trendPoints for trend data (1h→24 points, 4h→6, 24h→7). Use when user asks about coin sentiment, sentiment trend, or how bullish/bearish a coin is.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          coins: { type: "string", description: D_COINS_SENTIMENT + " Required." },
          period: {
            type: "string",
            enum: [...SENTIMENT_PERIOD],
            description: "Aggregation granularity: 1h, 4h, 24h. Snapshot default: 24h. Trend default: 1h.",
          },
          trendPoints: {
            type: "number",
            description: "Trend data points. Pass for time-series trend; omit for snapshot. Guide: 1h→24, 4h→6, 24h→7.",
          },
        },
        required: ["coins"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const coins = readString(args, "coins");
        if (!coins) {
          throw new Error(`Missing required parameter "coins".`);
        }
        const trendPoints = readNumber(args, "trendPoints");
        const inclTrend = trendPoints !== undefined;
        const response = await context.client.privateGet(
          SENTIMENT_QUERY,
          compactObject({
            ccy: coins,
            period: readString(args, "period") ?? (inclTrend ? "1h" : "24h"),
            ...(inclTrend ? { inclTrend: true, limit: trendPoints } : {}),
          }),
          publicRateLimit("news_get_coin_sentiment", 20),
        );
        return normalizeResponse(response);
      },
    },

    {
      name: "news_get_sentiment_ranking",
      module: "news",
      description: "Get coin ranking by social hotness or sentiment direction. Use when user asks which coins are trending, most bullish/bearish coins. Sort by hot (mention count), bullish, or bearish.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: [...SENTIMENT_PERIOD],
            description: "Aggregation granularity: 1h, 4h, 24h (default).",
          },
          sortBy: {
            type: "string",
            enum: ["hot", "bullish", "bearish"],
            description: "Sort: hot=by mentions (default), bullish=most bullish, bearish=most bearish.",
          },
          limit: { type: "number", description: D_LIMIT },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const response = await context.client.privateGet(
          SENTIMENT_RANKING,
          compactObject({
            period: readString(args, "period") ?? "24h",
            sortBy: readString(args, "sortBy") ?? "hot",
            limit: readNumber(args, "limit") ?? 10,
          }),
          publicRateLimit("news_get_sentiment_ranking", 20),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
