# Flexible Earn (Simple Earn) Notification Template

Render the notification **in the user's language** (detected from conversation context or client locale). The structure and data fields below are language-neutral — translate all labels and copy naturally.

## Title Format

```
💰 Simple Earn · {n} 个新机会 · {hh:mm}
```

- `{n}` — number of currencies newly above threshold in this batch
- `{hh:mm}` — scan completion time (user's local timezone)

## Body Format

### Rate Table

| Currency | APY |
|----------|-----|
| `{ccy}` | `{lendingRate}%` |

### Data Fields

- `{ccy}` — currency (keep as-is, e.g. USDC, USDT)
- `{lendingRate}` — current flexible lending APY, display as percentage with 2 decimals

### Empty Field Handling

- `{lendingRate}` is empty → render as `-` (not `0%` or blank)
- `{ccy}` is empty → render as `-`

## Threshold Display (optional)

Show the active APY threshold:

```
筛选条件：APY ≥ {threshold}%
```

- `{threshold}` — the effective APY threshold in percentage form (e.g. `8.00`)
- Only show when `globalMinApy > 0`

## Call to Action

### Interactive Channel (session)

```
→ 回复"申购 {ccy} 活期"立即申购
```

### Non-interactive Channel (TG / Lark push)

```
→ 通过 OKX App 申购，或说"申购 {ccy} 活期"
```

Adapt command language to user's locale:
- zh: `"申购 {ccy} 活期"`
- en: `"subscribe {ccy} flexible earn"`

## Dedup Behavior

Flexible earn uses a **threshold-crossing** dedup model:
- Notifies once when a currency's APY crosses above the threshold
- Stays silent while the APY remains above the threshold
- When APY drops below the threshold, the dedup key is cleaned up
- If APY rises above the threshold again, a new notification is sent

This means each currency generates at most one notification per "above-threshold" period.

## Locked Terms (do not translate)

Simple Earn, APY, OKX — brand/financial terms stay as-is. Currency symbols (USDT, USDC, BTC, ETH) stay as-is.

## Lark Card Format

Use `template: "orange"` for header. Body: table element for rates + markdown for threshold and CTA.

## Example (zh-CN)

```
💰 Simple Earn · 2 个新机会 · 14:30

| Currency | APY   |
|----------|-------|
| USDC     | 8.41% |
| USDT     | 8.12% |

筛选条件：APY ≥ 8.00%
→ 通过 OKX App 申购，或说"申购 USDC 活期"
```
