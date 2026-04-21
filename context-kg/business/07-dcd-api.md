<!-- triggers: dcd, dual currency, dual-currency, sfp, structured finance, earn.dcd, earn dcd, option structured, call option, put option, strike, quote, redeem, notionalCcy, productId, absYield, annualizedYield -->
# DCD (Dual Currency Deposit) Open API v5 Spec

**Source**: [DCD Open API v5](https://okg-block.sg.larksuite.com/wiki/MCz1wy3mHiqB9VkqqLclr6IFg3f) (Lark wiki `MCz1wy3mHiqB9VkqqLclr6IFg3f`)

**Purpose**: Upstream OKX spec for the DCD structured product (`earn.dcd` module). Use this as the source of truth when validating request/response shapes, error handling, and state machine transitions in `packages/core/src/tools/earn/dcd.ts` and related code. Sample responses in the source doc are based on actual production `/priapi/v2/sfp/dcd/` responses with FE-only fields stripped.

## Conventions

- **Base URL**: `/api/v5/finance/sfp/dcd`
- **Auth**: `@OpenApiAuth` (API key + signature) on all endpoints
- **Rate limit rule**: per-user-id; rates specified per endpoint below
- **Response wrapper**: `{ "code": 0, "msg": "", "data": [...] }`
- **Timestamps**: Unix milliseconds (strings)
- **Amounts / prices / yields**: all string, no scientific notation, no trailing zeros
- **Permissions**: `Read` for GETs, `Trade` for POSTs

## Endpoint Catalog (8 APIs)

| # | Method + Path | Purpose | RateLimit | Perm |
|---|---|---|---|---|
| 1 | `GET /currency-pair` | List available DCD currency pairs | 1/s | Read |
| 2 | `GET /products` | List active products for a pair + optType | 1/s | Read |
| 3 | `POST /quote` | Request a real-time quote (TTL'd) | 10/60s | Trade |
| 4 | `POST /trade` | Execute a trade using a valid quote | 2/60s | Trade |
| 5 | `POST /redeem-quote` | Request a redeem quote (early redemption) | 10/60s | Trade |
| 6 | `POST /redeem` | Execute redemption using redeem quote | 2/60s | Trade |
| 7 | `GET /order-status` | Get current state of an order | 3/s | Read |
| 8 | `GET /order-history` | List / filter historical orders | 1/s | Read |

---

## 1. `GET /currency-pair` — List Currency Pairs

Returns available DCD pairs with APY rate ranges (retail + VIP tiers), filtered by OKB pair restrictions and entity restrictions.

**Request**: no parameters

**Response `data[]`**:

| Field | Type | Description |
|---|---|---|
| `baseCcy` | String | Base currency, e.g. `BTC` |
| `quoteCcy` | String | Quote currency, e.g. `USDT` |
| `optType` | String | `C` = Call, `P` = Put |
| `uly` | String | Underlying index, e.g. `BTC-USD` |

---

## 2. `GET /products` — Active Product List

Returns active DCD products with yield, trade size, quota, and VIP yield tier info.

**Request** (query):

| Field | Type | Required | Notes |
|---|---|---|---|
| `baseCcy` | String | **Y** | |
| `quoteCcy` | String | **Y** | |
| `optType` | String | **Y** | `C` or `P` |

**Response `data[].products[]`**:

| Field | Type | Notes |
|---|---|---|
| `productId` | String | e.g. `BTC-USDT-260327-54500-P` |
| `baseCcy` / `quoteCcy` | String | |
| `notionalCcy` | String | Investment currency: **`baseCcy` if `C`, `quoteCcy` if `P`** |
| `optType` | String | `C` / `P` |
| `uly` | String | |
| `strike` / `stk` | String | Strike price (source doc uses both `strike` in example and `stk` in field table — confirm with BE) |
| `absYield` | String | Absolute yield |
| `annualizedYield` | String | Annualized yield (decimal, e.g. `"0.0541"` = 5.41%) |
| `minSize` / `maxSize` / `stepSz` | String | In `notionalCcy` units |
| `listTime` | String | Product launch time (ms) |
| `quoteTime` | String | When product was quoted (ms) |
| `interestAccrualTime` | String | Interest accrual start (ms) |
| `tradeEndTime` | String | Trade cutoff (ms) |
| `expTime` | String | Expiry (ms) |
| `redeemStartTime` / `redeemEndTime` | String | Early redeem window (ms) |

**⚠️ Sample JSON inconsistency**: The source doc sample wraps products inside a second-level `"products": [...]` key under `data[]` (i.e. `data[0].products[0]`). Most other OKX endpoints return products directly in `data[]`. Verify final wrapper shape with BE before coding.

---

## 3. `POST /quote` — Request for Quote

Real-time quote against the user's VIP tier. Quote has a TTL (`validUntil`) and must be used before expiry.

**Request body**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `productId` | String | **Y** | |
| `notionalSz` | String | **Y** | Investment amount |
| `notionalCcy` | String | **Y** | Must match `notionalCcy` of product (C→baseCcy, P→quoteCcy) |

**Response `data[]`**:

| Field | Type | Notes |
|---|---|---|
| `quoteId` | String | Use in `/trade` |
| `productId` | String | |
| `notionalSz` / `notionalCcy` | String | |
| `absYield` | String | |
| `annualizedYield` | String | Decimal tier rate, e.g. `"69.65"` in sample — format unclear; BE confirms whether %-scale or decimal |
| `idxPx` | String | Index price at quote time |
| `interestAccrualTime` | String | Interest accrual start (ms) — note: sample shows number `1773241200000`, not string. **Discrepancy with global "all numbers as strings" rule** |
| `validUntil` | String | Quote expiry (ms) |

---

## 4. `POST /trade` — Place Trade

Places a DCD trade with a valid `quoteId`.

**Request body**:

| Field | Type | Required | Notes |
|---|---|---|---|
| `quoteId` | String | **Y** | From `/quote` |

> The header mentions "Supports idempotency via `clOrdId`", but `clOrdId` does **not** appear in the request param table. Source doc likely incomplete — if idempotency is required for the MCP client, confirm with BE.

**Response `data[]`**:

| Field | Type | Notes |
|---|---|---|
| `quoteId` | String | |
| `ordId` | String | Order ID |
| `state` | String | See state machine below |

---

## 5. `POST /redeem-quote` — Request Redeem Quote

Early redemption is a two-step flow: fetch redeem quote, then confirm via `/redeem`.

**Request body**:

| Field | Type | Required |
|---|---|---|
| `ordId` | String | **Y** |

**Response `data[]`**:

| Field | Type | Notes |
|---|---|---|
| `ordId` | String | |
| `quoteId` | String | Use in `/redeem` |
| `redeemSz` / `redeemCcy` | String | |
| `termRate` | String | Can be **negative** (e.g. `"-0.50"` in sample) — redemption may incur cost |
| `validUntil` | String | Redeem quote expiry (ms) |

---

## 6. `POST /redeem` — Execute Redemption

**Request body**:

| Field | Type | Required |
|---|---|---|
| `ordId` | String | **Y** |
| `quoteId` | String | **Y** | (from `/redeem-quote`) |

**Response `data[]`**:

| Field | Type | Notes |
|---|---|---|
| `ordId` | String | |
| `state` | String | e.g. `pending_redeem_booking` (see state machine) |

---

## 7. `GET /order-status` — Single Order State

**Request** (query):

| Field | Type | Required |
|---|---|---|
| `ordId` | String | **Y** |

**Response `data[]`**: `{ ordId, state }`.

---

## 8. `GET /order-history` — Order Search / History

**Request** (query):

| Field | Type | Required | Notes |
|---|---|---|---|
| `ordId` | String | N | When provided, returns that specific order directly (ignores other filters) |
| `productId` | String | N | e.g. `BTC-USDT-260327-77000-C` |
| `uly` | String | N | Underlying index filter |
| `state` | String | N | See state values |
| `beginId` | String | N | ordId cursor — records newer than this |
| `endId` | String | N | ordId cursor — records earlier than this |
| `begin` | String | N | Begin timestamp (ms) |
| `end` | String | N | End timestamp (ms) |
| `limit` | String | N | Max 100 |

**Response `data[]`** (full order record):

| Field | Type | Notes |
|---|---|---|
| `ordId` / `quoteId` / `productId` | String | |
| `state` | String | |
| `baseCcy` / `quoteCcy` / `uly` / `strike` | String | |
| `notionalSz` / `notionalCcy` | String | Order investment |
| `absYield` / `annualizedYield` | String | |
| `yieldSz` / `yieldCcy` | String | Earned yield |
| `settleSz` / `settleCcy` / `settlePx` | String | **null if not yet settled** |
| `settleTime` | String | Actual settled time (ms, null if not settled) |
| `settledTime` | String | Appears in sample JSON alongside `settleTime` — unclear if duplicate or a separate field. BE to confirm |
| `expTime` | String | Product expiration (ms) — per field table; sample omits it. BE to confirm |
| `redeemStartTime` / `redeemEndime` (sic) | String | **Typo `redeemEndime` is in the source sample** — not `redeemEndTime`. Could be sample artifact or real field name |
| `cTime` / `uTime` | String | Order create / update (ms) |

## Order State Machine

Both `/order-status` and `/order-history` return lowercase state names:

```
initial          →  live          (quote consumed, trade booked)
live             →  pending_settle → settled
live             →  pending_redeem_booking → pending_redeem → redeeming → redeemed
(any)            →  rejected      (terminal — declined)
```

Notes:
- `/trade` response sample shows state with uppercase (`"LIVE"`, `"INITIAL"`, `"PENDING_BOOKING"`) while `/order-status` and `/order-history` tables use lowercase. **Normalize to lowercase in the client.**
- `/redeem` response sample shows `"PENDING_REDEEM_BOOKING."` (with trailing dot). Strip/trim on deserialize.

## Error Codes

| Code | Name | Typical Scenario | Applicable Endpoints |
|---|---|---|---|
| `50001` | `SERVICE_UNAVAILABLE` | DCD service down | General |
| `50002` | `JSON_SYNTAX_ERROR` | Malformed JSON body | General |
| `50014` | `PARAMETER_IS_EMPTY` | Missing required param (`ccy`, `quoteCcy`, `optType`, `ordId`, `quoteId`, `clOrdId`) | Quote / Place / Redeem / Query |
| `50016` | `PARAMETER_NOT_MATCH` | `notionalCcy` ≠ product's optType | `/quote` |
| `50026` | `SYSTEM_ERROR` | Unexpected server error | General |
| `50030` | `NO_PERMISSION` | User unauthorized — earn-auth / KYC level < 2 / subaccount type mismatch | General |
| `50038` | `FEATURE_UNAVAILABLE` | Open API disabled for product/country | General |
| `50051` | `RESTRICTED_ND_BROKER` | Coin or country restriction for this pair | `/quote`, General |
| `51000` | `PARAMETER_ERROR` | Invalid value/format (e.g. `ordId` not found or not owned by user) | Quote / Place / Redeem / Query |
| `51728` | `SUBSCRIPTION_AMOUNT_EXCEED_LIMIT` | Available quota exceeded (race condition possible) | `/quote`, `/trade` |
| `51736` | `INSUFFICIENT_BALANCE` | Not enough funds | `/trade` |
| `52905` | `INVALID_QUOTE` | Quote expired / not found (also for redeem) | `/trade`, `/redeem` |
| `52909` | `DUPLICATED_CLIENT_ORDER_ID` | `clOrdId` already used | `/trade` |
| `52917` | `NOTIONAL_LESS_THAN_MIN_TRADE_SIZE` | Below min trade size | `/quote`, `/trade` |
| `52918` | `NOTIONAL_EXCEEDS_MAX_TRADE_SIZE` | Above max trade size | `/quote`, `/trade` |
| `52921` | `QUOTE_TRADED` | Quote already used by another trade | `/trade` |
| `52927` | `NO_QUOTE_ID` | Liquidity provider returned no quote | `/quote` |
| `52928` | `NOTIONAL_NOT_DIVISIBLE_TRADE_STEP_SIZE` | Amount not a multiple of `stepSz` | `/quote`, `/trade` |
| `52930` | `NOT_IN_REDEEM_WINDOW` | Outside `redeemStartTime`…`redeemEndTime` | `/redeem-quote` |
| `58004` | `ACCOUNT_BLOCKED` | Frozen by earn-auth check | General |
| `58102` | `RATE_LIMIT_EXCEED` | `@OKRateLimit` threshold hit | General |

## Open Points to Verify with BE

1. **`/products` response wrapper**: is the inner `products[]` nesting real, or a sample-doc artifact?
2. **`strike` vs `stk`**: the sample response uses `"strike"` while the field table names it `stk`.
3. **`annualizedYield` scale**: `"0.0541"` (5.41%) in product list vs `"69.65"` (69.65%?) in quote sample — units inconsistent.
4. **`clOrdId` idempotency**: mentioned in `/trade` description but absent from request table and error list references it (`50014`).
5. **`redeemEndime`** typo in `/order-history` sample: real field or typo?
6. **`settleTime` vs `settledTime`**: both appear in `/order-history` sample but only one in the field table.
7. **String vs number timestamps**: global rule says strings, but `/quote` sample shows `interestAccrualTime: 1773241200000` as a raw number.
8. **State capitalization**: `/trade` returns uppercase state (`"LIVE"`), others lowercase. Client must normalize.

## Mapping to `earn.dcd` Module

The existing `earn.dcd` MCP module in this repo wraps this API. When adding or changing tools:

- Currency-pair and product discovery → `earn.dcd.get_currency_pairs`, `earn.dcd.list_products`
- Quote → trade flow → `earn.dcd.request_quote` + `earn.dcd.place_trade` (must be paired; quote is single-use and TTL-bounded)
- Redeem flow → `earn.dcd.request_redeem_quote` + `earn.dcd.redeem` (two-step, enforce atomicity in docs)
- Order tracking → `earn.dcd.get_order_status`, `earn.dcd.list_order_history`

Remember: Writing endpoints (`isWrite: true`) — quote/trade/redeem-quote/redeem. Read endpoints — currency-pair/products/order-status/order-history.
