# option module

Options trading tools. Requires API key with **Read + Trade** permissions.

## Tools

| Tool | R/W | Description |
|------|-----|-------------|
| `option_place_order` | ✏️ | Place an options order (buy/sell call or put) |
| `option_cancel_order` | ✏️ | Cancel an unfilled order |
| `option_batch_cancel` | ✏️ | Batch cancel up to 20 orders |
| `option_amend_order` | ✏️ | Amend price or size of an open order |
| `option_get_order` | 👁️ | Get details of a single order |
| `option_get_orders` | 👁️ | List pending or historical orders |
| `option_get_positions` | 👁️ | Current positions with Greeks |
| `option_get_fills` | 👁️ | Fill history |
| `option_get_instruments` | 👁️ | List available contracts (option chain) |
| `option_get_greeks` | 👁️ | IV and Greeks per contract (delta, gamma, theta, vega) |

## Instrument format

```
BTC-USD-241227-50000-C   ← BTC call, strike $50,000, expiry 2024-12-27
BTC-USD-241227-50000-P   ← BTC put, strike $50,000, expiry 2024-12-27
ETH-USD-250328-3000-C    ← ETH call, strike $3,000, expiry 2025-03-28
```

Use `option_get_instruments` with `uly=BTC-USD` to discover available contracts before placing orders.

## `tdMode` by role

| Role | `tdMode` |
|------|----------|
| Buyer (limited loss) | `cash` |
| Seller (margin required) | `cross` or `isolated` |

## Example prompts

- "What BTC options expiring in December are available?"
- "Buy 1 BTC call at $50,000 strike, expiry Dec 27, limit price $500"
- "Show my open option positions and their Greeks"
- "What is the implied volatility for BTC options expiring this week?"
- "Cancel all my pending option orders on BTC-USD-241227-50000-C"

---

# option 模块

期权交易工具。需要 API Key，开启 **读取 + 交易** 权限。

## 工具列表

| 工具 | 读写 | 说明 |
|------|------|------|
| `option_place_order` | ✏️ | 期权下单（买入/卖出 call 或 put） |
| `option_cancel_order` | ✏️ | 撤销挂单 |
| `option_batch_cancel` | ✏️ | 批量撤单（最多 20 条） |
| `option_amend_order` | ✏️ | 改价或改量 |
| `option_get_order` | 👁️ | 查询单笔订单详情 |
| `option_get_orders` | 👁️ | 查询挂单或历史订单 |
| `option_get_positions` | 👁️ | 当前持仓（含 Greeks） |
| `option_get_fills` | 👁️ | 成交记录 |
| `option_get_instruments` | 👁️ | 期权链（可用合约列表） |
| `option_get_greeks` | 👁️ | 每个合约的 IV + Greeks（delta、gamma、theta、vega） |

## 合约 ID 格式

```
BTC-USD-241227-50000-C   ← BTC 看涨期权，行权价 $50,000，2024-12-27 到期
BTC-USD-241227-50000-P   ← BTC 看跌期权，行权价 $50,000，2024-12-27 到期
ETH-USD-250328-3000-C    ← ETH 看涨期权，行权价 $3,000，2025-03-28 到期
```

下单前可用 `option_get_instruments`（传 `uly=BTC-USD`）查询可用合约。

## `tdMode` 说明

| 角色 | `tdMode` |
|------|----------|
| 期权买方（有限亏损） | `cash` |
| 期权卖方（需保证金） | `cross` 或 `isolated` |

## 示例提示词

- "查看 12 月到期的 BTC 期权有哪些"
- "以限价 $500 买入 1 张 BTC 行权价 $50,000 的 12 月 27 日到期看涨期权"
- "显示我当前的期权持仓及对应 Greeks"
- "本周到期的 BTC 期权隐含波动率是多少？"
- "撤销 BTC-USD-241227-50000-C 的所有挂单"
