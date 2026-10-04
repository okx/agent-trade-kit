# Smart Portfolio Bot Commands

> Requires `--modules bot.smartportfolio` or `bot.all` (not in default modules).

## Create

```bash
okx bot smart-portfolio create \
  --investmentCcy USDT \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --deltaRatio 0.05 \
  [--interval 86400]
```

- `portfolioList`: JSON array of `{ccy, ratio}` objects. Must have 2–10 items. Ratios must sum to 1.0. CCYs are case-insensitive and must be unique.
- `deltaRatio`: Rebalance trigger threshold. Minimum 0.01, must be < 1. Value is truncated to 2 decimal places.
- `interval`: Optional periodic rebalance interval in seconds. Omit or set to 0 to disable periodic rebalance.

## List Running Bots

```bash
okx bot smart-portfolio orders [--algoId <id>] [--after <id>] [--before <id>] [--limit <n>]
```

## List History (Stopped)

```bash
okx bot smart-portfolio history [--state <stopped|filled>] [--instType <SPOT>] [--algoId <id>]
```

## Get Details

```bash
okx bot smart-portfolio details --algoId <id>
```

## Stop

```bash
okx bot smart-portfolio stop --algoId <id>
```

## Amend Rebalance Parameters

```bash
okx bot smart-portfolio amend-rebalance --algoId <id> \
  [--portfolioList '<json>'] \
  [--deltaRatio <n>] \
  [--interval <secs>]
```

## Trigger Instant Rebalance

```bash
okx bot smart-portfolio instant-rebalance --algoId <id>
```

Returns `triggered: true` if a rebalance was triggered, `false` if the portfolio is already balanced.

## Browse Recommended Zones

```bash
okx bot smart-portfolio recommend-zones --investCcy USDT [--ccy <asset>] [--limit <n>]
```

Use `zoneId` from results to run a backtest.

## Get Zone Backtest

```bash
okx bot smart-portfolio zones-backtest --investCcy USDT --zoneId <id> [--period <1W|1M|3M|6M|1Y>]
```
