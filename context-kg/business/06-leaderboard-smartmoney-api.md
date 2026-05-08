<!-- triggers: leaderboard, 牛人榜, smart money, smartmoney, 聪明钱, top trader, signal, 信号, conviction, orbit, journal, copy trading, authorId, position-current, position-history, trade-records, top-trader-search, issue 94 -->
# Leaderboard & Smart Money Open API Spec

**Source**: [BE] LeaderBoard 牛人榜 Open API (Lark wiki `LXD8wjXzpiYhEyk3r8Dlfa6Tgqc`, revised 2026-04-01) + redesign on `feat/smartmoney-fix` branch (2026-05).

**Purpose**: Upstream OKX Open API endpoints that back the MCP `smartmoney_*` tool family in `packages/core/src/tools/smartmoney.ts`. This doc is the source of truth for **what each MCP tool sends upstream and what it returns** — input naming, default values, response shape (incl. nesting), tier enums, time anchors.

**Related PRD**: [牛人榜聪明钱 MCP](https://okg-block.sg.larksuite.com/docx/RERSdvXQYoXYquxyFJPllVSpgog) · Jira: [ALGO-35975](https://okcoin.atlassian.net/browse/ALGO-35975)

## Deployment Status

All endpoints below are live on `www.okx.com`:

| Endpoint | Status | Used by MCP |
|---|---|---|
| `3.1 GET /api/v5/orbit/public/leaderboard` | ✅ Live | `smartmoney_get_traders_by_filter`, `smartmoney_get_performance_by_trader` |
| `3.2 GET /api/v5/orbit/public/position-current` | ✅ Live | `smartmoney_get_trader_positions` |
| `3.3 GET /api/v5/orbit/public/position-history` | ✅ Live | `smartmoney_get_trader_positions_history` |
| `3.4 GET /api/v5/orbit/public/trade-records` | ✅ Live | `smartmoney_get_trader_orders_history` |
| `3.5 GET /api/v5/orbit/top-trader-search` | ✅ Live | `smartmoney_search_trader` |
| `~~4.1 GET /api/v5/journal/smartmoney/signal~~` | ✅ Live but **deprecated for MCP** | — superseded by `/overview` (4.3) — pass `instCcyList: ["BTC"]` to fetch a single-instrument signal |
| `4.2 GET /api/v5/journal/smartmoney/signal-history` | ✅ Live | `smartmoney_get_signal_trend_by_filter`, `smartmoney_get_signal_trend_by_trader` |
| `4.3 GET /api/v5/journal/smartmoney/overview` | ✅ Live | `smartmoney_get_signal_overview_by_filter`, `smartmoney_get_signal_overview_by_trader` |

## Field Drift vs Source Doc (3.x — from live responses)

1. **Leaderboard wrapper is double-nested**: live shape is `{ code, msg, data: { updateTime, data: [...] } }`. The wrapper carries `updateTime` (snapshot version), and the trader rows live in `data.data[]`. Spec tables imply a flat `data: [...]`. The MCP handler unwraps via `extractLeaderboardEnvelope` and re-attaches `updateTime` at the response top level.
2. **`rates[].statTime` is NOT Unix ms** — real format is `"240726"` (YYMMDD, 6-digit string). Source spec said "毫秒级 Unix 时间戳".
3. **`rates[].value` is a decimal ratio** (e.g. `-0.06` = -6% return), not an absolute value.
4. **Extra fields not in spec**:
   - `leaderboard`: `portrait` (avatar URL)
   - `trade-records`: `displayId` (instrument display alias)
5. **`position-current` confirmed shape**: `data[0].posData[]` (array nested under one wrapper object). MCP flattens to a plain `data: [...]` array and decorates each row with a derived `direction: "long" | "short"` (computed from `posSide` + sign of `pos` to handle one-way / `posSide="both"` mode).

## Final Path Prefix (Confirmed)

The source Lark doc lists API paths in two places; the 需求概览 prefixes are **authoritative** (confirmed by PM 2026-04-17, aligned with change log 2026-03-20 "API接口和 orbit 保持一致"):

- `3.1–3.4` (reuse priAPI) → **`/api/v5/orbit/public/*`**
- `3.5` (Top Trader full-text search) → **`/api/v5/orbit/top-trader-search`** (no `/public/` segment)
- `4.2 / 4.3` (aggregate signals) → **`/api/v5/journal/smartmoney/*`**

Ignore the `/api/v5/public/community/*` paths that still appear in the detailed 3.x / 4.x sections — those are stale drafts.

## Global Rules

- **Access control**: 私有 (private / authenticated). MCP uses `client.privateGet` for every endpoint below — users must connect API credentials before calling any `smartmoney_*` tool.
- **Rate limit**: per-tool `SMARTMONEY_RPS = 5` (lower than the default 20 because journal/orbit endpoints are heavier than market data).
- **Data format**: decimals as plain strings (no scientific notation, no trailing zeros). `"0.000001"` not `"1E-6"`.
- **Empty fields**: inapplicable fields return `""` or `null`, never `0` and never omitted. Ratios use decimal form (`0.1` = 10%).
- **Trader eligibility** (server-side, applied to *every* endpoint below): public record + Assets ≥ 10,000 + PNL ≥ 1,000 + last trade ≤ 14d + KYC passed. Historical data is NOT backfilled.
- **Error codes**:
  - `51000` — `{param0} 参数错误` (bad uniqueCode, bad enum, bad pagination)
  - `50014` — `必填参数 {%param} 不能为空`
  - `50025` — `参数 {0} 传值个数超过最大限制 {1}`

## Endpoint Catalog (8 APIs)

| # | Path | Purpose | MCP tools |
|---|---|---|---|
| 3.1 | `GET /api/v5/orbit/public/leaderboard` | Trader list + lookup-by-authorIds (reuse priAPI) | `smartmoney_get_traders_by_filter`, `smartmoney_get_performance_by_trader` |
| 3.2 | `GET /api/v5/orbit/public/position-current` | Trader's current positions | `smartmoney_get_trader_positions` |
| 3.3 | `GET /api/v5/orbit/public/position-history` | Trader's closed-position history | `smartmoney_get_trader_positions_history` |
| 3.4 | `GET /api/v5/orbit/public/trade-records` | Trader's recent order/fill records | `smartmoney_get_trader_orders_history` |
| 3.5 | `GET /api/v5/orbit/top-trader-search` | Top Trader nickname full-text search | `smartmoney_search_trader` |
| 4.2 | `GET /api/v5/journal/smartmoney/signal-history` | Time-series of aggregated signals | `smartmoney_get_signal_trend_by_filter`, `smartmoney_get_signal_trend_by_trader` |
| 4.3 | `GET /api/v5/journal/smartmoney/overview` | Multi-instrument latest snapshot | `smartmoney_get_signal_overview_by_filter`, `smartmoney_get_signal_overview_by_trader` |

> **Removed 2026-05**: 4.1 `GET /api/v5/journal/smartmoney/signal` is no longer wired to any MCP tool. To get a single-instrument signal, call `smartmoney_get_signal_overview_by_filter` (or `_by_trader`) with `instCcyList: ["BTC"]`. Note the per-item shape changed: 4.1 was flat, 4.3 is nested (`notional` / `longShortRatio` / `winRate`).

---

## 3.1 Trader Leaderboard — `GET /api/v5/orbit/public/leaderboard`

Paginated list of qualifying traders with filter and sort. Backed by priAPI `/priapi/v5/content/public/community/leaderboard`.

**Used by MCP**:
- `smartmoney_get_traders_by_filter` — discovery by criteria (no `authorIds`)
- `smartmoney_get_performance_by_trader` — bulk lookup by `authorIds`

### Request — `smartmoney_get_traders_by_filter`

| Upstream param | MCP input | Type | Default | Notes |
|---|---|---|---|---|
| `updateTime` | `updateTime` | String | — | Snapshot version `yyyyMMddHHmm` (UTC+8). Updated every ~5 min. Omit for latest. **NOT** the same as signal-side `asOfTime` (10-digit UTC). |
| `sortBy` | `sortBy` | String | `pnl` | Enum: `pnl`, `pnlRatio` |
| `period` | `period` | String | `90` | Enum: `3` / `7` / `30` / `90` (days) |
| `pnl` | `minPnl` | String | — | Numeric threshold (PnL ≥ value) — handler renames public `minPnl` → upstream `pnl` |
| `winRate` | `minWinRate` | String | — | Decimal (e.g. `"0.8"` = ≥80%) — handler renames public `minWinRate` → upstream `winRate` |
| `maxDrawdown` | `maxDrawdown` | String | — | Decimal (drawdown ≤ value) — same name on both sides |
| `asset` | `minAum` | String | — | Numeric (AUM ≥ value) — handler renames public `minAum` → upstream `asset` |
| `after` | `after` | String | — | Cursor — `authorId` of last item from previous page |
| `before` | `before` | String | — | Cursor — `authorId` of first item from previous page |
| `limit` | `limit` | Integer | `10` (MCP default), max 100 | Max results per page |

### Request — `smartmoney_get_performance_by_trader`

| Upstream param | MCP input | Type | Required | Default | Notes |
|---|---|---|---|---|---|
| `authorIds` | `authorIds` | Array<String> → CSV upstream | **Yes** | — | e.g. `["1001", "1002"]`. Handler joins to CSV before forwarding |
| `period` | `period` | String | No | `90` | Enum: `3` / `7` / `30` / `90` (days) — pass quoted |

> **Naming separation rule**: leaderboard uses *numeric thresholds* (`minPnl`, `minWinRate`, `maxDrawdown`, `minAum`); signal endpoints (4.2 / 4.3) use *percentile/threshold tiers* (`pnlTier`, `winRateTier`, `maxDrawdownTier`, `aumTier`). Public names are deliberately distinct so AI agents cannot cross-pollinate values between families.

### Response

Live shape: `{ code, msg, data: { updateTime, data: [...] } }`. MCP unwraps to flat `data: [...]` and surfaces `updateTime` at response top level.

| Field | Type | Notes |
|---|---|---|
| `updateTime` | String (top level) | `yyyyMMddHHmm` (UTC+8) — snapshot version, shared by every row |
| `authorId` | String | **Trader unique ID** |
| `nickName` | String | |
| `pnl` | String | Absolute PnL over `period` window |
| `pnlRatio` | String | PnL ratio (decimal) |
| `asset` | String | Total AUM |
| `winRate` | String | Lifetime win-rate (decimal 0~1). Source spec called this `winRatio` — outputSchema declares `winRate`; handler does no rename, so the upstream wire field name should match. |
| `maxDrawdown` | String | Max drawdown (decimal). Source spec called this `maxRetreat`; outputSchema declares `maxDrawdown` (no handler rename). |
| `onboardDuration` | String | Days onboarded (numeric string) |
| `portrait` | String | Avatar image URL |
| `rates` | Array | Equity-curve / PnL-rate time series |
| `rates[].statTime` | String | **YYMMDD string (e.g. `"240726"`) — NOT Unix ms; see Field Drift §2** |
| `rates[].value` | String | Cumulative PnL ratio at that day (decimal) |

---

## 3.2 Current Positions — `GET /api/v5/orbit/public/position-current`

Backed by priAPI `/priapi/v5/content/public/community/user/position-current`.

**Used by MCP**: `smartmoney_get_trader_positions`

### Request

| Upstream param | MCP input | Type | Required | Notes |
|---|---|---|---|---|
| `authorId` | `authorId` | String | **Yes** | Trader unique ID |
| `instCcy` | `instId` | String | No | MCP accepts full instId (e.g. `"BTC-USDT-SWAP"`) or bare base ccy (`"BTC"`); handler extracts base ccy via `extractBaseCcy` before forwarding upstream as `instCcy` |

### Response

Live shape: `{ data: [{ posData: [...] }] }`. MCP flattens to a plain array and decorates each row with derived `direction`.

| Field | Type | Notes |
|---|---|---|
| `posId` | String | Position unique ID |
| `instId` | String | e.g. `BTC-USDT-SWAP` |
| `instType` | String | `SWAP` / `SPOT` / `FUTURES` / `MARGIN` / `OPTION` |
| `posSide` | String | Raw upstream: `long` / `short` / `both` (one-way / net mode where `pos` sign encodes direction) |
| `direction` | String | **MCP-derived clean field**: `"long"` or `"short"`. Computed from `posSide` + sign of `pos` so agents do not have to branch on the `posSide="both"` case. |
| `posCcy` | String | Position currency (asset held), e.g. `"BTC"` |
| `quoteCcy` | String | Quote currency, e.g. `"USDT"` |
| `pos` | String | Position size — coins for SPOT/MARGIN, contracts (张) for SWAP/FUTURES/OPTION |
| `lever` | String | Leverage (`"1"` for spot) |
| `avgPx` | String | Volume-weighted entry price |
| `last` | String | Latest market/mark price |
| `notionalUsd` | String | Position notional in USD |
| `upl` | String | Unrealized (floating) PnL in `quoteCcy` |
| `pnl` | String | Realized PnL accrued so far in `quoteCcy` |
| `cTime` | String | Open time (Unix ms) |
| `positionIntensity` | String | **Computed by Open API**: `notionalUsd / trader.asset` — "conviction" metric (this position's notional as a share of trader's AUM). NOT present in priAPI. |

**Note**: priAPI also returns `uplRatio`, `margin`, `mgnRatio`, `markPx`, `liqPx`, `realizedPnl`, `fundingFee`, `fee`, `bePx` — surfacing in Open API is TBD, currently not exposed by MCP.

---

## 3.3 Position History — `GET /api/v5/orbit/public/position-history`

Backed by priAPI `/priapi/v5/content/public/community/user/position-history`.

**Used by MCP**: `smartmoney_get_trader_positions_history`

### Request

| Upstream param | MCP input | Type | Required | Notes |
|---|---|---|---|---|
| `authorId` | `authorId` | String | **Yes** | |
| `instCcy` | `instId` | String | No | Same dual-form (full instId or base ccy) → handler extracts base ccy |
| `after` | `after` | String | No | Cursor — fetch positions with `posId` smaller than this (older). Pass as quoted string (`posId` is 19-digit, number coercion loses precision) |
| `before` | `before` | String | No | Cursor — fetch with `posId` greater than this (newer) |
| `limit` | `limit` | Integer | `10` (MCP default), max 100 | |

### Response (`data[]`)

| Field | Type | Notes |
|---|---|---|
| `posId` | String | Closed-position ID; cursor key |
| `instId` | String | e.g. `BTC-USD-SWAP` |
| `instType` | String | `SWAP` / `FUTURES` / `MARGIN` / `SPOT` |
| `ctVal` | String | Contract face value (USD per contract) |
| `posSide` | String | `long` / `short` |
| `lever` | String | |
| `mgnMode` | String | `cross` / `isolated` |
| `marginCcy` | String | Margin currency |
| `quoteCcy` | String | |
| `openAvgPx` | String | |
| `closeAvgPx` | String | |
| `openMaxAmount` | String | Peak position size held (张 / contracts) |
| `closeAmount` | String | Total amount closed |
| `realizedPnl` | String | Cumulative realized PnL during lifetime (in `quoteCcy`) |
| `pnl` | String | Total realized PnL incl. fees + funding |
| `pnlRatio` | String | Realized PnL ratio (decimal) |
| `fee` | String | Cumulative trading fee (negative = cost) |
| `fundingFee` | String | Cumulative funding fee (negative = paid, positive = received) |
| `liquidationStatus` | String | `"0"` = normal close; `"1"` = liquidated |
| `closeType` | String | `allClose` / `partClose` / `liquidateClose` / `liquidateReceive` / `adl` |
| `cTime` | String | Open time (Unix ms) |
| `uTime` | String | Close time (Unix ms) |

MCP also returns top-level `pagination: { hasMore, nextAfter }` (cursor on `posId`).

---

## 3.4 Trade Records — `GET /api/v5/orbit/public/trade-records`

Backed by priAPI `/priapi/v5/content/public/community/user/trade-records`.

**Used by MCP**: `smartmoney_get_trader_orders_history`

### Request

| Upstream param | MCP input | Type | Required | Notes |
|---|---|---|---|---|
| `authorId` | `authorId` | String | **Yes** | |
| `instCcy` | `instId` | String | No | Same dual-form (full instId or base ccy) → handler extracts base ccy |
| `after` | `after` | String | No | Cursor on `ordId` (older) — quoted string |
| `before` | `before` | String | No | Cursor on `ordId` (newer) |
| `limit` | `limit` | Integer | `10` (MCP default), max 100 | |

### Response (`data[]`)

| Field | Type | Notes |
|---|---|---|
| `ordId` | String | Cursor key |
| `displayId` | String | Display-form instrument ID used in OKX UI (NOT in source spec — see Field Drift §4) |
| `instId` | String | |
| `instType` | String | `SWAP` / `SPOT` |
| `baseName` | String | e.g. `"BTC"` |
| `quoteName` | String | e.g. `"USD"` |
| `tradeQuoteCcy` | String | Quote currency the fill actually settled in |
| `side` | String | `buy` / `sell` |
| `posSide` | String | `long` / `short` |
| `ordType` | String | `limit` / `market` |
| `lever` | String | |
| `px` | String | Order price (may be empty/0 for market orders) |
| `avgPx` | String | Volume-weighted fill price |
| `sz` | String | Order size — coins (币) for SPOT, contracts (张) for SWAP/FUTURES |
| `value` | String | Notional in `quoteName` units |
| `cTime` | String | Order created (Unix ms) |
| `fillTime` | String | Last fill time (Unix ms) |
| `uTime` | String | Order updated (Unix ms) |

MCP also returns top-level `pagination: { hasMore, nextAfter }` (cursor on `ordId`).

---

## 3.5 Top Trader Search — `GET /api/v5/orbit/top-trader-search`

Nickname full-text recall intersected with the Top Trader set, ranked by OKX-platform follower count DESC.

**Used by MCP**: `smartmoney_search_trader`

### Request

| Upstream param | MCP input | Type | Required | Notes |
|---|---|---|---|---|
| `keyword` | `keyword` | String | **Yes** | Non-empty / non-whitespace nickname fragment (Latin or CJK) |

### Response (`data[]`, ≤10 items)

| Field | Type | Notes |
|---|---|---|
| `authorId` | String | Trader unique ID — pass to other `smartmoney_get_trader_*` tools |
| `nickName` | String | Display nickname matched against the keyword |
| `followerCount` | String | OKX-platform follower count (Twitter excluded). Sort key. |

Empty array when no recall intersects the Top Trader set.

---

## 4.2 Signal History — `GET /api/v5/journal/smartmoney/signal-history`

Time-series of aggregated long/short signal across hourly/daily buckets for one base currency. Sorted by time DESC.

**Used by MCP**:
- `smartmoney_get_signal_trend_by_filter` — pool defined by tier filters
- `smartmoney_get_signal_trend_by_trader` — pool restricted to `authorIds` (no tier filters)

> **2026-05 update**: `instCcy` (base currency only — e.g. `"BTC"`) replaces older `instId`. The endpoint operates on base-currency level.

### Request — common params

| Upstream param | MCP input | Type | Required | Default | Notes |
|---|---|---|---|---|---|
| `instCcy` | `instCcy` | String | **Yes** | — | Base ccy, e.g. `"BTC"` |
| `asOfTime` | `asOfTime` | String | No | current UTC hour | 10-digit `yyyyMMddHH` UTC. Returns the latest `limit` buckets ending at this anchor. **NOT** the same as leaderboard's 12-digit UTC+8 `updateTime` |
| `granularity` | `granularity` | String | No | `1h` | Enum: `1h` / `1d`. Other values (legacy `5m`/`15m`/`30m`/`4h`) silently fall back to `1h` |
| `limit` | `limit` | Integer | No | `24` | Range 1-500 |

### Request — `_by_filter` extra params (signal pool tier filters)

| Upstream param | MCP input | Type | Default | Notes |
|---|---|---|---|---|
| `sortBy` | `sortBy` | String | `pnl` | Enum: `pnl`, `pnlRatio` |
| `period` | `period` | String | `7` | Enum: `3` / `7` / `30` / `90` (days). Drives capability metrics + `winRateTier` filter |
| `pnlTier` | `pnlTier` | String | `PNL_ANY` | Percentile gate: `PNL_ANY`, `PNL_TOP50`, `PNL_TOP20`, `PNL_TOP5` |
| `winRateTier` | `winRateTier` | String | `WR_ANY` | Fixed threshold: `WR_ANY`, `WR_GE_50`, `WR_GE_80` |
| `maxDrawdownTier` | `maxDrawdownTier` | String | `MR_ANY` | Fixed threshold: `MR_ANY`, `MR_LE_20`, `MR_LE_50` |
| `aumTier` | `aumTier` | String | `AUM_ANY` | Percentile gate: `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` |
| `lmtNum` | `lmtNum` | Integer | `100` | Top-N traders ranked by `sortBy`. Range 1-2000 |

### Request — `_by_trader` extra params

| Upstream param | MCP input | Type | Required | Notes |
|---|---|---|---|---|
| `authorIds` | `authorIds` | Array<String> → CSV upstream | **Yes** | e.g. `["1001", "1002"]`. Tier filters NOT exposed in by_trader variant — backend uses defaults |

### Response (per-bucket items, sorted by ts DESC)

| Field | Type | Notes |
|---|---|---|
| `ccy` | String | Base currency / instrument key for this bucket |
| `dataVersion` | String | Snapshot version `yyyyMMddHH` UTC (10-digit) |
| `longRatio` | String | Headcount long ratio = longTraders / tradersWithPosition (0~1, NULL when no traders) |
| `shortRatio` | String | Headcount short ratio = shortTraders / tradersWithPosition |
| `weightedLongRatio` | String | Notional-weighted long ratio = Σ(long_notional) / Σ(notional) |
| `weightedShortRatio` | String | Notional-weighted short ratio = Σ(short_notional) / Σ(notional) |
| `longTraders` | Integer | Count of pool traders currently long (incl. dual-side) |
| `shortTraders` | Integer | Count of pool traders currently short |
| `tradersWithPosition` | Integer | Pool traders holding this asset at this bucket. Few = unreliable signal. |
| `tradersQualified` | Integer | Pool size after tier filters (incl. those without a position) |
| `netNotionalUsdt` | String | Net directional notional = long − short |
| `totalNotionalUsdt` | String | Gross notional = long + short. Tracks total capital deployed. |

> **Notional pricing**: `weightedLongRatio` / `weightedShortRatio` / `netNotionalUsdt` / `totalNotionalUsdt` are weighted by each trader's **entry price (`price_avg`)**, NOT mark price. Backend `notionalFactor = ABS(pos_qty) * COALESCE(contract_val, 1) * COALESCE(price_avg, 0)` (SelectDB doesn't store mark price). Values move only when positions are scaled (open / close / add) — they stay constant across hourly buckets when traders hold positions unchanged.

---

## 4.3 Multi-Instrument Overview — `GET /api/v5/journal/smartmoney/overview`

Cross-instrument latest snapshot — top-N most-held instruments at the current UTC hour, sorted by `tradersWithPosition` DESC. Subsumes the deprecated 4.1 single-instrument signal endpoint: pass `instCcyList: ["BTC"]` to retrieve the equivalent single-instrument signal as one nested item (note: 4.3's per-item shape is **nested** with `notional` / `longShortRatio` / `winRate` groups, whereas legacy 4.1 was flat).

**Used by MCP**:
- `smartmoney_get_signal_overview_by_filter` — pool defined by tier filters
- `smartmoney_get_signal_overview_by_trader` — pool restricted to `authorIds` (no tier filters)

> **2026-05 update**: Snapshot time is auto-resolved server-side to the current UTC hour — no client-side `dataVersion`/`ts` needed.

### Request — common params (instrument selection)

`topInstruments` and `instCcyList` are **mutually exclusive**. MCP throws an actionable error if both are passed; defaults to `topInstruments=20` if neither.

| Upstream param | MCP input | Type | Default | Notes |
|---|---|---|---|---|
| `topInstruments` | `topInstruments` | Integer | `20` | Top-N hottest instruments (sorted by `tradersWithPosition` DESC). Range 1-100 |
| `instCcyList` | `instCcyList` | Array<String> → CSV upstream | — | Specific base ccys, e.g. `["BTC", "ETH", "SOL"]`. Only returns prefix-matched instruments |

### Request — `_by_filter` extra params

Same signal pool tier filter set as 4.2 `_by_filter`: `sortBy`, `period` (default `7`), `pnlTier`, `winRateTier`, `maxDrawdownTier`, `aumTier`, `lmtNum` (default 100, max 2000).

### Request — `_by_trader` extra params

| Upstream param | MCP input | Type | Required | Notes |
|---|---|---|---|---|
| `authorIds` | `authorIds` | Array<String> → CSV upstream | **Yes** | Tier filters NOT exposed in by_trader variant |

### Response (per-instrument items, **nested** structure)

Outer item carries identity + headcount; aggregate metrics live in three nested groups (`notional`, `longShortRatio`, `winRate`) per the OpenAPI `/overview` spec.

#### Outer fields

| Field | Type | Notes |
|---|---|---|
| `ccy` | String | Instrument identifier — the field name is **`ccy`, NOT `instId`**, e.g. `"BTC-USDT-SWAP"` |
| `dataVersion` | String | Snapshot version `yyyyMMddHH` UTC (10-digit, e.g. `"2026043014"` = 2026-04-30 14:00 UTC, floored to the hour) |
| `tradersWithPosition` | Integer | Pool traders holding this asset (double-sided counted once). Higher = stronger consensus |
| `tradersQualified` | Integer | Pool size after tier filters (incl. those without a position) |
| `longTraders` | Integer | Pool traders currently long (incl. dual-side) |
| `shortTraders` | Integer | Pool traders currently short (incl. dual-side) |

#### `notional` group — capital flow

| Field | Type | Notes |
|---|---|---|
| `longNotionalUsdt` | String | Sum of long-side notional in USDT |
| `shortNotionalUsdt` | String | Sum of short-side notional in USDT |
| `netNotionalUsdt` | String | Net directional = long − short |
| `totalNotionalUsdt` | String | Gross = long + short |
| `totalNotionalVs24h` | String | Capital-flow change ratio vs 24h: `(curr − hist_24h) / hist_24h`. Positive = adding exposure; negative = retreating. NULL when hist=0. |
| `smartMoneyLongAvgEntry` | String | Long-side notional-weighted average entry (USDT). NULL when no long. Compare to current price to judge if following longs is cheap/expensive now. |
| `smartMoneyShortAvgEntry` | String | Short-side notional-weighted average entry (USDT). NULL when no short. |

#### `longShortRatio` group — ratio + historical deltas

| Field | Type | Notes |
|---|---|---|
| `longRatio` | String | Headcount long ratio = longTraders / tradersWithPosition. NULL when no traders |
| `shortRatio` | String | Headcount short ratio = shortTraders / tradersWithPosition |
| `weightedLongRatio` | String | Notional-weighted long ratio. NULL when no notional |
| `weightedShortRatio` | String | Notional-weighted short ratio = Σ(short_notional) / Σ(notional) |
| `longRatioVs1h` | String | `longRatio − hist_1h.longRatio`. NULL when no hist |
| `longRatioVs24h` | String | `longRatio − hist_24h.longRatio`. NULL when no hist |
| `longRatioVs7d` | String | `longRatio − hist_7d.longRatio`. NULL when no hist |

> **Notional pricing**: All `notional.*` fields and `longShortRatio.weightedLongRatio` / `weightedShortRatio` are weighted by each trader's **entry price (`price_avg`)**, NOT mark price. Backend `notionalFactor = ABS(pos_qty) * COALESCE(contract_val, 1) * COALESCE(price_avg, 0)` (SelectDB doesn't store mark price). Values move only when positions are scaled — they stay constant when traders hold positions unchanged.

#### `winRate` group — capability (driven by `period` window)

| Field | Type | Notes |
|---|---|---|
| `avgLongWinRate` | String | Mean closed-position win-rate (full-market) over `period` days for users currently long. NULL when sample below threshold |
| `avgShortWinRate` | String | Mean closed-position win-rate over `period` days for users currently short. NULL when sample below threshold |

---

## Tier Enums (shared by 4.2 / 4.3 signal-side `_by_filter` variants)

| Tier | Meaning |
|---|---|
| `pnlTier` (percentile) | `PNL_ANY`, `PNL_TOP50` (P≥50), `PNL_TOP20` (P≥80), `PNL_TOP5` (P≥95) |
| `winRateTier` (fixed threshold) | `WR_ANY`, `WR_GE_50`, `WR_GE_80` |
| `maxDrawdownTier` (fixed threshold) | `MR_ANY`, `MR_LE_20`, `MR_LE_50` |
| `aumTier` (percentile) | `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` |

Rationale: PnL and AUM use percentile because their distributions are heavy-tailed; winRate and maxDrawdown use fixed thresholds because their scales are bounded.

> **Don't cross-pollinate**: leaderboard 3.1 uses *numeric thresholds* (`minPnl`, `minWinRate`, `maxDrawdown`, `minAum`) — pass actual numbers like `"10000"`, `"0.8"`, `"0.2"`. Signal 4.2/4.3 use the *enum tiers* above. Public param names are deliberately distinct to prevent agents passing `pnl: "10000"` when they meant `pnlTier: "PNL_TOP20"`, or vice versa.

---

## Time Anchor Reference

Two distinct time anchors live in this module — keep them straight:

| Anchor | Used by | Format | Example |
|---|---|---|---|
| `updateTime` | 3.1 leaderboard (input + response) | 12-digit `yyyyMMddHHmm` **UTC+8** | `"202604301815"` |
| `asOfTime` | 4.2 signal-history (input only) | 10-digit `yyyyMMddHH` **UTC** | `"2026043014"` |
| `dataVersion` | 4.2 / 4.3 signal items (response only) | 10-digit `yyyyMMddHH` UTC (floored to hour) | `"2026043014"` |

**Do not cross-pass.** Tool descriptions explicitly warn agents not to pipe `updateTime` from leaderboard tools into signal tools' `asOfTime`.

---

## As-shipped tool surface (`packages/core/src/tools/smartmoney.ts`)

Implemented on the `feat/smartmoney-fix` branch, replacing the 5-tool design from issue #94 (MR !268). The new surface splits the original `_get_signal` and `_get_overview` into four `_by_filter` / `_by_trader` variants and adds a dedicated nickname search.

### Trader family (6 tools)

| Tool | Backing API | Key inputs |
|---|---|---|
| `smartmoney_get_traders_by_filter` | 3.1 | `updateTime`, `sortBy`, `period`, `minPnl`, `minWinRate`, `maxDrawdown`, `minAum`, `after`, `before`, `limit` |
| `smartmoney_get_performance_by_trader` | 3.1 (with `authorIds`) | `authorIds` (required), `period` |
| `smartmoney_get_trader_positions` | 3.2 | `authorId` (required), `instId` (full instId or base ccy) |
| `smartmoney_get_trader_positions_history` | 3.3 | `authorId` (required), `instId`, `after`, `before`, `limit` |
| `smartmoney_get_trader_orders_history` | 3.4 | `authorId` (required), `instId`, `after`, `before`, `limit` |
| `smartmoney_search_trader` | 3.5 | `keyword` (required) |

### Signal/Coin family (4 tools)

| Tool | Backing API | Key inputs |
|---|---|---|
| `smartmoney_get_signal_overview_by_filter` | 4.3 | `topInstruments` XOR `instCcyList`, `sortBy`, `period`, `pnlTier`, `winRateTier`, `maxDrawdownTier`, `aumTier`, `lmtNum` |
| `smartmoney_get_signal_overview_by_trader` | 4.3 | `authorIds` (required), `topInstruments` XOR `instCcyList` |
| `smartmoney_get_signal_trend_by_filter` | 4.2 | `instCcy` (required), `asOfTime`, `granularity`, `limit`, `sortBy`, `period`, `pnlTier`, `winRateTier`, `maxDrawdownTier`, `aumTier`, `lmtNum` |
| `smartmoney_get_signal_trend_by_trader` | 4.2 | `authorIds` (required), `instCcy` (required), `asOfTime`, `granularity`, `limit` |

All tools return the standard envelope `{ endpoint, requestTime, data, [pagination] }`. Per-tool RPS cap = 5.

## Timeline (from source doc)

| Date | Milestone | Owner |
|---|---|---|
| Apr 1 | Reuse priAPI 3.1–3.4 + endpoints 4.1–4.3 | 焦建明, 赵丽芳, 魏广福, Jay Fan, 金嘉怡 |
| Apr 2 | OpenAPI integration & regression | |
| Apr 3 / Apr 7 (Tue) | OpenAPI go-live + MCP development | 李乐伟 |
| Apr 8 | PM test & GTM prep | 甄小沐, 施炫瑋 |
| Apr 9 | Smart Money MCP go-live (issue #94, MR !268) | |
| May 2026 | `feat/smartmoney-fix` redesign — 5 → 10 tools, nested overview, `_by_filter`/`_by_trader` split, `top-trader-search` added | 李乐伟 |
