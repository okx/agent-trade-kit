# Smart Portfolio Bot Commands

> Requires `--modules bot.smartportfolio` or `bot.all` (not in default modules).

## Create

```bash
okx bot smart-portfolio create \
  --stgyName <name> \
  --investmentCcy USDT \
  --initCapital <amount> \
  --portfolioList '[{"ccy":"BTC","ratio":"0.6"},{"ccy":"ETH","ratio":"0.4"}]' \
  --interval <minutes> \
  --deltaRatio 0.05
```

- `stgyName`, `investmentCcy`, `initCapital`, `portfolioList`, `interval`, `deltaRatio`: all required.
- `portfolioList`: JSON array of `{ccy, ratio}` objects. Must have 2–10 items. Ratios must sum to 1.0. CCYs are case-insensitive and must be unique.
- `deltaRatio`: Rebalance trigger threshold. Minimum 0.01, must be < 1. Value is truncated to 2 decimal places.
- `interval`: Periodic rebalance interval in minutes (e.g. `20` = rebalance every 20 minutes).
- `--aiBuilderCode <code>`: Optional builder attribution code, forwarded to `smart_portfolio_create_order`.

## List Bots (Running or History)

```bash
# Running bots (default)
okx bot smart-portfolio orders [--algoId <id>] [--instId <pair>] [--after <id>] [--before <id>] [--limit <n>]

# Stopped bots
okx bot smart-portfolio orders --history [--state stopped] [--instType <SPOT>] \
  [--algoId <id>] [--instId <pair>] [--after <id>] [--before <id>] [--limit <n>]
```

## Get Details

```bash
okx bot smart-portfolio details --algoId <id>
```

## Stop

```bash
okx bot smart-portfolio stop --algoId <id> --stopType <1|2>
```

`--stopType` is required. `1` = stop and sell all assets back to `investmentCcy`; `2` = stop and keep current holdings. Always check bot state via `details` before stopping.

## Amend Rebalance Parameters

```bash
okx bot smart-portfolio amend-rebalance --algoId <id> --deltaRatio <n> --interval <minutes>
```

Both `--deltaRatio` and `--interval` are required on every call. The server rejects the request if both values equal the bot's current settings. `portfolioList`, `investmentCcy`, and rebalance mode cannot be changed via this command.

## Trigger Instant Rebalance

```bash
okx bot smart-portfolio instant-rebalance --algoId <id>
```

Returns `triggered: true` if a rebalance was triggered, `false` if the portfolio is already balanced.

## Browse Recommended Zones

```bash
okx bot smart-portfolio recommend-zones [--recommendId <id>] [--assetType <Crypto|TradeFi>]
```

Use `recommendId` from results to run a backtest.

## Get Zone Backtest

```bash
okx bot smart-portfolio zones-backtest --recommendId <id> [--period <24H|7D|1M|3M|6M|1Y|2Y>]
```

---

## Edge Cases

- **State check before stop**: always call `details` first to confirm the bot is `running` before issuing `stop`.
- **amend-rebalance no-op rejection**: if both `deltaRatio` and `interval` match the bot's current values, the server returns an error — at least one value must differ.
- **Demo mode**: smart-portfolio bots created in demo mode (`--demo`) are isolated from live bots.
- **`filled` state not applicable**: unlike Grid/DCA, Smart Portfolio history only uses state `stopped`; do not pass `--state filled`.

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
| `aiBuilderCode` | Builder attribution code (optional) | Builder 归因码（可选） |
| `stopType` | Stop type (1=sell all / 2=keep assets) | 停止类型（1=卖出全部 / 2=保留持仓） |
| `recommendId` | Recommended zone ID | 推荐组合 ID |
| `assetType` | Asset category (Crypto / TradeFi) | 资产类别（加密货币 / 传统金融） |
| `period` | Backtest period | 回测周期 |
| `totalPnl` | Total profit and loss | 累计盈亏 |
| `pnlRatio` | PnL ratio | 累计收益率 |
| `state` | Bot state (running / stopping / stopped / pause) | 策略状态（运行中 / 停止中 / 已停止 / 暂停） |
