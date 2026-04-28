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
| smartmoney_get_traders | R | List/filter leaderboard traders. Uses **numeric thresholds** (USD / ratio) for pool filters, NOT the enum tiers used by signal/overview. Paginated. |
| smartmoney_get_trader_positions | R | Trader's current open positions. Atomic; requires `authorId`. |
| smartmoney_get_trader_trades | R | Trader's recent order/fill records. Atomic, paginated by `ordId`; requires `authorId`. |
| smartmoney_get_trader_position_history | R | Trader's closed-position history. Atomic, paginated by `posId`; requires `authorId`. |
| smartmoney_get_trader_detail | R | Trader full portrait: profile + current positions + trade records. **Composite convenience** (fires 3 parallel requests). For finer control, use the 3 atomic tools above. Requires `authorId`. |

8 tools (all read-only)

### Token Budget Estimate

Estimated ~4,713 tokens (8 tools, ~18,850 chars). Increase from the original ~1,624 (5 tools, no outputSchema) reflects: (a) `outputSchema` on every tool so agents can introspect response shape without exploratory calls; (b) 3 new atomic trader endpoints (positions / trades / position-history) added for "comprehensive API coverage" per mcp-builder principle.

### Pagination

Cursor pagination is exposed on three list tools as a top-level `pagination: { hasMore, nextAfter }` object. `nextAfter` carries the last item's cursor field; pass it as the next call's `--after` flag when `hasMore=true`:

| Tool | Cursor field |
|---|---|
| `smartmoney_get_traders` | `authorId` |
| `smartmoney_get_trader_trades` | `ordId` |
| `smartmoney_get_trader_position_history` | `posId` |

### Pool Filter Parameters

Signal and leaderboard endpoints expose **disjoint** parameter names so callers can't confuse enum tiers with raw thresholds:

| Signal endpoints (overview, signal, signal-history) | Leaderboard endpoint (traders) | Notes |
|---|---|---|
| `sortBy` — `pnl` / `pnlRatio` (camelCase) | `sortType` — `pnl` / `pnl_ratio` (snake_case) | Pool ranking key |
| `period` — `3` / `7` / `30` / `90` (days, default 90); win-rate window only | `period` — `""` / `3` / `7` / `30` / `90` (`""` = all-time) | Shared name |
| `pnlTier` — enum percentile, e.g. `PNL_TOP20` = top 20% of pool by PnL | `pnl` — numeric min PnL (USD) | Tier vs threshold |
| `winRateTier` — enum threshold, e.g. `WR_GE_80` = win-rate ≥ 80% | `winRatio` — numeric min ratio (0.8 = 80%) | |
| `maxDrawdownTier` — enum threshold, e.g. `MR_LE_20` = drawdown ≤ 20% | `maxRetreat` — numeric max ratio (0.1 = 10%) | |
| `aumTier` — enum percentile, e.g. `AUM_TOP20` = top 20% of pool by AUM | `asset` — numeric min AUM (USD) | |

> **Note for AI agents:** signal-side names carry a `Tier` suffix (or use industry terms `aum`/`maxDrawdown`) so they don't collide with response fields like `pnl` / `winRatio`. The upstream API still uses the leaderboard names; the MCP/CLI layer maps signal-side public names back internally.

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
okx smartmoney positions --authorId <id> --json
okx smartmoney trades --authorId <id> --limit 20 --json
okx smartmoney position-history --authorId <id> --limit 20 --json
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
| smartmoney_get_traders | 读 | 交易员排行榜列表/筛选。池过滤器使用**数值阈值**（USD / 比率），**与 signal/overview 的枚举不同**。支持分页。 |
| smartmoney_get_trader_positions | 读 | 单个交易员当前开仓。原子工具；必须传 `authorId`。 |
| smartmoney_get_trader_trades | 读 | 单个交易员近期成交记录。原子工具，按 `ordId` 游标分页；必须传 `authorId`。 |
| smartmoney_get_trader_position_history | 读 | 单个交易员历史平仓。原子工具，按 `posId` 游标分页；必须传 `authorId`。 |
| smartmoney_get_trader_detail | 读 | 交易员完整画像：档案 + 当前持仓 + 交易记录。**复合便捷工具**（并发 3 个请求）；需要更细粒度访问时用上面 3 个原子工具。必须传 `authorId`。 |

共 8 个工具（全部只读）

### Token 预算估算

约 4,713 tokens（8 个工具，~18,850 chars）。相比最初的 ~1,624（5 个工具、无 outputSchema），增长来自：(a) 每个工具都加了 `outputSchema`，agent 不必试探即可知道返回字段；(b) 新增 3 个原子工具（positions / trades / position-history），实现 mcp-builder 推崇的"comprehensive API coverage"。

### 分页

3 个列表工具在响应顶层返回 `pagination: { hasMore, nextAfter }`。`nextAfter` 是最后一条的游标字段；当 `hasMore=true` 时把它作为下一次调用的 `--after` 游标传入：

| 工具 | 游标字段 |
|---|---|
| `smartmoney_get_traders` | `authorId` |
| `smartmoney_get_trader_trades` | `ordId` |
| `smartmoney_get_trader_position_history` | `posId` |

### 池过滤器参数

Signal 与 Leaderboard 端点的池过滤器参数名**故意拆开**，避免 AI 把枚举档位和数值阈值混淆：

| Signal 端点（overview, signal, signal-history） | Leaderboard 端点（traders） | 说明 |
|---|---|---|
| `sortBy` — `pnl` / `pnlRatio`（驼峰） | `sortType` — `pnl` / `pnl_ratio`（下划线） | 池排名依据 |
| `period` — `3` / `7` / `30` / `90`（天，默认 90，仅胜率计算窗口） | `period` — `""` / `3` / `7` / `30` / `90`（`""` = all-time） | 同名 |
| `pnlTier` — 百分位枚举，例如 `PNL_TOP20` = PnL 前 20% 交易员 | `pnl` — 最低 PnL（USD） | 档位 vs 阈值 |
| `winRateTier` — 阈值枚举，例如 `WR_GE_80` = 胜率 ≥ 80% | `winRatio` — 最低胜率（0.8 = 80%） | |
| `maxDrawdownTier` — 阈值枚举，例如 `MR_LE_20` = 回撤 ≤ 20% | `maxRetreat` — 最大回撤（0.1 = 10%） | |
| `aumTier` — 百分位枚举，例如 `AUM_TOP20` = AUM 前 20% 交易员 | `asset` — 最低 AUM（USD） | |

> **AI agent 注意：** Signal 端的入参带 `Tier` 后缀（或用行业通用词 `aum` / `maxDrawdown`），与返回字段（`pnl` / `winRatio`）完全错开。上游 API 仍使用 Leaderboard 那一列的字段名，MCP/CLI 层会做映射。

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
okx smartmoney positions --authorId <id> --json
okx smartmoney trades --authorId <id> --limit 20 --json
okx smartmoney position-history --authorId <id> --limit 20 --json
okx smartmoney overview --ts <ms> --json
okx smartmoney signal --ts <ms> --instId BTC-USDT-SWAP --json
okx smartmoney signal-history --instId BTC-USDT-SWAP --ts <ms> --granularity 1d --json
```
