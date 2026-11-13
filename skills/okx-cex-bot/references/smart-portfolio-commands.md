# Smart Portfolio Bot Commands

> Requires `--modules bot.smartportfolio` or `bot.all` (not in default modules).

## Create

```bash
okx bot smart-portfolio create \
  --stgyName <name> \
  --investmentCcy USDT \
  --initCapital <amount> \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval <minutes> \
  --deltaRatio 0.05
```

- `stgyName`, `investmentCcy`, `initCapital`, `portfolioList`, `interval`, `deltaRatio`: all required.
- `portfolioList`: JSON array of `{ccy, ratio}` objects. Must have 2–10 items. Ratios are exact decimal strings and must sum to exactly 1 (no tolerance; `0.6` + `0.40001` is rejected locally). CCYs are case-insensitive and must be unique.
- `deltaRatio`: Rebalance trigger threshold. Minimum 0.01, must be < 1. Value is truncated (toward zero) to 2 decimal places from the exact decimal text, so `0.29` stays `0.29`.
- `interval`: Periodic rebalance interval in minutes (e.g. `20` = rebalance every 20 minutes).
- `--tradeQuoteCcy <ccy>`: Optional. The currency actually debited (not the valuation currency); defaults to `investmentCcy` only when omitted.
- `--aiBuilderCode <code>`: Optional builder attribution code, forwarded to `smart_portfolio_create_order`. Only `create` accepts it.

## List Bots (Running or History)

```bash
# Running bots (default)
okx bot smart-portfolio orders [--algoId <id>] [--instId <pair>] [--after <id>] [--before <id>] [--limit <n>]

# Stopped bots
okx bot smart-portfolio orders --history [--state stopped] [--instType <SPOT>] \
  [--algoId <id>] [--instId <pair>] [--after <id>] [--before <id>] [--limit <n>]
```

## Get Details

```bash
okx bot smart-portfolio details --algoId <id>
```

## Stop

```bash
okx bot smart-portfolio stop --algoId <id> --stopType <1|2>
```

`--stopType` is required. `1` = stop and sell all assets back to `investmentCcy`; `2` = stop and keep current holdings. Always check bot state via `details` before stopping.

## Amend Rebalance Parameters

```bash
okx bot smart-portfolio amend-rebalance --algoId <id> --deltaRatio <n> --interval <minutes>
```

Both `--deltaRatio` and `--interval` are required on every call. The server rejects the request if both values equal the bot's current settings. `portfolioList`, `investmentCcy`, and rebalance mode cannot be changed via this command.

## Trigger Instant Rebalance

```bash
okx bot smart-portfolio instant-rebalance --algoId <id>
```

`triggered: true` means the rebalance flow was started — **not** that any trade executed or filled. `triggered: false` only means no trade flow was started this time (market conditions can also apply); never tell the user the portfolio is "already balanced" from it.

## Pause / Resume Automatic Rebalancing

```bash
okx bot smart-portfolio manual-pause  --algoId <id>
okx bot smart-portfolio manual-resume --algoId <id>
```

- `manual-pause` only stops automatic rebalancing. The bot keeps running and no asset is sold. Eligible: running, not mid-rebalance, not already manually paused. Rejected (`51059`) while a top-up is still in transit.
- `manual-resume` lifts the manual pause and triggers one rebalance check (a check does not guarantee any trade). Rejected (`51059`) if the bot is not manually paused, is still restricted for another reason, or a top-up is in transit / not yet confirmed as arrived. After the other restriction clears the user must submit the resume again; do not do it for them.
- Success is `code=0` with empty `data` — it means *accepted*. Verify with `details`; do not claim a state without evidence, and do not invent a "paused by user" field.

## Add Investment (top-up)

```bash
okx bot smart-portfolio add-investment --algoId <id> --addInvest <amount> [--tradeQuoteCcy <ccy>]
```

- Adds funds without changing the target coins or weights. **Real funds, not idempotent.**
- `--addInvest`: positive decimal string. Missing, zero, negative or non-numeric → rejected locally, no request sent. Do not choose, adjust or suggest an amount: the user decides.
- `--tradeQuoteCcy`: optional settlement currency. Omit it (or leave it blank) and the backend uses the bot's own settlement currency — do not guess one such as USDT. A non-empty value is only trimmed (case is kept) and must match the bot's currency exactly, otherwise `51000`. Never auto-switch currency or retry with another value.
- Before writing, do the **trading-account balance pre-check** below.
- Success = accepted. It does not mean the funds have arrived and says nothing about trades. The backend exposes no cumulative top-up field and no per-top-up status: a total-investment value that has not changed may mean "still processing" or "failed" — say exactly that, and do not treat it as a failure or a success.

## Edit Portfolio (coins and weights)

```bash
okx bot smart-portfolio edit-portfolio --algoId <id> \
  --portfolioList '[{"ccy":"BTC","ratio":"0.4"},{"ccy":"ETH","ratio":"0.4"},{"ccy":"SOL","ratio":"0.2"}]' \
  [--addInvest <amount> [--tradeQuoteCcy <ccy>]]
```

- `--portfolioList` is the **complete** new target (not a delta): 2–10 unique coins, every ratio an exact positive decimal, total exactly 1. Only `combined` rebalance mode is supported (details may not show the mode; the backend decides).
- The user must state every coin and weight. If they only say "add SOL" or "drop ETH", ask for the whole new allocation — do not propose weights, split the rest evenly, rescale or fix the sum. The current live holdings are not the target.
- `details` may contain rows that are not target coins (e.g. a cash row with ratio 1): read the real structure of `portfolioList` before presenting the "current target"; if it is unclear, ask.
- A target identical to the current one is rejected (`51000`); use `add-investment` for a top-up only.
- Takes effect immediately and triggers a rebalance; with `--addInvest` the rebalance waits until the funds are confirmed as arrived. The edit and the top-up can partly succeed: the edit may be live while the top-up transfer fails, and the edit is **not** rolled back.
- Without `--addInvest` (or with blank/zero) no top-up is requested and `--tradeQuoteCcy` is ignored.
- Backend still validates coin eligibility, per-coin weight range and minimum investment; do not hard-code those limits.

## Trading-account balance pre-check (add-investment, and edit-portfolio with a top-up)

1. Currency: the bot's `tradeQuoteCcy` from `details --json`; if empty, the bot's `quote` as a fact read (not a recommendation). If the user named a different currency, do not rewrite it — explain that it must match the bot's settlement currency.
2. Run `okx account balance <ccy> --json` (MCP `account_get_balance`) with the **same profile / site / live-or-demo context** as the write. Not `asset-balance` (funding account), not `balance-all`, not valuation or total equity.
3. Read the `details[]` entry of that currency and use its `availBal` as the available balance. If the entry or the field is missing/empty, or the account mode makes the field not applicable, the check is **not completed** — it is not "enough" and not "zero". Do not substitute `availEq`, `eq`, `cashBal`, `frozenBal`, `totalEq` or USD values.
4. Compare with the user's amount as exact decimals, in the same currency.

| Result | What to do |
|---|---|
| Available ≥ amount | Say the snapshot is sufficient; it can still change (frozen funds, concurrent orders) and does not guarantee the transfer |
| Available < amount | Show available, requested and shortfall; say the transfer **may fail**. Do not suggest another amount, do not transfer funds, do not switch to the funding account. The user may still confirm |
| Unknown / failed | Say the check was not completed, put it in the summary as an unknown risk |

The balance does not tell you the bot's allowed top-up range; there is no OpenAPI quota query, so do not call a private/PriAPI endpoint or invent one.

## Errors (operations)

Judge by `code`, not by message wording. Report the backend `msg` as is; never auto-retry, never change parameters and retry.

| Code | Meaning | Applies to |
|---|---|---|
| `50014` | Required parameter missing/empty | all four |
| `51000` | Invalid parameter (bad algoId, invalid amount, currency does not match the bot, unchanged target, non-combined mode, invalid combination) | all four |
| `51059` | State or fund-processing does not allow it (not eligible, already paused, top-up in transit, other restriction) | all four |
| `51293` | Strategy does not exist or is not the caller's | all four |
| `51318` | Top-up amount outside the allowed range | add-investment, edit-portfolio |
| `51320` | **Weight** out of the allowed range, or weights do not meet the sum requirement — not a top-up error; never confuse with 51318 / 51361 | edit-portfolio |
| `51360` | Cumulative investment after the top-up would exceed the bot's maximum | add-investment, edit-portfolio |
| `51361` | Below the minimum top-up, **or** the funds are below the new portfolio's minimum investment (two different amounts — do not infer which from the code alone; quote the backend text, do not compute a suggested amount) | add-investment, edit-portfolio |

Rate-limit errors: do not retry automatically, do not change parameters; tell the user to try again later. A timeout, dropped connection or 5xx on a write is **uncertain** — it may have been executed. Read `details` (and the balance for a top-up) first; an empty list or an unchanged value is not proof it did not run.

## Browse Recommended Zones

```bash
okx bot smart-portfolio recommend-zones [--recommendId <id>] [--assetType <Crypto|TradeFi>]
```

Use `recommendId` from results to run a backtest.

## Get Zone Backtest

```bash
okx bot smart-portfolio zones-backtest --recommendId <id> [--period <24H|7D|1M|3M|6M|1Y|2Y>]
```

---

## Edge Cases

- **State check before stop**: always call `details` first to confirm the bot is `running` before issuing `stop`.
- **amend-rebalance no-op rejection**: if both `deltaRatio` and `interval` match the bot's current values, the server returns an error — at least one value must differ.
- **Demo mode**: smart-portfolio bots created in demo mode (`--demo`) are isolated from live bots.
- **No investment advice**: the operations above are executed from the user's own coins, weights and amounts. Recommended zones are a separate read-only lookup; do not use them to fill or propose an edit/top-up unless the user asks for that exact configuration, and then confirm the complete allocation like any other.
- **Wording**: *accepted* (request), *configuration in effect* (seen in `details`), *funds arrived* and *trade filled* are four different facts. Do not claim a later one from an earlier one, and do not state backend automation (e.g. what the system does after funds arrive) as fact.
- **`filled` state not applicable**: unlike Grid/DCA, Smart Portfolio history only uses state `stopped`; do not pass `--state filled`.

---

## Parameter Display Names

### Smart Portfolio Bot (智能组合)

| API Field | EN | ZH |
|---|---|---|
| `stgyName` | Strategy name | 策略名称 |
| `investmentCcy` | Valuation currency | 计价币种 |
| `initCapital` | Initial investment amount | 初始投入金额 |
| `portfolioList` | Asset allocation list | 组合资产列表 |
| `interval` | Rebalance interval (minutes) | 再平衡间隔（分钟） |
| `deltaRatio` | Rebalance threshold | 再平衡偏离阈值 |
| `investType` | Investment type (simple / complex) | 投入方式（简单 / 复合） |
| `tradeQuoteCcy` | Debit / settlement currency | 实际扣款 / 结算币种 |
| `addInvest` | Top-up amount | 追加投入金额 |
| `algoClOrdId` | Client strategy ID | 客户端策略 ID |
| `aiBuilderCode` | Builder attribution code (optional) | Builder 归因码（可选） |
| `stopType` | Stop type (1=sell all / 2=keep assets) | 停止类型（1=卖出全部 / 2=保留持仓） |
| `recommendId` | Recommended zone ID | 推荐组合 ID |
| `assetType` | Asset category (Crypto / TradeFi) | 资产类别（加密货币 / 传统金融） |
| `period` | Backtest period | 回测周期 |
| `totalPnl` | Total profit and loss | 累计盈亏 |
| `pnlRatio` | PnL ratio | 累计收益率 |
| `state` | Bot state (running / stopping / stopped / pause) | 策略状态（运行中 / 停止中 / 已停止 / 暂停） |
