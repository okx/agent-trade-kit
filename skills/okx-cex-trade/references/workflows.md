# Trade Workflows & Examples

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
