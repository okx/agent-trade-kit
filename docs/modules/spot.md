# spot module

Spot trading tools. Requires API key with **Read + Trade** permissions.

## Tools

| Tool | Description |
|------|-------------|
| `spot_place_order` | Place a spot order (market, limit, post-only, FOK, IOC) |
| `spot_cancel_order` | Cancel an open spot order |
| `spot_amend_order` | Amend price or size of an open order |
| `spot_batch_place_orders` | Place up to 20 orders in a single request |
| `spot_batch_cancel_orders` | Cancel multiple orders in a single request |
| `spot_get_order` | Get details of a single order |
| `spot_get_open_orders` | List currently open orders |
| `spot_get_order_history` | Order history (last 7 days) |
| `spot_get_order_history_archive` | Order history older than 7 days (up to 3 months) |
| `spot_get_fills` | Recent fills / trade history |
| `spot_get_fills_archive` | Fills older than 1 hour (up to 3 months) |

## Example prompts

- "Buy 100 USDT worth of BTC at market price"
- "Place a limit sell order for 0.001 BTC at 70000 USDT"
- "What are my open spot orders?"
- "Cancel order 123456 on BTC-USDT"
- "Show my BTC-USDT fill history"

## Order types

| `ordType` | Description |
|-----------|-------------|
| `market` | Market order — execute immediately at best price |
| `limit` | Limit order — execute at specified price or better |
| `post_only` | Maker-only limit order — rejected if it would match immediately |
| `fok` | Fill-or-kill — fill entire amount immediately or cancel |
| `ioc` | Immediate-or-cancel — fill what's available, cancel the rest |

## CLI

```bash
# View orders
okx spot orders
okx spot orders --instId BTC-USDT --history
okx spot get --instId BTC-USDT --ordId 123456
okx spot fills --instId BTC-USDT

# Place orders
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx spot place --instId BTC-USDT --side sell --ordType limit --sz 0.001 --px 70000
# With attached TP/SL
okx spot place --instId BTC-USDT --side buy --ordType limit --sz 0.001 --px 60000 \
  --tpTriggerPx 65000 --tpOrdPx 64900 --slTriggerPx 58000 --slOrdPx 57900

# Manage orders
okx spot amend --instId BTC-USDT --ordId 123456 --newPx 68000
okx spot cancel BTC-USDT --ordId 123456
```

---

# spot 模块

现货交易工具。需要 API Key，开启 **读取 + 交易** 权限。

## 工具列表

| 工具 | 说明 |
|------|------|
| `spot_place_order` | 下现货单（市价、限价、Post-only、FOK、IOC） |
| `spot_cancel_order` | 撤销挂单 |
| `spot_amend_order` | 改价或改量 |
| `spot_batch_place_orders` | 批量下单（最多20笔） |
| `spot_batch_cancel_orders` | 批量撤单 |
| `spot_get_order` | 查询单笔订单详情 |
| `spot_get_open_orders` | 查询当前挂单 |
| `spot_get_order_history` | 历史订单（7天内） |
| `spot_get_order_history_archive` | 历史订单（7天前，最多3个月） |
| `spot_get_fills` | 最新成交记录 |
| `spot_get_fills_archive` | 较早成交记录（1小时前，最多3个月） |

## 示例提示词

- "以市价买入价值100 USDT 的 BTC"
- "以70000 USDT 挂限价卖单，卖出 0.001 BTC"
- "查看我当前的现货挂单"
- "撤销 BTC-USDT 订单 123456"
- "显示我的 BTC-USDT 成交记录"

## 订单类型

| `ordType` | 说明 |
|-----------|------|
| `market` | 市价单——立即以最优价成交 |
| `limit` | 限价单——以指定价或更优价成交 |
| `post_only` | 只挂单（Maker-only）——若会立即成交则拒绝 |
| `fok` | Fill-or-Kill——全量立即成交，否则撤单 |
| `ioc` | Immediate-or-Cancel——立即成交剩余量，剩余撤单 |

## CLI

```bash
# 查询订单
okx spot orders
okx spot orders --instId BTC-USDT --history
okx spot get --instId BTC-USDT --ordId 123456
okx spot fills --instId BTC-USDT

# 下单
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx spot place --instId BTC-USDT --side sell --ordType limit --sz 0.001 --px 70000
# 附带止盈止损
okx spot place --instId BTC-USDT --side buy --ordType limit --sz 0.001 --px 60000 \
  --tpTriggerPx 65000 --tpOrdPx 64900 --slTriggerPx 58000 --slOrdPx 57900

# 管理订单
okx spot amend --instId BTC-USDT --ordId 123456 --newPx 68000
okx spot cancel BTC-USDT --ordId 123456
```
