---
name: okx-cex-trade
description: "This skill should be used when the user asks to 'buy BTC', 'sell ETH', 'place a limit order', 'place a market order', 'cancel my order', 'amend my order', 'long BTC perp', 'short ETH swap', 'open a position', 'close a position', 'set take profit', 'set stop loss', 'add a trailing stop', 'set leverage', 'check my orders', 'order status', 'fill history', 'trade history', 'buy a call', 'sell a put', 'buy call option', 'sell put option', 'option chain', 'implied volatility', 'IV', 'option Greeks', 'delta', 'gamma', 'theta', 'vega', 'delta hedge', 'option order', 'option position', 'option fills', or any request to place/cancel/amend spot, perpetual swap, delivery futures, or options orders on OKX CEX. Covers spot trading, swap/perpetual contracts, delivery futures, options (calls/puts, Greeks, IV), and conditional (TP/SL/trailing) algo orders. Requires API credentials. Do NOT use for market data (use okx-cex-market), account balance/positions (use okx-cex-portfolio), or grid/DCA bots (use okx-cex-bot)."
license: MIT
metadata:
  author: okx
  version: "1.2.8"
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

# OKX CEX Trading CLI

Spot, perpetual swap, delivery futures, and **options** order management on OKX exchange. Place, cancel, amend, and monitor orders; query option chains and Greeks; set take-profit/stop-loss and trailing stops; manage leverage and positions. **Requires API credentials.**

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
   okx config init
   ```
   Or set environment variables:
   ```bash
   export OKX_API_KEY=your_key
   export OKX_SECRET_KEY=your_secret
   export OKX_PASSPHRASE=your_passphrase
   ```
3. Test with demo mode (simulated trading, no real funds):
   ```bash
   okx --profile demo spot orders
   ```

## Credential & Profile Check

**Run this check before any authenticated command.**

### Step A — Verify credentials

```bash
okx config show       # verify configuration status (output is masked)
```

- If the command returns an error or shows no configuration: **stop all operations**, guide the user to run `okx config init`, and wait for setup to complete before retrying.
- If credentials are configured: proceed to Step B.

### Step B — Confirm profile (required)

`--profile` is **required** for all authenticated commands. Never add a profile implicitly.

| Value | Mode | Funds |
|---|---|---|
| `live` | 实盘 | Real funds |
| `demo` | 模拟盘 | Simulated funds |

**Resolution rules:**
1. Current message intent is clear (e.g. "real" / "实盘" / "live" → `live`; "test" / "模拟" / "demo" → `demo`) → use it and inform the user: `"Using --profile live (实盘)"` or `"Using --profile demo (模拟盘)"`
2. Current message has no explicit declaration → check conversation context for a previous profile:
   - Found → use it, inform user: `"Continuing with --profile live (实盘) from earlier"`
   - Not found → ask: `"Live (实盘) or Demo (模拟盘)?"` — wait for answer before proceeding

### Handling 401 Authentication Errors

If any command returns a 401 / authentication error:
1. **Stop immediately** — do not retry the same command
2. Inform the user: "Authentication failed (401). Your API credentials may be invalid or expired."
3. Guide the user to update credentials by editing the file directly with their local editor:
   ```
   ~/.okx/config.toml
   ```
   Update the fields `api_key`, `secret_key`, `passphrase` under the relevant profile.
   Do NOT paste the new credentials into chat.
4. After the user confirms the file is updated, run `okx config show` to verify (output is masked)
5. Only then retry the original operation

## Demo vs Live Mode

Profile is the single control for 实盘/模拟盘 switching:

| `--profile` | Mode | Funds |
|---|---|---|
| `live` | 实盘 | Real money — irreversible |
| `demo` | 模拟盘 | Simulated — no real funds |

**Rules:**
1. `--profile` is **required** on every authenticated command — determined in "Credential & Profile Check" Step B
2. Every response after a command must append: `[profile: live]` or `[profile: demo]`
3. Do **not** use the `--demo` flag for mode switching — use `--profile` instead

## Skill Routing

- For market data (prices, charts, depth, funding rates) → use `okx-cex-market`
- For account balance, P&L, positions, fees, transfers → use `okx-cex-portfolio`
- For regular spot/swap/futures/options/algo orders → use `okx-cex-trade` (this skill)
- For grid and DCA trading bots → use `okx-cex-bot`

## Sz Handling for Derivatives

### ⚠ CRITICAL: Always verify contract face value before placing orders

Before placing any SWAP/FUTURES/OPTION order, call `market_get_instruments` to get `ctVal` (contract face value). **Do NOT assume contract sizes** — they vary by instrument (e.g. ETH-USDT-SWAP = 0.1 ETH/contract, BTC-USDT-SWAP = 0.01 BTC/contract).

Use `ctVal` to:
- Calculate the correct number of contracts from user's intended position size
- Verify margin requirements before submitting the order
- Show the user the actual position value: `sz × ctVal × price`

### SWAP and FUTURES orders

**When user specifies a USDT amount** (e.g. "200U", "500 USDT", "$1000"):
→ Use `--tgtCcy quote_ccy` and pass the amount directly as `--sz`. The API converts to contracts automatically.

**When user specifies contracts** (e.g. "2 张", "5 contracts"):
→ First verify `ctVal` via `market_get_instruments`, then use `--sz` with the contract count. Confirm with user: "X contracts = X × ctVal underlying, total value ≈ $Y".

**When user gives a plain number with no unit** (for swap/futures):
→ Ambiguous — ask before proceeding: "您输入的 X 是合约张数还是 USDT 金额？" Wait for the user's answer before continuing.

⚠ **Inverse contracts** (`*-USD-SWAP`, `*-USD-YYMMDD`): `tgtCcy=quote_ccy` also works (note: `quote_ccy` = USD, not USDT, for inverse instruments). Always warn: "This is an inverse contract. Margin and P&L are settled in BTC, not USDT."

### Option orders

Options do **NOT** support `tgtCcy`. When the user specifies a USDT amount for options, you must convert manually. For the full conversion formula and validation steps, read `{baseDir}/references/options-commands.md`.

## Quickstart

```bash
# Market buy 0.01 BTC (spot)
okx spot place --instId BTC-USDT --side buy --ordType market --sz 0.01

# Buy $10 worth of SOL (spot, USDT amount)
okx spot place --instId SOL-USDT --side buy --ordType market --sz 10 --tgtCcy quote_ccy

# Limit sell 0.01 BTC at $100,000 (spot)
okx spot place --instId BTC-USDT --side sell --ordType limit --sz 0.01 --px 100000

# Long 1 contract BTC perp (cross margin)
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 \
  --tdMode cross --posSide long

# Long 1000 USDT worth of BTC perp (auto-convert to contracts)
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1000 \
  --tgtCcy quote_ccy --tdMode cross --posSide long

# Long 1 contract with attached TP/SL (one step)
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 \
  --tdMode cross --posSide long \
  --tpTriggerPx 105000 --tpOrdPx -1 --slTriggerPx 88000 --slOrdPx -1

# Close BTC perp long position entirely at market
okx swap close --instId BTC-USDT-SWAP --mgnMode cross --posSide long

# Set 10x leverage on BTC perp (cross)
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross

# Set TP/SL on a spot BTC position
okx spot algo place --instId BTC-USDT --side sell --ordType oco --sz 0.01 \
  --tpTriggerPx 105000 --tpOrdPx -1 \
  --slTriggerPx 88000 --slOrdPx -1

# Place trailing stop on BTC perp long (callback 2%)
okx swap algo trail --instId BTC-USDT-SWAP --side sell --sz 1 \
  --tdMode cross --posSide long --callbackRatio 0.02

# View open spot orders
okx spot orders

# View open swap positions
okx swap positions

# Cancel a spot order
okx spot cancel --instId BTC-USDT --ordId <ordId>
```

## Command Index

### Spot Orders (11 commands)

| # | Command | Type | Description |
|---|---|---|---|
| 1 | `okx spot place` | WRITE | Place spot order (market/limit/post_only/fok/ioc) |
| 2 | `okx spot cancel` | WRITE | Cancel spot order |
| 3 | `okx spot amend` | WRITE | Amend spot order price or size |
| 4 | `okx spot algo place` | WRITE | Place spot TP/SL algo order |
| 5 | `okx spot algo amend` | WRITE | Amend spot TP/SL levels |
| 6 | `okx spot algo cancel` | WRITE | Cancel spot algo order |
| 7 | `okx spot algo trail` | WRITE | Place spot trailing stop order |
| 8 | `okx spot orders` | READ | List open or historical spot orders |
| 9 | `okx spot get` | READ | Single spot order details |
| 10 | `okx spot fills` | READ | Spot trade fill history |
| 11 | `okx spot algo orders` | READ | List spot TP/SL algo orders |

For full command syntax, parameter tables, and edge cases, read `{baseDir}/references/spot-commands.md`.

### Swap / Perpetual Orders (15 commands)

| # | Command | Type | Description |
|---|---|---|---|
| 12 | `okx swap place` | WRITE | Place perpetual swap order |
| 13 | `okx swap cancel` | WRITE | Cancel swap order |
| 14 | `okx swap amend` | WRITE | Amend swap order price or size |
| 15 | `okx swap close` | WRITE | Close entire position at market |
| 16 | `okx swap leverage` | WRITE | Set leverage for an instrument |
| 17 | `okx swap algo place` | WRITE | Place swap TP/SL algo order |
| 18 | `okx swap algo trail` | WRITE | Place swap trailing stop order |
| 19 | `okx swap algo amend` | WRITE | Amend swap algo order |
| 20 | `okx swap algo cancel` | WRITE | Cancel swap algo order |
| 21 | `okx swap positions` | READ | Open perpetual swap positions |
| 22 | `okx swap orders` | READ | List open or historical swap orders |
| 23 | `okx swap get` | READ | Single swap order details |
| 24 | `okx swap fills` | READ | Swap trade fill history |
| 25 | `okx swap get-leverage` | READ | Current leverage settings |
| 26 | `okx swap algo orders` | READ | List swap algo orders |

For full command syntax, parameter tables, and edge cases, read `{baseDir}/references/swap-commands.md`.

### Futures / Delivery Orders (15 commands)

| # | Command | Type | Description |
|---|---|---|---|
| 27 | `okx futures place` | WRITE | Place delivery futures order |
| 28 | `okx futures cancel` | WRITE | Cancel delivery futures order |
| 29 | `okx futures amend` | WRITE | Amend delivery futures order price or size |
| 30 | `okx futures close` | WRITE | Close entire futures position at market |
| 31 | `okx futures leverage` | WRITE | Set leverage for a futures instrument |
| 32 | `okx futures algo place` | WRITE | Place futures TP/SL algo order |
| 33 | `okx futures algo trail` | WRITE | Place futures trailing stop order |
| 34 | `okx futures algo amend` | WRITE | Amend futures algo order |
| 35 | `okx futures algo cancel` | WRITE | Cancel futures algo order |
| 36 | `okx futures orders` | READ | List delivery futures orders |
| 37 | `okx futures positions` | READ | Open delivery futures positions |
| 38 | `okx futures fills` | READ | Delivery futures fill history |
| 39 | `okx futures get` | READ | Single delivery futures order details |
| 40 | `okx futures get-leverage` | READ | Current futures leverage settings |
| 41 | `okx futures algo orders` | READ | List futures algo orders |

For full command syntax, parameter tables, and edge cases, read `{baseDir}/references/futures-commands.md`.

### Options Orders (10 commands)

| # | Command | Type | Description |
|---|---|---|---|
| 42 | `okx option instruments` | READ | Option chain: list available contracts for an underlying |
| 43 | `okx option greeks` | READ | Implied volatility + Greeks (delta/gamma/theta/vega) by underlying |
| 44 | `okx option place` | WRITE | Place option order (call or put, buyer or seller) |
| 45 | `okx option cancel` | WRITE | Cancel unfilled option order |
| 46 | `okx option amend` | WRITE | Amend option order price or size |
| 47 | `okx option batch-cancel` | WRITE | Batch cancel up to 20 option orders |
| 48 | `okx option orders` | READ | List option orders (live / history / archive) |
| 49 | `okx option get` | READ | Single option order details |
| 50 | `okx option positions` | READ | Open option positions with live Greeks |
| 51 | `okx option fills` | READ | Option trade fill history |

For full command syntax, USDT-to-contracts conversion formula, tdMode rules, and edge cases, read `{baseDir}/references/options-commands.md`.

## Operation Flow

### Step 0 — Credential & Profile Check

Before any authenticated command: see [Credential & Profile Check](#credential--profile-check). Determine profile (`live` or `demo`) before executing.

After every command result: append `[profile: live]` or `[profile: demo]`.

### Step 1 — Identify instrument type and action

**Spot** (instId format: `BTC-USDT`):
- Place/cancel/amend order → `okx spot place/cancel/amend`
- TP/SL conditional → `okx spot algo place/amend/cancel`
- Trailing stop → `okx spot algo trail`
- Query → `okx spot orders/get/fills/algo orders`

**Swap/Perpetual** (instId format: `BTC-USDT-SWAP`):
- Place/cancel/amend order → `okx swap place/cancel/amend`
- Close position → `okx swap close`
- Leverage → `okx swap leverage` / `okx swap get-leverage`
- TP/SL conditional → `okx swap algo place/amend/cancel`
- Trailing stop → `okx swap algo trail`
- Query → `okx swap positions/orders/get/fills/get-leverage/algo orders`

**Futures/Delivery** (instId format: `BTC-USDT-<YYMMDD>`):
- Place/cancel/amend order → `okx futures place/cancel/amend`
- Close position → `okx futures close`
- Leverage → `okx futures leverage` / `okx futures get-leverage`
- TP/SL conditional → `okx futures algo place/amend/cancel`
- Trailing stop → `okx futures algo trail`
- Query → `okx futures orders/positions/fills/get/get-leverage/algo orders`

**Options** (instId format: `BTC-USD-250328-95000-C` or `...-P`):
- Step 1 (required): find valid instId → `okx option instruments --uly BTC-USD`
- Step 2 (recommended): check IV and Greeks → `okx option greeks --uly BTC-USD`
- Place/cancel/amend → `okx option place/cancel/amend`
- Batch cancel → `okx option batch-cancel --orders '[...]'`
- Query → `okx option orders/get/positions/fills`
- **tdMode**: `cash` for buyers; `cross` or `isolated` for sellers

For cross-skill workflows and step-by-step examples, read `{baseDir}/references/workflows.md`.

### Step 2 — Confirm profile, then confirm write parameters

**Read commands** (orders, positions, fills, get, get-leverage, algo orders): run immediately.

- `--history` flag: defaults to active/open; use `--history` only if user explicitly asks for history
- `--ordType` for algo: `conditional` = single TP or SL; `oco` = both TP and SL together
- `--tdMode` for swap/futures: `cross` or `isolated`; spot always uses `cash` (set automatically)
- `--posSide` for hedge mode: `long` or `short`; omit in net mode

**Write commands** (place, cancel, amend, close, leverage, algo): confirm the key order details once before executing:
- Spot place: confirm `--instId`, `--side`, `--ordType`, `--sz` (and `--tgtCcy quote_ccy` if quote-currency amount)
- Swap/Futures place: confirm `--instId`, `--side`, `--sz`, `--tdMode` (and `--tgtCcy quote_ccy` if quote-currency amount)
- Option place: Options do NOT support `--tgtCcy` — manually convert USDT to contracts using instrument metadata; confirm `--instId`, `--side`, `--sz`, `--tdMode`; do NOT attach TP/SL
- Swap/Futures close: confirm `--instId`, `--mgnMode`, `--posSide`
- Leverage: confirm new leverage and impact on existing positions
- Algo place (TP/SL): confirm trigger prices; use `--tpOrdPx -1` for market execution
- Algo trail: confirm `--callbackRatio` (e.g., `0.02` = 2%) or `--callbackSpread`

For full parameter details per command, read the relevant reference file.

### Step 3 — Verify after writes

- After `spot place`: run `okx spot orders` to confirm order is live or `okx spot fills` if market order
- After `swap place`: run `okx swap orders` or `okx swap positions` to confirm
- After `swap close`: run `okx swap positions` to confirm position size is 0
- After `futures place`: run `okx futures orders` or `okx futures positions` to confirm
- After `futures close`: run `okx futures positions` to confirm position size is 0
- After spot algo place/trail: run `okx spot algo orders` to confirm algo is active
- After swap algo place/trail: run `okx swap algo orders` to confirm algo is active
- After futures algo place/trail: run `okx futures algo orders` to confirm algo is active
- After cancel: run `okx spot orders` / `okx swap orders` / `okx futures orders` to confirm order is gone

## Global Notes

- All write commands require valid credentials in `~/.okx/config.toml` or env vars
- `--profile <name>` is required for all authenticated commands
- `--json` returns raw OKX API v5 response
- Rate limit: 60 order operations per 2 seconds per UID
- Batch operations (batch cancel, batch amend) are available via MCP tools directly if needed
- Position mode (`net` vs `long_short_mode`) affects whether `--posSide` is required
- **Network errors**: If commands fail with a connection error, prompt user to check VPN: `curl -I https://www.okx.com`

For MCP tool reference, output conventions, and order amount safety rules, read `{baseDir}/references/templates.md`.
