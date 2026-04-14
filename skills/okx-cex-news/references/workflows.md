# Cross-Skill Workflows & MCP Tool Reference

## Cross-Skill Workflows

All news and sentiment commands are read-only.

---

### BTC Market Overview

```
okx news coin-sentiment BTC                    → sentiment snapshot (bullish/bearish ratio)
okx news by-coin BTC --limit 5                 → recent news headlines
okx-cex-market: okx market ticker BTC-USDT     → current price (optional companion)
```

---

### Market Briefing — daily briefing

Call the following **in parallel**, then aggregate:

```
okx news important --limit 10                  → high-impact breaking news
okx news sentiment-rank                        → trending coins by mention count
okx news coin-sentiment BTC,ETH                → major coin sentiment snapshot
```

Aggregate into a structured report:
1. **Major Events** — top 3 high-impact items, each with time, source, 2-sentence summary
2. **Trending News** — grouped by category (Regulation / Projects / Market / DeFi)
3. **Sentiment Overview** — top coins by mention, bullish/bearish ratio
4. **Worth Watching** — 2–3 LLM-distilled takeaways

> De-duplicate overlapping items before presenting (same event may appear in both important and latest feeds).

---

### Sentiment Trend Analysis

```
okx news coin-sentiment BTC --period 24h         → current snapshot
okx news coin-trend BTC --period 1h --points 24  → hourly trend (last 24 hours)
okx news coin-trend BTC --period 24h --points 7  → daily trend (last 7 days)
```

---

### Keyword-Driven Research

```
okx news search "SEC ETF" --sort-by relevant   → most relevant articles
okx news search "SEC ETF" --sort-by latest     → most recent articles
okx news detail <id>                           → full article text for a specific result
```

---

## MCP Tool Reference

| CLI subcommand | MCP tool name | Notes |
|---|---|---|
| `news latest` | `news_get_latest` | Pass `importance=high` to get breaking news only |
| `news important` | `news_get_latest` | CLI pre-fills `importance=high`; no separate MCP tool |
| `news by-coin` | `news_get_by_coin` | `coins` param is a comma-separated string |
| `news search` | `news_search` | |
| `news detail` | `news_get_detail` | |
| `news domains` | `news_get_domains` | |
| `news coin-sentiment` | `news_get_coin_sentiment` | Snapshot mode (no `trendPoints`) |
| `news coin-trend` | `news_get_coin_sentiment` | CLI passes `trendPoints`; same MCP tool, trend mode |
| `news sentiment-rank` | `news_get_sentiment_ranking` | |
