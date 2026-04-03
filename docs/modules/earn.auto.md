# earn.auto

自动赚币模块，用户开启后系统自动将闲置资产进行出借或质押，无需手动操作。

## Business Context

- 目标用户：VIP 用户为主
  - 业务优先级：全员群 VIP 用户反馈，高优
  - 预期调用量：低频
  - 依赖模块：account（account_get_balance 查询余额及支持状态）
  - 风控要求：开启后不能划转、开启后 24 小时内不可关闭
  - 站点支持：global
  - API 权限：查询 Read-only；开启/关闭 Trade 权限

## Tools

| Name | R/W | Description |
|---|---|---|
| | Tool 名称 | R/W | 描述 | |
| |---|---|---| |
| | earn_auto_get_status | R | 查询指定币种的自动赚币支持状态和在投信息（support、status、amt、apr） | |
| | earn_auto_get_currencies | R | 查询所有支持自动赚币的币种列表 | |
| | earn_auto_set | W | 开启或关闭指定币种的自动赚币（earnType 自动推断） | |

## Token 预算评估

预估 ~1000 tokens (5 tools × ~200)

## 典型 Workflow

1. 查询哪些币种支持自动赚币 → `earn_auto_get_currencies`
  2. 开启指定币种 → `earn_auto_set`（action=turn_on）
  3. 查看在投状态 → `earn_auto_get_status`
