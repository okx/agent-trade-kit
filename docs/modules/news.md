# news

Provides crypto news querying, sentiment analysis, and full-text search for retail traders and AI agents monitoring market events.

**PM**: Jasmine

## Business Context

Target users: retail traders and AI agents (unified underlying API; field design must accommodate both). Business priority: first feature module of News MCP; V1 delivers core news query capability. Expected call volume: medium frequency; AI Agent scenarios may poll news_get_latest every 30 seconds as a near-real-time monitoring approximation (native WebSocket push planned for V2 to reduce polling). Dependencies: no hard dependencies; pairs with the market module for a complete 'price + news' view. Risk control: all tools are Read-only with no fund operations. Site support: Global (EEA/US pending confirmation). API permissions: OpenAPI Read via OAuth 2.1, supporting OK-ACCESS-KEY/SIGN/TIMESTAMP headers; rate limits pending confirmation. Launch scope: CLI + MCP + Skill (all three surfaces in sync).

## Tools

| Name | R/W | Description |
|---|---|---|
| news_get_latest | R | Return latest news in reverse chronological order, filterable by coins/time/importance |
| news_get_important | R | Return high-impact news reported by multiple sources (source_count ≥ 2) |
| news_get_by_coin | R | Filter news by token symbol, supports multiple coins simultaneously |
| news_get_by_sentiment | R | Filter news by sentiment direction (bullish/bearish/neutral) |
| news_search | R | Full-text keyword search with combined filters for coins/importance/sentiment |
| news_get_detail | R | Retrieve full article content (title + body) by news ID |
| news_get_coin_sentiment | R | Snapshot of current bullish/bearish sentiment ratio for a given token |
| news_get_coin_trend | R | Time-series sentiment trend for a token |
| news_get_sentiment_ranking | R | Token hotness and sentiment leaderboard across all tracked coins |
| news_list_domains | R | List all supported news source domains |

## Token 预算评估

预估 ~2000 tokens (10 tools × ~200)

## 典型 Workflow

1. Scenario A — User asks 'Why did BTC rise recently?': call news_get_by_coin (coin=BTC) to retrieve recent BTC news, then call news_get_by_sentiment (bullish) to surface positive drivers, optionally call news_get_detail for full article body.
2. Scenario B — Agent generates daily market report: call news_get_latest to get today's top stories, call news_get_important to highlight high-impact items, call news_get_sentiment_ranking to summarize market mood, compose report.
3. Scenario C — User searches for a specific event (e.g. 'SEC ETF ruling'): call news_search with relevant keywords and optional coin/sentiment filters, present results list, call news_get_detail on selected article for full content.
