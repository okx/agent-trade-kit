# event

支持事件合约

## Business Context

新增事件合约模块，允许用户进行事件合约交易

## Tools

| Name | R/W | Description |
|---|---|---|
| 8个工具 |
| event_get_series  R  列出事件合约 |
| event_get_events  R  列出事件 |
| event_get_markets R 列出市场的Yes/No概率 |
| event_precheck_order R 下单预检 |
| event_palce_order W  下单 |
| event_cancel_order W 撤单 |
| event_get_orders  R 查询订单 state=live为挂单 |
| event_get_fills R 查询成交记录 |

## Token 预算评估

预估 ~1800 tokens (9 tools × ~200)

## 典型 Workflow

看市场 -> 预检查 -> 下单
