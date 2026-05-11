import type { ToolSpec, ToolArgs, ToolContext } from "./types.js";
import { asRecord, compactObject, normalizeResponse, readNumber, readString } from "./helpers.js";
import { publicRateLimit } from "./common.js";
import { ConfigError } from "../utils/errors.js";

const NEWS_SEARCH = "/api/v5/orbit/news-search";
const NEWS_DETAIL = "/api/v5/orbit/news-detail";
const NEWS_DOMAINS = "/api/v5/orbit/news-platform";
const SENTIMENT_QUERY = "/api/v5/orbit/currency-sentiment-query";
const SENTIMENT_RANKING = "/api/v5/orbit/currency-sentiment-ranking";
const ECONOMIC_CALENDAR = "/api/v5/public/economic-calendar";

const CALENDAR_REGIONS = [
  "afghanistan", "albania", "algeria", "andorra", "angola", "antigua_and_barbuda",
  "argentina", "armenia", "aruba", "australia", "austria", "azerbaijan", "bahamas",
  "bahrain", "bangladesh", "barbados", "belarus", "belgium", "belize", "benin",
  "bermuda", "bhutan", "bolivia", "bosnia_and_herzegovina", "botswana", "brazil",
  "brunei", "bulgaria", "burkina_faso", "burundi", "cambodia", "cameroon", "canada",
  "cape_verde", "cayman_islands", "central_african_republic", "chad", "chile", "china",
  "colombia", "comoros", "congo", "costa_rica", "croatia", "cuba", "cyprus",
  "czech_republic", "denmark", "djibouti", "dominica", "dominican_republic",
  "east_timor", "ecuador", "egypt", "el_salvador", "equatorial_guinea", "eritrea",
  "estonia", "ethiopia", "euro_area", "european_union", "faroe_islands", "fiji",
  "finland", "france", "g20", "g7", "gabon", "gambia", "georgia", "germany", "ghana",
  "greece", "greenland", "grenada", "guatemala", "guinea", "guinea_bissau", "guyana",
  "haiti", "honduras", "hong_kong", "hungary", "iceland", "imf", "india", "indonesia",
  "iran", "iraq", "ireland", "isle_of_man", "israel", "italy", "ivory_coast", "jamaica",
  "japan", "jordan", "kazakhstan", "kenya", "kiribati", "kosovo", "kuwait", "kyrgyzstan",
  "laos", "latvia", "lebanon", "lesotho", "liberia", "libya", "liechtenstein",
  "lithuania", "luxembourg", "macau", "macedonia", "madagascar", "malawi", "malaysia",
  "maldives", "mali", "malta", "mauritania", "mauritius", "mexico", "micronesia",
  "moldova", "monaco", "mongolia", "montenegro", "morocco", "mozambique", "myanmar",
  "namibia", "nepal", "netherlands", "new_caledonia", "new_zealand", "nicaragua", "niger",
  "nigeria", "north_korea", "northern_mariana_islands", "norway", "oman", "opec",
  "pakistan", "palau", "palestine", "panama", "papua_new_guinea", "paraguay", "peru",
  "philippines", "poland", "portugal", "puerto_rico", "qatar", "republic_of_the_congo",
  "romania", "russia", "rwanda", "samoa", "san_marino", "sao_tome_and_principe",
  "saudi_arabia", "senegal", "serbia", "seychelles", "sierra_leone", "singapore",
  "slovakia", "slovenia", "solomon_islands", "somalia", "south_africa", "south_korea",
  "south_sudan", "spain", "sri_lanka", "st_kitts_and_nevis", "st_lucia", "sudan",
  "suriname", "swaziland", "sweden", "switzerland", "syria", "taiwan", "tajikistan",
  "tanzania", "thailand", "togo", "tonga", "trinidad_and_tobago", "tunisia", "turkey",
  "turkmenistan", "uganda", "ukraine", "united_arab_emirates", "united_kingdom",
  "united_states", "uruguay", "uzbekistan", "vanuatu", "venezuela", "vietnam", "world",
  "yemen", "zambia", "zimbabwe",
] as const;

const NEWS_LANGUAGE = ["en-US", "zh-CN"] as const;

/** Map language input to Accept-Language header. Update branches here when NEWS_LANGUAGE grows. */
function langHeader(lang: string | undefined): Record<string, string> {
  if (lang === "zh-CN" || lang === "zh_CN") return { "Accept-Language": "zh-CN" };
  return { "Accept-Language": "en-US" };
}

const NEWS_DETAIL_LVL = ["brief", "summary", "full"] as const;
const NEWS_IMPORTANCE = ["high", "low"] as const;
const NEWS_SENTIMENT = ["bullish", "bearish", "neutral"] as const;
const NEWS_SORT = ["latest", "relevant"] as const;
const SENTIMENT_PERIOD = ["1h", "4h", "24h"] as const;

// Shared parameter descriptions
const D_COINS_NEWS = "Comma-separated uppercase ticker symbols (e.g. \"BTC,ETH\"). Normalize names/aliases to standard tickers.";
const D_COINS_SENTIMENT = "Comma-separated uppercase ticker symbols, max 20 (e.g. \"BTC,ETH\"). Normalize names/aliases to standard tickers.";
const D_LANGUAGE = "Content language: zh-CN or en-US. Infer from user's message. No server default.";
const D_BEGIN = "Start time, Unix epoch milliseconds. API defaults to 72 hours ago when omitted. Pass explicitly for older topics (e.g. 'last 30 days'). Max range: 180 days. Parse relative time if given.";
const D_END = "End time, Unix epoch milliseconds. Parse relative time if given. Omit for no upper bound.";
const D_IMPORTANCE = "Importance filter: 'low' returns all news (both low and high importance); 'high' narrows to major/breaking news only. Omitted → server default (high-only). Default to 'low' for broad browsing; pass 'high' only when the user explicitly asks for major news.";
const D_PLATFORM = "Filter by news source. Use values from news_get_domains (e.g. blockbeats, odaily_flash). Omit for all sources.";
const D_LIMIT = "Number of results (default 10, max 50).";

export function registerNewsTools(): ToolSpec[] {
  const tools: ToolSpec[] = [
    // -----------------------------------------------------------------------
    // News browsing tools
    // -----------------------------------------------------------------------

    {
      name: "news_get_latest",
      module: "news",
      description: "Get crypto news sorted by time. For broad browsing ('what happened recently', 'latest news', 'any big news today'), pass importance='low' to include both high and low importance. Server default (when importance omitted) returns only high-importance news. For coin-specific news, use news_get_by_coin instead.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          coins: { type: "string", description: D_COINS_NEWS + " Optional." },
          importance: { type: "string", enum: [...NEWS_IMPORTANCE], description: D_IMPORTANCE },
          platform: { type: "string", description: D_PLATFORM },
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
            platform: readString(args, "platform"),
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
      description: "Get news for specific coins or tokens. Use when user mentions a coin: 'BTC news', 'any SOL updates'. Supports multiple coins (comma-separated). For general browsing without a coin filter, use news_get_latest.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          coins: { type: "string", description: D_COINS_NEWS + " Required." },
          importance: { type: "string", enum: [...NEWS_IMPORTANCE], description: D_IMPORTANCE },
          platform: { type: "string", description: D_PLATFORM },
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
            platform: readString(args, "platform"),
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
      description: "Search crypto news by keyword with optional filters. Use when user provides specific search terms: 'SEC ETF news', 'stablecoin regulation'. Keyword is optional — pass sentiment alone to browse by sentiment direction. For coin-only queries prefer news_get_by_coin.",
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
          platform: { type: "string", description: D_PLATFORM },
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
            platform: readString(args, "platform"),
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
      description: "Get sentiment snapshot or time-series trend for coins. Returns bullish/bearish ratios and mention counts. Pass trendPoints for trend data (1h→24 points, 4h→6, 24h→7). Use when user asks about coin sentiment, sentiment trend, or how bullish/bearish a coin is. For ranking all coins by sentiment, use news_get_sentiment_ranking instead.",
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
      description: "Get coin ranking by social hotness or sentiment direction. Use when user asks which coins are trending, most bullish/bearish coins. Sort by hot (mention count), bullish, or bearish. For sentiment data on a specific coin, use news_get_coin_sentiment instead.",
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

    // -----------------------------------------------------------------------
    // Economic calendar
    // -----------------------------------------------------------------------

    {
      name: "news_list_calendar_regions",
      module: "news",
      description: "List all valid region values for the economic calendar. Returns a string array of snake_case region codes. Call this when economic-calendar returns empty results to verify the region value, or to help the user pick a valid region. Do NOT use to list news source platforms — use news_get_domains instead.",
      isWrite: false,
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: async () => ({ data: CALENDAR_REGIONS }),
    },

    {
      name: "news_get_economic_calendar",
      module: "news",
      description: "Get macro-economic calendar data (GDP, CPI, NFP, interest rate decisions, PMI, etc.). Returns scheduled and released economic events with forecast, previous, and actual values. Use when user asks about economic calendar, macro data, or specific indicators like NFP/CPI/GDP/FOMC. Do NOT use for news articles or sentiment — use news_get_latest or news_search instead.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          region: { type: "string", description: "Country/region filter in snake_case (e.g. united_states, euro_area, japan). Invalid values return empty results silently. If empty results, call news_list_calendar_regions to verify the value." },
          importance: { type: "string", enum: ["1", "2", "3"], description: "Importance level: 1=low, 2=medium, 3=high. Omit for all levels." },
          before: { type: "string", description: "Lower time bound — returns events NEWER than this timestamp (reversed semantics). Pair with 'after' for future-event windows. Unix ms." },
          after: { type: "string", description: "Upper time bound — returns events OLDER than this timestamp (reversed semantics). Default=now (returns past events). Pair with 'before' for a bounded window. Unix ms." },
          limit: { type: "number", minimum: 1, maximum: 100, description: "Number of results (default 100, max 100)." },
        },
        required: [],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const rawLimit = readNumber(args, "limit");
        const limit = rawLimit !== undefined ? Math.min(rawLimit, 100) : undefined;
        const response = await context.client.privateGet(
          ECONOMIC_CALENDAR,
          compactObject({
            region: readString(args, "region"),
            importance: readString(args, "importance"),
            before: readString(args, "before"),
            after: readString(args, "after"),
            limit,
          }),
          publicRateLimit("news_get_economic_calendar", 0.2),
        );
        return normalizeResponse(response);
      },
    },
  ];

  // Pure info tools (no API call / no user data) — exclude from demo guard
  const exempt = new Set(["news_get_domains", "news_list_calendar_regions"]);
  const exempted: ToolSpec[] = [];
  const guarded: ToolSpec[] = [];
  for (const t of tools) {
    if (exempt.has(t.name)) exempted.push(t);
    else guarded.push(t);
  }
  return [...guarded.map(withNewsDemoGuard), ...exempted];
}

const NEWS_DEMO_MESSAGE = "News features are not available in demo/simulated trading mode.";
const NEWS_DEMO_SUGGESTION = "Switch to a live profile to use News features.";

function withNewsDemoGuard(tool: ToolSpec): ToolSpec {
  const originalHandler = tool.handler;
  return {
    ...tool,
    handler: async (args: ToolArgs, context: ToolContext): Promise<unknown> => {
      if (context.config.demo) {
        throw new ConfigError(NEWS_DEMO_MESSAGE, NEWS_DEMO_SUGGESTION);
      }
      return originalHandler(args, context);
    },
  };
}
