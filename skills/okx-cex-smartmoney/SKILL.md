---
name: okx-cex-smartmoney
description: "Smart Money analytics on OKX: leaderboard traders, position tracking, trade records, closed-position history, aggregated consensus signals, and signal history. Use this skill when the user asks about 聪明钱, smart money, 牛人榜, leaderboard, top traders, 交易员排行, trader ranking, trader positions, trader PnL, 交易员持仓, 交易员收益, 历史平仓, closed positions, realized PnL track record, trade history, 成交记录, smart money signal, 聪明钱信号, long/short ratio, 多空比, capital flow, 资金流向, position conviction, 仓位强度, entry price distribution, smart money overview, 聪明钱总览, signal history, 信号历史, trader search, 搜索交易员, who is trading BTC, 谁在交易BTC, recommend traders, 推荐交易员, best traders, top performers."
license: MIT
metadata:
  author: okx
  version: "1.3.9"
  homepage: "https://www.okx.com"
  agent:
    requires:
      bins: ["okx"]
    install:
      - id: npm
        kind: node
        package: "@okx_ai/okx-trade-cli@1.3.9"
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
3. Verify: `okx smartmoney traders-by-filter --limit 5`

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

### Trader family (6)

| Command | Type | Auth | Description |
|---|---|---|---|
| `smartmoney traders-by-filter` | READ | Required | Leaderboard ranking by pool conditions (period / minPnl / minWinRate / maxDrawdown / minAum). Paginated by `authorId`. Names use `min*` / `max*` prefix — disjoint from signal-side `*Tier` namespace. |
| `smartmoney performance-by-trader --authorIds <id1,id2>` | READ | Required | PnL / win-rate profile for one or more authorIds. `--sortBy <pnl\|pnlRatio>` (default `pnl`) and `--period <3\|7\|30\|90>` (default `90`) drive ranking and lookback window. |
| `smartmoney search-trader --keyword <name>` | READ | Required | Search Top Traders by nickname keyword (≤10 results, ranked by follower count). |
| `smartmoney trader-positions --authorId <id>` | READ | Required | Current open positions for one trader. Filter by `--instId <BTC-USDT-SWAP>` (or bare base ccy). |
| `smartmoney trader-positions-history --authorId <id>` | READ | Required | Closed-position history with realized PnL. Paginated by `posId`. |
| `smartmoney trader-orders-history --authorId <id>` | READ | Required | Order / fill records. Paginated by `ordId`. |

### Signal / coin family (4)

| Command | Type | Auth | Description |
|---|---|---|---|
| `smartmoney signal-overview-by-filter` | READ | Required | Multi-asset signal, tier-filtered pool. Pick coins via `--topInstruments` (top-N hottest) OR `--instCcyList BTC,ETH,SOL` (specific) — exactly one. Use this to discover the hottest coins among smart money. |
| `smartmoney signal-overview-by-trader --authorIds <id1,id2>` | READ | Required | Multi-asset signal aggregated over a hand-picked set of traders (authorIds-direct-lookup). Pick coins via `--topInstruments` OR `--instCcyList`. `--sortBy` (default `pnl`) and `--period` (default `7`) drive capability metrics. Capability tier filters (pnlTier / winRateTier / etc.) not exposed. |
| `smartmoney signal-trend-by-filter --instCcy <ccy> [--asOfTime <yyyyMMddHH>]` | READ | Required | Single-coin smart-money signal time-series anchored at `asOfTime` (defaults to current UTC hour), tier-filtered pool. `--granularity 1h\|1d`, `--limit` controls bucket count. |
| `smartmoney signal-trend-by-trader --authorIds <id1,id2> --instCcy <ccy> [--asOfTime <yyyyMMddHH>]` | READ | Required | Single-coin smart-money signal time-series aggregated over a hand-picked set of traders (authorIds-direct-lookup). `--granularity 1h\|1d` (default `1h`), `--sortBy` (default `pnl`), `--period` (default `7`). Capability tier filters not exposed. |

> **Time anchor**: `signal-trend-by-{filter,trader}` take an optional `--asOfTime <yyyyMMddHH>` (10-digit UTC hour, e.g. `2026050100`). Returns the latest `--limit` buckets ending at that anchor. Omit `--asOfTime` to use the current UTC hour. `signal-overview-by-{filter,trader}` does not expose any time input — handler always uses the current hour.

> **Multi-coin selection**: `signal-overview-by-filter` and `signal-overview-by-trader` accept `--topInstruments` (top-N hottest) **or** `--instCcyList BTC,ETH,SOL` (explicit base ccy list). The two flags are mutually exclusive. Passing neither defaults to `--topInstruments=20`.

> **⚠ Linear-only scope**: All four `signal-*` commands aggregate **USDT-margined and USDS-margined contracts only**. Coin-margined contracts (`BTC-USD-SWAP`, `BTC-USD-DELIVERY`, `ETH-USD-SWAP`, …) are excluded by upstream — a trader's coin-margined positions are silently dropped from `longNotional` / `shortNotional` / `tradersWithPosition`. If a trader holds large coin-margined exposure but no linear position on that coin, they will not appear in the signal at all. To see a trader's full position book including coin-margined, run `smartmoney trader-positions --authorId <id>`.

> **Need a trader's full picture?** The old `smartmoney trader` composite command is removed. Run `performance-by-trader`, `trader-positions`, and `trader-orders-history` in parallel.

For full command syntax and parameters, read `{baseDir}/references/trader-commands.md` and `{baseDir}/references/signal-commands.md`.

---

## Operation Flow

### Step 0 — Credential & Profile Check

Before any authenticated command: see [Credential & Profile Check](#credential--profile-check). Always use live mode silently.

### Step 1 — Identify intent

**Trader discovery / ranking:**
- "推荐交易员" / "top traders" / "牛人榜" → `smartmoney traders-by-filter` with sorting/filtering. See `{baseDir}/references/trader-commands.md`.
- "看看某个交易员" / "trader detail" → run `performance-by-trader`, `trader-positions`, `trader-orders-history` **in parallel** (the old composite `smartmoney trader` is removed).
- "搜索 alice / 小明" / "find trader by nickname" → `smartmoney search-trader --keyword <name>` (returns ≤10 matches with `authorId` to feed into other tools).
- "verify these authorIds" / 已知 authorId → `smartmoney performance-by-trader --authorIds <id1,id2>` (direct lookup; `--sortBy` / `--period` honored, defaults `pnl` / `90`).
- "他的当前持仓" / "current positions only" → `smartmoney trader-positions --authorId <id>`.
- "他的成交记录" / "trade history" → `smartmoney trader-orders-history --authorId <id>` (paginated).
- "历史平仓" / "closed positions" / "realized PnL track record" → `smartmoney trader-positions-history --authorId <id>` (paginated).

**Signal analysis:**
- "BTC 聪明钱信号" / "smart money signal for BTC" → `smartmoney signal-overview-by-filter --instCcyList BTC`. See `{baseDir}/references/signal-commands.md`.
- "BTC ETH SOL 这几个币的信号" / "signals for these specific coins" → `smartmoney signal-overview-by-filter --instCcyList BTC,ETH,SOL`.
- "这几个交易员看哪些币？" / "consensus among these specific traders" → `smartmoney signal-overview-by-trader --authorIds <id1,id2>` (defaults to top-20 hottest among the group, or pass `--instCcyList`).
- "聪明钱关注哪些币？" / "what are smart money trading right now?" → `smartmoney signal-overview-by-filter` (defaults to `--topInstruments=20`). See `{baseDir}/references/signal-commands.md`.
- "信号趋势" / "signal trend over time" → `smartmoney signal-trend-by-filter --instCcy <ccy> [--asOfTime <yyyyMMddHH>] [--limit 24]` (or `signal-trend-by-trader --authorIds <ids> --instCcy <ccy>` for an authorIds-scoped trend).

### Step 2 — Execute and present

All commands are READ-only — no confirmation needed. Always pass `--json` and render results as Markdown tables.

For multi-step workflows (recommend traders then drill down, signal analysis with context), read `{baseDir}/references/workflows.md`.

---

## Global Notes

- **Security:** Never ask users to paste API keys or secrets into chat.
- **Output:** Always pass `--json` to list/query commands and render results as a Markdown table — never paste raw terminal output.
- **Network errors:** If commands fail with a connection error, prompt user to check VPN: `curl -I https://www.okx.com`
- **Language:** Always respond in the user's language.
- **Time inputs:** `signal-trend-by-{filter,trader}` take an optional `--asOfTime <yyyyMMddHH>` anchor (10-digit UTC hour); omit to use the current UTC hour. `--limit` controls how many buckets are returned ending at that anchor. `signal-overview-by-{filter,trader}` takes no time input — handler always uses the current hour.

For number/time formatting and response structure conventions, read `{baseDir}/references/templates.md`.
