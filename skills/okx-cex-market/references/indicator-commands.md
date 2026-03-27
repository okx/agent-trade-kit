# Technical Indicator Command Reference

## Command Syntax

```bash
okx market indicator <indicator> <instId> [--bar <bar>] [--params <n1,n2,...>] [--list] [--limit <n>] [--backtest-time <ms>] [--json]
```

> Argument order: `<indicator>` comes **before** `<instId>` — e.g., `okx market indicator rsi BTC-USDT`, not the reverse.

| Param | Required | Default | Description |
|---|---|---|---|
| `indicator` | Yes | - | Indicator name (case-insensitive). See table below. |
| `instId` | Yes | - | Instrument ID (e.g., `BTC-USDT`, `ETH-USDT-SWAP`) |
| `--bar` | No | `1H` | Timeframe. See supported values below. |
| `--params` | No | indicator default | Comma-separated numeric params, no spaces — e.g., `--params 14` or `--params 5,20` |
| `--list` | No | false | Return historical series instead of latest value only |
| `--limit` | No | 10 | Number of records when `--list` is set (max 100) |
| `--backtest-time` | No | - | Unix timestamp in ms; omit for real-time. Used for backtesting point-in-time values. |

### `--bar` Supported Values

`3m` `5m` `15m` `1H` `4H` `12Hutc` `1Dutc` `3Dutc` `1Wutc`

> These differ from candle `--bar` values: daily is `1Dutc` not `1D`, weekly is `1Wutc` not `1W`.

---

## Supported Indicators

| Category | Indicator name | Default `--params` | Notes |
|---|---|---|---|
| **Trend** | `ma` | `5,20,60` | Simple moving averages; one or more periods |
| **Trend** | `ema` | `5,20` | Exponential moving averages |
| **Trend** | `supertrend` | `10,3` | period, multiplier |
| **Trend** | `alphatrend` | — | No params needed |
| **Trend** | `halftrend` | — | No params needed |
| **Trend** | `pmax` | — | No params needed |
| **Momentum** | `rsi` | `14` | Period (default 14) |
| **Momentum** | `macd` | `12,26,9` | fast, slow, signal |
| **Momentum** | `kdj` | `9,3,3` | K, D, J periods |
| **Momentum** | `tdi` | — | Traders Dynamic Index |
| **Momentum** | `qqe` | — | Quantitative Qualitative Estimation |
| **Momentum** | `stoch-rsi` | `14` | Stochastic RSI |
| **Volatility** | `bb` (or `boll`) | `20,2` | period, stddev multiplier — Bollinger Bands |
| **Volatility** | `envelope` | `20,0.1` | period, deviation |
| **Volatility** | `range-filter` | — | No params needed |
| **Volatility** | `waddah` | — | Waddah Attar Explosion |
| **BTC Cycle** | `ahr999` | — | **BTC-USDT only.** <0.45 accumulate · 0.45–1.2 DCA · >1.2 bubble warning |
| **BTC Cycle** | `rainbow` | — | **BTC-USDT only.** BTC Rainbow Chart valuation band |
| **BTC Cycle** | `pi-cycle-top` | — | **BTC-USDT only.** 111-day MA vs 350-day MA×2 cross = historical cycle top |
| **BTC Cycle** | `pi-cycle-bottom` | — | **BTC-USDT only.** Cycle bottom signal |
| **BTC Cycle** | `mayer` | — | **BTC-USDT only.** Price / 200-day MA. >2.4 historically overvalued |

> BTC Cycle indicators only work with `BTC-USDT`; applying to ETH or other assets returns no data or an error.
> `boll` is accepted as an alias for `bb`.

---

## Return Fields

All indicators return `ts` (Unix ms timestamp) plus indicator-specific fields:

| Indicator | Return fields |
|---|---|
| `ma` | `ma5`, `ma20`, `ma60` (based on `--params`) |
| `ema` | `ema5`, `ema20` (based on `--params`) |
| `rsi` | `rsi` |
| `macd` | `dif`, `dea`, `macd` (histogram) |
| `kdj` | `k`, `d`, `j` |
| `bb` / `boll` | `upper`, `middle`, `lower` |
| `supertrend` | `supertrend`, `direction` (`buy`/`sell`) |
| `ahr999` | `ahr999` |
| `rainbow` | `band` (valuation zone label) |
| `pi-cycle-top` | `ma111`, `ma350x2`, `cross` |
| `mayer` | `mayer`, `ma200` |

---

## Examples

```bash
# Latest RSI on 4H
okx market indicator rsi BTC-USDT --bar 4H --params 14

# EMA 5 and EMA 20 trend check on 1H
okx market indicator ema BTC-USDT --bar 1H --params 5,20
# ts: 3/20/2026, 10:00 AM | ema5: 87420.5 | ema20: 86910.2

# MACD on daily
okx market indicator macd BTC-USDT --bar 1Dutc

# Bollinger Bands on 1H
okx market indicator bb ETH-USDT --bar 1H
# upper: 2050 | middle: 2000 | lower: 1950

# SuperTrend direction signal
okx market indicator supertrend BTC-USDT --bar 4H
# supertrend: 84200 | direction: buy

# Historical RSI series (last 20 values)
okx market indicator rsi ETH-USDT --bar 1H --params 14 --list --limit 20
# → table: ts, rsi (20 rows, newest first)

# BTC macro cycle check
okx market indicator ahr999 BTC-USDT
# ahr999: 0.87  (DCA zone: 0.45–1.2)

okx market indicator rainbow BTC-USDT
# band: "HODL"

okx market indicator mayer BTC-USDT
# mayer: 1.31 | ma200: 72500

okx market indicator pi-cycle-top BTC-USDT
# ma111: 88000 | ma350x2: 104000 | cross: false

# Backtesting point-in-time value
okx market indicator rsi BTC-USDT --bar 4H --params 14 --backtest-time 1711008000000
```

---

## BTC Cycle Interpretation Guide

| Indicator | Zone / Value | Interpretation |
|---|---|---|
| `ahr999` | < 0.45 | Accumulate zone |
| `ahr999` | 0.45 – 1.2 | DCA zone |
| `ahr999` | > 1.2 | Bubble warning |
| `mayer` | > 2.4 | Historically overvalued |
| `pi-cycle-top` | `cross: true` | Historical cycle top signal |
| `rainbow` | band label | See OKX Rainbow Chart legend for zone |
