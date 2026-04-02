---
name: okx-cex-news
description: "Crypto news, market intelligence, and coin sentiment analysis. Use when the user asks about recent news, market events, price movements, coin sentiment, trending topics, or bullish/bearish signals — even without naming this skill. Examples: what happened recently, any big news today, most bullish coins, sentiment ranking."
license: MIT
metadata:
  author: okx
  version: "1.0.0"
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
| Latest/important news | `okx news` |
| Coin-specific news | `okx news by-coin` |
| Keyword news search | `okx news search` |
| Full article content | `okx news detail` |
| Coin sentiment snapshot | `okx news coin-sentiment` |
| Sentiment trend | `okx news coin-trend` |
| Sentiment ranking | `okx news sentiment-rank` |
| News source list | `okx news domains` |

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

| User says | Command |
|-----------|---------|
| "what's been happening in crypto lately" / "catch me up on recent news" | `okx news latest` |
| "any big news today" / "what are the major stories right now" | `okx news important` |
| "what happened in crypto yesterday" | `okx news latest --begin <yesterday_0am> --end <today_0am>` |
| "any news on BTC recently" / "what's going on with BTC" | `okx news by-coin BTC` |
| "any major updates on ETH or SOL" | `okx news by-coin ETH,SOL --importance high` |

### Search News

| User says | Command |
|-----------|---------|
| "any updates on the SEC ETF decision" | `okx news search "SEC ETF"` |
| "what's the latest on stablecoin regulation" | `okx news search "stablecoin regulation"` |
| "any news about the Bitcoin halving" | `okx news search "Bitcoin halving"` |

### Coin Sentiment Analysis

| User says | Command |
|-----------|---------|
| "is the market bullish or bearish on BTC right now" / "how do people feel about BTC" | `okx news coin-sentiment BTC` |
| "compare how people feel about ETH vs SOL" | `okx news coin-sentiment ETH,SOL` |
| "how has BTC sentiment changed over the past 24 hours" | `okx news coin-trend BTC --period 1h --points 24` |
| "show me BTC sentiment over the past week" | `okx news coin-trend BTC --period 24h --points 7` |
| "what's hot in crypto right now" / "which coins are getting the most attention" | `okx news sentiment-rank` |
| "which coins are people most excited about" / "top bullish coins" | `okx news sentiment-rank --sort-by bullish` |
| "which coins have the most negative sentiment" | `okx news sentiment-rank --sort-by bearish` |

## Cross-Skill Workflows

See [references/workflows.md](references/workflows.md) for multi-step scenarios (market overview, daily briefing, etc.) and full MCP tool → CLI mapping.

## Command Reference

### `okx news latest`
Get the latest crypto news sorted by time.

```bash
okx news latest [--coins BTC,ETH] [--begin <ms>] [--end <ms>]
               [--importance high|medium]
               [--detail-lvl brief|summary|full] [--lang zh_CN|en_US]
               [--limit 10] [--after <cursor>] [--json]
```

---

### `okx news important`
Get high-impact breaking news (reported by multiple sources).

```bash
okx news important [--coins BTC,ETH] [--begin <ms>] [--end <ms>]
                  [--detail-lvl brief|summary|full]
                  [--lang zh_CN|en_US] [--limit 10] [--json]
```

---

### `okx news by-coin`
Get news for specific coins.

```bash
okx news by-coin <coins>              # e.g. BTC or BTC,ETH,SOL
               [--importance high|medium]
               [--begin <ms>] [--end <ms>] [--lang zh_CN|en_US]
               [--limit 10] [--json]
```

---

### `okx news search`
Full-text keyword search with optional filters.

```bash
okx news search <keyword>
               [--coins BTC,ETH] [--importance high|medium]
               [--sentiment bullish|bearish|neutral]
               [--sort-by latest|relevant]
               [--begin <ms>] [--end <ms>] [--lang zh_CN|en_US]
               [--limit 10] [--after <cursor>] [--json]
```

---

### `okx news detail`
Get full article content by ID.

```bash
okx news detail <id>                  # news ID from previous result
               [--json]
```

---

### `okx news domains`
List available news source domains.

```bash
okx news domains [--json]
```

---

### `okx news coin-sentiment`
Get current sentiment snapshot for specific coins.

```bash
okx news coin-sentiment <coins>       # e.g. BTC or BTC,ETH
               [--period 1h|4h|24h]  # aggregation granularity, default 24h
               [--json]
```

Returns: `symbol`, `label` (bullish/bearish/neutral/mixed), `bullishRatio`, `bearishRatio`, `mentionCount`.

---

### `okx news coin-trend`
Get time-series sentiment trend for a coin.

```bash
okx news coin-trend <coin>            # single coin recommended, e.g. BTC
               [--period 1h|4h|24h]  # aggregation granularity, default 1h
               [--points 24]          # number of trend points (required)
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
| `news_get_latest` | Latest news sorted by time; pass `importance=high` for breaking news only |
| `news_get_by_coin` | News for specific coins (`coins` is comma-separated string) |
| `news_search` | Full-text keyword search with filters (optional `sentiment` filter) |
| `news_get_detail` | Full article content by ID |
| `news_get_domains` | List available news source domains |
| `news_get_coin_sentiment` | Sentiment snapshot (no `trendPoints`) or time-series trend (pass `trendPoints`) |
| `news_get_sentiment_ranking` | Coin ranking by hotness or sentiment direction |

## Coin Symbol Normalization

The API only accepts standard uppercase ticker symbols (e.g. `BTC`, `ETH`, `SOL`). Users may refer to coins by full names, abbreviations, slang, or local-language nicknames. Always resolve these to the correct ticker before passing to any command. If the intended coin is ambiguous, ask the user to confirm before querying.

## Edge Cases

- **Pagination**: use `--after <cursor>` to get next page; cursor comes from `nextCursor` in response
- **Time parameters**: `--begin` / `--end` are Unix epoch milliseconds
- **Coins format**: comma-separated uppercase symbols, e.g. `BTC,ETH,SOL` — never pass full names or aliases
- **coin-trend `--points`**: always pass explicitly; 1h→24, 4h→6, 24h→7
- **Language**: inferred from user's message — `--lang zh_CN` for Chinese, `--lang en_US` for English (default)
- **sentiment-rank `--sort-by`**: `hot`=by mention count (default), `bullish`=most bullish, `bearish`=most bearish
