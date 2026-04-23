# Trader Commands Reference

## smartmoney traders — Leaderboard

```bash
okx smartmoney traders [--sortType <type>] [--period <d>] [--pnl <n>] [--winRatio <r>] [--maxRetreat <r>] [--asset <n>] [--authorIds <ids>] [--after <id>] [--before <id>] [--limit <n>] [--json]
```

### Pool Filter Parameters (shared across all commands)

| Param | Required | Default | Description |
|---|---|---|---|
| `--sortType` | No | `pnl` | Sort: `pnl`, `pnl_ratio` |
| `--period` | No | `""` (all) | Time window: `3`, `7`, `30`, `90` (days) |
| `--pnl` | No | `""` | Min PnL (USD). e.g. `10` = PnL >= 10 |
| `--winRatio` | No | `""` | Min win ratio. e.g. `0.8` = >= 80% |
| `--maxRetreat` | No | `""` | Max drawdown. e.g. `0.1` = <= 10% |
| `--asset` | No | `""` | Min total asset (USD). e.g. `100` = AUM >= 100 |

### Leaderboard-Specific Parameters

| Param | Required | Default | Description |
|---|---|---|---|
| `--dataVersion` | No | latest | Snapshot version (yyyyMMddHHmm), updates every 5 min |
| `--authorIds` | No | - | Comma-separated author IDs for search |
| `--after` | No | - | Pagination: return results after this authorId |
| `--before` | No | - | Pagination: return results before this authorId |
| `--limit` | No | `100` | Max results (max 100) |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `dataVersion` | String | Data version (yyyyMMddHHmm) |
| `authorId` | String | Trader unique ID |
| `nickName` | String | Display name |
| `pnl` | String | Absolute PnL (USD) |
| `pnlRatio` | String | PnL ratio |
| `winRatio` | String | Win ratio (0.8 = 80%) |
| `maxRetreat` | String | Max drawdown |
| `asset` | String | Total asset (USD) |
| `onboardDuration` | String | Onboard days |
| `rates` | Array | Historical return time series. Each item: `value` (String, return rate) and `statTime` (String, Unix ms e.g. "1736784000000") |

### Trader Eligibility Criteria

Traders on the leaderboard must meet all of:
- Public performance status
- Assets >= 10,000 USD
- PnL >= 1,000 USD (for corresponding period)
- Last trade within 14 days
- KYC fully verified

---

## smartmoney trader — Trader Detail (Composite)

```bash
okx smartmoney trader --authorId <id> [--period <d>] [--instCcy <ccy>] [--tradeLimit <n>] [--json]
```

Aggregates three API calls in parallel:
1. **Profile**: leaderboard stats for this trader
2. **Current positions**: open positions with leverage, entry price, PnL
3. **Trade records**: recent order history

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorId` | Yes | - | Trader's unique author ID |
| `--period` | No | all | Performance period: `3`, `7`, `30`, `90` (days) |
| `--instCcy` | No | - | Filter positions/trades by currency (e.g. `BTC`) |
| `--tradeLimit` | No | `10` | Max trade records to return |

### Composite Response Structure

The `--json` output wraps three sub-results:

```json
{
  "endpoint": "smartmoney_get_trader_detail (composite)",
  "requestTime": "2026-04-09T12:00:00.000Z",
  "data": {
    "profile": [ { ...leaderboard fields... } ],
    "positions": [ { ...position fields... } ],
    "trades": [ { ...trade record fields... } ]
  }
}
```

### Current Position Fields

| Field | Description |
|---|---|
| `posId` | Position unique ID |
| `instId` | Instrument (e.g. BTC-USDT-SWAP) |
| `instType` | SWAP, SPOT, etc. |
| `posSide` | long / short / both |
| `posCcy` | Position currency (e.g. BSV) |
| `quoteCcy` | Quote currency (e.g. USDT) |
| `pos` | Position size |
| `lever` | Leverage |
| `avgPx` | Entry avg price |
| `last` | Latest price |
| `notionalUsd` | Position value (USD) |
| `pnl` | Realized PnL (in quote currency) |
| `cTime` | Position open time (ms timestamp) |
| `positionIntensity` | Conviction = notionalUsd / trader AUM |

### Trade Record Fields

| Field | Description |
|---|---|
| `ordId` | Order ID |
| `uniqueName` | System-generated unique identifier |
| `instId` | Instrument (e.g. BTC-USD-SWAP) |
| `instType` | SWAP / SPOT |
| `nickName` | User nickname |
| `baseName` | Base currency (e.g. BTC) |
| `quoteName` | Quote currency (e.g. USD) |
| `side` | buy / sell |
| `posSide` | long / short |
| `ordType` | limit / market |
| `lever` | Leverage |
| `px` | Order price |
| `avgPx` | Fill avg price |
| `sz` | Order size (coins for spot, contracts for futures) |
| `value` | Position value (in quote currency) |
| `cTime` | Order time (ms) |
| `fillTime` | Fill time (ms) |
| `uTime` | Order update time (ms) |

---

## MCP Tool Reference

| CLI Command | MCP Tool |
|---|---|
| `smartmoney traders` | `smartmoney_get_traders` |
| `smartmoney trader` | `smartmoney_get_trader_detail` |
