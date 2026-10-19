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

## Smart Portfolio Bot — 修改再平衡参数
> User: "帮我把囤币 bot SP001 的再平衡阈值改成 5%，间隔改为 60 分钟"
> 适用场景：用户想修改已运行 bot 的 deltaRatio 或 interval

```
1. okx-cex-bot       okx bot smart-portfolio orders                   → list running bots, find algoId for "SP001"
2. okx-cex-bot       okx bot smart-portfolio details --algoId <id>    → confirm current deltaRatio/interval
        ↓ user approves
3. okx-cex-bot       okx bot smart-portfolio amend-rebalance \
                       --algoId <id> \
                       --deltaRatio 0.05 \
                       --interval 60
4. okx-cex-bot       okx bot smart-portfolio details --algoId <id>    → verify updated params
```

Note: `--stgyName` / display name in user message is NOT `algoId`. Always run `orders` first to get the numeric algoId.

## Smart Portfolio Bot — 用户自定义配置（直接建仓）
> User: "帮我建一个 60% BTC、40% ETH 的囤币策略，投 5000 USDT"
> 适用场景：用户已明确指定配置比例，无需参考推荐组合

```
1. okx-cex-portfolio okx account balance USDT                       → confirm available funds
        ↓ user approves
2. okx-cex-bot       okx bot smart-portfolio create \
                       --stgyName "My Portfolio" \
                       --investmentCcy USDT \
                       --initCapital 5000 \
                       --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
                       --interval 20 \
                       --deltaRatio 0.05
3. okx-cex-bot       okx bot smart-portfolio orders                  → confirm active
4. okx-cex-bot       okx bot smart-portfolio details --algoId <id>   → monitor allocation
```

## Smart Portfolio Bot — 从 OKX 推荐组合建仓
> User: "帮我选一个 OKX 推荐的囤币方案"
> 适用场景：用户希望参考官方推荐，或不确定该选哪些币种

```
1. okx-cex-bot       okx bot smart-portfolio recommend-zones [--assetType Crypto]
                       → browse zones, pick recommendId; note stgyParam.interval and stgyParam.deltaRatio
2. okx-cex-bot       okx bot smart-portfolio zones-backtest --recommendId <id> [--period 3M]
                       → (optional) evaluate backtest; skip if user has already decided
3. okx-cex-portfolio okx account balance USDT                        → confirm funds
        ↓ user approves
4. okx-cex-bot       okx bot smart-portfolio create \
                       --stgyName "My Portfolio" \
                       --investmentCcy USDT \
                       --initCapital <amount> \
                       --portfolioList '<stgyParam.portfolioList from step 1>' \
                       --interval <stgyParam.interval from step 1> \
                       --deltaRatio <stgyParam.deltaRatio from step 1>
5. okx-cex-bot       okx bot smart-portfolio orders                   → confirm active
6. okx-cex-bot       okx bot smart-portfolio details --algoId <id>    → monitor allocation
```
