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
| `rates` | Array | Historical return time series. Each item: `value` (String, decimal return rate, e.g. `"-0.06"` = -6%) and `statTime` (String, **YYMMDD** 6-digit, e.g. `"240726"` — NOT Unix ms despite what the upstream spec table says; see `context-kg/business/06-leaderboard-smartmoney-api.md` Field Drift §2). |

### Pagination Metadata (top-level `pagination` field)

`smartmoney_get_traders` returns a top-level `pagination` object alongside `data`:

| Field | Type | Description |
|---|---|---|
| `hasMore` | Boolean | `true` when `data.length >= limit` (more results may follow) |
| `nextAfter` | String | `authorId` of the last item — pass as `--after` in the next call (only present when `hasMore=true`) |

**Example pagination loop:**
```bash
# Page 1
okx smartmoney traders --period 30 --limit 100 --json
# → pagination.hasMore=true, pagination.nextAfter="A123"

# Page 2
okx smartmoney traders --period 30 --limit 100 --after A123 --json
```

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

## smartmoney positions — Trader's Current Open Positions

```bash
okx smartmoney positions --authorId <id> [--instCcy <ccy>] [--json]
```

Atomic endpoint backing the `positions` slice of `smartmoney trader`. Use when you only need open positions and want to skip the profile + trades round-trips.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorId` | Yes | - | Trader's unique author ID (from `smartmoney traders`) |
| `--instCcy` | No | - | Filter by base currency (e.g. `BTC`); SPOT/FUTURES only |

Response fields: same as the **Position Fields** table above (`posId`, `instId`, `posSide`, `pos`, `lever`, `avgPx`, `last`, `notionalUsd`, `pnl`, `cTime`, `positionIntensity`).

---

## smartmoney trades — Trader's Recent Order/Fill Records

```bash
okx smartmoney trades --authorId <id> [--instCcy <ccy>] [--after <ordId>] [--before <ordId>] [--limit <n>] [--json]
```

Atomic endpoint backing the `trades` slice of `smartmoney trader`, with cursor pagination.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorId` | Yes | - | Trader's unique author ID |
| `--instCcy` | No | - | Filter by base currency |
| `--after` | No | - | Cursor: return trades before this `ordId` |
| `--before` | No | - | Cursor: return trades after this `ordId` |
| `--limit` | No | `10` | Max trades per page (1–100) |

Response fields: same as the **Trade Record Fields** table above. The response also includes top-level `pagination: { hasMore, nextAfter }` — `nextAfter` is the last item's `ordId`; pass it as `--after` for the next page.

---

## smartmoney position-history — Trader's Closed-Position History

```bash
okx smartmoney position-history --authorId <id> [--instCcy <ccy>] [--after <posId>] [--before <posId>] [--limit <n>] [--json]
```

New endpoint (no equivalent in `smartmoney trader`) — closed positions with realized PnL, paginated.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorId` | Yes | - | Trader's unique author ID |
| `--instCcy` | No | - | Filter by base currency |
| `--after` | No | - | Cursor: return positions before this `posId` |
| `--before` | No | - | Cursor: return positions after this `posId` |
| `--limit` | No | `10` | Max positions per page (1–100) |

Response fields:

| Field | Description |
|---|---|
| `posId` | Position ID |
| `instId` | Instrument (e.g. BTC-USD-SWAP) |
| `ctVal` | Contract value per contract |
| `posSide` | long / short |
| `lever` | Leverage |
| `openAvgPx` / `closeAvgPx` | Open / close avg price |
| `openMaxAmount` / `closeAmount` | Max held / closed size (contracts) |
| `realizedPnl` | Realized PnL |
| `pnl` | Close PnL |
| `pnlRatio` | Realized PnL ratio (decimal) |
| `closeType` | `allClose` / `partClose` / `liquidateClose` / `liquidateReceive` / `adl` |
| `cTime` / `uTime` | Open / close time (Unix ms) |

Top-level `pagination: { hasMore, nextAfter }` — `nextAfter` is the last item's `posId`.

---

## MCP Tool Reference

| CLI Command | MCP Tool |
|---|---|
| `smartmoney traders` | `smartmoney_get_traders` |
| `smartmoney trader` | `smartmoney_get_trader_detail` (composite) |
| `smartmoney positions` | `smartmoney_get_trader_positions` (atomic) |
| `smartmoney trades` | `smartmoney_get_trader_trades` (atomic, paginated) |
| `smartmoney position-history` | `smartmoney_get_trader_position_history` (atomic, paginated) |
