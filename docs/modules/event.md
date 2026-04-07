# event

支持事件合约

## Business Context

新增事件合约模块，允许用户进行事件合约交易

## Tools

| Name | R/W | Description |
|---|---|---|
| event_browse | R | 浏览当前活跃的事件合约 |
| event_get_series | R | 列出事件合约系列 |
| event_get_events | R | 列出事件（到期周期） |
| event_get_markets | R | 列出市场合约与结算结果（到期后返回 outcome / settleValue） |
| event_place_order | W | 下单 |
| event_amend_order | W | 改单 |
| event_cancel_order | W | 撤单 |
| event_get_orders | R | 查询订单 state=live 为挂单 |
| event_get_fills | R | 查询成交记录 |

9 个工具

## Token 预算评估

预估 ~1800 tokens (9 tools × ~200)

## 典型 Workflow

浏览系列/市场 -> 下单 -> 查订单/成交
