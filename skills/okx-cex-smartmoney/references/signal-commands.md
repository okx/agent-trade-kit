# Signal Commands Reference

> Signal endpoints are under `/api/v5/journal/smartmoney/`.

Four atomic commands cover the signal / coin side, split by **entry mode**:

- **`signal-overview-by-filter`** — multi-asset, **tier-discovery scenario**: full pool-filter knobs exposed (sortBy / pnlTier / winRateTier / maxDrawdownTier / aumTier / lmtNum). Use this for "most-watched-by-smart-money instruments" by passing `--topInstruments`.
- **`signal-overview-by-trader`** — multi-asset, **authorIds-direct-lookup scenario**: only `--authorIds` + coin selection; pool filters not exposed (backend uses defaults).
- **`signal-trend-by-filter`** — single coin time-series anchored at `asOfTime` (default = current UTC hour), tier-discovery scenario (full pool filters exposed).
- **`signal-trend-by-trader`** — single coin time-series anchored at `asOfTime`, authorIds-direct-lookup scenario (no pool filters).

The previous overloaded `smartmoney signal` command (which switched on `--authorIds` presence), `smartmoney overview` (which switched on `--instCcyList`), and the narrow `top-coin-signals` shortcut are all removed. To get the top-N most-watched coins, call `signal-overview-by-filter` (defaults to `--topInstruments=20`).

---

## smartmoney signal-overview-by-filter — Multi-Asset Signal (pool filter mode)

```bash
okx smartmoney signal-overview-by-filter [--topInstruments <n> | --instCcyList <BTC,ETH,...>] [--sortBy <pnl|pnlRatio>] [--pnlTier <tier>] [--winRateTier <tier>] [--maxDrawdownTier <tier>] [--aumTier <tier>] [--lmtNum <n>] [--json]
```

Aggregates pool traders' positions across multiple instruments to produce per-instrument long/short ratio, weighted ratio, avg entry price, capital flow, and trend deltas vs 1h/24h/7d.

Pick instruments via `--topInstruments` (top-N hottest) **OR** `--instCcyList` (specific coins) — exactly one. If both are passed the handler errors. If neither is passed it defaults to `--topInstruments=20`.

| Param | Required | Default | Description |
|---|---|---|---|
| `--topInstruments` | No | `20` | Top-N hottest instruments (1–100). Mutually exclusive with `--instCcyList`. |
| `--instCcyList` | No | - | Comma-separated base ccys, e.g. `BTC,ETH,SOL`. Mutually exclusive with `--topInstruments`. |
| `--lmtNum` | No | `100` | Candidate trader pool size limit (1–500) |

> **No `--ts` parameter.** The handler always uses the current hour. For historical timeline, use `signal-trend-by-filter`.

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
| `tradersQualified` | Integer | Pool size after applying tier filters (incl. ones with no position) |
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
| `shortRatio` | String | `1 − longRatio` |
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

> **Note**: `signal-history` (used by `signal-trend-*`) still returns `dataVersion` in `yyyyMMddHH` format (10 digits) — same as overview.

---

## smartmoney signal-overview-by-trader — Multi-Asset Signal (authorIds-direct-lookup)

```bash
okx smartmoney signal-overview-by-trader --authorIds <id1>,<id2> [--topInstruments <n> | --instCcyList <BTC,ETH,...>] [--json]
```

Aggregates signals over a hand-picked set of traders. Use this when the caller already has a list of authorIds (e.g. discovered via `traders-by-filter` or `search-trader`) and wants their consensus on multiple coins. Useful for "what do my watchlist of traders think across coins?".

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorIds` | Yes | - | Comma-separated trader IDs (e.g. `1001,1002,1003`) |
| `--topInstruments` | No | `20` | Top-N hottest instruments held by the group. Mutually exclusive with `--instCcyList`. |
| `--instCcyList` | No | - | Comma-separated base ccys. Mutually exclusive with `--topInstruments`. |

> **Pool filters not exposed** — `_by_trader` is the authorIds-direct-lookup scenario; backend uses sensible defaults. If you need tier-driven filtering instead, use `signal-overview-by-filter`.

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
| `--instCcy` | Yes | - | Base currency to scope the time-series, e.g. `BTC` |
| `--asOfTime` | No | (current UTC hour) | 10-digit UTC anchor `yyyyMMddHH` (e.g. `2026050100`) |
| `--granularity` | No | `1h` | Bucket size: `1h` or `1d` |
| `--limit` | No | `24` | Number of buckets (1–500) ending at `asOfTime` |
| `--lmtNum` | No | `100` | Candidate trader pool size limit (1–2000) |

Pool filter params (see [Signal Filter Enums](#signal-filter-enum-values) below) apply.

### Response Fields (per time bucket, array `data[]` sorted by time DESC)

| Field | Type | Description |
|---|---|---|
| `ccy` | String | Base currency / instrument key |
| `dataVersion` | String | UTC `yyyyMMddHH` (10 digits, e.g. `2026042820`) |
| `longRatio` | String | Long ratio at this bucket |
| `shortRatio` | String | Short ratio = `1 − longRatio` |
| `weightedLongRatio` | String | Notional-weighted long ratio |
| `weightedShortRatio` | String | Notional-weighted short ratio |
| `longTraders` | Integer | Traders with long exposure (includes dual-side) |
| `shortTraders` | Integer | Traders with short exposure (includes dual-side) |
| `tradersWithPosition` | Integer | Traders holding a position in this bucket |
| `tradersQualified` | Integer | Pool size after tier filters (incl. those without a position) |
| `netNotionalUsdt` | String | Net = long − short (USDT) |
| `totalNotionalUsdt` | String | Total = long + short (USDT) |

---

## smartmoney signal-trend-by-trader — Single-Asset Time-Series (authorIds-direct-lookup)

```bash
okx smartmoney signal-trend-by-trader --authorIds <id1>,<id2> --instCcy <ccy> [--asOfTime <yyyyMMddHH>] [--granularity <1h|1d>] [--limit <n>] [--json]
```

Time-series of a single coin's smart-money signal aggregated over a hand-picked set of traders. Useful for tracking how a specific group's consensus on one coin evolves over time.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorIds` | Yes | - | Comma-separated trader IDs (e.g. `1001,1002,1003`) |
| `--instCcy` | Yes | - | Base currency to scope the time-series, e.g. `BTC` |
| `--asOfTime` | No | (current UTC hour) | 10-digit UTC anchor `yyyyMMddHH` |
| `--granularity` | No | `1h` | `1h` or `1d` |
| `--limit` | No | `24` | Bucket count (1–500) |

> **Pool filters not exposed** — `_by_trader` is the authorIds-direct-lookup scenario; backend uses sensible defaults. If you need tier-driven filtering instead, use `signal-trend-by-filter`.

Response fields: same as `signal-trend-by-filter`.

---

## Signal Filter Enum Values

Only the `_by_filter` siblings (`signal-overview-by-filter` / `signal-trend-by-filter`) accept these pool-filter enums. The `_by_trader` siblings are authorIds-direct-lookup and do not expose these flags — backend uses defaults.

| Param | Enum values | Default | Semantics |
|---|---|---|---|
| `--sortBy` | `pnl`, `pnlRatio` | `pnl` | Pool ranking key |
| `--period` | `3`, `7`, `30`, `90` | `7` | Lookback window in days for capability metrics |
| `--pnlTier` | `PNL_ANY`, `PNL_TOP50`, `PNL_TOP20`, `PNL_TOP5` | `PNL_ANY` | PnL percentile (top N% of pool) |
| `--winRateTier` | `WR_ANY`, `WR_GE_50`, `WR_GE_80` | `WR_ANY` | Win-rate threshold (≥ N%) |
| `--maxDrawdownTier` | `MR_ANY`, `MR_LE_20`, `MR_LE_50` | `MR_ANY` | Max-drawdown threshold (≤ N%) |
| `--aumTier` | `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` | `AUM_ANY` | AUM percentile |

> All enums are case-insensitive; invalid values silently fall back to default.

---

## MCP Tool Reference

| CLI Command | MCP Tool |
|---|---|
| `smartmoney signal-overview-by-filter` | `smartmoney_get_signal_overview_by_filter` |
| `smartmoney signal-overview-by-trader` | `smartmoney_get_signal_overview_by_trader` |
| `smartmoney signal-trend-by-filter` | `smartmoney_get_signal_trend_by_filter` |
| `smartmoney signal-trend-by-trader` | `smartmoney_get_signal_trend_by_trader` |
