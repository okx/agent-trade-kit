# smartmoney module

[English](#english) | [中文](#中文)

---

## English

Smart money analytics module — trader leaderboard, position tracking, and aggregated consensus signals. All tools are read-only.

### Tools

| Name | R/W | Description |
|---|---|---|
| smartmoney_get_overview | R | Multi-currency smart money overview with aggregated signals |
| smartmoney_get_signal | R | Single-currency aggregated consensus signal (long/short ratio, entry prices, capital flow) |
| smartmoney_get_signal_history | R | Signal history timeline for trend analysis and backtesting |
| smartmoney_get_traders | R | List/filter traders from the smart money leaderboard |
| smartmoney_get_trader_detail | R | Trader full portrait (profile + current positions + trade records) |

5 tools (all read-only)

### Token Budget Estimate

Estimated ~1,624 tokens (5 tools, 5,684 chars)

### Pool Filter Parameters

All signal/leaderboard tools accept shared pool filters as flat parameters:

| Parameter | Signal endpoints (overview, signal, signal-history) | Leaderboard endpoints |
|---|---|---|
| sortType | pnl, pnlRatio | pnl, pnl_ratio |
| period | 3, 7, 30, 90 (days) | "", 3, 7, 30, 90 (days) |
| pnl | Enum: PNL_ANY, PNL_TOP50, PNL_TOP20, PNL_TOP5 | Numeric: min USD |
| winRatio | Enum: WR_ANY, WR_GE_50, WR_GE_80 | Numeric: min ratio (0.8 = 80%) |
| maxRetreat | Enum: MR_ANY, MR_LE_20, MR_LE_50 | Numeric: max ratio (0.1 = 10%) |
| asset | Enum: AUM_ANY, AUM_TOP50, AUM_TOP20, AUM_TOP5 | Numeric: min USD |

### Typical Workflow

List traders → Drill into trader detail → Check signal overview → Deep-dive single currency signal → Analyze signal history

### Example Prompts

- "Show me the top smart money traders this month"
- "What positions does trader X currently hold?"
- "What's the smart money consensus on BTC?"
- "Show me how the BTC smart money signal changed over the last week"
- "Find traders with > 80% win rate and < 10% drawdown"

### CLI

```bash
okx smartmoney traders --period 30 --sortType pnl --limit 10 --json
okx smartmoney trader --authorId <id> --json
okx smartmoney overview --ts <ms> --json
okx smartmoney signal --ts <ms> --instId BTC-USDT-SWAP --json
okx smartmoney signal-history --instId BTC-USDT-SWAP --ts <ms> --granularity 1d --json
```

---

## 中文

聪明钱分析模块 — 交易员排行榜、持仓追踪和聚合共识信号。所有工具均为只读。

### 工具列表

| 名称 | 读/写 | 说明 |
|---|---|---|
| smartmoney_get_overview | 读 | 多币种聪明钱概览（聚合信号） |
| smartmoney_get_signal | 读 | 单币种聚合共识信号（多空比、入场价、资金流向） |
| smartmoney_get_signal_history | 读 | 信号历史时间线（趋势分析与回测） |
| smartmoney_get_traders | 读 | 交易员排行榜列表/筛选 |
| smartmoney_get_trader_detail | 读 | 交易员详情（画像 + 当前持仓 + 交易记录） |

共 5 个工具（全部只读）

### Token 预算估算

约 1,624 tokens（5 个工具，5,684 chars）

### 池过滤器参数

所有信号/排行榜工具共享扁平化的池过滤器参数：

| 参数 | Signal 端点（overview, signal, signal-history） | Leaderboard 端点 |
|---|---|---|
| sortType | pnl, pnlRatio | pnl, pnl_ratio |
| period | 3, 7, 30, 90（天） | "", 3, 7, 30, 90（天） |
| pnl | 枚举: PNL_ANY, PNL_TOP50, PNL_TOP20, PNL_TOP5 | 数值: 最低 PnL（USD） |
| winRatio | 枚举: WR_ANY, WR_GE_50, WR_GE_80 | 数值: 最低胜率（0.8 = 80%） |
| maxRetreat | 枚举: MR_ANY, MR_LE_20, MR_LE_50 | 数值: 最大回撤（0.1 = 10%） |
| asset | 枚举: AUM_ANY, AUM_TOP50, AUM_TOP20, AUM_TOP5 | 数值: 最低资产（USD） |

### 典型工作流

查看交易员排行 → 深入交易员详情 → 查看聪明钱总览 → 深入单币种信号 → 分析信号历史趋势

### 示例提示

- "推荐这个月 top 聪明钱交易员"
- "交易员 X 当前持仓是什么？"
- "BTC 的聪明钱共识信号如何？"
- "过去一周 BTC 聪明钱信号的变化趋势"
- "找胜率 > 80% 且回撤 < 10% 的交易员"

### CLI

```bash
okx smartmoney traders --period 30 --sortType pnl --limit 10 --json
okx smartmoney trader --authorId <id> --json
okx smartmoney overview --ts <ms> --json
okx smartmoney signal --ts <ms> --instId BTC-USDT-SWAP --json
okx smartmoney signal-history --instId BTC-USDT-SWAP --ts <ms> --granularity 1d --json
```
