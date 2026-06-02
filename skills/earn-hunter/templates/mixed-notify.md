# Mixed Notification Template

When Flash Earn and Fixed Earn opportunities are both found in the same scan round, merge them into a single message instead of sending two separate notifications.

Render the notification **in the user's language**. Brand/token names are never translated.

## Title Format

```
🎯 Earn Hunter · {hh:mm}
```

- `{hh:mm}` — scan completion time (user's local timezone)

## Body Structure

Flash Earn section comes first, followed by a divider, then Fixed Earn section.

```
⚡ Flash Earn · {n_flash} 个新机会

• {project_name} · {ccy} · {apy}% APY  [{status_badge}]
• ...

→ 立即参与

---

🏦 Fixed Earn · {n_fixed} 个新机会

{effective_threshold_display}

| Currency | Term | APR   | Min  | Remaining |
|----------|------|-------|------|-----------|
| ...      | ...  | ...   | ...  | ...       |

📊 收益对比：
   活期 APY {lendingRate}% → 定期 APR {rate}%（+{uplift}%，锁 {term}）

→ 回复申购金额，立即帮你申购
```

## APR Comparison Note

When multiple Fixed Earn products are listed, show the APR comparison for the **highest APR product only**. Format:
```
📊 收益对比：
   活期 APY {lendingRate}% → 定期 APR {best_rate}%（+{uplift}%，锁 {best_term}）
```
If only one product exists, show its comparison directly. The comparison section is optional — only show when `best_rate > lendingRate`.

## Section Rules

- **Flash section**: follow `flash-earn.md` template format (project lines + status badges + CTA)
- **Fixed section**: follow `fixed-earn.md` template format (threshold display + product table + APR comparison + CTA)
- **Divider**: use `---` (horizontal rule) between sections

## When to Use

Use this template when **both** Flash Earn and Fixed Earn produce new opportunities in the same scan round. If only one type has results, use the corresponding single template (`flash-earn.md` or `fixed-earn.md`).

## Locked Terms (do not translate)

Flash Earn, Fixed Earn, Earn Hunter, Simple Earn, APR, APY, OKX, OKB, USDT, USDC, BTC, ETH — brand/token/financial terms stay as-is.

## Lark Card Format

Use `template: "green"` for header (distinct from purple/blue used by single-type notifications). Body: combine both sections with markdown divider.

## Example (zh-CN)

```
🎯 Earn Hunter · 14:30

⚡ Flash Earn · 1 个新机会

• OKB Staking Boost · OKB · 12.50% APY  [🟢 进行中]

→ 立即参与

---

🏦 Fixed Earn · 2 个新机会

筛选条件：APR ≥ 3.00%，币种 USDT

| Currency | Term | APR   | Min  | Remaining |
|----------|------|-------|------|-----------|
| USDT     | 7D   | 4.50% | 100  | 50,000    |
| USDT     | 30D  | 5.20% | 100  | 30,000    |

📊 收益对比：
   活期 APY 2.10% → 定期 APR 4.50%（+2.40%，锁 7D）

→ 回复申购金额，立即帮你申购
```
