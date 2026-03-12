[English](./copy-trade.md) | [中文](./copy-trade.zh-CN.md)

# 跟单模块（Copy Trading）

`copytrading` 模块支持发现带单员、开启跟单、管理跟单仓位，以及查询公开带单员数据——通过 MCP tools 或 CLI 命令均可操作。

## MCP Tools

| Tool | 鉴权 | 说明 |
|------|------|------|
| `copytrading_public_lead_traders` | 公开 | 获取带单员排行榜 |
| `copytrading_current_lead_traders` | 私有 | 查看我当前正在跟单的带单员列表 |
| `copytrading_copy_positions` | 私有 | 获取我当前未平仓的跟单仓位 |
| `copytrading_follow_trader` | 私有 ⚠️ | 首次跟单某带单员（会分配真实资金） |
| `copytrading_amend_settings` | 私有 | 修改对某带单员的跟单设置 |
| `copytrading_stop_copy_trader` | 私有 ⚠️ | 停止跟随某带单员 |
| `copytrading_copy_settings` | 私有 | 查看对某带单员的当前跟单设置 |
| `copytrading_history_positions` | 私有 | 获取跟单历史仓位（最近3个月） |
| `copytrading_public_lead_trader_pnl` | 公开 | 获取带单员每日盈亏 |
| `copytrading_public_weekly_pnl` | 公开 | 获取带单员最近12周周度盈亏 |
| `copytrading_public_stats` | 公开 | 获取带单员统计（胜率、均仓等） |
| `copytrading_public_preference_currency` | 公开 | 获取带单员偏好交易币种 |
| `copytrading_public_current_positions` | 公开 | 获取带单员当前持仓（公开视角） |
| `copytrading_public_history_positions` | 公开 | 获取带单员历史平仓记录（公开视角） |
| `copytrading_public_followers` | 公开 | 获取带单员当前跟单人数信息 |
| `copytrading_public_config` | 公开 | 获取平台跟单配置（金额/比例限制） |

## 启用模块

`copytrading` 不在默认模块集合中，需要显式启用：

```bash
# MCP 服务端
okx-trade-mcp --modules copytrading,spot,swap,account

# CLI — 无需额外配置，所有模块始终可用
okx copy-trade traders
```

或在 `config.toml` 中配置：

```toml
[profiles.default]
modules = "spot,swap,account,copytrading"
```

## 关键参数说明

| 参数 | 说明 |
|------|------|
| `uniqueCode` | 带单员唯一标识（16位字符码） |
| `copyTotalAmt` | 分配给该带单员的最大 USDT 总额 |
| `copyMode` | `fixed_amount`（每单固定金额）或 `ratio_copy`（按比例跟单） |
| `copyAmt` | 每单固定 USDT 金额（`fixed_amount` 模式） |
| `copyRatio` | 跟单比例，如 `0.1` 表示跟随带单员仓位的10%（`ratio_copy` 模式） |
| `copyMgnMode` | 保证金模式：`cross`（全仓）、`isolated`（逐仓）、`copy`（跟随带单员） |
| `subPosCloseType` | 停止跟单时的仓位处理：`copy_close`（跟随平仓）、`market_close`（立即市价平仓）、`manual_close`（保留仓位） |
| `lastDays` | 时间范围：`1`=7天 `2`=30天 `3`=90天 `4`=365天 |

## CLI 快速参考

```bash
# 发现带单员
okx copy-trade traders
okx copy-trade trader-stats --uniqueCode <code> --lastDays 2
okx copy-trade trader-pnl   --uniqueCode <code> --lastDays 2

# 跟单管理
okx copy-trade follow   --uniqueCode <code> --copyAmt 500 --fixedAmt 50
okx copy-trade update   --uniqueCode <code> --copyAmt 1000
okx copy-trade unfollow --uniqueCode <code>

# 监控
okx copy-trade pnl
okx copy-trade positions
okx copy-trade orders
```

完整示例参见 [CLI 参考文档](../cli-reference.md#copy-trade--跟单交易)。
