# Smart Money 模块 Tool 参考表

> **用途**：smartmoney 模块 10 个 MCP Tool 全字段速查表，可直接粘贴到飞书 Wiki/Doc。
> **最后更新**：2026-05-01（10-tool 终态：6 trader + 4 signal；已包含 `smartmoney_search_trader`；`signal_trend_*` 改为 `asOfTime` 锚点 + `limit` 桶数；signal pool filter 公开名 == 上游 API key（不再 rename）；`maxDrawdownTier` 枚举为 `MR_*`；`top_coin_signals` 已删除）
> **关联设计文档**：[smartmoney.md](./smartmoney.md)

---

## 表 1：总览

| # | Tool 名称 | 用途 | API Path | 读/写 |
|---|---|---|---|---|
| T1 | smartmoney_get_traders_by_filter | 浏览/筛选牛人榜，按 PnL/胜率/回撤/AUM 阈值过滤+排序 | GET /api/v5/orbit/public/leaderboard | READ |
| T2 | smartmoney_get_performance_by_trader | 按 authorIds 批量查询交易员 PnL/胜率/回撤画像 | GET /api/v5/orbit/public/leaderboard | READ |
| T3 | smartmoney_get_trader_positions | 单个交易员当前开仓持仓 | GET /api/v5/orbit/public/position-current | READ |
| T4 | smartmoney_get_trader_positions_history | 单个交易员已平仓历史，posId 游标分页 | GET /api/v5/orbit/public/position-history | READ |
| T5 | smartmoney_get_trader_orders_history | 单个交易员近期订单/成交，ordId 游标分页 | GET /api/v5/orbit/public/trade-records | READ |
| T6 | smartmoney_search_trader | 按昵称关键词搜索 Top Trader（≤10 条，按 OKX 平台粉丝数倒序） | GET /api/v5/orbit/top-trader-search | READ |
| S1 | smartmoney_get_signal_overview_by_filter | 多币种共识信号（pool 档位筛选聚合，topInstruments / instCcyList 二选一） | GET /api/v5/journal/smartmoney/overview | READ |
| S2 | smartmoney_get_signal_overview_by_trader | 多币种共识信号（指定 authorIds 池，topInstruments / instCcyList 二选一） | GET /api/v5/journal/smartmoney/overview | READ |
| S3 | smartmoney_get_signal_trend_by_filter | 单币种信号时间序列（pool 档位筛选；锚定 `asOfTime`，向前取 `limit` 桶） | GET /api/v5/journal/smartmoney/signal-history | READ |
| S4 | smartmoney_get_signal_trend_by_trader | 单币种信号时间序列（指定 authorIds 与档位池取交集；锚定 `asOfTime`，向前取 `limit` 桶） | GET /api/v5/journal/smartmoney/signal-history | READ |

## 表 2：必填参数

| # | Tool | 必填参数 |
|---|---|---|
| T1 | smartmoney_get_traders_by_filter | — |
| T2 | smartmoney_get_performance_by_trader | authorIds |
| T3 | smartmoney_get_trader_positions | authorId |
| T4 | smartmoney_get_trader_positions_history | authorId |
| T5 | smartmoney_get_trader_orders_history | authorId |
| T6 | smartmoney_search_trader | keyword |
| S1 | smartmoney_get_signal_overview_by_filter | — |
| S2 | smartmoney_get_signal_overview_by_trader | authorIds |
| S3 | smartmoney_get_signal_trend_by_filter | instCcy |
| S4 | smartmoney_get_signal_trend_by_trader | authorIds, instCcy |

## 表 3：可选参数

| # | Tool | 可选参数 | 默认/说明 |
|---|---|---|---|
| T1 | smartmoney_get_traders_by_filter | updateTime, sortBy, period, pnl, winRate, maxDrawdown, asset, after, before, limit | sortBy=pnl, period=90, limit=10 |
| T2 | smartmoney_get_performance_by_trader | period | period=90 |
| T3 | smartmoney_get_trader_positions | instId | 接受完整 instId（如 BTC-USDT-SWAP）或 base ccy（如 BTC），handler 提取 base 转发上游 |
| T4 | smartmoney_get_trader_positions_history | instId, after, before, limit | limit=10；instId 接受完整 instId 或 base ccy |
| T5 | smartmoney_get_trader_orders_history | instId, after, before, limit | limit=10；instId 接受完整 instId 或 base ccy |
| T6 | smartmoney_search_trader | — | 单参 `keyword`，必填且非空白 |
| S1 | smartmoney_get_signal_overview_by_filter | topInstruments, instCcyList, sortBy, period, pnlTier, winRateTier, maxDrawdownTier, aumTier, lmtNum | `topInstruments` 与 `instCcyList` **互斥二选一**（默认 topInstruments=20）, lmtNum=100 (max 2000)；handler 始终取当前小时 |
| S2 | smartmoney_get_signal_overview_by_trader | topInstruments, instCcyList, sortBy, period, pnlTier, winRateTier, maxDrawdownTier, aumTier, lmtNum | `topInstruments` 与 `instCcyList` **互斥二选一**（默认 topInstruments=20），lmtNum=100 (max 2000)；handler 始终取当前小时；`authorIds` 与档位池取交集 |
| S3 | smartmoney_get_signal_trend_by_filter | asOfTime, granularity, limit, sortBy, period, pnlTier, winRateTier, maxDrawdownTier, aumTier, lmtNum | granularity=1h, limit=24, lmtNum=100 (max 2000)；asOfTime 缺省=当前 UTC 整点；`instCcy` 必填 |
| S4 | smartmoney_get_signal_trend_by_trader | asOfTime, granularity, limit, sortBy, period, pnlTier, winRateTier, maxDrawdownTier, aumTier, lmtNum | 同 S3；`authorIds` 与 `instCcy` 必填，`authorIds` 与档位池取交集 |

## 表 4：主要输出字段

| # | Tool | 主要输出字段（data 数组每项） |
|---|---|---|
| T1 | smartmoney_get_traders_by_filter | authorId, nickName, pnl, pnlRatio, asset, winRate, maxDrawdown, onboardDuration, portrait, rates |
| T2 | smartmoney_get_performance_by_trader | authorId, nickName, pnl, pnlRatio, asset, winRate, maxDrawdown, onboardDuration, portrait, rates |
| T3 | smartmoney_get_trader_positions | posId, instId, instType, posSide, posCcy, quoteCcy, pos, lever, avgPx, last, notionalUsd, upl, pnl, cTime, positionIntensity |
| T4 | smartmoney_get_trader_positions_history | posId, instId, instType, ctVal, posSide, lever, mgnMode, marginCcy, quoteCcy, openAvgPx, closeAvgPx, openMaxAmount, closeAmount, realizedPnl, pnl, pnlRatio, fee, fundingFee, liquidationStatus, closeType, cTime, uTime |
| T5 | smartmoney_get_trader_orders_history | ordId, instId, displayId, instType, baseName, quoteName, tradeQuoteCcy, side, posSide, ordType, lever, px, avgPx, sz, value, cTime, fillTime, uTime |
| T6 | smartmoney_search_trader | authorId, nickName, followerCount |
| S1 | smartmoney_get_signal_overview_by_filter | **外层** ccy, dataVersion (`yyyyMMddHH`), tradersWithPosition, tradersQualified, longTraders, shortTraders ／ **`notional`** longNotionalUsdt, shortNotionalUsdt, netNotionalUsdt, totalNotionalUsdt, totalNotionalVs24h, smartMoneyLongAvgEntry, smartMoneyShortAvgEntry ／ **`longShortRatio`** longRatioVs1h, longRatioVs24h, longRatioVs7d, longRatio, shortRatio, weightedLongRatio, weightedShortRatio ／ **`winRate`** avgLongWinRate, avgShortWinRate |
| S2 | smartmoney_get_signal_overview_by_trader | 同 S1 |
| S3 | smartmoney_get_signal_trend_by_filter | ccy, dataVersion (`yyyyMMddHH`), longRatio, shortRatio, weightedLongRatio, weightedShortRatio, longTraders, shortTraders, tradersWithPosition, tradersQualified, netNotionalUsdt, totalNotionalUsdt |
| S4 | smartmoney_get_signal_trend_by_trader | 同 S3 |

> T1 / T2 在响应**顶层**（不在 `data[]` 行内）额外返回 `updateTime`（`yyyyMMddHHmm` UTC+8 快照版本号），由所有行共享。

## 表 5：分页字段

| # | Tool | 分页字段 |
|---|---|---|
| T1 | smartmoney_get_traders_by_filter | hasMore, nextAfter（authorId 游标） |
| T4 | smartmoney_get_trader_positions_history | hasMore, nextAfter（posId 游标） |
| T5 | smartmoney_get_trader_orders_history | hasMore, nextAfter（ordId 游标） |

> 其余 7 个 tool 不分页。

## 表 6：Signal Pool Filter 档位（S1 / S2 / S3 / S4 共用）

> 公开名 == 上游 API key（不再做重命名）。S2 / S4（`*_by_trader`）也接受这组池过滤器；`authorIds` 与档位池取交集。

| Public 名 | 取值 | 默认 | 上游 API key | 说明 |
|---|---|---|---|---|
| sortBy | pnl, pnlRatio | pnl | sortBy | 池排序键 |
| period | 3, 7, 30, 90 | 7 | period | 能力指标 (avgLongWinRate / avgShortWinRate) 与 winRateTier 的回看窗口 |
| pnlTier | PNL_ANY, PNL_TOP50, PNL_TOP20, PNL_TOP5 | PNL_ANY | pnlTier | PnL 百分位档（TOP5=≥P95） |
| winRateTier | WR_ANY, WR_GE_50, WR_GE_80 | WR_ANY | winRateTier | 最低胜率档 |
| maxDrawdownTier | MR_ANY, MR_LE_20, MR_LE_50 | MR_ANY | maxDrawdownTier | 最大回撤上限档 |
| aumTier | AUM_ANY, AUM_TOP50, AUM_TOP20, AUM_TOP5 | AUM_ANY | aumTier | AUM 百分位档 |

## 表 7：Leaderboard Pool Filter 数值阈值（T1 用）

| Public 名 | 类型 | 默认 | 上游 API key | 说明 |
|---|---|---|---|---|
| sortBy | enum pnl/pnlRatio | pnl | sortBy | 排序键 |
| period | enum 3/7/30/90 | 90 | period | 表现回看窗口（天） |
| pnl | string | — | pnl | 最低 PnL（USD 数值） |
| winRate | string | — | winRate | 最低胜率（0~1 小数） |
| maxDrawdown | string | — | maxDrawdown | 最大回撤上限（0~1 小数） |
| asset | string | — | asset | 最低 AUM（USD 数值） |

## 表 8：响应包络（所有 tool 通用）

| 字段 | 类型 | 说明 |
|---|---|---|
| endpoint | string | 上游 API path（debug/audit） |
| requestTime | string | ISO-8601 请求时间 |
| data | array/object | 业务主体（见表 4） |
| dataVersion | string | yyyyMMddHH UTC 快照版本（10 位，如 `2026043014`）。Signal 类条目返回（在每个 `data[]` 项里）；Trader 类不返回。 |
| updateTime | string | yyyyMMddHHmm UTC+8 快照版本（仅 T1 / T2 在顶层返回） |
| pagination | object | 仅游标分页 tool（T1 / T4 / T5）有，含 hasMore / nextAfter |

---

## 共用约定

- 全部 `isWrite: false` + `READ_ONLY_ANNOTATIONS`（readOnlyHint:true, idempotentHint:true, openWorldHint:true, destructiveHint:false）
- 速率限制：所有 tool 共享 `SMARTMONEY_RPS` 常量（5 RPS）
- 认证：全部走 `privateGet`（API Key 或 OAuth）
- 时间锚：
  - Overview 类（S1 / S2）**不暴露任何时间入参**，handler 内部 floor 到本小时整点
  - Trend 类（S3 / S4）可选 `asOfTime`（10 位 `yyyyMMddHH` UTC 锚点，缺省=当前 UTC 整点），`limit` 控制截止该锚点向前返回的桶数（最大 500）
  - Trader leaderboard（T1）可选 `updateTime` 快照键（`yyyyMMddHHmm` UTC+8）
- 命名约定：所有 pool filter 公开名（leaderboard 与 signal 系列）== 上游 API key，identity 透传不做重命名。
- T6 `smartmoney_search_trader`：单参 `keyword`，handler 校验非空/非空白；返回 KOL 全文召回与 Top Trader 集合的交集，按 OKX 平台粉丝数倒序，最多 10 条
