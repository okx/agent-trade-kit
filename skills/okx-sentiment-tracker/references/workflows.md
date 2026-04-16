# Cross-Skill Workflows & MCP Tool Reference

## Cross-Skill Workflows

All news and sentiment commands are read-only.

---

### BTC Market Overview

Combine news sentiment with market data for a complete picture:

```
# News & Sentiment (this skill)
okx news coin-sentiment --coins BTC            → sentiment snapshot (bullish/bearish ratio)
okx news by-coin --coins BTC --limit 5         → recent news headlines

# Market Data (okx-cex-market skill)
okx market ticker BTC-USDT                     → current price, 24h change, volume
okx market candles BTC-USDT --bar 1D --limit 7 → 7-day price chart data
okx market funding-rate BTC-USDT-SWAP          → perpetual funding rate (long/short bias)
```

If `by-coin` returns fewer than 3 results, supplement with:

```
web search: "BTC Bitcoin news today site:coindesk.com OR site:cointelegraph.com"
```

---

### Market Briefing — daily briefing

**Always scope news to today** using `--begin` with today's midnight timestamp:

```bash
# macOS
BEGIN=$(date -v0H -v0M -v0S +%s000)
# Linux
BEGIN=$(date -d 'today 00:00:00' +%s000)
```

Call the following **in parallel**, then aggregate:

```
# News & Sentiment (this skill)
okx news important --begin $BEGIN --limit 10   → today's high-impact breaking news
okx news sentiment-rank                        → trending coins by mention count
okx news coin-sentiment --coins BTC,ETH        → major coin sentiment snapshot
okx news coin-trend BTC --period 1h --points 24  → BTC intraday sentiment movement
okx news coin-trend ETH --period 1h --points 24  → ETH intraday sentiment movement

# Market Data (okx-cex-market skill) — enrich briefing with price context
okx market ticker BTC-USDT                     → BTC price, 24h change %
okx market ticker ETH-USDT                     → ETH price, 24h change %

# Derivatives Data (okx-cex-market skill) — critical for complete market picture
okx market funding-rate BTC-USDT-SWAP          → funding rate (long/short bias)
okx market funding-rate ETH-USDT-SWAP          → ETH funding rate
okx market open-interest --instType SWAP --instId BTC-USDT-SWAP  → BTC open interest
okx market open-interest --instType SWAP --instId ETH-USDT-SWAP  → ETH open interest
okx market oi-change --instType SWAP --limit 10  → top 10 OI change (which contracts are seeing position buildup)
```

The derivatives data (funding rate, open interest, OI change) provides insights that news sentiment alone cannot capture — it reveals how traders are actually positioning, not just what they're saying. Always include this section in daily briefings.

If any command returns empty or sparse results, supplement with web search:

```
web search: "crypto news today site:coindesk.com OR site:theblock.co"
```

Aggregate into a structured report with this format:

```
## Daily Crypto Briefing — {date}

### Major Events
| Time | Source | Event | Impact |
|------|--------|-------|--------|
| 09:15 | CoinDesk | SEC approves spot ETH ETF | Bullish for ETH |
| ... | ... | ... | ... |

### Trending Coins
| Rank | Coin | Mentions | Sentiment | Δ24h (via `market ticker`) |
|------|------|----------|-----------|----------------------------|
| 1 | BTC | 1,234 | Bullish (68%) | +5% |
| ... | ... | ... | ... | ... |

### Sentiment Overview
- **BTC**: Bullish 68% / Bearish 32% — driven by ETF inflows
- **ETH**: Bullish 55% / Bearish 45% — mixed on L2 competition

### Derivatives Positioning
| Metric | BTC-USDT-SWAP | ETH-USDT-SWAP |
|--------|---------------|---------------|
| Funding Rate | +0.01% (slightly long) | -0.005% (neutral) |
| Open Interest | $12.3B | $5.1B |

**OI Change Top Movers** (SWAP, 24h):
| Rank | Contract | OI Change | Direction |
|------|----------|-----------|-----------|
| 1 | ... | +15% | Longs building |
| ... | ... | ... | ... |

### Worth Watching
1. {takeaway 1}
2. {takeaway 2}
```

> De-duplicate overlapping items before presenting (same event may appear in both important and latest feeds).
> If combining OKX API data with web search results, mark the source of each item.
> Cross-reference sentiment vs. derivatives positioning — divergences (e.g. bullish sentiment but negative funding) are especially noteworthy.

---

### Sentiment Trend Analysis

```
okx news coin-sentiment --coins BTC --period 24h  → current snapshot
okx news coin-trend BTC --period 1h --points 24   → hourly trend (last 24 hours)
okx news coin-trend BTC --period 24h --points 7   → daily trend (last 7 days)
```

Present sentiment results in this format:

```
## BTC Sentiment Analysis

**Current Snapshot** (24h)
- Sentiment: Bullish 🟢 (68% bullish / 32% bearish)
- Mentions: 1,234 in the last 24h

**Hourly Trend** (last 24h)
| Time  | Bullish | Bearish | Mentions |
|-------|---------|---------|----------|
| 08:00 | 72%     | 28%     | 89       |
| 07:00 | 65%     | 35%     | 67       |
| ...   | ...     | ...     | ...      |

**Key Observations**
- Bullish sentiment peaked at {time} ({ratio}%), coinciding with {event}
- Mention volume spiked at {time}, likely driven by {catalyst}
```

---

### Sentiment Anomaly Detection — multi-coin scan

When the user asks about sentiment shifts, anomalies, or "which coins changed the most", use this broad-then-deep workflow. The goal is to **maximize coin coverage first**, then deep-dive into the most interesting anomalies with news correlation.

**Phase 1 — Broad scan** (call in parallel):

```
okx news sentiment-rank --sort-by hot --limit 20      → top 20 coins by mention volume
okx news sentiment-rank --sort-by bullish --limit 10   → most bullish coins
okx news sentiment-rank --sort-by bearish --limit 10   → most bearish coins
```

Merge the three lists into a unique set of candidate coins (typically 15-25 coins after dedup).

**Phase 2 — Trend pull for all candidates** (call in parallel, batch by 5):

```
okx news coin-trend <coin> --period 24h --points 7    → 7-day daily trend for each coin
```

Pull trend data for **every** candidate, not just a few. This is the key step — without broad trend data you cannot rank anomalies accurately.

**Phase 3 — Identify anomalies**

For each coin, compute the change in bullishRatio and bearishRatio between the first and last data points (or the peak-to-trough swing). Flag coins where:
- bullishRatio or bearishRatio changed by ≥ 20 percentage points
- mentionCount spiked ≥ 3x compared to the period average
- sentiment label flipped (e.g. bullish → bearish)

Rank anomalies by the magnitude of change. Present the top anomalies in a summary table first, then deep-dive into each.

**Phase 4 — News correlation for each anomaly** (call in parallel):

```
okx news by-coin --coins <anomaly_coin> --limit 5     → recent news for that coin
```

For each flagged anomaly, search for related news to explain the sentiment shift. If `by-coin` returns insufficient results, fall back to:

```
okx news search --keyword "<coin name>" --limit 5
```

Or web search as a last resort.

**Phase 5 — Report**

```
## Sentiment Anomaly Report — {date range}

> Data: OKX News Sentiment API | Period: {start} ~ {end}

### Summary — Top Anomalies

| Rank | Coin | Signal Type | Change | Key Catalyst |
|------|------|-------------|--------|-------------|
| 1 | DOT | Bullish→Bearish | bullish -87pp | Polkadot Bridge exploit |
| 2 | TAO | Bullish→Bearish | bullish -28pp | [event from news] |
| 3 | DOGE | V-shaped reversal | bullish +30pp (single day) | [event from news] |
| ... | ... | ... | ... | ... |

### Anomaly 1: {COIN} — {signal type}

**Trend Data**
| Date | Bullish | Bearish | Mentions | Change |
|------|---------|---------|----------|--------|
| ... | ... | ... | ... | ... |

**Related News**
- {date}: {headline} — {source}
- {date}: {headline} — {source}

**Analysis**: {why the sentiment shifted, tied to specific news events}

### Anomaly 2: {COIN} — ...
(repeat for each anomaly)

### Stable Majors
BTC, ETH, and other high-mention coins that showed no significant anomaly during this period:
| Coin | Bullish Δ | Bearish Δ | Current Sentiment |
|------|-----------|-----------|-------------------|
| BTC | +2pp | +2pp | Neutral-bullish |
| ETH | +4pp | +3pp | Neutral |
```

The report should cover **both** anomalous and stable coins so the user gets a complete picture. The summary table at the top enables quick scanning; the deep-dive sections provide the evidence.

---

### Keyword-Driven Research

```
okx news search --keyword "SEC ETF" --sort-by relevant   → most relevant articles
okx news search --keyword "SEC ETF" --sort-by latest     → most recent articles
okx news detail <id>                                     → full article text for a specific result
```

If search returns no results, try:
1. Simplify keyword (e.g. "SEC ETF" → "ETF")
2. Remove time filters to broaden range
3. Fall back to web search: `"SEC crypto ETF site:coindesk.com OR site:theblock.co"`

#### Combination Keyword Search (multi-word queries)

Multi-word searches like `"SEC ETF"` often return empty because the API matches the exact phrase against limited index. Use this progressive broadening strategy:

```
# Step 1: Try exact phrase
okx news search --keyword "SEC ETF" --sort-by relevant --limit 10

# Step 2: If empty — expand time window to 7 days
okx news search --keyword "SEC ETF" --begin <7_days_ago_ms> --sort-by relevant --limit 10

# Step 3: If still empty — split into individual terms, search each
okx news search --keyword "SEC" --sort-by latest --limit 10
okx news search --keyword "ETF" --sort-by latest --limit 10
# Then cross-reference: articles that appear in both results (by ID) are the strongest matches.
# Articles in only one result still provide useful context.

# Step 4: If all above are sparse — web search fallback
web search: "SEC crypto ETF site:coindesk.com OR site:theblock.co OR site:cointelegraph.com"
```

Always report how many results came from each step so the user understands coverage.

---

### Multi-Dimensional Coin Analysis (coin + sentiment + importance + time)

No single CLI command supports all four filters simultaneously. Use this multi-command strategy to achieve equivalent results:

```
# Step 1: Get coin news within the time window
okx news by-coin --coins ETH --begin <start_ms> --end <end_ms> --limit 20

# Step 2: Get sentiment-filtered news for the same coin
okx news by-sentiment --sentiment bullish --coins ETH --importance high --begin <start_ms> --end <end_ms> --limit 20

# Step 3: Cross-reference
# Articles that appear in BOTH results satisfy all four dimensions (coin + sentiment + importance + time).
# Match by article ID — IDs from step 1 ∩ step 2 are the target set.
```

If either step returns sparse results, relax filters progressively:
1. Drop `--importance` (keep coin + sentiment + time)
2. Widen `--begin`/`--end` range
3. Supplement with `okx news coin-sentiment --coins ETH` for aggregate sentiment context

Present the cross-referenced results first, then mention any additional context from relaxed queries.

---

## MCP Tool Reference

| CLI subcommand | MCP tool name | Notes |
|---|---|---|
| `news latest` | `news_get_latest` | Pass `importance=high` to get breaking news only |
| `news important` | `news_get_latest` | CLI pre-fills `importance=high`; no separate MCP tool |
| `news by-coin` | `news_get_by_coin` | `coins` param is a comma-separated string |
| `news search` | `news_search` | |
| `news detail` | `news_get_detail` | |
| `news platforms` | `news_get_domains` | CLI subcommand renamed from `domains` to `platforms` for consistency with `--platform` param |
| `news coin-sentiment` | `news_get_coin_sentiment` | Snapshot mode (no `trendPoints`) |
| `news coin-trend` | `news_get_coin_sentiment` | CLI passes `trendPoints`; same MCP tool, trend mode |
| `news sentiment-rank` | `news_get_sentiment_ranking` | |
