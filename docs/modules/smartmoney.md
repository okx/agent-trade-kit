# smartmoney module

[English](#english) | [中文](#中文)

---

## English

Smart money analytics module — leaderboard ranking, single-trader analytics (performance / current positions / closed-position history / order flow), and aggregated consensus signals (top-of-pool, multi-asset snapshot, single-asset time-series). All tools are read-only.

The 10-tool surface is split by **entry mode** so AI agents can pick the right tool from the name alone (`_by_filter` vs `_by_trader` vs `_top_*`), without inspecting parameters.

### Tools

| Name | R/W | Description |
|---|---|---|
| smartmoney_get_traders_by_filter | R | Leaderboard ranking by pool conditions (period / minPnl / minWinRate / maxDrawdown / minAum / sortBy). Paginated by `authorId` cursor. |
| smartmoney_get_performance_by_trader | R | PnL / win-rate profile for one or more `authorIds`. Required `sortBy` (`pnl` / `pnlRatio`) and `period` (`3` / `7` / `30` / `90`). Capability tier filters not exposed. |
| smartmoney_search_trader | R | Search Top Traders by nickname keyword (≤10 results, ranked by OKX-platform follower count). Used to resolve a name to `authorId`. |
| smartmoney_get_trader_positions | R | A trader's current open positions. Filter by `instId` (full instId like `BTC-USDT-SWAP` or bare base ccy like `BTC`; handler extracts base ccy for upstream). |
| smartmoney_get_trader_positions_history | R | A trader's closed-position history with realized PnL. Paginated by `posId` cursor. |
| smartmoney_get_trader_orders_history | R | A trader's order / fill records. Paginated by `ordId` cursor. |
| smartmoney_get_signal_overview_by_filter | R | Multi-asset consensus signal restricted by **pool filter** (sortBy / pnlTier / winRateTier / maxDrawdownTier / aumTier). Pick coins via `topInstruments` (top-N hottest) **or** `instCcyList` (specific coins). Snapshot is current hour. Subsumes the former "top-N most-watched" use case. |
| smartmoney_get_signal_overview_by_trader | R | Multi-asset consensus signal restricted to a **specific list of `authorIds`**. Pick coins via `topInstruments` **or** `instCcyList`. Required `sortBy` + `period` (drive capability metrics). Capability tier filters not exposed. Snapshot is current hour. |
| smartmoney_get_signal_trend_by_filter | R | Single-coin signal time-series — required `instCcy`, anchored at `asOfTime` (10-digit `yyyyMMddHH` UTC; defaults to current hour), filtered by pool conditions. Granularity `1h` / `1d`. |
| smartmoney_get_signal_trend_by_trader | R | Single-coin signal time-series — required `instCcy` + `authorIds` + `granularity` + `sortBy` + `period`, anchored at `asOfTime`. Capability tier filters not exposed (authorIds-direct-lookup; backend tier defaults apply). |

10 tools, all read-only.

### Naming family

```
Trader family (6)
─────────────────────────────────────────────────
smartmoney_get_traders_by_filter         ← pool filter + rank
smartmoney_get_performance_by_trader     ← authorIds direct lookup
smartmoney_search_trader                 ← nickname → authorId resolver
smartmoney_get_trader_positions          ← current positions
smartmoney_get_trader_positions_history  ← closed-position history
smartmoney_get_trader_orders_history     ← order flow

Signal / Coin family (4)
─────────────────────────────────────────────────
smartmoney_get_signal_overview_by_filter ← multi-asset, pool filter (top-N or instCcyList)
smartmoney_get_signal_overview_by_trader ← multi-asset, authorIds
smartmoney_get_signal_trend_by_filter    ← single-asset time-series, pool filter
smartmoney_get_signal_trend_by_trader    ← single-asset time-series, authorIds
```

### Pagination

Cursor pagination is exposed on three list tools as a top-level `pagination: { hasMore, nextAfter }` object. `nextAfter` carries the last item's cursor field; pass it as the next call's `--after` flag when `hasMore=true`:

| Tool | Cursor field |
|---|---|
| `smartmoney_get_traders_by_filter` | `authorId` |
| `smartmoney_get_trader_orders_history` | `ordId` |
| `smartmoney_get_trader_positions_history` | `posId` |

### Pool filter parameters

Two **disjoint** parameter conventions, separated by endpoint family:

**Signal family** (signal_overview_by_filter / signal_trend_by_filter) — enum tier filters:

| Param | Enum values | Default | Meaning |
|---|---|---|---|
| `sortBy` | `pnl` / `pnlRatio` | `pnl` | Pool ranking key |
| `pnlTier` | `PNL_ANY` / `PNL_TOP50` / `PNL_TOP20` / `PNL_TOP5` | `PNL_ANY` | PnL percentile (top N% of pool) |
| `winRateTier` | `WR_ANY` / `WR_GE_50` / `WR_GE_80` | `WR_ANY` | Career win-rate threshold (≥ N%, absolute) |
| `period` | `3` / `7` / `30` / `90` | `7` | Lookback window (days) for capability metrics |
| `maxDrawdownTier` | `MR_ANY` / `MR_LE_20` / `MR_LE_50` | `MR_ANY` | Drawdown threshold (≤ N%, absolute) |
| `aumTier` | `AUM_ANY` / `AUM_TOP50` / `AUM_TOP20` / `AUM_TOP5` | `AUM_ANY` | AUM percentile (top N% of pool) |

> **Tier naming convention**: `TOP{N}` = percentile (top N% of pool — used by `pnlTier` / `aumTier`, since both distributions are long-tailed); `GE_{N}` = absolute threshold ≥ N% (`winRateTier`); `LE_{N}` = absolute threshold ≤ N% (`maxDrawdownTier`). Empirically verified at `lmtNum=100`: `WR_GE_50` keeps ~95 traders (career win-rate ≥ 50%), `MR_LE_20` keeps ~9 (drawdown ≤ 20%), `PNL_TOP20` keeps exactly 20.

**Leaderboard family** (top_traders) — numeric thresholds in raw units:

| Param | Type | Meaning |
|---|---|---|
| `sortBy` | enum (`pnl` / `pnlRatio`) | Sort key |
| `period` | `3` / `7` / `30` / `90` | Day window (default `90`, matches leaderboard UI) |
| `minPnl` | string (USD) | Min absolute PnL |
| `minWinRate` | string (decimal, `0.8` = 80%) | Min win-rate |
| `maxDrawdown` | string (decimal) | Max drawdown |
| `minAum` | string (USD) | Min AUM |

> **Param namespace**: leaderboard pool filters use `min*` / `max*` prefixes — disjoint from signal-side `*Tier` enum names (`pnlTier` / `winRateTier` / etc.) so AI agents cannot accidentally cross-pollinate values. Handler renames `minPnl` → upstream `pnl`, `minWinRate` → `winRate`, `minAum` → `asset` (`maxDrawdown` is identity).
> **Renamed from previous version**: input `pnl` → `minPnl`, `winRate` → `minWinRate`, `asset` → `minAum`. Returned-field `winRatio` → `winRate`, `maxRetreat` → `maxDrawdown`. See CHANGELOG `## [Unreleased]` for the full migration table.

### Time anchors

- **Input on overview tools** (`signal_overview_by_filter`, `signal_overview_by_trader`): no time input — handler always uses the current hour.
- **Input on trend tools** (`signal_trend_by_filter`, `signal_trend_by_trader`): optional `asOfTime` anchor (10-digit `yyyyMMddHH` UTC, e.g. `2026050100`); omit to use the current UTC hour. `limit` controls how many buckets are returned ending at the anchor.
- **Trader leaderboard input**: `updateTime` (snapshot key in `yyyyMMddHHmm` UTC+8). Omit for the latest snapshot.
- **Output**: response envelope carries `dataVersion` — for trend tools (signal-history), this is `yyyyMMddHH` (10 digits); for overview/leaderboard it remains `yyyyMMddHHmm`.

### Notional pricing

All `notional.*` fields (`longNotionalUsdt` / `shortNotionalUsdt` / `netNotionalUsdt` / `totalNotionalUsdt`) and `weightedLongRatio` / `weightedShortRatio` are weighted by each trader's **entry price (`price_avg`)**, NOT mark price. Backend formula: `notionalFactor = ABS(pos_qty) * COALESCE(contract_val, 1) * COALESCE(price_avg, 0)` — SelectDB does not store mark price.

Implications for AI agents:

- These values move only when positions are scaled (open / close / add) — they stay constant across hourly buckets when traders hold positions unchanged.
- A flat trend across buckets means smart money held steady; it does NOT mean underlying price was flat.
- For real-time price comparison, fetch market price (`okx market ticker` / `okx market candles`) in parallel and compare against `notional.smartMoneyLongAvgEntry` / `smartMoneyShortAvgEntry`.

### Composite tool removed

The legacy `smartmoney_get_trader_detail` (3-API composite) is removed. To get a trader's full picture, fire `performance-by-trader`, `trader-positions`, and `trader-orders-history` in parallel — finer rate-limit control and explicit per-slice pagination.

### Multi-coin selection on overview tools

`signal_overview_by_filter` and `signal_overview_by_trader` accept `topInstruments` (top-N hottest) **or** `instCcyList` (e.g. `BTC,ETH,SOL`) — exactly one (default `topInstruments=20`). Backed by upstream `/overview` accepting `instCcyList` (re-introduced 2026-04-30 per design reversal).

### Typical workflow

Find traders → drill into one (parallel: performance + positions + order history) → check single-coin signal → review signal trend over time

### Example prompts

- "Show me the top smart money traders this month"
- "What positions does trader X currently hold?"
- "What's the smart money consensus on BTC right now?"
- "Show me how the BTC smart money signal changed over the last week"
- "Find traders with > 80% win rate and < 10% drawdown"

### CLI

```bash
# Trader family
okx smartmoney traders-by-filter --period 30 --sortBy pnl --limit 10 --json
okx smartmoney performance-by-trader --authorIds <id1>,<id2> --period 30 --json
okx smartmoney trader-positions --authorId <id> --json
okx smartmoney trader-positions-history --authorId <id> --limit 50 --json
okx smartmoney trader-orders-history --authorId <id> --instId BTC-USDT-SWAP --limit 50 --json

# Signal / coin family
okx smartmoney signal-overview-by-filter --topInstruments 20 --json     # top-N hottest
okx smartmoney signal-overview-by-filter --instCcyList BTC --pnlTier PNL_TOP20 --json
okx smartmoney signal-overview-by-trader --authorIds <id1>,<id2> --instCcyList BTC,ETH --json
okx smartmoney signal-trend-by-filter --instCcy BTC [--asOfTime 2026050100] --granularity 1d --limit 30 --json
okx smartmoney signal-trend-by-trader --authorIds <id1>,<id2> --instCcy BTC [--asOfTime 2026050100] --json
```

---

## 中文

聪明钱分析模块 —— 排行榜筛选、单交易员分析（业绩 / 当前持仓 / 历史平仓 / 订单流）、聚合共识信号（热门币种、多币当前快照、单币时间序列）。所有工具均为只读。

10 个工具按**入口维度**拆分（`_by_filter` / `_by_trader`），让 AI agent 不必看参数就能从工具名选对。

### 工具列表

| 名称 | 读/写 | 说明 |
|---|---|---|
| smartmoney_get_traders_by_filter | 读 | 按池筛选条件（period / minPnl / minWinRate / maxDrawdown / minAum / sortBy）排行榜。`authorId` 游标分页。 |
| smartmoney_get_performance_by_trader | 读 | 一个或多个 `authorIds` 的 PnL / 胜率画像（不接池过滤器）。 |
| smartmoney_search_trader | 读 | 按昵称关键词搜索 Top Trader（≤10 条，按 OKX 平台粉丝数倒序）。用于将昵称解析成 `authorId`。 |
| smartmoney_get_trader_positions | 读 | 单个交易员的当前持仓。可按 `instId` 过滤（接受完整 instId 如 `BTC-USDT-SWAP` 或 base ccy 如 `BTC`，handler 内部提取 base 转发上游）。 |
| smartmoney_get_trader_positions_history | 读 | 单个交易员的历史平仓（含已实现盈亏）。`posId` 游标分页。 |
| smartmoney_get_trader_orders_history | 读 | 单个交易员的订单 / 成交流水。`ordId` 游标分页。 |
| smartmoney_get_signal_overview_by_filter | 读 | 多币聚合共识信号，按**池过滤器**（sortBy / pnlTier / winRateTier / maxDrawdownTier / aumTier）筛选。币种选择 `topInstruments`（最热 N 个）或 `instCcyList`（指定币种）。快照取当前小时。覆盖原"Top-N 最热"场景。 |
| smartmoney_get_signal_overview_by_trader | 读 | 多币聚合共识信号，限定到指定 **`authorIds`**（不接池过滤器）。币种选择 `topInstruments` 或 `instCcyList`。快照取当前小时。 |
| smartmoney_get_signal_trend_by_filter | 读 | 单币信号时间序列，**必传 `instCcy`**，锚定 `asOfTime`（10 位 `yyyyMMddHH` UTC，默认当前整点）按池过滤器聚合。`granularity` 支持 `1h` / `1d`。 |
| smartmoney_get_signal_trend_by_trader | 读 | 单币信号时间序列，**必传 `instCcy` + `authorIds`**，锚定 `asOfTime`。**不暴露池过滤器入参**（authorIds 直查场景,后端使用默认池配置）。 |

共 10 个工具（全部只读）。

### 命名家族

```
Trader 家族（6 个）
─────────────────────────────────────────────────
smartmoney_get_traders_by_filter         ← 池过滤 + 排序
smartmoney_get_performance_by_trader     ← authorIds 直查
smartmoney_search_trader                 ← 昵称 → authorId 解析
smartmoney_get_trader_positions          ← 当前持仓
smartmoney_get_trader_positions_history  ← 历史平仓
smartmoney_get_trader_orders_history     ← 订单流水

Signal / Coin 家族（4 个）
─────────────────────────────────────────────────
smartmoney_get_signal_overview_by_filter ← 多币当前快照、池过滤（top-N 或 instCcyList）
smartmoney_get_signal_overview_by_trader ← 多币当前快照、authorIds 限定
smartmoney_get_signal_trend_by_filter    ← 单币时间序列、池过滤
smartmoney_get_signal_trend_by_trader    ← 单币时间序列、authorIds
```

### 分页

3 个列表工具在响应顶层返回 `pagination: { hasMore, nextAfter }`。`nextAfter` 是最后一条的游标字段，当 `hasMore=true` 时把它作为下一次调用的 `--after` 游标传入：

| 工具 | 游标字段 |
|---|---|
| `smartmoney_get_traders_by_filter` | `authorId` |
| `smartmoney_get_trader_orders_history` | `ordId` |
| `smartmoney_get_trader_positions_history` | `posId` |

### 池过滤器参数

两套**互不重叠**的命名约定，按家族区分：

**Signal 家族**（signal_overview_by_filter / signal_trend_by_filter）—— 枚举档位：

| 参数 | 枚举值 | 默认 | 含义 |
|---|---|---|---|
| `sortBy` | `pnl` / `pnlRatio` | `pnl` | 池排序键 |
| `pnlTier` | `PNL_ANY` / `PNL_TOP50` / `PNL_TOP20` / `PNL_TOP5` | `PNL_ANY` | PnL 百分位（池前 N%） |
| `winRateTier` | `WR_ANY` / `WR_GE_50` / `WR_GE_80` | `WR_ANY` | 职业生涯胜率阈值（≥ N%，绝对值） |
| `period` | `3` / `7` / `30` / `90` | `7` | 能力指标回望窗口（天） |
| `maxDrawdownTier` | `MR_ANY` / `MR_LE_20` / `MR_LE_50` | `MR_ANY` | 回撤阈值（≤ N%，绝对值） |
| `aumTier` | `AUM_ANY` / `AUM_TOP50` / `AUM_TOP20` / `AUM_TOP5` | `AUM_ANY` | AUM 百分位（池前 N%） |

> **Tier 命名约定**：`TOP{N}` = 百分位（池前 N%，用于 `pnlTier` / `aumTier`，因为这两个分布都是长尾的）；`GE_{N}` = 绝对阈值 ≥ N%（`winRateTier`）；`LE_{N}` = 绝对阈值 ≤ N%（`maxDrawdownTier`）。`lmtNum=100` 实测：`WR_GE_50` 入池 ~95 人（生涯胜率 ≥ 50%），`MR_LE_20` 入池 ~9 人（回撤 ≤ 20%），`PNL_TOP20` 恰好 20 人。

**Leaderboard 家族**（top_traders）—— 数值阈值：

| 参数 | 类型 | 含义 |
|---|---|---|
| `sortBy` | 枚举（`pnl` / `pnlRatio`） | 排序键 |
| `period` | `3` / `7` / `30` / `90` | 天数窗口（默认 `90`，与 leaderboard UI 对齐） |
| `minPnl` | string (USD) | 最低 PnL |
| `minWinRate` | string（小数，`0.8` = 80%） | 最低胜率 |
| `maxDrawdown` | string（小数） | 最大回撤 |
| `minAum` | string (USD) | 最低 AUM |

> **参数命名**:leaderboard 池过滤器统一用 `min*` / `max*` 前缀,与 signal 家族 `*Tier` 枚举命名空间互斥,避免 AI 跨工具误传。Handler 内部映射 `minPnl` → 上游 `pnl`,`minWinRate` → `winRate`,`minAum` → `asset`(`maxDrawdown` 同名)。
> **本次重命名**:入参 `pnl` → `minPnl`、`winRate` → `minWinRate`、`asset` → `minAum`。返回字段 `winRatio` → `winRate`、`maxRetreat` → `maxDrawdown`。完整迁移见 CHANGELOG `## [Unreleased]`。

### 时间锚

- **Overview 工具入参**（`signal_overview_by_filter` / `signal_overview_by_trader`）：不暴露任何时间入参——handler 始终取当前小时。
- **Trend 工具入参**（`signal_trend_by_filter` / `signal_trend_by_trader`）：可选 `asOfTime`（10 位 `yyyyMMddHH` UTC 锚点，缺省 = 当前整点）。`limit` 控制返回多少根 K（截止该锚点向前）。
- **Trader 排行榜入参**：`updateTime`（`yyyyMMddHHmm` UTC+8 快照键）。省略 = 最新快照。
- **出参**：trend 工具（signal-history）返回 `dataVersion` 为 `yyyyMMddHH`（10 位）；overview / 排行榜仍为 `yyyyMMddHHmm`。

### Notional 加权口径

所有 `notional.*` 字段（`longNotionalUsdt` / `shortNotionalUsdt` / `netNotionalUsdt` / `totalNotionalUsdt`）和 `weightedLongRatio` / `weightedShortRatio` 均**按交易员入场均价（`price_avg`）加权**，不使用标记价格。后端公式：`notionalFactor = ABS(pos_qty) * COALESCE(contract_val, 1) * COALESCE(price_avg, 0)`——SelectDB 库内不存储 mark price。

对 AI agent 的影响：

- 仅在加仓 / 减仓 / 平仓时变化，与标的实时价格无关——交易员持仓不动则该值在小时桶间恒定。
- 跨桶平稳 = 聪明钱按兵不动，**不代表标的价格平稳**。
- 需要实时价格对比时，并发拉取 `okx market ticker` / `okx market candles`，与 `notional.smartMoneyLongAvgEntry` / `smartMoneyShortAvgEntry` 比对。

### 复合工具已删除

旧的 `smartmoney_get_trader_detail`（3 接口聚合）已删除。要看交易员全貌，把 `performance-by-trader` / `trader-positions` / `trader-orders-history` 并发调用即可——速率限制控制更细，每个分片可独立分页。

### 多币种 overview 选择

`signal_overview_by_filter` / `signal_overview_by_trader` 接受 `topInstruments`（最热 N 个）或 `instCcyList`（如 `BTC,ETH,SOL`），二者**互斥且二选一**（默认 `topInstruments=20`）。依赖上游 `/overview` 接受 `instCcyList`（2026-04-30 设计回滚再次引入）。

### 典型工作流

排行 → 单交易员深入（并发：performance + positions + order history） → 单币信号 → 信号时间趋势

### 示例提示

- "推荐这个月 top 聪明钱交易员"
- "交易员 X 当前持仓是什么？"
- "BTC 当前的聪明钱共识如何？"
- "过去一周 BTC 聪明钱信号的变化趋势"
- "找胜率 > 80% 且回撤 < 10% 的交易员"

### CLI

```bash
# Trader 家族
okx smartmoney traders-by-filter --period 30 --sortBy pnl --limit 10 --json
okx smartmoney performance-by-trader --authorIds <id1>,<id2> --period 30 --json
okx smartmoney trader-positions --authorId <id> --json
okx smartmoney trader-positions-history --authorId <id> --limit 50 --json
okx smartmoney trader-orders-history --authorId <id> --instId BTC-USDT-SWAP --limit 50 --json

# Signal / coin 家族
okx smartmoney signal-overview-by-filter --topInstruments 20 --json     # Top-N 最热（覆盖原 top-coin-signals）
okx smartmoney signal-overview-by-filter --instCcyList BTC --pnlTier PNL_TOP20 --json
okx smartmoney signal-overview-by-trader --authorIds <id1>,<id2> --instCcyList BTC,ETH --json
okx smartmoney signal-trend-by-filter --instCcy BTC [--asOfTime 2026050100] --granularity 1d --limit 30 --json
okx smartmoney signal-trend-by-trader --authorIds <id1>,<id2> --instCcy BTC [--asOfTime 2026050100] --json
```
