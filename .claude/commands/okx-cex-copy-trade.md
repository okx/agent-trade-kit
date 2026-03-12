---
name: okx-cex-copy-trade
description: "This skill should be used when the user asks about 'copy trading', 'follow a trader', 'lead traders', 'copy positions', 'copy trader ranking', 'unfollow trader', 'stop copy trading', 'copy P&L', 'trader stats', 'win rate', 'best traders to copy', 'copy trade settings', 'copy ratio', 'fixed amount copy', '跟单', '带单员', '跟单交易', '跟单排行', '跟随交易员', '停止跟单', '跟单盈亏', '带单员统计', '胜率', '复制交易'. Covers browsing lead trader rankings, following/unfollowing traders, and monitoring copy trading status on OKX. Public ranking/detail endpoints require no auth. Follow/unfollow require API credentials. Do NOT use for spot/swap direct trading (use okx-cex-trade), account balance (use okx-cex-portfolio), or market data (use okx-cex-market)."
license: MIT
metadata:
  author: okx
  version: "1.0.0"
  homepage: "https://www.okx.com"
  agent:
    requires:
      bins: ["okx"]
    install:
      - id: npm
        kind: node
        package: "@okx_ai/okx-trade-cli"
        bins: ["okx"]
        label: "Install okx CLI (npm)"
---

# OKX CEX Copy Trade CLI

Browse lead trader rankings, follow/unfollow traders, and monitor copy trading status on OKX exchange. Public ranking and trader-detail endpoints require no credentials. Follow/unfollow and status queries require API credentials.

> **Module not loaded by default.** Always pass `--modules copytrading` (or include it in your profile).

## Prerequisites

1. Install `okx` CLI:
   ```bash
   npm install -g @okx_ai/okx-trade-cli
   ```
2. Configure credentials and create a `live` profile (this skill always uses `--profile live` for authenticated commands):
   ```bash
   okx config add-profile AK=<your_api_key> SK=<your_secret_key> PP=<your_passphrase> name=live
   ```
3. Verify setup:
   ```bash
   okx --modules copytrading copy-trade traders
   ```

> **Note:** `copy-trade traders` and `copy-trade trader-detail` are **public endpoints** — they do not require API credentials.
>
> **Note:** Copy trading operates on real funds. Always use `--profile live`; demo mode is not supported.

## Credential & Profile Check

**Run this check before any authenticated command.**

### Step A — Verify credentials

```bash
okx config show       # verify configuration status (output is masked)
```

- If no configuration: **stop**, guide the user to run `okx config init`, wait for setup.
- If configured: proceed to Step B.

### Step B — Profile

Copy trading **does not support demo/simulated trading mode.** Always use `--profile live`.

```bash
okx --modules copytrading --profile live copy-trade status    # ✅ correct
okx --modules copytrading --profile demo copy-trade status    # ❌ not supported
```

Use `--profile live` silently for all authenticated commands — do not mention it to the user unless there is an error.

### Handling 401 Authentication Errors

If any command returns a 401 / authentication error:
1. **Stop immediately** — do not retry the same command
2. Inform the user: "Authentication failed (401). Your API credentials may be invalid or expired."
3. Guide the user to update credentials by editing `~/.okx/config.toml`. Do NOT paste credentials into chat.
4. After the user confirms the file is updated, run `okx config show` to verify
5. Only then retry the original operation

## Demo vs Live Mode

**OKX Copy Trading does not support demo mode.** All follow/unfollow commands use real funds.

```bash
okx --modules copytrading --profile live copy-trade follow ...    # ✅ correct
okx --modules copytrading --profile demo copy-trade follow ...    # ❌ will error
```

Only mention demo limitations if the user explicitly asks for demo mode:
> "OKX 跟单交易不支持模拟盘，所有操作使用真实资金。"

## Skill Routing

| User intent | Route to skill |
|---|---|
| Market prices, tickers, candles | `okx-cex-market` |
| Spot / swap / futures / options orders | `okx-cex-trade` |
| Account balance, positions, transfers | `okx-cex-portfolio` |
| Grid / DCA trading bots | `okx-cex-bot` |
| Simple Earn or On-chain Earn | `okx-cex-earn` |
| Copy trading — follow/unfollow traders | **This skill** |

## Cross-Skill Workflows

### Browse traders then follow
> User: "帮我找一个胜率高的带单员跟单" / "Find a high win-rate trader to copy"

```
1. okx-cex-copy-trade  okx --modules copytrading copy-trade traders --instType SWAP
   → show ranking table; ask user to pick one
2. okx-cex-copy-trade  okx --modules copytrading copy-trade trader-detail --uniqueCode <code>
   → show win rate, P&L trend, currency preference
   → show summary and wait for confirmation
3. okx-cex-copy-trade  okx --modules copytrading --profile live copy-trade follow \
       --uniqueCode <code> --fixedAmt <n>
4. okx-cex-copy-trade  okx --modules copytrading --profile live copy-trade status
   → confirm trader appears in active list
```

### Check my copy status then unfollow
> User: "我现在在跟哪些带单员？停止跟单" / "Who am I copying? Stop copying them."

```
1. okx-cex-copy-trade  okx --modules copytrading --profile live copy-trade status
   → show active traders list with P&L
   → show summary and wait for user to pick trader to unfollow
2. okx-cex-copy-trade  okx --modules copytrading --profile live copy-trade unfollow \
       --uniqueCode <code>
3. okx-cex-copy-trade  okx --modules copytrading --profile live copy-trade status
   → confirm trader is removed
```

### Check balance before following
> User: "我有足够的钱跟单吗？" / "Do I have enough funds to start copy trading?"

```
1. okx-cex-portfolio  okx --profile live account balance USDT
   → check available trading account balance
2. okx-cex-copy-trade  okx --modules copytrading copy-trade traders
   → show traders; user selects one
3. → show follow summary with fixedAmt recommendation, wait for confirmation
```

## Quickstart

```bash
# Browse top SWAP lead traders
okx --modules copytrading copy-trade traders

# View detailed profile of a specific trader
okx --modules copytrading copy-trade trader-detail --uniqueCode <16-char-code>

# Check which traders you are currently copying
okx --modules copytrading --profile live copy-trade status

# Start following a trader (real funds)
okx --modules copytrading --profile live copy-trade follow --uniqueCode <code> --fixedAmt 1000

# Stop following a trader
okx --modules copytrading --profile live copy-trade unfollow --uniqueCode <code>
```

## Command Index

### copy-trade — Copy Trading (5 commands)

| Command | Type | Auth | Description |
|---|---|---|---|
| `copy-trade traders [--instType] [--limit]` | READ | **None** | Top lead traders by ranking |
| `copy-trade trader-detail --uniqueCode` | READ | **None** | Full trader profile: P&L, stats, currency preference |
| `copy-trade status [--instType]` | READ | Required | My currently followed traders and cumulative P&L |
| `copy-trade follow --uniqueCode --fixedAmt` | **WRITE** | Required | Start copy trading a lead trader |
| `copy-trade unfollow --uniqueCode` | **WRITE** | Required | Stop copy trading a lead trader |

## Operation Flow

### Step 0 — Module Flag

The `copytrading` module is **not loaded by default**. Always include `--modules copytrading`:

```bash
okx --modules copytrading copy-trade traders               # ✅
okx copy-trade traders                                     # ❌ module not loaded
```

For multi-module sessions, combine: `--modules copytrading,spot,swap,account`

### Step 1 — Identify intent

- Browse traders / view stats / check my status → READ command, proceed directly
- Follow / unfollow → WRITE command, go to Step 2

**When the user asks to view "my copy trading" or "我的跟单" without specifying, always run:**
```bash
okx --modules copytrading --profile live copy-trade status
```

### Step 2 — Confirm write operation

For all WRITE commands, present a summary and wait for explicit confirmation.

Follow example:
```
操作：开始跟单
带单员：<nickName> (<uniqueCode>)
最大跟单总额：1,000 USDT
每单金额：100 USDT（fixed_amount 模式）
保证金模式：isolated（逐仓）
合约类型：SWAP

⚠️ 此操作将使用真实资金。开始跟单后，系统将自动复制该带单员的开仓动作。

确认？（yes / no）
```

Unfollow example:
```
操作：停止跟单
带单员：<nickName> (<uniqueCode>)
持仓处理：manual_close（保持当前持仓不变，需自行管理）

⚠️ 停止跟单后将不再跟随该带单员开仓。当前持仓不会自动平仓（manual_close 默认行为）。

确认？（yes / no）
```

**"just do it" / "直接搞" is NOT valid confirmation** — the user must see the summary first.

### Step 3 — Execute and verify

**After follow:**
```bash
okx --modules copytrading --profile live copy-trade status
# → confirm the trader appears in the active list
```

**After unfollow:**
```bash
okx --modules copytrading --profile live copy-trade status
# → confirm the trader is no longer in the active list
```

---

## CLI Command Reference

### copy-trade traders

Browse top lead traders by ranking. **Public endpoint — no credentials or `--profile` required.**

```bash
okx --modules copytrading copy-trade traders
okx --modules copytrading copy-trade traders --instType SPOT
okx --modules copytrading copy-trade traders --limit 20
okx --modules copytrading copy-trade traders --json
```

| Parameter | Required | Description |
|---|---|---|
| `--instType` | No | `SWAP` (default) or `SPOT` |
| `--limit` | No | Max results (default 10, max 20) |

Output fields: `uniqueCode` · `nickName` · `pnl` · `winRatio` · `copyTraderNum` · `leadDays`

When displaying results, highlight traders with high `winRatio` and significant `leadDays`. Suggest `copy-trade trader-detail` for deeper investigation.

---

### copy-trade trader-detail

Get full profile of a specific lead trader. **Public endpoint — no credentials required.**

```bash
okx --modules copytrading copy-trade trader-detail --uniqueCode <code>
okx --modules copytrading copy-trade trader-detail --uniqueCode <code> --lastDays 1
okx --modules copytrading copy-trade trader-detail --uniqueCode <code> --json
```

| Parameter | Required | Description |
|---|---|---|
| `--uniqueCode` | Yes | 16-character lead trader unique code |
| `--lastDays` | No | Time range: `1`=7d, `2`=30d (default), `3`=90d, `4`=365d |
| `--instType` | No | `SWAP` (default) or `SPOT` |

Output (three sections):
- **Stats**: `winRatio` · `profitDays` · `lossDays` · `curCopyTraderPnl` (follower P&L) · `avgSubPosNotional` · `investAmt`
- **Daily P&L**: `date` · `pnl` · `pnlRatio`
- **Currency Preference**: `ccy` · `ratio` (% of trading activity)

When displaying, show Stats summary first, then P&L trend table, then top 3 currency preferences. Recommend `--lastDays 2` (30d) as the default balanced view.

---

### copy-trade status

Check which lead traders you are currently following, with cumulative P&L. **Private endpoint.**

```bash
okx --modules copytrading --profile live copy-trade status
okx --modules copytrading --profile live copy-trade status --instType SPOT
okx --modules copytrading --profile live copy-trade status --json
```

| Parameter | Required | Description |
|---|---|---|
| `--instType` | No | `SWAP` (default) or `SPOT` |

Output fields per trader: `uniqueCode` · `nickName` · `copyTotalPnl` · `todayPnl` · `upl` · `margin`

If no active traders, display: "当前没有正在跟随的带单员。"

---

### copy-trade follow

Start copy trading a lead trader for the first time. **Moves real funds.**

```bash
okx --modules copytrading --profile live copy-trade follow \
  --uniqueCode <code> --fixedAmt 1000
```

| Parameter | Required | Description |
|---|---|---|
| `--uniqueCode` | Yes | Lead trader unique code (16 chars) |
| `--fixedAmt` | Yes | Max total USDT to allocate for this trader (`copyTotalAmt`) |
| `--copyAmt` | No | Fixed USDT per order (for `fixed_amount` mode) |
| `--copyMode` | No | `fixed_amount` (default) or `ratio_copy` |
| `--copyRatio` | No | Copy ratio (required when `--copyMode ratio_copy`) |
| `--mgnMode` | No | Margin mode: `isolated` (default), `cross`, `copy` |
| `--instType` | No | `SWAP` (default) or `SPOT` |

> **`--fixedAmt` is the total allocation cap** — the maximum USDT budget for this trader. It is NOT the per-order size. Use `--copyAmt` to control per-order amount.

**Pre-execution checklist:**
1. Run `copy-trade trader-detail --uniqueCode <code>` to confirm trader exists and show their stats
2. Show follow summary (see Operation Flow Step 2)
3. Wait for explicit user confirmation

---

### copy-trade unfollow

Stop copy trading a lead trader. **Existing positions are kept open by default (manual_close).**

```bash
okx --modules copytrading --profile live copy-trade unfollow --uniqueCode <code>
```

| Parameter | Required | Description |
|---|---|---|
| `--uniqueCode` | Yes | Lead trader unique code |
| `--instType` | No | `SWAP` (default) or `SPOT` |

> **Default behavior (`manual_close`):** existing copy positions are NOT automatically closed — the user must manage them manually. If the user wants positions closed immediately, they need to handle that separately via swap/futures close commands.

**Pre-execution checklist:**
1. Confirm the trader is in the active list (`copy-trade status`)
2. Show unfollow summary with position handling explanation
3. Wait for explicit user confirmation

---

## MCP Tool Reference

| Tool | CLI Command | Auth | Description |
|---|---|---|---|
| `copytrading_public_lead_traders` | `copy-trade traders` | Public | Top lead traders by ranking |
| `copytrading_public_trader_detail` | `copy-trade trader-detail` | Public | Full trader profile (P&L + stats + preference) |
| `copytrading_my_status` | `copy-trade status` | Private | My active copy traders and cumulative P&L |
| `copytrading_set_copy_trading` | `copy-trade follow` | Private ⚠️ | Start copy trading |
| `copytrading_stop_copy_trader` | `copy-trade unfollow` | Private ⚠️ | Stop copy trading |

⚠️ Write operations — allocate/release real funds.

**Key MCP parameter notes:**
- `copytrading_set_copy_trading` requires both `uniqueCode` AND `copyTotalAmt`
- `copyTotalAmt` = total budget cap (maps to CLI `--fixedAmt`)
- `copyAmt` = per-order fixed amount (maps to CLI `--copyAmt`)
- `lastDays` enum: `"1"`=7d, `"2"`=30d, `"3"`=90d, `"4"`=365d

---

## Input / Output Examples

**"Show me top copy traders"**
```bash
okx --modules copytrading copy-trade traders --instType SWAP --limit 10
# → uniqueCode | nickName | pnl | winRatio | copyTraderNum | leadDays
```

**"Tell me more about trader ABC123"**
```bash
okx --modules copytrading copy-trade trader-detail --uniqueCode ABC123
# → Win Rate: 68.5%
# → Profit Days: 42 / Loss Days: 14
# → Daily P&L table (30 days)
# → Currency Preference: BTC 45.2%, ETH 30.1%, SOL 12.3%
```

**"Who am I currently copying?"**
```bash
okx --modules copytrading --profile live copy-trade status
# → uniqueCode | nickName | copyTotalPnl | todayPnl | upl | margin
```

**"Start copy trading trader XYZ with 500 USDT"**
```bash
# Step 1: get trader profile
okx --modules copytrading copy-trade trader-detail --uniqueCode XYZ
# Step 2: show summary and wait for confirmation
# Step 3: execute
okx --modules copytrading --profile live copy-trade follow \
  --uniqueCode XYZ --fixedAmt 500
# Step 4: verify
okx --modules copytrading --profile live copy-trade status
```

**"Stop following trader XYZ"**
```bash
# Step 1: confirm active
okx --modules copytrading --profile live copy-trade status
# Step 2: show unfollow summary (positions remain open — manual_close)
# Step 3: execute
okx --modules copytrading --profile live copy-trade unfollow --uniqueCode XYZ
# Step 4: verify
okx --modules copytrading --profile live copy-trade status
```

---

## Edge Cases

### Module not loaded

If any command returns "Unknown command" or module-not-found error, the `copytrading` module was not enabled:
```bash
# Wrong
okx copy-trade traders
# Right
okx --modules copytrading copy-trade traders
```

### `copytrading_set_copy_trading` is first-time only

`copy-trade follow` calls the `/first-copy-settings` endpoint — it is for **starting** a new copy relationship. If the user is already following a trader and wants to adjust settings (e.g. change `copyAmt`), the follow command will fail with a business error. In this case:
> "你已经在跟随该带单员。如需调整设置，请先停止跟单（unfollow），再重新开始跟单（follow）并填入新参数。"

### `uniqueCode` is 16 characters

The `uniqueCode` must be exactly 16 characters. If the user provides a shorter/longer code or a trader name, prompt them to get the exact code from `copy-trade traders` or `copy-trade trader-detail`.

### Open positions after unfollow (manual_close)

After `copy-trade unfollow`, existing copy positions remain open. If the user wants to close them:
1. Use `okx-cex-trade` (`swap close` or `futures close`) to manually close positions
2. Or re-follow the trader with `subPosCloseType=market_close` (closes positions automatically on unfollow) — note this requires unfollowing and re-following

### instType mismatch

`instType` defaults to `SWAP` for all commands. If the user is copy trading SPOT, always pass `--instType SPOT` explicitly — otherwise the query may return empty results or wrong traders.

### No traders in ranking

If `copy-trade traders` returns an empty list, the API may be throttled or the filters are too restrictive. Try without filters first:
```bash
okx --modules copytrading copy-trade traders --instType SWAP
```

---

## Global Notes

- **Module flag required:** `--modules copytrading` must always be included — the module is not in the default set.
- **Public vs private:** `traders` and `trader-detail` are public (no API key needed). `status`, `follow`, `unfollow` require API credentials.
- **Real funds:** `follow` and `unfollow` always involve real money. Never skip the confirmation step.
- **Rate limits:** Public endpoints are not rate-limited under normal use. Private endpoints: 5 requests/2s.
- **`lastDays` enum:** `"1"`=7d, `"2"`=30d (default), `"3"`=90d, `"4"`=365d — always pass as a string.
- **Number formatting:** Display amounts with full precision and currency unit (e.g. `1,234.56 USDT`). Display rates/ratios as percentage (e.g. `68.5%`).
- **Time format:** Display timestamps as `YYYY/M/D HH:MM:SS`.
- **Response structure:** Three-part format — Conclusion → Evidence → Recommended action.
- **Credentials in chat:** Never ask users to paste API keys or secrets into the conversation.
