---
name: okx-prediction
description: "Use this skill for OKX prediction markets (YES/NO event contracts via @okx/predict-market-cli). Triggers: 'list prediction events', '预测市场', 'event detail', 'place prediction order', '预测下单', 'buy YES', 'buy NO', 'cancel prediction order', '撤单 预测', 'split xp', '拆分 xp', 'merge YES NO', 'redeem prediction', '赎回 预测', 'prediction balance', 'prediction positions', '预测持仓', '预测行情', 'OHLCV candles', 'K线', 'prediction candles', 'CTF', 'polymarket'. Requires PREDICTIONS_API_KEY/SECRET/PASSPHRASE + PREDICTIONS_AGENT_PRIVATE_KEY env vars. Do NOT use for OKX CEX event contracts (use okx-cex-trade event), spot/swap/futures (okx-cex-trade), crypto market data (okx-cex-market), or CEX portfolio (okx-cex-portfolio). Namespace required: account: balance/positions/order/orders/closed-positions/trades; clob: price/prices/midpoint/midpoints/spread/spreads/book/books; data: events/event/event-markets/market/trending/ticker/candles; ctf: split/merge/redeem; wallet: show."
license: MIT
metadata:
  author: okx
  version: "1.3.5"
  homepage: "https://www.okx.com"
  agent:
    requires:
      bins: ["okx", "okx-predict"]
    install:
      - id: npm-cli
        kind: node
        package: "@okx_ai/okx-trade-cli@1.3.5"
        bins: ["okx"]
        label: "Install okx CLI (npm)"
      - id: npm-predict
        kind: node
        package: "@okx/predict-market-cli"
        bins: ["okx-predict"]
        label: "Install okx-predict binary (npm, platform-specific)"
---

# OKX Prediction Markets CLI

Binary-outcome (YES / NO) event-contract trading via the external `okx-predict` binary, wrapped under `okx prediction <command>`.

## Preflight

1. Run [`../_shared/preflight.md`](../_shared/preflight.md) **Step 1 only** (main CLI auto-upgrade). Steps 2 and 3 (OAuth/API-key detection, version drift) do **not** apply — prediction markets use an independent credential set.
2. Confirm `okx-predict` binary is reachable:
   ```bash
   okx prediction status
   ```
   If you see `Error: okx-predict binary not found in PATH`, install it first (see Prerequisites).

## Prerequisites

```bash
# 1. Main OKX CLI (provides the `okx prediction` wrapper command)
npm install -g @okx_ai/okx-trade-cli

# 2. Prediction binary (platform-specific, npm picks the right one)
npm install -g @okx/predict-market-cli

# 3. Initial env setup (writes ~/.env or current-dir .env)
okx prediction setup

# 4. Verify
okx prediction status
```

### Required environment variables

| Var | Required for | Notes |
|---|---|---|
| `PREDICTIONS_API_KEY` | HMAC reads (account, data export) | Get from OKX Predictions API portal |
| `PREDICTIONS_API_SECRET` | HMAC reads | Keep secret |
| `PREDICTIONS_API_PASSPHRASE` | HMAC reads | Keep secret |
| `PREDICTIONS_AGENT_PRIVATE_KEY` | On-chain writes (clob create-order / cancel / ctf *) | secp256k1 hex with `0x` prefix; NEVER share or print |

> **Security**: NEVER accept the private key in chat. Guide the user to write it into `.env` via `okx prediction setup`. If the user pastes one anyway, refuse and tell them to revoke / rotate it.

## Three-path Authentication

Prediction markets use **three independent authentication paths**. They are **not** related to the main `okx` CLI's OAuth / API-key flow — do NOT call `okx auth login` for prediction.

| Operation class | Example commands | Credential |
|---|---|---|
| Public data | `events`, `event`, `market`, `search`, `ticker`, `candles`, `clob price/prices/midpoint/spread/book/books` | none |
| HMAC reads | `account balance/order/orders/positions/closed-positions/trades` | API KEY + SECRET + PASSPHRASE |
| On-chain writes | `clob create-order / market-order / cancel-oid / cancel-client-order-id / cancel-all / heartbeat`, `ctf split / merge / redeem`, `wallet show` | AGENT_PRIVATE_KEY |

## Skill Routing

- **YES/NO event-contract prediction markets** → this skill
- **OKX CEX Up/Down event contracts** (different product) → `okx-cex-trade` (use `okx event ...`)
- **Crypto spot/swap/futures/options** → `okx-cex-trade`
- **Crypto market data** (price, candles for BTC/ETH etc.) → `okx-cex-market`
- **CEX portfolio** → `okx-cex-portfolio`

## Quickstart

```bash
# Health check
okx prediction status

# Browse active events
okx prediction data events --status active --limit 10

# Drill into one event with all its markets (returns YES + NO asset ids per market)
okx prediction data event-markets <eventId>

# Live price for a YES outcome
okx prediction clob price --asset <yesAssetId>

# Top-of-book depth
okx prediction clob book --asset <yesAssetId> --sz 5

# My account balance / positions
okx prediction account balance
okx prediction account positions

# Place an order (ALWAYS dry-run first — see Operation Flow)
okx prediction clob create-order --asset <assetId> --side buy --price 0.55 --size 100
```

## Command Index

### Read commands (no gating)

| # | Command | Auth | Description |
|---|---|---|---|
| 1 | `okx prediction data events [--status active] [--category <c>] [--limit <n>]` | none | List prediction events |
| 2 | `okx prediction data event <eventId>` | none | Single event detail |
| 3 | `okx prediction data event-markets <eventId>` | none | Event + all its markets (includes YES/NO asset ids) |
| 4 | `okx prediction data market <marketId>` | none | Single market detail |
| 5 | `okx prediction data trending` | none | Trending events |
| 6 | `okx prediction data ticker <assetId>` | none | 24h ticker for one outcome asset |
| 7 | `okx prediction data candles <assetId> [--bar 1H] [--limit 100]` | none | OHLCV candles |
| 8 | `okx prediction search <keyword>` | none | Keyword search |
| 9 | `okx prediction clob price --asset <id> [--outcome yes\|no]` | none | Trimmed price (last/bid/ask/mid/spread) |
| 10 | `okx prediction clob prices <id1> <id2> ...` | none | Batch price view |
| 11 | `okx prediction clob midpoint --asset <id>` / `clob midpoints <ids...>` | none | (bid+ask)/2 |
| 12 | `okx prediction clob spread --asset <id>` / `clob spreads <ids...>` | none | Bid/ask spread |
| 13 | `okx prediction clob book --asset <id> [--sz <n>]` / `clob books <ids...>` | none | Multi-level depth (default sz=10, max 400) |
| 14 | `okx prediction account balance` | HMAC | Account balance |
| 15 | `okx prediction account order <orderId>` | HMAC | Single order detail |
| 16 | `okx prediction account orders` | HMAC | Open orders |
| 17 | `okx prediction account positions` | HMAC | Open positions (look for status="Won" → redeem) |
| 18 | `okx prediction account closed-positions` | HMAC | Closed positions |
| 19 | `okx prediction account trades` | HMAC | Trade history |
| 20 | `okx prediction wallet show` | signing | Derived wallet address |
| 21 | `okx prediction status` | HMAC | Health check |

### Write commands (REQUIRE dry-run preview + user confirmation)

| # | Command | Risk |
|---|---|---|
| 22 | `okx prediction clob create-order --asset <id> --side buy\|sell --price --size [--tif gtc\|gtd\|ioc\|fok\|alo] [--expiry <ms>] [--size-type base\|quote]` | High |
| 23 | `okx prediction clob market-order --asset <id> --side buy\|sell --size [--tif ioc\|fok] [--size-type base\|quote]` | High (immediate cross) |
| 24 | `okx prediction clob cancel-oid --oid <id> --asset <id>` | Medium |
| 25 | `okx prediction clob cancel-client-order-id --client-order-id <id> --asset <id>` | Medium |
| 26 | `okx prediction clob cancel-all` | High |
| 27 | `okx prediction clob heartbeat` | Medium (5-min dead-man auto cancel-all) |
| 28 | `okx prediction ctf split --market <id> --amount <xp>` | High (locks xp) |
| 29 | `okx prediction ctf merge --market <id> --amount <xp>` | High |
| 30 | `okx prediction ctf redeem --market <id>` | High (burns full winning balance) |

> Aliases: `clob order/orders/trades` delegate to the corresponding `account *` commands. Prefer `account *` in skill output for clarity.

## Operation Flow

### Step 0 — Binary check

```bash
okx prediction status --json
```

- If the wrapper prints "okx-predict binary not found", **stop** and tell the user to install `@okx/predict-market-cli`.
- If `status` returns auth errors, the user's env vars are missing — guide them to run `okx prediction setup`.

### Step 1 — Decide what's being asked

- Public data → run command directly.
- HMAC read → check user has API key env vars; otherwise tell them to run `okx prediction setup`.
- On-chain write → proceed to Step 2 dry-run.

### Step 2 — Dry-run preview for writes (MANDATORY)

Before executing any `clob create-order` / `clob market-order` / `clob cancel-*` / `clob cancel-all` / `ctf *` command, **render a dry-run summary first**:

```
About to execute: okx prediction clob create-order --asset 100888000 --side buy --price 0.55 --size 100

  Market           : "Will BTC be above $100k by Dec 31, 2026?"  (mkt_t001)
  Asset            : 100888000  (YES outcome)
  Side             : buy
  Price            : 0.55 xp
  Size             : 100 shares
  TIF              : gtc
  Estimated notional: 55.00 xp
  Wallet           : 0x1234...abcd                              (from `wallet show`)
  Available (spots): 1,234.56 xp                               (from `account balance`)

Reply "confirm" to execute, or "cancel" to abort.
```

The summary fields:
- **Market title** — fetched via `okx prediction data market <marketId>` (look up `marketId` from the asset's parent market)
- **Asset + outcome** — the numeric `assetId` from `event-markets <eventId>` plus which outcome (YES / NO) it represents
- **Notional** — `price * size` (xp)
- **Wallet** — `okx prediction wallet show --json`
- **Available balance** — `okx prediction account balance --json` → row where `oddsType="spots"`, `available` field

Only after the user replies `confirm` do you run the real command. If anything else (including silence), abort.

### Step 3 — Execute & verify

After execution, immediately verify state:

```bash
okx prediction account orders --json    # confirm order placed / cancelled
okx prediction account positions --json # confirm position change (for ctf)
```

Report the resulting order id / tx hash to the user.

## CLI Command Reference

Detailed parameter tables and examples per command group:

- [`references/data-commands.md`](references/data-commands.md) — events / event / market / trending / ticker / candles / search / sports reference
- [`references/account-commands.md`](references/account-commands.md) — account balance / orders / positions / trades / data export
- [`references/clob-commands.md`](references/clob-commands.md) — clob price / order / orders / trades / create-order / cancel / cancel-all / heartbeat
- [`references/ctf-commands.md`](references/ctf-commands.md) — ctf split / merge / redeem
- [`references/workflows.md`](references/workflows.md) — daily brief / event deep-dive / portfolio check / safe place-order / resolve-and-redeem

## MCP Tool Reference

This module **does not expose any MCP tools** in the current release. Agents invoke `okx prediction <command>` directly via Bash. A future MCP server may be provided independently by the prediction-markets team.

## Edge Cases

- **`okx-predict` not in PATH**: wrapper prints install hint and exits 127. Tell the user to run `npm install -g @okx/predict-market-cli`.
- **AGENT_PRIVATE_KEY missing**: any `clob create-order` / `market-order` / `ctf *` will fail. Walk the user through `okx prediction setup` rather than asking for the key in chat.
- **Asset id vs market id mix-up**: the most common error class. `clob price/book/create-order/market-order` need `assetId`; `ctf *` and `account trades --market` need `marketId`. When unsure, run `event-markets <eventId>` first — its output lists both.
- **`--tif gtd` without `--expiry`**: rejected client-side. Pair them or default to `gtc`.
- **`--size-type quote` outside `buy + ioc`**: rejected client-side (`create-order`). Tell the user up front that "spend N points" syntax requires buy + IOC.
- **FOK rejected from snapshot**: `clob market-order --tif fok` is rejected client-side when visible depth is insufficient — no signed message sent. Surface the rejection and suggest reducing `--size` or using `--tif ioc`.
- **Mode confusion**: there is no demo / live flag for prediction markets. The site is selected at signup. Be aware of which deployment the user is on (mainnet vs testnet) — `okx prediction status` reports it.

## Global Notes

- **Always pass `--json`** when piping into other tools or summarizing — the wrapper auto-appends `--json` if the user is in `--json` mode globally.
- **Unit of value**: prediction markets transact in **points (xp)**, not USDC. All balances, prices (decimal in `[0,1]`), notionals, and CTF amounts are xp.
- **Private key handling**: NEVER echo `PREDICTIONS_AGENT_PRIVATE_KEY` (or any `0x` followed by 64 hex chars) to chat. If you must reference it, mask as `0x****`. Do not write it to memory.
- **Side is lowercase**: `--side buy` / `--side sell` (write commands). `account trades --side` accepts `BUY` / `SELL` (uppercase) — the inconsistency is upstream, follow each command's signature.
- **Rate limits**: HMAC endpoints follow OKX-style throttling. On `429` / rate-limit errors, back off and retry after the suggested wait.
- **The wrapper is transparent**: every `okx prediction <cmd>` forwards verbatim to `okx-predict`. Refer to [`okxpredictions/docs/cli-reference.md`](https://github.com/okx/okxpredictions/blob/main/docs/cli-reference.md) for the canonical binary documentation.
- **`OKX_PREDICT_BIN`** env var can override the binary path (useful for local development with a `cargo build --release` artifact).
