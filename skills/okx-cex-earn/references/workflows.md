# Multi-Step Workflows

## Idle fund analysis — check and subscribe

"我有多少闲置资金可以赚币？"

1. `okx --profile live account asset-balance <ccy>` → idle funds in funding account
2. `okx --profile live account balance <ccy>` → idle funds in trading account
3. `okx --profile live earn savings balance <ccy>` → already in earn
4. `okx --profile live earn savings rate-history --ccy <ccy> --limit 1 --json` → current `rate` (threshold) and `lendingRate` (actual yield)
→ summarize idle funds and suggest subscribing if lendingRate is acceptable

---

## Subscribe earn then verify

"帮我把资金账户里的 1000 USDT 申购赚币"

1. Run in parallel:
   - `okx --profile live account asset-balance USDT` → verify balance ≥ 1000
   - `okx --profile live earn savings rate-history --ccy USDT --limit 1 --json` → current APY
2. Show confirmation summary (see savings-commands.md), wait for user confirmation
3. `okx --profile live earn savings purchase --ccy USDT --amt 1000`
4. Run in parallel to verify:
   - `okx --profile live earn savings balance USDT --json` → confirm position updated
   - `okx --profile live earn savings rate-history --ccy USDT --limit 1 --json` → show current lendingRate in position summary

---

## Redeem earn and transfer to trading account

"赎回我的 USDT 赚币，划转到交易账户"

1. `okx --profile live earn savings balance USDT` → check redeemable amount; show summary, wait for confirmation
2. `okx --profile live earn savings redeem --ccy USDT --amt <amt>`
3. _(Optional — requires **Withdraw** permission on the API key)_
   `okx --profile live account transfer --ccy USDT --amt <amt> --from 18 --to 6` (CLI account type IDs: 18=funding, 6=trading)

   If step 3 fails with a permission error, inform the user that their API key does not have Withdraw permission and they should complete the transfer manually in the OKX app.

---

## On-chain earn — subscribe with balance check

"帮我申购 ETH 链上赚币"

1. `okx --profile live account asset-balance ETH` → verify available balance
2. `okx --profile live earn onchain offers --ccy ETH` → show products, compare APY; show summary with risk disclaimer, wait for confirmation
3. `okx --profile live earn onchain purchase --productId <id> --ccy ETH --amt <amt>`
4. `okx --profile live earn onchain orders` → confirm order created

---

## DCD — Browse products with live spot price

"看看双币赢产品" / "看看BTC双币赢"

When user does **not** specify a currency pair, run in parallel:

```bash
okx --profile live earn dcd pairs                                              # supported pairs
okx --profile live market ticker BTC-USDT                                     # spot price
okx --profile live earn dcd products --baseCcy BTC --quoteCcy USDT --optType <C|P>  # default BTC-USDT
```

- Show BTC-USDT as default result
- After table, briefly mention up to 3 other available pairs (e.g. ETH-USDT, XRP-USDT) and ask if the user wants to view them. Respond in the user's language.

When user **specifies** a currency (e.g. "BTC高卖"), run ALL three in parallel **before rendering the table**:

```bash
okx --profile live market ticker {baseCcy}-USDT               # 1. Spot price (MUST)
okx --profile live account asset-balance {ccy}                # 2. Balance (MUST): CALL→baseCcy, PUT→quoteCcy
okx --profile live earn dcd products --baseCcy {baseCcy} --quoteCcy {quoteCcy} --optType {C|P} --json  # 3. Products
```

> ⚠️ Do NOT render the product table until all three are complete. Show spot price and balance above the table.
>
> If balance query fails (e.g. 401 / no credentials): show the product table anyway with spot price, omit the balance line, and note that balance check requires API credentials. Respond in the user's language.

Cross-skill: `okx-cex-market` for spot price, `okx-cex-portfolio` for balance if needed.

---

## DCD — Subscribe (quote-and-buy)

"我想申购高卖BTC，5%的价差，7天以内" / "帮我买这个双币产品"

1. Run parallel pre-display fetch (spot price + balance + products) as above
2. Show product table with ↑X.XX% / ↓X.XX% (2 decimal places) relative to spot, reference APR, term
3. Explain settlement scenarios **before** user selects — fill in ALL placeholders with real values. Respond in the user's language. Example structure (CALL / 高卖):

   ```
   You invest {sz} {notionalCcy} at target price ${strike}:

   ✅ Expiry price < ${strike} (not triggered — not sold):
      Receive {sz} × (1 + yield rate) {baseCcy}

   ⚠️ Expiry price ≥ ${strike} (triggered — sold at target price):
      Receive {sz} × {strike} × (1 + yield rate) {quoteCcy}
      Both principal and yield convert to {quoteCcy}

   The above APR is indicative; actual yield is locked at quote execution.
   ```

4. After user selects product and confirms amount, execute `earn dcd quote-and-buy` immediately — quote and execution happen atomically, no separate confirmation step needed. Respond in the user's language.

5. After `quote-and-buy`: wait 3–5 seconds, then query `earn dcd orders` to confirm. Show locked-in APR and order state.

---

## DCD — Early redemption (two-phase)

"提前赎回第1个订单"

This is the **only DCD WRITE operation requiring explicit user confirmation**.

**Phase 1 — Preview (indicative):**

1. `okx --profile live earn dcd redeem-execute --ordId <id>` — **do NOT run yet**, use `--json` to preview output first if needed, or explain to the user what will happen:
   - Show estimated `redeemSz`, `redeemCcy`, `termRate` (positive = gain, negative = loss) from a prior `earn dcd orders` query
2. Explicitly state (in user's language) that figures are indicative — actual amount is based on the live quote at execution time.
3. Wait for user confirmation

**Phase 2 — Execute (after confirmation):**

4. `okx --profile live earn dcd redeem-execute --ordId <id>`
   - Internally fetches a fresh quote and executes atomically
5. Wait 3–5 seconds, then query `earn dcd orders --ordId <id> --json` to confirm. Show the estimated settlement time from the order response as the expected arrival time. Respond in the user's language.

---

## DCD — Cross-skill: target-price sell workflow

"我想在72000卖出BTC"

1. `okx-cex-market` `okx --profile live market ticker BTC-USDT`
2. `okx --profile live earn dcd products --baseCcy BTC --quoteCcy USDT --optType C --strikeNear 72000`
   → explain CALL mechanics, show table, guide user to select term
3. `okx --profile live earn dcd quote-and-buy --productId <id> --sz <sz> --notionalCcy BTC`

---

## AutoEarn — Check and enable for idle funds

"帮我看看哪些币种可以自动赚币" / "开启 USDT 自动赚币"

1. Run in parallel:
   - `okx --profile live earn auto-earn status --json` → list currencies supporting auto-earn
   - `okx --profile live account balance --json` → get available balance per currency
2. Present as Markdown table, highlight currencies with `off` status that have available balance (from `account balance`)
3. If user wants to enable:
   - Show confirmation with 24h restriction warning (see `autoearn-commands.md`)
   - `okx --profile live earn auto-earn on <ccy>`
   - `okx --profile live earn auto-earn status <ccy> --json` → verify status changed

---

## AutoEarn — Disable

"关闭 SOL 自动赚币"

1. `okx --profile live earn auto-earn status <ccy> --json` → verify currently enabled
2. Show confirmation (see `autoearn-commands.md`)
3. `okx --profile live earn auto-earn off <ccy>`
4. If 24h error → parse timestamp, tell user when they can retry
5. If success → `okx --profile live earn auto-earn status <ccy> --json` → verify
