---
name: okx-cex-portfolio
description: "This skill should be used when the user asks about 'account balance', 'how much USDT do I have', 'my funding account', 'show my positions', 'open positions', 'position P&L', 'unrealized PnL', 'closed positions', 'position history', 'realized PnL', 'account bills', 'transaction history', 'trading fees', 'fee tier', 'account config', 'max order size', 'how much can I buy', 'withdrawable amount', 'transfer funds', 'move USDT to trading account', or 'switch position mode'. Also use for '总资产', 'full balance', 'all assets', 'total holdings', 'net worth', 'how much do I have in total', 'show all my balances', 'all account balances', 'asset overview'. Requires API credentials. Do NOT use for market prices (use okx-cex-market), placing/cancelling orders (use okx-cex-trade), or grid/DCA bots (use okx-cex-bot)."
license: MIT
metadata:
  author: okx
  version: "1.3.2"
  homepage: "https://www.okx.com"
  agent:
    requires:
      bins: ["okx"]
    install:
      - id: npm
        kind: node
        package: "@okx_ai/okx-trade-cli@1.3.2"
        bins: ["okx"]
        label: "Install okx CLI (npm)"
---

# OKX CEX Portfolio & Account CLI

Account balance, positions, P&L, bills, fees, and fund transfers on OKX exchange. **Requires API credentials.**

## Preflight

Before running any command, follow [`../_shared/preflight.md`](../_shared/preflight.md).
Use `metadata.version` from this file's frontmatter as the reference for Step 2.

## Prerequisites

1. Install `okx` CLI:
   ```bash
   npm install -g @okx_ai/okx-trade-cli
   ```
2. Configure credentials:
   ```bash
   okx config init   # select site -> follow browser OAuth flow
   ```
3. Test with demo mode (simulated trading, no real funds):
   ```bash
   okx --demo account balance
   ```

> **Security**: NEVER accept credentials in chat. Guide users to `okx config init` for setup.

## Credential & Profile Check

**Run this check before any authenticated command.** The auth method is detected during [preflight](../_shared/preflight.md) Step 2 and remembered for the session.

### Step A — Verify credentials

Check **both** sources (see [preflight Step 2](../_shared/preflight.md#step-2--detect-auth-method-once-per-session) for the decision table). `okx auth status --json` alone is insufficient — its `apiKey` field is always `false` and does NOT reflect the TOML config.

```bash
okx config show --json      # authoritative for API-key presence
okx auth status --json      # authoritative for OAuth session state
```

Branch in this order — first match wins:

- `config show` has any profile with a non-empty `api_key` — **API Key mode**. Proceed to Step B.
- No API-key profile **AND** `auth status` returns `"status": "logged_in"` — **OAuth mode**. Proceed to Step B.
- No API-key profile **AND** `auth status` returns `"status": "pending"` — login in progress, wait.
- No API-key profile **AND** `auth status` returns `"status": "not_logged_in"` — **stop all operations**, load `okx-cex-auth` skill and follow login steps, wait for completion.

### Step B — Confirm trading mode

**Resolution rules:**
1. Current message intent is clear (e.g. "real" / "实盘" / "live" → live; "test" / "模拟" / "demo" → demo) → use it and inform the user
2. Current message has no explicit declaration → check conversation context for a previous choice:
   - Found → reuse it, inform user
   - Not found → ask: `"Live (实盘) or Demo (模拟盘)?"` — wait for answer before proceeding

**How to apply the mode depends on auth method (detected in Step A):**

| Auth method | Live (实盘) | Demo (模拟盘) |
|---|---|---|
| **API Key** | `--profile <live-profile>` | `--profile <demo-profile>` |
| **OAuth** | *(no flag needed, live is default)* | `--demo` |

- **API Key users**: run `okx config show --json` to discover available profile names and their `demo` settings. Use `--profile <name>` to select the correct one.
- **OAuth users**: omit flags for live trading; add `--demo` for simulated trading. Do **not** use `--profile` to switch modes.

### Handling Authentication Errors

**Authentication error** (error contains "401", "Session expired", or "Run `okx auth login` first"):
1. **Stop immediately** — do not retry the same command
2. Inform the user: "Authentication failed. Your session may have expired."
3. Load `okx-cex-auth` skill and follow the re-authentication steps
4. After successful re-authentication, retry the original command

## Demo vs Live Mode

| Mode | Funds | API Key param | OAuth param |
|---|---|---|---|
| 实盘 (live) | Real funds | `--profile <live-profile>` | *(default, no flag)* |
| 模拟盘 (demo) | Simulated funds | `--profile <demo-profile>` | `--demo` |

```bash
# API Key user
okx --profile okx-prod  account balance     # 实盘
okx --profile okx-demo  account balance     # 模拟盘

# OAuth user
okx account balance                          # 实盘 (default)
okx --demo account balance                   # 模拟盘
```

**Rules:**
- **Read commands** (balance, positions, bills, etc.): always state which mode was used
- **Write commands** (`transfer`, `set-position-mode`): **mode must be confirmed before execution** (see "Credential & Profile Check" Step B); transfer especially — wrong mode means wrong account
- Every response after a command must append: `[mode: live]` or `[mode: demo]`

## Skill Routing

- For market data (prices, charts, depth, funding rates) → use `okx-cex-market`
- For account balance, P&L, positions, fees, transfers → use `okx-cex-portfolio` (this skill)
- For regular spot/swap/futures/algo orders → use `okx-cex-trade`
- For grid and DCA trading bots → use `okx-cex-bot`

## Quickstart

```bash
# Trading account balance (all currencies with balance > 0)
okx account balance

# Check USDT balance only
okx account balance USDT

# Funding account balance
okx account asset-balance

# All open positions
okx account positions

# Closed position history with realized PnL
okx account positions-history

# Recent account bills (last 100)
okx account bills

# My trading fee tier
okx account fees --instType SPOT

# Transfer 100 USDT from funding (6) to trading (18)
okx account transfer --ccy USDT --amt 100 --from 6 --to 18
```

## Command Index

### Read Commands

| # | Command | Type | Description |
|---|---|---|---|
| 1 | `okx account balance [ccy]` | READ | Trading account equity, available, frozen |
| 2a | `okx account asset-balance [ccy]` | READ | Funding account balance (per-currency list) |
| 2b | `okx account asset-balance [ccy] --valuation [--valuationCcy <ccy>]` | READ | Same + total asset valuation across trading/funding/earn; denomination defaults to USDT, override with `--valuationCcy BTC` |
| 3 | `okx account positions` | READ | Open contract/swap positions |
| 4 | `okx account positions-history` | READ | Closed positions + realized PnL |
| 5 | `okx account bills` | READ | Account ledger (deposits, withdrawals, trades) |
| 6 | `okx account fees --instType <type>` | READ | My trading fee tier (maker/taker) |
| 7 | `okx account config` | READ | Account level, position mode, UID |
| 8 | `okx account max-size --instId <id> --tdMode <mode>` | READ | Max buy/sell size at current price |
| 9 | `okx account max-avail-size --instId <id> --tdMode <mode>` | READ | Available size for next order |
| 10 | `okx account max-withdrawal [ccy]` | READ | Max withdrawable per currency |

### Write Commands

| # | Command | Type | Description |
|---|---|---|---|
| 11 | `okx account set-position-mode <mode>` | WRITE | Switch net/hedge position mode |
| 12 | `okx account transfer` | WRITE | Transfer funds between accounts |

## Cross-Skill Workflows

### Pre-trade balance check
> User: "I want to buy 0.1 BTC — do I have enough USDT?"

```
1. okx-cex-portfolio okx account asset-balance --valuation   → total assets in USDT (trading/funding/earn breakdown)
   → check details.trading (available in trading account)
   → if trading balance < needed: check details.funding — may need to transfer
2. okx-cex-market    okx market ticker BTC-USDT              → check current price
        ↓ user approves
3. okx-cex-trade     okx spot place --instId BTC-USDT --side buy --ordType market --sz 0.1
```

### Pre-bot balance check
> User: "I want to start a BTC grid bot with 1000 USDT"

```
1. okx-cex-portfolio okx account asset-balance --valuation   → total assets in USDT (trading/funding/earn breakdown)
   → check details.trading ≥ 1000 (funds must be in trading account for grid bot)
   → if details.funding has the USDT instead: use account transfer first
2. okx-cex-market    okx market candles BTC-USDT --bar 4H --limit 50  → determine price range
        ↓ user approves
3. okx-cex-bot       okx bot grid create --instId BTC-USDT --algoOrdType grid \
                       --minPx 90000 --maxPx 100000 --gridNum 10 --quoteSz 1000
```

### Review open positions and P&L
> User: "Show me my current positions and how they're performing"

```
1. okx-cex-portfolio okx account positions                  → open positions with UPL
2. okx-cex-portfolio okx account positions-history          → recently closed positions
3. okx-cex-market    okx market ticker BTC-USDT-SWAP        → check current price vs entry
```

### Transfer and trade
> User: "Move 500 USDT from my funding account to trade BTC"

```
1. okx-cex-portfolio okx account asset-balance USDT         → confirm funding balance ≥ 500
        ↓ user approves
2. okx-cex-portfolio okx account transfer --ccy USDT --amt 500 --from 6 --to 18
3. okx-cex-portfolio okx account balance USDT               → confirm trading balance updated
        ↓ ready to trade
4. okx-cex-trade     okx spot place ...
```

### Check max position size before entering
> User: "How much BTC can I buy with cross margin?"

```
1. okx-cex-portfolio okx account balance                    → total equity
2. okx-cex-portfolio okx account max-size --instId BTC-USDT-SWAP --tdMode cross  → max buy/sell size
3. okx-cex-market    okx market ticker BTC-USDT-SWAP        → current price reference
```

## Operation Flow

### Step 0 — Credential & Profile Check

Before any authenticated command: see [Credential & Profile Check](#credential--profile-check). Determine auth method and trading mode before executing.

**After every command result:** append `[mode: live]` or `[mode: demo]` to the response

### Step 1: Identify account action

- Check balance → `okx account balance` (trading equity only) or `okx account asset-balance` (funding balances) or `okx account asset-balance --valuation` (total across all accounts in USDT)
- View open positions → `okx account positions`
- View closed positions + PnL → `okx account positions-history`
- View transaction history → `okx account bills`
- Check fee tier → `okx account fees`
- Check account settings → `okx account config`
- Calculate order size → `okx account max-size` or `okx account max-avail-size`
- Check withdrawal limit → `okx account max-withdrawal`
- Transfer funds → `okx account transfer`
- Change position mode → `okx account set-position-mode`

### Step 2: Run read commands immediately — confirm profile (Step 0) then writes

**Read commands** (1–10): run immediately, no confirmation needed.

- `ccy` filter: use currency symbol like `USDT`, `BTC`, `ETH`
- `--instType` for fees/positions: `SPOT`, `SWAP`, `FUTURES`, `OPTION`
- `--archive` for bills: access older records beyond the default window
- `--tdMode` for max-size: `cash` (spot), `cross`, or `isolated`

**Write commands** (11–12): confirm once before executing.

- `set-position-mode`: confirm mode (`net` = one-directional, `long_short_mode` = hedge mode); switching may affect open positions
- `transfer`: confirm `--ccy`, `--amt`, `--from`, `--to` (account types: `6`=funding, `18`=trading); verify source balance first

### Step 3: Verify after writes

- After `set-position-mode`: run `okx account config` to confirm `posMode` updated
- After `transfer`: run `okx account balance` and `okx account asset-balance` to confirm balances updated

## CLI Command Reference

### Account Balance — Trading Account

```bash
okx account balance [ccy] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `ccy` | No | - | Filter to a single currency (e.g., `USDT`) |

Returns table: `currency`, `equity`, `available`, `frozen`. Only shows currencies with balance > 0.

---

### Asset Balance — Funding Account

```bash
okx account asset-balance [ccy] [--valuation] [--valuationCcy <ccy>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `ccy` | No | - | Filter to a specific currency (e.g., `USDT`); does not affect valuation denomination |
| `--valuation` | No | false | Also show total asset valuation across all account types (trading/funding/earn) |
| `--valuationCcy` | No | `USDT` | Currency in which to denominate the total asset valuation (e.g., `USDT`, `BTC`). Only used when `--valuation` is set. |

Returns: `ccy`, `bal`, `availBal`, `frozenBal`. Only shows currencies with balance > 0.

With `--valuation`: additionally prints a valuation summary table with `totalBal` and per-account-type breakdown (`classic`/`earn`/`funding`/`trading`). The numbers are denominated in `--valuationCcy` (default `USDT`).

**Important**: `ccy` (balance filter) and `--valuationCcy` (valuation denomination) are independent parameters — `ccy=BTC` filters the balance list to BTC rows but does NOT change the valuation currency; set `--valuationCcy BTC` explicitly for BTC-denominated totals.

---

### Positions — Open Positions

```bash
okx account positions [--instType <type>] [--instId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instType` | No | - | Filter: `SWAP`, `FUTURES`, `OPTION` |
| `--instId` | No | - | Filter to specific instrument |

Returns: `instId`, `instType`, `side` (posSide), `pos`, `avgPx`, `upl` (unrealized PnL), `lever`. Only shows positions with size ≠ 0.

---

### Positions History — Closed Positions

```bash
okx account positions-history [--instType <type>] [--instId <id>] [--limit <n>] [--json]
```

Returns: `instId`, `direction`, `openAvgPx`, `closeAvgPx`, `realizedPnl`, `uTime`.

---

### Bills — Account Ledger

```bash
okx account bills [--archive] [--instType <type>] [--ccy <ccy>] [--limit <n>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--archive` | No | false | Access older records (archive endpoint) |
| `--instType` | No | - | Filter by instrument type |
| `--ccy` | No | - | Filter by currency |
| `--limit` | No | 100 | Number of records |

Returns: `billId`, `instId`, `type`, `ccy`, `balChg`, `bal`, `ts`.

---

### Fees — Trading Fee Tier

```bash
okx account fees --instType <type> [--instId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instType` | Yes | - | `SPOT`, `SWAP`, `FUTURES`, `OPTION` |
| `--instId` | No | - | Specific instrument (optional) |

Returns: `level`, `maker`, `taker`, `makerU`, `takerU`, `ts`.

---

### Config — Account Configuration

```bash
okx account config [--json]
```

Returns: `uid`, `acctLv` (account level), `posMode` (net/long_short_mode), `autoLoan`, `greeksType`, `level`, `levelTmp`.

---

### Max Size — Maximum Order Size

```bash
okx account max-size --instId <id> --tdMode <mode> [--px <price>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Instrument ID |
| `--tdMode` | Yes | - | `cash` (spot), `cross`, or `isolated` |
| `--px` | No | - | Reference price (uses mark price if omitted) |

Returns: `instId`, `maxBuy`, `maxSell`.

---

### Max Available Size

```bash
okx account max-avail-size --instId <id> --tdMode <mode> [--json]
```

Returns: `instId`, `availBuy`, `availSell` — the immediately available size for the next order.

---

### Max Withdrawal

```bash
okx account max-withdrawal [ccy] [--json]
```

Returns table: `ccy`, `maxWd`, `maxWdEx` (with borrowing). Shows all currencies if no filter.

---

### Set Position Mode

```bash
okx account set-position-mode <net|long_short_mode> [--json]
```

| Value | Behavior |
|---|---|
| `net` | One-directional (default) — long and short net out |
| `long_short_mode` | Hedge mode — long and short can coexist |

> **Warning**: Switching modes when positions are open may cause unexpected behavior. Check `okx account positions` first.

---

### Transfer Funds

```bash
okx account transfer --ccy <ccy> --amt <n> --from <acctType> --to <acctType> \
  [--transferType <type>] [--subAcct <name>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--ccy` | Yes | - | Currency to transfer (e.g., `USDT`) |
| `--amt` | Yes | - | Amount to transfer |
| `--from` | Yes | - | Source account type: `6`=funding, `18`=trading |
| `--to` | Yes | - | Destination account type: `6`=funding, `18`=trading |
| `--transferType` | No | `0` | `0`=within account, `1`=to sub-account, `2`=from sub-account |
| `--subAcct` | No | - | Sub-account name (required for sub-account transfers) |

Returns: `transId`, `ccy`, `amt`.

---

## MCP Tool Reference

| Tool | Description |
|---|---|
| `account_get_balance` | Trading account balance |
| `account_get_asset_balance` | Funding account balance. Use `showValuation=true` to include total asset valuation across trading/funding/earn accounts. Use `valuationCcy` (default `"USDT"`) to set the denomination for the valuation total — e.g. `valuationCcy="BTC"` returns the total in BTC. |
| `account_get_positions` | Open positions |
| `account_get_positions_history` | Closed position history |
| `account_get_bills` | Account bills (recent) |
| `account_get_bills_archive` | Account bills (archive) |
| `account_get_trade_fee` | Trading fee tier |
| `account_get_config` | Account configuration |
| `account_get_max_size` | Max order size |
| `account_get_max_avail_size` | Max available size |
| `account_get_max_withdrawal` | Max withdrawable |
| `account_set_position_mode` | Set position mode |
| `account_transfer` | Transfer between accounts |

---

## Input / Output Examples

**"How much USDT do I have?"**
```bash
okx account balance USDT
# → currency: USDT | equity: 5000.00 | available: 4500.00 | frozen: 500.00
```

**"Show all my open positions"**
```bash
okx account positions
# → table: instId, instType, side, pos, avgPx, upl, lever
```

**"What's my trading history and realized PnL?"**
```bash
okx account positions-history
# → table: instId, direction, openAvgPx, closeAvgPx, realizedPnl, uTime
```

**"Show my recent account activity"**
```bash
okx account bills --limit 20
# → table: billId, instId, type, ccy, balChg, bal, ts
```

**"What are my trading fees for SWAP?"**
```bash
okx account fees --instType SWAP
# → level: VIP1 | maker: -0.0001 | taker: 0.0005
```

**"How much BTC can I buy in cross margin?"**
```bash
okx account max-size --instId BTC-USDT-SWAP --tdMode cross
# → instId: BTC-USDT-SWAP | maxBuy: 12.5 | maxSell: 12.5
```

**"Transfer 200 USDT from funding to trading"**
```bash
okx account transfer --ccy USDT --amt 200 --from 6 --to 18
# → Transfer: TXN123456 (USDT 200)
```

**"Check my account config"**
```bash
okx account config
# → uid: 123456789 | acctLv: 2 | posMode: net | autoLoan: false
```

## Where Can the Money Live?

OKX splits assets across multiple sub-accounts. The `--valuation` breakdown maps directly:

| Account type | `details` key | Used for | Check with |
|---|---|---|---|
| Trading (unified) | `trading` | Spot, margin, swap, futures, options | `okx account balance` or `details.trading` in `--valuation` |
| Funding | `funding` | Deposits/withdrawals, idle funds | `okx account asset-balance` or `details.funding` in `--valuation` |
| Earn | `earn` | Simple earn, staking, savings | `details.earn` in `--valuation` |
| Classic | `classic` | Classic account (legacy, less common) | `details.classic` in `--valuation` |

**Typical flow when user says "I have X USDT but can't trade":**
1. `okx account asset-balance --valuation` → look at each `details.*` field
2. If `details.funding` is large and `details.trading` is small → the funds are in the funding account
3. Transfer: `okx account transfer --ccy USDT --amt <n> --from 6 --to 18`
4. Confirm: `okx account balance USDT` → equity should now reflect the transferred amount

## Edge Cases

- **No balance shown**: balance is filtered to > 0 — if nothing shows, all currencies have zero balance
- **Positions command returns empty**: no open contracts; spot holdings are not shown here (use `account balance`)
- **bills --archive**: required for transactions older than 7 days (default window); may be slower
- **set-position-mode**: cannot switch to `net` if you have both long and short positions on the same instrument
- **transfer --from/--to codes**: `6`=funding account, `18`=trading account; other values exist for sub-account flows
- **max-size vs max-avail-size**: `max-size` is the theoretical maximum; `max-avail-size` accounts for existing orders and reserved margin
- **Demo mode**: `okx --demo account balance` (OAuth) or `okx --profile <demo-profile> account balance` (API Key) shows simulated balances, not real funds

## Global Notes

- All write commands require valid credentials (OAuth session or API key in `~/.okx/config.toml`)
- Auth method and trading mode are determined in "Credential & Profile Check"; see that section for parameter rules
- Every command result includes a `[mode: live]` or `[mode: demo]` tag for audit reference
- `--json` returns the raw OKX API v5 response by default. Add `--env` to wrap the output as `{"env": "<live|demo>", "profile": "<name>", "data": <response>}`
- Rate limit: 10 requests per 2 seconds for account endpoints
- Positions shown are for the unified trading account; funding account assets are separate
- Account types: `6`=Funding Account (deposits/withdrawals), `18`=Unified Trading Account (spot + derivatives)
