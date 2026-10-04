# Smart Portfolio API Contract

API base: `/api/v5/tradingBot/smart-portfolio`

## Create Order — POST `/order-algo`

### Request

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `investmentCcy` | string | Yes | Quote currency: USDT or USDC |
| `portfolioList` | array | Yes | 2–10 items; each `{ccy, ratio}` |
| `portfolioList[].ccy` | string | Yes | Asset symbol; server does NOT trim/uppercase — client must normalize |
| `portfolioList[].ratio` | string | Yes | Allocation ratio; all ratios must sum to 1.0 |
| `deltaRatio` | string | Yes | Rebalance threshold; `floor(x*100)/100 ∈ [0.01, 1)` |
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

## Get Order Details — GET `/order-algo`

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
| `triggered` | boolean | `true` = rebalance executed; `false` = not triggered (portfolio already balanced or conditions not met) |

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
