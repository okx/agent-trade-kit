# Simple Earn (Savings) Command Reference

## earn savings balance

```bash
okx --profile live earn savings balance           # all currencies
okx --profile live earn savings balance USDT      # specific currency
okx --profile live earn savings balance --json
```

Output fields: `ccy` · `amt` (total held) · `earnings` (cumulative) · `rate` (user's minimum lending rate) · `loanAmt` (actively lent) · `pendingAmt` (awaiting match)

---

## earn savings purchase

Subscribe funds into Simple Earn. Moves real funds.

```bash
okx --profile live earn savings purchase --ccy USDT --amt 1000
okx --profile live earn savings purchase --ccy USDT --amt 1000 --rate 0.02
```

| Parameter | Required | Description |
|---|---|---|
| `--ccy` | Yes | Currency, e.g. USDT |
| `--amt` | Yes | Amount to subscribe |
| `--rate` | No | Minimum acceptable lending rate (decimal). Default: 0.01 (1%, the absolute minimum). |

**Pre-execution checklist:**
1. Check balance: `okx --profile live account asset-balance <ccy>` — verify user has sufficient funds; if insufficient, inform user and stop
2. Fetch rates (in parallel with step 1): `okx --profile live earn savings rate-history --ccy <ccy> --limit 1 --json`
3. Show confirmation summary (see [Confirmation Templates](#confirmation-templates))
4. Wait for user confirmation — if user declines, acknowledge and offer to adjust the amount or currency

---

## earn savings redeem

Withdraw funds from Simple Earn. Moves real funds.

```bash
okx --profile live earn savings redeem --ccy USDT --amt 500
```

| Parameter | Required | Description |
|---|---|---|
| `--ccy` | Yes | Currency to redeem |
| `--amt` | Yes | Amount to redeem |

Pre-execution: show redemption summary (currency, amount, current APY, destination: funding account). Wait for confirmation.

---

## earn savings set-rate

Set the minimum acceptable lending rate.

```bash
okx --profile live earn savings set-rate --ccy USDT --rate 0.01
```

`--rate` is the user's minimum matching threshold — funds are lent only when the market lending rate ≥ this value. The actual yield is always `lendingRate`. Never tell users that lowering their minimum rate reduces earnings — this is incorrect.

---

## earn savings lending-history

Returns the **user's personal lending records** — transactions where the user lent coins and earned interest. This is NOT for querying market rates; use `earn savings rate-history` for market rate data.

```bash
okx --profile live earn savings lending-history
okx --profile live earn savings lending-history --ccy USDT --limit 10
```

Output fields: `ccy` · `amt` (amount lent) · `earnings` (interest earned) · `rate` (rate applied to this record — same as `rate` in rate-history: the market threshold for that period) · `ts`

---

## earn savings rate-history

Requires `--profile live`.

```bash
okx --profile live earn savings rate-history --ccy USDT --limit 1 --json   # current real APY
okx --profile live earn savings rate-history --ccy USDT --limit 30         # recent trend
```

| Parameter | Required | Description |
|---|---|---|
| `--ccy` | No | Filter by currency |
| `--limit` | No | Max results (default 100) |

This endpoint returns both flexible lending rates and fixed-term product offers:

- **Flexible (活期):** `ccy` · `lendingRate` · `ts`
- **Fixed-term (定期):** `ccy` · `term` · `rate` · `minLend` · `lendQuota` (remaining subscribable amount) · `soldOut`

Use this endpoint to check available fixed-term offers before subscribing (verify term exists and has remaining quota).

### Rate Field Semantics

| Field | Meaning |
|---|---|
| `rate` | User's minimum lending rate threshold (set via `set-rate`). Funds are only lent when the market lending rate ≥ this value. This is a filter, not a yield — do NOT display it as APY. |
| `lendingRate` | Actual yield received by lenders. **Always use `lendingRate` as the true APY to show users.** For stablecoins (e.g. USDT/USDC): subject to pro-rata dilution — when eligible supply exceeds borrowing demand, total interest is shared among all eligible lenders. For non-stablecoins: no dilution. |
| `term` | Lock period for fixed-term offers, e.g. `7D`. |
| `rate` (fixed-term) | Annualized rate for fixed-term offers. |
| `minLend` | Minimum subscription amount for a fixed-term offer. |
| `lendQuota` | Remaining subscribable amount for a fixed-term offer. |
| `soldOut` | Whether the offer is sold out (`lendQuota` is `0`). |

For flexible: always display `lendingRate` as the actual yield. Do NOT raise the minimum rate (`rate`) to increase yield — the actual yield (`lendingRate`) is determined by market supply/demand, not the minimum rate setting.
For fixed-term: display `rate` and `term`, check `soldOut` is false (or `lendQuota` > 0) before subscribing.

---

## Confirmation Templates

### Subscribe to Simple Earn

Respond in the user's language. Template (translate fields as needed):

```
Operation: Subscribe to Simple Earn
Currency: USDT
Amount: 1,000 USDT
Actual yield once matched (lendingRate): X.XX%
Your minimum lending rate: 1% (recommended)

Funds are only lent when the market lending rate ≥ your minimum rate.
Once matched, you earn lendingRate (actual yield).

Confirm? (yes / no)
```

### Redeem from Simple Earn

```
Operation: Redeem from Simple Earn
Currency: USDC
Amount: 10.00 USDC
Current actual yield (lendingRate): X.XX% (yield you will stop earning)
Funds will be returned to: funding account (资金账户)

Confirm? (yes / no)
```

---

## Position Summary Template

After Simple Earn purchase, present (translate column names and descriptions to user's language):

| Field | Value |
|---|---|
| Total held | X USDC |
| Cumulative earnings | X USDC |
| Status | Pending match / Lending |
| Amount lent | X USDC |
| Pending match | X USDC |
| Actual yield (lendingRate) | X.XX% |
| Your minimum lending rate | X.XX% (from balance.rate) |

Plain-language status explanations (translate to user's language):
- `pendingAmt > 0`, `loanAmt = 0` → funds are waiting to be matched. The system matches every hour; interest starts accruing in the same hour a match is found.
- `loanAmt > 0` → funds are lent and earning interest; yield settles every hour.

---

# Simple Earn Fixed (定期) Command Reference

## earn savings fixed-orders

Query fixed-term (定期) orders. Returns all orders or filtered by currency/state.

```bash
okx --profile live earn savings fixed-orders --json
okx --profile live earn savings fixed-orders --ccy USDT --json
okx --profile live earn savings fixed-orders --state earning --json
okx --profile live earn savings fixed-orders --ccy USDT --state pending --json
```

| Parameter | Required | Description |
|---|---|---|
| `--ccy` | No | Filter by currency |
| `--state` | No | Filter by order state (see below) |

Output fields: `reqId` · `ccy` · `amt` · `rate` · `term` · `state` · `accruedInterest` · `cTime`

### Order States

| State | 中文 | English | Description |
|---|---|---|---|
| `pending` | 匹配中 | Pending | Order placed, not yet earning. Can be redeemed early (full refund). |
| `earning` | 赚币中 | Earning | Lock period active, earning interest. Cannot be redeemed early. |
| `expired` | 逾期 | Expired | Lock period ended, awaiting settlement. |
| `settled` | 已结算 | Settled | Principal + interest returned to funding account. |
| `cancelled` | 已撤销 | Cancelled | Order was cancelled before it started earning. |

**NEVER expose raw state values** to the user — always translate using the table above.

**Display rules:**
- Render as Markdown table with columns: # · reqId · Currency · Amount · Rate · Term · Status · Accrued Interest · Create Time
- Format timestamps using `YYYY/M/D HH:MM`
- For `pending` orders, note that early redemption is available

---

## earn savings fixed-purchase

Subscribe to Simple Earn Fixed (定期). Two-step process: preview first, then confirm to execute.

```bash
# Step 1: Preview (default — no --confirm flag)
okx --profile live earn savings fixed-purchase --ccy USDT --amt 1000 --term 7D --json

# Step 2: Confirm and execute
okx --profile live earn savings fixed-purchase --ccy USDT --amt 1000 --term 7D --confirm --json
```

| Parameter | Required | Description |
|---|---|---|
| `--ccy` | Yes | Currency to subscribe, e.g. USDT |
| `--amt` | Yes | Amount to subscribe |
| `--term` | Yes | Lock period, e.g. `7D` (must match an available offer term from `rate-history`) |
| `--confirm` | No | Execute the subscription. Without this flag, only a preview is returned. |

**Pre-execution checklist:**
1. Check available offers: `okx --profile live earn savings rate-history --ccy <ccy> --json` — verify the requested term exists and has remaining quota
2. Check balance (in parallel with step 1): `okx --profile live account asset-balance <ccy>` — verify user has sufficient funds in funding account; if insufficient, inform user and stop
3. Preview the order (without `--confirm`): show the locked APR, term, and expected earnings. **Must** include this warning in the preview output: "⚠️ Orders still in 'pending' state can be cancelled before matching completes. Once the status changes to 'earning', funds are LOCKED until maturity — early redemption is NOT allowed."
4. Show confirmation summary (see [Fixed-Term Confirmation Templates](#fixed-term-confirmation-templates))
5. Wait for user confirmation — if user declines, acknowledge and offer to adjust amount or term

**After successful purchase:** Run `okx --profile live earn savings fixed-orders --ccy <ccy> --state pending --json` to verify the order was created. Show the new order details.

---

## earn savings fixed-redeem

Redeem a fixed-term order. Redeems the full amount — partial redemption is not supported. Only orders in `pending` state can be redeemed early.

```bash
okx --profile live earn savings fixed-redeem <reqId> --json
```

| Parameter | Required | Description |
|---|---|---|
| `<reqId>` | Yes | Order ID (positional) from `earn savings fixed-orders` |

**Pre-execution checklist:**
1. Check order state: `okx --profile live earn savings fixed-orders --json` — find the order and verify `state` is `pending`
2. If state is `earning`: inform the user that orders in earning state cannot be redeemed early — they must wait until expiry
3. If state is `pending`: show redemption summary (see [Fixed-Term Confirmation Templates](#fixed-term-confirmation-templates)), wait for confirmation

**After successful redemption:** Run `okx --profile live earn savings fixed-orders --json` to confirm the order state changed to `cancelled`. Inform user that full principal has been returned to the funding account (资金账户). No interest is earned for cancelled orders.

---

## Fixed-Term Confirmation Templates

### Subscribe to Simple Earn Fixed (定期)

Respond in the user's language. Template (translate fields as needed):

```
Operation: Subscribe to Simple Earn Fixed (定期)
Currency: USDT
Amount: 1,000 USDT
Lock period: 7 days
APR: 4.50%
Expected earnings: ≈ X.XX USDT (estimated, based on current APR)
Expiry date: YYYY/M/D (approximate)
Source: Funding account (资金账户)

⚠️ Orders still in 'pending' state can be cancelled before matching completes. Once the status changes to 'earning', funds are LOCKED until maturity — early redemption is NOT allowed.

Confirm? (yes / no)
```

### Redeem Fixed-Term Order (early — pending state only)

```
Operation: Early redemption of Simple Earn Fixed order
Order ID: <reqId>
Currency: USDT
Amount: 1,000 USDT (full refund)
Interest earned: 0 USDT (no interest for early redemption)
Funds will be returned to: Funding account (资金账户)

Note: This order has not yet started earning. Full principal will be refunded.

Confirm? (yes / no)
```

---

## Fixed-Term Position Summary Template

After viewing fixed-term orders, present (translate column names and descriptions to user's language):

| Field | Value |
|---|---|
| Order ID | reqId |
| Currency | USDT |
| Amount | 1,000 USDT |
| Term | 7 days |
| APR | 4.50% |
| Accrued earnings | X.XX USDT |
| Status | Earning (赚币中) |
| Purchase time | YYYY/M/D HH:MM |
| Expiry time | YYYY/M/D HH:MM |

When user asks to view "earn positions" or "赚币持仓", see `SKILL.md` Step 1 for the full query list (includes all earn types).
