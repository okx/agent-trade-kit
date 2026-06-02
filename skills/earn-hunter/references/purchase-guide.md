# Purchase Guide

## Trigger

User receives a Fixed Earn notification and returns to the agent session saying any of:
- "申购" / "subscribe" / "我要买" / "buy it"
- "申购 USDT 定期 7天" (with specific parameters)

## Flow

### Step 1 — Gather Balance (parallel)

Run all three in parallel:

```bash
okx [--profile live] account asset-balance <ccy>         # funding account
okx [--profile live] account balance <ccy>               # trading account
okx [--profile live] earn savings balance <ccy> --json   # Simple Earn flexible position
```

Also fetch current flexible rate for comparison:

```bash
okx [--profile live] earn savings rate-history --ccy <ccy> --limit 1 --json
```

### Step 2 — Compare APR

Extract:
- `fixed_rate` from the notification or `earn savings fixed-products`
- `flexible_rate` = `lendingRate` from rate-history

### Step 3 — Recommend Amount

Build a recommendation table:

| Source | Available | Current Yield | Recommendation |
|---|---|---|---|
| Funding account | X <ccy> | 0% (idle) | Full amount → Fixed Earn |
| Trading account | Y <ccy> | 0% (idle) | Full amount → Fixed Earn ⚠️ |
| Simple Earn Flexible | Z <ccy> | A.AA% | Move to Fixed if fixed_rate > flexible_rate |

⚠️ Note for trading account: transferring requires **Withdraw** permission on the API key. If the user's key lacks this permission, note that they need to transfer manually in the OKX app.

### Step 4 — Present and Confirm

Show the recommendation to the user. Let them choose:
- Which sources to use
- How much from each source
- Which term to subscribe

### Operation Sequence (CRITICAL)

The following operations MUST execute in this exact order:

1. **soldOut recheck** — re-fetch `earn savings fixed-products` to verify the target product is still available
2. **User final confirmation** — show final summary and get explicit "确认" from user
3. **Redeem** (if needed) — redeem from Simple Earn flexible to funding account
4. **Purchase** — execute fixed-purchase via okx-cex-earn

Never execute redeem before soldOut recheck. If soldOut recheck fails (product no longer available), abort immediately — do not proceed to redeem or purchase.

### Step 5 — Hand Off to okx-cex-earn

earn-hunter does NOT directly execute write operations. Instead:

1. Announce: "Handing off to okx-cex-earn for the subscription..."
2. Load the `okx-cex-earn` skill and follow its Fixed Earn subscribe flow:
   - Preview: `okx earn savings fixed-purchase --ccy <ccy> --amt <amt> --term <term> --json`
   - Show confirmation summary (with lock warning)
   - Execute: `okx earn savings fixed-purchase --ccy <ccy> --amt <amt> --term <term> --confirm --json`
   - Verify: `okx earn savings fixed-orders --ccy <ccy> --state pending --json`

#### Fallback: okx-cex-earn Skill Not Available

If `okx-cex-earn` skill is not installed or cannot be loaded (marketplace unavailable, install failed, etc.), provide a manual fallback:

**Option A — Direct CLI commands (copy-paste):**
```bash
# Preview (dry run)
okx earn savings fixed-purchase --ccy <ccy> --amt <amt> --term <term> --json

# Confirm and execute
okx earn savings fixed-purchase --ccy <ccy> --amt <amt> --term <term> --confirm --json

# Verify order was placed
okx earn savings fixed-orders --ccy <ccy> --state pending --json
```
Present the pre-filled commands with the user's confirmed parameters so they can copy-paste directly.

**Option B — OKX App:**
"你也可以在 OKX App 中操作：金融 → 赚币 → Simple Earn → 定期 → 选择 {ccy} {term} → 输入金额 → 确认申购。"

### Fund Routing (if needed)

If funds are in trading account:
```bash
okx [--profile live] account transfer --ccy <ccy> --amt <amt> --from 18 --to 6
```
(18=trading, 6=funding)

If funds are in Simple Earn flexible:
```bash
okx [--profile live] earn savings redeem --ccy <ccy> --amt <amt>
```
(Funds return to funding account)

Both operations require user confirmation before executing.

## Recommended Amount Formula

### Calculation

```
idle_amt = funding_balance + trading_balance
movable_simple_earn = (simple_earn_balance if lendingRate < fixed_rate else 0)
recommended_amt = idle_amt + movable_simple_earn
maxBuyableAmt = min(recommended_amt, lendQuota)
```

### Display Template

```
推荐买入金额：{maxBuyableAmt} = 闲置 {idle_amt} + 低利活期 {movable_simple_earn_amt}
```

- If `movable_simple_earn` is 0, simplify to: `推荐买入金额：{maxBuyableAmt}（全部来自闲置资金）`

### Comparison Hint

| Condition | Hint |
|---|---|
| `lendingRate < fixed_rate` | "活期收益低于定期目标，建议挪过来" |
| `lendingRate >= fixed_rate` | "活期收益不低于定期目标，建议保留" |

## Edge Cases & Error Handling

### Balance Insufficient

When `idle_amt + movable_simple_earn < minLend`:

```
❌ 余额不足，还差 {diff} {ccy}
   当前可用：{available} {ccy}（闲置 {idle_amt} + 可挪活期 {movable_simple_earn}）
   最低申购：{minLend} {ccy}
```

### Amount Exceeds Quota

When user-requested amount or `recommended_amt > lendQuota`:

- Auto-narrow to `lendQuota`
- Notify user:
  ```
  ⚠ 产品剩余额度 {lendQuota} {ccy}，已自动调整为最大可购金额
  ```

### Pre-Purchase Recheck (Sold Out)

After user confirms the amount, before executing purchase:

1. Re-fetch `earn savings fixed-products --ccy <ccy> --json`
2. If the target product's `lendQuota` is 0 or product is no longer listed:
   ```
   ❌ 该产品已售罄，申购未执行
   ```

### Redeem Succeeded but Purchase Failed

If Simple Earn flexible redeem succeeds but subsequent Fixed Earn purchase fails:

```
⚠ 已赎回 {amt} {ccy}，但申购失败
   资金当前在资金账户中，未丢失
   错误原因：{error_message}
   你可以稍后重试申购，或手动在 OKX App 操作
```

### Preview Completed but User Did Not Confirm (after redeem)

If user triggered a preview flow that redeemed Simple Earn funds but then did not confirm the Fixed Earn purchase:

```
⚠ 已赎回 {amt} {ccy} 到资金账户，但未完成定期申购
   资金安全在资金账户中
   如需继续申购，回复"申购 {ccy} 定期 {term}"
```
