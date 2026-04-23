# smartmoney module

[English](#english) | [中文](#中文)

---

## English

Smart money analytics module — trader leaderboard, position tracking, and aggregated consensus signals. All tools are read-only.

### Tools

| Name | R/W | Description |
|---|---|---|
| smartmoney_get_overview | R | Multi-currency overview ranked by `tradersWithPosition` DESC. Requires `ts` or `dataVersion` (ts wins). |
| smartmoney_get_signal | R | Single-currency consensus signal (long/short ratio, entry prices, capital flow). Requires `instId` or `instCcy` (instId wins), and `ts` or `dataVersion` (ts wins). |
| smartmoney_get_signal_history | R | Signal history timeline sorted by `ts` DESC. Requires `instId`, and `ts` or `dataVersion`. Default `granularity=1h`, `limit=24`. |
| smartmoney_get_traders | R | List/filter leaderboard traders. Uses **numeric thresholds** (USD / ratio) for pool filters, NOT the enum tiers used by signal/overview. |
| smartmoney_get_trader_detail | R | Trader full portrait: profile + current positions + trade records (composite, fires 3 parallel requests). Requires `authorId`. |

5 tools (all read-only)

### Token Budget Estimate

Estimated ~1,624 tokens (5 tools, 5,684 chars)

### Pool Filter Parameters

All signal/leaderboard tools accept shared pool filters as flat parameters:

| Parameter | Signal endpoints (overview, signal, signal-history) | Leaderboard endpoints |
|---|---|---|
| sortType | `pnl` / `pnlRatio` (camelCase) — pool ranking basis | `pnl` / `pnl_ratio` (snake_case) |
| period | `3` / `7` / `30` / `90` (days, default 90) — **win-rate window only**, not snapshot range | `""` / `3` / `7` / `30` / `90` (days, `""`=all) |
| pnl | Enum — percentile: `PNL_TOP20` = top **20 %** of traders, **not** top 20 traders | Numeric: min USD threshold |
| winRatio | Enum — threshold: `WR_GE_80` = keep win-rate **≥ 80 %** | Numeric: min ratio (0.8 = 80 %) |
| maxRetreat | Enum — threshold: `MR_LE_20` = keep drawdown **≤ 20 %** | Numeric: max ratio (0.1 = 10 %) |
| asset | Enum — percentile: `AUM_TOP20` = top **20 %** of traders by AUM | Numeric: min USD threshold |

> **Important for AI agents:** Signal and leaderboard endpoints share parameter **names** but use **different value types**. Passing `pnl=PNL_TOP50` to `smartmoney_get_traders` or `pnl=10000` to `smartmoney_get_signal` will not behave as expected — signal/overview enums silently fall back to `*_ANY` default on invalid input.

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
| smartmoney_get_overview | 读 | 多币种概览，按 `tradersWithPosition` DESC 排序。必须传 `ts` 或 `dataVersion`（ts 优先）。 |
| smartmoney_get_signal | 读 | 单币种聚合共识信号（多空比、入场价、资金流向）。必须传 `instId` 或 `instCcy`（instId 优先），以及 `ts` 或 `dataVersion`（ts 优先）。 |
| smartmoney_get_signal_history | 读 | 信号历史时间线，按 `ts` DESC 排序。必须传 `instId`，以及 `ts` 或 `dataVersion`。默认 `granularity=1h`、`limit=24`。 |
| smartmoney_get_traders | 读 | 交易员排行榜列表/筛选。池过滤器使用**数值阈值**（USD / 比率），**与 signal/overview 的枚举不同**。 |
| smartmoney_get_trader_detail | 读 | 交易员完整画像：档案 + 当前持仓 + 交易记录（复合接口，并发 3 个请求）。必须传 `authorId`。 |

共 5 个工具（全部只读）

### Token 预算估算

约 1,624 tokens（5 个工具，5,684 chars）

### 池过滤器参数

所有信号/排行榜工具共享扁平化的池过滤器参数：

| 参数 | Signal 端点（overview, signal, signal-history） | Leaderboard 端点 |
|---|---|---|
| sortType | `pnl` / `pnlRatio`（驼峰） — 交易员池排名依据 | `pnl` / `pnl_ratio`（下划线） |
| period | `3` / `7` / `30` / `90`（天，默认 90）— **仅**胜率计算窗口，**不**影响快照时间范围 | `""` / `3` / `7` / `30` / `90`（天，`""`=all） |
| pnl | 枚举 — 百分位：`PNL_TOP20` = PnL **前 20%** 交易员，**不是**前 20 个 | 数值：最低 PnL（USD） |
| winRatio | 枚举 — 阈值：`WR_GE_80` = 保留胜率 **≥ 80%** | 数值：最低胜率（0.8 = 80%） |
| maxRetreat | 枚举 — 阈值：`MR_LE_20` = 保留回撤 **≤ 20%** | 数值：最大回撤（0.1 = 10%） |
| asset | 枚举 — 百分位：`AUM_TOP20` = AUM **前 20%** 交易员 | 数值：最低资产（USD） |

> **AI agent 注意：** signal 和 leaderboard 端点**参数名相同但取值类型不同**。把 `pnl=PNL_TOP50` 传给 `smartmoney_get_traders`，或把 `pnl=10000` 传给 `smartmoney_get_signal`，都不会按预期工作 —— signal/overview 的枚举遇到非法值会**静默回退**到 `*_ANY` 默认。

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
