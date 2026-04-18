---
name: okx-sentiment-tracker
description: "Use this skill when the user asks about: 'any crypto news', 'what happened recently', 'latest news', 'any big news today', 'catch me up', 'market update', 'daily briefing', 'morning briefing', 'market summary', 'BTC news', 'ETH news', 'any news on SOL', 'coin updates', 'what's going on with BTC', 'search SEC ETF', 'stablecoin regulation news', 'Bitcoin halving news', 'is BTC bullish or bearish', 'coin sentiment', 'how do people feel about ETH', 'sentiment trend', 'what's hot in crypto', 'trending coins', 'most mentioned coins', 'top bullish coins', 'bearish sentiment', 'social buzz', 'market mood', 'fear and greed', 'news sources', 'which platforms', 'full article', 'read more', or any request for crypto news, market intelligence, sentiment analysis, or social trend data. Requires API credentials. Do NOT use for market prices/candles (use okx-cex-market), placing orders (use okx-cex-trade), or account info (use okx-cex-portfolio)."
license: MIT
metadata:
  author: okx
  version: "1.3.1"
  homepage: "https://www.okx.com"
  agent:
    requires:
      bins: ["okx"]
    install:
      - id: npm
        kind: node
        package: "@okx_ai/okx-trade-cli"
        bins: ["okx"]
        label: "Install okx CLI (npm)"
---

# OKX News & Sentiment

Crypto news aggregation and coin sentiment analysis for OKX. All commands are **read-only** and require **API credentials** (OAuth2.1).

## Capabilities

| User Intent | Command |
|-------------|---------|
| Latest/important news | `okx news latest` |
| Coin-specific news | `okx news by-coin` |
| Keyword news search | `okx news search` |
| Sentiment-filtered news | `okx news by-sentiment` |
| Full article content | `okx news detail` |
| Coin sentiment snapshot | `okx news coin-sentiment` |
| Sentiment trend | `okx news coin-trend` |
| Sentiment ranking | `okx news sentiment-rank` |
| News source list | `okx news platforms` |

## Prerequisites

1. Install `okx` CLI:
   ```bash
   npm install -g @okx_ai/okx-trade-cli
   ```
2. Configure credentials in `~/.okx/config.toml`
3. Verify setup:
   ```bash
   okx news latest --limit 3
   ```

OKX News does not support demo mode. Always use `--profile live` silently — don't mention it unless there's an error.

**On "not available in demo" errors:** the user's current profile is configured with demo/simulated credentials. Tell the user: "News module does not support demo mode. Please switch to a live profile." Guide them to either:
- Use `--profile live` if a live profile exists: `okx --profile live news latest`
- Or create one: `okx config add-profile AK=<key> SK=<secret> PP=<passphrase> name=live`

All commands support `--json` for raw JSON output.

## Quickstart

```bash
# Latest news
okx news latest --limit 5

# Today's important news
okx news important --begin $(date -d 'today 00:00:00' +%s000 2>/dev/null || date -v0H -v0M -v0S +%s000)

# BTC news
okx news by-coin --coins BTC

# Search for SEC ETF news
okx news search --keyword "SEC ETF"

# BTC sentiment overview
okx news coin-sentiment --coins BTC

# Trending coins (hottest right now)
okx news sentiment-rank
```

## Intent → Command Mapping

### Browse News

`latest`, `by-coin`, and `search` default `--importance low`, which returns **all** news (both high and low importance). Pass `--importance high` only when the user explicitly asks for major / breaking / important news. The dedicated `okx news important` command is a shortcut for that case.

| User says | Command |
|-----------|---------|
| "what's been happening in crypto lately" / "catch me up on recent news" | `okx news latest` |
| "any big news today" / "what are the major stories right now" | `okx news important` |
| "what happened in crypto yesterday" | `okx news latest --begin <yesterday_0am> --end <today_0am>` |
| "any news on BTC recently" / "what's going on with BTC" | `okx news by-coin --coins BTC` |
| "any major updates on ETH or SOL" | `okx news by-coin --coins ETH,SOL --importance high` |

### Search News

| User says | Command |
|-----------|---------|
| "any updates on the SEC ETF decision" | `okx news search --keyword "SEC ETF"` |
| "what's the latest on stablecoin regulation" | `okx news search --keyword "stablecoin regulation"` |
| "any news about the Bitcoin halving" | `okx news search --keyword "Bitcoin halving"` |

### Coin Sentiment Analysis

| User says | Command |
|-----------|---------|
| "is the market bullish or bearish on BTC right now" / "how do people feel about BTC" | `okx news coin-sentiment --coins BTC` |
| "compare how people feel about ETH vs SOL" | `okx news coin-sentiment --coins ETH,SOL` |
| "how has BTC sentiment changed over the past 24 hours" | `okx news coin-trend BTC --period 1h --points 24` |
| "show me BTC sentiment over the past week" | `okx news coin-trend BTC --period 24h --points 7` |
| "what's hot in crypto right now" / "which coins are getting the most attention" | `okx news sentiment-rank` |
| "which coins are people most excited about" / "top bullish coins" | `okx news sentiment-rank --sort-by bullish` |
| "which coins have the most negative sentiment" | `okx news sentiment-rank --sort-by bearish` |

### Sentiment Anomaly Detection (multi-coin)

| User says | Workflow |
|-----------|---------|
| "哪些币种情绪变化最大" / "any sentiment anomalies" / "which coins flipped sentiment" | → [Anomaly Detection workflow](references/workflows.md#sentiment-anomaly-detection--multi-coin-scan) |
| "过去一周有什么异动" / "sudden sentiment shifts" / "sentiment reversal" | → [Anomaly Detection workflow](references/workflows.md#sentiment-anomaly-detection--multi-coin-scan) |
| "有没有突然转看涨/看跌的" / "any coins turning bullish/bearish" | → [Anomaly Detection workflow](references/workflows.md#sentiment-anomaly-detection--multi-coin-scan) |

These queries require a **broad-then-deep** approach: first scan all coins for anomalies, then deep-dive with news correlation. Follow the multi-phase workflow in `references/workflows.md` — do NOT just pick a few coins to analyze.

### Source-Filtered News

Use `--platform` to filter by news source directly. Always resolve the exact value from `okx news platforms` — do not guess platform identifiers from the user's wording.

| User says | Command |
|-----------|---------|
| "ChainCatcher 最近报道了什么" / "show me news from ChainCatcher" | `okx news latest --platform <platform_id> --limit 10` |
| "Odaily 有什么新闻" / "news from TechFlowPost" | `okx news latest --platform <platform_id> --limit 10` |
| "吴说区块链最近有什么" / "news from a specific outlet" | `okx news latest --platform <platform_id> --limit 20` |

**Important**: When filtering by source, use a larger `--limit` (10–20) to maximize results, since individual sources typically have fewer articles than the aggregated feed. `--importance low` (the default) is the right setting here; do not narrow to `--importance high`.

**Posting cadence is uneven across platforms.** The API defaults `--begin` to 72 hours ago, which is too narrow for bursty sources and will often return 0 results. If a `--platform`-filtered query returns fewer than ~5 items (or 0), **retry with `--begin` set to 7 days back, then 30 days back** before concluding the source has no data. Resolve candidate platform IDs from `okx news platforms`; do not hardcode assumptions about which platforms are active.

## Cross-Skill Workflows

See [references/workflows.md](references/workflows.md) for multi-step scenarios (market overview, daily briefing, etc.) and full MCP tool → CLI mapping.

## Command Reference

### `okx news latest`
Get the latest crypto news sorted by time.

```bash
okx news latest [--coins BTC,ETH] [--begin <ms>] [--end <ms>]
               [--importance high|low] [--platform <source>]
               [--detail-lvl brief|summary|full] [--lang zh-CN|en-US]
               [--limit 10] [--after <cursor>] [--json]
```

`--importance` default is `low` (returns all news, both high and low). Pass `--importance high` to narrow to breaking / major news only — or use `okx news important`.

---

### `okx news important`
Get high-impact breaking news (reported by multiple sources).

```bash
okx news important [--coins BTC,ETH] [--begin <ms>] [--end <ms>]
                  [--detail-lvl brief|summary|full]
                  [--lang zh-CN|en-US] [--limit 10] [--json]
```

---

### `okx news by-coin`
Get news for specific coins.

```bash
okx news by-coin --coins <BTC,ETH,...>
               [--importance high|low] [--platform <source>]
               [--begin <ms>] [--end <ms>] [--lang zh-CN|en-US]
               [--limit 10] [--json]
```

`--importance` default is `low` (returns all news). Pass `--importance high` only for breaking / major news.

---

### `okx news search`
Full-text keyword search with optional filters.

```bash
okx news search --keyword <text>
               [--coins BTC,ETH] [--importance high|low]
               [--platform <source>]
               [--sentiment bullish|bearish|neutral]
               [--sort-by latest|relevant]
               [--begin <ms>] [--end <ms>] [--lang zh-CN|en-US]
               [--limit 10] [--after <cursor>] [--json]
```

`--importance` default is `low` (returns all news). Pass `--importance high` only for breaking / major news.

---

### `okx news detail`
Get full article content by ID.

```bash
okx news detail <id>                  # news ID from previous result
               [--lang zh-CN|en-US] [--json]
```

---

### `okx news by-sentiment`
Browse news filtered by sentiment (no keyword needed).

```bash
okx news by-sentiment --sentiment <bullish|bearish|neutral>
               [--coins BTC,ETH] [--importance high|low]
               [--sort-by latest|relevant]
               [--begin <ms>] [--end <ms>] [--lang zh-CN|en-US]
               [--limit 10] [--after <cursor>] [--json]
```

`--importance` default is `low` (returns all news). Pass `--importance high` only for breaking / major news.

---

### `okx news platforms`
List available news platforms. Use the returned values with `--platform` on `latest`, `by-coin`, or `search` commands to filter by source.

```bash
okx news platforms [--json]
```

---

### `okx news coin-sentiment`
Get current sentiment snapshot for specific coins.

```bash
okx news coin-sentiment --coins <BTC,ETH,...>
               [--period 1h|4h|24h]  # aggregation granularity, default 24h
               [--json]
```

Returns: `symbol`, `label` (bullish/bearish/neutral/mixed), `bullishRatio`, `bearishRatio`, `mentionCount`.

---

### `okx news coin-trend`
Get time-series sentiment trend for a coin. Note: uses positional arg (not `--coins`).

```bash
okx news coin-trend <coin>            # positional arg, e.g. BTC
               [--period 1h|4h|24h]  # aggregation granularity, default 1h
               [--points 24]          # trend data points, default 24
               [--json]
```

`trendPoints` guide: 1h period → use 24 (last 24h), 4h → use 6, 24h → use 7.

---

### `okx news sentiment-rank`
Get coin ranking by social hotness or sentiment direction.

```bash
okx news sentiment-rank [--period 1h|4h|24h]
               [--sort-by hot|bullish|bearish]  # hot=by mentions (default), bullish, bearish
               [--limit 10]                     # max 50
               [--json]
```

---

## MCP Tool Reference

| Tool | Description |
|------|-------------|
| `news_get_latest` | Latest news sorted by time. Server default `importance=high` (narrow); pass `importance=low` to broaden to all news. |
| `news_get_by_coin` | News for specific coins (`coins` is comma-separated string) |
| `news_search` | Full-text keyword search with filters (optional `sentiment` filter) |
| `news_get_detail` | Full article content by ID |
| `news_get_domains` | List available news source domains |
| `news_get_coin_sentiment` | Sentiment snapshot (no `trendPoints`) or time-series trend (pass `trendPoints`) |
| `news_get_sentiment_ranking` | Coin ranking by hotness or sentiment direction |

## Coin Symbol Normalization

The API only accepts standard uppercase ticker symbols (e.g. `BTC`, `ETH`, `SOL`). Users may refer to coins by full names, abbreviations, slang, or local-language nicknames. Always resolve these to the correct ticker before passing to any command. If the intended coin is ambiguous, ask the user to confirm before querying.

## Empty Results & Web Search Fallback

OKX news data may be sparse for niche coins or highly specific keyword searches. The API default `--begin` window is only 72 hours, which alone accounts for many empty results. When a command returns empty or insufficient results, apply these steps in order — do not skip to web search:

1. **If `--platform` was used** — broaden `--begin` to 7 days back, then 30 days back, before changing anything else. Bursty sources routinely return 0 items in the default window but dozens over a wider range.
2. **If `--importance high` was passed** — drop it (default is already `low` = all news).
3. **Broaden `--begin` / `--end`** for any query (not just `--platform`) when a narrow time window is suspected.
4. **Drop `--coins`** to get general news if the coin-specific query yielded nothing.
5. **Use web search as a supplement** — search the web for `"<topic> news site:coindesk.com OR site:cointelegraph.com OR site:theblock.co"` to gather additional context, then combine with any OKX results into a unified briefing.
6. **Be transparent** — tell the user which results came from OKX API vs. web search so they can judge source credibility.

This fallback is especially valuable for:
- Coins with low coverage (e.g. newly listed tokens)
- Highly specific keyword searches with no matches
- `--platform` queries where the chosen source has uneven posting cadence

## Known Limitations

### Source Coverage

Platform posting cadence varies and changes over time. Some sources publish many articles per day; others post in bursts with quiet stretches in between. A source returning few or zero articles in the **default 72-hour window is not evidence that it is inactive** — it may simply not have posted recently, or its recent posts may have been deduplicated out.

Before concluding a `--platform`-filtered query has no data:

1. Broaden `--begin` to 7 days back, then 30 days back, and retry.
2. If still empty after a 30-day window, report to the user that no recent articles were found for that source and suggest either removing `--platform` (to fall back to the aggregated feed) or web search.

Do not hardcode assumptions about which platforms are active — resolve candidates from `okx news platforms` and let the data speak.

### Historical Search Limitations

`okx news search` and `okx news by-coin` primarily index **recent articles** (typically today and recent days). Searching with `--begin`/`--end` for dates more than ~7 days ago may return empty results even if articles existed at that time. This is an API indexing limitation, not a data absence.

For historical analysis, `okx news coin-trend` (sentiment trend data) is more reliable than article search — it retains time-series data for longer periods.

## Edge Cases

- **Pagination**: use `--after <cursor>` to get next page; cursor comes from `nextCursor` in response
- **Time parameters**: `--begin` / `--end` are Unix epoch milliseconds
- **Coins format**: comma-separated uppercase symbols, e.g. `BTC,ETH,SOL` — never pass full names or aliases
- **coin-trend `--points`**: always pass explicitly; 1h→24, 4h→6, 24h→7
- **Language**: inferred from user's message — `--lang zh-CN` for Chinese, `--lang en-US` for English (default)
- **sentiment-rank `--sort-by`**: `hot`=by mention count (default), `bullish`=most bullish, `bearish`=most bearish
