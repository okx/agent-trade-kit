# Smart Money 模块 Tool 参考表

> **用途**：smartmoney 模块 10 个 MCP Tool 全字段速查表，可直接粘贴到飞书 Wiki/Doc。
> **最后更新**：2026-04-29
> **关联设计文档**：[smartmoney.md](./smartmoney.md)

---

## 表 1：总览

| # | Tool 名称 | 用途 | API Path | 读/写 |
|---|---|---|---|---|
| 1 | smartmoney_get_traders_by_filter | 浏览/筛选牛人榜，按 PnL/胜率/回撤/AUM 阈值过滤+排序 | GET /api/v5/orbit/public/leaderboard | READ |
| 2 | smartmoney_get_traders_by_id | 按 authorIds 批量查询交易员 PnL/胜率/回撤画像 | GET /api/v5/orbit/public/leaderboard | READ |
| 3 | smartmoney_get_trader_positions | 单个交易员当前开仓持仓 | GET /api/v5/orbit/public/position-current | READ |
| 4 | smartmoney_get_trader_positions_history | 单个交易员已平仓历史，posId 游标分页 | GET /api/v5/orbit/public/position-history | READ |
| 5 | smartmoney_get_trader_orders_history | 单个交易员近期订单/成交，ordId 游标分页 | GET /api/v5/orbit/public/trade-records | READ |
| 6 | smartmoney_get_top_coin_signals | 多币种快照，按 tradersWithPosition DESC 排（最热币靠前） | GET /api/v5/journal/smartmoney/overview | READ |
| 7 | smartmoney_get_signal_overview_by_filter | 单币种共识信号（pool 档位筛选聚合） | GET /api/v5/journal/smartmoney/signal | READ |
| 8 | smartmoney_get_signal_overview_by_trader | 单币种共识信号（指定 authorIds 池） | GET /api/v5/journal/smartmoney/signal | READ |
| 9 | smartmoney_get_signal_trend_by_filter | 单币种信号时间序列（pool 档位筛选） | GET /api/v5/journal/smartmoney/signal-history | READ |
| 10 | smartmoney_get_signal_trend_by_trader | 单币种信号时间序列（指定 authorIds 池） | GET /api/v5/journal/smartmoney/signal-history | READ |

## 表 2：必填参数

| # | Tool | 必填参数 |
|---|---|---|
| 1 | smartmoney_get_traders_by_filter | — |
| 2 | smartmoney_get_traders_by_id | authorIds |
| 3 | smartmoney_get_trader_positions | authorId |
| 4 | smartmoney_get_trader_positions_history | authorId |
| 5 | smartmoney_get_trader_orders_history | authorId |
| 6 | smartmoney_get_top_coin_signals | — |
| 7 | smartmoney_get_signal_overview_by_filter | instId |
| 8 | smartmoney_get_signal_overview_by_trader | instId, authorIds |
| 9 | smartmoney_get_signal_trend_by_filter | instId, ts |
| 10 | smartmoney_get_signal_trend_by_trader | instId, authorIds, ts |

## 表 3：可选参数

| # | Tool | 可选参数 | 默认/说明 |
|---|---|---|---|
| 1 | smartmoney_get_traders_by_filter | updateTime, sortBy, period, pnl, winRate, maxDrawdown, asset, after, before, limit | sortBy=pnl, period=90, limit=10 |
| 2 | smartmoney_get_traders_by_id | period | period=90 |
| 3 | smartmoney_get_trader_positions | instId | 接受完整 instId（如 BTC-USDT-SWAP）或 base ccy（如 BTC），handler 提取 base 转发上游 |
| 4 | smartmoney_get_trader_positions_history | instId, after, before, limit | limit=10 |
| 5 | smartmoney_get_trader_orders_history | instId, after, before, limit | limit=10 |
| 6 | smartmoney_get_top_coin_signals | ts, sortBy, pnlTier, winRateTier, maxDrawdownTier, aumTier, period, lmtNum, topInstruments | ts 空=本小时整点, lmtNum=100, topInstruments=20 |
| 7 | smartmoney_get_signal_overview_by_filter | sortBy, pnlTier, winRateTier, maxDrawdownTier, aumTier, period, lmtNum | ts handler 自填本小时, lmtNum=100 |
| 8 | smartmoney_get_signal_overview_by_trader | lmtNum | ts handler 自填本小时, lmtNum=100 |
| 9 | smartmoney_get_signal_trend_by_filter | granularity, limit, sortBy, pnlTier, winRateTier, maxDrawdownTier, aumTier, period | granularity=1h, limit=24 |
| 10 | smartmoney_get_signal_trend_by_trader | granularity, limit, lmtNum | granularity=1h, limit=24, lmtNum=100 |

## 表 4：主要输出字段

| # | Tool | 主要输出字段（data 数组每项） |
|---|---|---|
| 1 | smartmoney_get_traders_by_filter | authorId, nickName, pnl, pnlRatio, asset, winRate, maxDrawdown, onboardDuration, updateTime, portrait, rates |
| 2 | smartmoney_get_traders_by_id | authorId, nickName, pnl, pnlRatio, asset, winRate, maxDrawdown, onboardDuration, updateTime, portrait, rates |
| 3 | smartmoney_get_trader_positions | posId, instId, instType, posSide, lever, openAvgPx, openMaxAmount, notionalUsd, ctVal, conviction |
| 4 | smartmoney_get_trader_positions_history | posId, instId, instType, ctVal, posSide, lever, mgnMode, marginCcy, quoteCcy, openAvgPx, closeAvgPx, openMaxAmount, closeAmount, realizedPnl, pnl, pnlRatio, fee, fundingFee, liquidationStatus, closeType, cTime, uTime |
| 5 | smartmoney_get_trader_orders_history | ordId, instId, displayId, instType, baseName, quoteName, tradeQuoteCcy, side, posSide, fillSz, fillPx |
| 6 | smartmoney_get_top_coin_signals | instId, longRatio, weightedLongRatio, tradersWithPosition, netNotionalUsdt, vs24h, tradersTotal, tradersQualified, dataVersion |
| 7 | smartmoney_get_signal_overview_by_filter | instId, longRatio, weightedLongRatio, avgLongWinRate, avgShortWinRate, longTraders, shortTraders, tradersWithPosition, tradersTotal, longNotionalUsdt, shortNotionalUsdt, netNotionalUsdt, totalNotionalVs24h, smartMoneyLongAvgEntry, smartMoneyShortAvgEntry, vs1h, vs24h, vs7d, dataVersion |
| 8 | smartmoney_get_signal_overview_by_trader | 同 #7 |
| 9 | smartmoney_get_signal_trend_by_filter | instId, longRatio, weightedLongRatio, tradersWithPosition, netNotionalUsdt, totalNotionalUsdt, tradersTotal, tradersQualified, dataVersion |
| 10 | smartmoney_get_signal_trend_by_trader | 同 #9 |

## 表 5：分页字段

| # | Tool | 分页字段 |
|---|---|---|
| 1 | smartmoney_get_traders_by_filter | hasMore, nextAfter（authorId 游标） |
| 4 | smartmoney_get_trader_positions_history | hasMore, nextAfter（posId 游标） |
| 5 | smartmoney_get_trader_orders_history | hasMore, nextAfter（ordId 游标） |

> 其余 7 个 tool 不分页。

## 表 6：Signal Pool Filter 档位（Tool 6/7/9 用）

| Public 名 | 取值 | 默认 | 上游 API key | 说明 |
|---|---|---|---|---|
| sortBy | pnl, pnlRatio | pnl | sortType | 池排序键 |
| pnlTier | PNL_ANY, PNL_TOP50, PNL_TOP20, PNL_TOP5 | PNL_ANY | pnl | PnL 百分位档（TOP5=≥P95） |
| winRateTier | WR_ANY, WR_GE_50, WR_GE_80 | WR_ANY | winRatio | 最低胜率档 |
| maxDrawdownTier | MD_ANY, MD_LE_20, MD_LE_50 | MD_ANY | maxRetreat | 最大回撤上限档 |
| aumTier | AUM_ANY, AUM_TOP50, AUM_TOP20, AUM_TOP5 | AUM_ANY | asset | AUM 百分位档 |
| period | 3, 7, 30, 90 | 90 | period | 胜率评估窗口（天） |

## 表 7：Leaderboard Pool Filter 数值阈值（Tool 1 用）

| Public 名 | 类型 | 默认 | 上游 API key | 说明 |
|---|---|---|---|---|
| sortBy | enum pnl/pnlRatio | pnl | sortBy | 排序键 |
| period | enum 3/7/30/90 | 90 | period | 表现回看窗口（天） |
| pnl | string | — | pnl | 最低 PnL（USD 数值） |
| winRate | string | — | winRatio | 最低胜率（0~1 小数） |
| maxDrawdown | string | — | maxRetreat | 最大回撤上限（0~1 小数） |
| asset | string | — | asset | 最低 AUM（USD 数值） |

## 表 8：响应包络（所有 tool 通用）

| 字段 | 类型 | 说明 |
|---|---|---|
| endpoint | string | 上游 API path（debug/audit） |
| requestTime | string | ISO-8601 请求时间 |
| data | array/object | 业务主体（见表 4） |
| dataVersion | string | yyyyMMddHHmm UTC 快照版本（如 `202604282000`，分钟位恒为 `00`） |
| pagination | object | 仅游标分页 tool 有，含 hasMore/nextAfter |

---

## 共用约定

- 全部 `isWrite: false` + `READ_ONLY_ANNOTATIONS`（readOnlyHint:true, idempotentHint:true, openWorldHint:true, destructiveHint:false）
- 速率限制：所有 tool 共享 `SMARTMONEY_RPS` 常量
- 认证：全部走 `privateGet`（API Key 或 OAuth）
- `ts` 时间锚：3 个 signal 类工具（Tool 6/7/8）handler 内部 floor 到本小时整点，省略即取最新；signal_history 类（Tool 9/10）`ts` 必填但同样会 floor 对齐
- 命名约定：Public 字段名（winRate / maxDrawdown / pnlTier）与上游 API 字段名（winRatio / maxRetreat / pnl）通过映射函数对接，避免暴露 legacy 命名给 agent
