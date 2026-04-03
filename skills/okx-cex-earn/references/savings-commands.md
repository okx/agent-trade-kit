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

`--rate` is the user's minimum matching threshold — funds are lent only when market `rate` ≥ this value. The actual yield is always `lendingRate`. Never tell users that lowering their minimum rate reduces earnings — this is incorrect.

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

Output fields: `ccy` · `rate` · `lendingRate` · `ts`

### Rate Field Semantics

| Field | Meaning |
|---|---|
| `rate` | Market lending rate — the rate borrowers pay this period. User's minimum must be **≤ `rate`** for funds to be matched. |
| `lendingRate` | Actual yield received by lenders. **Always use `lendingRate` as the true APY to show users**, not `rate`. For stablecoins (e.g. USDT/USDC): subject to pro-rata dilution — when eligible supply exceeds borrowing demand, total interest is shared among all eligible lenders, so `lendingRate` may be less than `rate`. For non-stablecoins: `lendingRate` equals `rate`, no dilution. |

When advising on minimum rate: if user's minimum > `rate`, funds will not be matched. Always display `lendingRate` as the actual yield. **Do NOT raise the minimum rate to increase yield** — the actual yield (`lendingRate`) is determined by market supply/demand, not the minimum rate setting.

---

## Confirmation Templates

### Subscribe to Simple Earn

Respond in the user's language. Template (translate fields as needed):

```
Operation: Subscribe to Simple Earn
Currency: USDT
Amount: 1,000 USDT
Market lending threshold (rate): X.XX%  ← your minimum must be ≤ this to get matched
Actual yield once matched (lendingRate): X.XX%
Your minimum lending rate: 1% (recommended, must be ≤ market threshold)

Funds are only lent when the market threshold ≥ your minimum rate.
Once matched, you earn lendingRate — not rate.

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
| Market lending threshold (rate) | X.XX% |
| Actual yield (lendingRate) | X.XX% |
| Your minimum lending rate | X.XX% (from balance.rate) |

Plain-language status explanations (translate to user's language):
- `pendingAmt > 0`, `loanAmt = 0` → funds are waiting to be matched. The system matches every hour; interest starts accruing in the same hour a match is found.
- `loanAmt > 0` → funds are lent and earning interest; yield settles every hour.
