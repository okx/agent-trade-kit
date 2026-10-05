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
okx bot smart-portfolio zones-backtest --recommendId <id> [--period <24H|7D|1M|3M|6M|1Y|2Y>]
```

---

## Parameter Display Names

### Smart Portfolio Bot (智能组合)

| API Field | EN | ZH |
|---|---|---|
| `stgyName` | Strategy name | 策略名称 |
| `investmentCcy` | Valuation currency | 计价币种 |
| `initCapital` | Initial investment amount | 初始投入金额 |
| `portfolioList` | Asset allocation list | 组合资产列表 |
| `interval` | Rebalance interval (minutes) | 再平衡间隔（分钟） |
| `deltaRatio` | Rebalance threshold | 再平衡偏离阈值 |
| `investType` | Investment type (simple / complex) | 投入方式（简单 / 复合） |
| `tradeQuoteCcy` | Debit currency | 实际扣款币种 |
| `algoClOrdId` | Client strategy ID | 客户端策略 ID |
| `stopType` | Stop type (1=sell all / 2=keep assets) | 停止类型（1=卖出全部 / 2=保留持仓） |
| `recommendId` | Recommended zone ID | 推荐组合 ID |
| `assetType` | Asset category (Crypto / TradeFi) | 资产类别（加密货币 / 传统金融） |
| `period` | Backtest period | 回测周期 |
| `investCcy` | Valuation currency (in query response) | 计价币种（查询响应字段） |
| `totalPnl` | Total profit and loss | 累计盈亏 |
| `pnlRatio` | PnL ratio | 累计收益率 |
| `state` | Bot state (running / stopping / stopped / pause) | 策略状态（运行中 / 停止中 / 已停止 / 暂停） |
