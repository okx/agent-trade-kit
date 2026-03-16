# earn module

[English](#english) | [中文](#中文)

---

## English

The `earn` module provides tools for OKX Earn products, split into three sub-modules:

| Sub-module | Tools | Description |
|------------|-------|-------------|
| `earn.savings` | 7 | Simple Earn: balance, purchase, redeem, lending rate management, rate history |
| `earn.onchain` | 6 | On-chain Earn (staking/DeFi): offers, purchase, redeem, cancel, active orders, history |
| `earn.dcd` | 8 | Dual Currency Deposit (双币赢): currency pairs, products, quote, buy, early redeem, order history |

### earn.savings — Simple Earn

Requires API key with **Read** permission. Write operations (purchase, redeem, set-rate) require **Trade** permission.
`earn_get_lending_rate_summary` and `earn_get_lending_rate_history` are public endpoints (no API key required).

| Tool | Description |
|------|-------------|
| `earn_get_savings_balance` | Get savings balance for all currencies or a specific one |
| `earn_savings_purchase` | Purchase Simple Earn product (move funds into savings) |
| `earn_savings_redeem` | Redeem Simple Earn product (withdraw funds from savings) |
| `earn_set_lending_rate` | Set your lending rate preference |
| `earn_get_lending_history` | Get market lending rate history |
| `earn_get_lending_rate_summary` | Get coin lending market rate summary (借币市场利率). NOT related to Simple Earn. Public, no auth. |
| `earn_get_lending_rate_history` | Query Simple Earn lending rates — use this when asking about current or historical lending rates (public, no auth) |

### earn.onchain — On-chain Earn (staking/DeFi)

Requires API key with **Read** permission. Write operations require **Trade** permission.
**Not supported in demo/simulated trading mode** — involves real fund movements.

| Tool | Description | Write |
|------|-------------|-------|
| `onchain_earn_get_offers` | Get available staking/DeFi offers; always show protocol name (protocol field) and earnings currency (earningData[].ccy field) | No |
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
# All modules including earn (earn is included in "all")
okx-trade-mcp --modules all

# All earn sub-modules only
okx-trade-mcp --modules earn

# Individual sub-modules
okx-trade-mcp --modules earn.savings
okx-trade-mcp --modules earn.onchain
```

### earn.dcd — Dual Currency Deposit (双币赢)

Requires API key with **Read** permission. Write operations (buy, redeem) require **Trade** permission.
**Not supported in demo/simulated trading mode.**

| Tool | Description | Write |
|------|-------------|-------|
| `dcd_get_currency_pairs` | Get available DCD currency pairs | No |
| `dcd_get_products` | Get active DCD products with yield, strike, term info | No |
| `dcd_request_quote` | Request a real-time quote (TTL ~30s) | No |
| `dcd_execute_quote` | Execute a quote to place a DCD trade | Yes |
| `dcd_request_redeem_quote` | Request an early redemption quote (TTL ~15s) | No |
| `dcd_execute_redeem` | Execute early redemption | Yes |
| `dcd_get_order_state` | Query DCD order state by order ID | No |
| `dcd_get_orders` | Get DCD order history with optional filters | No |

### Example prompts

```
"Show available DCD currency pairs"
"List BTC-USDT CALL products with at least 5% annual yield"
"Buy DCD product BTC-USDT-260327-77000-C with 0.001 BTC"
"Show my active DCD positions"
"Redeem order 987654321 early"
```

### CLI

```bash
# Query
okx earn dcd pairs
okx earn dcd products --baseCcy BTC --quoteCcy USDT --optType C
okx earn dcd products --baseCcy BTC --quoteCcy USDT --optType C --minYield 0.05 --maxTermDays 7
okx earn dcd products --baseCcy BTC --quoteCcy USDT --optType C --strikeNear 72000

# Subscribe (quote + buy in one step)
okx --profile live earn dcd quote-and-buy --productId BTC-USDT-260327-77000-C --sz 0.001 --notionalCcy BTC

# Two-step subscribe
okx --profile live earn dcd quote --productId BTC-USDT-260327-77000-C --sz 0.001 --notionalCcy BTC
okx --profile live earn dcd buy --quoteId <quoteId>

# Order management
okx --profile live earn dcd orders
okx --profile live earn dcd orders --state live
okx --profile live earn dcd order --ordId <ordId>

# Early redemption (preview then execute)
okx --profile live earn dcd redeem-quote --ordId <ordId>
okx --profile live earn dcd redeem-execute --ordId <ordId>
```

### MCP startup

```bash
# All earn sub-modules
okx-trade-mcp --modules earn

# DCD only
okx-trade-mcp --modules earn.dcd
```

### Notes

- **On-chain earn demo mode**: On-chain earn operations are not available in demo/simulated trading mode.
- **Lock periods**: Some on-chain products have lock periods. Check `allowEarlyRedeem` if you need to redeem before the term ends.
- **Protocol types**: Main types are `staking` (PoS validator staking) and `defi` (DeFi protocol deposits).
- **DCD demo mode**: DCD does not support demo/simulated trading mode. Always use a live API key.
- **Quote TTL**: DCD quotes expire in ~30 seconds. Execute immediately after requesting.
- **Early redemption**: Two-step flow — preview with `redeem-quote`, then execute with `redeem-execute`. The preview quote expires before the execute step, so `redeem-execute` automatically re-fetches a fresh quote.
- **504 on WRITE operations**: Never retry blindly. A 504 means the gateway timed out but the server may have executed the order. Always query `dcd orders` first to check.

---

## 中文

`earn` 模块提供 OKX 赚币产品工具，分为三个子模块：

| 子模块 | 工具数 | 说明 |
|--------|--------|------|
| `earn.savings` | 7 | 简单赚币：余额、申购、赎回、出借利率管理、利率历史 |
| `earn.onchain` | 6 | 链上赚币（质押/DeFi）：产品列表、申购、赎回、取消、活跃订单、历史订单 |
| `earn.dcd` | 8 | 双币赢（Dual Currency Deposit）：币对、产品、报价、申购、提前赎回、订单历史 |

### earn.savings — 简单赚币

需要 API Key 的**读取**权限。申购、赎回、设置利率需额外**交易**权限。
`earn_get_lending_rate_summary` 和 `earn_get_lending_rate_history` 为公开接口，无需认证。

| 工具 | 说明 |
|------|------|
| `earn_get_savings_balance` | 查询活期赚币余额（指定币种或全部） |
| `earn_savings_purchase` | 申购简单赚币（将资金转入理财） |
| `earn_savings_redeem` | 赎回简单赚币（将资金从理财取出） |
| `earn_set_lending_rate` | 设置出借利率偏好 |
| `earn_get_lending_history` | 查询市场借贷利率历史 |
| `earn_get_lending_rate_summary` | 查询借币市场利率摘要，与简单赚币无关（公开接口，无需认证） |
| `earn_get_lending_rate_history` | 查询简单赚币利率——用户询问当前或历史利率时调用此工具（公开接口，无需认证） |

### earn.onchain — 链上赚币（质押/DeFi）

需要 API Key 的**读取**权限。写入操作需**交易**权限。
**不支持模拟/演示交易模式**——涉及真实资金流动。

| 工具 | 说明 | 写入 |
|------|------|------|
| `onchain_earn_get_offers` | 获取可用的质押/DeFi 产品；展示时必须显示协议名称（protocol 字段）和收益币种（earningData[].ccy 字段） | 否 |
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
# 所有模块（含赚币，earn 已包含在 "all" 中）
okx-trade-mcp --modules all

# 仅赚币子模块
okx-trade-mcp --modules earn

# 指定子模块
okx-trade-mcp --modules earn.savings
okx-trade-mcp --modules earn.onchain
```

### earn.dcd — 双币赢（Dual Currency Deposit）

需要 API Key 的**读取**权限。申购、赎回需额外**交易**权限。
**不支持模拟/演示交易模式。**

| 工具 | 说明 | 写入 |
|------|------|------|
| `dcd_get_currency_pairs` | 获取可用双币赢币对 | 否 |
| `dcd_get_products` | 获取活跃产品（含收益率、行权价、期限信息） | 否 |
| `dcd_request_quote` | 请求实时报价（TTL 约 30 秒） | 否 |
| `dcd_execute_quote` | 执行报价（申购） | 是 |
| `dcd_request_redeem_quote` | 请求提前赎回报价（TTL 约 15 秒） | 否 |
| `dcd_execute_redeem` | 执行提前赎回 | 是 |
| `dcd_get_order_state` | 按订单 ID 查询订单状态 | 否 |
| `dcd_get_orders` | 获取订单历史（支持多种筛选条件） | 否 |

### 示例提示词

```
"查看双币赢支持的币对"
"列出 BTC-USDT 高卖产品，年化至少 5%，7 天以内"
"申购 BTC-USDT-260327-77000-C，投入 0.001 BTC"
"查看我的双币赢持仓"
"提前赎回订单 987654321"
```

### CLI

```bash
# 查询
okx earn dcd pairs
okx earn dcd products --baseCcy BTC --quoteCcy USDT --optType C
okx earn dcd products --baseCcy BTC --quoteCcy USDT --optType C --minYield 0.05 --maxTermDays 7
okx earn dcd products --baseCcy BTC --quoteCcy USDT --optType C --strikeNear 72000

# 一步申购（推荐）
okx --profile live earn dcd quote-and-buy --productId BTC-USDT-260327-77000-C --sz 0.001 --notionalCcy BTC

# 两步申购
okx --profile live earn dcd quote --productId BTC-USDT-260327-77000-C --sz 0.001 --notionalCcy BTC
okx --profile live earn dcd buy --quoteId <quoteId>

# 订单管理
okx --profile live earn dcd orders
okx --profile live earn dcd orders --state live
okx --profile live earn dcd order --ordId <ordId>

# 提前赎回（预览 + 执行）
okx --profile live earn dcd redeem-quote --ordId <ordId>
okx --profile live earn dcd redeem-execute --ordId <ordId>
```

### MCP 启动

```bash
# 所有赚币子模块
okx-trade-mcp --modules earn

# 仅 DCD
okx-trade-mcp --modules earn.dcd
```

### 注意事项

- **链上赚币不支持模拟模式**：链上赚币操作涉及真实资金，不支持模拟/演示交易模式。
- **锁定期**：部分链上产品有锁定期，如需提前赎回请确认 `allowEarlyRedeem` 选项。
- **协议类型**：主要类型包括 `staking`（PoS 验证者质押）和 `defi`（DeFi 协议存款）。
- **双币赢不支持模拟模式**：申购和赎回均涉及真实资金，请务必使用实盘 API Key。
- **报价 TTL**：报价约 30 秒后过期，请求后需立即执行。
- **提前赎回两步流程**：先用 `redeem-quote` 预览，确认后用 `redeem-execute` 执行。预览报价在执行步骤前已过期，`redeem-execute` 会自动重新获取最新报价。
- **WRITE 操作遇到 504**：不要盲目重试。504 表示网关超时，但服务端可能已执行。请先用 `dcd orders` 确认订单是否已创建。
