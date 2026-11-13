---
name: okx-cex-bot
description: Manage Grid bots (spot/contract/coin-margined), DCA Martingale bots (Spot DCA 现货马丁 / Contract DCA 合约马丁), Smart Portfolio bots (智能组合, auto-rebalancing multi-asset portfolio), and Recurring Buy strategies (定投, periodic fixed-amount multi-coin buys) on OKX. Covers create, stop, pause, amend, monitor P&L, TP/SL, margin/investment adjustment, AI-recommended parameters, and recommended zone backtest. Requires API credentials. Not for regular orders (okx-cex-trade), market data (okx-cex-market), or account info (okx-cex-portfolio).
license: MIT
metadata:
  author: okx
  version: "1.5.1"
  homepage: "https://www.okx.com"
  agent:
    emoji: "🤖"
    requires:
      bins: ["okx"]
    install:
      - id: npm
        kind: node
        package: "@okx_ai/okx-trade-cli@1.5.1"
        bins: ["okx"]
        label: "Install okx CLI (npm)"
---

# OKX CEX Bot Trading

Grid, DCA (Spot & Contract Martingale), Smart Portfolio and Recurring Buy (定投) management on OKX. All bots are **native OKX server-side** — they run on OKX and do not require a local process.

## Preflight

Before running any command, follow [`../_shared/preflight.md`](../_shared/preflight.md).
Use `metadata.version` from this file's frontmatter as the reference for Step 2.

## Prerequisites

```bash
npm install -g @okx_ai/okx-trade-cli
okx config init   # select site -> follow browser OAuth flow
```

> **Security**: NEVER accept credentials in chat. Guide users to `okx config init` for setup.

## Credential & Profile Check

**Run before every authenticated command.** The auth method is detected during [preflight](../_shared/preflight.md) Step 2 and remembered for the session.

### Step A — Verify credentials

Run **both** commands — the `apiKey` field from `okx auth status --json` is the auth-binary's internal state and is always `false` regardless of whether `~/.okx/config.toml` has an API-key profile. `okx config show --json` is the only authoritative source for API-key presence.

```bash
okx config show --json      # reveals API-key profiles (TOML config)
okx auth status --json      # reveals OAuth session state (auth-binary state)
```

Apply **in this order** — first match wins:

- `config show --json` has any profile with a non-empty `api_key` field → **API Key mode**. Proceed to Step B.
- No API-key profile **AND** `auth status --json` returns `"status":"logged_in"` → **OAuth mode**. Proceed to Step B.
- No API-key profile **AND** `"status":"pending"` — login is in progress, wait for it to complete.
- No API-key profile **AND** `"status":"not_logged_in"` — stop, load `okx-cex-auth` skill and follow login steps, wait for completion.

### Step B — Confirm trading mode

Resolution:
1. User intent is clear ("real"/"实盘"/"live" → live; "test"/"模拟"/"demo" → demo) → use it, inform user
2. No explicit declaration → check conversation context for previous choice → reuse if found
3. Nothing found → ask: "Live (实盘) or Demo (模拟盘)?" — wait before proceeding

**How to apply the mode depends on auth method (detected in Step A):**

| Auth method | Live (实盘) | Demo (模拟盘) |
|---|---|---|
| **API Key** | `--profile <live-profile>` | `--profile <demo-profile>` |
| **OAuth** | *(no flag needed, live is default)* | `--demo` |

- **API Key users**: run `okx config show --json` to discover available profile names and their `demo` settings.
- **OAuth users**: omit flags for live; add `--demo` for simulated trading.

**After every command**: append `[mode: live]` or `[mode: demo]`

### Handling 401 Errors

**Authentication error** (error contains "401", "Session expired", or "Run `okx auth login` first"):
1. Stop immediately
2. Load `okx-cex-auth` skill and follow re-authentication steps
3. Retry original command (a 401 means nothing was executed; after a timeout or other uncertain error on a Recurring Buy write, see Key Rules instead)

## Skill Routing

| Need | Skill |
|---|---|
| Market data, prices, depth | `okx-cex-market` |
| Account balance, positions, fees | `okx-cex-portfolio` |
| Regular spot/swap/futures orders | `okx-cex-trade` |
| **Grid / DCA / Smart Portfolio / Recurring Buy bots** | **`okx-cex-bot` (this skill)** |

## Command Index

### Grid Bot

| Command | Type | Description |
|---|---|---|
| `okx bot grid create` | WRITE | Create a grid bot (spot or contract) |
| `okx bot grid amend` | WRITE | Amend price range, grid count, or TP/SL of a running grid bot |
| `okx bot grid stop` | WRITE | Stop a grid bot |
| `okx bot grid positions` | READ | Query open contract-grid positions (liquidation price, margin ratio, unrealized PnL) |
| `okx bot grid liquidate-price` | READ | Estimate liquidation price for a contract-grid bot |
| `okx bot grid close-position` | WRITE | Close remaining position after bot stopped with stopType=2 |
| `okx bot grid orders` | READ | List active or history grid bots |
| `okx bot grid details` | READ | Grid bot details + PnL |
| `okx bot grid sub-orders` | READ | Individual grid fills or pending orders |

### DCA Bot (Spot & Contract)

| Command | Type | Description |
|---|---|---|
| `okx bot dca create` | WRITE | Create a DCA (Martingale) bot (spot or contract) |
| `okx bot dca stop` | WRITE | Stop a DCA bot (spot or contract) |
| `okx bot dca orders` | READ | List active or history DCA bots (default: contract_dca) |
| `okx bot dca positions` | READ | DCA bot position info (avgPx, upl, liqPx, ...) |
| `okx bot dca details` | READ | **Deprecated** - use `okx bot dca positions` (same endpoint) |
| `okx bot dca sub-orders` | READ | DCA cycles and orders within a cycle |
| `okx bot dca add-margin` | WRITE | Add margin to a running contract DCA bot |
| `okx bot dca reduce-margin` | WRITE | Reduce margin on a running contract DCA bot |
| `okx bot dca update-tp` | WRITE | Update take-profit price on a running contract DCA bot |

### Smart Portfolio Bot

> **Note**: Load with `--modules bot.smartportfolio` or `bot.all` (not in default modules).

| Command | Type | Description |
|---|---|---|
| `okx bot smart-portfolio create` | WRITE | Create a Smart Portfolio bot (2–10 assets, ratios summing to 1.0, deltaRatio threshold) |
| `okx bot smart-portfolio stop` | WRITE | Stop a running Smart Portfolio bot |
| `okx bot smart-portfolio orders` | READ | List Smart Portfolio bots (default: running; add --history for stopped) |
| `okx bot smart-portfolio details` | READ | Get Smart Portfolio bot details and current allocation |
| `okx bot smart-portfolio amend-rebalance` | WRITE | Update rebalance threshold and interval (both --deltaRatio and --interval required) |
| `okx bot smart-portfolio instant-rebalance` | WRITE | Trigger an immediate rebalance |
| `okx bot smart-portfolio recommend-zones` | READ | Browse OKX-recommended portfolio zone configurations |
| `okx bot smart-portfolio zones-backtest` | READ | Get historical backtest results for a recommended zone |

### Recurring Buy (定投)

> **Note**: CLI-only (`okx bot recurring ...`); no `--modules` flag is needed.

| Command | Type | Description |
|---|---|---|
| `okx bot recurring create` | WRITE | Create a Recurring Buy strategy (coins + ratios, period, time, amount per cycle, `--tdMode` required) |
| `okx bot recurring orders` | READ | List strategies (default: running/paused; add --history for stopped) |
| `okx bot recurring details` | READ | Strategy details with per-coin holdings, average price and PnL |
| `okx bot recurring sub-orders` | READ | Buy orders executed by a strategy |
| `okx bot recurring pause` | WRITE | Pause a strategy |
| `okx bot recurring restart` | WRITE | Restart a paused strategy |
| `okx bot recurring stop` | WRITE | Stop a strategy (permanent) |
| `okx bot recurring amend-name` | WRITE | Rename a strategy |
| `okx bot recurring amend-price-range` | WRITE | Change the per-coin buy price range |
| `okx bot recurring amend-amount` | WRITE | Change the amount invested per cycle |
| `okx bot recurring amend-time` | WRITE | Change period/day/time/time zone |
| `okx bot recurring add-investment` | WRITE | Add an extra one-off investment |

## Operation Flow

### Step 1 — Identify bot type and action

Parse user request → determine module (Grid / DCA / Smart Portfolio / Recurring Buy) and action (create / stop / list / details).

**DCA and Recurring Buy are different products — route by the user's wording:**
- "DCA" / 马丁 / Martingale, or safety-order / buy-the-dip wording → `okx bot dca` (the Martingale bot with safety orders).
- "recurring" / "Recurring Buy" / 定投, or a clear periodic fixed-amount request with no safety-order wording (e.g. "每周买 100 USDT 的 BTC") → `okx bot recurring`; name "Recurring Buy / 定投" in the confirmation summary.
- Ambiguous — "DCA" used for periodic fixed-amount buying, both words together, mixed wording, or no clear match → ask which product they mean, once. Never treat one as the other.

### Step 2 — Execute

**READ commands** (orders, details, sub-orders): run immediately after profile confirmation.

**WRITE commands** (create, amend, stop; for Recurring Buy also pause, restart, add-investment): confirm key parameters with user once before executing.

**Write-operation confirmation checklist — Recurring Buy**:
- `recurring create`: confirm coins and ratios, period + day/hour + time + `--timeZone`, `--amt`, `--investmentCcy` and `--tdMode`. Run `okx account config` first, read `acctLv` and follow `{baseDir}/references/recurring-commands.md`: `1` → `cash`; `2` → **ask the user** `cash` (spot) or `cross` (real leverage — state the risk), `cash` if no preference; `3` and `4` → `cross` only (executed as spot), never `cash` (on `4` the server answers success but does not trade). State the choice in the summary, never guess `acctLv` (ask if unreadable or not `1`–`4`), and always pass `--tdMode`.
- `recurring pause` / `restart`: confirm `algoId` and the strategy name, and read `details` first (`pause` needs `state` `running`, `restart` needs `pause`; otherwise tell the user instead of running it). Say that pause stops scheduled purchases and restart resumes them (do not say whether cycles missed while paused are bought later), and wait for an explicit yes. Afterwards check `details` (`nextInvestTime`) — `(OK)` is not proof.
- `recurring stop` / `add-investment`: real money and irreversible — confirm `algoId` (from `recurring orders`) and, for add-investment, the amount; before add-investment note `investmentAmt` from `details` and the newest `sub-orders` entry.
- `recurring amend-*`: confirm `algoId` and the new values; negative time zones use `--timeZone=-5`. **`amend-time --recurringTimeType 2` (and `create --recurringTimeType 2`) buys immediately and is not idempotent** — say so, get an explicit yes, then check `sub-orders` and `details`.

### Step 3 — Verify after writes

- After create → run the corresponding `orders` command to confirm active
- After amend → run `details --algoId <id>` to confirm updated config (Recurring Buy `amend-time` type 2: also `recurring sub-orders`)
- After Grid/DCA stop → run `orders --history` to confirm stopped
- After Smart Portfolio stop → run `smart-portfolio orders --history` to confirm stopped
- After Recurring Buy stop → run `recurring orders --history` to confirm stopped; after pause/restart/amend → run `recurring details --algoId <id>`
- After Recurring Buy add-investment → run `recurring sub-orders --algoId <id>` for the new buy order (normally `ordType` `manual_add_order`) and compare `investmentAmt` in `details` with the value read before (if it did not rise, rely on `sub-orders`; `(OK)` alone is not proof)

## Key Rules

- **Never auto-transfer funds.** If balance is insufficient for bot creation, report the shortfall (current available vs required) and ask the user how to proceed: (1) transfer funds manually, (2) reduce size, or (3) cancel.
- **Never retry a failed or uncertain Recurring Buy write yourself; the user decides.** After an error — especially a timeout, a dropped connection, a 5xx, or a `create` that fails with "returned no algoId" — the write may still have happened, and the lists can lag, so finding nothing is not proof either. Do not act on a "retry later" hint. Check (`orders` and `--history` for `create`; `sub-orders` and `details` for `add-investment` and `amend-time --recurringTimeType 2`; `details` otherwise), wait a moment and check once more, tell the user what you found, and re-run only after they explicitly ask or agree. For `create`, `add-investment` and `amend-time --recurringTimeType 2`, warn that a retry may duplicate the strategy or buy again.
- **`algoId`** is the bot's algo order ID (from create or list output). It is NOT a normal `ordId`. Never fabricate — always obtain from a prior command.
- **`algoOrdType`** for grid must match the bot's actual type. Always use the value from `bot grid orders` — do not infer from user description alone. Mismatch causes error `50016`.
- When operating on existing bots, **always list first** to get correct IDs, unless the user provides them explicitly.
- **TP/SL constraints**: `tpTriggerPx`/`tpRatio` and `slTriggerPx`/`slRatio` are mutually exclusive pairs.

## CLI Command Reference

For Grid Bot command syntax, parameter tables, Quickstart examples, and edge cases,
read `{baseDir}/references/grid-commands.md`.

For DCA Bot command syntax, parameter tables, Quickstart examples, and edge cases,
read `{baseDir}/references/dca-commands.md`.

For Smart Portfolio Bot command syntax, parameter tables, and examples,
read `{baseDir}/references/smart-portfolio-commands.md`.

For Recurring Buy command syntax, the `acctLv` → `tdMode` selection rule, parameter tables, and edge cases,
read `{baseDir}/references/recurring-commands.md`.

For cross-skill workflow examples (chaining `okx-cex-market`/`okx-cex-portfolio` with bot
creation), read `{baseDir}/references/workflows.md`.

## Communication Guidelines

- **Grid/DCA**: use "bot" not "strategy" (e.g., "grid bot", "DCA bot")
- **DCA**: always say "DCA" or "Martingale" — DCA supports both Spot DCA and Contract DCA
- **Recurring Buy**: say "Recurring Buy" / 定投 — never call it DCA (except when asking the user to choose between the two products)
- **Chinese**: Grid = "网格", Spot DCA = "现货马丁", Contract DCA = "合约马丁", Smart Portfolio = "智能组合", Recurring Buy = "定投"
- Use natural language for parameters — "What price range?" not "Enter minPx and maxPx"
- If the user already provides values, map directly — don't re-ask

> `{base}` and `{quote}`: extract from `instId` by splitting on `-`. E.g., `BTC-USDT-SWAP` → base=BTC, quote=USDT.

## Global Notes

- All bots run on OKX servers — stopping the CLI does not affect them
- Auth method and trading mode are determined in "Credential & Profile Check"; see that section for parameter rules
- `--json` returns the raw OKX API v5 response by default. Add `--env` to wrap the output as `{"env": "<live|demo>", "profile": "<name>", "data": <response>}`
- Rate limit: 20 requests per 2 seconds per UID
- Grid `--gridNum` range: 2–100
