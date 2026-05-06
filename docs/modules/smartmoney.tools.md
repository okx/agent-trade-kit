# Smart Money — All Tools Reference

> 本文档梳理 Smart Money 模块下 **全部 10 个工具** 的入参、出参、字段语义，便于 reviewer / 接入方 / Agent 调用方对齐。
>
> 源码：`packages/core/src/tools/smartmoney.ts`
> 全部工具均为 read-only（`isWrite: false`），共享 `READ_ONLY_ANNOTATIONS`，单工具速率上限 `SMARTMONEY_RPS = 5` RPS。
>
> 上游接口路径：
>
> | 常量 | 路径 | 用于 |
> |---|---|---|
> | `PATH_LEADERBOARD` | `/api/v5/orbit/public/leaderboard` | T1, T2 |
> | `PATH_POSITION_CURRENT` | `/api/v5/orbit/public/position-current` | T3 |
> | `PATH_POSITION_HISTORY` | `/api/v5/orbit/public/position-history` | T4 |
> | `PATH_TRADE_RECORDS` | `/api/v5/orbit/public/trade-records` | T5 |
> | `PATH_TOP_TRADER_SEARCH` | `/api/v5/orbit/top-trader-search` | T6 |
> | `PATH_OVERVIEW` | `/api/v5/journal/smartmoney/overview` | S1, S2 |
> | `PATH_SIGNAL_HISTORY` | `/api/v5/journal/smartmoney/signal-history` | S3, S4 |

## 工具总览

| # | Tool name | 维度 | 上游 |
|---|---|---|---|
| T1 | `smartmoney_get_traders_by_filter` | 牛人榜（按 tier 过滤排序） | `/leaderboard` |
| T2 | `smartmoney_get_performance_by_trader` | 单/多个交易员业绩档案（by authorIds） | `/leaderboard` |
| T3 | `smartmoney_get_trader_positions` | 单交易员当前持仓 | `/position-current` |
| T4 | `smartmoney_get_trader_positions_history` | 单交易员历史平仓记录 | `/position-history` |
| T5 | `smartmoney_get_trader_orders_history` | 单交易员订单流水 | `/trade-records` |
| T6 | `smartmoney_search_trader` | 按昵称关键词搜索 Top Trader（解析 nickName → authorId） | `/top-trader-search` |
| S1 | `smartmoney_get_signal_overview_by_filter` | 多资产 · 当前快照（tier 过滤池；topInstruments 或 instCcyList） | `/overview` |
| S2 | `smartmoney_get_signal_overview_by_trader` | 多资产 · 当前快照（authorIds 池） | `/overview` |
| S3 | `smartmoney_get_signal_trend_by_filter` | 单资产 · 时间序列（tier 过滤池） | `/signal-history` |
| S4 | `smartmoney_get_signal_trend_by_trader` | 单资产 · 时间序列（authorIds 池） | `/signal-history` |

---

## 公共结构

### Envelope（所有工具的统一信封）

| 字段 | 类型 | 必返回 | 说明 |
|---|---|---|---|
| `endpoint` | string | ✅ | 上游 API 路径（debug/audit）。 |
| `requestTime` | string | — | 请求发起时间（ISO-8601）。 |
| `data` | array | ✅ | 业务数据（结构见各工具）。 |
| `dataVersion` | string | — | 快照版本号 `yyyyMMddHHmm`（UTC，整点小时分钟恒为 `00`）。 |
| `pagination` | object | — | 仅分页类工具返回（T1/T4/T5）。结构见下。 |

### Pagination

| 字段 | 类型 | 说明 |
|---|---|---|
| `hasMore` | boolean | `data.length` 达到 `limit` 时为 `true`，意味着可能还有下一页。 |
| `nextAfter` | string | 下一页查询的 `after` 游标。`hasMore=false` 时省略。 |

### Leaderboard Pool Filter（T1 用）

| 参数 | 类型/枚举 | 默认 | 说明 |
|---|---|---|---|
| `sortBy` | `"pnl"` / `"pnlRatio"` | `"pnl"` | 牛人榜排序键。`pnl`=USD 绝对收益；`pnlRatio`=百分比收益。 |
| `period` | `"3"` / `"7"` / `"30"` / `"90"` | `"90"` | 业绩回看窗口（天）。`90` 与 leaderboard UI 对齐。同时影响过滤与排序。 |
| `pnl` | string | — | 最低绝对 PnL（USD），数字字符串，如 `"10000"` 表示 PnL ≥ $10,000。 |
| `winRate` | string | — | 最低胜率（小数 0~1），如 `"0.8"` 表示 ≥80%。 |
| `maxDrawdown` | string | — | 最大回撤上限（小数），如 `"0.1"` 表示回撤 ≤10%。越小风险越低。 |
| `asset` | string | — | 最低 AUM（USD），数字字符串，如 `"1000"`。 |

> 公开名 == 上游 API key（identity 映射，不再做重命名）。

### Signal Pool Filter（S1/S2/S3/S4 共用）

> 与 Leaderboard 的过滤参数完全分开 —— Signal 工具用 **tier 枚举门槛**（`*Tier` 后缀），Leaderboard 用 **数值阈值**。
> 公开名 == 上游 API key（不再做重命名）。

| 参数 | 枚举 | 默认 | 说明 |
|---|---|---|---|
| `sortBy` | `"pnl"` / `"pnlRatio"` | `"pnl"` | 池筛选排序键。`pnl`=USD 绝对收益（偏向高 AUM 巨鲸）；`pnlRatio`=百分比收益（偏向高效小资金）。 |
| `period` | `"3"` / `"7"` / `"30"` / `"90"` | `"7"` | 能力指标（`avgLongWinRate` / `avgShortWinRate`）与 `winRateTier` 的回看窗口；不影响信号字段。 |
| `pnlTier` | `PNL_ANY` / `PNL_TOP50` / `PNL_TOP20` / `PNL_TOP5` | `PNL_ANY` | PnL 分位门槛：ANY=不过滤；TOP50=≥P50；TOP20=≥P80；TOP5=≥P95。 |
| `winRateTier` | `WR_ANY` / `WR_GE_50` / `WR_GE_80` | `WR_ANY` | 最低胜率门槛（固定阈值）。 |
| `maxDrawdownTier` | `MR_ANY` / `MR_LE_20` / `MR_LE_50` | `MR_ANY` | 最大回撤门槛（越小风险越低）。 |
| `aumTier` | `AUM_ANY` / `AUM_TOP50` / `AUM_TOP20` / `AUM_TOP5` | `AUM_ANY` | AUM 分位门槛。 |

> 仅 S1 / S3（`*_by_filter`）暴露这组池过滤器。S2 / S4（`*_by_trader`）按业务场景区分,池过滤参数不暴露,后端使用默认池配置(authorIds 直查场景)。

### `TRADER_ITEM_PROPS`（T1/T2 共用 item）

| 字段 | 类型 | 说明 |
|---|---|---|
| `authorId` | string | 交易员唯一 ID，可继续传给 `smartmoney_get_trader_*`。 |
| `nickName` | string | 显示昵称。 |
| `pnl` | string | `period` 窗口内的绝对 PnL（USD，数字字符串）。 |
| `pnlRatio` | string | `period` 窗口内的 PnL 比率（小数，如 `"0.35"` = +35%）。 |
| `asset` | string | 总 AUM（USD）。 |
| `winRate` | string | 终身胜率（小数 0~1）。 |
| `maxDrawdown` | string | 最大回撤（小数，如 `"0.2"` = 20%，越小风险越低）。 |
| `onboardDuration` | string | 上榜天数（数字字符串）。 |
| `portrait` | string | 头像图片 URL。 |
| `rates` | array<{statTime, value}> | 每日权益曲线 / PnL 比率时间序列。`statTime`=`YYMMDD`，`value`=该日累计 PnL 比率（小数）。 |

> 注意：`updateTime` **不在** `TRADER_ITEM_PROPS` 行内字段里 —— 它由 T1/T2 在响应**顶层** envelope 返回，所有行共享同一个 `updateTime`（`yyyyMMddHHmm` UTC+8 快照版本）。

---

## T1. `smartmoney_get_traders_by_filter`

**用途：** 按 tier 阈值过滤并按 `sortBy` 排序的牛人榜列表。用于"发现高表现交易员"。要按 ID 查档案请用 T2。

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `updateTime` | string | ❌ | — | 快照版本 `yyyyMMddHHmm`（UTC+8）。省略=最新快照（约 5 分钟刷新）。 |
| `sortBy` | string | ❌ | 默认 `pnl` | 见 Leaderboard Pool Filter。 |
| `period` | string | ❌ | 默认 `90` | 见 Leaderboard Pool Filter。 |
| `pnl` | string | ❌ | — | 最低 PnL（USD）。 |
| `winRate` | string | ❌ | — | 最低胜率（小数）。 |
| `maxDrawdown` | string | ❌ | — | 最大回撤上限（小数）。 |
| `asset` | string | ❌ | — | 最低 AUM（USD）。 |
| `after` | string | ❌ | — | 游标：返回 `authorId` 小于该值的（向旧分页）。 |
| `before` | string | ❌ | — | 游标：返回 `authorId` 大于该值的（向新分页）。 |
| `limit` | integer | ❌ | 1-100，默认 10 | 单页上限。 |

### 出参

`data[]` = `TRADER_ITEM_PROPS`，附 `pagination`（游标字段为 `authorId`）。

---

## T2. `smartmoney_get_performance_by_trader`

**用途：** 按 `authorIds` 查询指定交易员的 PnL/胜率/回撤档案（支持批量）。先用 T1 找 authorIds。

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `authorIds` | string | ✅ | — | 逗号分隔 trader ID，如 `"1001,1002"`。 |
| `period` | string | ❌ | `3`/`7`/`30`/`90`，默认 `90` | 业绩回看窗口（天）。 |

### 出参

`data[]` = `TRADER_ITEM_PROPS`（**无 pagination**）。

---

## T3. `smartmoney_get_trader_positions`

**用途：** 单个交易员当前持仓（持仓方向、规模、杠杆、入场价、信念强度）。`authorId` 来自 T1。要平仓历史请用 T4。

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `authorId` | string | ✅ | — | 单个 trader ID。 |
| `instId` | string | ❌ | — | 可选合约过滤。接受完整 `BTC-USDT-SWAP` 或裸基础币 `BTC` —— handler 会提取 base ccy 给上游。 |

### 出参 `data[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `posId` | string | 持仓唯一 ID（生命周期内稳定）。 |
| `instId` | string | 合约 ID。 |
| `instType` | string | `SWAP`(永续) / `SPOT` / `FUTURES`(交割) / `MARGIN` / `OPTION`。 |
| `posSide` | string | `long`=多头；`short`=空头；`both`=单向模式（方向由 `pos` 符号编码）。 |
| `posCcy` | string | 持仓资产，如 `BTC`。 |
| `quoteCcy` | string | 报价/结算币种，如 `USDT`。 |
| `pos` | string | 仓位规模。SPOT/MARGIN 单位为币，SWAP/FUTURES/OPTION 单位为张（contracts）。 |
| `lever` | string | 杠杆倍数（spot 为 `"1"`）。 |
| `avgPx` | string | 成交量加权平均入场价。 |
| `last` | string | 最新行情/标记价。 |
| `notionalUsd` | string | 当前仓位名义价值（USD）。 |
| `upl` | string | 未实现（浮动）盈亏，按 `quoteCcy` 计价。 |
| `pnl` | string | 已实现盈亏，按 `quoteCcy` 计价。 |
| `cTime` | string | 持仓建仓时间（Unix ms 数字字符串）。 |
| `positionIntensity` | string | 信念强度 = `notionalUsd / trader.asset`（该仓位占交易员 AUM 的比例）。越高=押注比例越大。 |

---

## T4. `smartmoney_get_trader_positions_history`

**用途：** 单个交易员历史平仓记录，按 `posId` 游标分页。用于研究已实现 PnL 模式、持仓时长、连胜/连败、收尾方式（主动 vs 强平）。

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `authorId` | string | ✅ | — | 单个 trader ID。 |
| `instId` | string | ❌ | — | 可选合约过滤（同 T3，接受完整 `instId` 或裸 base ccy）。 |
| `after` | string | ❌ | — | 游标：返回 `posId` 小于该值的。 |
| `before` | string | ❌ | — | 游标：返回 `posId` 大于该值的。 |
| `limit` | integer | ❌ | 1-100，默认 10 | 单页上限。 |

### 出参 `data[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `posId` | string | 平仓单 ID（也是分页游标）。 |
| `instId` | string | 合约 ID。 |
| `instType` | string | `SWAP` / `FUTURES` / `MARGIN` / `SPOT`。 |
| `ctVal` | string | 合约面值（USD per 张），数字字符串。非合约为空/0。 |
| `posSide` | string | 平仓时方向：`long` 或 `short`。 |
| `lever` | string | 杠杆倍数。 |
| `mgnMode` | string | 保证金模式：`cross`=全仓；`isolated`=逐仓。 |
| `marginCcy` | string | 保证金币种，如 `BTC` / `USDT`。 |
| `quoteCcy` | string | 结算币种。 |
| `openAvgPx` | string | 全部开仓成交的加权均价。 |
| `closeAvgPx` | string | 全部平仓成交的加权均价。 |
| `openMaxAmount` | string | 生命周期内仓位峰值规模（张）。 |
| `closeAmount` | string | 累计平仓规模（张）。 |
| `realizedPnl` | string | 生命周期累计已实现 PnL（按 `quoteCcy`）。 |
| `pnl` | string | 最终平仓 PnL（按 `quoteCcy`）。 |
| `pnlRatio` | string | 已实现 PnL 比率（成本基础，小数，如 `"0.15"`=+15%）。 |
| `fee` | string | 累计手续费。负=支出，正=返佣。 |
| `fundingFee` | string | 累计资金费率（仅 SWAP 有意义）。负=支出，正=收入。 |
| `liquidationStatus` | string | 强平状态标志（数字字符串）。`0`=未强平；非零参考 `closeType` 判断。 |
| `closeType` | string | 收尾方式：`allClose`=全部主动平仓；`partClose`=部分平仓（罕见的终态）；`liquidateClose`=被强平；`liquidateReceive`=被强减；`adl`=自动减仓。 |
| `cTime` | string | 建仓时间（Unix ms）。 |
| `uTime` | string | 平仓时间（Unix ms）。 |

附 `pagination`（游标字段 `posId`）。

---

## T5. `smartmoney_get_trader_orders_history`

**用途：** 单个交易员近期订单流水，按 `ordId` 游标分页。命名与跨模块 `*_get_orders` 系列对齐。`authorId` 来自 T1。

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `authorId` | string | ✅ | — | 单个 trader ID。 |
| `instId` | string | ❌ | — | 可选合约过滤（同 T3）。 |
| `after` | string | ❌ | — | 游标：返回 `ordId` 小于该值的。 |
| `before` | string | ❌ | — | 游标：返回 `ordId` 大于该值的。 |
| `limit` | integer | ❌ | 1-100，默认 10 | 单页上限。 |

### 出参 `data[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `ordId` | string | 订单唯一 ID（分页游标）。 |
| `instId` | string | 合约 ID。 |
| `displayId` | string | OKX UI 展示态合约 ID。 |
| `instType` | string | `SWAP`(永续) / `SPOT`。 |
| `baseName` | string | 基础币符号，如 `BTC`。 |
| `quoteName` | string | 报价币符号，如 `USD`。 |
| `tradeQuoteCcy` | string | 实际成交结算币种。 |
| `side` | string | `buy`=开多/平空；`sell`=开空/平多。 |
| `posSide` | string | 该订单作用的仓位方向：`long` / `short`。 |
| `ordType` | string | `limit`=限价；`market`=市价。 |
| `lever` | string | 杠杆倍数（spot 为 `"1"`）。 |
| `px` | string | 委托价（市价单可能空/0）。 |
| `avgPx` | string | 成交量加权平均成交价。 |
| `sz` | string | 委托数量。SPOT 单位为币，SWAP/FUTURES 单位为张。 |
| `value` | string | 订单名义价值（按 `quoteName` 计价）。 |
| `cTime` | string | 创建时间（Unix ms）。 |
| `fillTime` | string | 最近成交时间（Unix ms）。 |
| `uTime` | string | 最后更新时间（Unix ms）。 |

附 `pagination`（游标字段 `ordId`）。

---

## T6. `smartmoney_search_trader`

**用途：** 按昵称关键词搜索 Top Trader（盈利榜上的交易员），按 OKX 平台粉丝数倒序返回 ≤10 条。后端先做 KOL 全文召回，再与 Top Trader 集合取交集。**适用：** 用户给的是昵称（"alice" / "小明"）需要解析成 `authorId`。**禁用：**
- 想发现高表现交易员 → 用 T1
- 已知 authorId 想查档案 → 用 T2

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `keyword` | string | ✅ | 非空且非空白 | 昵称搜索关键词；支持中文 / 英文。 |

### 出参 `data[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `authorId` | string | 交易员唯一 ID，可继续传给其他 `smartmoney_get_trader_*` 工具。 |
| `nickName` | string | 命中关键词的显示昵称。 |
| `followerCount` | string | OKX 平台粉丝数（不含 Twitter，数字字符串）。即排序键。 |

> 无召回 / 召回与 Top Trader 集合无交集 → 返回 `data: []`。
> **不分页**（最多 10 条）。

---

## S1. `smartmoney_get_signal_overview_by_filter`

**用途：** 多资产聪明钱共识快照，**池由 tier 过滤参数决定**。每合约返回多空比、加权入场价、资金流向、相对 1h/24h/7d 的趋势变化。

**关键约束：** `topInstruments` 与 `instCcyList` **互斥且必须二选一**（默认 `topInstruments=20`）。快照时间自动取当前小时。

**禁用场景：**
- 需限定 traders → 用 S2
- 需要时间序列 → 用 S3

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `topInstruments` | integer | 二选一 | 1-100，默认 20 | Top-N 最热合约（按 `tradersWithPosition` DESC）。 |
| `instCcyList` | string | 二选一 | — | 逗号分隔基础币种，如 `"BTC,ETH,SOL"`。 |
| `sortBy` | string | ❌ | 默认 `pnl` | 见 Signal Pool Filter。 |
| `period` | string | ❌ | 默认 `7` | 见 Signal Pool Filter（能力字段窗口）。 |
| `pnlTier` | string | ❌ | 默认 `PNL_ANY` | 见 Signal Pool Filter。 |
| `winRateTier` | string | ❌ | 默认 `WR_ANY` | 见 Signal Pool Filter。 |
| `maxDrawdownTier` | string | ❌ | 默认 `MR_ANY` | 见 Signal Pool Filter。 |
| `aumTier` | string | ❌ | 默认 `AUM_ANY` | 见 Signal Pool Filter。 |
| `lmtNum` | integer | ❌ | 1-2000，默认 100 | 拉入聚合池的 Top-N 交易员（按 `sortBy` DESC）。池越大信号越强但越慢。 |

### 出参 `data[]`（`SIGNAL_ITEM_PROPS`，嵌套结构）

每元素对应一个币种快照；信号字段按语义分到三个嵌套对象。

**外层字段：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `ccy` | string | 合约 ID（外层标识；字段名是 `ccy`，不是 `instId`）。 |
| `dataVersion` | string | 快照版本 `yyyyMMddHH`（UTC，10 位，例如 `2026043014`）。 |
| `tradersWithPosition` | integer | 在该 instId 上持仓的池内交易员数（双向 user 算 1）。 |
| `tradersQualified` | integer | 池过滤后合格的总交易员数（含未持该币种的）。 |
| `longTraders` | integer | 当前持多的池内交易员数量（含双向 user）。 |
| `shortTraders` | integer | 当前持空的池内交易员数量（含双向 user）。 |

**`notional` 子对象**（资金 / 名义价值组）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `longNotionalUsdt` | string | 多头名义价值之和（USDT）。 |
| `shortNotionalUsdt` | string | 空头名义价值之和（USDT）。 |
| `netNotionalUsdt` | string | 净方向 = long − short。 |
| `totalNotionalUsdt` | string | 总名义 = long + short。 |
| `totalNotionalVs24h` | string | (T_now − T_24h) / T_24h；正=加仓，负=撤离；无历史时 NULL。 |
| `smartMoneyLongAvgEntry` | string | 多头加权平均入场价（USDT）；无多头时 NULL。 |
| `smartMoneyShortAvgEntry` | string | 空头加权平均入场价（USDT）；无空头时 NULL。 |

**`longShortRatio` 子对象**（多空比 + 时间差分组）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `longRatioVs1h` | string | `longRatio − hist_1h.longRatio`；无历史时 NULL。 |
| `longRatioVs24h` | string | `longRatio − hist_24h.longRatio`；无历史时 NULL。 |
| `longRatioVs7d` | string | `longRatio − hist_7d.longRatio`；无历史时 NULL。 |
| `longRatio` | string | `longTraders / tradersWithPosition`；无人持仓时 NULL。 |
| `shortRatio` | string | `1 − longRatio`；无人持仓时 NULL。 |
| `weightedLongRatio` | string | `Σ(long_notional) / Σ(notional)`；无名义时 NULL。 |
| `weightedShortRatio` | string | `Σ(short_notional) / Σ(notional)`；无名义时 NULL。 |

**`winRate` 子对象**（能力 / 历史战绩组）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `avgLongWinRate` | string | 当前持多 user 在 `period` 窗口内的全市场已平仓胜率均值；样本不足返 NULL。 |
| `avgShortWinRate` | string | 当前持空 user 同上；样本不足返 NULL。 |

---

## S2. `smartmoney_get_signal_overview_by_trader`

**用途：** 多资产聪明钱信号,**池由 `authorIds` 直接限定**。用于"看 X 群体当前的共识"。按业务场景与 S1 区分:`_by_filter` 走 tier 探索,`_by_trader` 走 authorIds 直查。

**关键约束：**
- `authorIds` 必填
- `topInstruments` 与 `instCcyList` 互斥且必须二选一（默认 `topInstruments=20`）

**禁用场景：**
- 不传 `authorIds` → 用 S1
- 需要时间序列 → 用 S4

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `authorIds` | string | ✅ | — | 逗号分隔 trader ID，如 `"1001,1002"`。来源：T1 / T6。 |
| `topInstruments` | integer | 二选一 | 1-100，默认 20 | 该组中最热 Top-N 合约。 |
| `instCcyList` | string | 二选一 | — | 逗号分隔基础币种。 |

> S2 **不暴露**任何 Pool Filter / `lmtNum` 参数 — 后端在 authorIds 直查场景使用默认池配置。如需 tier 过滤池视角,请使用 S1。

### 出参 `data[]`

字段同 S1 (`SIGNAL_ITEM_PROPS`)。

---

## S3. `smartmoney_get_signal_trend_by_filter`

**用途：** 单资产聪明钱信号的**时间序列**，按 hourly/daily 桶聚合，**池由 tier 过滤参数决定**。返回截止 `asOfTime` 的最新 `limit` 个桶（缺省锚点为当前 UTC 整点）。用于追踪聪明钱多空信念与资金随时间演化（"在加仓还是撤离？"）。

**禁用场景：**
- 仅要最新快照 → 用 S1
- 限定 traders → 用 S4

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `instCcy` | string | ✅ | — | 单币 base ccy（如 `"BTC"`）。 |
| `asOfTime` | string | ❌ | 当前 UTC 整点 | 锚点时间，10 位 `yyyyMMddHH` UTC（如 `2026050100`）。返回截止该锚点的 `limit` 个桶。 |
| `granularity` | string | ❌ | `1h`/`1d`，默认 `1h` | 时间粒度。`1h` 用于日内/短线；`1d` 用于多日趋势。 |
| `limit` | integer | ❌ | 1-500，默认 24 | 返回桶数（最新优先），截止 `asOfTime` 向前。 |
| `sortBy` / `period` / `pnlTier` / `winRateTier` / `maxDrawdownTier` / `aumTier` | string | ❌ | 见 Signal Pool Filter | tier 过滤池参数。 |
| `lmtNum` | integer | ❌ | 1-2000，默认 100 | 拉入聚合池的 Top-N 交易员（按 `sortBy` DESC）。 |

### 出参 `data[]`（`SIGNAL_HISTORY_ITEM_PROPS`）

按时间 DESC（最新在前）。

| 字段 | 类型 | 说明 |
|---|---|---|
| `ccy` | string | 该桶 base ccy / 合约键。 |
| `dataVersion` | string | 快照版本 `yyyyMMddHH`（10 位 UTC，如 `2026042820`）。 |
| `longRatio` | string | 该桶头数多空比，0~1。 |
| `shortRatio` | string | `1 − longRatio`。 |
| `weightedLongRatio` | string | 该桶名义加权多空比，0~1。 |
| `weightedShortRatio` | string | 名义加权空头比例。 |
| `longTraders` | integer | 多头持仓人数（含双向）。 |
| `shortTraders` | integer | 空头持仓人数（含双向）。 |
| `tradersWithPosition` | integer | 该桶池内持仓人数。人数太少则信号不可靠。 |
| `tradersQualified` | integer | tier 过滤后的池规模（含未持仓者）。 |
| `netNotionalUsdt` | string | 该桶净方向（USDT）= 多名义 − 空名义。 |
| `totalNotionalUsdt` | string | 该桶总名义（USDT）= 多 + 空。上升=加仓，下降=撤离。 |

---

## S4. `smartmoney_get_signal_trend_by_trader`

**用途：** 单资产聪明钱信号的**时间序列**,**池由 `authorIds` 直接限定**。返回截止 `asOfTime` 的最新 `limit` 个桶。用于追踪某群体多空共识随时间演化。按业务场景与 S3 区分:`_by_filter` 走 tier 探索,`_by_trader` 走 authorIds 直查。

**禁用场景：**
- tier 过滤池时间序列 → 用 S3
- 仅要最新快照 → 用 S2

### 入参

| 参数 | 类型 | 必填 | 范围/默认 | 说明 |
|---|---|---|---|---|
| `authorIds` | string | ✅ | — | 逗号分隔 trader ID。来源：T1 / T6。 |
| `instCcy` | string | ✅ | — | 单币 base ccy。 |
| `asOfTime` | string | ❌ | 当前 UTC 整点 | 10 位 `yyyyMMddHH` 锚点。 |
| `granularity` | string | ❌ | `1h`/`1d`，默认 `1h` | 时间粒度。 |
| `limit` | integer | ❌ | 1-500，默认 24 | 返回桶数。 |

> S4 **不暴露**任何 Pool Filter / `lmtNum` 参数 — 后端在 authorIds 直查场景使用默认池配置。如需 tier 过滤池时间序列,请使用 S3。

### 出参 `data[]`

字段同 S3 (`SIGNAL_HISTORY_ITEM_PROPS`)。

---

## 字段定义速查（按 schema 集合）

### `TRADER_ITEM_PROPS`（T1/T2）

`authorId` / `nickName` / `pnl` / `pnlRatio` / `asset` / `winRate` / `maxDrawdown` / `onboardDuration` / `portrait` / `rates[].statTime` / `rates[].value`

> `updateTime` 不在行内，由 T1/T2 在响应顶层返回。

### T3 持仓 item

`posId` / `instId` / `instType` / `posSide` / `posCcy` / `quoteCcy` / `pos` / `lever` / `avgPx` / `last` / `notionalUsd` / `upl` / `pnl` / `cTime` / `positionIntensity`

### T4 平仓 item

`posId` / `instId` / `instType` / `ctVal` / `posSide` / `lever` / `mgnMode` / `marginCcy` / `quoteCcy` / `openAvgPx` / `closeAvgPx` / `openMaxAmount` / `closeAmount` / `realizedPnl` / `pnl` / `pnlRatio` / `fee` / `fundingFee` / `liquidationStatus` / `closeType` / `cTime` / `uTime`

### T5 订单 item

`ordId` / `instId` / `displayId` / `instType` / `baseName` / `quoteName` / `tradeQuoteCcy` / `side` / `posSide` / `ordType` / `lever` / `px` / `avgPx` / `sz` / `value` / `cTime` / `fillTime` / `uTime`

### T6 搜索 item

`authorId` / `nickName` / `followerCount`

### `SIGNAL_ITEM_PROPS`（S1/S2，嵌套结构）

- **外层**：`ccy` / `dataVersion`（10 位 `yyyyMMddHH`） / `tradersWithPosition` / `tradersQualified` / `longTraders` / `shortTraders`
- **`notional`**：`longNotionalUsdt` / `shortNotionalUsdt` / `netNotionalUsdt` / `totalNotionalUsdt` / `totalNotionalVs24h` / `smartMoneyLongAvgEntry` / `smartMoneyShortAvgEntry`
- **`longShortRatio`**：`longRatioVs1h` / `longRatioVs24h` / `longRatioVs7d` / `longRatio` / `shortRatio` / `weightedLongRatio` / `weightedShortRatio`
- **`winRate`**：`avgLongWinRate` / `avgShortWinRate`

### `SIGNAL_HISTORY_ITEM_PROPS`（S3/S4）

`ccy` / `dataVersion`（10 位 `yyyyMMddHH`） / `longRatio` / `shortRatio` / `weightedLongRatio` / `weightedShortRatio` / `longTraders` / `shortTraders` / `tradersWithPosition` / `tradersQualified` / `netNotionalUsdt` / `totalNotionalUsdt`

---

## 使用提示

- **池来源选择**：先通过 T1 选定 tier 池作为 baseline，再用 `_by_filter` 系列；当需要"复盘某群体共识"时使用 `_by_trader` 系列。
- **快照 vs 时序**：`*_overview_*` 只回当前小时快照；`*_trend_*` 可选 `asOfTime`（10 位 `yyyyMMddHH`）锚点 + `limit`，缺省锚点=当前 UTC 整点。
- **`tradersWithPosition` 是信号强度核心指标**：人数过少（如 < 5）时无论 ratio 多极端都建议视为噪声。
- **多空比解读**：`longRatio` 看头数倾斜，`weightedLongRatio` 看资金倾斜。两者背离=「少数大资金 vs 多数小资金」对立。
- **`smartMoneyLongAvgEntry` / `smartMoneyShortAvgEntry`** 是「跟单成本」判据：当前价显著低于多头均价 = 跟多者已浮亏；显著高于 = 跟多在追高。
- **分页规则**：`after` 向旧（`id` 较小）；`before` 向新（`id` 较大）。`hasMore=true` 时 `nextAfter` 为下一页 `after` 游标。
- **`instId` vs base ccy**：T3/T4/T5 的 `instId` 入参可传 `BTC-USDT-SWAP` 或 `BTC`，handler 会内部提取 base ccy（如 `BTC`）传给上游，AI agent 友好。
