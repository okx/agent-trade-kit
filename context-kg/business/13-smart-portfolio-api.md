# Smart Portfolio API Contract

API base: `/api/v5/tradingBot/smart-portfolio`

## Create Order — POST `/order-algo`

### Request

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `investmentCcy` | string | Yes | Quote currency: USDT or USDC |
| `portfolioList` | array | Yes | 2–10 items; each `{ccy, ratio}` |
| `portfolioList[].ccy` | string | Yes | Asset symbol; server does NOT trim/uppercase — client must normalize |
| `portfolioList[].ratio` | string | Yes | Allocation ratio; positive exact decimal; all ratios must sum to exactly 1 (client check is exact — no float tolerance) |
| `deltaRatio` | string | Yes | Rebalance threshold; truncated toward zero to two decimals (exact decimal arithmetic on the raw string, never `Number`: `0.29` stays `0.29`), result `∈ [0.01, 1)` |
| `interval` | string | No | Periodic rebalance interval in seconds; 0 = disabled |
| `tag` | string | No | Source tag for attribution |

### Response — `data[0]`

| Field | Type | Notes |
|-------|------|-------|
| `algoId` | string | Algo order ID |
| `clOrdId` | string | Client order ID (if provided) |
| `sCode` | string | "0" = success |
| `sMsg` | string | Error message if sCode ≠ "0" |

## Get Pending Orders — GET `/orders-algo-pending`

### Request

| Field | Type | Notes |
|-------|------|-------|
| `algoId` | string | Optional filter |
| `after` | string | Pagination (older data) |
| `before` | string | Pagination (newer data) |
| `limit` | string | Default 20, max 100 |

**Note**: No `instType` or `algoOrdType` in this endpoint.

## Get Orders History — GET `/orders-algo-history`

### Request

| Field | Type | Notes |
|-------|------|-------|
| `state` | string | `stopped` or `filled` |
| `instType` | string | Optional: SPOT, MARGIN, etc. |
| `algoId` | string | Optional |
| `after` | string | Pagination |
| `before` | string | Pagination |
| `limit` | string | Default 20, max 100 |

## Get Order Details — GET `/orders-algo-details`

### Request

| Field | Type | Required |
|-------|------|----------|
| `algoId` | string | Yes |

## Stop Order — POST `/stop-order-algo`

### Request

| Field | Type | Required |
|-------|------|----------|
| `algoId` | string | Yes |

### Response

**Note**: Response does NOT have `clOrdId` or `sCode` fields — use pass-through normalizer, not sCode-checking normalizer.

## Amend Rebalance — POST `/amend-rebalance`

### Request

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `algoId` | string | Yes | |
| `portfolioList` | array | No | Same validation as create |
| `deltaRatio` | string | No | Same validation as create |
| `interval` | string | No | |

### Response

**Note**: `data` is always `[]`. Only the outer `code` field indicates success/failure. Do NOT call the sCode-checking normalizer.

## Instant Rebalance — POST `/instant-rebalance`

### Request

| Field | Type | Required |
|-------|------|----------|
| `algoId` | string | Yes |

### Response

| Field | Type | Notes |
|-------|------|-------|
| `triggered` | boolean | `true` = the rebalance flow was started (not that trades executed or filled); `false` = no trade flow started this time (market conditions may also apply — it does not mean "already balanced") |

## Operation endpoints — POST (success: `code=0, msg="", data=[]`)

Source of truth: Lark docs *Smart Portfolio OpenAPI 操作接口* and *okx-trade-mcp Smart Portfolio 接入与遗留修复设计* (issue #225, ALGO-49154). Success means **accepted** (not state in effect, not funds arrived, not trades filled); there is no `data[0]` / `sCode`. A non-zero `code` surfaces as `OkxApiError` with code / msg / endpoint intact. Tools: `smart_portfolio_manual_pause`, `_manual_resume`, `_add_investment`, `_edit_portfolio` (all `isWrite`, no `retryOnNetworkError`).

| Path | Body | Errors |
|---|---|---|
| `/manual-pause` | `algoId` | 50014, 51000, 51059 (state / top-up in transit / already paused), 51293 |
| `/manual-resume` | `algoId` | 50014, 51000, 51059 (not manually paused, other restriction, top-up in transit or not yet confirmed arrived), 51293 |
| `/add-investment` | `algoId`, `addInvest` (positive decimal string), `tradeQuoteCcy?` | 50014, 51000 (invalid amount / currency mismatch), 51059, 51293, 51318 (outside allowed range), 51360 (cumulative cap), 51361 (below minimum top-up) |
| `/edit-portfolio` | `algoId`, `portfolioList` (complete new target, 2–10 unique coins, positive weights summing to exactly 1), `addInvest?`, `tradeQuoteCcy?` | 50014, 51000 (non-combined mode, invalid combination, unchanged target, currency mismatch), 51059, 51293, 51318, **51320** (weight out of range / sum), 51360, 51361 (below min top-up or below the new portfolio's minimum investment) |

- `tradeQuoteCcy`: backend omits/blank → resolves the bot's own settlement currency (MR !3272, treated as deployed); non-empty must match exactly. The MCP/CLI layer trims and keeps case; blank → key omitted. The backend does not trim non-empty values itself.
- `edit-portfolio` without a positive `addInvest` sends neither `addInvest` nor `tradeQuoteCcy`. Edit takes effect immediately and triggers a rebalance; with a top-up the rebalance waits for the funds to arrive; a failed top-up does not roll the edit back.
- Details (`/orders-algo-details`) has no cumulative top-up field and no per-top-up status; `tradeQuoteCcy` may be empty there; `amt`/`investAmt` is total investment only.
- Rate limits are not specified in the contract; the tools use the module's client-side default (20) which is not a verified server quota.

## Get Recommend Zones — GET `/recommend-zones`

### Request

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `investCcy` | string | Yes | USDT or USDC (different field name from create's `investmentCcy`) |
| `ccy` | string | No | Filter by asset |
| `limit` | string | No | Default 20, max 100 |

### Response

**Note**: `defaultBacktestYield.profitHistory` is stripped client-side (too large for context window).

| Field | Notes |
|-------|-------|
| `zoneId` | Use with zones-backtest |
| `zoneName` | Human-readable zone name |
| `portfolioList` | Recommended allocation |
| `deltaRatio` | Recommended threshold |
| `interval` | Recommended interval |
| `defaultBacktestYield.annRate` | Annualized return |
| `defaultBacktestYield.maxDrawdown` | Max drawdown |

## Get Zones Backtest — GET `/zones-backtest`

### Request

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `investCcy` | string | Yes | Must match zone's investCcy |
| `zoneId` | string | Yes | From recommend-zones |
| `period` | string | No | 1W, 1M, 3M, 6M, 1Y (case-insensitive) |

### Response

**Note**: `period` in the response may differ from the requested period (server may return actual window).

| Field | Notes |
|-------|-------|
| `period` | Actual backtest period returned |
| `annRate` | Annualized yield |
| `maxDrawdown` | Maximum drawdown |
| `vsHodl` | Performance vs buy-and-hold |
