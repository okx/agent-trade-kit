# Technical Indicator Command Reference

## Discover Supported Indicators

```bash
okx market indicator list          # print all supported indicator names and descriptions
okx market indicator list --json   # machine-readable format
```

Use this before calling `market_get_indicator` (MCP) or `okx market indicator` (CLI) to confirm a name is supported. A name that is not on the list is rejected locally with an `Unknown indicator "x". Did you mean: ...` error.

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
| `--params` | No | indicator default | Omit to use the indicator's default (shown in the CLI output as `params: ... (default)`). If given it must be **complete** — comma-separated integers, no spaces, written once (see "`--params` contract" below). Too few or too many values is an error. |
| `--list` | No | false | Return historical series instead of latest value only |
| `--limit` | No | 10 | Number of records when `--list` is set (max 100) |
| `--backtest-time` | No | - | Unix timestamp in ms; omit for real-time. Used for backtesting point-in-time values. |

### `--bar` Supported Values

`3m` `5m` `15m` `1H` `4H` `12Hutc` `1Dutc` `3Dutc` `1Wutc`

> These differ from candle `--bar` values: daily is `1Dutc` not `1D`, weekly is `1Wutc` not `1W`.

### `--params` contract

Two ways to call an indicator:

1. **Omit `--params`** — the indicator's default is used (the CLI prints `params: <values> (default)`).
2. **Pass `--params`** — it must be **complete**. A fixed-length indicator needs exactly the full set (too few *or* too many is an error); `ma`, `ema`, `rsi`, `wr`, `wma`, `dema`, `tema`, `zlema`, `hma`, `kama` take one or more periods. Every value is an integer: periods are 2–365; the `bb` multiplier and the `supertrend` factor are 1–9. Order matters.

| Indicator | Params (in order) | Default |
|---|---|---|
| `macd` | fast, slow, signal | `12,26,9` |
| `kdj` | n, kSmooth, dSmooth | `9,3,3` |
| `bb` (or `boll`) | period, multiplier (1–9) | `20,2` |
| `supertrend` | **factor (1–9), atrPeriod** | `3,10` |
| `stoch-rsi` | rsi, stoch, k, d | `14,14,3,3` |
| `stoch` | kPeriod, dPeriod | `14,3` |
| `ppo` | short, long, signal | `12,26,9` |
| `uo` | fast, medium, slow | `7,14,28` |
| `bbwidth`, `bbpct` | period, multiplier | `20,2` |
| `keltner` | emaPeriod, atrPeriod, multiplier×10 | `20,10,20` |
| `mvwap` | vwapPeriod, mvwapPeriod | `14,14` |
| `ma` | one or more periods | `5,20,60` |
| `ema` | one or more periods | `5,20` |
| `rsi`, `wr`, `wma`, `dema`, `tema`, `zlema`, `hma`, `kama` | one or more periods | `14` |
| `adx`, `atr`, `mfi` | period | `14` |
| `cci`, `dpo`, `cmf`, `donchian`, `hv`, `stddev` | period | `20` |
| `roc` | period | `12` |
| `mom` | period | `10` |
| `aroon` | period | `25` |
| `trix` | period | `18` |

Notes on the less obvious positions (from the backend contract):

- `supertrend`: the **first** value is the ATR multiplier (`factor`, integer 1–9) and the second is the ATR period — the reverse of the usual "period, multiplier" order.
- `bb`: the multiplier is an **integer** 1–9 (no decimals such as 2.5). `bbwidth` / `bbpct` validate their multiplier like a period (2–365) instead.
- `keltner`: the third value is the channel multiplier **×10** (`20` means 2.0).
- `kdj`: the second and third values are accepted but the backend uses fixed smoothing, so they do not change the result.
- All values are integers; the backend cannot take decimals in `--params`.

Examples: `--params 12,26,9` (macd), `--params 3,10` (supertrend: factor 3, ATR period 10), `--params 5,20,60` (ma). `--params 12,26` for macd fails with `macd requires 3 params (fast,slow,signal), got 2`.

Every other indicator (including `envelope`, `alphatrend`, `halftrend`, `pmax`, `obv`, `vwap`, `sar`, `ad` and the candlestick patterns) has no defaults or validation in the CLI: omit `--params` to let the backend use its own default, or pass values that you know the backend accepts.

If explicit `--params` produce no values on any timeframe the command fails (the period may exceed the available candles).

---

## Supported Indicators

Run `okx market indicator list` for the authoritative full list. Common indicators by category:

| Category | Indicator name | Default `--params` | Notes |
|---|---|---|---|
| **Moving Average** | `ma` | `5,20,60` | Simple moving averages; one or more periods |
| **Moving Average** | `ema` | `5,20` | Exponential moving averages |
| **Moving Average** | `wma` | `14` | Weighted Moving Average |
| **Moving Average** | `dema` | `14` | Double Exponential Moving Average |
| **Moving Average** | `tema` | `14` | Triple Exponential Moving Average |
| **Moving Average** | `zlema` | `14` | Zero-Lag Exponential Moving Average |
| **Moving Average** | `hma` | `14` | Hull Moving Average |
| **Moving Average** | `kama` | `14` | Kaufman Adaptive Moving Average |
| **Trend** | `macd` | `12,26,9` | fast, slow, signal |
| **Trend** | `sar` | — | Parabolic SAR |
| **Trend** | `adx` | `14` | Average Directional Index |
| **Trend** | `aroon` | `25` | Aroon Indicator |
| **Trend** | `cci` | `20` | Commodity Channel Index |
| **Trend** | `dpo` | `20` | Detrended Price Oscillator |
| **Trend** | `supertrend` | `3,10` | factor, atrPeriod |
| **Trend** | `alphatrend` | — | Optional params; no CLI default or validation |
| **Trend** | `halftrend` | — | Optional params; no CLI default or validation |
| **Trend** | `envelope` | — | Envelope — no CLI default or validation |
| **Trend** | `pmax` | — | Optional params; no CLI default or validation |
| **Momentum** | `rsi` | `14` | Period (default 14) |
| **Momentum** | `stoch-rsi` | `14,14,3,3` | rsi, stoch, k, d — Stochastic RSI |
| **Momentum** | `stoch` | `14,3` | Stochastic Oscillator |
| **Momentum** | `kdj` | `9,3,3` | n, kSmooth, dSmooth |
| **Momentum** | `roc` | `12` | Rate of Change |
| **Momentum** | `mom` | `10` | Momentum |
| **Momentum** | `ppo` | `12,26,9` | Price Percentage Oscillator |
| **Momentum** | `trix` | `18` | TRIX |
| **Momentum** | `ao` | — | Awesome Oscillator |
| **Momentum** | `uo` | `7,14,28` | Ultimate Oscillator |
| **Momentum** | `wr` | `14` | Williams %R |
| **Momentum** | `tdi` | — | Traders Dynamic Index |
| **Momentum** | `qqe` | — | QQE Mod |
| **Volatility** | `bb` (or `boll`) | `20,2` | period, multiplier — Bollinger Bands |
| **Volatility** | `bbwidth` | `20,2` | Bollinger Band Width |
| **Volatility** | `bbpct` | `20,2` | Bollinger Band %B |
| **Volatility** | `atr` | `14` | Average True Range |
| **Volatility** | `keltner` | `20,10,20` | Keltner Channel |
| **Volatility** | `donchian` | `20` | Donchian Channel |
| **Volatility** | `hv` | `20` | Historical Volatility |
| **Volatility** | `stddev` | `20` | Standard Deviation |
| **Volatility** | `range-filter` | — | Range Filter |
| **Volatility** | `waddah` | — | Waddah Attar Explosion |
| **Volume** | `obv` | — | On-Balance Volume |
| **Volume** | `vwap` | — | Volume Weighted Average Price |
| **Volume** | `mvwap` | `14,14` | Moving VWAP |
| **Volume** | `cmf` | `20` | Chaikin Money Flow |
| **Volume** | `mfi` | `14` | Money Flow Index |
| **Volume** | `ad` | — | Accumulation/Distribution |
| **Statistical** | `lr` | — | Linear Regression |
| **Statistical** | `slope` | — | Linear Regression Slope |
| **Statistical** | `angle` | — | Linear Regression Angle |
| **Statistical** | `variance` | — | Variance |
| **Statistical** | `meandev` | — | Mean Deviation |
| **Statistical** | `sigma` | — | Sigma |
| **Statistical** | `stderr` | — | Standard Error |
| **Custom** | `kdj` | `9,3,3` | n, kSmooth, dSmooth — KDJ Stochastic Oscillator |
| **Custom** | `supertrend` | `3,10` | factor, atrPeriod — Supertrend |
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
