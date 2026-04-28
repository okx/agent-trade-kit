---
name: okx-cex-smartmoney
description: "Smart Money analytics on OKX: leaderboard traders, position tracking, trade records, closed-position history, aggregated consensus signals, and signal history. Use this skill when the user asks about 聪明钱, smart money, 牛人榜, leaderboard, top traders, 交易员排行, trader ranking, trader positions, trader PnL, 交易员持仓, 交易员收益, 历史平仓, closed positions, realized PnL track record, trade history, 成交记录, smart money signal, 聪明钱信号, long/short ratio, 多空比, capital flow, 资金流向, position conviction, 仓位强度, entry price distribution, smart money overview, 聪明钱总览, signal history, 信号历史, trader search, 搜索交易员, who is trading BTC, 谁在交易BTC, recommend traders, 推荐交易员, best traders, top performers."
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

# OKX CEX Smart Money CLI

Smart Money leaderboard, trader analytics, position tracking, and aggregated consensus signals.

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
3. Verify: `okx smartmoney traders`

> **Security**: NEVER accept credentials in chat. Guide users to `okx config init` for setup.

---

## Credential & Profile Check

Run **both** commands before any authenticated command — the `apiKey` field from `okx auth status --json` is the auth-binary's internal state and is always `false` regardless of whether `~/.okx/config.toml` has an API-key profile. `okx config show --json` is the only authoritative source for API-key presence. The auth method is detected during [preflight](../_shared/preflight.md) Step 2 and remembered for the session.

```bash
okx config show --json      # reveals API-key profiles (TOML config)
okx auth status --json      # reveals OAuth session state (auth-binary state)
```

Apply **in this order** — first match wins:

- `config show --json` has any profile with a non-empty `api_key` field → **API Key mode**. Proceed.
- No API-key profile **AND** `auth status --json` returns `"status":"logged_in"` → **OAuth mode**. Proceed.
- No API-key profile **AND** `"status":"pending"` — login is in progress, wait for it to complete.
- No API-key profile **AND** `"status":"not_logged_in"` — **stop**, load `okx-cex-auth` skill and follow login steps, wait for completion.

Smart Money does not support demo mode (leaderboard data is live-only). Always use live mode silently — don't mention it unless there's an error.
- **API Key users**: use `--profile <live-profile>` (the profile without `demo=true`).
- **OAuth users**: no flag needed (live is the default).

**On authentication errors (401 / "Session expired" / "Run `okx auth login` first"):** stop immediately, load `okx-cex-auth` skill and follow re-authentication steps, then retry.

---

## Skill Routing

| User intent | Route to skill |
|---|---|
| Market prices, tickers, candles | `okx-cex-market` |
| Spot / swap / futures / options orders | `okx-cex-trade` |
| Account balance, positions, transfers | `okx-cex-portfolio` |
| Grid / DCA trading bots | `okx-cex-bot` |
| Simple Earn, Flash Earn, On-chain Earn, Dual Investment (双币赢), or AutoEarn (自动赚币) | `okx-cex-earn` |
| Smart Money leaderboard, signals, trader analytics | **This skill** |

---

## Command Index (8 commands, all read-only)

### Trader Data

| Command | Type | Auth | Description |
|---|---|---|---|
| `smartmoney traders` | READ | Required | List/filter traders from leaderboard (paginated) |
| `smartmoney trader --authorId <id>` | READ | Required | Trader full portrait — composite (profile + positions + trades) |
| `smartmoney positions --authorId <id>` | READ | Required | Trader's current open positions (atomic) |
| `smartmoney trades --authorId <id>` | READ | Required | Trader's recent order/fill records (atomic, paginated) |
| `smartmoney position-history --authorId <id>` | READ | Required | Trader's closed-position history (atomic, paginated) |
| `smartmoney overview [--ts <ms>\|--dataVersion <ver>]` | READ | Required | Multi-currency smart money overview (prefer --ts) |

### Signal Data

| Command | Type | Auth | Description |
|---|---|---|---|
| `smartmoney signal [--ts <ms>\|--dataVersion <ver>]` | READ | Required | Single-currency aggregated consensus signal (prefer --ts) |
| `smartmoney signal-history --instId <id> [--ts <ms>\|--dataVersion <ver>]` | READ | Required | Signal history timeline for trend analysis (prefer --ts) |

> **Note:** Prefer `--ts` (e.g. `--ts $(date +%s)000` for latest snapshot) for overview / signal / signal-history; `--dataVersion` is an alternative for replaying a prior snapshot. At least one of the two must be provided; if both are sent, `--ts` wins.

For full command syntax and parameters, read `{baseDir}/references/trader-commands.md` and `{baseDir}/references/signal-commands.md`.

---

## Operation Flow

### Step 0 — Credential & Profile Check

Before any authenticated command: see [Credential & Profile Check](#credential--profile-check). Always use live mode silently.

### Step 1 — Identify intent

**Trader discovery / ranking:**
- "推荐交易员" / "top traders" / "牛人榜" → `smartmoney traders` with sorting/filtering. See `{baseDir}/references/trader-commands.md`.
- "看看某个交易员" / "trader detail" → `smartmoney trader --authorId <id>` (composite). See `{baseDir}/references/trader-commands.md`.
- "他的当前持仓" / "current positions only" → `smartmoney positions --authorId <id>` (atomic, faster than composite).
- "他的成交记录" / "trade history" → `smartmoney trades --authorId <id>` (atomic, paginated).
- "历史平仓" / "closed positions" / "realized PnL track record" → `smartmoney position-history --authorId <id>` (atomic, paginated; **not** included in `trader` composite).

**Signal analysis:**
- "BTC 聪明钱信号" / "smart money signal for BTC" → `smartmoney signal`. See `{baseDir}/references/signal-commands.md`.
- "聪明钱总览" / "smart money overview" → `smartmoney overview`. See `{baseDir}/references/signal-commands.md`.
- "信号趋势" / "signal trend over time" → `smartmoney signal-history`. See `{baseDir}/references/signal-commands.md`.

### Step 2 — Execute and present

All commands are READ-only — no confirmation needed. Always pass `--json` and render results as Markdown tables.

For multi-step workflows (recommend traders then drill down, signal analysis with context), read `{baseDir}/references/workflows.md`.

---

## Global Notes

- **Security:** Never ask users to paste API keys or secrets into chat.
- **Output:** Always pass `--json` to list/query commands and render results as a Markdown table — never paste raw terminal output.
- **Network errors:** If commands fail with a connection error, prompt user to check VPN: `curl -I https://www.okx.com`
- **Language:** Always respond in the user's language.
- **Signal availability:** Signal commands (overview, signal, signal-history) require either `--ts` (preferred — use `$(date +%s)000` for latest) or `--dataVersion` (for historical snapshot replay). If both are sent, `--ts` wins.

For number/time formatting and response structure conventions, read `{baseDir}/references/templates.md`.
