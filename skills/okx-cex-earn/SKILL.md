---
name: okx-cex-earn
description: "Manages OKX Simple Earn (flexible savings/lending), On-chain Earn (staking/DeFi), Dual Investment (DCD/双币赢), and AutoEarn (自动赚币) via the okx CLI. Use this skill whenever the user wants to check earn balances, subscribe or redeem earn products, view or set lending rates, monitor on-chain staking orders, interact with dual investment structured products, or manage auto-earn — even if phrased casually as 活期赚币, 赚币, 申购, 赎回, 链上赚币, 质押, 理财, 双币赢, 双币理财, 双币申购, 高卖, 低买, dual investment, DCD, buy low, sell high structured product, earn with target price, 目标价, 自动赚币, auto earn, auto-earn, 自动借出, 自动质押, auto lend, auto staking, USDG earn, USDG 赚币, 闲置资金自动理财. Also use when the user asks about idle funds and whether to earn on them."
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

# OKX CEX Earn CLI

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
| Simple Earn, On-chain Earn, Dual Investment (双币赢), or AutoEarn (自动赚币) | **This skill** |

---

## Command Index

### earn savings — Simple Earn (6 commands)

| Command | Type | Auth | Description |
|---|---|---|---|
| `earn savings balance [ccy]` | READ | Required | Savings balance (all or specific currency) |
| `earn savings purchase --ccy --amt` | WRITE | Required | Subscribe funds to Simple Earn |
| `earn savings redeem --ccy --amt` | WRITE | Required | Redeem funds from Simple Earn |
| `earn savings set-rate --ccy --rate` | WRITE | Required | Set minimum lending rate |
| `earn savings lending-history` | READ | Required | User's personal lending records with earnings detail |
| `earn savings rate-history` | READ | Public | Simple Earn lending rates (简单赚币利率) |

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

---

## Operation Flow

### Step 0 — Credential & Profile Check

Before any authenticated command: see [Credential & Profile Check](#credential--profile-check). Always use `--profile live` silently.

### Step 1 — Identify earn intent

**Simple Earn / On-chain Earn:**
- Query balance / history / rates → READ command, proceed directly.
- Subscribe / redeem / set-rate / on-chain purchase → WRITE command, go to Step 2.

**AutoEarn (自动赚币):**
- Query auto-earn status → READ, proceed directly.
- Enable / disable auto-earn → WRITE, go to Step 2. Read `{baseDir}/references/autoearn-commands.md` for confirmation templates and earnType inference.

When user asks to view "earn positions" or "赚币持仓" (regardless of whether they mention DCD explicitly), query all three simultaneously:

```bash
okx --profile live earn savings balance --json    # Simple Earn
okx --profile live earn onchain orders --json     # On-chain Earn
okx --profile live earn dcd orders --json         # Dual Investment (双币赢)
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
- **Simple Earn** purchase (no `ordId` in response) → run `earn savings balance --ccy <ccy> --json`.

**Simple Earn purchase:** Run in parallel — `earn savings balance --ccy <ccy>` and `earn savings rate-history --ccy <ccy> --limit 1 --json`. For output format, read `{baseDir}/references/savings-commands.md`.

**Simple Earn redeem:** Run `earn savings balance --ccy <ccy>` to confirm updated balance. Inform user funds returned to funding account.

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
