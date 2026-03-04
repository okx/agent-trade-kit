# swap module

Perpetual contract (SWAP) trading tools. Requires API key with **Read + Trade** permissions.

## Tools

| Tool | Description |
|------|-------------|
| `swap_place_order` | Place a perpetual contract order |
| `swap_cancel_order` | Cancel an open swap order |
| `swap_amend_order` | Amend price or size of an open order |
| `swap_batch_place_orders` | Place up to 20 orders in a single request |
| `swap_batch_cancel_orders` | Cancel multiple orders in a single request |
| `swap_close_position` | Close all positions for an instrument |
| `swap_get_order` | Get details of a single order |
| `swap_get_open_orders` | List currently open orders |
| `swap_get_order_history` | Order history (last 7 days) |
| `swap_get_positions` | Current open positions |
| `swap_get_fills` | Recent fills |
| `swap_set_leverage` | Set leverage for an instrument |
| `swap_get_leverage` | Get current leverage settings |

## Example prompts

- "Open a long position on BTC-USDT-SWAP with 1 contract at market price, 10x leverage, cross margin"
- "What are my current perpetual positions?"
- "Close my BTC-USDT-SWAP position"
- "Set leverage to 5x for ETH-USDT-SWAP"
- "Show my open swap orders"

## Key parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `tdMode` | `cross`, `isolated` | Margin mode |
| `posSide` | `long`, `short`, `net` | Position side (net for one-way mode) |
| `side` | `buy`, `sell` | Order side |
| `ordType` | `market`, `limit`, `post_only`, `fok`, `ioc` | Order type |

## CLI

```bash
# View positions and orders
okx swap positions
okx swap orders --history
okx swap get --instId BTC-USDT-SWAP --ordId 123456
okx swap fills --instId BTC-USDT-SWAP

# Place and manage orders
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross
okx swap cancel BTC-USDT-SWAP --ordId 123456
okx swap close --instId BTC-USDT-SWAP --mgnMode cross

# Leverage
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
okx swap get-leverage --instId BTC-USDT-SWAP --mgnMode cross
```

---

# swap 模块

永续合约交易工具。需要 API Key，开启 **读取 + 交易** 权限。

## 工具列表

| 工具 | 说明 |
|------|------|
| `swap_place_order` | 下永续合约单 |
| `swap_cancel_order` | 撤销挂单 |
| `swap_amend_order` | 改价或改量 |
| `swap_batch_place_orders` | 批量下单（最多20笔） |
| `swap_batch_cancel_orders` | 批量撤单 |
| `swap_close_position` | 一键平仓（指定合约） |
| `swap_get_order` | 查询单笔订单详情 |
| `swap_get_open_orders` | 查询当前挂单 |
| `swap_get_order_history` | 历史订单（7天内） |
| `swap_get_positions` | 当前持仓 |
| `swap_get_fills` | 最新成交记录 |
| `swap_set_leverage` | 设置杠杆倍数 |
| `swap_get_leverage` | 查询当前杠杆设置 |

## 示例提示词

- "以市价开 BTC-USDT-SWAP 多仓，1张，10倍杠杆，全仓模式"
- "查看我当前的永续合约持仓"
- "平掉我的 BTC-USDT-SWAP 仓位"
- "将 ETH-USDT-SWAP 杠杆设为5倍"
- "显示我当前的永续挂单"

## 关键参数

| 参数 | 可选值 | 说明 |
|------|--------|------|
| `tdMode` | `cross`, `isolated` | 保证金模式（全仓/逐仓） |
| `posSide` | `long`, `short`, `net` | 持仓方向（单向模式用 net） |
| `side` | `buy`, `sell` | 买卖方向 |
| `ordType` | `market`, `limit`, `post_only`, `fok`, `ioc` | 订单类型 |

## CLI

```bash
# 查询持仓和订单
okx swap positions
okx swap orders --history
okx swap get --instId BTC-USDT-SWAP --ordId 123456
okx swap fills --instId BTC-USDT-SWAP

# 下单和管理
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross
okx swap cancel BTC-USDT-SWAP --ordId 123456
okx swap close --instId BTC-USDT-SWAP --mgnMode cross

# 杠杆
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
okx swap get-leverage --instId BTC-USDT-SWAP --mgnMode cross
```
