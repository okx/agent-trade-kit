# Trader Commands Reference

Six atomic commands cover the trader side. The old composite `okx smartmoney trader` has been removed — to get a trader's full picture, fire `performance-by-trader`, `trader-positions`, and `trader-orders-history` in parallel. Use `search-trader` to resolve a nickname to one or more `authorId`s before any of the `--authorId`-keyed tools.

## smartmoney traders-by-filter — Leaderboard Ranking

```bash
okx smartmoney traders-by-filter [--sortBy <pnl|pnlRatio>] [--period <3|7|30|90>] [--minPnl <n>] [--minWinRate <r>] [--maxDrawdown <r>] [--minAum <n>] [--after <id>] [--before <id>] [--limit <n>] [--updateTime <ts>] [--json]
```

Pool ranking by numeric thresholds. `authorIds` direct-lookup mode has moved out into its own command (`performance-by-trader`).

### Pool Filter Parameters (numeric thresholds)

Names use `min*` / `max*` prefixes — distinct from the signal-side `*Tier` enum names (e.g. `--pnlTier PNL_TOP20`) so the two surfaces have disjoint flag namespaces. Don't try to pass `--pnlTier` here, and don't try to pass `--minPnl` to a signal command.

| Param | Required | Default | Description |
|---|---|---|---|
| `--sortBy` | No | `pnl` | Sort key: `pnl` or `pnlRatio` |
| `--period` | No | `90` | Time window: `3`, `7`, `30`, `90` (days). Default `90` matches the leaderboard UI. |
| `--minPnl` | No | - | Min PnL (USD), e.g. `10000` = PnL ≥ 10,000 |
| `--minWinRate` | No | - | Min win-rate (decimal). e.g. `0.8` = ≥ 80% |
| `--maxDrawdown` | No | - | Max drawdown (decimal). e.g. `0.1` = ≤ 10% |
| `--minAum` | No | - | Min AUM (USD). e.g. `1000` = AUM ≥ 1,000 |

> Renamed from previous version: `--pnl` → `--minPnl`, `--winRate` → `--minWinRate`, `--asset` → `--minAum`. The new names disambiguate from signal-side `*Tier` enums (since `--pnl` could be confused with `--pnlTier`).

### Pagination Parameters

| Param | Required | Default | Description |
|---|---|---|---|
| `--after` | No | - | Cursor: return results after this `authorId` |
| `--before` | No | - | Cursor: return results before this `authorId` |
| `--limit` | No | `10` | Max results per page (1–100) |
| `--updateTime` | No | latest | Snapshot version key in `yyyyMMddHHmm` (UTC+8). Omit for the latest snapshot (refreshed every ~5 min). |

### Response top-level

| Field | Type | Description |
|---|---|---|
| `data` | Array | Trader rows (see below). |
| `updateTime` | String | **Snapshot version of the leaderboard**, in `yyyyMMddHHmm` (UTC+8, e.g. `202604301815`). Lives at the **response top level** (shared by every item in `data`), NOT inside each row. Refreshed approximately every 5 minutes. Omitted when the wrapper does not provide it. Renamed from the legacy `dataVersion`. |
| `pagination` | Object | `{ hasMore, nextAfter }` cursor metadata. |

### Per-row fields (`data[]`)

| Field | Type | Description |
|---|---|---|
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

## smartmoney performance-by-trader — PnL / Win-Rate Profile (direct lookup)

```bash
okx smartmoney performance-by-trader --authorIds <id1>,<id2> [--sortBy <pnl|pnlRatio>] [--period <3|7|30|90>] [--json]
```

Direct lookup for a known list of `authorIds`. The upstream endpoint returns the requested traders' performance regardless of leaderboard position. Use after `traders-by-filter`, or to verify a specific user-supplied authorId list.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorIds` | Yes | - | Comma-separated trader IDs (e.g. `1001,1002,1003`) |
| `--sortBy` | Yes | `pnl` | Result sort key: `pnl` (absolute USD profit) or `pnlRatio` (percentage return) |
| `--period` | Yes | `90` | Performance period: `3`, `7`, `30`, `90` (days). |

Response fields: same shape as the leaderboard rows (`authorId`, `nickName`, `pnl`, `pnlRatio`, `winRate`, `maxDrawdown`, `asset`, `rates[]`, etc.).

---

## smartmoney search-trader — Search Top Traders by Nickname

```bash
okx smartmoney search-trader --keyword <name> [--json]
```

Searches the KOL full-text index by nickname keyword and intersects the recall set with the Top Trader (profitable leaderboard) set. Returns up to **10 matches**, sorted by OKX-platform follower count DESC.

Use this when the user only knows a nickname (e.g. "alice", "小明") and you need the `authorId` before calling any other `--authorId`-keyed tool.

| Param | Required | Default | Description |
|---|---|---|---|
| `--keyword` | Yes | - | Nickname search keyword. Non-empty / non-whitespace. Supports CJK input. |

### Response Fields

| Field | Type | Description |
|---|---|---|
| `authorId` | String | Trader unique ID. Pass to `performance-by-trader` / `trader-positions` / etc. |
| `nickName` | String | Display nickname matched against the keyword. |
| `followerCount` | String | OKX-platform follower count (Twitter excluded). Sort key. |

> Returns an empty array `data: []` when there is no recall, or recall has no intersection with the Top Trader set. The CLI prints "No matching top traders" in that case.

> Backend constraints: only Top Traders are searchable here; non-profitable leaderboard candidates are filtered out. For an authoritative direct lookup by known IDs use `performance-by-trader --authorIds`.

---

## smartmoney trader-positions — Current Open Positions

```bash
okx smartmoney trader-positions --authorId <id> [--instId <id>] [--json]
```

Single trader, current open positions only.

| Param | Required | Default | Description |
|---|---|---|---|
| `--authorId` | Yes | - | Trader's unique author ID (from `traders-by-filter` or `performance-by-trader`) |
| `--instId` | No | - | Filter by instrument. Accepts full instId (e.g. `BTC-USDT-SWAP`) or bare base ccy (e.g. `BTC`) — handler extracts base ccy for the upstream filter. |

> The flag accepts either form; the upstream endpoint filters by base currency only, so the handler extracts it automatically.

### Position Fields

| Field | Description |
|---|---|
| `posId` | Position unique ID |
| `instId` | Instrument (e.g. `BTC-USDT-SWAP`) |
| `instType` | SWAP, SPOT, etc. |
| `posSide` | Raw upstream direction: `long` / `short` / `net` (and legacy `both`). `net`/`both` = net/one-way mode; sign of `pos` encodes direction. |
| `direction` | Derived clean direction: `long` / `short`. Handler computes from `posSide` + sign of `pos`, so agents don't have to branch on the `posSide="net"` net-mode case. Prefer this over `posSide` for direction logic. |
| `posCcy` | Position currency |
| `quoteCcy` | Quote currency |
| `pos` | Position size |
| `lever` | Leverage |
| `avgPx` | Entry avg price |
| `last` | Latest price |
| `notionalUsd` | Position value (USD) |
| `upl` | Unrealized (floating) PnL, in quote currency |
| `pnl` | Realized PnL accrued so far on this position, in quote currency |
| `cTime` | Position open time (Unix ms) |
| `positionIntensity` | Conviction = notionalUsd / trader AUM |

---

## smartmoney trader-positions-history — Closed Positions (realized PnL)

```bash
okx smartmoney trader-positions-history --authorId <id> [--instId <id>] [--after <posId>] [--before <posId>] [--limit <n>] [--json]
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
| `instType` | Instrument business line: `SWAP` / `FUTURES` / `MARGIN` / `SPOT` |
| `ctVal` | Contract value per contract |
| `posSide` | long / short |
| `lever` | Leverage |
| `quoteCcy` | Quote currency the position settled in (e.g. `USDT`) |
| `openAvgPx` / `closeAvgPx` | Open / close avg price |
| `openMaxAmount` / `closeAmount` | Max held / closed size (contracts) |
| `realizedPnl` | Realized PnL |
| `pnl` | Close PnL |
| `pnlRatio` | Realized PnL ratio (decimal) |
| `closeType` | `allClose` / `partClose` / `liquidateClose` / `liquidateReceive` / `adl` |
| `cTime` / `uTime` | Open / close time (Unix ms) |

Top-level `pagination: { hasMore, nextAfter }` — `nextAfter` is the last item's `posId`.

---

## smartmoney trader-orders-history — Order / Fill Records

```bash
okx smartmoney trader-orders-history --authorId <id> [--instId <id>] [--after <ordId>] [--before <ordId>] [--limit <n>] [--json]
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
| `instId` | Instrument |
| `displayId` | Display-form instrument ID used in OKX UI |
| `instType` | SWAP / SPOT |
| `baseName` | Base currency |
| `quoteName` | Quote currency |
| `tradeQuoteCcy` | Quote currency the fill actually settled in |
| `side` | buy / sell |
| `posSide` | long / short |
| `ordType` | limit / market |
| `lever` | Leverage |
| `px` | Order price |
| `avgPx` | Fill avg price |
| `sz` | Order size (币 for SPOT, 张 for SWAP/FUTURES) |
| `value` | Notional in `quoteName` units |
| `cTime` | Order time (Unix ms) |
| `fillTime` | Fill time (Unix ms) |
| `uTime` | Order update time (Unix ms) |

Top-level `pagination: { hasMore, nextAfter }` — `nextAfter` is the last item's `ordId`.

---

## MCP Tool Reference

| CLI Command | MCP Tool |
|---|---|
| `smartmoney traders-by-filter` | `smartmoney_get_traders_by_filter` |
| `smartmoney performance-by-trader` | `smartmoney_get_performance_by_trader` |
| `smartmoney search-trader` | `smartmoney_search_trader` |
| `smartmoney trader-positions` | `smartmoney_get_trader_positions` |
| `smartmoney trader-positions-history` | `smartmoney_get_trader_positions_history` |
| `smartmoney trader-orders-history` | `smartmoney_get_trader_orders_history` |
