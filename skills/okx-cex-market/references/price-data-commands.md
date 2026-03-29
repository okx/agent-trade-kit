# Price & Market Data Commands

## ticker — Single Instrument

```bash
okx market ticker <instId> [--json]
```

| Param | Required | Description |
|---|---|---|
| `instId` | Yes | Instrument ID (e.g., `BTC-USDT`, `BTC-USDT-SWAP`) |

Returns: `last` · `high24h` · `low24h` · `vol24h` (base currency) · `sodUtc8` (24h change %)

```bash
okx market ticker BTC-USDT
# instId: BTC-USDT | last: 95000.5 | 24h change%: +1.2% | high: 96000 | low: 93000
```

---

## tickers — All Instruments of a Type

```bash
okx market tickers <instType> [--json]
```

| Param | Required | Values |
|---|---|---|
| `instType` | Yes | `SPOT` `SWAP` `FUTURES` `OPTION` |

Returns table: `instId` · `last` · `high24h` · `low24h` · `vol24h`

```bash
okx market tickers SWAP
# → table of all perpetual contracts
```

---

## orderbook — Order Book Depth

```bash
okx market orderbook <instId> [--sz <n>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `instId` | Yes | - | Instrument ID |
| `--sz` | No | 5 | Depth levels per side (1–400) |

Returns: top asks (ascending) and bids (descending) with price and size. Display shows top 5 per side regardless of `--sz`.

```bash
okx market orderbook BTC-USDT-SWAP --sz 20
# Asks: 95100.0 / 2.5 · 95050.0 / 1.2 ...
# Bids: 95000.0 / 3.1 · 94950.0 / 0.8 ...
```

---

## trades — Recent Public Trades

```bash
okx market trades <instId> [--limit <n>] [--json]
```

| Param | Required | Default |
|---|---|---|
| `instId` | Yes | - |
| `--limit` | No | 100 |

Returns: `tradeId` · `px` · `sz` · `side` (`buy`/`sell`) · `ts`

```bash
okx market trades BTC-USDT --limit 20
```

---

## candles — OHLCV Candlestick Data

```bash
okx market candles <instId> [--bar <bar>] [--limit <n>] [--after <ts>] [--before <ts>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `instId` | Yes | - | Instrument ID |
| `--bar` | No | `1m` | Time granularity (see values below) |
| `--limit` | No | 100 | Number of candles |
| `--after` | No | - | Return candles **before** this timestamp (ms) — paginate backward in time |
| `--before` | No | - | Return candles **after** this timestamp (ms) — paginate forward in time |

`--bar` values: `1m` `3m` `5m` `15m` `30m` `1H` `2H` `4H` `6H` `12H` `1D` `1W` `1M`

> Use uppercase for hour/day/week/month — `1H` not `1h`.

The command automatically routes to the historical endpoint when `--after` is older than ~2 days, supporting data back to 2021.

> **OKX API pagination direction**: `--after <ts>` returns candles with timestamp **earlier** than `ts` (go further back in time). `--before <ts>` returns candles with timestamp **later** than `ts` (go toward the present).

Returns columns: `time` · `open` · `high` · `low` · `close` · `vol` (base currency). Sorted newest-first.

```bash
okx market candles BTC-USDT --bar 4H --limit 30
okx market candles ETH-USDT-SWAP --bar 1H --limit 100
okx market candles BTC-USDT --bar 1D --after 1672531200000   # candles before 2023-01-01
```

---

## index-candles — Index OHLCV

```bash
okx market index-candles <instId> [--bar <bar>] [--limit <n>] [--history] [--json]
```

Same params as `candles`. Use index instrument IDs: `BTC-USD` (not `BTC-USDT`).

`--history`: return historical candles beyond the default 1440-candle window.

Returns: same columns as `candles`.

```bash
okx market index-candles BTC-USD --bar 1Dutc --limit 50
okx market index-candles BTC-USD --bar 1Wutc --history --limit 200
```
