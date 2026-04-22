# Signal Commands Reference

> Signal endpoints are under `/api/v5/journal/smartmoney/`.

## smartmoney signal — Consensus Signal

```bash
okx smartmoney signal [--instId <id>] [--instCcy <ccy>] [--dataVersion <ver>] [--ts <ms>] [--sortType <type>] [--period <d>] [--pnl <tier>] [--winRatio <tier>] [--maxRetreat <tier>] [--asset <tier>] [--lmtNum <n>] [--authorIds <ids>] [--json]
```

Aggregates pool traders' positions for a single currency to produce long/short ratio, weighted ratio, avg entry price, capital flow, trend deltas, and market context.

### Parameters

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Cond. | - | Full instrument name (e.g. `BTC-USDT-SWAP`). **At least one of instId / instCcy required**; instId takes precedence. |
| `--instCcy` | Cond. | - | Currency code (e.g. `BTC`). **At least one of instId / instCcy required**. Applies to SPOT and SWAP. |
| `--dataVersion` | Cond. | - | Snapshot version (yyyyMMddHHmm UTC). **At least one of dataVersion / ts required**; if both sent, ts takes precedence. |
| `--ts` | Cond. | - | Snapshot timestamp (ms UTC). **At least one of dataVersion / ts required**; if both sent, ts takes precedence. |
| `--lmtNum` | No | `100` | Candidate trader pool size limit (range 1-500) |
| `--authorIds` | No | - | Comma-separated user IDs for precise filtering (e.g. `1001,1002,1003`) |

Pool filter params (sortType, period, pnl, winRatio, maxRetreat, asset) also apply.

### Signal Filter Enum Values

All signal endpoints share these enum-based pool filters:

| Parameter | Enum values | Default | Description |
|---|---|---|---|
| `sortType` | `pnl`, `pnlRatio` | `pnl` | Trader ranking basis |
| `period` | `3`, `7`, `30`, `90` | `90` | Win-ratio calculation window (days) |
| `pnl` | `PNL_ANY`, `PNL_TOP50`, `PNL_TOP20`, `PNL_TOP5` | `PNL_ANY` | PnL percentile filter |
| `winRatio` | `WR_ANY`, `WR_GE_50`, `WR_GE_80` | `WR_ANY` | Win ratio threshold |
| `maxRetreat` | `MR_ANY`, `MR_LE_20`, `MR_LE_50` | `MR_ANY` | Max drawdown threshold |
| `asset` | `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` | `AUM_ANY` | AUM percentile filter |

All enums are case-insensitive. Invalid values silently fall back to default.

### Response Fields (27 fields, single object in `data[0]`)

| Field | Type | Description |
|---|---|---|
| `instId` | String | Instrument name (echoes instCcy if that was used) |
| `instType` | String | Instrument type: SPOT / MARGIN / FUTURES / SWAP / OPTION; empty when using instCcy path |
| `longRatio` | String | Long trader ratio (0~1) |
| `weightedLongRatio` | String | Notional-weighted long ratio |
| `avgLongWinRatio` | String | Average win ratio of long-side traders (period window) |
| `avgShortWinRatio` | String | Average win ratio of short-side traders |
| `longNotionalUsdt` | String | Total long notional value (USDT) |
| `shortNotionalUsdt` | String | Total short notional value (USDT) |
| `netNotionalUsdt` | String | Net notional (long − short, can be negative) |
| `tradersWithPosition` | Integer | Traders currently holding positions |
| `longTraders` | Integer | Number of long-side traders |
| `shortTraders` | Integer | Number of short-side traders |
| `vs1h` | String | longRatio delta vs 1 hour ago |
| `vs24h` | String | longRatio delta vs 24 hours ago |
| `vs7d` | String | longRatio delta vs 7 days ago |
| `ts` | Long | Actual snapshot timestamp (UTC ms) |
| `tradersTotal` | Integer | Final candidate pool size after filtering |
| `smartMoneyLongAvgEntry` | String | Weighted avg entry price for longs |
| `smartMoneyShortAvgEntry` | String | Weighted avg entry price for shorts |
| `totalNotionalVs24h` | String | Total notional change rate vs 24h (may be empty) |
| `currentPrice` | String | Current mark price (reserved, may be empty) |
| `priceChange24h` | String | 24h price change rate (reserved) |
| `fundingRate` | String | Funding rate (reserved) |
| `openInterest` | String | Open interest (reserved) |
| `longShortAccountRatio` | String | Long/short account ratio (reserved) |
| `timestamp` | String | ISO-8601 string of `ts` (human-readable) |
| `dataVersion` | String | yyyyMMddHHmm UTC |

---

## smartmoney signal-history — Signal Timeline

```bash
okx smartmoney signal-history --instId <id> [--dataVersion <ver>] [--ts <ms>] [--granularity <1h|1d>] [--limit <n>] [--sortType <type>] [--period <d>] [--pnl <tier>] [--winRatio <tier>] [--maxRetreat <tier>] [--asset <tier>] [--json]
```

Returns historical signal snapshots for a given instrument. Sorted by ts DESC. Useful for trend analysis and backtesting.

### Parameters

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Full instrument name (e.g. `BTC-USDT-SWAP`) |
| `--dataVersion` | Cond. | - | Snapshot version (yyyyMMddHHmm UTC). **At least one of dataVersion / ts required**; if both sent, ts takes precedence. |
| `--ts` | Cond. | - | Snapshot timestamp (ms UTC). **At least one of dataVersion / ts required**; if both sent, ts takes precedence. |
| `--granularity` | No | `1h` | Time granularity: `1h`, `1d`. Other values fall back to `1h`. |
| `--limit` | No | `24` | Number of data points to return (range 1-500) |
Pool filter params (sortType, period, pnl, winRatio, maxRetreat, asset) and enum tiers also apply.

### Response Fields (10 fields per item, array `data[]`, sorted by ts DESC)

| Field | Type | Description |
|---|---|---|
| `instId` | String | Instrument name (echoes input) |
| `longRatio` | String | Long ratio at this time bucket |
| `weightedLongRatio` | String | Weighted long ratio |
| `tradersWithPosition` | Integer | Traders with positions at this time bucket |
| `netNotionalUsdt` | String | Net notional (long − short) |
| `totalNotionalUsdt` | String | Total notional (long + short) |
| `ts` | Long | Time bucket timestamp (UTC ms) |
| `tradersTotal` | Integer | Candidate pool size |
| `tradersQualified` | Integer | Traders passing filter criteria at this time bucket |
| `dataVersion` | String | yyyyMMddHHmm UTC for this time bucket |

---

## smartmoney overview — Multi-Currency Overview

```bash
okx smartmoney overview [--dataVersion <ver>] [--ts <ms>] [--instType <type>] [--instCcyList <ccys>] [--instCcy <ccy>] [--topInstruments <n>] [--sortType <type>] [--period <d>] [--pnl <tier>] [--winRatio <tier>] [--maxRetreat <tier>] [--asset <tier>] [--lmtNum <n>] [--json]
```

Returns aggregated signal snapshots for top currencies, ranked by tradersWithPosition (most-watched first).

### Parameters

| Param | Required | Default | Description |
|---|---|---|---|
| `--dataVersion` | Cond. | - | Snapshot version (yyyyMMddHHmm UTC). **At least one of dataVersion / ts required**; if both sent, ts takes precedence. |
| `--ts` | Cond. | - | Snapshot timestamp (ms UTC). **At least one of dataVersion / ts required**; if both sent, ts takes precedence. |
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
| `instId` | String | Full instrument name (e.g. BTC-USDT-SWAP) |
| `longRatio` | String | Long ratio |
| `weightedLongRatio` | String | Weighted long ratio |
| `tradersWithPosition` | Integer | Traders with positions |
| `netNotionalUsdt` | String | Net notional (long − short) |
| `vs24h` | String | longRatio delta vs 24h ago |
| `ts` | Long | Snapshot timestamp (UTC ms) |
| `tradersTotal` | Integer | Candidate pool size |
| `tradersQualified` | Integer | Traders passing filter criteria |
| `topNUsed` | Integer | Actual result count (= data.length) |
| `dataVersion` | String | yyyyMMddHHmm UTC |

---

## MCP Tool Reference

| CLI Command | MCP Tool |
|---|---|
| `smartmoney overview` | `smartmoney_get_overview` |
| `smartmoney signal` | `smartmoney_get_signal` |
| `smartmoney signal-history` | `smartmoney_get_signal_history` |
