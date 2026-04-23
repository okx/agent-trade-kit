<!-- triggers: leaderboard, 牛人榜, smart money, smartmoney, 聪明钱, top trader, signal, 信号, conviction, orbit, journal, copy trading, authorId, position-current, position-history, trade-records, issue 94 -->
# Leaderboard & Smart Money Open API Spec

**Source**: [BE] LeaderBoard 牛人榜 Open API (Lark wiki `LXD8wjXzpiYhEyk3r8Dlfa6Tgqc`, revised 2026-04-01)

**Purpose**: Upstream OKX Open API endpoints that back **issue #94** (`feat(market): add smart money / top trader signal tools`). This doc is the source of truth for MCP tool design, parameter validation, and response mapping.

**Related PRD**: [牛人榜聪明钱 MCP](https://okg-block.sg.larksuite.com/docx/RERSdvXQYoXYquxyFJPllVSpgog) · Jira: [ALGO-35975](https://okcoin.atlassian.net/browse/ALGO-35975)

## Deployment Status (2026-04-21 confirmed)

All endpoints are live on `www.okx.com`:

| Endpoint | Status |
|---|---|
| `3.1 GET /api/v5/orbit/public/leaderboard` | ✅ Live |
| `3.2 GET /api/v5/orbit/public/position-current` | ✅ Live |
| `3.3 GET /api/v5/orbit/public/position-history` | ✅ Live |
| `3.4 GET /api/v5/orbit/public/trade-records` | ✅ Live |
| `4.1 GET /api/v5/journal/smartmoney/signal` | ✅ Live (went live 2026-04-20) |
| `4.2 GET /api/v5/journal/smartmoney/signal-history` | ✅ Live (went live 2026-04-20) |
| `4.3 GET /api/v5/journal/smartmoney/overview` | ✅ Live (went live 2026-04-20) |

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
- `4.1–4.3` (aggregate signals) → **`/api/v5/journal/smartmoney/*`**

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
| 4.1 | `GET /api/v5/journal/smartmoney/signal` | Aggregated smart-money signal for one instrument |
| 4.2 | `GET /api/v5/journal/smartmoney/signal-history` | Time-series of signal snapshots |
| 4.3 | `GET /api/v5/journal/smartmoney/overview` | Multi-instrument smart-money overview |

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

## 4.1 Single-Instrument Smart Money Signal — `GET /api/v5/journal/smartmoney/signal`

**No direct priAPI** — BE aggregates every minute from full-pool `position-current` snapshot. Returns aggregated directional bias, conviction, avg entry, and trend deltas for one instrument across the qualifying trader pool.

> **Confirmed 2026-04-21**: Response is a **flat array** `data[]` with a single object `data[0]`. All fields are top-level — no nested sub-objects.

### Request (12 params)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `instId` | String | No* | — | **Recommended.** Full instrument name (e.g. `BTC-USDT-SWAP`). Either instId or instCcy must be provided; instId takes precedence |
| `instCcy` | String | No* | — | Currency code (e.g. `BTC`). Applies to SPOT and SWAP only. Single currency only (comma-separated not supported). **May return empty `data: []` — prefer `instId`.** |
| `dataVersion` | String | No** | — | `yyyyMMddHHmm` UTC |
| `ts` | String | No** | — | UTC ms. **Either `dataVersion` or `ts` must be provided; if both, `ts` wins** |
| `sortType` | String | No | `pnl` | Enum: `pnl`, `pnlRatio` — selects who enters the pool |
| `period` | String | No | `90` | Enum: `3`, `7`, `30`, `90` (days) — win-ratio calculation window |
| `pnl` | String | No | `PNL_ANY` | Tier enum: `PNL_ANY`, `PNL_TOP50`, `PNL_TOP20`, `PNL_TOP5` |
| `winRatio` | String | No | `WR_ANY` | Tier enum: `WR_ANY`, `WR_GE_50`, `WR_GE_80` |
| `maxRetreat` | String | No | `MR_ANY` | Tier enum: `MR_ANY`, `MR_LE_20`, `MR_LE_50` |
| `asset` | String | No | `AUM_ANY` | Tier enum: `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` |
| `lmtNum` | Integer | No | `100` | Candidate trader pool size limit, range 1-500 |
| `authorIds` | String | No | — | Comma-separated user_id list (e.g. `1001,1002,1003`) |

\* At least one of `instId`/`instCcy` required.
\*\* At least one of `dataVersion`/`ts` required.

All enums are case-insensitive; invalid values silently fall back to default.

### Response (27 fields, flat `data[0]`)

| Field | Type | Notes |
|---|---|---|
| `instId` | String | Instrument name (echoes uppercase ccy name if instCcy was used) |
| `instType` | String | SPOT / MARGIN / FUTURES / SWAP / OPTION; empty when using instCcy path |
| `longRatio` | String | Long trader ratio (0~1, e.g. `"0.65"`) |
| `weightedLongRatio` | String | Notional-weighted long ratio |
| `avgLongWinRatio` | String | Mean winRatio of long-holders (period window) |
| `avgShortWinRatio` | String | Mean winRatio of short-holders |
| `longNotionalUsdt` | String | Total long notional value (USDT) |
| `shortNotionalUsdt` | String | Total short notional value (USDT) |
| `netNotionalUsdt` | String | Net notional (long − short, can be negative) |
| `tradersWithPosition` | Integer | Traders currently holding positions |
| `longTraders` | Integer | Long-side trader count |
| `shortTraders` | Integer | Short-side trader count |
| `vs1h` | String | longRatio delta vs 1h ago |
| `vs24h` | String | longRatio delta vs 24h ago |
| `vs7d` | String | longRatio delta vs 7d ago |
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
| `timestamp` | String | ISO-8601 string of `ts` (human-readable, e.g. `"2026-04-17T10:00:00Z"`) |
| `dataVersion` | String | `yyyyMMddHHmm` UTC, corresponds to `ts` |

---

## 4.2 Signal History — `GET /api/v5/journal/smartmoney/signal-history`

Time series of aggregated signals for one instrument. Sorted by `ts` DESC.

> **Confirmed 2026-04-21**: Response is a **flat array** `data[]`. No nested `snapshots[]` or `traderPool.*`. `instCcy` param is NOT supported by this endpoint — always use `instId`.

### Request (11 params)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `instId` | String | **Yes** | — | e.g. `BTC-USDT-SWAP` |
| `dataVersion` | String | No¹ | — | `yyyyMMddHHmm` UTC |
| `ts` | String | No¹ | — | UTC ms. Either `dataVersion` or `ts` required; if both, `ts` wins |
| `sortType` | String | No | `pnl` | Same enum as 4.1 |
| `period` | String | No | `90` | Same enum as 4.1 (only affects trader pool selection; response has no win-ratio fields) |
| `pnl` | String | No | `PNL_ANY` | Same tier enums as 4.1 |
| `winRatio` | String | No | `WR_ANY` | Same tier enums as 4.1 |
| `maxRetreat` | String | No | `MR_ANY` | Same tier enums as 4.1 |
| `asset` | String | No | `AUM_ANY` | Same tier enums as 4.1 |
| `granularity` | String | No | `1h` | Only `1h` or `1d`; other values (including old `5m`/`15m`/`30m`/`4h`) fall back to `1h` |
| `limit` | Integer | No | `24` | Data points to return, range 1-500 |

¹ At least one of `dataVersion`/`ts` required.

### Response (10 fields per item, flat `data[]`, sorted by ts DESC)

| Field | Type | Notes |
|---|---|---|
| `instId` | String | Echoes input instId |
| `longRatio` | String | Long ratio at this time bucket |
| `weightedLongRatio` | String | Capital-weighted long ratio |
| `tradersWithPosition` | Integer | Traders with positions at this time bucket |
| `netNotionalUsdt` | String | Net notional (long − short) |
| `totalNotionalUsdt` | String | Total notional (long + short) |
| `ts` | Long | Time bucket timestamp (UTC ms) |
| `tradersTotal` | Integer | Candidate pool size |
| `tradersQualified` | Integer | Traders passing filter criteria at this time bucket |
| `dataVersion` | String | `yyyyMMddHHmm` UTC for this time bucket |

### Tier Enums (shared with 4.1 & 4.3)

| Tier | Meaning |
|---|---|
| `pnl` (percentile) | `PNL_ANY`, `PNL_TOP50` (P≥50), `PNL_TOP20` (P≥80), `PNL_TOP5` (P≥95) |
| `winRatio` (fixed threshold) | `WR_ANY`, `WR_GE_50`, `WR_GE_80` |
| `maxRetreat` (fixed threshold) | `MR_ANY`, `MR_LE_20`, `MR_LE_50` |
| `asset` (percentile) | `AUM_ANY`, `AUM_TOP50`, `AUM_TOP20`, `AUM_TOP5` |

Rationale: PnL and AUM use percentile because their distributions are heavy-tailed; winRatio and maxRetreat use fixed thresholds because their scales are bounded.

---

## 4.3 Multi-Instrument Overview — `GET /api/v5/journal/smartmoney/overview`

Cross-instrument scan — returns smart money signal for the top-N most-held instruments, sorted by `tradersWithPosition` descending.

> **Confirmed 2026-04-21**: Response is a **flat array** `data[]`. No nested `signals[]`, `traderPool.*`, or `ccySignal` wrappers.

### Request (13 params)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `instType` | String | No | `SWAP` | Instrument type: SPOT / MARGIN / FUTURES / SWAP / OPTION |
| `dataVersion` | String | No¹ | — | `yyyyMMddHHmm` UTC |
| `ts` | String | No¹ | — | UTC ms. Either required; `ts` wins if both |
| `sortType` | String | No | `pnl` | Same enum as 4.1 |
| `period` | String | No | `90` | Same enum as 4.1 |
| `pnl` | String | No | `PNL_ANY` | Same tier enums as 4.1 |
| `winRatio` | String | No | `WR_ANY` | Same tier enums as 4.1 |
| `maxRetreat` | String | No | `MR_ANY` | Same tier enums as 4.1 |
| `asset` | String | No | `AUM_ANY` | Same tier enums as 4.1 |
| `lmtNum` | Integer | No | `100` | Candidate trader pool size limit |
| `topInstruments` | Integer | No | `20` | Return top N instruments (range 1-100), sorted by tradersWithPosition DESC |
| `instCcyList` | String | No | — | Comma-separated currencies (e.g. `BTC,ETH,SOL`); only returns prefix-matched instruments |
| `instCcy` | String | No | — | Same as instCcyList (compatibility alias); instCcyList takes precedence |

¹ At least one of `dataVersion`/`ts` required.

**Filter order**: SQL first limits by `topInstruments` → then filters by `instCcyList` currency prefix → `topNUsed` = final result count. So `topInstruments=3 & instCcyList=BTC` may return < 3 items.

### Response (11 fields per item, flat `data[]`)

| Field | Type | Notes |
|---|---|---|
| `instId` | String | Full instrument name (e.g. `BTC-USDT-SWAP`) |
| `longRatio` | String | Long ratio |
| `weightedLongRatio` | String | Capital-weighted long ratio |
| `tradersWithPosition` | Integer | Traders with positions |
| `netNotionalUsdt` | String | Net notional (long − short) |
| `vs24h` | String | longRatio delta vs 24h ago |
| `ts` | Long | Snapshot timestamp (UTC ms) |
| `tradersTotal` | Integer | Candidate pool size |
| `tradersQualified` | Integer | Traders passing filter criteria |
| `topNUsed` | Integer | Actual result count (= data.length) |
| `dataVersion` | String | `yyyyMMddHHmm` UTC |

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
- URL prefixes are final: `/api/v5/orbit/public/*` for 3.1–3.4, `/api/v5/journal/smartmoney/*` for 4.1–4.3.

## Timeline (from source doc)

| Date | Milestone | Owner |
|---|---|---|
| Apr 1 | Reuse priAPI 3.1–3.4 + endpoints 4.1–4.3 | 焦建明, 赵丽芳, 魏广福, Jay Fan, 金嘉怡 |
| Apr 2 | OpenAPI integration & regression | |
| Apr 3 / Apr 7 (Tue) | OpenAPI go-live + MCP development | 李乐伟 |
| Apr 8 | PM test & GTM prep | 甄小沐, 施炫瑋 |
| Apr 9 | Smart Money MCP go-live | |
