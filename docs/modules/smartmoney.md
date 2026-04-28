# smartmoney module

[English](#english) | [中文](#中文)

---

## English

Smart money analytics module — leaderboard ranking, single-trader analytics (performance / current positions / closed-position history / order flow), and aggregated consensus signals (top-of-pool, single-asset, single-asset time-series). All tools are read-only.

The 10-tool surface is split by **entry mode** so AI agents can pick the right tool from the name alone (`_by_coin` vs `_by_traders` vs `_top_*`), without inspecting parameters.

### Tools

| Name | R/W | Description |
|---|---|---|
| smartmoney_get_top_traders | R | Leaderboard ranking by pool conditions (period / pnl / winRate / maxDrawdown / asset / sortBy). Paginated by `authorId` cursor. |
| smartmoney_get_trader_performance | R | PnL / win-rate profile for one or more `authorIds` (no pool filter). |
| smartmoney_get_trader_positions | R | A trader's current open positions. Filter by `instCcy` (base currency, e.g. `BTC`). |
| smartmoney_get_trader_position_history | R | A trader's closed-position history with realized PnL. Paginated by `posId` cursor. |
| smartmoney_get_trader_order_history | R | A trader's order / fill records. Paginated by `ordId` cursor. |
| smartmoney_get_top_coin_signals | R | Top-N most-watched-by-smart-money instruments (SWAP-only) at a given snapshot. Single ranked snapshot of the busiest tickers. |
| smartmoney_get_signal_by_coin | R | Single-asset consensus signal restricted by **pool filter** (sortBy / pnlTier / winRateTier / maxDrawdownTier / aumTier). `ts` is auto-filled to the current hour. |
| smartmoney_get_signal_by_traders | R | Single-asset consensus signal restricted to a **specific list of `authorIds`** (no pool filter). `ts` is auto-filled to the current hour. |
| smartmoney_get_signal_history_by_coin | R | Single-asset signal time-series filtered by pool conditions. Anchored by `ts`; granularity `1h` / `1d`. |
| smartmoney_get_signal_history_by_traders | R | Single-asset signal time-series restricted to specific `authorIds`. Anchored by `ts`. |

10 tools, all read-only.

### Naming family

```
Trader family (5)
─────────────────────────────────────────────────
smartmoney_get_top_traders               ← pool filter + rank
smartmoney_get_trader_performance        ← authorIds direct lookup
smartmoney_get_trader_positions          ← current positions
smartmoney_get_trader_position_history   ← closed-position history
smartmoney_get_trader_order_history      ← order flow

Signal / Coin family (5)
─────────────────────────────────────────────────
smartmoney_get_top_coin_signals          ← top-N most-watched (SWAP-only)
smartmoney_get_signal_by_coin            ← single-asset, pool filter
smartmoney_get_signal_by_traders         ← single-asset, authorIds
smartmoney_get_signal_history_by_coin    ← single-asset time-series, pool filter
smartmoney_get_signal_history_by_traders ← single-asset time-series, authorIds
```

### Pagination

Cursor pagination is exposed on three list tools as a top-level `pagination: { hasMore, nextAfter }` object. `nextAfter` carries the last item's cursor field; pass it as the next call's `--after` flag when `hasMore=true`:

| Tool | Cursor field |
|---|---|
| `smartmoney_get_top_traders` | `authorId` |
| `smartmoney_get_trader_order_history` | `ordId` |
| `smartmoney_get_trader_position_history` | `posId` |

### Pool filter parameters

Two **disjoint** parameter conventions, separated by endpoint family:

**Signal family** (top_coin_signals / signal_by_coin / signal_history_by_coin) — enum tier filters:

| Param | Enum values | Default | Meaning |
|---|---|---|---|
| `sortBy` | `pnl` / `pnlRatio` | `pnl` | Pool ranking key |
| `pnlTier` | `PNL_ANY` / `PNL_TOP50` / `PNL_TOP20` / `PNL_TOP5` | `PNL_ANY` | PnL percentile (top N% of pool) |
| `winRateTier` | `WR_ANY` / `WR_GE_50` / `WR_GE_80` | `WR_ANY` | Win-rate threshold (≥ N%) |
| `maxDrawdownTier` | `MD_ANY` / `MD_LE_20` / `MD_LE_50` | `MD_ANY` | Drawdown threshold (≤ N%) |
| `aumTier` | `AUM_ANY` / `AUM_TOP50` / `AUM_TOP20` / `AUM_TOP5` | `AUM_ANY` | AUM percentile |

**Leaderboard family** (top_traders) — numeric thresholds in raw units:

| Param | Type | Meaning |
|---|---|---|
| `sortBy` | enum (`pnl` / `pnlRatio`) | Sort key |
| `period` | `3` / `7` / `30` / `90` | Day window (optional, all-time when omitted) |
| `pnl` | string (USD) | Min absolute PnL |
| `winRate` | string (decimal, `0.8` = 80%) | Min win-rate |
| `maxDrawdown` | string (decimal) | Max drawdown |
| `asset` | string (USD) | Min AUM |

> **Renamed from previous version**: returned-field `winRatio` → `winRate`, `maxRetreat` → `maxDrawdown`. See CHANGELOG `## [Unreleased]` for the full migration table.

### Time anchors (`ts` and `dataVersion`)

- **Input**: only `ts` (UTC ms). Handler floors to the hour. `dataVersion` is no longer accepted as input.
- **Output**: only `dataVersion` (UTC `yyyyMMddHH00`). `ts` is no longer returned.
- **Auto-filled `ts`**: `signal_by_coin` and `signal_by_traders` do not expose `ts` — handler always uses the current hour.
- **Manual `ts`**: `top_coin_signals`, `signal_history_by_coin`, `signal_history_by_traders` accept `ts` for historical replay / time-series anchoring.

### Composite tool removed

The legacy `smartmoney_get_trader_detail` (3-API composite) is removed. To get a trader's full picture, fire `_trader_performance`, `_trader_positions`, and `_trader_order_history` in parallel — finer rate-limit control and explicit per-slice pagination.

### Multi-coin overview removed

The previous `smartmoney_get_overview` `instCcyList` mode is removed (upstream `/overview` no longer accepts `instCcyList`). For multi-coin scenarios, run several `smartmoney_get_signal_by_coin` calls in parallel.

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
okx smartmoney top-traders --period 30 --sortBy pnl --limit 10 --json
okx smartmoney trader-performance --authorIds <id1>,<id2> --period 30 --json
okx smartmoney trader-positions --authorId <id> --json
okx smartmoney trader-position-history --authorId <id> --limit 50 --json
okx smartmoney trader-order-history --authorId <id> --instCcy BTC --limit 50 --json

# Signal / coin family
okx smartmoney top-coin-signals --topInstruments 20 --json
okx smartmoney signal-by-coin --instId BTC-USDT-SWAP --pnlTier PNL_TOP20 --json
okx smartmoney signal-by-traders --instId BTC-USDT-SWAP --authorIds <id1>,<id2> --json
okx smartmoney signal-history-by-coin --instId BTC-USDT-SWAP --ts $(date +%s)000 --granularity 1d --json
okx smartmoney signal-history-by-traders --instId BTC-USDT-SWAP --authorIds <id1>,<id2> --ts $(date +%s)000 --json
```

---

## 中文

聪明钱分析模块 —— 排行榜筛选、单交易员分析（业绩 / 当前持仓 / 历史平仓 / 订单流）、聚合共识信号（热门币种、单币、单币时间序列）。所有工具均为只读。

10 个工具按**入口维度**拆分（`_by_coin` / `_by_traders` / `_top_*`），让 AI agent 不必看参数就能从工具名选对。

### 工具列表

| 名称 | 读/写 | 说明 |
|---|---|---|
| smartmoney_get_top_traders | 读 | 按池筛选条件（period / pnl / winRate / maxDrawdown / asset / sortBy）排行榜。`authorId` 游标分页。 |
| smartmoney_get_trader_performance | 读 | 一个或多个 `authorIds` 的 PnL / 胜率画像（不接池过滤器）。 |
| smartmoney_get_trader_positions | 读 | 单个交易员的当前持仓。可按 `instCcy`（基础币种，如 `BTC`）过滤。 |
| smartmoney_get_trader_position_history | 读 | 单个交易员的历史平仓（含已实现盈亏）。`posId` 游标分页。 |
| smartmoney_get_trader_order_history | 读 | 单个交易员的订单 / 成交流水。`ordId` 游标分页。 |
| smartmoney_get_top_coin_signals | 读 | 在某个时间快照上聪明钱关注度 Top-N 标的（仅 SWAP）。 |
| smartmoney_get_signal_by_coin | 读 | 单币聚合共识信号，按**池过滤器**（sortBy / pnlTier / winRateTier / maxDrawdownTier / aumTier）筛选。`ts` 由 handler 自动取当前小时。 |
| smartmoney_get_signal_by_traders | 读 | 单币聚合共识信号，限定到指定 **`authorIds`**（不接池过滤器）。`ts` 自动当前小时。 |
| smartmoney_get_signal_history_by_coin | 读 | 单币信号时间序列（池过滤器）。以 `ts` 为锚，`granularity` 支持 `1h` / `1d`。 |
| smartmoney_get_signal_history_by_traders | 读 | 单币信号时间序列，限定指定 `authorIds`。以 `ts` 为锚。 |

共 10 个工具（全部只读）。

### 命名家族

```
Trader 家族（5 个）
─────────────────────────────────────────────────
smartmoney_get_top_traders               ← 池过滤 + 排序
smartmoney_get_trader_performance        ← authorIds 直查
smartmoney_get_trader_positions          ← 当前持仓
smartmoney_get_trader_position_history   ← 历史平仓
smartmoney_get_trader_order_history      ← 订单流水

Signal / Coin 家族（5 个）
─────────────────────────────────────────────────
smartmoney_get_top_coin_signals          ← Top-N 最热标的（仅 SWAP）
smartmoney_get_signal_by_coin            ← 单币、池过滤
smartmoney_get_signal_by_traders         ← 单币、authorIds 限定
smartmoney_get_signal_history_by_coin    ← 单币时间序列、池过滤
smartmoney_get_signal_history_by_traders ← 单币时间序列、authorIds
```

### 分页

3 个列表工具在响应顶层返回 `pagination: { hasMore, nextAfter }`。`nextAfter` 是最后一条的游标字段，当 `hasMore=true` 时把它作为下一次调用的 `--after` 游标传入：

| 工具 | 游标字段 |
|---|---|
| `smartmoney_get_top_traders` | `authorId` |
| `smartmoney_get_trader_order_history` | `ordId` |
| `smartmoney_get_trader_position_history` | `posId` |

### 池过滤器参数

两套**互不重叠**的命名约定，按家族区分：

**Signal 家族**（top_coin_signals / signal_by_coin / signal_history_by_coin）—— 枚举档位：

| 参数 | 枚举值 | 默认 | 含义 |
|---|---|---|---|
| `sortBy` | `pnl` / `pnlRatio` | `pnl` | 池排序键 |
| `pnlTier` | `PNL_ANY` / `PNL_TOP50` / `PNL_TOP20` / `PNL_TOP5` | `PNL_ANY` | PnL 百分位（池前 N%） |
| `winRateTier` | `WR_ANY` / `WR_GE_50` / `WR_GE_80` | `WR_ANY` | 胜率阈值（≥ N%） |
| `maxDrawdownTier` | `MD_ANY` / `MD_LE_20` / `MD_LE_50` | `MD_ANY` | 回撤阈值（≤ N%） |
| `aumTier` | `AUM_ANY` / `AUM_TOP50` / `AUM_TOP20` / `AUM_TOP5` | `AUM_ANY` | AUM 百分位 |

**Leaderboard 家族**（top_traders）—— 数值阈值：

| 参数 | 类型 | 含义 |
|---|---|---|
| `sortBy` | 枚举（`pnl` / `pnlRatio`） | 排序键 |
| `period` | `3` / `7` / `30` / `90` | 天数窗口（可选，省略 = all-time） |
| `pnl` | string (USD) | 最低 PnL |
| `winRate` | string（小数，`0.8` = 80%） | 最低胜率 |
| `maxDrawdown` | string（小数） | 最大回撤 |
| `asset` | string (USD) | 最低 AUM |

> **本次重命名**：返回字段 `winRatio` → `winRate`、`maxRetreat` → `maxDrawdown`。完整迁移见 CHANGELOG `## [Unreleased]`。

### 时间锚（`ts` 与 `dataVersion`）

- **入参**：只接受 `ts`（UTC ms），handler 自动 floor 到小时；不再接受 `dataVersion`。
- **出参**：只返回 `dataVersion`（UTC `yyyyMMddHH00`），不再返回 `ts`。
- **`ts` 自动填充**：`signal_by_coin` / `signal_by_traders` 不暴露 `ts`，handler 始终用当前小时。
- **手动传 `ts`**：`top_coin_signals` / `signal_history_by_coin` / `signal_history_by_traders` 支持历史回溯 / 时间序列锚点。

### 复合工具已删除

旧的 `smartmoney_get_trader_detail`（3 接口聚合）已删除。要看交易员全貌，把 `_trader_performance` / `_trader_positions` / `_trader_order_history` 并发调用即可——速率限制控制更细，每个分片可独立分页。

### 多币种 overview 已删除

原 `smartmoney_get_overview` 的 `instCcyList` 模式已删除（上游 `/overview` 不再接受 `instCcyList`）。多币场景请并发调用多个 `smartmoney_get_signal_by_coin`。

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
okx smartmoney top-traders --period 30 --sortBy pnl --limit 10 --json
okx smartmoney trader-performance --authorIds <id1>,<id2> --period 30 --json
okx smartmoney trader-positions --authorId <id> --json
okx smartmoney trader-position-history --authorId <id> --limit 50 --json
okx smartmoney trader-order-history --authorId <id> --instCcy BTC --limit 50 --json

# Signal / coin 家族
okx smartmoney top-coin-signals --topInstruments 20 --json
okx smartmoney signal-by-coin --instId BTC-USDT-SWAP --pnlTier PNL_TOP20 --json
okx smartmoney signal-by-traders --instId BTC-USDT-SWAP --authorIds <id1>,<id2> --json
okx smartmoney signal-history-by-coin --instId BTC-USDT-SWAP --ts $(date +%s)000 --granularity 1d --json
okx smartmoney signal-history-by-traders --instId BTC-USDT-SWAP --authorIds <id1>,<id2> --ts $(date +%s)000 --json
```
