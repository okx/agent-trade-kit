# Cross-Skill Workflows

## Spot Grid Bot
> User: "Start a BTC grid bot between $90k and $100k with 10 grids, invest 1000 USDT"

```
1. okx-cex-market    okx market ticker BTC-USDT                     → confirm price is in range
2. okx-cex-portfolio okx account balance USDT                       → confirm available funds
        ↓ user approves
3. okx-cex-bot       okx bot grid create --instId BTC-USDT --algoOrdType grid \
                       --minPx 90000 --maxPx 100000 --gridNum 10 --quoteSz 1000
4. okx-cex-bot       okx bot grid orders --algoOrdType grid          → confirm bot is active
5. okx-cex-bot       okx bot grid details --algoOrdType grid --algoId <id> → monitor PnL
```

## Contract DCA Bot
> User: "Start a long DCA bot on BTC perp, 3x leverage, $200 initial, 3% TP"

```
1. okx-cex-market    okx market ticker BTC-USDT-SWAP                → confirm current price
2. okx-cex-portfolio okx account balance USDT                       → confirm margin
        ↓ user approves
3. okx-cex-bot       okx bot dca create --algoOrdType contract_dca --instId BTC-USDT-SWAP \
                       --lever 3 --direction long \
                       --initOrdAmt 200 --safetyOrdAmt 100 --maxSafetyOrds 3 \
                       --pxSteps 0.03 --pxStepsMult 1 --volMult 1 --tpPct 0.03
4. okx-cex-bot       okx bot dca orders --algoOrdType contract_dca   → confirm active
5. okx-cex-bot       okx bot dca details --algoOrdType contract_dca --algoId <id> → monitor PnL
```

## Spot DCA Bot
> User: "帮我在现货上 DCA BTC，首单 100 USDT，5% 止盈"

```
1. okx-cex-market    okx market ticker BTC-USDT                     → confirm current price
2. okx-cex-portfolio okx account balance USDT                       → confirm funds
        ↓ user approves
3. okx-cex-bot       okx bot dca create --algoOrdType spot_dca --instId BTC-USDT \
                       --direction long \
                       --initOrdAmt 100 --safetyOrdAmt 50 --maxSafetyOrds 3 \
                       --pxSteps 0.03 --pxStepsMult 1.2 --volMult 1.5 --tpPct 0.05
4. okx-cex-bot       okx bot dca orders --algoOrdType spot_dca       → confirm active
```

## Smart Portfolio Bot — Create from Recommended Zone
> User: "Set up a Smart Portfolio with OKX's recommended allocation in USDT"

```
1. okx-cex-bot       okx bot smart-portfolio recommend-zones --investCcy USDT → pick a zone
2. okx-cex-bot       okx bot smart-portfolio zones-backtest --investCcy USDT --zoneId <id> --period 3M → evaluate
3. okx-cex-portfolio okx account balance USDT                       → confirm funds
        ↓ user approves
4. okx-cex-bot       okx bot smart-portfolio create \
                       --investmentCcy USDT \
                       --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
                       --deltaRatio 0.05
5. okx-cex-bot       okx bot smart-portfolio orders                  → confirm active
6. okx-cex-bot       okx bot smart-portfolio details --algoId <id>   → monitor allocation
```
