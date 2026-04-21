<!-- triggers: dca, dca bot, dca strategy, bot.dca, martingale, contract dca, spot dca, order-algo, ai-param, cycle, safety order, maxSafetyOrds, pxSteps, volMult, tpPct, slPct, trigger sign, rsi trigger, sync copy, async copy, copy trading dca, profitSharingRatio, trackingMode, curCycleld -->
# DCA (Dollar-Cost Averaging) Bot OpenAPI Spec

**Source**: [DCA OpenAPI Doc](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/wikis/Open-API-Doc/DCA-OpenAPI-Doc) (repo wiki, mirror of [Lark original](https://okg-block.sg.larksuite.com/docx/G2R6dI2dmoLv3ux1pvOlobAYggD))

**Purpose**: Upstream OKX spec for the DCA bot (Martingale-style recurring entry with safety orders). Covers the two controllers powering the `bot.dca` MCP module:

- **V1 Spot DCA** (`SpotDcaApiController`) — 7 endpoints, long-only, no leverage
- **V2 Contract DCA** (`TradingBotDcaV2Controller`) — 12 endpoints, long/short, configurable leverage, copy-trading support

**Base path**: `/api/v5/tradingBot/dca`

Use this as the source of truth when validating request/response shapes, enum values, and sync-copy-follower restrictions in `packages/core/src/tools/bot/dca.ts` and related code.

---

## Spot DCA (V1) — SpotDcaApiController

### 1.1 POST `/order-algo` — Create Spot DCA Strategy

**Auth**: TRADE

#### Request Body (`ApiPlaceDcaParam`)

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| instId | Y | String | Instrument id | `BTC-USDT` |
| initOrdAmt | Y | String | Initial order amount (quote currency) | `10` |
| reserveFunds | Y | String | Whether to reserve funds (`true`/`false`) | `TRUE` |
| safetyOrdAmt | Y | String | Safety order amount | `10` |
| maxSafetyOrds | Y | String | Maximum safety orders count | `3` |
| pxSteps | Y | String | Initial price deviation percentage (0.10 = 10%) | `0.1` |
| pxStepsMult | Y | String | Price step multiplier | `2` |
| volMult | Y | String | Volume multiplier | `2` |
| tpPct | Y | String | Take-profit percentage (0.0005 = 0.05%) | `0.0005` |
| slPct | Y | String | Stop-loss percentage | `0.0005` |
| triggerType | Y | String | Trigger type: `1` = instant, `2` = signal | `1` |
| direction | Y | String | Direction (only `long` supported) | `long` |
| triggerSign | N | Object | RSI signal parameters (required when triggerType=2) | see below |
| tag | N | String | Tag (pattern limited) | - |
| sourceAlgoId | N | String | Source algo id (for copy trading) | `1231231221211` |
| algoClOrdId | N | String | Client-defined algo order id | `A1231231221211` |

#### `triggerSign` Object

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| timeframe | Y | String | K-line period: `3m`, `5m`, `15m`, `30m`, `1H`, `4H`, `1D`, `3D` | `3m` |
| oversoldThold | Y | String | RSI oversold threshold | `30` |
| triggerCond | Y | String | Trigger condition (only `cross_down`) | `cross_down` |
| timePeriod | Y | String | Time period (only `14`) | `14` |
| indicator | Y | String | Indicator (only `rsi`) | `rsi` |

#### Response (`AlgoSPOTDCAOrderVO`)

`{ "code": "0", "msg": "", "data": [{ "algoId": "12345", "sCode": "0", "sMsg": "" }] }`

---

### 1.2 POST `/stop-order-algo` — Stop Spot DCA Strategy

**Auth**: TRADE

#### Request Body (`List<StopStrategyParam>`)

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| algoOrdType | Y | String | Algo order type (`spot_dca`) | `spot_dca` |
| instId | Y | String | Instrument id. Required for OpenAPI — backend validates non-blank when `isOpenAPI=true` (except Recurring type) | `BTC-USDT` |
| stopType | Y | String | Stop type: `1`=stop & sell, `2`=stop without sell. Required for OpenAPI — backend validates non-blank when `SpecailApiOrdType != DEFAULT` | `1` |

#### Response (`StrategyVO`)

`{ "code": "0", "msg": "", "data": [{ "algoId": "12345", "sCode": "0", "sMsg": "" }] }`

---

### 1.3 GET `/orders-algo-pending` — Active Spot DCA Strategy List

**Auth**: READ

> `ordType` is forced to `spot_dca` internally.

#### Query Parameters (`QueryStrategyParam`)

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | N | String | Filter by strategy id | `12345` |
| after | N | String | Pagination cursor: request data newer than this algoId (exclusive) | `345` |
| before | N | String | Pagination cursor: request data older than this algoId (exclusive) | `345` |
| limit | N | String | Max results (default 100, max 100) | `100` |

#### Response (`OpenAPIQueryDcaStrategyVO`)

Paginated list of active spot DCA strategies.

---

### 1.4 GET `/orders-algo-history` — Historical Spot DCA Strategy List

**Auth**: READ

> `ordType` and `sortType` are forced to `spot_dca` and `modify_time` internally.

#### Query Parameters (`QueryStrategyParam`)

Same shape as 1.3 (`algoId`, `after`, `before`, `limit`).

#### Response (`OpenAPIQueryDcaStrategyHistoryVO`)

Paginated list of historical spot DCA strategies.

---

### 1.5 GET `/orders-algo-details` — Spot DCA Strategy Detail

**Auth**: READ

#### Query Parameters

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y\* | String | Strategy id | `12345` |

> \*Code-level `required=false`, but if not provided the response will be empty and meaningless. When provided but strategy not found, returns error `STRATEGY_EXIST_OR_OVER`. **Treat as business-required.**

#### Response (`OpenApiQueryDcaStrategyInfoVO`)

Single strategy detail.

---

### 1.6 GET `/sub-orders` — Spot DCA Sub Orders

**Auth**: READ

#### Query Parameters (`QueryStrategyOrderParam`)

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| type | Y | String | Order type: `filled` or `live` | `filled` |
| cycleId | N | String | Cycle id (must >= 1 if provided) | `1` |
| after | N | String | Pagination cursor (forward) | - |
| before | N | String | Pagination cursor (backward) | - |
| limit | N | String | Max results | `20` |

#### Response (`OpenAPIQueryDcaSubOrderVO`)

Paginated list of sub orders.

---

### 1.7 GET `/ai-param` — Query Spot DCA AI Parameters

**Auth**: None (rate limited)

#### Query Parameters (`QuerySpotDcaAiParam`)

| Field | Required | Type | Description | Validation | Example |
|-------|----------|------|-------------|------------|---------|
| instId | Y | String | Instrument id (uppercase) | Not blank, uppercase+num pattern | `BTC-USDT` |
| userRiskMode | Y | String | User risk mode | `conservative` / `moderate` / `aggressive` | `aggressive` |

#### Response (`QuerySpotDcaAiVO`)

AI recommended parameters: `initOrdAmt`, `safetyOrdAmt`, `maxSafetyOrds`, `pxSteps`, `pxStepsMult`, `volMult`, `tpPct`, `slPct`, etc.

---

## Contract DCA (V2) — TradingBotDcaV2Controller

> **Important**: All V2 endpoints only accept `algoOrdType=contract_dca`. The DTO `@StringMatch` annotation allows both `spot_dca` and `contract_dca` at validation layer, but controller method `ensureContractDcaOnly()` explicitly rejects `spot_dca` at runtime with parameter error. **Always pass `contract_dca`.**

---

### 2.1 POST `/create` — Create Contract DCA Strategy

**Auth**: TRADE

#### Request Body (`CreateDcaBotRequest`)

| Field | Required | Type | Description | Validation | Example |
|-------|----------|------|-------------|------------|---------|
| instId | Y | String | Contract instrument id | Not blank, uppercase+num | `BTC-USDT-SWAP` |
| algoOrdType | Y | String | Algo order type | `contract_dca` only | `contract_dca` |
| initOrdAmt | Y | String | Initial order amount (USDT) | > 0 | `2000` |
| direction | Y | String | Direction | `long` / `short` | `long` |
| lever | Y | String | Leverage multiplier | >= 1 | `5` |
| maxSafetyOrds | Y | String | Max safety orders (0 = no DCA) | >= 0 | `5` |
| tpPct | Y | String | Take-profit percentage (0.05 = 5%) | Not blank, numeric (`@NumberMatch`) | `0.05` |
| pxSteps | N | String | Initial price deviation (0.05 = 5%) | >= 0.001 | `0.05` |
| pxStepsMult | N | String | Price step multiplier | >= 0.01 | `2` |
| safetyOrdAmt | N | String | Safety order amount | > 0 | `200` |
| volMult | N | String | Volume multiplier | - | `2` |
| slPct | N | String | Stop-loss percentage | - | `0.05` |
| slMode | N | String | Stop-loss price type | `limit` / `market` | `limit` |
| allowReinvest | N | Boolean | Reinvest profit (default true) | `true` / `false` | `TRUE` |
| triggerParams | N | List | Trigger parameters | see below | - |
| trackingMode | N | String | Copy trading tracking mode | `sync` / `async` | `sync` |
| profitSharingRatio | N | String | Profit sharing ratio | 0 ~ 0.3 | `0.1` |

#### `triggerParams` Item (`TriggerParam`)

| Field | Required | Type | Description | Allowable Values | Example |
|-------|----------|------|-------------|------------------|---------|
| triggerAction | Y | String | Trigger action | `start` | `start` |
| triggerStrategy | Y | String | Trigger strategy | `instant`, `price`, `rsi` | `instant` |
| triggerCond | N | String | Trigger condition | `cross_up`, `cross_down` | `cross_down` |
| triggerPx | N | String | Trigger price | numeric | - |
| thold | N | String | RSI threshold | - | `30` |
| timePeriod | N | String | RSI time period | - | `14` |
| timeframe | N | String | RSI timeframe | - | `3m` |

#### Response (`CreateBotResult`)

`{ "code": "0", "msg": "", "data": [{ "algoId": "12345", "sCode": "0", "sMsg": "" }] }`

---

### 2.2 POST `/stop` — Stop Contract DCA Strategy

**Auth**: TRADE

#### Request Body (`StopDcaBotRequest`)

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| algoOrdType | Y | String | Algo order type (`contract_dca`) | `contract_dca` |

#### Response (`StopBotResult`)

`{ "code": "0", "msg": "", "data": [{ "algoId": "12345", "sCode": "0", "sMsg": "" }] }`

---

### 2.3 POST `/margin/add` — Add Margin

**Auth**: TRADE

#### Request Body (`AdjustMarginRequest`)

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| amt | Y | String | Adjustment amount (> 0) | `100` |

#### Response (`AdjustMarginResult`)

`{ "code": "0", "msg": "", "data": [{ "algoId": "12345", "algoOrdType": "contract_dca", "sCode": "0", "sMsg": "" }] }`

---

### 2.4 POST `/margin/reduce` — Reduce Margin

**Auth**: TRADE

Request/Response: Same shape as `/margin/add`.

---

### 2.5 POST `/settings/take-profit` — Update Take-Profit Price

**Auth**: TRADE

> ⚠️ Sync copy followers are **blocked** from this operation.

#### Request Body (`UpdateTakeProfitRequest`)

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| algoOrdType | Y | String | Algo order type (`contract_dca`) | `contract_dca` |
| tpPrice | Y | String | New take-profit price (> 0) | `31500` |

> `tpPrice` will be truncated to instrument tick size precision.

#### Response (`TakeProfitResult`)

`{ "code": "0", "msg": "", "data": [{ "algoId": "12345", "algoOrdType": "contract_dca", "sCode": "0", "sMsg": "" }] }`

---

### 2.6 POST `/settings/reinvestment` — Update Reinvestment Setting

**Auth**: TRADE

#### Request Body (`ReinvestmentSettingRequest`)

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| algoOrdType | Y | String | Algo order type (`contract_dca`) | `contract_dca` |
| allowReinvest | Y | Boolean | Reinvestment switch | `TRUE` |

#### Response (`ReinvestmentResult`)

`{ "code": "0", "msg": "", "data": [{ "algoId": "12345", "algoOrdType": "contract_dca", "sCode": "0", "sMsg": "" }] }`

---

### 2.7 POST `/orders/manual-buy` — Manual Buy (Add Position)

**Auth**: TRADE

> ⚠️ Sync copy followers are **blocked** from this operation.

#### Request Body (`ManualBuyRequest`)

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| algoOrdType | Y | String | Algo order type (`contract_dca`) | `contract_dca` |
| amt | Y | String | Order quantity | `5` |
| price | N | String | Order price (blank for market) | `42000.5` |

> `price` will be truncated to instrument tick size precision.

#### Response — Success (`ManualBuyResponse`)

`{ "code": "0", "msg": "", "data": [{ "algoId": "12345", "algoOrdType": "contract_dca", "diffAmount": "0" }] }`

- `diffAmount`: Amount transferred from trading account to virtual sub-account. `"0"` means sub-account had sufficient funds.

#### Response — Failure (`ManualBuyFailureResponse`)

`{ "code": "1", "msg": "", "data": [{ "diffAmount": "57.12", "sCode": "51008", "sMsg": "Order failed. Your available balance is insufficient." }] }`

---

### 2.8 GET `/position-details` — Bot Position Details

**Auth**: TRADE

#### Query Parameters

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| algoOrdType | Y | String | Algo order type (`contract_dca`) | `contract_dca` |

#### Response (`BotPositionDetailsResponse`)

| Field | Type | Description |
|-------|------|-------------|
| algoId | String | Strategy id |
| algoOrdType | String | `contract_dca` |
| instId | String | Instrument id |
| curCycleld | String | Current cycle id. **Note**: JSON key is `curCycleld` (lowercase L + d), **not** `curCycleId`. This is a legacy typo in `@JsonProperty("curCycleld")` — Java field is `curCycleId` but serialized as `curCycleld`. Already live, **do not change** without frontend coordination. |
| startTime | String | Current cycle start time (Unix ms) |
| fillManualOrds | String | Filled manual orders count |
| fillSafetyOrds | String | Filled safety orders count |
| fundingFee | String | Current cycle funding fee |
| initPx | String | Initial order fill price |
| notionalUsd | String | Position value (USDT) |
| avgPx | String | Average position cost |
| upl | String | Unrealized PnL |
| liqPx | String | Estimated liquidation price |
| sz | String | Position size (contracts) |
| slPx | String | Stop-loss price |
| tpPx | String | Take-profit price |
| fee | String | Current cycle transaction fee |

> For sync copy followers: `fillManualOrds`, `fillSafetyOrds`, `initPx`, `avgPx`, `slPx`, `tpPx` are **masked** (empty string).

---

### 2.9 GET `/cycle-list` — Cycle List (Paginated)

**Auth**: TRADE

#### Query Parameters

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| algoOrdType | Y | String | Algo order type (`contract_dca`) | `contract_dca` |
| instId | N | String | Instrument id (not used currently) | `BTC-USDT-SWAP` |
| before | N | String | CycleId cursor (backward, exclusive) | `5` |
| after | N | String | CycleId cursor (forward, exclusive) | `1` |
| limit | N | String | Max results (default 100, max 100) | `20` |

#### Response (`CycleDetailsResponse`)

| Field | Type | Description |
|-------|------|-------------|
| algoId | String | Strategy id |
| cycleId | String | Cycle id |
| currentCycle | Boolean | Is current cycle |
| realizedPnl | String | Realized PnL |
| startTime | String | Start time (Unix ms) |
| endTime | String | End time (Unix ms, empty if running) |
| cycleStatus | String | `running` / `stopped` |
| fee | String | Transaction fee |
| avgPx | String | Average entry price |
| tpPx | String | Take-profit price |

> For sync copy followers: `avgPx`, `tpPx` are **masked** (empty string).

---

### 2.10 GET `/ongoing-list` — Active Bot List (Paginated)

**Auth**: TRADE

#### Query Parameters

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoOrdType | Y | String | Algo order type (`contract_dca`) | `contract_dca` |
| algoId | N | String | Filter by strategy id | `12345` |
| instId | N | String | Filter by instrument | `BTC-USDT-SWAP` |
| before | N | String | AlgoId cursor (backward, exclusive) | - |
| after | N | String | AlgoId cursor (forward, exclusive) | - |
| limit | N | String | Max results (default 100, max 100) | `20` |

#### Response (`BotRecord`)

| Field | Type | Description |
|-------|------|-------------|
| algoId | String | Strategy id |
| algoOrdType | String | `contract_dca` |
| copyType | String | `0`=normal, `1`=copy w/o sharing, `2`=copy w/ sharing, `3`=lead |
| instId | String | Instrument id |
| ctVal | String | Contract face value |
| state | String | `starting` / `running` / `pending_signal` / `stopping` / `finished` / `canceled` |
| direction | String | `long` / `short` |
| trackingMode | String | `sync` / `async` |
| lever | String | Leverage |
| initOrdAmt | String | Initial order amount |
| safetyOrdAmt | String | Safety order amount |
| maxSafetyOrds | String | Max safety orders |
| pxSteps | String | Price deviation percentage |
| pxStepsMult | String | Price step multiplier |
| volMult | String | Volume multiplier |
| triggerParams | List | Trigger parameters |
| tpPriceRange | String | Take-profit price range |
| slPct | String | Stop-loss percentage |
| slMode | String | Stop-loss mode |
| transferInMargin | String | Additional margin |
| maxDecrease | String | Max drawdown ratio |
| allowReinvest | Boolean | Reinvest profit |
| totalFundingFee | String | Total funding fee |
| investmentAmt | String | Investment cost |
| investmentCcy | String | Investment currency |
| totalPnl | String | Total PnL |
| pnlRatio | String | PnL ratio |
| arbitragePnL | String | Historical cycle PnL |
| profitSharingRatio | String | Profit sharing ratio |
| cTime | String | Create time (Unix ms) |
| uTime | String | Update time (Unix ms) |

---

### 2.11 GET `/history-list` — Historical Bot List (Paginated)

**Auth**: TRADE

**Query Parameters**: Same as `/ongoing-list`.

#### Response (`BotHistoricalRecord` extends `BotRecord`)

All fields from `BotRecord` plus:

| Field | Type | Description |
|-------|------|-------------|
| stopTime | String | Stop time (Unix ms) |
| cancelType | String | Stop reason code |

> `tpPriceRange` is excluded from history response (serialization disabled).

---

### 2.12 GET `/orders` — Order List by Cycle

**Auth**: TRADE

> ⚠️ Sync copy followers (`copyType=2` + `trackingMode=sync`) are **blocked** from this operation.

#### Query Parameters

| Field | Required | Type | Description | Example |
|-------|----------|------|-------------|---------|
| algoId | Y | String | Strategy id | `12345` |
| algoOrdType | Y | String | Algo order type (`contract_dca`) | `contract_dca` |
| cycleId | Y | String | Cycle id | `3` |
| limit | N | String | Max results (default 100, max 100) | `50` |

#### Response (`OrderRecord`)

| Field | Type | Description |
|-------|------|-------------|
| cycleId | String | DCA cycle id |
| ordId | String | Order id |
| avgFillPx | String | Average fill price |
| cTime | String | Create time (Unix ms) |
| ctVal | String | Contract face value |
| side | String | `buy` / `sell` |
| fee | String | Transaction fee |
| fillTime | String | Last fill time (Unix ms) |
| filledSz | String | Filled size |
| instId | String | Instrument id |
| lever | String | Leverage |
| ordType | String | DCA order type |
| px | String | Order price |
| rebate | String | Rebate amount |
| rebateCcy | String | Rebate currency |
| state | String | Order state (`live` / `filled` / ...) |
| sz | String | Order size |
| uTime | String | Update time (Unix ms) |
| msg | String | Reserved |

---

## Appendix A: Sync Copy Follower Restrictions (V2)

A "sync copy follower" is a strategy with `copyType=2` and `trackingMode=sync`. The following restrictions apply:

| Endpoint | Restriction |
|----------|-------------|
| POST `/settings/take-profit` (2.5) | **Blocked** — cannot modify take-profit |
| POST `/orders/manual-buy` (2.7) | **Blocked** — cannot manually add position |
| GET `/orders` (2.12) | **Blocked** — cannot view order records |
| GET `/position-details` (2.8) | **Field masking** — `fillManualOrds`, `fillSafetyOrds`, `initPx`, `avgPx`, `slPx`, `tpPx` return empty string |
| GET `/cycle-list` (2.9) | **Field masking** — `avgPx`, `tpPx` return empty string |
| GET `/ongoing-list` (2.10) | No restriction (full response) |

**Implementation note**: When calling restricted endpoints as a sync copy follower, the upstream API returns an error. In the MCP layer, detect `copyType` + `trackingMode` on the strategy first (via `/ongoing-list`) and surface a structured error with the masked-field guidance rather than a raw OKX error.

---

## Appendix B: V1 vs V2 Feature Comparison

| Feature | V1 (Spot DCA) | V2 (Contract DCA) |
|---------|---------------|-------------------|
| Create strategy | ✅ | ✅ |
| Stop strategy | ✅ | ✅ |
| Active list | ✅ | ✅ |
| History list | ✅ | ✅ |
| Strategy detail | ✅ | via `/position-details` |
| Sub orders | ✅ (filled/live) | ✅ (by cycleId) |
| AI parameters | ✅ | ❌ |
| Margin adjustment | ❌ | ✅ (add/reduce) |
| Take-profit update | ❌ | ✅ |
| Reinvestment setting | ❌ | ✅ |
| Manual buy | ❌ | ✅ |
| Cycle management | ❌ | ✅ |
| Direction | long only | long / short |
| Leverage | N/A (spot) | ✅ (configurable) |
| Copy trading | ❌ | ✅ (sync/async + profit sharing) |
| Pagination | basic | cursor-based (before/after) |

---

## Cross-Version Gotchas

1. **`algoOrdType` is NOT interchangeable** — V1 endpoints require `spot_dca`; V2 endpoints require `contract_dca`. Mixing them causes a runtime parameter error (the DTO annotation accepts both, but the controller rejects the wrong one).
2. **`curCycleld` typo** in V2 `/position-details` is **load-bearing** — do not "fix" the spelling when mapping the response to internal types; frontends depend on it.
3. **`tpPct`, `pxSteps`, `pxStepsMult`, `volMult`** are all **decimal strings** (e.g. `"0.05"` = 5%), not percentage strings (`"5"`). Easy to confuse.
4. **`allowReinvest`** is Boolean in request but sample shows string `"TRUE"` — likely accepts both, but prefer boolean.
5. **V1 `triggerType` hard-coded enums** — `indicator` must be `rsi`, `triggerCond` must be `cross_down`, `timePeriod` must be `14`. Any other value is rejected. V2 `triggerStrategy` is more flexible (`instant` / `price` / `rsi`).
6. **Cursor direction** — `after` = newer, `before` = older. Same convention as OKX core API.

## Mapping to `bot.dca` Module

Existing `bot.dca` MCP module wraps this API. When adding or changing tools:

- V1 spot (`spot_dca`): `bot.dca.create_spot`, `bot.dca.stop_spot`, `bot.dca.list_active_spot`, `bot.dca.list_history_spot`, `bot.dca.get_detail_spot`, `bot.dca.list_sub_orders_spot`, `bot.dca.get_ai_params`
- V2 contract (`contract_dca`): `bot.dca.create_contract`, `bot.dca.stop_contract`, `bot.dca.add_margin`, `bot.dca.reduce_margin`, `bot.dca.update_take_profit`, `bot.dca.set_reinvestment`, `bot.dca.manual_buy`, `bot.dca.get_position_details`, `bot.dca.list_cycles`, `bot.dca.list_ongoing`, `bot.dca.list_history_contract`, `bot.dca.list_orders_by_cycle`

Write endpoints (`isWrite: true`): all POSTs. Read endpoints: all GETs.
