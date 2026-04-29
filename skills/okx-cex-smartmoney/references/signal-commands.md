# Signal Commands Reference

> Signal endpoints are under `/api/v5/journal/smartmoney/`.

Five atomic commands cover the signal / coin side, split by **entry mode**:

- **`top-coin-signals`** — top-N most-watched-by-smart-money instruments (no specific coin/trader).
- **`signal-by-coin`** — single coin, pool-filter mode (no specific trader list).
- **`signal-by-traders`** — single coin, restricted to specific `authorIds`.
- **`signal-history-by-coin`** — single coin time-series, pool filter.
- **`signal-history-by-traders`** — single coin time-series, restricted to specific `authorIds`.

The previous overloaded `smartmoney signal` command (which switched on `--authorIds` presence) and `smartmoney overview` (which switched on `--instCcyList`) are removed.

---

## smartmoney top-coin-signals — Top-N Most-Watched Instruments

```bash
okx smartmoney top-coin-signals [--ts <ms>] [--topInstruments <n>] [--sortBy <pnl|pnlRatio>] [--pnlTier <tier>] [--winRateTier <tier>] [--maxDrawdownTier <tier>] [--aumTier <tier>] [--lmtNum <n>] [--json]
```

SWAP-only top-N ranking by smart-money attention (`tradersWithPosition` DESC).

| Param | Required | Default | Description |
|---|---|---|---|
| `--ts` | No | current hour | Snapshot timestamp (UTC ms). Handler floors to the hour. Use `$(date +%s)000` for now, or a past timestamp for historical replay. |
| `--topInstruments` | No | `20` | Number of top instruments to return (1–100) |
| `--lmtNum` | No | `100` | Candidate trader pool size limit (1–500) |

> The old flags `--instCcyList`, `--instCcy`, `--instType`, and `--dataVersion` are removed. Upstream `/overview` is now SWAP-only and only supports the top-N mode.

Pool filter params (see [Signal Filter Enums](#signal-filter-enum-values) below) apply.

### Response Fields (per item)

| Field | Type | Description |
|---|---|---|
| `instId` | String | Full instrument name (e.g. `BTC-USDT-SWAP`) |
| `longRatio` | String | Long ratio, decimal in [0, 1] |
| `weightedLongRatio` | String | Long ratio weighted by notional USD |
| `tradersWithPosition` | Integer | Traders currently holding a position (ranking key) |
| `netNotionalUsdt` | String | Net notional = long − short, can be negative |
| `vs24h` | String | Arithmetic difference `longRatio(now) − longRatio(24h ago)` |
| `tradersTotal` | Integer | Candidate pool size before filters |
| `tradersQualified` | Integer | Traders passing all filters (≤ `tradersTotal`) |
| `dataVersion` | String | UTC `yyyyMMddHHmm`（分钟位恒为 `00`，如 `202604282000`） |

> Removed (no longer returned by upstream): `topNUsed`, `currentPrice`, `priceChange24h`, `fundingRate`, `openInterest`, `longShortAccountRatio`, `ts`.

---

## smartmoney signal-by-coin — Single-Asset Signal (pool filter mode)

```bash
okx smartmoney signal-by-coin --instId <id> [--sortBy <pnl|pnlRatio>] [--pnlTier <tier>] [--winRateTier <tier>] [--maxDrawdownTier <tier>] [--aumTier <tier>] [--lmtNum <n>] [--json]
```

Aggregates pool traders' positions for a single instrument to produce long/short ratio, weighted ratio, avg entry price, capital flow, and trend deltas.

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Full instrument name (e.g. `BTC-USDT-SWAP`) |
| `--lmtNum` | No | `100` | Candidate trader pool size limit (1–500) |

> **No `--ts` parameter.** The handler always uses the current hour. For historical timeline, use `signal-history-by-coin`.

> The old `--instCcy` and `--dataVersion` flags are removed.

Pool filter params (see [Signal Filter Enums](#signal-filter-enum-values) below) apply.

### Response Fields (single object in `data[0]`)

| Field | Type | Description |
|---|---|---|
| `instId` | String | Echoes request `instId` |
| `instType` | String | SPOT / MARGIN / FUTURES / SWAP / OPTION |
| `longRatio` | String | Long trader ratio, decimal in [0, 1] |
| `weightedLongRatio` | String | Long ratio weighted by notional USD |
| `avgLongWinRate` | String | Average win-rate of long-side traders over `--period` window |
| `avgShortWinRate` | String | Average win-rate of short-side traders over `--period` window |
| `longNotionalUsdt` | String | Total long notional (USDT) |
| `shortNotionalUsdt` | String | Total short notional (USDT) |
| `netNotionalUsdt` | String | Net = long − short, can be negative |
| `tradersWithPosition` | Integer | Pool traders currently holding a position |
| `longTraders` | Integer | Pool traders with an open long |
| `shortTraders` | Integer | Pool traders with an open short |
| `vs1h` / `vs24h` / `vs7d` | String | Arithmetic difference `longRatio(now) − longRatio(t)` |
| `tradersTotal` | Integer | Candidate pool size after filters |
| `smartMoneyLongAvgEntry` | String | Weighted avg entry across long positions |
| `smartMoneyShortAvgEntry` | String | Weighted avg entry across short positions |
| `totalNotionalVs24h` | String | Total notional change rate vs 24h ago |
| `dataVersion` | String | UTC `yyyyMMddHHmm`（分钟位恒为 `00`，如 `202604282000`） |

> Renamed: `avgLongWinRatio` → `avgLongWinRate`, `avgShortWinRatio` → `avgShortWinRate`.
> Removed: `currentPrice`, `priceChange24h`, `fundingRate`, `openInterest`, `longShortAccountRatio`, `ts`, `timestamp`.

---

## smartmoney signal-by-traders — Single-Asset Signal (authorIds-restricted)

```bash
okx smartmoney signal-by-traders --instId <id> --authorIds <id1>,<id2> [--lmtNum <n>] [--json]
```

Same shape as `signal-by-coin`, but restricts the pool to a specific list of `authorIds` instead of applying the pool filter. Useful for "what do my watchlist of traders think about BTC?".

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Full instrument name |
| `--authorIds` | Yes | - | Comma-separated trader IDs (e.g. `1001,1002,1003`) |
| `--lmtNum` | No | `100` | Pool size limit (1–500) |

> No `--ts` parameter. Handler uses the current hour. No pool filter (`pnlTier` / `winRateTier` / etc.) — the trader list is the filter.

Response fields: same as `signal-by-coin`.

---

## smartmoney signal-history-by-coin — Single-Asset Signal Time-Series (pool filter)

```bash
okx smartmoney signal-history-by-coin --instId <id> --ts <ms> [--granularity <1h|1d>] [--limit <n>] [--sortBy <pnl|pnlRatio>] [--pnlTier <tier>] [--winRateTier <tier>] [--maxDrawdownTier <tier>] [--aumTier <tier>] [--json]
```

Historical signal snapshots for one instrument, sorted by time DESC. Useful for trend analysis and backtesting.

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Full instrument name |
| `--ts` | Yes | - | Anchor timestamp (UTC ms). Handler floors to the hour. Use `$(date +%s)000` for now. |
| `--granularity` | No | `1h` | Time granularity: `1h` or `1d`. Other values fall back to `1h`. |
| `--limit` | No | `24` | Number of data points (1–500) |

Pool filter params (see [Signal Filter Enums](#signal-filter-enum-values) below) apply.

### Response Fields (per time bucket, array `data[]` sorted by time DESC)

| Field | Type | Description |
|---|---|---|
| `instId` | String | Echoes request `instId` |
| `longRatio` | String | Long ratio at this bucket |
| `weightedLongRatio` | String | Notional-weighted long ratio at this bucket |
| `tradersWithPosition` | Integer | Traders holding a position in this bucket |
| `netNotionalUsdt` | String | Net = long − short |
| `totalNotionalUsdt` | String | Total = long + short |
| `tradersTotal` | Integer | Candidate pool size before filters |
| `tradersQualified` | Integer | Traders passing all filters (effective sample size) |
| `dataVersion` | String | UTC `yyyyMMddHHmm` corresponding to this bucket（分钟位恒为 `00`，如 `202604282000`） |

---

## smartmoney signal-history-by-traders — Time-Series (authorIds-restricted)

```bash
okx smartmoney signal-history-by-traders --instId <id> --authorIds <id1>,<id2> --ts <ms> [--granularity <1h|1d>] [--limit <n>] [--lmtNum <n>] [--json]
```

Same shape as `signal-history-by-coin`, but restricted to specific `authorIds` over time. Useful for tracking how a specific group's consensus on one instrument evolves.

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Full instrument name |
| `--authorIds` | Yes | - | Comma-separated trader IDs |
| `--ts` | Yes | - | Anchor timestamp (UTC ms) |
| `--granularity` | No | `1h` | `1h` or `1d` |
| `--limit` | No | `24` | Number of data points (1–500) |
| `--lmtNum` | No | `100` | Pool size limit (1–500) |

Response fields: same as `signal-history-by-coin`.

---

## Signal Filter Enum Values

The pool-filter family of signal endpoints (`top-coin-signals`, `signal-by-coin`, `signal-history-by-coin`) shares these enum-based filters:

| Param | Enum values | Default | Semantics |
|---|---|---|---|
| `--sortBy` | `pnl`, `pnlRatio` | `pnl` | Pool ranking key |
| `--pnlTier` | `PNL_ANY`, `PNL_TOP50`, `PNL_TOP20`, `PNL_TOP5` | `PNL_ANY` | PnL percentile (top N% of pool) |
| `--winRateTier` | `WR_ANY`, `WR_GE_50`, `WR_GE_80` | `WR_ANY` | Win-rate threshold (≥ N%) |
| `--maxDrawdownTier` | `MD_ANY`, `MD_LE_20`, `MD_LE_50` | `MD_ANY` | Drawdown threshold (≤ N%) |
| `--aumTier` | `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` | `AUM_ANY` | AUM percentile |

> Renamed enum prefix: `MR_*` → `MD_*` (drawdown abbreviation). The old enum prefix is no longer accepted.

> The `_by_traders` variants don't accept these tiers — the trader list itself is the filter.

> All enums are case-insensitive; invalid values silently fall back to default.

---

## MCP Tool Reference

| CLI Command | MCP Tool |
|---|---|
| `smartmoney top-coin-signals` | `smartmoney_get_top_coin_signals` |
| `smartmoney signal-by-coin` | `smartmoney_get_signal_overview_by_filter` |
| `smartmoney signal-by-traders` | `smartmoney_get_signal_overview_by_trader` |
| `smartmoney signal-history-by-coin` | `smartmoney_get_signal_trend_by_filter` |
| `smartmoney signal-history-by-traders` | `smartmoney_get_signal_trend_by_trader` |
