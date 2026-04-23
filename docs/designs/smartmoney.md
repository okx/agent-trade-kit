# Smart Money 设计文档

## Business Context

- **目标用户**: 散户、量化团队——希望跟踪和分析聪明钱（牛人榜交易员）动向的用户
- **业务优先级**: 新模块扩展，无硬性 deadline
- **预期调用量**: 中频——行情分析类查询，用户分析市场时高频调用，日常低频
- **依赖模块**: market（可配合 `market_get_ticker` 查当前价格做交叉分析）
- **风控要求**: 无——全部为只读查询，不涉及资金操作
- **模拟盘**: 支持——demo 模式下正常查询，返回数据与 live 一致
- **站点支持**: global（所有端点已正式上线）
- **API 权限**: 需要 Read-only API key（`privateGet` 鉴权调用）

---

## 模块职责与边界

smartmoney 作为**顶层模块**，提供 5 个只读 MCP tool。不进入默认模块列表（`--modules` 需显式指定或用 `all`）。

职责范围：
- 查询交易员排行榜（leaderboard）和单个交易员详情（profile + 持仓 + 交易记录）
- 查询聪明钱聚合共识信号（多币种概览、单币种信号、信号历史时间线）
- 提供池过滤器参数（sortType/period/pnl/winRatio/maxRetreat/asset），按 PnL、胜率、回撤、资产筛选交易员池

不在范围内：
- 行情价格、技术指标（由 market 模块负责）
- 任何写操作（下单、改单、撤单）

---

## Tool 清单

| 名称 | Read/Write | 参数 | 说明 |
|------|-----------|------|------|
| `smartmoney_get_overview` | Read | `dataVersion`, `ts`, `instType`, `sortType`, `period`, `pnl`, `winRatio`, `maxRetreat`, `asset`, `lmtNum`, `instCcyList`, `instCcy`, `topInstruments` | 多币种聪明钱概览 |
| `smartmoney_get_signal` | Read | `instId`, `instCcy`, `dataVersion`, `ts`, `sortType`, `period`, `pnl`, `winRatio`, `maxRetreat`, `asset`, `lmtNum`, `authorIds` | 单币种聚合共识信号 |
| `smartmoney_get_signal_history` | Read | `instId` (required), `dataVersion`, `ts`, `granularity`, `limit`, `sortType`, `period`, `pnl`, `winRatio`, `maxRetreat`, `asset` | 信号历史时间线 |
| `smartmoney_get_traders` | Read | `dataVersion`, `sortType`, `period`, `pnl`, `winRatio`, `maxRetreat`, `asset`, `authorIds`, `after`, `before`, `limit` | 交易员排行榜列表/筛选 |
| `smartmoney_get_trader_detail` | Read | `authorId` (required), `period`, `instCcy`, `tradeLimit` | 交易员详情（复合：profile + 持仓 + 交易记录） |

API 映射：

| Tool | API Path |
|------|----------|
| `smartmoney_get_overview` | GET /api/v5/journal/smartmoney/overview |
| `smartmoney_get_signal` | GET /api/v5/journal/smartmoney/signal |
| `smartmoney_get_signal_history` | GET /api/v5/journal/smartmoney/signal-history |
| `smartmoney_get_traders` | GET /api/v5/orbit/public/leaderboard |
| `smartmoney_get_trader_detail` | GET /api/v5/orbit/public/leaderboard + position-current + trade-records (composite) |

---

## Token 预算评估

> 由 `npx tsx scripts/mcp-token-stats.ts` 实测（JSON schema 字符数 / 3.5）。

| 项目 | 估算 |
|------|------|
| smartmoney 模块（5 tool, 5,684 chars） | ~1,624 tokens |
| 全局（截至 2026-04-23） | 154 tools, ~38,956 tokens |
| 预算上限 | 25,000 tokens（全量加载时已超标，readOnly 模式 ~19,267 tokens 在预算内） |

5 个只读 tool，无 write 操作。smartmoney 不在 DEFAULT_MODULES 中，按需加载可有效控制实际 token 消耗。全量加载时全局已超预算，后续需按超预算策略（见 mcp-design-guideline §4.3）精简。

---

## 与现有模块的交互关系

```
market_get_ticker (已有, Read)
  │
  └─ 配合 smartmoney_get_signal 做交叉分析（聪明钱信号 vs 当前价格）

smartmoney_get_traders (Read)
  │
  └─ 获取 authorId 列表
      │
      ▼
smartmoney_get_trader_detail (Read, composite)
  ├─ leaderboard API → profile & stats
  ├─ position-current API → 当前持仓
  └─ trade-records API → 交易记录

smartmoney_get_overview (Read) ← 多币种概览
  │
  ▼
smartmoney_get_signal (Read) ← 单币种详细信号
  │
  ▼
smartmoney_get_signal_history (Read) ← 信号时间线
```

---

## 典型 Workflow

### 场景 1: 查看聪明钱排行榜并深入分析

```
1. smartmoney_get_traders(period=30, sortType=pnl, limit=10) → 获取 Top 10 交易员
2. smartmoney_get_trader_detail(authorId=<top_trader_id>) → 查看最佳交易员详情
3. 结合 profile/positions/trades 做综合分析
```

### 场景 2: 聪明钱信号分析

```
1. smartmoney_get_overview(dataVersion=<ts>) → 多币种概览
2. smartmoney_get_signal(ts=<ms>, instId=BTC-USDT-SWAP) → 单币种信号（推荐 instId；instCcy 仅 SPOT/SWAP，instId 优先）
3. market_get_ticker(instId=BTC-USDT-SWAP) → 当前价格（跨模块）
4. 比较 smart money avg entry vs 当前价格
```

### 场景 3: 信号趋势回溯

```
1. smartmoney_get_signal_history(instId=BTC-USDT-SWAP, dataVersion=<ts>, granularity=1d) → 历史信号
2. 分析 longRatio 和价格走势的相关性
```

## 设计决策

### 池过滤器参数扁平化

Signal 端点和 Leaderboard 端点的池过滤器（sortType, period, pnl, winRatio, maxRetreat, asset）虽然在后端 API 可能以嵌套方式接收，但在 MCP tool 层面严格遵循扁平化原则，每个过滤字段作为独立的顶层参数暴露。CLI 层和 MCP 层保持一致的扁平参数结构。

### Signal vs Leaderboard 过滤值差异

两类端点的过滤参数名称相同，但值语义不同：
- **Signal 端点**: 使用枚举值（PNL_TOP50, WR_GE_80, MR_LE_20, AUM_TOP20）
- **Leaderboard 端点**: 使用数值阈值（pnl=10, winRatio=0.8, maxRetreat=0.1, asset=100）

这一差异在参数 description 中明确说明。

### 不进默认模块列表

smartmoney 为分析增值模块，非核心交易链路，不进入 MCP server 默认模块列表。用户需通过 `--modules smartmoney` 或 `--modules all` 显式加载。
