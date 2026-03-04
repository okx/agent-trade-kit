# account module

Account management tools. Requires API key with **Read** permission (Trade for write operations).

## Tools

| Tool | Description |
|------|-------------|
| `account_get_balance` | Trading account balance (by currency or all) |
| `account_get_asset_balance` | Funding account balance |
| `account_get_positions` | Current open positions across all instruments |
| `account_get_positions_history` | Historical position records |
| `account_get_bills` | Account bills / ledger (last 7 days) |
| `account_get_bills_archive` | Bills older than 7 days (up to 3 months) |
| `account_get_fee_rates` | Trading fee rates for instrument type |
| `account_get_config` | Account configuration (position mode, account level, etc.) |
| `account_set_position_mode` | Switch between net mode and long/short mode |
| `account_get_max_size` | Maximum order size for an instrument |
| `account_get_max_withdrawal` | Maximum withdrawable amount per currency |
| `account_get_leverage` | Get leverage for an instrument |
| `account_set_leverage` | Set leverage (general, across instruments) |
| `account_get_audit_log` | Query local audit log of tool calls |

## Example prompts

- "What is my account balance?"
- "Show my BTC and ETH balances"
- "What positions am I currently holding?"
- "Show my account bills for today"
- "What are my fee rates for spot trading?"
- "What is the maximum size I can open on BTC-USDT-SWAP with cross margin?"
- "Switch to long/short position mode"

## CLI

```bash
# Balance
okx account balance
okx account balance BTC,ETH
okx account asset-balance

# Positions
okx account positions
okx account positions-history

# Bills
okx account bills
okx account bills --archive          # older than 7 days, up to 3 months

# Account info
okx account fees --instType SPOT
okx account config
okx account max-size --instId BTC-USDT-SWAP --tdMode cross
okx account max-withdrawal

# Settings
okx account set-position-mode --posMode net_mode
```

---

# account 模块

账户管理工具。需要 API Key，读取操作需 **读取** 权限，写入操作需额外 **交易** 权限。

## 工具列表

| 工具 | 说明 |
|------|------|
| `account_get_balance` | 交易账户余额（指定币种或全部） |
| `account_get_asset_balance` | 资金账户余额 |
| `account_get_positions` | 当前所有持仓 |
| `account_get_positions_history` | 历史持仓记录 |
| `account_get_bills` | 账单流水（7天内） |
| `account_get_bills_archive` | 账单流水（7天前，最多3个月） |
| `account_get_fee_rates` | 交易手续费率 |
| `account_get_config` | 账户配置（仓位模式、账户层级等） |
| `account_set_position_mode` | 切换单向/双向持仓模式 |
| `account_get_max_size` | 指定合约的最大可开仓量 |
| `account_get_max_withdrawal` | 各币种最大可提余额 |
| `account_get_leverage` | 查询杠杆设置 |
| `account_set_leverage` | 设置杠杆（全局） |
| `account_get_audit_log` | 查询本地工具调用审计日志 |

## 示例提示词

- "查看我的账户余额"
- "显示我的 BTC 和 ETH 余额"
- "我当前有哪些持仓？"
- "显示今日账单流水"
- "我的现货交易手续费率是多少？"
- "BTC-USDT-SWAP 全仓模式下最大可开多少张？"
- "切换到双向持仓模式"

## CLI

```bash
# 余额
okx account balance
okx account balance BTC,ETH
okx account asset-balance

# 持仓
okx account positions
okx account positions-history

# 账单
okx account bills
okx account bills --archive          # 7天前，最多3个月

# 账户信息
okx account fees --instType SPOT
okx account config
okx account max-size --instId BTC-USDT-SWAP --tdMode cross
okx account max-withdrawal

# 设置
okx account set-position-mode --posMode net_mode
```
