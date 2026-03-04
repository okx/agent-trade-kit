# bot module

Grid trading bot tools. Requires API key with **Read + Trade** permissions.

> **Demo mode not supported.** OKX does not expose grid bot endpoints for simulated trading accounts. Use a live account.

## Tools

| Tool | Description |
|------|-------------|
| `bot_grid_get_orders` | List active or historical grid bots |
| `bot_grid_get_order_details` | Get details of a specific grid bot |
| `bot_grid_get_sub_orders` | List filled sub-orders within a grid bot |
| `bot_grid_create_order` | Create a new grid bot |
| `bot_grid_stop_order` | Stop a running grid bot |

## Grid strategy types

| `algoOrdType` | Description |
|---------------|-------------|
| `grid` | Spot grid — trades a spot pair within a price range |
| `contract_grid` | Contract grid — trades a perpetual or delivery contract |
| `moon_grid` | Moon grid — geometric grid optimized for trending markets |

## Example prompts

- "List all my running grid bots"
- "Create a spot grid bot on BTC-USDT: invest 100 USDT, 10 grids, price range 80000–100000"
- "Show the sub-orders filled by my grid bot algoId 12345"
- "Stop my BTC-USDT grid bot"

## Creating a grid bot

Key parameters for `bot_grid_create_order`:

| Parameter | Description |
|-----------|-------------|
| `instId` | Instrument, e.g. `BTC-USDT` |
| `algoOrdType` | Strategy type: `grid`, `contract_grid`, `moon_grid` |
| `maxPx` | Upper price boundary |
| `minPx` | Lower price boundary |
| `gridNum` | Number of grids (price levels) |
| `quoteSz` | Investment amount in quote currency (for spot grid) |
| `baseSz` | Investment amount in base currency (optional) |

## CLI

```bash
# List bots
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history

# Create a spot grid bot (demo mode for testing — but note demo is not supported by OKX)
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100

# Inspect a bot
okx bot grid details --algoOrdType grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType grid --algoId <algoId>

# Stop a bot
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT
```

---

# bot 模块

网格交易机器人工具。需要 API Key，开启 **读取 + 交易** 权限。

> **不支持模拟盘。** OKX 不对模拟交易账号开放网格机器人端点，请使用实盘账号。

## 工具列表

| 工具 | 说明 |
|------|------|
| `bot_grid_get_orders` | 列出运行中或历史网格机器人 |
| `bot_grid_get_order_details` | 查询指定机器人的详情 |
| `bot_grid_get_sub_orders` | 列出机器人已成交的子订单 |
| `bot_grid_create_order` | 创建网格机器人 |
| `bot_grid_stop_order` | 停止运行中的机器人 |

## 网格策略类型

| `algoOrdType` | 说明 |
|---------------|------|
| `grid` | 现货网格——在价格区间内交易现货对 |
| `contract_grid` | 合约网格——交易永续或交割合约 |
| `moon_grid` | Moon Grid——几何级差网格，适合趋势行情 |

## 示例提示词

- "列出我所有运行中的网格机器人"
- "在 BTC-USDT 创建现货网格：投入100 USDT，10个格，价格区间 80000–100000"
- "显示 algoId 为 12345 的机器人已成交子订单"
- "停止我的 BTC-USDT 网格机器人"

## 创建网格机器人

`bot_grid_create_order` 的关键参数：

| 参数 | 说明 |
|------|------|
| `instId` | 交易对，如 `BTC-USDT` |
| `algoOrdType` | 策略类型：`grid`、`contract_grid`、`moon_grid` |
| `maxPx` | 价格上界 |
| `minPx` | 价格下界 |
| `gridNum` | 网格数量（价格档位数） |
| `quoteSz` | 计价币投入金额（现货网格） |
| `baseSz` | 基础币投入金额（可选） |

## CLI

```bash
# 查询机器人
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history

# 创建现货网格机器人
okx bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100

# 查看机器人详情
okx bot grid details --algoOrdType grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType grid --algoId <algoId>

# 停止机器人
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT
```
