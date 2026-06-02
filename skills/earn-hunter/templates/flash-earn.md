# Flash Earn Notification Template

Render the notification **in the user's language** (detected from conversation context or client locale). The structure and data fields below are language-neutral — translate all labels and copy naturally.

## Title Format

```
⚡ Flash Earn · {n} 个新机会 · {hh:mm}
```

- `{n}` — number of new projects in this batch
- `{hh:mm}` — scan completion time (user's local timezone)

## Body Format

Each project occupies one line:

```
• {project_name} · {ccy} · {apy}% APY  [{status_badge}]
```

### Status Badge Logic

| status | canPurchase | Badge (render in user's language) |
|---|---|---|
| 100 | true | 🟢 进行中 / in-progress |
| 0 | - | ⏳ 预告 / upcoming |

Note: `status=100 + canPurchase=false` (sold out) is already filtered out in scan-logic.md and will never reach this template.

### Data Fields

- `{project_name}` — project display name
- `{ccy}` — reward currency (keep as-is, e.g. OKB, USDT)
- `{apy}` — annualized yield, display as percentage with 2 decimals
- `{status_badge}` — "预告" for upcoming (status=0), "进行中" for in-progress (status=100 + canPurchase=true)

### Empty Field Handling

All numeric/rate fields must be checked before rendering. If a field value is `null`, `""` (empty string), or `undefined`, display `-` instead:

- `{apy}` is empty → render as `-` (not `0%` or blank)
- `{project_name}` is empty → render as `(unnamed)`
- `{ccy}` is empty → render as `-`

Always check before formatting: e.g. do NOT attempt to format `null` as a percentage.

## Call to Action

```
→ 立即申购（ https://okx.com/ul/rhNe3q ）
```

Link opens OKX App directly to Flash Earn. Emphasize first-come-first-served urgency.

## Rendering Rules

- All copy rendered in user's language
- Brand names and token names are **never translated** (see Locked Terms)
- Upcoming projects show countdown to `beginTime` if available

## Locked Terms (do not translate)

Flash Earn, OKX, OKB, USDT, USDC, BTC, ETH — brand/token names stay as-is.

## Lark Card Format

Use `template: "purple"` for header. Body: 2-3 markdown elements (badge + details + CTA).

## Example (zh-CN)

```
⚡ Flash Earn · 2 个新机会 · 14:30

• OKB Staking Boost · OKB · 12.50% APY  [🟢 进行中]
• USDT Launch Pool · USDT · 8.20% APY  [⏳ 预告]

→ 立即参与
```
