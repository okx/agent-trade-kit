# Smart Money 设计文档

## Business Context

- **目标用户**: 散户、量化团队、AI agent —— 希望基于"聪明钱"持仓与共识做交易决策的用户
- **业务优先级**: 已稳定上线，是项目"内容侧"的核心模块
- **预期调用量**: 中频 —— 既有 leaderboard 浏览（低频），也有 signal 多次刷新查询（中高频）
- **依赖模块**: 无（独立模块，端点分布在 orbit / journal 路径，均通过 `privateGet` 签名通道访问）
- **风控要求**: 全部只读；无资金变动、无 24 小时锁定等约束
- **站点支持**: global（端点未做多站点化）
- **API 权限**: Read-only，需要 credentials；实现复用 `client.privateGet` 走通用签名通道（skill preflight 会先确认已配置 API key 或 OAuth session）

---

## 模块职责与边界

`smartmoney` 是顶层模块（非子模块），共 **10 个 read-only tool**，划分为两大家族：

- **Trader 家族（6 tool）**：交易员发现、检索、画像、持仓与订单流水
- **Signal/Coin 家族（4 tool）**：聚合多 trader 共识形成的多空信号 + 时间序列

职责范围：
- 排行榜筛选 / 按 `authorId` 直查 / 按昵称模糊搜索
- 单个 trader 的当前持仓、历史平仓、订单流水
- 池过滤后的多币聚合信号快照与时间序列
- 指定 trader 群体的多币聚合信号快照与时间序列

不在范围内：
- 真实下单（由 `spot` / `swap` / `futures` / `option` 模块负责）
- 跟单订阅（OKX 跟单接口尚未通过 OpenAPI 暴露）
- 多站点适配（端点本身仅 global）

---

## Tool 清单

### Trader 家族

| 名称 | 必填 | 可选 | API 路径 | 说明 |
|------|------|------|----------|------|
| `smartmoney_get_traders_by_filter` | — | `updateTime`, `sortBy`, `period`, `minPnl`, `minWinRate`, `maxDrawdown`, `minAum`, `after`, `before`, `limit` | `GET /api/v5/orbit/public/leaderboard` | 排行榜按数值阈值过滤 + 排序 |
| `smartmoney_get_performance_by_trader` | `authorIds` (string[]) | `period` | `GET /api/v5/orbit/public/leaderboard` | 已知 ID → 拉取 PnL / 胜率 / 回撤画像 |
| `smartmoney_search_trader` | `keyword` | — | `GET /api/v5/orbit/top-trader-search` | 昵称模糊匹配 → ≤10 条 authorId（按粉丝 DESC） |
| `smartmoney_get_trader_positions` | `authorId` | `instId` | `GET /api/v5/orbit/public/position-current` | 当前持仓；handler 输出派生 `direction` 字段 |
| `smartmoney_get_trader_positions_history` | `authorId` | `instId`, `after`, `before`, `limit` | `GET /api/v5/orbit/public/position-history` | 历史平仓流水 |
| `smartmoney_get_trader_orders_history` | `authorId` | `instId`, `after`, `before`, `limit` | `GET /api/v5/orbit/public/trade-records` | 订单流水（与 `*_get_orders` 系列对齐） |

### Signal/Coin 家族

| 名称 | 必填 | 可选 | API 路径 | 说明 |
|------|------|------|----------|------|
| `smartmoney_get_signal_overview_by_filter` | — | `topInstruments` ⊻ `instCcyList`（默认 `topInstruments=20`），`sortBy`, `period`, `pnlTier`, `winRateTier`, `maxDrawdownTier`, `aumTier`, `lmtNum` | `GET /api/v5/journal/smartmoney/overview` | 池过滤后多币最新共识快照；`asOfTime` 自动取当前 UTC 整点 |
| `smartmoney_get_signal_overview_by_trader` | `authorIds` | `topInstruments` ⊻ `instCcyList` | `GET /api/v5/journal/smartmoney/overview` | 指定 trader 群体多币最新共识；**不暴露**池参数 |
| `smartmoney_get_signal_trend_by_filter` | `instCcy` | `asOfTime`, `granularity` (`1h`/`1d`), `limit`, 全套池过滤参数 | `GET /api/v5/journal/smartmoney/signal-history` | 池过滤后单币时间序列 |
| `smartmoney_get_signal_trend_by_trader` | `authorIds`, `instCcy` | `asOfTime`, `granularity`, `limit` | `GET /api/v5/journal/smartmoney/signal-history` | 指定 trader 群体单币时间序列；**不暴露**池参数 |

---

## 关键设计原则

### 1. 入口维度显式化（`_by_filter` ⊥ `_by_trader`）

按业务场景拆分而非"是否传 authorIds"：

- **`_by_filter`**：用户不知道具体 trader，按 PnL / 胜率 / 回撤 / AUM 档位筛池 → 完整暴露 pool filter
- **`_by_trader`**：用户已通过 `_get_traders_by_filter` / `_search_trader` 锁定 ID → 只暴露 `authorIds` + 标的选择，pool filter 走后端默认

两者的 inputSchema 在 tier 参数和 `authorIds` 上 disjoint，AI agent 看 schema 即可消歧。

### 2. 数值阈值 vs 枚举档位的命名空间隔离

| 场景 | 公开参数名 | 上游 API 名 |
|------|-----------|------------|
| Leaderboard 数值阈值 | `minPnl`, `minWinRate`, `maxDrawdown`, `minAum` | `pnl`, `winRate`, `maxDrawdown`, `asset` |
| Signal 枚举档位 | `pnlTier`, `winRateTier`, `maxDrawdownTier`, `aumTier` | 同名透传 |

`min*` / `max*` 前缀与 `*Tier` 后缀语义互斥，杜绝跨工具静默 no-op 误传。Leaderboard 的 handler 用 `LEADERBOARD_FILTER_UPSTREAM_NAMES` 做 public→upstream 映射。

### 3. 数组形参（`authorIds` / `instCcyList`）

AI 对 `string[]` 比逗号分隔字符串更友好：

- **MCP public schema**：`type: "array", items: { type: "string" }`
- **Handler 内部**：`readArrayAsCsv` 转上游期望的 `"id1,id2"`
- **CLI parity**：`--authorIds 1001,1002` 人类友好 flag，`commands/smartmoney.ts` 调 MCP 前 `csvToArray()` 拆分

### 4. 时间锚双轨制

| 维度 | Leaderboard 家族 | Signal 家族 |
|------|-----------------|------------|
| 入参 | `updateTime`（12 位 `yyyyMMddHHmm`，**UTC+8**） | `asOfTime`（10 位 `yyyyMMddHH`，**UTC**） |
| 出参 | `updateTime`（12 位） | `dataVersion`（10 位） |
| 缺省 | 最新快照（每 ~5 min 刷新） | 当前 UTC 整点（`/overview` handler 自动填充） |

Description 里明确互不兼容，禁止跨家族传值。

### 5. `topInstruments` ⊻ `instCcyList` 互斥

S1 / S2 二选一，handler 检测同时传入抛 `actionableError`；都不传走 `topInstruments=20` 默认。

### 6. `instId` 公开层 + `extractBaseCcy` 桥接

Trader 家族对外接受完整 `instId`（如 `BTC-USDT-SWAP`），handler 内部 `extractBaseCcy` 提取 base ccy 转发上游。让 AI 直接传持仓里看到的完整 instId。

### 7. 派生 `direction` 字段（`get_trader_positions`）

上游 `posSide=both` 表示净仓模式，方向藏在 `pos` 数值符号里。Handler 据此派生 `direction: "long" | "short"` 平铺给 agent；`posSide=both && pos=0` 时不派生（保持 enum 严格）。

### 8. 输出 envelope 统一

所有工具输出包装成：

```jsonc
{
  "endpoint": "smartmoney_xxx",
  "requestTime": "2026-05-06T15:00:00Z",
  "data": [...],
  // 时间锚字段（按家族）
  "updateTime": "202605061800",      // 仅 Trader 家族（UTC+8）
  // Signal 家族的 dataVersion 在 data[] 每个 item 内，不在顶层
  "pagination": { ... }              // 仅分页类工具
}
```

---

## Token 预算评估

| 项目 | 估算 |
|------|------|
| 模块工具数 | 10（10 read / 0 write） |
| 模块 token 估算 | ~4,729 tokens |
| 全局 token（159 tools） | ~44,974 tokens（**超 25,000 上限，已备案**） |
| 备案理由 | 见 `docs/module-registry.md` —— 按业务场景拆分是消除多模式 footgun 的最小集，进一步合并会复刻已修复问题 |
| 共享 schema 复用 | `TRADER_ITEM_PROPS` / `SIGNAL_ITEM_PROPS` / `SIGNAL_HISTORY_ITEM_PROPS` 在 outputSchema 间共享，控制增长 |

---

## 与现有模块的交互关系

```
（用户输入）
   │
   ├─ 已知 trader 昵称  →  smartmoney_search_trader            ┐
   ├─ 想按指标筛 trader →  smartmoney_get_traders_by_filter    ├→ authorId(s)
   └─ 已知 authorId      ─────────────────────────────────────  ┘
        │
        ├─ 看画像        →  smartmoney_get_performance_by_trader
        ├─ 看持仓        →  smartmoney_get_trader_positions
        ├─ 看历史平仓    →  smartmoney_get_trader_positions_history
        ├─ 看订单流水    →  smartmoney_get_trader_orders_history
        │
        └─ 看共识信号
             ├─（按池）  →  smartmoney_get_signal_overview_by_filter / _trend_by_filter
             └─（按人）  →  smartmoney_get_signal_overview_by_trader / _trend_by_trader
```

不依赖 trade / market / earn 等其他模块。下游可对接 trade 模块下单（agent 自行编排）。

---

## 典型 Workflow

### 场景 1: 探索式发现（用户不知道具体 trader）

```
1. smartmoney_get_signal_overview_by_filter({ topInstruments: 20, pnlTier: "PNL_TOP20" })
   → 看哪些币当前共识强，pool 锁定 PnL 前 20% 的 trader
2. smartmoney_get_traders_by_filter({ minPnl: "10000", minWinRate: "0.6", limit: 10 })
   → 拿到具体 trader 列表 + authorId
3. smartmoney_get_trader_positions({ authorId })
   → 验证候选 trader 当前真实仓位
```

### 场景 2: 已锁定 trader 的跟踪（用户已有 ID 列表）

```
1. smartmoney_get_signal_overview_by_trader({ authorIds: ["1001","1002"], instCcyList: ["BTC","ETH"] })
   → 看这群人最新多空共识
2. smartmoney_get_signal_trend_by_trader({ authorIds: ["1001","1002"], instCcy: "BTC", limit: 48 })
   → 看 48 小时趋势演化
3. smartmoney_get_trader_orders_history({ authorId: "1001", limit: 20 })
   → 钻取单 trader 最近订单
```

### 场景 3: 昵称解析

```
1. smartmoney_search_trader({ keyword: "alice" })
   → 拿到 ≤10 个候选 authorId
2. smartmoney_get_performance_by_trader({ authorIds: [...], period: "30" })
   → 看 30 日画像确认是不是要找的人
3. → 进入场景 2 流程
```

---

## 端点共享映射

| 端点 | 服务的 Tools |
|------|-------------|
| `GET /api/v5/orbit/public/leaderboard` | `get_traders_by_filter`, `get_performance_by_trader` |
| `GET /api/v5/orbit/public/position-current` | `get_trader_positions` |
| `GET /api/v5/orbit/public/position-history` | `get_trader_positions_history` |
| `GET /api/v5/orbit/public/trade-records` | `get_trader_orders_history` |
| `GET /api/v5/orbit/top-trader-search` | `search_trader` |
| `GET /api/v5/journal/smartmoney/overview` | `get_signal_overview_by_filter`, `get_signal_overview_by_trader` |
| `GET /api/v5/journal/smartmoney/signal-history` | `get_signal_trend_by_filter`, `get_signal_trend_by_trader` |

同端点工具按入参组合（`authorIds` 是否存在）路由到不同 schema，差异由 MCP 层显式拆分而非端点内多模式。

---

## CLI Parity

`packages/cli/src/commands/smartmoney.ts` 提供 1:1 子命令：

- 数组形参以 `--authorIds 1001,1002` / `--instCcyList BTC,ETH` 接收，`csvToArray()` 在调用 MCP tool 前拆分
- `pnlTier` / `winRateTier` 等 named flag 走 `v.xxx` 路由（CLAUDE.md 强约束：不允许 positional `rest[0]`）
- 路由测试 `packages/cli/test/smartmoney-routing.test.ts` 用 spy ToolRunner 断言 flag → 入参一致

---

## 参考实现位置

- Tool 注册：`packages/core/src/tools/smartmoney.ts`
- 共享 props：同文件 `SIGNAL_POOL_FILTER_PROPS` / `LEADERBOARD_POOL_FILTER_PROPS` / `TRADER_ITEM_PROPS` / `SIGNAL_ITEM_PROPS` / `SIGNAL_HISTORY_ITEM_PROPS`
- CLI 命令：`packages/cli/src/commands/smartmoney.ts`
- 单测：`packages/core/test/tools.test.ts`、`packages/cli/test/smartmoney-routing.test.ts`
- 用户文档：`docs/modules/smartmoney.md`
- Skill：`skills/okx-cex-smartmoney/`
