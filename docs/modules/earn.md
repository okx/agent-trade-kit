# earn module

[English](#english) | [中文](#中文)

---

## English

The `earn` module provides tools for OKX Earn products, split into two sub-modules:

| Sub-module | Tools | Description |
|------------|-------|-------------|
| `earn.savings` | 7 | Simple Earn: balance, purchase, redeem, lending rate management, rate history |
| `earn.onchain` | 6 | On-chain Earn (staking/DeFi): offers, purchase, redeem, cancel, active orders, history |

### earn.savings — Simple Earn

Requires API key with **Read** permission. Write operations (purchase, redeem, set-rate) require **Trade** permission.
`earn_get_lending_rate_summary` and `earn_get_lending_rate_history` are public endpoints (no API key required).

| Tool | Description |
|------|-------------|
| `earn_get_savings_balance` | Get savings balance for all currencies or a specific one |
| `earn_savings_purchase` | Purchase Simple Earn product (move funds into savings) |
| `earn_savings_redeem` | Redeem Simple Earn product (withdraw funds from savings) |
| `earn_set_lending_rate` | Set your lending rate preference |
| `earn_get_lending_history` | Get lending history with earnings details |
| `earn_get_lending_rate_summary` | Get market lending rate summary (public, no auth) |
| `earn_get_lending_rate_history` | Get historical lending rates (public, no auth) |

### earn.onchain — On-chain Earn (staking/DeFi)

Requires API key with **Read** permission. Write operations require **Trade** permission.
**Not supported in demo/simulated trading mode** — involves real fund movements.

| Tool | Description | Write |
|------|-------------|-------|
| `onchain_earn_get_offers` | Get available staking/DeFi offers | No |
| `onchain_earn_purchase` | Purchase (invest in) a product | Yes |
| `onchain_earn_redeem` | Redeem an investment | Yes |
| `onchain_earn_cancel` | Cancel a pending purchase | Yes |
| `onchain_earn_get_active_orders` | Get active investments | No |
| `onchain_earn_get_order_history` | Get investment history | No |

### Example prompts

```
"What is my savings balance?"
"Purchase 1000 USDT into Simple Earn"
"Redeem 500 USDT from savings"
"Set my USDT lending rate to 2%"
"Show my lending history"
"What is the current USDT lending rate?"
"Show me available ETH staking offers"
"What are my current on-chain earn positions?"
"Redeem my staking order 12345"
```

### CLI

```bash
# --- earn.savings ---
okx earn savings balance
okx earn savings balance USDT
okx earn savings purchase --ccy USDT --amt 1000
okx earn savings purchase --ccy USDT --amt 1000 --rate 0.02
okx earn savings redeem --ccy USDT --amt 500
okx earn savings set-rate --ccy USDT --rate 0.02
okx earn savings lending-history --ccy USDT
okx earn savings rate-summary USDT
okx earn savings rate-history --ccy USDT --limit 10

# --- earn.onchain ---
okx earn onchain offers
okx earn onchain offers --ccy ETH
okx earn onchain offers --protocolType staking
okx earn onchain orders
okx earn onchain history
okx earn onchain purchase --productId xxx --ccy ETH --amt 1
okx earn onchain redeem --ordId 12345 --protocolType staking
okx earn onchain cancel --ordId 12345 --protocolType staking
```

### MCP startup

```bash
# All earn sub-modules (default when earn is selected)
okx-trade-mcp --modules earn

# Individual sub-modules
okx-trade-mcp --modules earn.savings
okx-trade-mcp --modules earn.onchain
```

### Notes

- **On-chain earn demo mode**: On-chain earn operations are not available in demo/simulated trading mode.
- **Lock periods**: Some on-chain products have lock periods. Check `allowEarlyRedeem` if you need to redeem before the term ends.
- **Protocol types**: Main types are `staking` (PoS validator staking) and `defi` (DeFi protocol deposits).

---

## 中文

`earn` 模块提供 OKX 赚币产品工具，分为两个子模块：

| 子模块 | 工具数 | 说明 |
|--------|--------|------|
| `earn.savings` | 7 | 简单赚币：余额、申购、赎回、出借利率管理、利率历史 |
| `earn.onchain` | 6 | 链上赚币（质押/DeFi）：产品列表、申购、赎回、取消、活跃订单、历史订单 |

### earn.savings — 简单赚币

需要 API Key 的**读取**权限。申购、赎回、设置利率需额外**交易**权限。
`earn_get_lending_rate_summary` 和 `earn_get_lending_rate_history` 为公开接口，无需认证。

| 工具 | 说明 |
|------|------|
| `earn_get_savings_balance` | 查询活期赚币余额（指定币种或全部） |
| `earn_savings_purchase` | 申购简单赚币（将资金转入理财） |
| `earn_savings_redeem` | 赎回简单赚币（将资金从理财取出） |
| `earn_set_lending_rate` | 设置出借利率偏好 |
| `earn_get_lending_history` | 查询出借历史及收益明细 |
| `earn_get_lending_rate_summary` | 查询市场出借利率摘要（公开接口，无需认证） |
| `earn_get_lending_rate_history` | 查询历史出借利率（公开接口，无需认证） |

### earn.onchain — 链上赚币（质押/DeFi）

需要 API Key 的**读取**权限。写入操作需**交易**权限。
**不支持模拟/演示交易模式**——涉及真实资金流动。

| 工具 | 说明 | 写入 |
|------|------|------|
| `onchain_earn_get_offers` | 获取可用的质押/DeFi 产品 | 否 |
| `onchain_earn_purchase` | 申购产品 | 是 |
| `onchain_earn_redeem` | 赎回投资 | 是 |
| `onchain_earn_cancel` | 取消待处理的申购 | 是 |
| `onchain_earn_get_active_orders` | 获取活跃投资订单 | 否 |
| `onchain_earn_get_order_history` | 获取投资历史记录 | 否 |

### 示例提示词

```
"查看我的赚币余额"
"申购 1000 USDT 活期赚币"
"赎回 500 USDT"
"将 USDT 出借利率设为 2%"
"查看我的出借记录"
"当前 USDT 的市场出借利率是多少？"
"显示 ETH 的链上赚币产品"
"我目前有哪些链上赚币仓位？"
"赎回我的质押订单 12345"
```

### CLI

```bash
# --- earn.savings ---
okx earn savings balance
okx earn savings balance USDT
okx earn savings purchase --ccy USDT --amt 1000
okx earn savings purchase --ccy USDT --amt 1000 --rate 0.02
okx earn savings redeem --ccy USDT --amt 500
okx earn savings set-rate --ccy USDT --rate 0.02
okx earn savings lending-history --ccy USDT
okx earn savings rate-summary USDT
okx earn savings rate-history --ccy USDT --limit 10

# --- earn.onchain ---
okx earn onchain offers
okx earn onchain offers --ccy ETH
okx earn onchain offers --protocolType staking
okx earn onchain orders
okx earn onchain history
okx earn onchain purchase --productId xxx --ccy ETH --amt 1
okx earn onchain redeem --ordId 12345 --protocolType staking
okx earn onchain cancel --ordId 12345 --protocolType staking
```

### MCP 启动

```bash
# 所有赚币子模块（默认）
okx-trade-mcp --modules earn

# 指定子模块
okx-trade-mcp --modules earn.savings
okx-trade-mcp --modules earn.onchain
```

### 注意事项

- **链上赚币不支持模拟模式**：链上赚币操作涉及真实资金，不支持模拟/演示交易模式。
- **锁定期**：部分链上产品有锁定期，如需提前赎回请确认 `allowEarlyRedeem` 选项。
- **协议类型**：主要类型包括 `staking`（PoS 验证者质押）和 `defi`（DeFi 协议存款）。
