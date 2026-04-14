# news

Provides crypto news querying, sentiment analysis, and full-text search for retail traders and AI agents monitoring market events.

**PM**: Jasmine

## Business Context

Target users: retail traders and AI agents (unified underlying API; field design must accommodate both). Business priority: first feature module of News MCP; V1 delivers core news query capability. Expected call volume: medium frequency; AI Agent scenarios may poll news_get_latest every 30 seconds as a near-real-time monitoring approximation (native WebSocket push planned for V2 to reduce polling). Dependencies: no hard dependencies; pairs with the market module for a complete 'price + news' view. Risk control: all tools are Read-only with no fund operations. Site support: Global (EEA/US pending confirmation). API permissions: OpenAPI Read via OAuth 2.1, supporting OK-ACCESS-KEY/SIGN/TIMESTAMP headers; rate limits pending confirmation. Launch scope: CLI + MCP + Skill (all three surfaces in sync).

## Tools

| Name | R/W | Description |
|---|---|---|
| news_get_latest | R | Latest news sorted by time; pass `importance=high` for breaking news only |
| news_get_by_coin | R | News for specific coins (comma-separated) |
| news_search | R | Full-text keyword search with optional filters (coins/importance/sentiment) |
| news_get_detail | R | Full article content by news ID |
| news_get_domains | R | List available news source domains |
| news_get_coin_sentiment | R | Sentiment snapshot or time-series trend (pass `trendPoints` for trend mode) |
| news_get_sentiment_ranking | R | Coin ranking by hotness or sentiment direction |

## Token 预算评估

预估 ~1400 tokens (7 tools × ~200)

## 典型 Workflow

1. Scenario A — Agent generates daily market report: call news_get_latest (importance=high) to get today's top stories, call news_get_sentiment_ranking to summarize market mood, call news_get_coin_sentiment for major coin snapshots, compose report.
2. Scenario B — User searches for a specific event (e.g. 'SEC ETF ruling'): call news_search with relevant keywords and optional coin/sentiment filters, present results list, call news_get_detail on selected article for full content.
3. Scenario C — User asks about a specific coin: call news_get_by_coin (coins=BTC) to retrieve recent news, call news_get_coin_sentiment (coins=BTC) for bullish/bearish snapshot.
