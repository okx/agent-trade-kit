---
name: okx-cex-market
description: "Use this skill when the user asks for: price of any asset, ticker, order book, market depth, candles, OHLCV, funding rate, open interest, mark price, index price, recent trades, price limit, instrument list, stock tokens, metals prices (gold, silver, XAU, XAG), commodities prices (oil, crude, natural gas, OIL), forex rates (EUR/USD, GBP/USD, EURUSDT), bond instruments, non-crypto assets, tradeable instruments by category, or any technical indicator query (RSI, MACD, EMA, MA, Bollinger Bands, KDJ, SuperTrend, AHR999, BTC rainbow, and 70+ more indicators). All commands are read-only and do NOT require API credentials. Do NOT use for account balance/positions (use okx-cex-portfolio), placing/cancelling orders (use okx-cex-trade), or grid/DCA bots (use okx-cex-bot)."
license: MIT
metadata:
  author: okx
  version: "1.3.0"
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

# OKX CEX Market Data CLI

> **Compliance notice**: This skill provides raw market data only. No strategy, recommendation, or optimization logic is embedded. All indicator outputs are objective numerical values; interpretation and trading decisions remain solely with the user.

Public market data for OKX: prices, order books, candles, funding rates, open interest, instrument info, and technical indicators. All commands are **read-only** and require **no API credentials**.

**Skill routing**
- Market data / indicators → `okx-cex-market` (this skill)
- Account balance / positions → `okx-cex-portfolio`
- Place / cancel orders → `okx-cex-trade`
- Grid / DCA bots → `okx-cex-bot`

## Preflight

Before running any command, follow [`../_shared/preflight.md`](../_shared/preflight.md).
Use `metadata.version` from this file's frontmatter as the reference for Step 2.

## Install

```bash
npm install -g @okx_ai/okx-trade-cli
okx market ticker BTC-USDT   # verify
```

Market data commands return the same public data regardless of demo/live mode — no API credentials required. If the user's profile has `demo=true` set and they want live data context, they can use `--live` to confirm they are in live mode (it has no effect on public market data but clarifies environment). Always inform the user which environment is active (demo or live) when it is relevant to their query. No confirmation needed before running any market command. Add `--json` to any command for raw OKX API v5 response. Add `--env` to wrap the output as `{"env", "profile", "data"}`.

---

## Command Index

| # | Command | Description |
|---|---|---|
| 1 | `okx market ticker <instId>` | Last price, 24h high/low/vol/change% |
| 2 | `okx market tickers <instType>` | All tickers for SPOT / SWAP / FUTURES / OPTION |
| 3 | `okx market instruments --instType <type> [--instId <id>]` | List instruments (instId, ctVal, lotSz, minSz, tickSz, state) |
| 4 | `okx market orderbook <instId> [--sz <n>]` | Order book asks/bids (default top 5 per side, max 400) |
| 5 | `okx market candles <instId> [--bar <bar>] [--limit <n>] [--after <ts>] [--before <ts>]` | OHLCV candles (default `--bar 1m`); auto-routes to historical endpoint for data back to 2021; `--after` paginates back in time, `--before` paginates forward |
| 6 | `okx market index-candles <instId> [--bar <bar>] [--limit <n>] [--history]` | Index OHLCV (use `BTC-USD` not `BTC-USDT`) |
| 7 | `okx market funding-rate <instId> [--history] [--limit <n>]` | Current or historical funding rate (SWAP only) |
| 8 | `okx market trades <instId> [--limit <n>]` | Recent public trades |
| 9 | `okx market mark-price --instType <type> [--instId <id>]` | Mark price (SWAP / FUTURES / OPTION) |
| 10 | `okx market index-ticker [--instId <id>] [--quoteCcy <ccy>]` | Index price (e.g., BTC-USD) |
| 11 | `okx market price-limit <instId>` | Upper/lower price limits (SWAP / FUTURES only) |
| 12 | `okx market open-interest --instType <type> [--instId <id>]` | Open interest in contracts and base currency |
| 13 | `okx market instruments-by-category --instCategory <3\|4\|5\|6\|7>` | Discover instruments by asset category: 3=Stock tokens (AAPL/TSLA), 4=Metals (gold/silver), 5=Commodities (oil/gas), 6=Forex (EUR/USD), 7=Bonds |
| 13† | `okx market stock-tokens` | **Deprecated** — use `instruments-by-category --instCategory 3` instead |
| 15 | `okx market indicator list` | List all supported indicator names and descriptions |
| 16 | `okx market indicator <indicator> <instId> [--bar] [--params] [--list] [--limit] [--backtest-time]` | Technical indicator values |

---

## Operation Flow

### Step 1 — Identify data type and load reference

| User intent | Reference to load |
|---|---|
| Price, candles, order book, recent trades | `{baseDir}/references/price-data-commands.md` |
| Technical indicators (RSI, MACD, EMA, BB, KDJ, SuperTrend, AHR999, Rainbow, etc.) | `{baseDir}/references/indicator-commands.md` |
| Funding rate, mark price, open interest, price limit, index ticker | `{baseDir}/references/derivatives-commands.md` |
| List instruments, discover stock tokens, metals/commodities/forex/bonds, find option instIds | `{baseDir}/references/instrument-commands.md` |
| Multi-step or cross-skill workflows; MCP tool names | `{baseDir}/references/workflows.md` |

### Step 2 — Run commands immediately

All market data commands are read-only — no confirmation needed.

### Step 3 — No writes, no verification needed

All commands in this skill are read-only.

---

## Edge Cases

- **instId format**: SPOT `BTC-USDT` · SWAP `BTC-USDT-SWAP` · FUTURES `BTC-USDT-250328` · OPTION `BTC-USD-250328-95000-C` · Index `BTC-USD` · Stock token `TSLA-USDT-SWAP` · Metals/Commodities/Forex/Bonds: use `instruments-by-category` to discover valid instIds first
- **OPTION listing**: `instruments --instType OPTION` requires `--uly BTC-USD`; if unknown, run `open-interest --instType OPTION` first to discover active instIds
- **funding-rate / price-limit**: SWAP only · mark-price: SWAP / FUTURES / OPTION only
- **candles `--bar`**: uppercase — `1H` not `1h`; use `--after <ts>` to paginate back into historical data (back to 2021); index-candles supports `--history` for extended history
- **⚠️ Large historical range**: before fetching with `--after`/`--before`, estimate candle count = `time_range_ms / bar_interval_ms`. If estimate > 500, tell the user the estimated count and ask for confirmation before proceeding. This prevents silently filling the context window.
- **indicator `--bar`**: uses `1Dutc` not `1D`, `1Wutc` not `1W` — different from candle bar values
- **indicator arg order**: indicator name before instId — `okx market indicator rsi BTC-USDT`
- **indicator `--params`**: comma-separated, no spaces — `--params 5,20`
- **BTC-only indicators**: `ahr999`, `rainbow` — BTC-USDT only
- **Unknown indicator name**: the API returns empty data silently — run `okx market indicator list` to confirm a name is supported before use
- **Stock token hours**: US stocks trade Mon–Fri ~09:30–16:00 ET; verify live price before acting
- **No data returned**: instrument may be delisted — verify with `okx market instruments`
- **`boll`** is an alias for `bb`

## Global Notes

- No API key required for any command in this skill
- Rate limit: 20 req / 2 s per IP
- Candle data is sorted newest-first
- `vol24h` is in base currency (e.g., BTC for BTC-USDT)
- `--profile` and `--demo`/`--live` do not affect market data results via CLI (public endpoints); they only determine the active trading environment context
- When calling market MCP tools directly, pass `demo: true` to explicitly query simulated trading market data; the default is always live market data regardless of server demo mode
