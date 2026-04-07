# Technical Indicator Command Reference

## Discover Supported Indicators

```bash
okx market indicator list          # print all supported indicator names and descriptions
okx market indicator list --json   # machine-readable format
```

Use this before calling `market_get_indicator` (MCP) or `okx market indicator` (CLI) to confirm a name is supported. The API returns empty data silently for unknown indicator names.

---

## Command Syntax

```bash
okx market indicator <indicator> <instId> [--bar <bar>] [--params <n1,n2,...>] [--list] [--limit <n>] [--backtest-time <ms>] [--json]
```

> Argument order: `<indicator>` comes **before** `<instId>` — e.g., `okx market indicator rsi BTC-USDT`, not the reverse.

| Param | Required | Default | Description |
|---|---|---|---|
| `indicator` | Yes | - | Indicator name (case-insensitive). Run `okx market indicator list` to see all. |
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

Run `okx market indicator list` for the authoritative full list. Common indicators by category:

| Category | Indicator name | Default `--params` | Notes |
|---|---|---|---|
| **Moving Average** | `ma` | `5,20,60` | Simple moving averages; one or more periods |
| **Moving Average** | `ema` | `5,20` | Exponential moving averages |
| **Moving Average** | `wma` | — | Weighted Moving Average |
| **Moving Average** | `dema` | — | Double Exponential Moving Average |
| **Moving Average** | `tema` | — | Triple Exponential Moving Average |
| **Moving Average** | `zlema` | — | Zero-Lag Exponential Moving Average |
| **Moving Average** | `hma` | — | Hull Moving Average |
| **Moving Average** | `kama` | — | Kaufman Adaptive Moving Average |
| **Trend** | `macd` | `12,26,9` | fast, slow, signal |
| **Trend** | `sar` | — | Parabolic SAR |
| **Trend** | `adx` | — | Average Directional Index |
| **Trend** | `aroon` | — | Aroon Indicator |
| **Trend** | `cci` | — | Commodity Channel Index |
| **Trend** | `dpo` | — | Detrended Price Oscillator |
| **Trend** | `supertrend` | `10,3` | period, multiplier |
| **Trend** | `alphatrend` | — | No params needed |
| **Trend** | `halftrend` | — | No params needed |
| **Trend** | `envelope` | `20,0.1` | period, deviation |
| **Trend** | `pmax` | — | No params needed |
| **Momentum** | `rsi` | `14` | Period (default 14) |
| **Momentum** | `stoch-rsi` | `14` | Stochastic RSI |
| **Momentum** | `stoch` | — | Stochastic Oscillator |
| **Momentum** | `kdj` | `9,3,3` | K, D, J periods |
| **Momentum** | `roc` | — | Rate of Change |
| **Momentum** | `mom` | — | Momentum |
| **Momentum** | `ppo` | — | Price Percentage Oscillator |
| **Momentum** | `trix` | — | TRIX |
| **Momentum** | `ao` | — | Awesome Oscillator |
| **Momentum** | `uo` | — | Ultimate Oscillator |
| **Momentum** | `wr` | — | Williams %R |
| **Momentum** | `tdi` | — | Traders Dynamic Index |
| **Momentum** | `qqe` | — | QQE Mod |
| **Volatility** | `bb` (or `boll`) | `20,2` | period, stddev multiplier — Bollinger Bands |
| **Volatility** | `bbwidth` | — | Bollinger Band Width |
| **Volatility** | `bbpct` | — | Bollinger Band %B |
| **Volatility** | `atr` | — | Average True Range |
| **Volatility** | `keltner` | — | Keltner Channel |
| **Volatility** | `donchian` | — | Donchian Channel |
| **Volatility** | `hv` | — | Historical Volatility |
| **Volatility** | `stddev` | — | Standard Deviation |
| **Volatility** | `range-filter` | — | Range Filter |
| **Volatility** | `waddah` | — | Waddah Attar Explosion |
| **Volume** | `obv` | — | On-Balance Volume |
| **Volume** | `vwap` | — | Volume Weighted Average Price |
| **Volume** | `mvwap` | — | Moving VWAP |
| **Volume** | `cmf` | — | Chaikin Money Flow |
| **Volume** | `mfi` | — | Money Flow Index |
| **Volume** | `ad` | — | Accumulation/Distribution |
| **Statistical** | `lr` | — | Linear Regression |
| **Statistical** | `slope` | — | Linear Regression Slope |
| **Statistical** | `angle` | — | Linear Regression Angle |
| **Statistical** | `variance` | — | Variance |
| **Statistical** | `meandev` | — | Mean Deviation |
| **Statistical** | `sigma` | — | Sigma |
| **Statistical** | `stderr` | — | Standard Error |
| **Custom** | `kdj` | `9,3,3` | KDJ Stochastic Oscillator |
| **Custom** | `supertrend` | `10,3` | Supertrend |
| **Ichimoku** | `tenkan` | — | Tenkan-sen (Conversion Line) |
| **Ichimoku** | `kijun` | — | Kijun-sen (Base Line) |
| **Ichimoku** | `senkoa` | — | Senkou Span A (Leading Span A) |
| **Ichimoku** | `senkob` | — | Senkou Span B (Leading Span B) |
| **Ichimoku** | `chikou` | — | Chikou Span (Lagging Span) |
| **Candlestick** | `doji` | — | Doji pattern |
| **Candlestick** | `bull-engulf` | — | Bullish Engulfing |
| **Candlestick** | `bear-engulf` | — | Bearish Engulfing |
| **Candlestick** | `bull-harami` | — | Bullish Harami |
| **Candlestick** | `bear-harami` | — | Bearish Harami |
| **Candlestick** | `bull-harami-cross` | — | Bullish Harami Cross |
| **Candlestick** | `bear-harami-cross` | — | Bearish Harami Cross |
| **Candlestick** | `three-soldiers` | — | Three White Soldiers |
| **Candlestick** | `three-crows` | — | Three Black Crows |
| **Candlestick** | `hanging-man` | — | Hanging Man |
| **Candlestick** | `inverted-hammer` | — | Inverted Hammer |
| **Candlestick** | `shooting-star` | — | Shooting Star |
| **BTC On-Chain** | `ahr999` | — | **BTC-USDT only.** <0.45 accumulate · 0.45–1.2 DCA · >1.2 bubble warning |
| **BTC On-Chain** | `rainbow` | — | **BTC-USDT only.** BTC Rainbow Chart valuation band |
| **Other** | `fisher` | — | Fisher Transform |
| **Other** | `nvi-pvi` | — | Negative/Positive Volume Index (returns both) |
| **Other** | `cho` | — | Chande Momentum Oscillator |
| **Other** | `tr` | — | True Range |
| **Other** | `tp` | — | Typical Price |
| **Other** | `mp` | — | Median Price |
| **Other** | `top-long-short` | — | Top Trader Long/Short Ratio (timeframe-independent) |

> `boll` is accepted as an alias for `bb`.
> BTC On-Chain indicators only work with `BTC-USDT`; applying to other assets returns no data.

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

---

## Examples

```bash
# Discover all supported indicator names first
okx market indicator list

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

# BTC on-chain cycle check
okx market indicator ahr999 BTC-USDT
# ahr999: 0.87  (DCA zone: 0.45–1.2)

okx market indicator rainbow BTC-USDT
# band: "HODL"

# Backtesting point-in-time value
okx market indicator rsi BTC-USDT --bar 4H --params 14 --backtest-time 1711008000000
```

---

## BTC On-Chain Interpretation Guide

| Indicator | Zone / Value | Interpretation |
|---|---|---|
| `ahr999` | < 0.45 | Accumulate zone |
| `ahr999` | 0.45 – 1.2 | DCA zone |
| `ahr999` | > 1.2 | Bubble warning |
| `rainbow` | band label | See OKX Rainbow Chart legend for zone |
