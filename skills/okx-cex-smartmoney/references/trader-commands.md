# Trader Commands Reference

Five atomic commands cover the trader side. The old composite `okx smartmoney trader` has been removed — to get a trader's full picture, fire `trader-performance`, `trader-positions`, and `trader-order-history` in parallel.

## smartmoney top-traders — Leaderboard Ranking

```bash
okx smartmoney top-traders [--sortBy <pnl|pnlRatio>] [--period <3|7|30|90>] [--pnl <n>] [--winRate <r>] [--maxDrawdown <r>] [--asset <n>] [--after <id>] [--before <id>] [--limit <n>] [--updateTime <ts>] [--json]
```

Pool ranking by numeric thresholds. `authorIds` direct-lookup mode has moved out into its own command (`trader-performance`).

### Pool Filter Parameters (numeric thresholds)

| Param | Required | Default | Description |
|---|---|---|---|
| `--sortBy` | No | `pnl` | Sort key: `pnl` or `pnlRatio` |
| `--period` | No | all-time | Time window: `3`, `7`, `30`, `90` (days) |
| `--pnl` | No | - | Min PnL (USD), e.g. `10` = PnL ≥ 10 |
| `--winRate` | No | - | Min win-rate (decimal). e.g. `0.8` = ≥ 80% |
| `--maxDrawdown` | No | - | Max drawdown (decimal). e.g. `0.1` = ≤ 10% |
| `--asset` | No | - | Min total asset (USD). e.g. `100` = AUM ≥ 100 |

> Renamed from previous version: `--sortType` → `--sortBy`, `--winRatio` → `--winRate`, `--maxRetreat` → `--maxDrawdown`. Returned-field names follow the same renames.

### Pagination Parameters

| Param | Required | Default | Description |
|---|---|---|---|
| `--after` | No | - | Cursor: return results after this `authorId` |
| `--before` | No | - | Cursor: return results before this `authorId` |
| `--limit` | No | `100` | Max results (max 100) |
| `--updateTime` | No | latest | Snapshot time anchor (UTC ms). Optional — handler floors to the hour. |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `dataVersion` | String | Snapshot version (UTC `yyyyMMddHHmm`，分钟位恒为 `00`，如 `202604282000`) |
| `authorId` | String | Trader unique ID |
| `nickName` | String | Display name |
| `pnl` | String | Absolute PnL (USD) |
| `pnlRatio` | String | PnL ratio |
| `winRate` | String | Win ratio (0.8 = 80%) |
| `maxDrawdown` | String | Max drawdown (decimal) |
| `asset` | String | Total asset (USD) |
| `onboardDuration` | String | Onboard days |
| `rates` | Array | Historical return time series. Each item: `value` (decimal return rate, e.g. `"-0.06"` = -6%) and `statTime` (`YYMMDD` 6-digit, e.g. `"240726"` — NOT Unix ms; see `context-kg/business/06-leaderboard-smartmoney-api.md` Field Drift §2). |

Top-level `pagination: { hasMore, nextAfter }` — `nextAfter` is the last item's `authorId`. Pass as `--after` for the next page.

### Trader Eligibility Criteria

Traders on the leaderboard must meet all of:
- Public performance status
- Assets ≥ 10,000 USD
- PnL ≥ 1,000 USD (for the chosen `--period`)
- Last trade within 14 days
- KYC fully verified

---

## smartmoney trader-performance — PnL / Win-Rate Profile (direct lookup)

```bash
okx smartmoney trader-performance --authorIds <id1>,<id2> [--period <3|7|30|90>] [--json]
```

Direct lookup for a known list of `authorIds`. No pool filter — the upstream endpoint returns the requested traders' performance regardless of leaderboard position. Use after `top-traders`, or to verify a specific user-supplied authorId list.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorIds` | Yes | - | Comma-separated trader IDs (e.g. `1001,1002,1003`) |
| `--period` | No | all-time | Performance period: `3`, `7`, `30`, `90` (days) |

Response fields: same shape as the leaderboard rows (`authorId`, `nickName`, `pnl`, `pnlRatio`, `winRate`, `maxDrawdown`, `asset`, `rates[]`, etc.).

---

## smartmoney trader-positions — Current Open Positions

```bash
okx smartmoney trader-positions --authorId <id> [--instId <id>] [--json]
```

Single trader, current open positions only.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorId` | Yes | - | Trader's unique author ID (from `top-traders` or `trader-performance`) |
| `--instId` | No | - | Filter by instrument. Accepts full instId (e.g. `BTC-USDT-SWAP`) or bare base ccy (e.g. `BTC`) — handler extracts base ccy for the upstream filter. |

> The flag accepts either form; the upstream endpoint filters by base currency only, so the handler extracts it automatically.

### Position Fields

| Field | Description |
|---|---|
| `posId` | Position unique ID |
| `instId` | Instrument (e.g. `BTC-USDT-SWAP`) |
| `instType` | SWAP, SPOT, etc. |
| `posSide` | long / short / both |
| `posCcy` | Position currency |
| `quoteCcy` | Quote currency |
| `pos` | Position size |
| `lever` | Leverage |
| `avgPx` | Entry avg price |
| `last` | Latest price |
| `notionalUsd` | Position value (USD) |
| `pnl` | Unrealized PnL (in quote currency) |
| `cTime` | Position open time (Unix ms) |
| `positionIntensity` | Conviction = notionalUsd / trader AUM |

---

## smartmoney trader-position-history — Closed Positions (realized PnL)

```bash
okx smartmoney trader-position-history --authorId <id> [--instId <id>] [--after <posId>] [--before <posId>] [--limit <n>] [--json]
```

Closed positions with realized PnL, paginated by `posId` cursor.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorId` | Yes | - | Trader's unique author ID |
| `--instId` | No | - | Filter by instrument (full instId like `BTC-USDT-SWAP` or bare base ccy like `BTC`; handler extracts base ccy) |
| `--after` | No | - | Cursor: return positions after this `posId` |
| `--before` | No | - | Cursor: return positions before this `posId` |
| `--limit` | No | `10` | Max positions per page (1–100) |

### Closed-Position Fields

| Field | Description |
|---|---|
| `posId` | Position ID |
| `instId` | Instrument |
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

## smartmoney trader-order-history — Order / Fill Records

```bash
okx smartmoney trader-order-history --authorId <id> [--instId <id>] [--after <ordId>] [--before <ordId>] [--limit <n>] [--json]
```

Order / fill flow. Renamed from the old `smartmoney trades` command to align with the cross-module `*_get_orders` family.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorId` | Yes | - | Trader's unique author ID |
| `--instId` | No | - | Filter by instrument (full instId like `BTC-USDT-SWAP` or bare base ccy like `BTC`; handler extracts base ccy) |
| `--after` | No | - | Cursor: return orders before this `ordId` |
| `--before` | No | - | Cursor: return orders after this `ordId` |
| `--limit` | No | `10` | Max orders per page (1–100) |

### Order Fields

| Field | Description |
|---|---|
| `ordId` | Order ID |
| `uniqueName` | System-generated unique identifier |
| `instId` | Instrument |
| `instType` | SWAP / SPOT |
| `nickName` | User nickname |
| `baseName` | Base currency |
| `quoteName` | Quote currency |
| `side` | buy / sell |
| `posSide` | long / short |
| `ordType` | limit / market |
| `lever` | Leverage |
| `px` | Order price |
| `avgPx` | Fill avg price |
| `sz` | Order size |
| `value` | Position value (in quote currency) |
| `cTime` | Order time (Unix ms) |
| `fillTime` | Fill time (Unix ms) |
| `uTime` | Order update time (Unix ms) |

Top-level `pagination: { hasMore, nextAfter }` — `nextAfter` is the last item's `ordId`.

---

## MCP Tool Reference

| CLI Command | MCP Tool |
|---|---|
| `smartmoney top-traders` | `smartmoney_get_traders_by_filter` |
| `smartmoney trader-performance` | `smartmoney_get_traders_by_id` |
| `smartmoney trader-positions` | `smartmoney_get_trader_positions` |
| `smartmoney trader-position-history` | `smartmoney_get_trader_positions_history` |
| `smartmoney trader-order-history` | `smartmoney_get_trader_orders_history` |
