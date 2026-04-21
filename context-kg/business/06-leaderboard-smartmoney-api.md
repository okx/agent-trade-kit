<!-- triggers: leaderboard, 牛人榜, smart money, smartmoney, 聪明钱, top trader, signal, 信号, conviction, orbit, journal, copy trading, authorId, position-current, position-history, trade-records, issue 94 -->
# Leaderboard & Smart Money Open API Spec

**Source**: [BE] LeaderBoard 牛人榜 Open API (Lark wiki `LXD8wjXzpiYhEyk3r8Dlfa6Tgqc`, revised 2026-04-01)

**Purpose**: Upstream OKX Open API endpoints that back **issue #94** (`feat(market): add smart money / top trader signal tools`). These are NOT yet implemented in this repo — this doc is the source of truth for MCP tool design, parameter validation, and response mapping. Cross-check field names and types here before coding.

**Related PRD**: [牛人榜聪明钱 MCP](https://okg-block.sg.larksuite.com/docx/RERSdvXQYoXYquxyFJPllVSpgog) · Jira: [ALGO-35975](https://okcoin.atlassian.net/browse/ALGO-35975)

## Deployment Status (2026-04-17 live probe)

Tested against `www.okx.com` with a live account:

| Endpoint | Status |
|---|---|
| `3.1 GET /api/v5/orbit/public/leaderboard` | ✅ Live, returns real traders |
| `3.2 GET /api/v5/orbit/public/position-current` | ✅ Live |
| `3.3 GET /api/v5/orbit/public/position-history` | ✅ Live |
| `3.4 GET /api/v5/orbit/public/trade-records` | ✅ Live |
| `4.1 GET /api/v5/journal/public/smartmoney/signal` | ⏳ Scheduled 2026-04-20 go-live — currently 404 |
| `4.2 GET /api/v5/journal/public/smartmoney/signal-history` | ⏳ Scheduled 2026-04-20 go-live — currently 404 |
| `4.3 GET /api/v5/journal/public/smartmoney/overview` | ⏳ Scheduled 2026-04-20 go-live — currently 404 |

`journal/*` currently returns OKX's marketing HTML (gateway doesn't route the prefix yet); `public/community/smartmoney/*` returns plain "Not Found". Tried variants `journal/public/smartmoney`, `public/community/smartmoney`, `orbit/public/smartmoney`, `journal/smartmoney` — all 404 as of 2026-04-17. Re-probe after 2026-04-20 to confirm paths and field shapes.

## Field Drift vs Source Doc (3.x — from live responses)

1. **Response is double-wrapped**: actual shape is `{ code, msg, data: { data: [...] } }`, not `{ code, msg, data: [...] }` as the spec tables imply. Client must unwrap twice.
2. **`rates[].statTime` is NOT Unix ms** — real format is `"240726"` (YYMMDD, 6-digit string). Spec says "统计时间戳" / "毫秒级 Unix 时间戳".
3. **`rates[].value` is a decimal ratio** (e.g. `-0.06` = -6% return), not an absolute value.
4. **Extra fields not in spec**:
   - `leaderboard`: `portrait` (avatar URL)
   - `trade-records`: `displayId` (instrument display alias)
5. **`position-current` confirmed shape**: `data[0].posData[]` (object with positions array), matches spec.

## Final Path Prefix (Confirmed)

The source Lark doc lists API paths in two places; the 需求概览 prefixes are **authoritative** (confirmed by PM 2026-04-17, aligned with change log 2026-03-20 "API接口和 orbit 保持一致"):

- `3.1–3.4` (reuse priAPI) → **`/api/v5/orbit/public/*`**
- `4.1–4.3` (aggregate signals) → **`/api/v5/journal/public/smartmoney/*`**

Ignore the `/api/v5/public/community/*` paths that still appear in the detailed 3.x / 4.x sections — those are stale drafts.

## Global Rules

- **Access control**: 私有 (private / authenticated). Error codes follow the standard OKX convention — all responses have `{code, msg, data}`.
- **Data format**: decimals as plain strings (no scientific notation, no trailing zeros). `"0.000001"` not `"1E-6"`.
- **Empty fields**: inapplicable fields return `""`, never `0` and never omitted. Ratios use decimal form (`0.1` = 10%).
- **Trader eligibility** (applied server-side to *every* open API below): public record + Assets ≥ 10,000 + PNL ≥ 1,000 + last trade ≤ 14d + KYC passed. Historical data is NOT backfilled — same rule as 牛人榜 screening.
- **Error codes**:
  - `51000` — `{param0} 参数错误` (bad uniqueCode, bad enum, bad pagination)
  - `50014` — `必填参数 {%param} 不能为空`
  - `50025` — `参数 {0} 传值个数超过最大限制 {1}`

## Endpoint Catalog (7 APIs)

| # | Path | Purpose |
|---|---|---|
| 3.1 | `GET /api/v5/orbit/public/leaderboard` | Trader list with filter/sort (reuse priAPI) |
| 3.2 | `GET /api/v5/orbit/public/position-current` | Trader's current positions |
| 3.3 | `GET /api/v5/orbit/public/position-history` | Trader's closed-position history |
| 3.4 | `GET /api/v5/orbit/public/trade-records` | Trader's recent order/fill records |
| 4.1 | `GET /api/v5/journal/public/smartmoney/signal` | Aggregated smart-money signal for one instrument |
| 4.2 | `GET /api/v5/journal/public/smartmoney/signal-history` | Time-series of signal snapshots |
| 4.3 | `GET /api/v5/journal/public/smartmoney/overview` | Multi-instrument smart-money overview |

---

## 3.1 Trader Leaderboard — `GET /api/v5/orbit/public/leaderboard`

Paginated list of qualifying traders with filter and sort. Backed by priAPI `/priapi/v5/content/public/community/leaderboard`.

### Request

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `dataVersion` | String | No | — | Snapshot version `yyyyMMddHHmm`. Updated every 5 min. Omit for latest. |
| `sortType` | String | No | `pnl` | Enum: `pnl`, `pnl_ratio` (maps to priAPI `sortBy`) |
| `period` | String | No | `""` | Enum: `""` (current), `3`, `7`, `30`, `90` — days lookback (maps to priAPI `timeSpan`) |
| `pnl` | String | No | `""` | Numeric threshold; returns traders with `pnl ≥ value`. Max 16 digits |
| `winRatio` | String | No | `""` | Decimal (`0.8` = 80%); returns `winRatio ≥ value` |
| `maxRetreat` | String | No | `""` | Decimal; returns `maxRetreat ≤ value` |
| `asset` | String | No | `""` | Numeric; returns `aum ≥ value` |
| `authorIds` | Array<String> | No | — | Filter to specific authorIds (return only matched) |
| `after` | String | No | — | Pagination cursor — numeric authorId string |
| `before` | String | No | — | Pagination cursor — numeric authorId string |
| `limit` | String | No | `100` | Max `100` |

### Response (`data[]`)

| Field | Type | Notes |
|---|---|---|
| `dataVersion` | String | `yyyyMMddHHmm` |
| `authorId` | String | **Trader unique ID** |
| `nickName` | String | |
| `pnl` | String | Absolute PnL |
| `pnlRatio` | String | PnL ratio (decimal) |
| `asset` | String | Total AUM |
| `winRatio` | String | |
| `maxRetreat` | String | Max drawdown |
| `onboardDuration` | String | Days onboarded |
| `rates` | Array | Historical PnL rate time series |
| `rates[].value` | String | Rate at that timestamp |
| `rates[].statTime` | String | **YYMMDD string (e.g. `"240726"`) — NOT Unix ms; see Field Drift §2 above** |

---

## 3.2 Current Positions — `GET /api/v5/orbit/public/position-current`

Backed by priAPI `/priapi/v5/content/public/community/user/position-current`.

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `authorId` | String | **Yes** | Trader unique ID |
| `instCcy` | String | No | Filter by base ccy (e.g. `BTC` from `BTC-USDT`). Applicable to SPOT / FUTURES |

### Response (`data[].posData[]`)

| Field | Type | Notes |
|---|---|---|
| `posId` | String | Position unique ID |
| `instId` | String | e.g. `BSV-USDT-SWAP` |
| `instType` | String | `SWAP`, `SPOT`, etc. |
| `posSide` | String | `long` / `short` / `both` |
| `posCcy` | String | Position currency |
| `quoteCcy` | String | Quote currency |
| `pos` | String | Position size |
| `lever` | String | Leverage |
| `avgPx` | String | Entry average price |
| `last` | String | Latest price |
| `notionalUsd` | String | Position notional in USD |
| `pnl` | String | Realized PnL (in quote ccy) |
| `cTime` | String | Open time (Unix ms) |
| `positionIntensity` | String | **Computed by OPEN API**: `notionalUsd / trader.asset` — "conviction" metric. NOT present in priAPI; requires joining trader profile + position tables |

**Note**: priAPI also returns `uplRatio`, `margin`, `mgnRatio`, `markPx`, `liqPx`, `upl`, `realizedPnl`, `fundingFee`, `fee`, `bePx` — exposure in Open API TBD. Check final BE contract.

---

## 3.3 Position History — `GET /api/v5/orbit/public/position-history`

Backed by priAPI `/priapi/v5/content/public/community/user/position-history`.

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `authorId` | String | **Yes** | |
| `instCcy` | String | No | Base ccy filter |
| `after` | String | No | Cursor — fetch before this `posId` |
| `before` | String | No | Cursor — fetch after this `posId` |
| `limit` | String | No | Default **10** |

### Response (`data[]`)

| Field | Type | Notes |
|---|---|---|
| `posId` | String | |
| `instId` | String | e.g. `BTC-USD-SWAP` |
| `instType` | String | |
| `ctVal` | String | Contract value (per contract) |
| `posSide` | String | `long` / `short` |
| `lever` | String | |
| `quoteCcy` | String | |
| `openAvgPx` | String | |
| `closeAvgPx` | String | |
| `openMaxAmount` | String | Max position size held (张 / contracts) |
| `closeAmount` | String | Close size (张 / contracts) |
| `realizedPnl` | String | |
| `pnl` | String | Close PnL |
| `pnlRatio` | String | Realized PnL ratio (decimal) |
| `closeType` | String | `allClose` / `partClose` / `liquidateClose` / `liquidateReceive` / `adl` |
| `cTime` | String | Open time (Unix ms) |
| `uTime` | String | Close time (Unix ms) |

---

## 3.4 Trade Records — `GET /api/v5/orbit/public/trade-records`

Backed by priAPI `/priapi/v5/content/public/community/user/trade-records`.

### Request

| Field | Type | Required | Notes |
|---|---|---|---|
| `authorId` | String | **Yes** | |
| `instCcy` | String | No | Base ccy filter (SPOT / FUTURES) |
| `after` | String | No | Cursor — fetch before this `ordId` |
| `before` | String | No | Cursor — fetch after this `ordId` |
| `limit` | String | No | Default **10** |

### Response (`data[]`)

| Field | Type | Notes |
|---|---|---|
| `ordId` | String | |
| `uniqueName` | String | System-generated unique id |
| `instId` | String | |
| `instType` | String | `SWAP` / `SPOT` |
| `nickName` | String | |
| `baseName` | String | e.g. `BTC` |
| `quoteName` | String | e.g. `USD` |
| `side` | String | `buy` / `sell` |
| `posSide` | String | `long` / `short` |
| `ordType` | String | `limit` / `market` |
| `lever` | String | |
| `px` | String | Order price |
| `avgPx` | String | Fill average price |
| `sz` | String | Order size (币 for spot, 张 for contracts) |
| `value` | String | Notional (in `quoteName` unit) |
| `cTime` | String | Order created (Unix ms) |
| `fillTime` | String | Latest fill (Unix ms) |
| `uTime` | String | Order updated (Unix ms) |

---

## 4.1 Single-Instrument Smart Money Signal — `GET /api/v5/journal/public/smartmoney/signal`

**No direct priAPI** — BE aggregates every minute from full-pool `position-current` snapshot. Returns aggregated directional bias, conviction, avg entry, and trend deltas for one instrument across the qualifying trader pool.

### Request

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `dataVersion` | String | No¹ | — | `yyyyMMddHHmm` |
| `ts` | String | No¹ | — | Snapshot Unix ms. **Either `dataVersion` or `ts` must be provided; if both, `ts` wins** |
| `sortType` | String | No | `pnl` | Enum: `pnl`, `pnlRatio` — selects who enters the pool |
| `period` | String | No | `""` | Enum: `""`, `3`, `7`, `30`, `90` (days) |
| `pnl` | String | No | `""` | Tier enum: `PNL_ANY`, `PNL_TOP50` (≥P50), `PNL_TOP20` (≥P80), `PNL_TOP5` (≥P95). **Daily update** |
| `winRatio` | String | No | `""` | Tier enum: `WR_ANY`, `WR_GE_50`, `WR_GE_80`. Daily update |
| `maxRetreat` | String | No | `""` | Tier enum: `MR_ANY`, `MR_LE_20`, `MR_LE_50`. Daily update |
| `asset` | String | No | `""` | Tier enum: `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5`. Daily update |
| `lmtNum` | String | No | — | Top-N by `sortType` descending |
| `authorIds` | Array<String> | No | — | Restrict pool to these IDs |
| `instCcy` | String | No | — | Base ccy filter (SPOT / SWAP) |

¹ At least one of `dataVersion`/`ts` required.

### Response (`data` object, not array)

| Field | Type | Notes |
|---|---|---|
| `dataVersion` | String | `yyyyMMddHHmm` |
| `ts` | String | Snapshot Unix ms |
| `traderPool.totalPool` | String | Total qualifying traders |
| `traderPool.tradersWithPosition` | String | Traders with an `instId` position — "how many smart money watching this coin" |
| `traderPool.tradersTotal` | String | Traders passing the filter |
| `longRatio` | String | `longCount / (longCount + shortCount)` — headcount long/short ratio |
| `weightedLongRatio` | String | `Σ(notionalUsd × isLong) / Σ(notionalUsd)` — capital-weighted directional bias |
| `avgLongWinRatio` | String | Mean winRatio of long-holders for this instId |
| `avgShortWinRatio` | String | Mean winRatio of short-holders |
| `trend.longRatioVs1h` | String | `current - snapshot_1h_ago` (delta) |
| `trend.longRatioVs24h` | String | Delta vs 24h ago |
| `trend.longRatioVs7d` | String | Delta vs 7d ago (may be dropped — large data) |
| `entryDistribution.smartMoneyLongAvgEntry` | String | `Σ(openAvgPx × notional) / Σ(notional)` over long positions |
| `entryDistribution.smartMoneyShortAvgEntry` | String | Same over short positions |
| `capitalFlow.totalNotionalVs24h` | String | `(T_now - T_24h) / T_24h` — change in total notional |

Example response includes nested `marketContext` (`currentPrice`, `priceChange24h`, `fundingRate`, `openInterest`, `longShortAccountRatio`) — final inclusion TBD with BE.

---

## 4.2 Signal History — `GET /api/v5/journal/public/smartmoney/signal-history`

Time series of aggregated signals for one instrument.

### Request

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `instId` | String | **Yes** | — | e.g. `BTC-USDT-SWAP` |
| `granularity` | String | No | `4h` | Enum: `1h`, `4h`, `1d` — bucket interval for snapshot replay |
| `dataVersion` | String | No¹ | — | `yyyyMMddHHmm`, timezone UTC+8 |
| `ts` | String | No¹ | — | Unix ms. Either `dataVersion` or `ts` required; if both, `ts` wins |
| `period` | String | No | `""` | Same enum as 4.1 |
| `pnl` / `winRatio` / `maxRetreat` / `asset` | String | No | `""` | Same tier enums as 4.1 |
| `instCcy` | String | No | — | Base ccy filter |

### Response (`data`)

| Field | Type | Notes |
|---|---|---|
| `instId` | String | |
| `granularity` | String | Echo of request |
| `snapshots[]` | Array | One entry per bucket |
| `snapshots[].ts` | String | Unix ms |
| `snapshots[].longRatio` | String | Headcount ratio at snapshot |
| `snapshots[].weightedLongRatio` | String | Capital-weighted ratio |
| `snapshots[].tradersWithPosition` | String | Count of holders at snapshot |
| `snapshots[].netNotionalUsdt` | String | `Σ long_notional - Σ short_notional` — net directional USD |
| `snapshots[].totalNotionalUsdt` | String | `Σ long_notional + Σ short_notional` — total capital on instId |
| `snapshots[].priceAtSnapshot` | String | Last trade price from `/api/v5/market/ticker` `last` field at snapshot time |

Also returns `traderPool.totalPool` and `traderPool.qualified` (post-filter count) at the top level.

### Tier Enums (shared with 4.1 & 4.3)

| Tier | Meaning |
|---|---|
| `pnlTier` (percentile) | `PNL_ANY`, `PNL_TOP50` (P≥50), `PNL_TOP20` (P≥80), `PNL_TOP5` (P≥95) |
| `winRateTier` (fixed threshold) | `WR_ANY`, `WR_GE_50`, `WR_GE_80` |
| `maxRetreatTier` (fixed threshold) | `MR_ANY`, `MR_LE_20`, `MR_LE_50` |
| `aumTier` (percentile) | `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` |

Rationale: PnL and AUM use percentile because their distributions are heavy-tailed; winRatio and maxRetreat use fixed thresholds because their scales are bounded.

---

## 4.3 Multi-Instrument Overview — `GET /api/v5/journal/public/smartmoney/overview`

Cross-instrument scan — returns smart money signal for the top-N most-held instruments, sorted by `tradersWithPosition` descending.

### Request

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `dataVersion` | String | No¹ | — | `yyyyMMddHHmm` |
| `ts` | String | No¹ | — | Unix ms. Either required; `ts` wins if both |
| `lmtNum` | String | No | — | Top-N traders by `sortType` to include in pool |
| `sortType` | String | No | `pnl` | `pnl` / `pnlRatio` |
| `authorIds` | Array<String> | No | — | Restrict pool |
| `period` | String | No | `""` | Same enum |
| `pnl` / `winRatio` / `maxRetreat` / `asset` | String | No | `""` | Same tier enums as 4.1 |
| `instCcyList` | Object | No | — | Filter to specific base ccys (SPOT / SWAP) |
| `topInstruments` | Array<String> | No | — | Pre-set instrument list (e.g. `["SOL","BTC","ETH"]`) |

### Response (`data`)

| Field | Type | Notes |
|---|---|---|
| `ts` / `dataVersion` | String | |
| `traderPool.totalPool` | String | Full leaderboard count |
| `traderPool.qualified` | String | Passing filter |
| `traderPool.topNUsed` | String | Actual traders matched on instId |
| `signals[]` | Array | **Sorted by `tradersWithPosition` DESC** |
| `signals[].instId` | String | |
| `signals[].tradersWithPosition` | String | # of smart-money holders — low count = weak signal |
| `signals[].longRatio` | String | Headcount long ratio |
| `signals[].weightedLongRatio` | String | Capital-weighted long ratio |
| `signals[].netNotionalUsdt` | String | Net directional USD (cross-instrument conviction comparator) |
| `signals[].longRatioVs24h` | String | 24h delta |

Example response also uses a `ccySignal` object nesting — verify final shape vs example JSON with BE.

---

## Mapping to Issue #94 Tool Design

Potential MCP tool split (subject to design review per `docs/mcp-design-guideline.md`):

| Tool candidate | Backing API | Notes |
|---|---|---|
| `market_list_top_traders` | 3.1 | Tier/threshold filters, pagination |
| `market_get_trader_positions` | 3.2 | By `authorId` |
| `market_get_trader_position_history` | 3.3 | Pagination by `posId` |
| `market_get_trader_trades` | 3.4 | Pagination by `ordId` |
| `market_get_smart_money_signal` | 4.1 | Single instrument aggregate |
| `market_get_smart_money_history` | 4.2 | Time series |
| `market_get_smart_money_overview` | 4.3 | Top-N cross-instrument |

**Design reminders when implementing**:
- Parameters must be flat (string/number/boolean only) per `docs/mcp-design-guideline.md`. Array params like `authorIds`, `topInstruments`, `instCcyList` should be CSV-joined strings at the MCP boundary and split in the handler.
- Registry entry required in `docs/module-registry.md`; module token budget ≤ 25k.
- Every new MCP tool needs a paired CLI command (Triangle Sync: CLI / MCP / Skills).
- Tier enums (`PNL_TOP20`, `WR_GE_80`, ...) should be validated with zod enums, not free-form strings.
- URL prefixes are final: `/api/v5/orbit/public/*` for 3.1–3.4, `/api/v5/journal/public/smartmoney/*` for 4.1–4.3.

## Timeline (from source doc)

| Date | Milestone | Owner |
|---|---|---|
| Apr 1 | Reuse priAPI 3.1–3.4 + endpoints 4.1–4.3 | 焦建明, 赵丽芳, 魏广福, Jay Fan, 金嘉怡 |
| Apr 2 | OpenAPI integration & regression | |
| Apr 3 / Apr 7 (Tue) | OpenAPI go-live + MCP development | 李乐伟 |
| Apr 8 | PM test & GTM prep | 甄小沐, 施炫瑋 |
| Apr 9 | Smart Money MCP go-live | |
