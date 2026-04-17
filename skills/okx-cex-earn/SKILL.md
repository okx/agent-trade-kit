---
name: okx-cex-earn
description: "Manages OKX Simple Earn (flexible savings/lending), Flash Earn, On-chain Earn (staking/DeFi), Dual Investment (DCD/双币赢), and AutoEarn (自动赚币) via the okx CLI. Use this skill whenever the user wants to check earn balances, browse flash-earn projects, subscribe or redeem earn products, view or set lending rates, monitor on-chain staking orders, interact with dual investment structured products, or manage auto-earn — even if phrased casually as 活期赚币, 定期赚币, 闪赚, 赚币, 申购, 赎回, 链上赚币, 质押, 理财, 双币赢, 双币理财, 双币申购, 高卖, 低买, dual investment, DCD, flash earn, buy low, sell high structured product, earn with target price, 目标价, 自动赚币, auto earn, auto-earn, 自动借出, 自动质押, auto lend, auto staking, USDG earn, USDG 赚币, 闲置资金自动理财, fixed earn, fixed deposit, term deposit, 定期理财, 定期. Also use when the user asks about idle funds and whether to earn on them."
license: MIT
metadata:
  author: okx
  version: "1.3.1"
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

# OKX CEX Earn CLI

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
   okx config add-profile AK=<your_api_key> SK=<your_secret_key> PP=<your_passphrase> name=live
   # or interactive wizard:
   okx config init
   ```
3. Verify: `okx --profile live earn savings balance`

---

## Credential & Profile Check

Run `okx config show` before any authenticated command.

- Error or no configuration → **stop**, guide user to run `okx config init`, wait for completion.
- Credentials configured → proceed.

OKX Earn does not support demo mode. Always use `--profile live` silently — don't mention it unless there's an error.

**On 401 errors:** stop immediately, tell the user their credentials may be invalid or expired, guide them to update `~/.okx/config.toml` (do NOT ask them to paste credentials into chat), then verify with `okx config show` and retry.

---

## Skill Routing

| User intent | Route to skill |
|---|---|
| Market prices, tickers, candles | `okx-cex-market` |
| Spot / swap / futures / options orders | `okx-cex-trade` |
| Account balance, positions, transfers | `okx-cex-portfolio` |
| Grid / DCA trading bots | `okx-cex-bot` |
| Simple Earn, Flash Earn, On-chain Earn, Dual Investment (双币赢), or AutoEarn (自动赚币) | **This skill** |

---

## Command Index

### earn savings — Simple Earn (9 commands)

| Command | Type | Auth | Description |
|---|---|---|---|
| `earn savings balance [ccy]` | READ | Required | Savings balance (all or specific currency). Also fetch fixed-term orders for a complete picture. |
| `earn savings purchase --ccy --amt [--rate]` | WRITE | Required | Subscribe funds to Simple Earn (活期) |
| `earn savings redeem --ccy --amt` | WRITE | Required | Redeem funds from Simple Earn (活期) |
| `earn savings set-rate --ccy --rate` | WRITE | Required | Set minimum lending rate |
| `earn savings lending-history` | READ | Required | User's personal lending records with earnings detail |
| `earn savings rate-history` | READ | Required | Simple Earn lending rates and fixed-term offers (require auth) |
| `earn savings fixed-orders [--ccy] [--state]` | READ | Required | Query fixed-term (定期) orders. States: pending/earning/expired/settled/cancelled |
| `earn savings fixed-purchase --ccy --amt --term [--confirm]` | WRITE | Required | Subscribe to Simple Earn Fixed (定期). Without `--confirm`: preview only |
| `earn savings fixed-redeem <reqId>` | WRITE | Required | Redeem a fixed-term order (full amount). Only `pending` state orders can be redeemed early |

For full command syntax, rate field semantics, and confirmation templates, read `{baseDir}/references/savings-commands.md`.

### earn dcd — Dual Investment / 双币赢 (6 commands)

| Command | Type | Auth | Description |
|---|---|---|---|
| `earn dcd pairs` | READ | Required | Available DCD currency pairs |
| `earn dcd products` | READ | Required | Active products with filters |
| `earn dcd quote-and-buy --productId --sz --notionalCcy` | WRITE | Required | Atomic subscribe: quote + execute in one step |
| `earn dcd order --ordId` | READ | Required | Quick state check for a single order |
| `earn dcd orders` | READ | Required | Full order list / history |
| `earn dcd redeem-execute --ordId` | WRITE | Required | Two-step early redemption: preview then execute |

> DCD does **not** support demo/simulated trading mode. Always use `--profile live`.

For full command syntax, product concepts, and error codes, read `{baseDir}/references/dcd-commands.md`.

### earn onchain — On-chain Earn (6 commands)

| Command | Type | Auth | Description |
|---|---|---|---|
| `earn onchain offers` | READ | Required | Available staking/DeFi products |
| `earn onchain purchase --productId --ccy --amt` | WRITE | Required | Subscribe to on-chain product |
| `earn onchain redeem --ordId --protocolType` | WRITE | Required | Redeem on-chain investment |
| `earn onchain cancel --ordId --protocolType` | WRITE | Required | Cancel pending on-chain order |
| `earn onchain orders` | READ | Required | Active on-chain orders |
| `earn onchain history` | READ | Required | Historical on-chain orders |

For full command syntax and parameters, read `{baseDir}/references/onchain-commands.md`.

### earn auto-earn — AutoEarn / 自动赚币 (3 commands)

| Command | Type | Auth | Description |
|---|---|---|---|
| `earn auto-earn status [CCY]` | READ | Required | Query currencies supporting auto-earn and their status |
| `earn auto-earn on <CCY>` | WRITE | Required | Enable auto-earn for a currency |
| `earn auto-earn off <CCY>` | WRITE | Required | Disable auto-earn for a currency |

> **24h restriction:** Cannot disable within 24 hours of enabling (API hard limit). Always warn user before enabling.

For full command syntax, earnType inference rules, and MCP tool reference, read `{baseDir}/references/autoearn-commands.md`.

### earn flash-earn — Flash Earn / 闪赚 (1 command)

| Command | Type | Auth | Description |
|---|---|---|---|
| `earn flash-earn projects [--status <0\|100\|0,100>]` | READ | Required | Browse Flash Earn projects by status. `0`=upcoming, `100`=in-progress, default is both |

---

## Operation Flow

### Step 0 — Credential & Profile Check

Before any authenticated command: see [Credential & Profile Check](#credential--profile-check). Always use `--profile live` silently.

### Step 1 — Identify earn intent

**Simple Earn Flexible (活期):**
- Query balance / history / rates → READ command, proceed directly.
- Subscribe / redeem / set-rate → WRITE command, go to Step 2.

**Simple Earn Fixed (定期):**
- Query offers / order list → READ command, proceed directly.
- Subscribe (two-step: preview then confirm) / redeem (pending state only) → WRITE command, go to Step 2. Read `{baseDir}/references/savings-commands.md` for pre-execution checklists and confirmation templates.
- For multi-step workflows (subscribe with preview, early redemption), read `{baseDir}/references/workflows.md`.

**On-chain Earn:**
- Query offers / orders / history → READ command, proceed directly.
- Purchase / redeem / cancel → WRITE command, go to Step 2.

**AutoEarn (自动赚币):**
- Query auto-earn status → READ, proceed directly.
- Enable / disable auto-earn → WRITE, go to Step 2. Read `{baseDir}/references/autoearn-commands.md` for confirmation templates and earnType inference.

**Flash Earn (闪赚):**
- Browse projects → READ, proceed directly.
- Use `--status 0` for upcoming projects, `--status 100` for in-progress projects, or omit the flag to view both.

When user asks to view "earn positions" or "赚币持仓" (regardless of whether they mention DCD explicitly), query all position-bearing sub-modules simultaneously (Flash Earn is query-only, no positions):

```bash
okx --profile live earn savings balance --json        # Simple Earn Flexible (活期)
okx --profile live earn savings fixed-orders --json   # Simple Earn Fixed (定期)
okx --profile live earn onchain orders --json         # On-chain Earn
okx --profile live earn dcd orders --json             # Dual Investment (双币赢)
```

Only present sections that have actual holdings. For DCD: translate state codes using the table in `{baseDir}/references/dcd-commands.md`.

**Dual Investment (DCD / 双币赢):**
- Browse products / pairs → READ; when user specifies a currency, read `{baseDir}/references/workflows.md` (DCD browse flow) for the mandatory parallel pre-fetch before rendering the product table
- Subscribe (quote-and-buy) → WRITE → see `{baseDir}/references/workflows.md` (DCD subscribe flow)
- Early redeem → WRITE → see `{baseDir}/references/workflows.md` (DCD early redeem flow)

For multi-step workflows (idle fund analysis, subscribe + verify, redeem + transfer, on-chain subscribe), read `{baseDir}/references/workflows.md`.

### Step 2 — Confirm write operation

For all WRITE commands, present a summary and wait for explicit confirmation.

> "just do it" / "直接搞" is NOT valid confirmation — the user must see the summary first.

For Simple Earn confirmation dialog format, read `{baseDir}/references/savings-commands.md`. For On-chain confirmation, read `{baseDir}/references/onchain-commands.md`.

### Step 3 — Execute and verify

After any purchase, verify based on product type:
- **DCD** `quote-and-buy` succeeded → run `earn dcd orders --json`, show only the matching order.
- **On-chain** purchase (response contains `ordId`) → run `earn onchain orders --json`, show only the matching order.
- **Simple Earn Flexible** purchase (no `ordId` in response) → run `earn savings balance --ccy <ccy> --json`.
- **Simple Earn Fixed** purchase → run `earn savings fixed-orders --ccy <ccy> --state pending --json`, show the new order.

**Simple Earn Flexible purchase:** Run in parallel — `earn savings balance --ccy <ccy>` and `earn savings rate-history --ccy <ccy> --limit 1 --json`. For output format, read `{baseDir}/references/savings-commands.md`.

**Simple Earn Flexible redeem:** Run `earn savings balance --ccy <ccy>` to confirm updated balance. Inform user funds returned to funding account.

**Simple Earn Fixed purchase:** Run `earn savings fixed-orders --ccy <ccy> --state pending --json` to confirm the order was created. Show order details including APR, term, and expected expiry date.

**Simple Earn Fixed redeem:** Run `earn savings fixed-orders --json` to confirm the order state changed to `cancelled`. Inform user full principal returned to funding account — no interest earned for early cancellation.

**On-chain redeem:** Query `earn onchain orders` to confirm state. Show `estSettlementTime` as estimated arrival time.

**On-chain cancel:** Query `earn onchain orders` after submission:
- Order gone from list → inform user: cancellation complete, funds returned to funding account.
- `state: 3` (cancelling) → inform user: cancellation in progress, funds will return to funding account shortly.

---

## Global Notes

- **Security:** Never ask users to paste API keys or secrets into chat.
- **Output:** Always pass `--json` to list/query commands and render results as a Markdown table — never paste raw terminal output.
- **Network errors:** If commands fail with a connection error, prompt user to check VPN: `curl -I https://www.okx.com`
- **Language:** Always respond in the user's language.

For number/time formatting and response structure conventions, read `{baseDir}/references/templates.md`.
