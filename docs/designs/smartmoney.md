# Smart Money 设计文档

> **状态**：已实施（Phase 1 — 代码层已落地，feat/smartmoney-fix 分支）
> **作者**：lewei.li
> **日期**：2026-04-28 起草，2026-04-29 落地
> **关联 Lark 文档**：https://okg-block.sg.larksuite.com/docx/ZQu1dvKCdoaalwx4Yh6lKImRg6g
> **历史**：本文替代了原 5-tool 设计；2026-04-29 在 8→10 tool 重构中成为唯一权威设计
>
> **2026-04-30 增量**：
> - 新增 `smartmoney_search_trader`（按 nickname 关键词搜索 Top Trader → authorId）
> - 删除 `smartmoney_get_top_coin_signals`（其 "Top-N 最热"语义已被 `smartmoney_get_signal_overview_by_filter` 用 `topInstruments` 默认值完全覆盖；避免双工具同职责）
> - 重命名 `smartmoney_get_traders_by_id` → `smartmoney_get_performance_by_trader`（与 `_by_filter` 形成对偶；与 CLI `performance-by-trader` 完全 parity）
>
> 当前权威工具数：**10 个**（trader 6 + signal 4）。下文中所有 `top_coin_signals` 引用以及"`get_traders_by_id`"提法仅作设计回顾，不再代表实现现状。

---

## 1. 设计动机

当前 smartmoney 模块（`packages/core/src/tools/smartmoney.ts`，8 个 tool）存在以下 AI agent 友好度问题：

1. **命名语义模糊**：`get_overview` / `get_traders` / `get_trader_records` 等名字过泛，AI 必须读 description 才能识别意图
2. **多模式工具掩盖意图**：`get_overview` 同时承担"top 榜单"和"指定币列表"；`get_signal` 同时承担"pool filter"和"authorIds 直查"——AI agent 易传错参数
3. **参数命名 footgun**：`pnl` 既是入参名（枚举档位）又是返回字段名（数值）；`maxRetreat` 是中式英语不在 LLM 训练语料里
4. **聚合复合工具**：`get_trader_detail` 把 3 个 API 合成一个工具，违反原子化原则
5. **跨模块语言不一致**：`trader_records` 与项目其他模块的 `get_orders` / `get_fills` 体系脱节

本设计以**「AI agent 看名字就能选对工具」为第一目标**，重新拆分并命名整个模块；同时整合后端最新接口调整（删 `instCcyList` / `instType` / `dataVersion` 入参、ts 归一化到小时、`/signal` 端点 ts 自动化）。

---

## 2. 核心设计原则

| 原则 | 应用 |
|---|---|
| **入口维度显式化** | `_by_coin` / `_by_traders` 后缀标明筛选维度 |
| **单数 / 复数严格区分** | `signal`（单币）vs `signals`（多币） |
| **命名空间分层** | `top_*`（排序截断列表）/ `trader_*`（单人维度）/ `coin_*`（币维度） |
| **跨模块术语统一** | `order_history` 对齐 `spot/swap/futures_get_orders` 系列 |
| **参数 tier 化** | 枚举档位以 `Tier` 后缀标识，避免与同名返回字段冲突 |
| **删除聚合复合工具** | 原子化，不做组合 |
| **入参最小化** | 后端能自动推导的（如 `/signal` 的 ts）handler 自填，不暴露给用户 |

---

## 3. Tool 重命名映射

### 3.1 旧 → 新（共 8 → 10 tool）

| # | 旧 Tool | 新 Tool | 备注 |
|---|---|---|---|
| 1 | `smartmoney_get_traders` | **`smartmoney_get_traders_by_filter`** | pool filter + rank 模式 |
| 2 | `smartmoney_get_traders`（authorIds 模式） | **`smartmoney_get_performance_by_trader`** | 拆出 + 合并自原 doc 的 `traders_by_authors` 与 `traders_performance`（端点+入参+输出 schema 完全一致，无重复理由） |
| 3 | `smartmoney_get_trader_positions` | 不变 | |
| 4 | `smartmoney_get_trader_positions_history` | 不变 | |
| 5 | `smartmoney_get_trader_records` | **`smartmoney_get_trader_orders_history`** | 跨模块对齐 `get_orders` 系列；与 `position_history` 形成漂亮对仗 |
| 6 | `smartmoney_get_overview`（top 模式） | **`smartmoney_get_top_coin_signals`** | 仅 SWAP；只接受 `topInstruments` |
| 7 | `smartmoney_get_overview`（instCcyList 模式） | **`smartmoney_get_signal_overview_by_filter`**（合并） | 后端 2026-04-30 重新接受 `instCcyList`；多币场景由 `_overview_by_filter` / `_overview_by_trader` 通过 `topInstruments` 或 `instCcyList` 二选一覆盖 |
| 8 | `smartmoney_get_signal`（pool filter 模式） | **`smartmoney_get_signal_overview_by_filter`** | 拆出；`ts` 入参移除（handler 自动填当前小时）；改为多币（`topInstruments` / `instCcyList`） |
| 9 | `smartmoney_get_signal`（authorIds 模式） | **`smartmoney_get_signal_overview_by_trader`** | 拆出；`ts` 入参移除；改为多币 |
| 10 | `smartmoney_get_signal_history`（pool filter 模式） | **`smartmoney_get_signal_trend_by_filter`** | 重命名；时间锚回归 `asOfTime`（10 位 `yyyyMMddHH` UTC，缺省=当前小时）+ `limit` 桶数（与后端 `/signal-history` 接口一致） |
| 11 | _（不存在）_ | **`smartmoney_get_signal_trend_by_trader`** | 新增；同样使用 `asOfTime` + `limit` 模式，`authorIds` 与档位池取交集 |
| ~~12~~ | `smartmoney_get_trader_detail` | _删除_ | 聚合复合工具违反原子化原则；调用方自行 parallel 调用 3 个原子工具 |

> **不在本期范围**：`smartmoney_search_trader_by_name`（nickname → authorId 解析）— 需 PM 与上游接口对齐，下期单独评估。

### 3.2 命名家族总览（最终形态：6 + 4 = 10）

```
Trader 家族（6 tools）
─────────────────────────────────────────────────
smartmoney_get_traders_by_filter         ← pool filter + rank
smartmoney_get_performance_by_trader     ← authorIds 直查（单/多）
smartmoney_search_trader                 ← 昵称 → authorId 解析（≤10 条，按粉丝数 DESC）
smartmoney_get_trader_positions          ← 当前持仓
smartmoney_get_trader_positions_history  ← 历史平仓
smartmoney_get_trader_orders_history     ← 订单流水

Signal/Coin 家族（4 tools）
─────────────────────────────────────────────────
smartmoney_get_signal_overview_by_filter ← 多币 pool filter 信号（topInstruments / instCcyList 二选一；当前小时自动）
smartmoney_get_signal_overview_by_trader ← 多币 + 指定 authorIds 信号（topInstruments / instCcyList 二选一；当前小时自动）
smartmoney_get_signal_trend_by_filter    ← 单币 pool filter 信号时间序列（asOfTime 锚点 + limit 桶数）
smartmoney_get_signal_trend_by_trader    ← 单币 + 指定 authorIds 信号时间序列（asOfTime 锚点 + limit 桶数；与档位池取交集）
```

> `smartmoney_get_top_coin_signals` 已删除（其 Top-N 语义由 `signal_overview_by_filter` 默认 `topInstruments=20` 完整覆盖，避免双工具同职责）。

---

## 4. 参数（Schema）改动

### 4.1 Pool Filter 参数 tier 化重命名

仅影响**枚举档位类参数**（不影响 leaderboard 端点的数值阈值参数）：

| 旧名 | 新名 | 类型 | 改动理由 |
|---|---|---|---|
| `sortType` | **`sortBy`** | string enum | 与 `instType`（系统级常量）风格冲突；`sortBy` 是排序通用词 |
| `pnl` | **`pnlTier`** | string enum | **最大 footgun**：与返回字段 `pnl`（数值）同名，AI 极易混淆 |
| `winRatio` | **`winRateTier`** | string enum | 同名冲突；`winRate` 比 `winRatio` 更标准（返回字段同步改） |
| `maxRetreat` | **`maxDrawdownTier`** | string enum | `maxRetreat` 是中式英语；`maxDrawdown` 行业通用，AI 一看即懂（返回字段同步改） |
| `asset` | **`aumTier`** | string enum | `asset` 太泛；`AUM` 是行业标准缩写 |

### 4.2 返回字段连带改名（保持入参 / 返回一致）

| 旧字段 | 新字段 | 影响范围 |
|---|---|---|
| `winRatio` | `winRate` | leaderboard、signal 系列、trader_detail 等所有出现处 |
| `maxRetreat` | `maxDrawdown` | leaderboard 相关返回 |
| `avgLongWinRatio` / `avgShortWinRatio` | `avgLongWinRate` / `avgShortWinRate` | signal 返回 |

### 4.3 端点参数收敛（来自 PM 讨论 + 后端调整）

| 范围 | 改动 | 理由 |
|---|---|---|
| `/overview` | 移除 `instType` 入参 | 当前主要支持 SWAP，无须暴露 |
| `/overview` | 移除 `instCcy` 入参 | 与 `instCcyList` 重复 |
| `/overview` | **进一步移除 `instCcyList` 入参**（仅保留 `topInstruments`） | 后端最终方案：只支持 top N 模式；多币批量直接消解 |
| `/overview` | `topInstruments` 默认仅返回 SWAP 标的 | 后端调整 |
| **Signal 家族**（top_coin_signals / signal_by_coin / signal_by_traders / signal_history_*） | 统一使用 `instId`，移除 `instCcy` 双轨 | API 端点同时支持 instId 和 instCcy，统一收敛到 instId 避免歧义 |
| **Trader 家族**（trader_positions / trader_positions_history / trader_orders_history） | **入参改为 `instId`**（公开层），handler `extractBaseCcy` 自动提取 base ccy 转发上游 | 上游确实只接受 base ccy，但 AI agent 拿到的就是 `BTC-USDT-SWAP` 这种完整 instId，暴露 `instCcy` 反而要 agent 主动 split；改为 `instId` 让 agent 直接传完整值，handler 桥接 |

### 4.4 Pool filter 参数集（最终形态）

**Signal 家族**（枚举档位，公开名 == 上游 API key）：

```
sortBy         ∈ { pnl, pnlRatio }                       default: pnl
period         ∈ { 3, 7, 30, 90 }                        default: 7
pnlTier        ∈ { PNL_ANY, PNL_TOP50, PNL_TOP20, PNL_TOP5 }   default: PNL_ANY
winRateTier    ∈ { WR_ANY, WR_GE_50, WR_GE_80 }          default: WR_ANY
maxDrawdownTier ∈ { MR_ANY, MR_LE_20, MR_LE_50 }         default: MR_ANY
aumTier        ∈ { AUM_ANY, AUM_TOP50, AUM_TOP20, AUM_TOP5 } default: AUM_ANY
```

> `maxDrawdownTier` 取值统一为 `MR_*` 前缀（`MR` = "max retreat"，与 OKX SmartMoney OpenAPI 文档对齐）。
> S1 / S2 / S3 / S4 共用同一组档位过滤器；signal 系列入参公开名直接等于后端 API key（不再做重命名）。

**Leaderboard 家族**（数值阈值，保留原有命名习惯）：

```
sortBy   ∈ { pnl, pnlRatio }   default: pnl
period   ∈ { 3, 7, 30, 90 }    optional（all-time）
pnl      string  最低 PnL（USD）
winRate  string  最低胜率（小数）
maxDrawdown string 最大回撤（小数）
asset    string  最低 AUM（USD）
```

> Leaderboard 因为是数值阈值（不是档位枚举），保留 `pnl` / `winRate` / `maxDrawdown` / `asset` 朴素名称——这里没有同名冲突 footgun，因为返回字段含义对齐。

### 4.5 时间锚参数：`ts` 与 `dataVersion`（后端最新调整）

**核心原则**：入参用 `ts`，出参用 `dataVersion`，二者均为 UTC，归一化到小时。

| 维度 | 规则 |
|---|---|
| **入参** | 仅接受 `ts`（UTC ms 时间戳）；handler 内部强制归一化到小时（floor 到 `:00:00`）；**不再接受 `dataVersion` 入参** |
| **出参** | 只返回 `dataVersion`（UTC `yyyyMMddHHmm` 字符串，如 `202604282000`，分钟位恒为 `00`）；**不再返回 `ts`** |
| **时区** | UTC（前端如需本地时间在调用侧转换） |
| **`/signal` 端点特例** | **完全移除 `ts` 入参**——handler 自动填入当前时刻 floor-to-hour 后的值；用户调用 `get_signal_by_coin` / `get_signal_by_traders` 时不需提供任何时间参数 |
| **保留 `ts` 入参的 tool** | `get_top_coin_signals`（支持历史快照查询）、`get_signal_history_by_coin`（时间线锚点）、`get_signal_history_by_traders`（同前） |

> 说明：`/signal` 自动填 ts 是后端要求；ts 在历史回溯场景对 overview / signal_history 仍有意义（看一周前的最热币、看某段时间的信号变化），所以这两类 tool 保留 ts 入参。

### 4.6 删除的输出字段（后端调整）

以下字段在所有 signal / overview 类 tool 的 outputSchema 中**移除**：

```
topNUsed
currentPrice
fundingRate
openInterest
priceChange24h
longShortAccountRatio
```

> 这些字段后端不再返回；保留旧字段会让 AI agent 误读不存在的数据。

---

## 5. 各 Tool 关键参数定义（最终形态）

### 5.1 Trader 家族（6 tools）

| Tool | 必填 | 可选 |
|---|---|---|
| `smartmoney_get_traders_by_filter` | — | updateTime, sortBy, period, pnl, winRate, maxDrawdown, asset, after, before, limit |
| `smartmoney_get_performance_by_trader` | authorIds | period |
| `smartmoney_search_trader` | keyword | — |
| `smartmoney_get_trader_positions` | authorId | instId |
| `smartmoney_get_trader_positions_history` | authorId | instId, after, before, limit |
| `smartmoney_get_trader_orders_history` | authorId | instId, after, before, limit |

### 5.2 Signal 家族（4 tools）

| Tool | 必填 | 可选 | 时间锚处理 |
|---|---|---|---|
| `smartmoney_get_signal_overview_by_filter` | — | topInstruments / instCcyList（二选一，默认 topInstruments=20）, sortBy, pnlTier, winRateTier, maxDrawdownTier, aumTier, lmtNum | **不暴露任何时间入参**，handler 自动填当前小时 |
| `smartmoney_get_signal_overview_by_trader` | authorIds | topInstruments / instCcyList（二选一，默认 topInstruments=20） | **业务场景拆分**:`_by_trader` 走 authorIds 直查,**不暴露**池过滤器入参;后端使用默认池配置。**不暴露任何时间入参**,handler 自动填当前小时。 |
| `smartmoney_get_signal_trend_by_filter` | instCcy | asOfTime, granularity (1h/1d), limit, sortBy, period, pnlTier, winRateTier, maxDrawdownTier, aumTier, lmtNum | `asOfTime` = 10 位 `yyyyMMddHH` UTC 锚点（缺省=当前小时），`limit` 控制截止该锚点向前的桶数 |
| `smartmoney_get_signal_trend_by_trader` | authorIds, instCcy | asOfTime, granularity (1h/1d), limit | **业务场景拆分**:`_by_trader` 走 authorIds 直查,**不暴露**池过滤器入参;后端使用默认池配置。 |

### 5.3 输出统一形态

所有 signal / overview 类 tool 的输出顶层结构：

```jsonc
{
  "endpoint": "smartmoney_xxx",
  "requestTime": "2026-04-28T15:00:00Z",   // ISO-8601
  "data": [...],                            // tool 各自的 schema
  "dataVersion": "202604281500"             // UTC yyyyMMddHHmm（分钟位恒为 `00`），唯一时间锚
}
```

不再返回 `ts`（与 `dataVersion` 重复）。

---

## 6. 端点共享映射

| 端点 | 服务的 Tools |
|---|---|
| `GET /api/v5/orbit/public/leaderboard` | `smartmoney_get_traders_by_filter`, `smartmoney_get_performance_by_trader` |
| `GET /api/v5/orbit/public/position-current` | `smartmoney_get_trader_positions` |
| `GET /api/v5/orbit/public/position-history` | `smartmoney_get_trader_positions_history` |
| `GET /api/v5/orbit/public/trade-records` | `smartmoney_get_trader_orders_history` |
| `GET /api/v5/orbit/top-trader-search` | `smartmoney_search_trader` |
| `GET /api/v5/journal/smartmoney/overview` | `smartmoney_get_signal_overview_by_filter`, `smartmoney_get_signal_overview_by_trader`（同一端点，按入参组合区分） |
| `GET /api/v5/journal/smartmoney/signal-history` | `smartmoney_get_signal_trend_by_filter`, `smartmoney_get_signal_trend_by_trader` |

---

## 7. 兼容性策略

### 7.1 Breaking change 性质

本次改动属于**完整 breaking change**：tool 名、参数名、返回字段名、输入输出 schema 全部变化。

### 7.2 处置方案

- **不保留 alias**——tool 数已超模块上限，alias 会让 token 预算雪上加霜
- **CHANGELOG 必须高亮 BREAKING**，并附完整 old → new 映射表 + 删除字段列表
- **版本跳级**：发布 minor 版本（如 1.x.0），不发 patch
- **CLI 命令同步重命名**——CLI ↔ MCP parity 不破

### 7.3 用户迁移指引

CHANGELOG 附迁移表，例如：

```
旧调用：smartmoney_get_overview({ dataVersion: "202604281500", instCcyList: "BTC,ETH" })
新调用：smartmoney_get_signal_overview_by_filter({ instCcyList: "BTC,ETH" })
        # 后端 2026-04-30 重新接受 instCcyList，无需再拆成多次调用；ts 不再需要传入，handler 自动取当前小时

旧调用：smartmoney_get_signal({ instId: "BTC-USDT-SWAP", dataVersion: "202604281500", pnl: "PNL_TOP5" })
新调用：smartmoney_get_signal_overview_by_filter({ instCcyList: "BTC", pnlTier: "PNL_TOP5" })
        # ts 不再需要传入，handler 自动取当前小时
```

---

## 8. Token 预算与模块容量

### 8.1 工具数变化

| 维度 | 旧 | 新 | Δ |
|---|---|---|---|
| Tool 数 | 8 | 10 | +2 |
| CLAUDE.md 推荐上限 | 8 | — | **超 2** |

### 8.2 处置方案

- 在 [`docs/module-registry.md`](../module-registry.md) 中显式备案理由："为提升 AI agent 调用准确率，按入口维度（_by_coin / _by_traders）拆分 signal 工具，10 tool 是无法进一步合并的最小集"
- **重新核算 25k token 上限**：实施后实测 `system_get_capabilities` 输出 + 各 tool inputSchema 的 token 总数，超出则触发后续 token 优化（缩短 description、抽取共享 enum）

### 8.3 后续 token 优化备选

- 共享枚举常量提取到 `$defs`，inputSchema 用 `$ref` 引用
- 工具 description 压缩到 ≤200 字符（去除"用例提示"，移到 workflow.md）

---

## 9. 同步影响清单（必须在同一 MR 完成）

### 9.1 代码

- [ ] `packages/core/src/tools/smartmoney.ts` —— 重写整个 `registerSmartmoneyTools()`
- [ ] `packages/core/src/tools/types.ts` —— 如有 type alias 同步
- [ ] `packages/cli/src/commands/smartmoney.ts` —— CLI 命令 1:1 重命名
- [ ] `packages/cli/src/cli-registry.ts` —— 命令注册同步
- [ ] `packages/cli/src/index.ts` —— 入口同步

### 9.2 测试

- [ ] `packages/core/test/tools.test.ts` —— tool 注册测试更新
- [ ] `packages/cli/test/smartmoney-routing.test.ts` —— CLI 路由 / 参数传递测试全部重写
- [ ] 新增：`pnlTier` / `winRateTier` 等参数路由专项测试（防止再发生 issue #78 类型 footgun）
- [ ] 新增：`/signal` 端点 ts 自动填充行为的 handler 单测（验证 floor-to-hour 逻辑）

### 9.3 文档

- [ ] `docs/modules/smartmoney.md` —— 模块文档全量更新
- [ ] `docs/designs/smartmoney.md` —— 标记为「已陈旧，参见 redesign」
- [ ] `docs/module-registry.md` —— tool 数 8 → 10，附 token 预算说明
- [ ] `docs/cli-reference.md` —— CLI 命令重命名同步
- [ ] `CHANGELOG.md` / `CHANGELOG.zh-CN.md` —— BREAKING + 迁移表 + 删除字段列表
- [ ] `README.md` / `README.zh-CN.md` —— 模块特性计数 / 卖点同步
- [ ] `context-kg/business/01-overview.md` —— 业务侧 overview 更新

### 9.4 Skills（agent-skills 仓库）

- [ ] `skills/okx-cex-smartmoney/SKILL.md` —— 工具列表 / 输出说明全量更新
- [ ] `skills/okx-cex-smartmoney/references/trader-commands.md` —— CLI 命令对照
- [ ] `skills/okx-cex-smartmoney/references/workflows.md` —— 引导用例改名
- [ ] 同步覆盖 v2 / v3 副本（`okx-cex-smartmoney-v2`、`okx-cex-smartmoney-v3`）

### 9.5 发布

- [ ] 发布 minor 版本（建议 1.x.0）
- [ ] 所有 skill 的 `metadata.version` 同步（按 CLAUDE.md「Stable Release: Skill Version Sync」要求）
- [ ] tag 后调用飞书 release bot 通知

---

## 10. 待确认 / 已确认决策

| # | 项 | 状态 |
|---|---|---|
| 1 | 合并 `traders_by_authors` 与 `traders_performance` → `get_trader_performance` | ✅ 已确认 |
| 2 | `trader_records` → `trader_order_history`（取代 `trade_history`） | ✅ 已确认（跨模块语言一致） |
| 3 | `pnlTier` / `winRateTier` / `maxDrawdownTier` / `aumTier` / `sortBy` 参数 tier 化重命名 | ✅ 已确认 |
| 4 | 返回字段连带改名（`winRatio` → `winRate`，`maxRetreat` → `maxDrawdown`） | ✅ 已确认（保持入参/返回对齐） |
| 5 | 删除 `get_trader_detail` 聚合复合工具 | ✅ 已确认（原子化） |
| 6 | 不引入 `search_trader_by_name`（本期不做） | ✅ 已确认 |
| 7 | 移除 `instType` 入参（SWAP-only） | ✅ 已确认（PM 讨论 + 后端） |
| 8 | Signal 家族 + Trader 家族公开层统一 `instId`；Trader 家族 handler 内部 `extractBaseCcy` 转发上游 base-ccy 过滤 | ✅ 已确认 |
| 9 | 删除 `get_coin_signals`（多币批量），后端 `/overview` 不再支持 `instCcyList` | ✅ 已确认（后端调整） |
| 10 | 入参移除 `dataVersion`，仅用 `ts`；ts UTC 归一化到小时 | ✅ 已确认（后端调整） |
| 11 | 出参移除 `ts`，仅返回 `dataVersion` | ✅ 已确认（后端调整） |
| 12 | `/signal` 端点 ts 自动填当前小时（不暴露给用户）；`/overview`、`/signal-history` 保留 ts 入参 | ✅ 已确认（解读 A） |
| 13 | 删除输出字段：`topNUsed` / `currentPrice` / `fundingRate` / `openInterest` / `priceChange24h` / `longShortAccountRatio` | ✅ 已确认（后端调整） |
| 14 | 不保留旧 tool 名 alias（一刀切 BREAKING） | ⏳ 待最终确认 |
| 15 | `period` 参数默认值（删除 / 默认 90） | ⏳ 待最终确认（PM 讨论中） |

---

## 11. 不在本期范围

- `smartmoney_search_trader_by_name`（nickname 解析）—— 需上游接口配合，下期评估
- 共享枚举 `$defs` token 优化 —— 实测超预算后再做
- 多站点适配（当前仅 global 端点） —— 端点本身未多站点化

---

## 12. 2026-04-30 设计反转：`instCcyList` 回归 + overview 多币模式 + trend 时间窗区间化

> **状态**：⏳ Pending backend coordination — MCP 层已实施，依赖 backend `/overview` 与 `/signal-history` 协同更新

### 12.1 反转项

下表覆盖之前已 ✅ 确认的多条决议：

| § | 旧决议（已被覆盖） | 新决议（2026-04-30） | 理由 |
|---|---|---|---|
| §3.1 行 7 | ~~`/overview` 删除 `instCcyList`，多币批量场景不实现~~ | **`/overview` 重新接受 `instCcyList`**；多币能力合并进 `signal_overview_by_filter` / `signal_overview_by_trader`，不再单独引入 `get_coin_signals` 工具 | AI agent 在"指定一组币 + 一组 trader / pool filter 看快照"的需求高频，handler 多次单币循环代价大（rate-limit + 时延）；让 backend 重新支持是更优解 |
| §4.3 `/overview` 移除 `instCcyList` | ~~进一步移除 `instCcyList` 入参（仅保留 `topInstruments`）~~ | **保留 `topInstruments`，加回 `instCcyList`，新增 `authorIds`**（2选1：`topInstruments` ⊻ `instCcyList`）；`authorIds` 与上述选择正交，启用"按特定 trader 群体聚合多币" | 满足 §12 反转；MCP 层 schema 落地参见 `signal_overview_by_filter` / `signal_overview_by_trader` |
| §10 表格行 9 | ~~删除 `get_coin_signals`（多币批量），后端 `/overview` 不再支持 `instCcyList`~~ | 多币能力**合并**到 `signal_overview_by_*` 而非引入新工具；后端**已确认**重新支持 `instCcyList`（pending 上线） | 同上 |
| §10 表格行 10/12 | ~~曾尝试将 `/signal-history` 改为 `[startTime, endTime]` 区间~~ | **回退到锚点模式**：`asOfTime`（10 位 `yyyyMMddHH` UTC）+ `limit` 桶数；缺省锚点=当前 UTC 整点 | 后端 `/signal-history` 文档（2026-05-01）明确为锚点模式；MCP 层与上游对齐，避免 schema 偏离 |
| §10 表格行 11（出参 `dataVersion`） | `yyyyMMddHHmm`（12 位） | **`yyyyMMddHH`（10 位）** | 与上游 `signal-history` 文档一致 |
| §3.1 行 11 「`get_signal_trend_by_trader` 后端 authorIds 待确认」 | ⏳ TODO | **已确认**：上游 `/signal-history` 接受 `authorIds`，与档位池取交集（phase-1 池）；MCP 层暴露同一组档位过滤器 | 与上游文档对齐 |

### 12.2 受影响的 MCP tool 终态（与第 5 节一致）

设计反转后 Signal 家族最终形态为 **4 个工具**（删去 `smartmoney_get_top_coin_signals`，由 `signal_overview_by_filter` 默认 `topInstruments=20` 覆盖其语义）：

| Tool | 必填 | 可选 | 备注 |
|---|---|---|---|
| `smartmoney_get_signal_overview_by_filter` | — | topInstruments / instCcyList（二选一，默认 topInstruments=20）, sortBy, period, pnlTier, winRateTier, maxDrawdownTier, aumTier, lmtNum (default 100, max 2000) | 不暴露任何 `ts` 入参；handler 固定取当前小时 |
| `smartmoney_get_signal_overview_by_trader` | authorIds | topInstruments / instCcyList（二选一） | **业务场景拆分**:`_by_trader` 走 authorIds 直查,**不暴露**池过滤器入参;后端使用默认池配置 |
| `smartmoney_get_signal_trend_by_filter` | instCcy | asOfTime, granularity (1h/1d), limit (default 24, max 500), sortBy, period, pnlTier, winRateTier, maxDrawdownTier, aumTier, lmtNum (default 100, max 2000) | `asOfTime` 缺省=当前 UTC 整点；返回截止该锚点向前 `limit` 个桶 |
| `smartmoney_get_signal_trend_by_trader` | authorIds, instCcy | asOfTime, granularity (1h/1d), limit (default 24) | **业务场景拆分**:`_by_trader` 走 authorIds 直查,**不暴露**池过滤器入参;后端使用默认池配置 |

互斥校验：`topInstruments` 与 `instCcyList` 同时传入时返回 `actionableError`；两者皆不传时走 `topInstruments=20` 默认。

Trader 家族最终形态为 **6 个工具**：详见第 5.1 节。新增 `smartmoney_search_trader`（按昵称搜索 Top Trader → authorId）。

### 12.3 Backend 协调状态

MCP 层（含 mutex 校验、`PATH_OVERVIEW` / `PATH_SIGNAL_HISTORY` 透传）已落地，backend 协同需求：

**Overview 端点（`signal_overview_by_filter` / `signal_overview_by_trader`）**：
- `/api/v5/journal/smartmoney/overview` 重新接受 `instCcyList` 入参
- `/api/v5/journal/smartmoney/overview` 接受 `authorIds` 入参

**Signal-history 端点（`signal_trend_by_filter` / `signal_trend_by_trader`）**：
- `/api/v5/journal/smartmoney/signal-history` 使用 `asOfTime`（10 位 `yyyyMMddHH` UTC，缺省=当前小时） + `limit` 桶数（与上游 2026-05-01 文档一致）
- `/api/v5/journal/smartmoney/signal-history` 接受 `authorIds` 入参；与档位池取交集（phase-1 池）

具体后端响应字段差异见 [`smartmoney-backend-diff.md`](./smartmoney-backend-diff.md)。

### 12.4 同步要做的文档修订

- ~~`docs/modules/smartmoney.md`：删除"多币批量已不支持，请改为多次 `signal_overview_by_filter` 并发"的迁移指引~~（实际改为"`signal_overview_by_*` 内置多币模式"）
- `CHANGELOG.md` / `CHANGELOG.zh-CN.md`：新增 entry 标记本次反转
- `skills/okx-cex-smartmoney/SKILL.md`：同步多币用法示例
- `skills/okx-cex-smartmoney/references/signal-commands.md`：补 `--instCcyList` 说明

---

## 13. 2026-05-06 业务场景驱动:`_by_trader` 收紧入参

### 13.1 反转项

§12.1 中 "`authorIds` 与档位池取交集（phase-1 池）" 的暴露策略被覆盖。新决议:

| 项 | 旧 | 新 |
|---|---|---|
| `signal_overview_by_trader` 入参 | `authorIds` + `topInstruments`/`instCcyList` + sortBy/period/pnlTier/winRateTier/maxDrawdownTier/aumTier/lmtNum | **仅** `authorIds` + `topInstruments`/`instCcyList` |
| `signal_trend_by_trader` 入参 | `authorIds` + `instCcy` + asOfTime/granularity/limit + sortBy/period/pnlTier/winRateTier/maxDrawdownTier/aumTier/lmtNum | **仅** `authorIds` + `instCcy` + asOfTime/granularity/limit |
| 池过滤行为 | MCP 透传给后端,与 authorIds 取交集 | MCP 不透传,**后端使用默认池配置** |

### 13.2 拆分轴

`_by_filter` vs `_by_trader` 的语义不再是"是否提供 authorIds",而是**业务场景**:

- **`_by_filter`(tier 探索场景)**:用户不知道具体 trader,通过 PnL/win-rate/drawdown/AUM 档位筛池子。完整暴露 pool filter 套件。
- **`_by_trader`(authorIds 直查场景)**:用户已通过 `_get_traders_by_filter` / `_search_trader` 锁定 trader 列表,只想看这群人的共识。MCP 不暴露池参数,后端兜底默认池。

### 13.3 设计动机

1. inputSchema 在两个轴上 disjoint(只有 `_by_filter` 有 tier 参数,只有 `_by_trader` 有 authorIds),AI agent 看 schema 即可消歧,不依赖 description 中的 negative space("Do NOT use without authorIds")。
2. 收回 §12 的"两边都暴露 + 取交集"模型 — 该模型让两个工具语义高度重叠,违反 mcp-builder 的 atomic-and-narrow 原则。
3. CHANGELOG / Skill / CLI 的 `_by_trader` usage 全面收缩。

### 13.4 同步要做的修订(已落地)

- `packages/core/src/tools/smartmoney.ts`:S2/S4 inputSchema 与 handler 不再 spread `SIGNAL_POOL_FILTER_PROPS` 与 `lmtNum`;description 中删除"intersected with the tier-filtered pool"等表述。
- `packages/cli/src/commands/smartmoney.ts` + `index.ts` + `cli-registry.ts`:S2/S4 CLI 命令删除池参数 flag,usage 字符串收缩。
- `packages/core/test/tools.test.ts`:S2/S4 单测断言"drops pool filter params and lmtNum"。
- `packages/cli/test/smartmoney-routing.test.ts`:S2/S4 routing 测试断言池 flag 被 drop。
- `docs/modules/smartmoney.md` / `smartmoney.tools.md`:S2/S4 入参表与说明同步。
- `CHANGELOG.md` / `CHANGELOG.zh-CN.md`:新 entry。
- `skills/okx-cex-smartmoney*`:用法示例同步。

---

## 14. 2026-05-06 mcp-builder 审查后续:数组化 + leaderboard 重命名 + posSide 派生

### 14.1 数组化 `authorIds` / `instCcyList`(P1 #4)

- **决议**:public input shape 从 `string`(逗号分隔)改为 `string[]`,handler 内部 `.join(",")` 转上游。
- **理由**:mcp-builder best-practice 推荐 Zod-style array;字符串拆分让 LLM 容易传错形状,数组 schema 在 input 阶段就能拦下。
- **影响范围**:`smartmoney_get_performance_by_trader`(authorIds);`smartmoney_get_signal_overview_by_filter`(instCcyList);`smartmoney_get_signal_overview_by_trader`(authorIds + instCcyList);`smartmoney_get_signal_trend_by_trader`(authorIds)。
- **CLI parity**:`--authorIds 1001,1002` 与 `--instCcyList BTC,ETH` 的 flag 形式保留(人类友好),`commands/smartmoney.ts` 在调 MCP tool 前 `csvToArray()` 拆分。
- 抽出 `readArrayAsCsv` 共用 helper(在 smartmoney.ts 内,使用 `helpers.readStringArray`)。

### 14.2 Leaderboard 数值阈值重命名(P1 #5)

- **决议**:`pnl` → `minPnl`、`winRate` → `minWinRate`、`asset` → `minAum`(`maxDrawdown` 保留)。Handler 通过 `LEADERBOARD_FILTER_UPSTREAM_NAMES` 映射回上游名(`pnl` / `winRate` / `asset` 上游不变)。
- **理由**:旧名 `pnl`(数值阈值)与 signal 家族 `pnlTier`(枚举)命名空间重叠,AI agent 极易交叉误传 — 而误传都是**静默 no-op**(agent 拿不到错误信号)。新的 `min*` / `max*` 前缀与 `*Tier` 后缀语义性互斥,从命名层面消除歧义。
- **§4.4 旧设计推翻**:原设计明确"leaderboard 因为是数值阈值,保留朴素名称",理由是"intra-tool 入参/返回字段对齐"。但本次发现的 footgun 是 **inter-tool**(leaderboard ↔ signal)而非 intra-tool,旧理由失效。新设计中 input 命名是阈值语义(`minPnl`),output 是值语义(`pnl`),**入参与返回名不一致正是正确做法** — 它们指代不同事物(threshold vs actual value)。

### 14.3 派生 `direction` 字段(P1 #10)

- **决议**:`smartmoney_get_trader_positions` 输出每条 posData 增加 `direction: "long" | "short"`(handler 计算);保留原 `posSide`。
- **理由**:上游 `posSide=both` 表示净仓/单向模式,方向藏在 `pos` 数值符号里。AI agent 几乎不会处理这个 case,导致基于 posSide 的下游决策对净仓模式 trader 失效。派生字段把语义直接平铺给 agent,代价仅是 outputSchema 一个 enum 字段。
- **退化处理**:`posSide=both` 且 `pos=0` 时不派生 direction(无方向可判),保持 outputSchema 的 enum 严格性。

### 14.4 已同步落地

- 代码:`packages/core/src/tools/smartmoney.ts`(三处 schema/handler);`packages/cli/src/commands/smartmoney.ts` + `parser.ts` + `index.ts` + `cli-registry.ts`(flag 重命名 + csvToArray)。
- 测试:`packages/core/test/tools.test.ts`(数组形态 + leaderboard 映射 + direction 派生三组用例);`packages/cli/test/smartmoney-routing.test.ts`(flag → array 路由)。
- 文档:`docs/modules/smartmoney.md` + `smartmoney.tools.md`(入参表);`docs/cli-reference.md` + `skills/okx-cex-smartmoney/SKILL.md` + `references/{trader,signal}-commands.md` + `workflows.md`(用法示例)。
- CHANGELOG:新 BREAKING entry。
