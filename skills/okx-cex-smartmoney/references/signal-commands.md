# Signal Commands Reference

> Signal endpoints are under `/api/v5/journal/smartmoney/`.

## smartmoney signal — Consensus Signal

```bash
okx smartmoney signal [--instId <id>] [--instCcy <ccy>] [--ts <ms> | --dataVersion <ver>] [--sortType <type>] [--period <d>] [--pnl <tier>] [--winRatio <tier>] [--maxRetreat <tier>] [--asset <tier>] [--lmtNum <n>] [--authorIds <ids>] [--json]
```

Aggregates pool traders' positions for a single currency to produce long/short ratio, weighted ratio, avg entry price, capital flow, trend deltas, and market context.

> **At least one of `--instId` (e.g. `BTC-USDT-SWAP`) or `--instCcy` (e.g. `BTC`, SPOT/SWAP only) is required.** `--instId` takes precedence if both are set.

### Parameters

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Cond. | - | **Recommended.** Full instrument name (e.g. `BTC-USDT-SWAP`). **At least one of instId / instCcy required**; instId takes precedence. |
| `--instCcy` | Cond. | - | Currency code (e.g. `BTC`). SPOT and SWAP only. `--instId` takes precedence if both are set. |
| `--ts` | Cond. | - | **Recommended.** Snapshot timestamp (ms UTC) — use `$(date +%s)000` for latest. **At least one of ts / dataVersion required**; if both sent, `--ts` wins. |
| `--dataVersion` | Cond. | - | Alternative. Snapshot version (yyyyMMddHHmm UTC) for replaying a prior snapshot. |
| `--lmtNum` | No | `100` | Candidate trader pool size limit (range 1-500) |
| `--authorIds` | No | - | Comma-separated user IDs (e.g. `1001,1002,1003`) — **restricts** the trader pool to these IDs only (precise filter, not additive) |

Pool filter params (sortType, period, pnl, winRatio, maxRetreat, asset) also apply.

### Signal Filter Enum Values

All signal endpoints share these enum-based pool filters:

| Parameter | Enum values | Default | Semantics |
|---|---|---|---|
| `sortType` | `pnl`, `pnlRatio` | `pnl` | Trader pool ranking basis: `pnl` = cumulative PnL, `pnlRatio` = cumulative return ratio |
| `period` | `3`, `7`, `30`, `90` | `90` | Win-rate calculation window in **days** — affects `winRatio`/`avgLongWinRatio`/`avgShortWinRatio` only, **not** the snapshot range |
| `pnl` | `PNL_ANY`, `PNL_TOP50`, `PNL_TOP20`, `PNL_TOP5` | `PNL_ANY` | PnL percentile filter — keeps **top N%** of traders by PnL (e.g. `PNL_TOP20` = top 20%, not top 20 traders) |
| `winRatio` | `WR_ANY`, `WR_GE_50`, `WR_GE_80` | `WR_ANY` | Win-rate threshold — keeps traders with win-rate **≥ N%** |
| `maxRetreat` | `MR_ANY`, `MR_LE_20`, `MR_LE_50` | `MR_ANY` | Max drawdown threshold — keeps traders with drawdown **≤ N%** |
| `asset` | `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` | `AUM_ANY` | AUM percentile filter — keeps **top N%** of traders by asset size |

All enums are case-insensitive. Invalid values silently fall back to default.

### Response Fields (27 fields, single object in `data[0]`)

| Field | Type | Description |
|---|---|---|
| `instId` | String | Instrument name (e.g. `BTC-USDT-SWAP`). When request used `instCcy`, this echoes the **uppercase currency code only** (e.g. `BTC`) |
| `instType` | String | Instrument type: SPOT / MARGIN / FUTURES / SWAP / OPTION. Empty string `""` when request used `instCcy` path |
| `longRatio` | String | Long trader ratio, decimal in [0, 1] (e.g. `"0.65"` = 65%) |
| `weightedLongRatio` | String | Long ratio weighted by **notional USD value** (each trader's vote weighted by position size) |
| `avgLongWinRatio` | String | Average win ratio of long-side traders over the window set by `period` param |
| `avgShortWinRatio` | String | Average win ratio of short-side traders over the window set by `period` param |
| `longNotionalUsdt` | String | Total long notional value in USDT |
| `shortNotionalUsdt` | String | Total short notional value in USDT |
| `netNotionalUsdt` | String | Net notional = `longNotionalUsdt − shortNotionalUsdt`, **can be negative** |
| `tradersWithPosition` | Integer | Traders in the final pool who currently hold a position on this instrument |
| `longTraders` | Integer | Traders in the pool with an open long position |
| `shortTraders` | Integer | Traders in the pool with an open short position |
| `vs1h` | String | **Arithmetic difference** `longRatio(now) − longRatio(1h ago)`, same decimal unit; positive = more long now |
| `vs24h` | String | Arithmetic difference vs 24 h ago (same semantics as `vs1h`) |
| `vs7d` | String | Arithmetic difference vs 7 days ago (same semantics as `vs1h`) |
| `ts` | Long | **Actual** snapshot time hit (UTC ms) — may be earlier than requested `ts` (latest snapshot ≤ input) |
| `tradersTotal` | Integer | Final candidate pool size after applying filter params (`pnl`/`winRatio`/`maxRetreat`/`asset`/`authorIds`) |
| `smartMoneyLongAvgEntry` | String | Weighted average entry price across long positions |
| `smartMoneyShortAvgEntry` | String | Weighted average entry price across short positions |
| `totalNotionalVs24h` | String | Total notional change **rate** vs 24 h ago, **decimal ratio** (e.g. `"0.08"` = +8%). May be empty string |
| `currentPrice` | String | Current mark price — **reserved field, currently returns `""`**; do not render |
| `priceChange24h` | String | 24h price change rate — reserved, currently `""` |
| `fundingRate` | String | Funding rate — reserved, currently `""` |
| `openInterest` | String | Open interest — reserved, currently `""` |
| `longShortAccountRatio` | String | Long/short account ratio — reserved, currently `""` |
| `timestamp` | String | ISO-8601 string of `ts` (human-readable, redundant with `ts`) |
| `dataVersion` | String | yyyyMMddHHmm UTC, one-to-one with `ts` |

---

## smartmoney signal-history — Signal Timeline

```bash
okx smartmoney signal-history --instId <id> [--ts <ms> | --dataVersion <ver>] [--granularity <1h|1d>] [--limit <n>] [--sortType <type>] [--period <d>] [--pnl <tier>] [--winRatio <tier>] [--maxRetreat <tier>] [--asset <tier>] [--json]
```

Returns historical signal snapshots for a given instrument. Sorted by ts DESC. Useful for trend analysis and backtesting.

### Parameters

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Full instrument name (e.g. `BTC-USDT-SWAP`) |
| `--ts` | Cond. | - | **Recommended.** Snapshot timestamp (ms UTC) — use `$(date +%s)000` for latest. **At least one of ts / dataVersion required**; if both sent, `--ts` wins. |
| `--dataVersion` | Cond. | - | Alternative. Snapshot version (yyyyMMddHHmm UTC) for replaying a prior snapshot. |
| `--granularity` | No | `1h` | Time granularity: `1h`, `1d`. Other values fall back to `1h`. |
| `--limit` | No | `24` | Number of data points to return (range 1-500) |
Pool filter params (sortType, period, pnl, winRatio, maxRetreat, asset) and enum tiers also apply.

### Response Fields (10 fields per item, array `data[]`, sorted by ts DESC)

| Field | Type | Description |
|---|---|---|
| `instId` | String | Instrument name (echoes request `instId`) |
| `longRatio` | String | Long ratio at this time bucket, decimal in [0, 1] |
| `weightedLongRatio` | String | Long ratio weighted by notional USD at this time bucket |
| `tradersWithPosition` | Integer | Traders holding a position on this instrument in this time bucket |
| `netNotionalUsdt` | String | Net notional = long − short, can be negative |
| `totalNotionalUsdt` | String | Total notional = long + short (always ≥ 0) |
| `ts` | Long | Time bucket representative timestamp (UTC ms) |
| `tradersTotal` | Integer | Candidate pool size **before** filters |
| `tradersQualified` | Integer | Traders passing all filters in this bucket (≤ `tradersTotal`). Use this as the "effective sample size" |
| `dataVersion` | String | yyyyMMddHHmm UTC corresponding to this time bucket |

---

## smartmoney overview — Multi-Currency Overview

```bash
okx smartmoney overview [--ts <ms> | --dataVersion <ver>] [--instType <type>] [--instCcyList <ccys>] [--instCcy <ccy>] [--topInstruments <n>] [--sortType <type>] [--period <d>] [--pnl <tier>] [--winRatio <tier>] [--maxRetreat <tier>] [--asset <tier>] [--lmtNum <n>] [--json]
```

Returns aggregated signal snapshots for top currencies, ranked by tradersWithPosition (most-watched first).

### Parameters

| Param | Required | Default | Description |
|---|---|---|---|
| `--ts` | Cond. | - | **Recommended.** Snapshot timestamp (ms UTC) — use `$(date +%s)000` for latest. **At least one of ts / dataVersion required**; if both sent, `--ts` wins. |
| `--dataVersion` | Cond. | - | Alternative. Snapshot version (yyyyMMddHHmm UTC) for replaying a prior snapshot. |
| `--instType` | No | `SWAP` | Instrument type: SPOT, MARGIN, FUTURES, SWAP, OPTION |
| `--instCcyList` | No | - | Comma-separated currencies (e.g. `BTC,ETH,SOL`). Only returns prefix-matched instruments. |
| `--instCcy` | No | - | Single currency filter, alias for instCcyList. instCcyList takes precedence. |
| `--topInstruments` | No | `20` | Number of top instruments to return (range 1-100) |
| `--lmtNum` | No | `100` | Candidate trader pool size limit |

Pool filter params (sortType, period, pnl, winRatio, maxRetreat, asset) and enum tiers also apply.

**Filter order:** SQL first limits by `topInstruments` → then filters by `instCcyList` currency prefix → `topNUsed = final result count`. So `topInstruments=3 & instCcyList=BTC` may return < 3 items.

### Response Fields (11 fields per item, array `data[]`)

| Field | Type | Description |
|---|---|---|
| `instId` | String | Full instrument name (e.g. `BTC-USDT-SWAP`). **To show pure currency, split by `-` and take `[0]`** |
| `longRatio` | String | Long ratio, decimal in [0, 1] |
| `weightedLongRatio` | String | Long ratio weighted by notional USD |
| `tradersWithPosition` | Integer | Traders currently holding a position on this instrument (ranking key; results sorted DESC by this) |
| `netNotionalUsdt` | String | Net notional = long − short, can be negative |
| `vs24h` | String | Arithmetic difference `longRatio(now) − longRatio(24h ago)`, same decimal unit; positive = more long now |
| `ts` | Long | Actual snapshot time hit (UTC ms) — may be earlier than requested |
| `tradersTotal` | Integer | Candidate pool size **before** filters |
| `tradersQualified` | Integer | Traders passing all filters (≤ `tradersTotal`) |
| `topNUsed` | Integer | Actual result count (= `data.length`); may be < `topInstruments` when `instCcyList` narrows the set |
| `dataVersion` | String | yyyyMMddHHmm UTC |

---

## MCP Tool Reference

| CLI Command | MCP Tool |
|---|---|
| `smartmoney overview` | `smartmoney_get_overview` |
| `smartmoney signal` | `smartmoney_get_signal` |
| `smartmoney signal-history` | `smartmoney_get_signal_history` |
