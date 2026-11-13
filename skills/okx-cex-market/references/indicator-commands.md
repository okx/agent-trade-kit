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

> Indicators accept only this subset of the candle `--bar` values: daily is `1Dutc` (not `1D`), weekly is `1Wutc` (not `1W`).

### `--params` contract

Two ways to call an indicator:

1. **Omit `--params`** — the indicator's default is used (the CLI prints `params: <values> (default)`).
2. **Pass `--params`** — it must be **complete**. A fixed-length indicator needs exactly the full set (too few *or* too many is an error); `ma`, `ema`, `rsi`, `wr`, `wma`, `dema`, `tema`, `zlema`, `hma`, `kama` take one or more periods. Every value is an integer: periods are 2–365; the `bb` multiplier and the `supertrend` factor are 1–9; `alphatrend` and `halftrend` take any int32 integer (negative values allowed, the 2–365 period range does not apply). Order matters.

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
| `envelope` | period, percent | `20,2` |
| `alphatrend` | period, coefficient×100 | `14,100` |
| `halftrend` | amplitude, channelDeviation×10 | `2,20` |
| `pmax` | atrPeriod, multiplier×10, emaPeriod | `10,30,10` |
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
- `envelope`: the second value is the band **percent as an integer** (`2` means 2%), not a decimal such as 0.1.
- `alphatrend`, `halftrend`, `pmax`: scaled integers — `alphatrend` coefficient×100 (`100` = 1.0), `halftrend` channelDeviation×10 (`20` = 2.0), `pmax` multiplier×10 (`30` = 3.0). The backend applies no range check to the `alphatrend` / `halftrend` values; `pmax` and `envelope` values are periods (2–365).
- `kdj`: pass all three values (`n,kSmooth,dSmooth`) or omit `--params`.
- All values are integers; the backend cannot take decimals in `--params`.

Examples: `--params 12,26,9` (macd), `--params 3,10` (supertrend: factor 3, ATR period 10), `--params 5,20,60` (ma). `--params 12,26` for macd fails with `macd requires 3 params (fast,slow,signal), got 2`.

Every other indicator (including `obv`, `vwap`, `sar`, `ad` and the candlestick patterns) has no default and no count or range check: omit `--params` to let the backend use its own default, or pass values that you know the backend accepts. Malformed values (non-numeric, `null`, numbers that overflow) are still rejected before the request is sent.

When no indicator values come back:

| Situation | Behaviour |
|---|---|
| `--params` given, no timeframe returns values | Table mode fails with `No values returned for <indicator> with params [...]` (the period may exceed the available candles); exit code 1. With `--json` the raw backend data is printed and the exit code stays 0 |
| `--params` omitted, a default was applied (the `params: … (default)` line is shown) | Prints `No indicator values returned for the default params; there may not be enough candles for this instrument and bar.` |
| `--params` omitted, indicator has no default | Prints `No indicator values returned. This indicator may require a period — try --params (e.g. --params 14).` |

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
| **Trend** | `alphatrend` | `14,100` | period, coefficient×100 |
| **Trend** | `halftrend` | `2,20` | amplitude, channelDeviation×10 |
| **Trend** | `envelope` | `20,2` | period, percent — percent is an **integer** (2 = 2%), not a decimal |
| **Trend** | `pmax` | `10,30,10` | atrPeriod, multiplier×10, emaPeriod |
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

The CLI prints the backend's fields unchanged (no renaming, no conversion). Every value is a string, plus `ts` (Unix ms timestamp). Moving-average style indicators are keyed by the **period you passed**, one key per period:

| Indicator | Return fields |
|---|---|
| `ma` | one key per period, e.g. `5`, `20`, `60` |
| `ema` | one key per period, e.g. `5`, `20` |
| `rsi` | one key per period, e.g. `14` (`--params 14,2` returns `14` and `2`) |
| `macd` | `dif`, `dea`, `macd` (histogram) |
| `kdj` | `k`, `d`, `j` |
| `bb` / `boll` | `upper`, `middle`, `lower` |
| `supertrend` | `superTrend`, `direction` (`-1` = `UP`, `1` = `DOWN`), `trend` (`UP` / `DOWN`), `upperBand`, `lowerBand` |
| `ahr999` | `ahr999`, `dca_cost_200`, `fitted_price`, `zone` (`1` = below 0.45, `2` = 0.45–1.2, `3` = 1.2 and above) |
| `rainbow` | `fair_value`, `deviation`, `band` (zone number `1`–`7`) |

Indicators not listed here return whatever fields the backend defines (for example `stoch-rsi` returns `stochRsi`, `k`, `d`); use `--json` to see them.

---

## Examples

```bash
# Discover all supported indicator names first
okx market indicator list

# Latest RSI on 4H
okx market indicator rsi BTC-USDT --bar 4H --params 14

# EMA 5 and EMA 20 trend check on 1H
okx market indicator ema BTC-USDT --bar 1H --params 5,20
# params: 5,20 (explicit)
# ts: 3/20/2026, 10:00 AM | 5: 87420.5 | 20: 86910.2

# MACD on daily (no --params: the default is applied and printed)
okx market indicator macd BTC-USDT --bar 1Dutc
# params: 12,26,9 (default)

# Bollinger Bands on 1H
okx market indicator bb ETH-USDT --bar 1H
# upper: 2050 | middle: 2000 | lower: 1950

# SuperTrend trend state
okx market indicator supertrend BTC-USDT --bar 4H
# superTrend: 84200 | direction: -1 | trend: UP

# Historical RSI series (last 20 values)
okx market indicator rsi ETH-USDT --bar 1H --params 14 --list --limit 20
# → table: ts, 14 (20 rows)

# BTC on-chain cycle check
okx market indicator ahr999 BTC-USDT
# ahr999: 0.87 | zone: 2  (DCA zone: 0.45–1.2)

okx market indicator rainbow BTC-USDT
# fair_value: 61234 | deviation: -0.12 | band: 3

# Backtesting point-in-time value
okx market indicator rsi BTC-USDT --bar 4H --params 14 --backtest-time 1711008000000
```

---

## BTC On-Chain Interpretation Guide

| Indicator | Zone / Value | Interpretation |
|---|---|---|
| `ahr999` | < 0.45 (`zone` 1) | Accumulate zone |
| `ahr999` | 0.45 – 1.2 (`zone` 2) | DCA zone |
| `ahr999` | ≥ 1.2 (`zone` 3) | Bubble warning |
| `rainbow` | `band` 1–7 | Zone number; see the OKX Rainbow Chart legend |
