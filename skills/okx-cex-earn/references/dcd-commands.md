# DCD Command Reference

## Product Concepts

### Direction

| optType | 中文 | User deposits | Triggered when | If triggered |
|---|---|---|---|---|
| C | 高卖 | baseCcy (e.g. BTC) | expiry price ≥ strike | principal + yield → quoteCcy (USDT) |
| P | 低买 | quoteCcy (e.g. USDT) | expiry price ≤ strike | principal + yield → baseCcy (BTC) |

When triggered, **both principal and yield** are converted — yield does not stay in the original currency.

### Settlement formula

| Direction | Not triggered | Triggered |
|---|---|---|
| C | sz × (1 + rate) in baseCcy | sz × strike × (1 + rate) in quoteCcy |
| P | sz × (1 + rate) in quoteCcy | sz / strike × (1 + rate) in baseCcy |

### Expiry price

Average index price between 15:00–16:00 (UTC+8) on the expiry date — not real-time spot price at expiry.

### Yield vs. probability

- Strike closer to spot → higher trigger probability, higher reference APR
- Strike further from spot → lower trigger probability, lower reference APR
- Reference APR is indicative; actual yield locked at quote execution time

---

## earn dcd pairs

```bash
okx --profile live earn dcd pairs
```

Output fields: `baseCcy` · `quoteCcy` · `optType`
> The API may return duplicate entries for the same (baseCcy, quoteCcy, optType) combination. Deduplicate client-side before displaying.

---

## earn dcd products

```bash
okx --profile live earn dcd products --baseCcy BTC --quoteCcy USDT --optType C
okx --profile live earn dcd products --baseCcy BTC --quoteCcy USDT --optType C --strikeNear 72000 --minYield 0.05 --maxTermDays 7
```

| Parameter | Required | Description |
|---|---|---|
| `--baseCcy` | Yes | Base currency, e.g. BTC |
| `--quoteCcy` | Yes | Quote currency, e.g. USDT |
| `--optType` | Yes | `C` (高卖) or `P` (低买) |
| `--minYield` | No | Minimum annualized yield, e.g. 0.05 = 5% |
| `--strikeNear` | No | Filter strikes within ±10% of this price |
| `--termDays` | No | Exact term in days |
| `--minTermDays` | No | Minimum term in days |
| `--maxTermDays` | No | Maximum term in days |
| `--expDate` | No | YYYY-MM-DD or YYYY-MM-DDTHH:mm |

**User intent → CLI params mapping:**

| User says | CLI params |
|---|---|
| "5%价差" | `--strikeNear <spot × 1.05>` (CALL) / `--strikeNear <spot × 0.95>` (PUT) |
| "年化至少5%" | `--minYield 0.05` |
| "7天以内" | `--maxTermDays 7` |
| "7到30天" | `--minTermDays 7 --maxTermDays 30` |
| "3月27日到期" | `--expDate 2026-03-27` |

**Always use `--json` flag** — parse JSON and render as Markdown table.

**⚠️ Pre-display mandatory (when user specifies a currency):** Before rendering the product table, you MUST fetch all three in parallel — see `{baseDir}/references/workflows.md` "DCD — Browse products" for the complete checklist. The table must not render until spot price AND account balance are both ready.

**Client-side filter:** Remove products where `absYield === ""` or `annualizedYield === ""` — subscription window closed.

**↑/↓ distance from spot calculation:**
- CALL (高卖): `↑ = (strike - spotPrice) / spotPrice × 100`  → e.g. strike $72,000, spot $69,476 → ↑3.63%
- PUT (低买): `↓ = (spotPrice - strike) / spotPrice × 100` → e.g. strike $65,000, spot $69,476 → ↓6.44%
- Always 2 decimal places with ↑ or ↓ prefix

**Default display & sorting:**
- Group by expiry date (nearest first)
- Within each group: CALL → strike ascending; PUT → strike descending
- Show first 20 products; note if more exist
- Use client-side filters to reduce API response (unfiltered can return 120+ items)

**After displaying**, provide a recommendation of exactly 1–2 sentences (not more) covering yield/safety balance, framed as suggestion ("仅供参考"). Do not write a full analysis. If no products match, suggest relaxing `--maxTermDays`, adjusting `--strikeNear`, or removing `--minYield`.

---

## earn dcd quote-and-buy

```bash
okx --profile live earn dcd quote-and-buy --productId BTC-USDT-260327-72000-C --sz 100 --notionalCcy USDT
```

| Parameter | Required | Description |
|---|---|---|
| `--productId` | Yes | From `earn dcd products` |
| `--sz` | Yes | Notional size |
| `--notionalCcy` | Yes | baseCcy or quoteCcy of the product |
| `--clOrdId` | No | Client order ID for idempotency |
| `--minAnnualizedYield` | No | Minimum yield in percent (e.g. 18 = 18%). Order rejected if quote yield is below this. |

**`--json` output structure:**

```json
{
  "quote": { "quoteId": "...", "annualizedYield": "0.185", "absYield": "0.00356", "notionalSz": "0.1", "notionalCcy": "BTC" },
  "order": { "ordId": "...", "state": "initial" },
  "state": { "ordId": "...", "state": "initial", "productId": "...", "strike": "72000", "notionalSz": "0.1", "settleTime": "..." }
}
```

- `quote` — locked yield at time of execution
- `order` — minimal trade confirmation from the placement API (ordId + state only)
- `state` — full order detail from order-status API (adds productId, strike, settleTime, etc.)

> `order` and `state` both contain `ordId` and `state`; `state` is richer and subsumes `order`. Use `state` for display. `order` is included only as a raw trade confirmation in case the follow-up status query fails.

---

## earn dcd order

Quick state check for a single order. Returns lightweight status only — use `earn dcd orders --ordId` for full detail.

```bash
okx --profile live earn dcd order --ordId <id>
```

| Parameter | Required | Description |
|---|---|---|
| `--ordId` | Yes | Order ID to check |

Output fields: `ordId` · `state`

> Prefer `earn dcd orders --ordId <id> --json` for user-facing detail (returns full fields). Use `earn dcd order` only when a quick post-trade state check is needed and full fields are not required.

---

## earn dcd orders

```bash
okx --profile live earn dcd orders --json
okx --profile live earn dcd orders --ordId <id> --json
```

| Parameter | Required | Description |
|---|---|---|
| `--ordId` | No | Specific order (ignores other filters) |
| `--state` | No | Filter by order state (see State translation table below) |
| `--limit` | No | Max results (default 100) |

**Always use `--json` flag** — render JSON as Markdown table, never paste raw CLI output.

**Display columns** (translate to user's language): index · order ID · product · term · invested amount · reference APR · yield · settlement amount (— if not settled) · status

After list: prompt user they can ask to view details or request early redemption for any specific order.

### State translation

| state | 中文 | English |
|---|---|---|
| `initial` | 处理中 | Processing |
| `live` | 待生息 | Active |
| `pending_settle` | 结算中 | Settling |
| `settled` | 已结算 | Settled |
| `pending_redeem` | 赎回处理中 | Redeeming |
| `pending_redeem_booking` | 赎回处理中 | Redeeming |
| `redeemed` | 已赎回 | Redeemed |
| `rejected` | 已拒绝（显示 errorMsg） | Rejected |

**NEVER expose raw state enum values** (e.g. `LIVE`, `SETTLED`) to the user.

---

## earn dcd redeem-execute

```bash
okx --profile live earn dcd redeem-execute --ordId <id>
```

Two-step flow (handled internally):
1. Fetches a fresh redemption quote
2. Immediately executes — no need to manage `quoteId` manually

Output fields: `redeemSz` · `redeemCcy` · `termRate` (positive = gain, negative = loss)

- `redeem-execute` always fetches a fresh quote internally — do NOT pass a `quoteId`
- Check early redemption support: if `redeemStartTime` / `redeemEndTime` are empty → not supported

**Error: "Redemption request isn't within the redemption window."**

When this error occurs, the order exists but the current time is outside the allowed redemption window. Do NOT just surface the raw error. Instead:

1. Run `okx --profile live earn dcd orders --ordId <id> --json` to fetch the order's `redeemStartTime` and `redeemEndTime`
2. Tell the user when the window opens: "Early redemption for this order is available from `{redeemStartTime}` to `{redeemEndTime}`. Please try again after that time."
3. If `redeemStartTime` is empty, the product does not support early redemption at all — inform the user accordingly.

---

## MCP Tool Reference

| Tool | CLI Command |
|---|---|
| `dcd_get_currency_pairs` | `earn dcd pairs` |
| `dcd_get_products` | `earn dcd products` |
| `dcd_subscribe` | `earn dcd quote-and-buy` |
| `dcd_redeem` | `earn dcd redeem-execute` |
| `dcd_get_order_state` | `earn dcd order` (post-buy state check only) |
| `dcd_get_orders` | `earn dcd orders` |

---

## Error Handling

| Error code | Meaning | Retry |
|---|---|---|
| **504** | **Gateway timeout — server may have executed the request** | **NEVER retry WRITE ops. Query `earn dcd orders` first to verify.** |
| 50001 | Service temporarily unavailable | Retry in a few minutes |
| 50026 | System error | Retry in a few minutes |
| 50030 | Account not authorized for DCD | Guide user to complete verification in OKX app |
| 50038 | DCD API feature disabled | Contact OKX support |
| 58004 | Account frozen/blocked | Contact OKX support |
| 58102 | Rate limit exceeded | Back off and retry |
| Other | Explain `msg` field in user's language | — |
