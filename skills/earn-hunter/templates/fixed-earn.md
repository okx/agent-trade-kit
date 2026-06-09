# Fixed Earn Notification Template

Render the notification **in the user's language** (detected from conversation context or client locale). The structure and data fields below are language-neutral — translate all labels and copy naturally.

## Title Format

```
🏦 Fixed Earn · {n} 个新机会 · {hh:mm}
```

- `{n}` — number of new products in this batch
- `{hh:mm}` — scan completion time (user's local timezone)

## Effective Threshold Display

Show the active filter thresholds that produced these results:

```
{effective_threshold_display}
```

Example: `筛选条件：APR ≥ 3.00%，币种 USDT/USDC`

## Product Table

| Currency | Term | APR | Min | Remaining |
|----------|------|-----|-----|-----------|
| `{ccy}` | `{term}` | `{rate}%` | `{minLend}` | `{lendQuota}` |

### Data Fields

- `{ccy}` — currency (keep as-is)
- `{term}` — lock period (e.g. `7D`, `30D`)
- `{rate}` — annualized APR, display as percentage with 2 decimals
- `{minLend}` — minimum subscription amount
- `{lendQuota}` — remaining subscribable amount

### Empty Field Handling

All numeric/amount/rate fields must be checked before rendering. If a field value is `null`, `""` (empty string), or `undefined`, display `-` instead:

- `{rate}` is empty → render as `-` (not `0%` or blank)
- `{minLend}` is empty → render as `-`
- `{lendQuota}` is empty → render as `-`
- `{lendingRate}` (in APR comparison) is empty → skip the comparison section entirely

Always check before formatting: e.g. do NOT attempt to calculate `uplift` if either `rate` or `lendingRate` is empty.

## APR Comparison (optional)

Only show when `rate > lendingRate`. Display:

```
📊 收益对比：
   活期 APY {lendingRate}% → 定期 APR {rate}%（+{uplift}%，锁 {term}）
```

- `{lendingRate}` — current flexible APY for same currency
- `{uplift}` = `rate - lendingRate`, display with 2 decimals

## Call to Action

### Interactive Channel (session)

```
→ 回复申购金额，立即帮你申购
```

User can reply with amount directly; agent proceeds to purchase-guide flow.

### Non-interactive Channel (TG / Lark push)

```
→ 打开 Claude Code 说"申购 {ccy} 定期 {term}"
```

Adapt command language to user's locale:
- zh: `"申购 {ccy} 定期 {term}"`
- en: `"subscribe {ccy} fixed {term}"`

## Locked Terms (do not translate)

Fixed Earn, Simple Earn, APR, APY, OKX — brand/financial terms stay as-is. Currency symbols (USDT, BTC, ETH, USDC) stay as-is.

## Lark Card Format

Use `template: "blue"` for header. Body: table element for products + markdown elements for comparison and CTA.

## Example (zh-CN)

```
🏦 Fixed Earn · 3 个新机会 · 14:30

筛选条件：APR ≥ 3.00%，币种 USDT/USDC

| Currency | Term | APR   | Min  | Remaining |
|----------|------|-------|------|-----------|
| USDT     | 7D   | 4.50% | 100  | 50,000    |
| USDT     | 30D  | 5.20% | 100  | 30,000    |
| USDC     | 14D  | 3.80% | 50   | 80,000    |

📊 收益对比：
   活期 APY 2.10% → 定期 APR 4.50%（+2.40%，锁 7D）

→ 回复申购金额，立即帮你申购
```
