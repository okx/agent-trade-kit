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
3. Verify: `okx smartmoney top-traders --limit 5`

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

## Command Index (10 commands, all read-only)

### Trader family (5)

| Command | Type | Auth | Description |
|---|---|---|---|
| `smartmoney top-traders` | READ | Required | Leaderboard ranking by pool conditions (period / pnl / winRate / maxDrawdown / asset). Paginated by `authorId`. |
| `smartmoney trader-performance --authorIds <id1,id2>` | READ | Required | PnL / win-rate profile for one or more authorIds (no pool filter). |
| `smartmoney trader-positions --authorId <id>` | READ | Required | Current open positions for one trader. Filter by `--instCcy <BTC>`. |
| `smartmoney trader-position-history --authorId <id>` | READ | Required | Closed-position history with realized PnL. Paginated by `posId`. |
| `smartmoney trader-order-history --authorId <id>` | READ | Required | Order / fill records. Paginated by `ordId`. |

### Signal / coin family (5)

| Command | Type | Auth | Description |
|---|---|---|---|
| `smartmoney top-coin-signals` | READ | Required | Top-N most-watched-by-smart-money instruments (SWAP-only). Optional `--ts` for historical snapshot. |
| `smartmoney signal-by-coin --instId <id>` | READ | Required | Single-asset signal, pool-filter mode. `ts` auto-filled to current hour. |
| `smartmoney signal-by-traders --instId <id> --authorIds <id1,id2>` | READ | Required | Single-asset signal, restricted to specific authorIds. `ts` auto-filled. |
| `smartmoney signal-history-by-coin --instId <id> --ts <ms>` | READ | Required | Single-asset signal time-series, pool filter. `--granularity 1h\|1d`. |
| `smartmoney signal-history-by-traders --instId <id> --authorIds <id1,id2> --ts <ms>` | READ | Required | Single-asset signal time-series, authorIds-restricted. |

> **Time anchor**: input is `--ts` (UTC ms, e.g. `$(date +%s)000`) only. `dataVersion` is no longer accepted as input. The signal-by-coin / signal-by-traders commands do not expose `--ts` at all — handler always uses the current hour.

> **Need a trader's full picture?** The old `smartmoney trader` composite command is removed. Run `trader-performance`, `trader-positions`, and `trader-order-history` in parallel.

For full command syntax and parameters, read `{baseDir}/references/trader-commands.md` and `{baseDir}/references/signal-commands.md`.

---

## Operation Flow

### Step 0 — Credential & Profile Check

Before any authenticated command: see [Credential & Profile Check](#credential--profile-check). Always use live mode silently.

### Step 1 — Identify intent

**Trader discovery / ranking:**
- "推荐交易员" / "top traders" / "牛人榜" → `smartmoney top-traders` with sorting/filtering. See `{baseDir}/references/trader-commands.md`.
- "看看某个交易员" / "trader detail" → run `trader-performance`, `trader-positions`, `trader-order-history` **in parallel** (the old composite `smartmoney trader` is removed).
- "搜索交易员 X" / "verify these authorIds" → `smartmoney trader-performance --authorIds <id1,id2>` (direct lookup, no pool filter).
- "他的当前持仓" / "current positions only" → `smartmoney trader-positions --authorId <id>`.
- "他的成交记录" / "trade history" → `smartmoney trader-order-history --authorId <id>` (paginated).
- "历史平仓" / "closed positions" / "realized PnL track record" → `smartmoney trader-position-history --authorId <id>` (paginated).

**Signal analysis:**
- "BTC 聪明钱信号" / "smart money signal for BTC" → `smartmoney signal-by-coin --instId BTC-USDT-SWAP`. See `{baseDir}/references/signal-commands.md`.
- "这几个交易员对 BTC 怎么看？" / "consensus among these specific traders" → `smartmoney signal-by-traders --instId BTC-USDT-SWAP --authorIds <id1,id2>`.
- "聪明钱关注哪些币？" / "what are smart money trading right now?" → `smartmoney top-coin-signals`. See `{baseDir}/references/signal-commands.md`.
- "信号趋势" / "signal trend over time" → `smartmoney signal-history-by-coin --instId <id> --ts <ms>` (or `signal-history-by-traders` for an authorIds-scoped trend).

### Step 2 — Execute and present

All commands are READ-only — no confirmation needed. Always pass `--json` and render results as Markdown tables.

For multi-step workflows (recommend traders then drill down, signal analysis with context), read `{baseDir}/references/workflows.md`.

---

## Global Notes

- **Security:** Never ask users to paste API keys or secrets into chat.
- **Output:** Always pass `--json` to list/query commands and render results as a Markdown table — never paste raw terminal output.
- **Network errors:** If commands fail with a connection error, prompt user to check VPN: `curl -I https://www.okx.com`
- **Language:** Always respond in the user's language.
- **Time anchors:** input is always `--ts` (UTC ms; use `$(date +%s)000` for current snapshot). `dataVersion` is no longer accepted on input. `signal-by-coin` / `signal-by-traders` do not expose `--ts` at all — the handler auto-uses the current hour. `top-coin-signals` and `signal-history-by-{coin,traders}` accept `--ts` for historical replay / time-series anchoring.

For number/time formatting and response structure conventions, read `{baseDir}/references/templates.md`.
