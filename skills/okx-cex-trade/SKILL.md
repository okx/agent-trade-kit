---
name: okx-cex-trade
description: "This skill should be used when the user asks to 'buy BTC', 'sell ETH', 'place a limit order', 'place a market order', 'cancel my order', 'amend my order', 'long BTC perp', 'short ETH swap', 'open a position', 'close a position', 'set take profit', 'set stop loss', 'add a trailing stop', 'set leverage', 'check my orders', 'order status', 'fill history', 'trade history', 'buy a call', 'sell a put', 'buy call option', 'sell put option', 'option chain', 'implied volatility', 'IV', 'option Greeks', 'delta', 'gamma', 'theta', 'vega', 'delta hedge', 'option order', 'option position', 'option fills', or any request to place/cancel/amend spot, perpetual swap, delivery futures, or options orders on OKX CEX. Covers spot trading, swap/perpetual contracts, delivery futures, options (calls/puts, Greeks, IV), and conditional (TP/SL/trailing) algo orders. Requires API credentials. Do NOT use for market data (use okx-cex-market), account balance/positions (use okx-cex-portfolio), or grid/DCA bots (use okx-cex-bot)."
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

# OKX CEX Trading CLI

Spot, perpetual swap, delivery futures, and **options** order management on OKX exchange. Place, cancel, amend, and monitor orders; query option chains and Greeks; set take-profit/stop-loss and trailing stops; manage leverage and positions. **Requires API credentials.**

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

Profile is the single control for 实盘/模拟盘 switching — exactly two options:

| `--profile` | Mode | Funds |
|---|---|---|
| `live` | 实盘 | Real money — irreversible |
| `demo` | 模拟盘 | Simulated — no real funds |

```bash
okx --profile live  spot place ...    # 实盘 — real funds
okx --profile demo  spot place ...    # 模拟盘 — simulated funds
```

**Rules:**
1. `--profile` is **required** on every authenticated command — determined in "Credential & Profile Check" Step B
2. Every response after a command must append: `[profile: live]` or `[profile: demo]`
3. Do **not** use the `--demo` flag for mode switching — use `--profile` instead

### Example

```
User: "Buy 0.01 BTC"
Agent: "Live (实盘) or Demo (模拟盘)?"
User: "Demo"
Agent runs: okx --profile demo spot place --instId BTC-USDT --side buy --ordType market --sz 0.01
Agent replies: "Order placed: 7890123456 (OK) — simulated, no real funds used. [profile: demo]"
```

## Skill Routing

- For market data (prices, charts, depth, funding rates) → use `okx-cex-market`
- For account balance, P&L, positions, fees, transfers → use `okx-cex-portfolio`
- For regular spot/swap/futures/options/algo orders → use `okx-cex-trade` (this skill)
- For grid and DCA trading bots → use `okx-cex-bot`

## Sz Handling for Derivatives

### SWAP and FUTURES orders

For SWAP (`*-USDT-SWAP`, `*-USD-SWAP`) and FUTURES (`*-USDT-YYMMDD`, `*-USD-YYMMDD`) orders:

**When user specifies a USDT amount** (e.g. "200U", "500 USDT", "$1000"):
→ Use `--tgtCcy quote_ccy` and pass the amount directly as `--sz`. The API converts to contracts automatically.

```bash
# Long 1000 USDT worth of BTC perp
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1000 \
  --tgtCcy quote_ccy --tdMode cross --posSide long
```

**When user specifies contracts** (e.g. "2 张", "5 contracts"):
→ Use `--sz` directly with the contract count. No `--tgtCcy` needed.

```bash
# Long 2 contracts BTC perp
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 2 \
  --tdMode cross --posSide long
```

**When user gives a plain number with no unit** (for swap/futures):
→ Ambiguous — ask before proceeding:
  "您输入的 X 是合约张数还是 USDT 金额？"
  (Is X the number of contracts or a USDT amount?)
  Wait for the user's answer before continuing.

⚠ **Inverse contracts** (`*-USD-SWAP`, `*-USD-YYMMDD`): `tgtCcy=quote_ccy` also works (note: `quote_ccy` = USD, not USDT, for inverse instruments). However, always warn: "This is an inverse contract. Margin and P&L are settled in BTC, not USDT. If you hold USDT, it must be converted to BTC for margin requirements."

### Option orders (manual conversion required)

Options (`*-USD-YYMMDD-strike-C/P`) do **NOT** support `tgtCcy`. When the user specifies a USDT amount for options, you must convert manually:

#### Step 1 — Fetch contract parameters

```bash
okx market instruments --instType OPTION --instId <instId> --json
okx option greeks --uly <BTC-USD> --expTime <YYMMDD> --json  → markPx (BTC)
okx market ticker BTC-USDT --json                            → last price (btcPx)
```

#### Step 2 — Convert USDT to contracts

```
markPx unit: base currency (e.g. BTC per contract)
ctVal unit: base currency (e.g. 0.1 BTC)

Formula (buyer cost):
  sz = floor(usdtAmt / (markPx_BTC × btcPx × ctVal))

Example — BTC-USD-250328-95000-C (markPx=0.005 BTC, btcPx=95000, ctVal=0.1 BTC):
  200 USDT → floor(200 / (0.005 × 95000 × 0.1))
           = floor(200 / 47.5) = floor(4.21) = 4 contracts
  Total premium ≈ 4 × 0.005 × 0.1 = 0.002 BTC ≈ 190 USDT

⚠ Always show both BTC and USDT premium cost to the buyer.
⚠ Seller margin is also in BTC — remind user of liquidation risk.
```

#### Step 3 — Validate before placing

```
After computing sz:

1. sz == 0 or sz < minSz
   → Reject. Inform user:
     "Amount too small: minimum order is {minSz} contract(s),
      equivalent to ~{minSz × markPx × ctVal × btcPx} USDT."

2. sz not a multiple of lotSz
   → Round down to the nearest valid multiple:
     sz = floor(sz / lotSz) × lotSz

3. sz ≥ minSz
   → Show conversion summary and wait for user confirmation before placing:

     Conversion summary:
       Input:    {usdtAmt} USDT
       markPx:   {markPx}  |  ctVal: {ctVal}  |  btcPx: {btcPx}
       Raw:      {rawResult}
       Rounded:  {sz} contracts  (~{actual USDT value})
     Confirm order with sz={sz}?
```

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

# --- Stock Token (TSLA, NVDA, etc.) ---
# Step 1: set leverage ≤ 5x (stock tokens max leverage is 5x)
okx swap leverage --instId TSLA-USDT-SWAP --lever 5 --mgnMode cross

# Step 2: open long on TSLA (--posSide required for stock tokens)
okx swap place --instId TSLA-USDT-SWAP --side buy --ordType market --sz 1 \
  --tdMode cross --posSide long

# Open short on NVDA
okx swap leverage --instId NVDA-USDT-SWAP --lever 3 --mgnMode cross
okx swap place --instId NVDA-USDT-SWAP --side sell --ordType market --sz 1 \
  --tdMode cross --posSide short

# Close TSLA long entirely at market
okx swap close --instId TSLA-USDT-SWAP --mgnMode cross --posSide long

# Set TP/SL on a spot BTC position (sell when price hits $105k, SL at $88k)
okx spot algo place --instId BTC-USDT --side sell --ordType oco --sz 0.01 \
  --tpTriggerPx 105000 --tpOrdPx -1 \
  --slTriggerPx 88000 --slOrdPx -1

# Place trailing stop on BTC perp long (callback 2%)
okx swap algo trail --instId BTC-USDT-SWAP --side sell --sz 1 \
  --tdMode cross --posSide long --callbackRatio 0.02

# Place trailing stop on spot BTC position (callback 2%)
okx spot algo trail --instId BTC-USDT --side sell --sz 0.01 --callbackRatio 0.02

# View open spot orders
okx spot orders

# View open swap positions
okx swap positions

# Cancel a spot order
okx spot cancel --instId BTC-USDT --ordId <ordId>
```

## Command Index

### Spot Orders

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

### Swap / Perpetual Orders

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

### Futures / Delivery Orders

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

### Options Orders

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

## Cross-Skill Workflows

### Spot market buy
> User: "Buy $500 worth of ETH at market"

```
1. okx-cex-portfolio okx account balance USDT               → confirm available funds ≥ $500
        ↓ user approves
2. okx-cex-trade     okx spot place --instId ETH-USDT --side buy --ordType market --sz 500 --tgtCcy quote_ccy
3. okx-cex-trade     okx spot fills --instId ETH-USDT        → confirm fill price and size
```

### Open long BTC perp with TP/SL
> User: "Long 5 contracts BTC perp at market, TP at $105k, SL at $88k"

```
1. okx-cex-portfolio okx account balance USDT               → confirm margin available
2. okx-cex-portfolio okx account max-size --instId BTC-USDT-SWAP --tdMode cross → confirm size ok
        ↓ user approves
3. okx-cex-trade     okx swap place --instId BTC-USDT-SWAP --side buy \
                       --ordType market --sz 5 --tdMode cross --posSide long \
                       --tpTriggerPx 105000 --tpOrdPx -1 \
                       --slTriggerPx 88000 --slOrdPx -1
4. okx-cex-trade     okx swap positions                     → confirm position opened
```

> **Note:** TP/SL is attached directly to the order via `--tpTriggerPx`/`--slTriggerPx` — no separate `swap algo place` step needed. Use `swap algo place` only when adding TP/SL to an **existing** position.

### Adjust leverage then place order
> User: "Set BTC perp to 5x leverage then go long 10 contracts"

```
1. okx-cex-trade     okx swap get-leverage --instId BTC-USDT-SWAP --mgnMode cross → check current lever
        ↓ user approves change
2. okx-cex-trade     okx swap leverage --instId BTC-USDT-SWAP --lever 5 --mgnMode cross
3. okx-cex-trade     okx swap place --instId BTC-USDT-SWAP --side buy \
                       --ordType market --sz 10 --tdMode cross --posSide long
4. okx-cex-trade     okx swap positions                     → confirm position + leverage
```

### Place trailing stop on open position
> User: "Set a 3% trailing stop on my open position"

Spot example (no margin mode needed):
```
1. okx-cex-portfolio okx account balance BTC               → confirm spot BTC holdings
2. okx-cex-market    okx market ticker BTC-USDT            → current price reference
        ↓ user approves
3. okx-cex-trade     okx spot algo trail --instId BTC-USDT --side sell \
                       --sz <spot_sz> --callbackRatio 0.03
4. okx-cex-trade     okx spot algo orders --instId BTC-USDT → confirm trail order placed
```

Swap/Perpetual example:
```
1. okx-cex-trade     okx swap positions                     → confirm size of open long
2. okx-cex-market    okx market ticker BTC-USDT-SWAP        → current price reference
        ↓ user approves
3. okx-cex-trade     okx swap algo trail --instId BTC-USDT-SWAP --side sell \
                       --sz <pos_size> --tdMode cross --posSide long --callbackRatio 0.03
4. okx-cex-trade     okx swap algo orders --instId BTC-USDT-SWAP → confirm trail order placed
```

Futures/Delivery example:
```
1. okx-cex-trade     okx futures positions                  → confirm size of open long
2. okx-cex-market    okx market ticker BTC-USDT-<YYMMDD>      → current price reference
        ↓ user approves
3. okx-cex-trade     okx futures algo trail --instId BTC-USDT-<YYMMDD> --side sell \
                       --sz <pos_size> --tdMode cross --posSide long --callbackRatio 0.03
4. okx-cex-trade     okx futures algo orders --instId BTC-USDT-<YYMMDD> → confirm trail order placed
```

### Trade a stock token (TSLA / NVDA / AAPL)
> User: "I want to long TSLA with 500 USDT"

```
1. okx-cex-market   okx market stock-tokens              → confirm TSLA-USDT-SWAP is available
2. okx-cex-market   okx market ticker TSLA-USDT-SWAP     → current price (e.g., markPx=310 USDT)
3. okx-cex-market   okx market instruments --instType SWAP --instId TSLA-USDT-SWAP --json
                    → ctVal=1, minSz=1, lotSz=1
   Agent computes:  sz = floor(500 / (310 × 1)) = 1 contract (~310 USDT)
   Agent shows conversion summary and asks to confirm

        ↓ user confirms

4. okx-cex-portfolio okx account balance USDT            → confirm margin available
5. okx-cex-trade    okx swap get-leverage --instId TSLA-USDT-SWAP --mgnMode cross
                    → check current leverage; must be ≤ 5x
   (if not set or > 5x) okx swap leverage --instId TSLA-USDT-SWAP --lever 5 --mgnMode cross
6. okx-cex-trade    okx swap place --instId TSLA-USDT-SWAP --side buy --ordType market \
                      --sz 1 --tdMode cross --posSide long
7. okx-cex-trade    okx swap positions TSLA-USDT-SWAP    → confirm position opened
```

> ⚠ **Stock token constraints**: max leverage **5x** (exchange rejects > 5x). `--posSide` is required. Trading follows stock market hours — confirm live ticker before placing.

---

### Open linear swap by USDT amount
> User: "用 200 USDT 做多 ETH 永续 (cross margin)"

```
1. okx-cex-market  okx market instruments --instType SWAP --instId ETH-USDT-SWAP --json
                   → ctVal=0.1 ETH, minSz=1, lotSz=1

2. okx-cex-market  okx market mark-price --instType SWAP --instId ETH-USDT-SWAP --json
                   → markPx=2000 USDT

3. Agent computes:  sz = floor(200 / (2000 × 0.1)) = 1 contract (~200 USDT)
   Agent informs user of conversion summary and asks to confirm

        ↓ user confirms

4. okx-cex-trade   okx swap place --instId ETH-USDT-SWAP --side buy --ordType market \
                     --sz 1 --tdMode cross --posSide long

5. okx-cex-trade   okx swap positions ETH-USDT-SWAP    → confirm position opened
```

### Open inverse swap by USDT amount
> User: "用 500 USDT 开一个 BTC 币本位永续多单"

```
1. okx-cex-market  okx market instruments --instType SWAP --instId BTC-USD-SWAP --json
                   → ctVal=100 USD, minSz=1

2. Agent computes:  sz = floor(500 / 100) = 5 contracts
   Agent warns:    "BTC-USD-SWAP 是币本位合约，保证金和盈亏以 BTC 结算，非 USDT。
                    请确认账户有足够 BTC 作为保证金。"
   Agent shows conversion summary and asks to confirm

        ↓ user confirms

3. okx-cex-trade   okx swap place --instId BTC-USD-SWAP --side buy --ordType market \
                     --sz 5 --tdMode cross --posSide long

4. okx-cex-trade   okx swap positions BTC-USD-SWAP    → confirm position opened
```

### Cancel all open spot orders
> User: "Cancel all my open BTC spot orders"

```
1. okx-cex-trade     okx spot orders                        → list open orders
2. okx-cex-trade     (for each ordId) okx spot cancel --instId BTC-USDT --ordId <id>
3. okx-cex-trade     okx spot orders                        → confirm all cancelled
```

### Buy a BTC call option
> User: "Buy 2 BTC call options at strike 95000 expiring end of March"

```
1. okx-cex-trade     okx option instruments --uly BTC-USD --expTime 250328
                     → find exact instId (e.g. BTC-USD-250328-95000-C)
2. okx-cex-trade     okx option greeks --uly BTC-USD --expTime 250328
                     → check IV, delta, and markPx to assess fair value
3. okx-cex-portfolio okx account balance                    → confirm enough USDT/BTC for premium
        ↓ user approves
4. okx-cex-trade     okx option place --instId BTC-USD-250328-95000-C \
                       --side buy --ordType limit --tdMode cash --sz 2 --px 0.005
5. okx-cex-trade     okx option orders                      → confirm order is live
```

### Check option portfolio Greeks
> User: "What's my total delta exposure from options?"

```
1. okx-cex-trade     okx option positions                   → live positions with per-contract Greeks
2. okx-cex-market    okx market ticker BTC-USD              → current spot price for context
```

## Operation Flow

### Step 0 — Credential & Profile Check

Before any authenticated command:

**Determine profile (required):**
- Options: `live` (实盘) or `demo` (模拟盘) — exactly these two values
1. Current message intent clear (e.g. "real"/"实盘"/"live" → live; "test"/"模拟"/"demo" → demo) → use it, inform user: `"Using --profile live (实盘)"`
2. Current message has no explicit declaration → check conversation context for previous profile:
   - Found → use it, inform user: `"Continuing with --profile live (实盘) from earlier"`
   - Not found → ask: `"Live (实盘) or Demo (模拟盘)?"` — wait for answer

**If no credentials configured:** guide user to run `okx config init`, stop all trading actions

**After every command result:** append `[profile: live]` or `[profile: demo]` to the response

### Step 1: Identify instrument type and action

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
- Place/cancel/amend order → `okx option place/cancel/amend`
- Batch cancel → `okx option batch-cancel --orders '[...]'`
- Query → `okx option orders/get/positions/fills`
- **tdMode**: `cash` for buyers (full premium upfront, no liquidation risk); `cross` or `isolated` for sellers (margin required)

### Step 2: Confirm profile (determined in Step 0), then confirm write parameters

**Read commands** (orders, positions, fills, get, get-leverage, algo orders): run immediately; note the profile used.

- `--history` flag: defaults to active/open; use `--history` only if user explicitly asks for history
- `--ordType` for algo: `conditional` = single TP or SL; `oco` = both TP and SL together
- `--tdMode` for swap/futures: `cross` or `isolated`; spot always uses `cash` (set automatically)
- `--posSide` for hedge mode: `long` or `short`; omit in net mode

**Write commands** (place, cancel, amend, close, leverage, algo): two confirmations required:

1. **Profile** — determined in Step 0; use `--profile live` (实盘) or `--profile demo` (模拟盘)
2. **Confirm parameters** — confirm the key order details once before executing:
   - Spot place: confirm `--instId`, `--side`, `--ordType`, `--sz` (and `--tgtCcy quote_ccy` if user specified a quote-currency amount — do NOT manually calculate base currency quantity); price (`--px`) required for limit orders; optionally attach TP/SL with `--tpTriggerPx`/`--slTriggerPx`
   - Swap/Futures place: confirm `--instId`, `--side`, `--sz`, `--tdMode` (and `--tgtCcy quote_ccy` if user specified a quote-currency amount — do NOT manually convert to contracts); confirm `--posSide` if in hedge mode; optionally attach TP/SL with `--tpTriggerPx`/`--slTriggerPx`
   - Option place: Options do NOT support `--tgtCcy` — if the user gives a USDT amount, manually convert to contracts using instrument metadata (ctVal, markPx) and show the conversion summary before confirming; confirm `--instId`, `--side`, `--sz`, `--tdMode`; do NOT attach TP/SL (options do not support attached TP/SL — manage risk by amending or cancelling the option order directly)
   - Swap close: confirm `--instId`, `--mgnMode`, `--posSide`; closes the entire position at market
   - Swap leverage: confirm new leverage and impact on existing positions; cannot exceed exchange max
   - Futures close: confirm `--instId`, `--mgnMode`, `--posSide`; closes the entire position at market
   - Futures leverage: confirm new leverage and impact on existing positions; cannot exceed exchange max
   - Algo place (TP/SL): confirm trigger prices; use `--tpOrdPx -1` for market execution at trigger
   - Algo trail (spot/swap/futures): confirm `--callbackRatio` (e.g., `0.02` = 2%) or `--callbackSpread` (fixed price spread); spot does not require `--tdMode` or `--posSide`

### Step 3: Verify after writes

- After `spot place`: run `okx spot orders` to confirm order is live or `okx spot fills` if market order
- After `swap place`: run `okx swap orders` or `okx swap positions` to confirm
- After `swap close`: run `okx swap positions` to confirm position size is 0
- After `futures place`: run `okx futures orders` or `okx futures positions` to confirm
- After `futures close`: run `okx futures positions` to confirm position size is 0
- After spot algo place/trail: run `okx spot algo orders` to confirm algo is active
- After swap algo place/trail: run `okx swap algo orders` to confirm algo is active
- After futures algo place/trail: run `okx futures algo orders` to confirm algo is active
- After cancel: run `okx spot orders` / `okx swap orders` / `okx futures orders` to confirm order is gone

## CLI Command Reference

### Order Type Reference

| `--ordType` | Description | Requires `--px` |
|---|---|---|
| `market` | Fill immediately at best price | No |
| `limit` | Fill at specified price or better | Yes |
| `post_only` | Limit order; cancelled if it would be a taker | Yes |
| `fok` | Fill entire order immediately or cancel | Yes |
| `ioc` | Fill what's available immediately, cancel rest | Yes |
| `conditional` | Algo: single TP or SL trigger | No (set trigger px) |
| `oco` | Algo: TP + SL together (one cancels other) | No (set both trigger px) |
| `move_order_stop` | Trailing stop (spot/swap/futures) | No (set callback) |

---

### Spot — Place Order

```bash
okx spot place --instId <id> --side <buy|sell> --ordType <type> --sz <n> \
  [--tgtCcy <base_ccy|quote_ccy>] [--px <price>] \
  [--tpTriggerPx <p>] [--tpOrdPx <p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx <p|-1>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Spot instrument (e.g., `BTC-USDT`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `market`, `limit`, `post_only`, `fok`, `ioc` |
| `--sz` | Yes | - | Order size — unit depends on `--tgtCcy` |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in base currency (e.g. SOL amount); `quote_ccy`: sz in quote currency (e.g. USDT amount) |
| `--px` | Cond. | - | Price — required for `limit`, `post_only`, `fok`, `ioc` |
| `--tpTriggerPx` | No | - | Attached take-profit trigger price |
| `--tpOrdPx` | No | - | TP order price; use `-1` for market execution |
| `--slTriggerPx` | No | - | Attached stop-loss trigger price |
| `--slOrdPx` | No | - | SL order price; use `-1` for market execution |

---

### Spot — Cancel Order

```bash
okx spot cancel --instId <id> --ordId <id> [--json]
```

---

### Spot — Amend Order

```bash
okx spot amend --instId <id> [--ordId <id>] [--clOrdId <id>] \
  [--newSz <n>] [--newPx <p>] [--json]
```

Must provide at least one of `--newSz` or `--newPx`.

---

### Spot — Place Algo (TP/SL / Trail)

```bash
okx spot algo place --instId <id> --side <buy|sell> \
  --ordType <oco|conditional|move_order_stop> --sz <n> \
  [--tgtCcy <base_ccy|quote_ccy>] \
  [--tpTriggerPx <p>] [--tpOrdPx <p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx <p|-1>] \
  [--callbackRatio <r>] [--callbackSpread <s>] [--activePx <p>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Spot instrument (e.g., `BTC-USDT`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `oco`, `conditional`, or `move_order_stop` |
| `--sz` | Yes | - | Order size in base currency |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in base currency; `quote_ccy`: sz in quote currency (e.g. USDT) |
| `--tpTriggerPx` | Cond. | - | Take-profit trigger price |
| `--tpOrdPx` | Cond. | - | TP order price; use `-1` for market execution |
| `--slTriggerPx` | Cond. | - | Stop-loss trigger price |
| `--slOrdPx` | Cond. | - | SL order price; use `-1` for market execution |
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

For `oco`: provide both TP and SL params. For `conditional`: provide only TP or only SL. For `move_order_stop`: provide `--callbackRatio` or `--callbackSpread` (one required).

---

### Spot — Amend Algo

```bash
okx spot algo amend --instId <id> --algoId <id> \
  [--newSz <n>] [--newTpTriggerPx <p>] [--newTpOrdPx <p>] \
  [--newSlTriggerPx <p>] [--newSlOrdPx <p>] [--json]
```

---

### Spot — Cancel Algo

```bash
okx spot algo cancel --instId <id> --algoId <id> [--json]
```

---

### Spot — Place Trailing Stop

```bash
okx spot algo trail --instId <id> --side <buy|sell> --sz <n> \
  [--callbackRatio <ratio>] [--callbackSpread <spread>] \
  [--activePx <price>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Spot instrument (e.g., `BTC-USDT`) |
| `--side` | Yes | - | `buy` or `sell` — use `sell` to protect a long spot position |
| `--sz` | Yes | - | Order size in base currency |
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

> Spot trailing stop does not require `--tdMode` or `--posSide` (spot has no margin mode or position side concept).

---

### Spot — List Orders

```bash
okx spot orders [--instId <id>] [--history] [--json]
```

| Flag | Effect |
|---|---|
| *(default)* | Open/pending orders |
| `--history` | Historical (filled, cancelled) orders |

---

### Spot — Get Order

```bash
okx spot get --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

Returns: `ordId`, `instId`, `side`, `ordType`, `px`, `sz`, `fillSz`, `avgPx`, `state`, `cTime`.

---

### Spot — Fills

```bash
okx spot fills [--instId <id>] [--ordId <id>] [--json]
```

Returns: `instId`, `side`, `fillPx`, `fillSz`, `fee`, `ts`.

---

### Spot — Algo Orders

```bash
okx spot algo orders [--instId <id>] [--history] [--ordType <type>] [--json]
```

Returns: `algoId`, `instId`, type, `side`, `sz`, `tpTrigger`, `slTrigger`, `state`.

---

### Swap — Place Order

```bash
okx swap place --instId <id> --side <buy|sell> --ordType <type> --sz <n> \
  --tdMode <cross|isolated> \
  [--tgtCcy <base_ccy|quote_ccy>] \
  [--posSide <long|short>] [--px <price>] \
  [--tpTriggerPx <p>] [--tpOrdPx <p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx <p|-1>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Swap instrument (e.g., `BTC-USDT-SWAP`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `market`, `limit`, `post_only`, `fok`, `ioc` |
| `--sz` | Yes | - | Order size — unit depends on `--tgtCcy` |
| `--tdMode` | Yes | - | `cross` or `isolated` |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in contracts; `quote_ccy`: sz in USDT amount |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--px` | Cond. | - | Price — required for limit orders |
| `--tpTriggerPx` | No | - | Attached take-profit trigger price |
| `--tpOrdPx` | No | - | TP order price; use `-1` for market execution |
| `--slTriggerPx` | No | - | Attached stop-loss trigger price |
| `--slOrdPx` | No | - | SL order price; use `-1` for market execution |

---

### Swap — Cancel Order

```bash
okx swap cancel --instId <id> --ordId <id> [--json]
```

---

### Swap — Amend Order

```bash
okx swap amend --instId <id> [--ordId <id>] [--clOrdId <id>] \
  [--newSz <n>] [--newPx <p>] [--json]
```

---

### Swap — Close Position

```bash
okx swap close --instId <id> --mgnMode <cross|isolated> \
  [--posSide <long|short>] [--autoCxl] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Swap instrument |
| `--mgnMode` | Yes | - | `cross` or `isolated` |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--autoCxl` | No | false | Auto-cancel pending orders before closing |

Closes the **entire** position at market price.

---

### Swap — Set Leverage

```bash
okx swap leverage --instId <id> --lever <n> --mgnMode <cross|isolated> \
  [--posSide <long|short>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Swap instrument |
| `--lever` | Yes | - | Leverage multiplier (e.g., `10`) |
| `--mgnMode` | Yes | - | `cross` or `isolated` |
| `--posSide` | Cond. | - | `long` or `short` — required for isolated mode in hedge mode |

> ⚠ **Stock tokens** (e.g., `TSLA-USDT-SWAP`): maximum leverage is **5x**. The exchange will reject `--lever` values above 5 for stock token instruments.

---

### Swap — Get Leverage

```bash
okx swap get-leverage --instId <id> --mgnMode <cross|isolated> [--json]
```

Returns table: `instId`, `mgnMode`, `posSide`, `lever`.

---

### Swap — Place Algo (TP/SL / Trail)

```bash
okx swap algo place --instId <id> --side <buy|sell> \
  --ordType <oco|conditional|move_order_stop> --sz <n> \
  --tdMode <cross|isolated> \
  [--tgtCcy <base_ccy|quote_ccy>] \
  [--posSide <long|short>] [--reduceOnly] \
  [--tpTriggerPx <p>] [--tpOrdPx <p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx <p|-1>] \
  [--callbackRatio <r>] [--callbackSpread <s>] [--activePx <p>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Swap instrument (e.g., `BTC-USDT-SWAP`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `oco`, `conditional`, or `move_order_stop` |
| `--sz` | Yes | - | Number of contracts |
| `--tdMode` | Yes | - | `cross` or `isolated` |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in contracts; `quote_ccy`: sz in USDT amount |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--reduceOnly` | No | false | Close-only; will not open a new position if one doesn't exist |
| `--tpTriggerPx` | Cond. | - | Take-profit trigger price |
| `--tpOrdPx` | Cond. | - | TP order price; use `-1` for market execution |
| `--slTriggerPx` | Cond. | - | Stop-loss trigger price |
| `--slOrdPx` | Cond. | - | SL order price; use `-1` for market execution |
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

For `move_order_stop`: provide `--callbackRatio` or `--callbackSpread` (one required).

**Example — TP/SL worth 500 USDT on BTC perp (auto-convert to contracts):**
```bash
okx swap algo place --instId BTC-USDT-SWAP --side sell --ordType conditional \
  --sz 500 --tgtCcy quote_ccy --tdMode cross --posSide long \
  --slTriggerPx 60000 --slOrdPx -1
```

---

### Swap — Place Trailing Stop

```bash
okx swap algo trail --instId <id> --side <buy|sell> --sz <n> \
  --tdMode <cross|isolated> \
  [--posSide <long|short>] [--reduceOnly] \
  [--callbackRatio <ratio>] [--callbackSpread <spread>] \
  [--activePx <price>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

---

### Swap — Amend Algo

```bash
okx swap algo amend --instId <id> --algoId <id> \
  [--newSz <n>] [--newTpTriggerPx <p>] [--newTpOrdPx <p>] \
  [--newSlTriggerPx <p>] [--newSlOrdPx <p>] [--json]
```

---

### Swap — Cancel Algo

```bash
okx swap algo cancel --instId <id> --algoId <id> [--json]
```

---

### Swap — List Orders

```bash
okx swap orders [--instId <id>] [--history] [--json]
```

---

### Swap — Get Order

```bash
okx swap get --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

Returns: `ordId`, `instId`, `side`, `posSide`, `ordType`, `px`, `sz`, `fillSz`, `avgPx`, `state`, `cTime`.

---

### Swap — Positions

```bash
okx swap positions [<instId>] [--json]
```

Returns: `instId`, `side`, `size`, `avgPx`, `upl`, `uplRatio`, `lever`. Only non-zero positions.

---

### Swap — Fills

```bash
okx swap fills [--instId <id>] [--ordId <id>] [--archive] [--json]
```

`--archive`: access older fills beyond the default window.

---

### Swap — Algo Orders

```bash
okx swap algo orders [--instId <id>] [--history] [--ordType <type>] [--json]
```

---

### Futures — Place Order

```bash
okx futures place --instId <id> --side <buy|sell> --ordType <type> --sz <n> \
  --tdMode <cross|isolated> \
  [--tgtCcy <base_ccy|quote_ccy>] \
  [--posSide <long|short>] [--px <price>] [--reduceOnly] \
  [--tpTriggerPx <p>] [--tpOrdPx <p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx <p|-1>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in contracts; `quote_ccy`: sz in USDT amount |
| `--tpTriggerPx` | No | - | Attached take-profit trigger price |
| `--tpOrdPx` | No | - | TP order price; use `-1` for market execution |
| `--slTriggerPx` | No | - | Attached stop-loss trigger price |
| `--slOrdPx` | No | - | SL order price; use `-1` for market execution |

`--instId` format: `BTC-USDT-<YYMMDD>` (delivery date suffix).

---

### Futures — Cancel Order

```bash
okx futures cancel --instId <id> --ordId <id> [--json]
```

---

### Futures — Amend Order

```bash
okx futures amend --instId <id> [--ordId <id>] [--clOrdId <id>] \
  [--newSz <n>] [--newPx <p>] [--json]
```

Must provide at least one of `--newSz` or `--newPx`.

---

### Futures — Close Position

```bash
okx futures close --instId <id> --mgnMode <cross|isolated> \
  [--posSide <long|short>] [--autoCxl] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Futures instrument (e.g., `BTC-USDT-260328`) |
| `--mgnMode` | Yes | - | `cross` or `isolated` |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--autoCxl` | No | false | Auto-cancel pending orders before closing |

Closes the **entire** position at market price.

---

### Futures — Set Leverage

```bash
okx futures leverage --instId <id> --lever <n> --mgnMode <cross|isolated> \
  [--posSide <long|short>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Futures instrument |
| `--lever` | Yes | - | Leverage multiplier (e.g., `10`) |
| `--mgnMode` | Yes | - | `cross` or `isolated` |
| `--posSide` | Cond. | - | `long` or `short` — required for isolated mode in hedge mode |

---

### Futures — Get Leverage

```bash
okx futures get-leverage --instId <id> --mgnMode <cross|isolated> [--json]
```

Returns table: `instId`, `mgnMode`, `posSide`, `lever`.

---

### Futures — List Orders

```bash
okx futures orders [--instId <id>] [--status <open|history|archive>] [--json]
```

| `--status` | Effect |
|---|---|
| `open` | Active/pending orders (default) |
| `history` | Recent completed/cancelled |
| `archive` | Older history |

---

### Futures — Positions

```bash
okx futures positions [<instId>] [--json]
```

Returns: `instId`, `side`, `pos`, `avgPx`, `upl`, `lever`.

---

### Futures — Fills

```bash
okx futures fills [--instId <id>] [--ordId <id>] [--archive] [--json]
```

---

### Futures — Get Order

```bash
okx futures get --instId <id> [--ordId <id>] [--json]
```

---

### Futures — Place Algo (TP/SL / Trail)

```bash
okx futures algo place --instId <id> --side <buy|sell> \
  --ordType <oco|conditional|move_order_stop> --sz <n> \
  --tdMode <cross|isolated> \
  [--tgtCcy <base_ccy|quote_ccy>] \
  [--posSide <long|short>] [--reduceOnly] \
  [--tpTriggerPx <p>] [--tpOrdPx <p|-1>] \
  [--slTriggerPx <p>] [--slOrdPx <p|-1>] \
  [--callbackRatio <r>] [--callbackSpread <s>] [--activePx <p>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | Futures instrument (e.g., `BTC-USDT-<YYMMDD>`) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `oco`, `conditional`, or `move_order_stop` |
| `--sz` | Yes | - | Number of contracts |
| `--tdMode` | Yes | - | `cross` or `isolated` |
| `--tgtCcy` | No | base_ccy | `base_ccy`: sz in contracts; `quote_ccy`: sz in USDT amount |
| `--posSide` | Cond. | - | `long` or `short` — required in hedge mode |
| `--reduceOnly` | No | false | Close-only; will not open a new position if one doesn't exist |
| `--tpTriggerPx` | Cond. | - | Take-profit trigger price |
| `--tpOrdPx` | Cond. | - | TP order price; use `-1` for market execution |
| `--slTriggerPx` | Cond. | - | Stop-loss trigger price |
| `--slOrdPx` | Cond. | - | SL order price; use `-1` for market execution |
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

`--instId` format: `BTC-USDT-<YYMMDD>` (e.g., `BTC-USDT-250328`). For `move_order_stop`: provide `--callbackRatio` or `--callbackSpread` (one required).

---

### Futures — Place Trailing Stop

```bash
okx futures algo trail --instId <id> --side <buy|sell> --sz <n> \
  --tdMode <cross|isolated> \
  [--posSide <long|short>] [--reduceOnly] \
  [--callbackRatio <ratio>] [--callbackSpread <spread>] \
  [--activePx <price>] \
  [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--callbackRatio` | Cond. | - | Trailing callback as a ratio (e.g., `0.02` = 2%); cannot be combined with `--callbackSpread` |
| `--callbackSpread` | Cond. | - | Trailing callback as fixed price distance; cannot be combined with `--callbackRatio` |
| `--activePx` | No | - | Price at which trailing stop becomes active |

---

### Futures — Amend Algo

```bash
okx futures algo amend --instId <id> --algoId <id> \
  [--newSz <n>] [--newTpTriggerPx <p>] [--newTpOrdPx <p>] \
  [--newSlTriggerPx <p>] [--newSlOrdPx <p>] [--json]
```

---

### Futures — Cancel Algo

```bash
okx futures algo cancel --instId <id> --algoId <id> [--json]
```

---

### Futures — Algo Orders

```bash
okx futures algo orders [--instId <id>] [--history] [--ordType <type>] [--json]
```

---

### Option — Get Instruments (Option Chain)

```bash
okx option instruments --uly <underlying> [--expTime <YYMMDD>] [--json]
```

| Param | Required | Description |
|---|---|---|
| `--uly` | Yes | Underlying, e.g. `BTC-USD` or `ETH-USD` |
| `--expTime` | No | Filter by expiry date, e.g. `250328` |

Returns: `instId`, `uly`, `expTime`, `stk` (strike), `optType` (C/P), `state`.

Run this **before placing any option order** to get the exact `instId`.

---

### Option — Get Greeks

```bash
okx option greeks --uly <underlying> [--expTime <YYMMDD>] [--json]
```

Returns IV (`markVol`) and BS Greeks (`deltaBS`, `gammaBS`, `thetaBS`, `vegaBS`) plus `markPx` for each contract.

---

### Option — Place Order

```bash
okx option place --instId <id> --side <buy|sell> --ordType <type> \
  --tdMode <cash|cross|isolated> --sz <n> \
  [--px <price>] [--reduceOnly] [--clOrdId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | e.g. `BTC-USD-250328-95000-C` (call) or `...-P` (put) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `market`, `limit`, `post_only`, `fok`, `ioc` |
| `--tdMode` | Yes | - | `cash` = buyer (full premium); `cross`/`isolated` = seller (margin) |
| `--sz` | Yes | - | Number of contracts |
| `--px` | Cond. | - | Required for `limit`, `post_only`, `fok`, `ioc` |
| `--reduceOnly` | No | false | Close-only; do not open a new position |

**tdMode rules:**
- Buyer (`side=buy`): always use `cash` — pay full premium, no margin call risk
- Seller (`side=sell`): use `cross` or `isolated` — margin required, liquidation risk

---

### Option — Cancel Order

```bash
okx option cancel --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

---

### Option — Amend Order

```bash
okx option amend --instId <id> [--ordId <id>] [--clOrdId <id>] \
  [--newSz <n>] [--newPx <p>] [--json]
```

Must provide at least one of `--newSz` or `--newPx`.

---

### Option — Batch Cancel

```bash
okx option batch-cancel --orders '<JSON>' [--json]
```

`--orders` is a JSON array of up to 20 objects, each `{"instId":"...","ordId":"..."}`:

```bash
okx option batch-cancel --orders '[{"instId":"BTC-USD-250328-95000-C","ordId":"123"},{"instId":"BTC-USD-250328-90000-P","ordId":"456"}]'
```

---

### Option — List Orders

```bash
okx option orders [--instId <id>] [--uly <underlying>] [--history] [--archive] [--json]
```

| Flag | Effect |
|---|---|
| *(default)* | Live/pending orders |
| `--history` | Historical (7d) |
| `--archive` | Older archive (3mo) |

---

### Option — Get Order

```bash
okx option get --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

Returns: `ordId`, `instId`, `side`, `ordType`, `px`, `sz`, `fillSz`, `avgPx`, `state`, `cTime`.

---

### Option — Positions

```bash
okx option positions [--instId <id>] [--uly <underlying>] [--json]
```

Returns: `instId`, `posSide`, `pos`, `avgPx`, `upl`, `deltaPA`, `gammaPA`, `thetaPA`, `vegaPA`. Only non-zero positions shown.

---

### Option — Fills

```bash
okx option fills [--instId <id>] [--ordId <id>] [--archive] [--json]
```

`--archive`: access fills beyond the default 3-day window (up to 3 months).

---

## MCP Tool Reference

| Tool | Description |
|---|---|
| `spot_place_order` | Place spot order |
| `spot_cancel_order` | Cancel spot order |
| `spot_amend_order` | Amend spot order |
| `spot_place_algo_order` | Place spot TP/SL algo |
| `spot_amend_algo_order` | Amend spot algo |
| `spot_cancel_algo_order` | Cancel spot algo |
| `spot_get_orders` | List spot orders |
| `spot_get_order` | Get single spot order |
| `spot_get_fills` | Spot fill history |
| `spot_get_algo_orders` | List spot algo orders |
| `swap_place_order` | Place swap order |
| `swap_cancel_order` | Cancel swap order |
| `swap_amend_order` | Amend swap order |
| `swap_close_position` | Close swap position |
| `swap_set_leverage` | Set swap leverage |
| `swap_place_algo_order` | Place swap TP/SL algo |
| `swap_place_move_stop_order` | Place trailing stop (swap/futures) |
| `swap_amend_algo_order` | Amend swap algo |
| `swap_cancel_algo_orders` | Cancel swap algo |
| `swap_get_positions` | Swap positions |
| `swap_get_orders` | List swap orders |
| `swap_get_order` | Get single swap order |
| `swap_get_fills` | Swap fill history |
| `swap_get_leverage` | Get swap leverage |
| `swap_get_algo_orders` | List swap algo orders |
| `futures_place_order` | Place futures order |
| `futures_cancel_order` | Cancel futures order |
| `futures_amend_order` | Amend futures order |
| `futures_close_position` | Close futures position |
| `futures_set_leverage` | Set futures leverage |
| `futures_place_algo_order` | Place futures TP/SL algo |
| `futures_place_move_stop_order` | Place futures trailing stop |
| `futures_amend_algo_order` | Amend futures algo |
| `futures_cancel_algo_orders` | Cancel futures algo |
| `futures_get_orders` | List futures orders |
| `futures_get_positions` | Futures positions |
| `futures_get_fills` | Futures fill history |
| `futures_get_order` | Get single futures order |
| `futures_get_leverage` | Get futures leverage |
| `futures_get_algo_orders` | List futures algo orders |
| `option_get_instruments` | Option chain (list available contracts) |
| `option_get_greeks` | IV and Greeks by underlying |
| `option_place_order` | Place option order |
| `option_cancel_order` | Cancel option order |
| `option_amend_order` | Amend option order |
| `option_batch_cancel` | Batch cancel up to 20 option orders |
| `option_get_orders` | List option orders |
| `option_get_order` | Get single option order |
| `option_get_positions` | Option positions with live Greeks |
| `option_get_fills` | Option fill history |

---

## Input / Output Examples

**"Buy 0.05 BTC at market"**
```bash
okx spot place --instId BTC-USDT --side buy --ordType market --sz 0.05
# → Order placed: 7890123456 (OK)
```

**"Set a limit sell for 0.1 ETH at $3500"**
```bash
okx spot place --instId ETH-USDT --side sell --ordType limit --sz 0.1 --px 3500
# → Order placed: 7890123457 (OK)
```

**"Show my open spot orders"**
```bash
okx spot orders
# → table: ordId, instId, side, type, price, size, filled, state
```

**"Long 10 contracts BTC perp at market (cross margin)"**
```bash
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 10 \
  --tdMode cross --posSide long
# → Order placed: 7890123458 (OK)
```

**"Long 10 contracts BTC perp with TP at $105k and SL at $88k"**
```bash
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 10 \
  --tdMode cross --posSide long \
  --tpTriggerPx 105000 --tpOrdPx -1 --slTriggerPx 88000 --slOrdPx -1
# → Order placed: 7890123459 (OK) — TP/SL attached via attachAlgoOrds
```

**"Set take profit at $105k and stop loss at $88k on an existing BTC perp long"**
```bash
okx swap algo place --instId BTC-USDT-SWAP --side sell --ordType oco --sz 10 \
  --tdMode cross --posSide long \
  --tpTriggerPx 105000 --tpOrdPx -1 \
  --slTriggerPx 88000 --slOrdPx -1
# → Algo order placed: ALGO456789 (OK)
```

**"Close my ETH perp position"**
```bash
okx swap close --instId ETH-USDT-SWAP --mgnMode cross --posSide long
# → Position closed: ETH-USDT-SWAP long
```

**"Set BTC perp leverage to 5x (cross)"**
```bash
okx swap leverage --instId BTC-USDT-SWAP --lever 5 --mgnMode cross
# → Leverage set: 5x BTC-USDT-SWAP
```

**"Long 1 contract TSLA stock token at market (cross margin)"**
```bash
okx swap place --instId TSLA-USDT-SWAP --side buy --ordType market --sz 1 \
  --tdMode cross --posSide long
# → Order placed: 7890123461 (OK) [profile: live]
```

**"Open short on NVDA, 2 contracts"**
```bash
okx swap place --instId NVDA-USDT-SWAP --side sell --ordType market --sz 2 \
  --tdMode cross --posSide short
# → Order placed: 7890123462 (OK) [profile: live]
```

**"Place a 2% trailing stop on my BTC perp long"**
```bash
okx swap algo trail --instId BTC-USDT-SWAP --side sell --sz 10 \
  --tdMode cross --posSide long --callbackRatio 0.02
# → Trailing stop placed: TRAIL123 (OK)
```

**"Place a 3% trailing stop on my spot BTC"**
```bash
okx spot algo trail --instId BTC-USDT --side sell --sz 0.01 --callbackRatio 0.03
# → Trailing stop placed: TRAIL456 (OK)
```

**"Place a 2% trailing stop on my BTC futures long"**
```bash
okx futures algo trail --instId BTC-USDT-<YYMMDD> --side sell --sz 5 \
  --tdMode cross --posSide long --callbackRatio 0.02
# → Trailing stop placed: TRAIL789 (OK)
```

**"Close my BTC futures long position"**
```bash
okx futures close --instId BTC-USDT-260328 --mgnMode cross --posSide long
# → Position closed: BTC-USDT-260328 long
```

**"Set BTC futures leverage to 10x (cross)"**
```bash
okx futures leverage --instId BTC-USDT-260328 --lever 10 --mgnMode cross
# → Leverage set: 10x BTC-USDT-260328
```

**"Place a TP at $105k and SL at $88k on my ETH futures long"**
```bash
okx futures algo place --instId ETH-USDT-260328 --side sell --ordType oco --sz 5 \
  --tdMode cross --posSide long \
  --tpTriggerPx 105000 --tpOrdPx -1 \
  --slTriggerPx 88000 --slOrdPx -1
# → Algo order placed: ALGO789012 (OK)
```

**"Show my open swap positions"**
```bash
okx swap positions
# → table: instId, side, size, avgPx, upl, uplRatio, lever
```

**"What are my recent fill trades for BTC spot?"**
```bash
okx spot fills --instId BTC-USDT
# → table: instId, side, fillPx, fillSz, fee, ts
```

**"Show me the BTC option chain expiring March 28"**
```bash
okx option instruments --uly BTC-USD --expTime 250328
# → table: instId, expTime, stk, optType (C/P), state
```

**"What's the IV and delta for BTC options expiring March 28?"**
```bash
okx option greeks --uly BTC-USD --expTime 250328
# → table: instId, delta, gamma, theta, vega, iv (markVol), markPx
```

**"Buy 1 BTC call at strike 95000 expiring March 28, limit at 0.005 BTC"**
```bash
okx option place --instId BTC-USD-250328-95000-C \
  --side buy --ordType limit --tdMode cash --sz 1 --px 0.005
# → Order placed: 7890123460 (OK)
```

**"Show my open option positions"**
```bash
okx option positions
# → table: instId, posSide, pos, avgPx, upl, delta, gamma, theta, vega
```

## Edge Cases

### Spot
- **Market order size**: default `--sz` is in base currency (e.g., BTC amount). If user specifies a USDT amount, use `--tgtCcy quote_ccy` and pass the USDT value as `--sz` directly — do NOT manually convert
- **Insufficient balance**: check `okx-cex-portfolio account balance` before placing
- **Price not required**: `market` orders don't need `--px`; `limit` / `post_only` / `fok` / `ioc` do
- **Algo oco**: provide both `tpTriggerPx` and `slTriggerPx`; price `-1` means market execution at trigger
- **Fills vs orders**: `fills` shows executed trades; `orders --history` shows all orders including cancelled
- **Trailing stop**: use either `--callbackRatio` (relative, e.g., `0.02`) or `--callbackSpread` (absolute price), not both; `--tdMode` and `--posSide` are not required for spot
- **Algo on close side**: always set `--side` opposite to position direction (e.g., long spot holding → `sell` algo, short spot → `buy` algo)

### Swap / Perpetual
- **sz unit**: number of contracts, or a USDT amount when using `--tgtCcy quote_ccy`. If the user specifies a USDT amount, pass it directly as `--sz` with `--tgtCcy quote_ccy` — do NOT manually convert to contracts
- **Linear vs inverse**: `BTC-USDT-SWAP` is linear (USDT-margined); `BTC-USD-SWAP` is inverse (BTC-margined). For inverse, warn the user that margin and P&L are settled in BTC
- **posSide**: required in hedge mode (`long_short_mode`); omit in net mode. Check `okx account config` for `posMode`
- **tdMode**: use `cross` for cross-margin, `isolated` for isolated margin
- **Close position**: `swap close` closes the **entire** position; to partial close, use `swap place` with a reduce-only algo
- **Leverage**: max leverage varies by instrument and account level; exchange rejects if exceeded
- **Trailing stop**: use either `--callbackRatio` (relative, e.g., `0.02`) or `--callbackSpread` (absolute price), not both
- **Algo on close side**: always set `--side` opposite to position (e.g., long position → sell algo)
- **Stock tokens (instCategory=3)**: instruments like `TSLA-USDT-SWAP`, `NVDA-USDT-SWAP` follow the same linear SWAP flow (USDT-margined, sz in contracts). Key differences: (1) max leverage **5x** — check with `swap get-leverage` before placing, set with `swap leverage --lever <n≤5>`; (2) `--posSide` is always required; (3) trading restricted to stock market hours (US stocks: Mon–Fri ~09:30–16:00 ET) — confirm live ticker before placing. Use `okx market stock-tokens` to list available instruments

### Futures / Delivery
- **sz unit**: number of contracts, or a USDT amount when using `--tgtCcy quote_ccy`. If the user specifies a USDT amount, pass it directly as `--sz` with `--tgtCcy quote_ccy` — do NOT manually convert to contracts
- **Linear vs inverse**: `BTC-USDT-<YYMMDD>` is linear; `BTC-USD-<YYMMDD>` is inverse (USD face value, BTC settlement). For inverse, use `--tgtCcy quote_ccy` to specify a USD amount (note: `quote_ccy` = USD, not USDT for inverse instruments); warn the user that margin and P&L are settled in BTC
- **instId format**: delivery futures use date suffix: `BTC-USDT-<YYMMDD>` (e.g., `BTC-USDT-260328` for March 28, 2026 expiry)
- **Expiry**: futures expire on the delivery date — all positions auto-settle; do not hold through expiry unless intended
- **Close position**: use `futures close` to close the **entire** position at market price — same semantics as `swap close`; to partial close, use `futures place` with `--reduceOnly`
- **Leverage**: `futures leverage` sets leverage for a futures instrument, same constraints as swap; max leverage varies by instrument and account level
- **Trailing stop**: use either `--callbackRatio` (relative, e.g., `0.02`) or `--callbackSpread` (absolute price), not both; same parameters as swap — `--tdMode` and `--posSide` required in hedge mode
- **Algo on close side**: always set `--side` opposite to position (e.g., long position → `sell` algo)

### Options
- **sz unit**: always number of contracts — Options do NOT support `--tgtCcy`, so manually convert when user gives a USDT amount. For inverse options (BTC-USD), premium is quoted in BTC; convert via `sz = floor(usdtAmt / (markPx_BTC × btcPx × ctVal))`
- **instId format**: `{uly}-{YYMMDD}-{strike}-{C|P}` — e.g. `BTC-USD-250328-95000-C`; always run `okx option instruments --uly BTC-USD` first to confirm the exact contract exists
- **tdMode**: buyers always use `cash` (full premium paid upfront, no liquidation); sellers use `cross` or `isolated` (margin required, liquidation risk)
- **px unit**: quoted in base currency for inverse options (e.g. `0.005` = 0.005 BTC premium per contract); always show equivalent USDT value to the user
- **Expiry**: options expire at 08:00 UTC on the expiry date; in-the-money options are auto-exercised; do not hold through expiry unless intended
- **No TP/SL algo on options**: the `swap algo` / `spot algo` commands do not apply to option positions; manage risk by cancelling/amending option orders directly
- **Greeks in positions**: `okx option positions` returns live portfolio Greeks (`deltaPA`, `gammaPA`, etc.) from the account's position-level calculation, while `okx option greeks` returns BS model Greeks per contract

## Global Notes

- All write commands require valid credentials in `~/.okx/config.toml` or env vars
- `--profile <name>` is required for all authenticated commands; see "Credential & Profile Check" section
- Every command result includes a `[profile: <name>]` tag for audit reference
- `--json` returns raw OKX API v5 response
- Rate limit: 60 order operations per 2 seconds per UID
- Batch operations (batch cancel, batch amend) are available via MCP tools directly if needed
- Position mode (`net` vs `long_short_mode`) affects whether `--posSide` is required
- **tgtCcy rule (spot/swap/futures)**: when user specifies a quote-currency amount (e.g. "30 USDT worth"), MUST use `--tgtCcy quote_ccy` and pass the USDT amount as `--sz`. Do NOT manually calculate base currency quantity or contract count — let the API handle the conversion. When user specifies base currency quantity or contract count, omit `--tgtCcy` (defaults to `base_ccy`). Options do NOT support `--tgtCcy` — manual conversion required (see Options notes).
- **Order amount mismatch safety rule**: If the order would execute at a significantly different amount than the user requested (e.g. due to minSz or conversion), STOP and inform the user. Never auto-adjust order size without explicit user confirmation.
- **No follow-up orders**: After an order executes, if the filled amount materially differs from what the user requested (beyond normal rounding or minimum lot size differences), STOP immediately. Inform the user of the actual filled amount and the discrepancy. Do NOT place any additional orders to compensate for the shortfall or overfill. Wait for explicit user instruction before taking further action.
