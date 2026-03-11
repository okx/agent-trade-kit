# futures module

Delivery (expiry) contract trading tools. Requires API key with **Read + Trade** permissions.

## Tools

| Tool | Description |
|------|-------------|
| `futures_place_order` | Place a delivery contract order |
| `futures_cancel_order` | Cancel an open futures order |
| `futures_amend_order` | Amend price or size of an open order |
| `futures_get_order` | Get details of a single order |
| `futures_get_open_orders` | List currently open futures orders |
| `futures_get_order_history` | Order history |
| `futures_get_positions` | Current open positions |
| `futures_get_fills` | Recent fills |

## Instrument format

Delivery contracts use expiry dates in the instrument ID:

```
BTC-USDT-250328   ← BTC/USDT contract expiring 2025-03-28
ETH-USD-250328    ← ETH/USD coin-margined contract
```

## Example prompts

- "Place a market buy order on BTC-USDT-250328, 1 contract, cross margin"
- "What are my open futures positions?"
- "Show my futures order history"
- "Cancel order 123456 on BTC-USDT-250328"

## CLI

```bash
# View orders and positions
okx futures orders
okx futures orders --history
okx futures positions
okx futures fills
okx futures get --instId BTC-USDT-250328 --ordId 123456

# Place and cancel
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross
# With attached TP/SL
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross \
  --tpTriggerPx 100000 --tpOrdPx 99900 --slTriggerPx 85000 --slOrdPx 84900
okx futures cancel BTC-USDT-250328 --ordId 123456
```

---

# futures 模块

交割合约交易工具。需要 API Key，开启 **读取 + 交易** 权限。

## 工具列表

| 工具 | 说明 |
|------|------|
| `futures_place_order` | 下交割合约单 |
| `futures_cancel_order` | 撤销挂单 |
| `futures_amend_order` | 改价或改量 |
| `futures_get_order` | 查询单笔订单详情 |
| `futures_get_open_orders` | 查询当前挂单 |
| `futures_get_order_history` | 历史订单 |
| `futures_get_positions` | 当前持仓 |
| `futures_get_fills` | 最新成交记录 |

## 合约 ID 格式

交割合约 ID 中包含到期日期：

```
BTC-USDT-250328   ← BTC/USDT 合约，2025-03-28 交割
ETH-USD-250328    ← ETH/USD 币本位合约
```

## 示例提示词

- "以市价买入 BTC-USDT-250328，1张，全仓模式"
- "查看我当前的交割合约持仓"
- "显示我的交割合约历史订单"
- "撤销 BTC-USDT-250328 订单 123456"

## CLI

```bash
# 查询订单和持仓
okx futures orders
okx futures orders --history
okx futures positions
okx futures fills
okx futures get --instId BTC-USDT-250328 --ordId 123456

# 下单和撤单
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross
# 附带止盈止损
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross \
  --tpTriggerPx 100000 --tpOrdPx 99900 --slTriggerPx 85000 --slOrdPx 84900
okx futures cancel BTC-USDT-250328 --ordId 123456
```
