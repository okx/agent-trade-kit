# Signal Commands Reference

> Signal endpoints are under `/api/v5/journal/smartmoney/`.

Four atomic commands cover the signal / coin side, split by **entry mode**:

- **`signal-overview-by-filter`** — multi-asset, **tier-discovery scenario**: full pool-filter knobs exposed (sortBy / pnlTier / winRateTier / maxDrawdownTier / aumTier / lmtNum). Use this for "most-watched-by-smart-money instruments" by passing `--topInstruments`.
- **`signal-overview-by-trader`** — multi-asset, **authorIds-direct-lookup scenario**: `--authorIds` + coin selection + `--sortBy` / `--period` (drive capability metrics). Capability tier filters (pnlTier / winRateTier / etc.) not exposed.
- **`signal-trend-by-filter`** — single coin time-series anchored at `asOfTime` (default = current UTC hour), tier-discovery scenario (full pool filters exposed).
- **`signal-trend-by-trader`** — single coin time-series anchored at `asOfTime`, authorIds-direct-lookup scenario. `--sortBy` / `--period` exposed; capability tier filters not exposed.

The previous overloaded `smartmoney signal` command (which switched on `--authorIds` presence), `smartmoney overview` (which switched on `--instCcyList`), and the narrow `top-coin-signals` shortcut are all removed. To get the top-N most-watched coins, call `signal-overview-by-filter` (defaults to `--topInstruments=20`).

---

## smartmoney signal-overview-by-filter — Multi-Asset Signal (pool filter mode)

```bash
okx smartmoney signal-overview-by-filter [--topInstruments <n> | --instCcyList <BTC,ETH,...>] [--sortBy <pnl|pnlRatio>] [--period <3|7|30|90>] [--pnlTier <tier>] [--winRateTier <tier>] [--maxDrawdownTier <tier>] [--aumTier <tier>] [--lmtNum <n>] [--json]
```

Aggregates pool traders' positions across multiple instruments to produce per-instrument long/short ratio, weighted ratio, avg entry price, capital flow, and trend deltas vs 1h/24h/7d.

Pick instruments via `--topInstruments` (top-N hottest) **OR** `--instCcyList` (specific coins) — exactly one. If both are passed the handler errors. If neither is passed it defaults to `--topInstruments=20`.

| Param | Required | Default | Description |
|---|---|---|---|
| `--topInstruments` | No | `20` | Top-N hottest instruments (1–100). Mutually exclusive with `--instCcyList`. |
| `--instCcyList` | No | - | Comma-separated base ccys, e.g. `BTC,ETH,SOL`. Mutually exclusive with `--topInstruments`. **Linear-only**: matches USDT-margined and USDS-margined instruments only (e.g. `BTC` covers `BTC-USDT-SWAP` + `BTC-USDS-SWAP`). Coin-margined `BTC-USD-SWAP` / `BTC-USD-DELIVERY` positions are excluded by upstream. |
| `--lmtNum` | No | `100` | Upper bound on `tradersQualified` (final aggregation pool size). Candidates pass through tier filters, then truncated to top-N by `sortBy` (DESC). `tradersQualified` ≤ `lmtNum` always. Range 1–2000; values above ~1500 add latency without benefit. |

> **No `--ts` parameter.** The handler always uses the current hour. For historical timeline, use `signal-trend-by-filter`.

> **⚠ Coin-margined excluded.** A trader's coin-margined positions on the requested base ccy are silently dropped from `longNotional` / `shortNotional` / `tradersWithPosition`. If a trader holds only coin-margined exposure on a coin, they will not appear in the signal. Use `smartmoney trader-positions --authorId <id>` to inspect the full book.

> The old `--instId`, `--instCcy`, and `--dataVersion` flags are removed.

Pool filter params (see [Signal Filter Enums](#signal-filter-enum-values) below) apply.

### Response Fields (per instrument, array `data[]`)

Each item has an outer ID + 3 nested groups (`notional`, `longShortRatio`, `winRate`).

**Outer fields**

| Field | Type | Description |
|---|---|---|
| `ccy` | String | Instrument ID e.g. `BTC-USDT-SWAP` (outer key is `ccy`, NOT `instId`) |
| `dataVersion` | String | UTC `yyyyMMddHH` — 10 digits, hour-floored (e.g. `2026043014`) |
| `tradersWithPosition` | Integer | Pool traders holding this asset (long+short, double-sided counted once) |
| `tradersQualified` | Integer | Final aggregation pool size after tier filters + top-N truncation by `sortBy`. Always ≤ `lmtNum`. Smaller than `lmtNum` only when candidate pool underflows (rare ccy / strict tier combos). |
| `longTraders` | Integer | Pool traders currently long this asset |
| `shortTraders` | Integer | Pool traders currently short this asset |

**`notional` group** (capital flow)

| Field | Type | Description |
|---|---|---|
| `longNotionalUsdt` | String | Total long notional (USDT) |
| `shortNotionalUsdt` | String | Total short notional (USDT) |
| `netNotionalUsdt` | String | Net = long − short, can be negative |
| `totalNotionalUsdt` | String | Gross = long + short |
| `totalNotionalVs24h` | String | (curr − hist_24h)/hist_24h; positive = adding, negative = retreating; NULL when hist=0 |
| `smartMoneyLongAvgEntry` | String | Weighted avg entry across long positions (NULL when no long) |
| `smartMoneyShortAvgEntry` | String | Weighted avg entry across short positions (NULL when no short) |

**`longShortRatio` group** (ratio + historical deltas)

| Field | Type | Description |
|---|---|---|
| `longRatio` | String | `longTraders / tradersWithPosition`, decimal [0, 1] |
| `shortRatio` | String | `shortTraders / tradersWithPosition` |
| `weightedLongRatio` | String | `Σ(long_notional) / Σ(notional)` |
| `weightedShortRatio` | String | `Σ(short_notional) / Σ(notional)` |
| `longRatioVs1h` | String | `longRatio − hist_1h.longRatio`; NULL when no hist |
| `longRatioVs24h` | String | `longRatio − hist_24h.longRatio`; NULL when no hist |
| `longRatioVs7d` | String | `longRatio − hist_7d.longRatio`; NULL when no hist |

**`winRate` group** (capability — driven by `period`)

| Field | Type | Description |
|---|---|---|
| `avgLongWinRate` | String | Mean closed-position win-rate over `period` days for users currently long; NULL when sample below threshold |
| `avgShortWinRate` | String | Same for users currently short; NULL when sample below threshold |

> **Notional pricing**: `longNotionalUsdt` / `shortNotionalUsdt` / `netNotionalUsdt` / `totalNotionalUsdt` and `weightedLongRatio` / `weightedShortRatio` are weighted by each trader's **entry price (`price_avg`)**, NOT mark price. Values move only when positions are scaled (open / close / add) — they stay constant across buckets when traders hold positions unchanged.

> **Note**: `signal-history` (used by `signal-trend-*`) still returns `dataVersion` in `yyyyMMddHH` format (10 digits) — same as overview.

---

## smartmoney signal-overview-by-trader — Multi-Asset Signal (authorIds-direct-lookup)

```bash
okx smartmoney signal-overview-by-trader --authorIds <id1>,<id2> [--topInstruments <n> | --instCcyList <BTC,ETH,...>] [--sortBy <pnl|pnlRatio>] [--period <3|7|30|90>] [--json]
```

Aggregates signals over a hand-picked set of traders. Use this when the caller already has a list of authorIds (e.g. discovered via `traders-by-filter` or `search-trader`) and wants their consensus on multiple coins. Useful for "what do my watchlist of traders think across coins?".

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorIds` | Yes | - | Comma-separated trader IDs (e.g. `1001,1002,1003`) |
| `--topInstruments` | No | `20` | Top-N hottest instruments held by the group. Mutually exclusive with `--instCcyList`. |
| `--instCcyList` | No | - | Comma-separated base ccys. Mutually exclusive with `--topInstruments`. **Linear-only** — coin-margined (`-USD-SWAP` / `-USD-DELIVERY`) positions held by the trader set are NOT included; cross-check with `trader-positions` if a trader's known coin-margined exposure is missing. |
| `--sortBy` | Yes | `pnl` | Ranking key for the trader set: `pnl` or `pnlRatio` |
| `--period` | Yes | `7` | Lookback window in days for capability metrics (`winRate.avgLongWinRate` / `avgShortWinRate`). Pass `3` / `7` / `30` / `90`. |

> **Capability tier filters not exposed** — `_by_trader` is the authorIds-direct-lookup scenario; tier filters (`pnlTier` / `winRateTier` / `maxDrawdownTier` / `aumTier`) and `lmtNum` use backend defaults. If you need tier-driven filtering instead, use `signal-overview-by-filter`.

> No `--ts` parameter. Handler uses the current hour.

Response fields: same as `signal-overview-by-filter`.

---

## smartmoney signal-trend-by-filter — Single-Asset Time-Series (pool filter)

```bash
okx smartmoney signal-trend-by-filter --instCcy <ccy> [--asOfTime <yyyyMMddHH>] [--granularity <1h|1d>] [--limit <n>] [--sortBy <pnl|pnlRatio>] [--period <3|7|30|90>] [--pnlTier <tier>] [--winRateTier <tier>] [--maxDrawdownTier <tier>] [--aumTier <tier>] [--lmtNum <n>] [--json]
```

Historical single-coin signal snapshots across hourly/daily buckets, anchored at `asOfTime`. Returns the latest `--limit` buckets ending at the anchor (newest first). Omit `--asOfTime` to use the current UTC hour.

| Param | Required | Default | Description |
|---|---|---|---|
| `--instCcy` | Yes | - | Base currency to scope the time-series, e.g. `BTC`. **Linear-only** (USDT/USDS-margined); coin-margined contracts excluded. |
| `--asOfTime` | No | (current UTC hour) | 10-digit UTC anchor `yyyyMMddHH` (e.g. `2026050100`) |
| `--granularity` | No | `1h` | Bucket size: `1h` or `1d` |
| `--limit` | No | `24` | Number of buckets (1–500) ending at `asOfTime` |
| `--lmtNum` | No | `100` | Upper bound on `tradersQualified` per bucket. Candidates pass through tier filters, then truncated to top-N by `sortBy` (DESC). `tradersQualified` ≤ `lmtNum` always; equals `lmtNum` unless candidate pool underflows (rare ccy / strict tier combos). Range 1–2000; values above ~1500 add latency without benefit (exceeds typical candidate pool size). |

Pool filter params (see [Signal Filter Enums](#signal-filter-enum-values) below) apply.

### Response Fields (per time bucket, array `data[]` sorted by time DESC)

| Field | Type | Description |
|---|---|---|
| `ccy` | String | Base currency / instrument key |
| `dataVersion` | String | UTC `yyyyMMddHH` (10 digits, e.g. `2026042820`) |
| `longRatio` | String | Long ratio at this bucket = `longTraders / tradersWithPosition` |
| `shortRatio` | String | Short ratio at this bucket = `shortTraders / tradersWithPosition` |
| `weightedLongRatio` | String | Notional-weighted long ratio = `Σ(long_notional) / Σ(notional)` |
| `weightedShortRatio` | String | Notional-weighted short ratio = `Σ(short_notional) / Σ(notional)` |
| `longTraders` | Integer | Traders with long exposure (includes dual-side) |
| `shortTraders` | Integer | Traders with short exposure (includes dual-side) |
| `tradersWithPosition` | Integer | Traders holding a position in this bucket |
| `tradersQualified` | Integer | Final aggregation pool size in this bucket after tier filters + top-N truncation by `sortBy`. Always ≤ `lmtNum`. |
| `netNotionalUsdt` | String | Net = long − short (USDT) |
| `totalNotionalUsdt` | String | Total = long + short (USDT) |

> **Notional pricing**: `weightedLongRatio` / `weightedShortRatio` / `netNotionalUsdt` / `totalNotionalUsdt` are weighted by each trader's **entry price (`price_avg`)**, NOT mark price. Values move only when positions are scaled (open / close / add) — they stay constant across buckets when traders hold positions unchanged.

---

## smartmoney signal-trend-by-trader — Single-Asset Time-Series (authorIds-direct-lookup)

```bash
okx smartmoney signal-trend-by-trader --authorIds <id1>,<id2> --instCcy <ccy> [--asOfTime <yyyyMMddHH>] [--granularity <1h|1d>] [--limit <n>] [--sortBy <pnl|pnlRatio>] [--period <3|7|30|90>] [--json]
```

Time-series of a single coin's smart-money signal aggregated over a hand-picked set of traders. Useful for tracking how a specific group's consensus on one coin evolves over time.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorIds` | Yes | - | Comma-separated trader IDs (e.g. `1001,1002,1003`) |
| `--instCcy` | Yes | - | Base currency to scope the time-series, e.g. `BTC`. **Linear-only** (USDT/USDS-margined); a trader's coin-margined positions on this base ccy are silently excluded. |
| `--asOfTime` | No | (current UTC hour) | 10-digit UTC anchor `yyyyMMddHH` |
| `--granularity` | No | `1h` | `1h` or `1d` |
| `--limit` | No | `24` | Bucket count (1–500) |
| `--sortBy` | Yes | `pnl` | Ranking key for the trader set: `pnl` or `pnlRatio` |
| `--period` | Yes | `7` | Lookback window in days. Pass `3` / `7` / `30` / `90`. Does NOT affect signal fields (always latest snapshot per bucket). |

> **Capability tier filters not exposed** — `_by_trader` is the authorIds-direct-lookup scenario; tier filters (`pnlTier` / `winRateTier` / `maxDrawdownTier` / `aumTier`) and `lmtNum` use backend defaults. If you need tier-driven filtering instead, use `signal-trend-by-filter`.

Response fields: same as `signal-trend-by-filter`.

---

## Signal Filter Enum Values

`--sortBy` and `--period` are accepted by **all four signal commands** (`_by_filter` and `_by_trader`). The capability tier flags below (`--pnlTier` / `--winRateTier` / `--maxDrawdownTier` / `--aumTier` / `--lmtNum`) are accepted **only by `_by_filter` siblings** — `_by_trader` siblings are authorIds-direct-lookup and these tier filters use backend defaults there.

| Param | Enum values | Default | Semantics |
|---|---|---|---|
| `--sortBy` | `pnl`, `pnlRatio` | `pnl` | Pool ranking key |
| `--period` | `3`, `7`, `30`, `90` | `7` | Lookback window in days for capability metrics |
| `--pnlTier` | `PNL_ANY`, `PNL_TOP50`, `PNL_TOP20`, `PNL_TOP5` | `PNL_ANY` | PnL percentile (top N% of pool) |
| `--winRateTier` | `WR_ANY`, `WR_GE_50`, `WR_GE_80` | `WR_ANY` | Career win-rate threshold (≥ N%, absolute) |
| `--maxDrawdownTier` | `MR_ANY`, `MR_LE_20`, `MR_LE_50` | `MR_ANY` | Max-drawdown threshold (≤ N%, absolute) |
| `--aumTier` | `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` | `AUM_ANY` | AUM percentile (top N% of pool) |

> **Naming convention**: `TOP{N}` = percentile (top N% of pool — used by `pnlTier` / `aumTier` because their distributions are long-tailed); `GE_{N}` = absolute threshold ≥ N% (`winRateTier`); `LE_{N}` = absolute threshold ≤ N% (`maxDrawdownTier`). Don't read `WR_GE_80` as "top 80%" — it means win-rate ≥ 80%.

> All enums are case-insensitive; invalid values silently fall back to default.

---

## MCP Tool Reference

| CLI Command | MCP Tool |
|---|---|
| `smartmoney signal-overview-by-filter` | `smartmoney_get_signal_overview_by_filter` |
| `smartmoney signal-overview-by-trader` | `smartmoney_get_signal_overview_by_trader` |
| `smartmoney signal-trend-by-filter` | `smartmoney_get_signal_trend_by_filter` |
| `smartmoney signal-trend-by-trader` | `smartmoney_get_signal_trend_by_trader` |
