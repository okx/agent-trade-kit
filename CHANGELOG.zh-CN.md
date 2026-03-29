[English](CHANGELOG.md) | [中文](CHANGELOG.zh-CN.md)

# 更新日志

本文件记录项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
版本管理遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)。

---

## [Unreleased]

### 变更
- **`market_get_candles` 自动路由历史端点**：当 `after`/`before` 时间戳超过 2 天前时，自动切换至 `/market/history-candles`，支持查询 2021 年至今的历史K线。新增兜底机制：若近期端点对带时间戳的请求返回空数据，自动重试历史端点。移除 `history` 参数，无需手动切换。CLI 用法：`okx market candles BTC-USDT --after <时间戳>`。(#101)
- **`account_get_asset_balance` 新增 `showValuation` 参数**：设置 `showValuation=true` 可同时返回各账户类型（交易/资金/理财等）的总资产估值汇总，底层调用 `/api/v5/asset/asset-valuation`。默认行为不变（向后兼容）。CLI 用法：`okx account asset-balance --valuation`。(#102)

---

## [1.2.7] - 2026-03-27

### 新增

- **`earn_auto_set` 工具**（`earn.autoearn`）：为指定币种开启或关闭自动理财。`earnType='0'` 为自动借贷+质押（适用大多数币种），`earnType='1'` 为 USDG 理财（USDG、BUIDL）。开启后 24 小时内不可关闭。CLI 用法：`okx earn auto on <币种>` / `okx earn auto off <币种>`。
- **合约网格支持币本位（反向）合约**（如 `BTC-USD-SWAP`）：更新 `grid_create_order`、`grid_get_orders`、`grid_stop_order` 工具描述，补充币本位 instId 示例和保证金单位说明。
- **`grid_create_order` 新增止盈止损参数**：新增 `tpTriggerPx`、`slTriggerPx`（触发价格）和 `tpRatio`、`slRatio`（比例止盈止损，仅合约），用户创建网格时可同时设置止盈止损。
- **`grid_create_order` 新增 `algoClOrdId`**：用户自定义策略订单 ID（字母数字，最长 32 位）。每用户唯一，支持幂等创建，后续可用于查询或停止策略。
- **算法下单接口新增 `tgtCcy` 参数**：`spot_place_algo_order`、`swap_place_algo_order`、`futures_place_algo_order`、`option_place_algo_order` 新增 `tgtCcy` 参数，设为 `quote_ccy` 时可用 USDT 金额指定下单量。(#86)
- **`okx diagnose --mcp` 多客户端检测**：自动检测 Cursor、Windsurf、Claude Code、Claude Desktop 的 MCP 配置；未安装的客户端直接 skip 而非报错；至少一个客户端已配置即通过。(#90)
- **`okx diagnose --mcp` Tool 数量限制检查**：统计已加载的 tool 总数，超出已知客户端限制（如 Cursor: 单服务器 40 个、总计 80 个）时发出警告并给出 `--modules` 缩减建议。(#90)
- **Cursor 工具数量限制说明**：在 `docs/configuration.md` 和 `docs/faq.md` 中新增针对 Cursor 用户的工具数量限制警告、推荐模块组合表及安全配置示例。(#88)
- **现货 DCA 支持**（`bot.dca`）：5 个 DCA 工具现在同时支持现货 DCA（`algoOrdType=spot_dca`）和合约 DCA（`algoOrdType=contract_dca`）。`dca_create_order` 新增参数：`algoOrdType`（必填）、`algoClOrdId`、`reserveFunds`、`tradeQuoteCcy`；`dca_stop_order` 新增 `algoOrdType` 和 `stopType`；`dca_get_orders` 新增 `algoOrdType` 过滤；`dca_get_order_details` 和 `dca_get_sub_orders` 新增 `algoOrdType`（必填）。CLI 命令同步新增 `--algoOrdType` 选项（省略时默认 `contract_dca`，保持向后兼容）。
- **`dca_create_order` 支持 RSI 触发策略**：`triggerStrategy` 现在接受 `"rsi"`，适用于现货 DCA 和合约 DCA。新增 RSI 参数：`triggerCond`（`cross_up` | `cross_down`）、`thold`（RSI 阈值，如 `"30"`）、`timeframe`（如 `"15m"`）、`timePeriod`（默认 `"14"`）。注意：`price` 触发仅支持 `contract_dca`；`spot_dca` 只支持 `instant` 和 `rsi`。
- **Agent Skills 内置到 `skills/` 目录**：5 个 Skill 模块（`okx-cex-market`、`okx-cex-trade`、`okx-cex-portfolio`、`okx-cex-bot`、`okx-cex-earn`）现已直接收录在项目 `skills/` 目录中，并新增 `skills/README.md` 和 `skills/README.zh-CN.md` 使用说明。

### 修复

- **`dca_create_order` 缺少 `tag` 字段**：创建请求体中现在正确包含 `tag`（来自 `context.config.sourceTag`），与 `grid_create_order` 行为一致。
- **`allowReinvest` 类型不匹配**：Schema 从字符串枚举改为布尔类型，匹配后端 `Boolean` 类型。Handler 同时兼容布尔值和字符串 "true"/"false"（CLI 兼容）。
- **`cmdDcaSubOrders` 展示字段错误**：查询周期内子订单（传了 `--cycleId`）时，CLI 现在显示订单专有字段（`ordId`、`side`、`ordType`、`filledSz` 等），替代之前错误使用的周期列表字段。
- **`okx market ticker` 的"24h change %"字段显示错误**：该字段原来错误地映射到 `sodUtc8`，现已修复为基于 `open24h` 与 `last` 计算涨跌幅，并新增 `24h open` 字段展示 `open24h` 值。
- **`dca_create_order` `triggerStrategy` 按 `algoOrdType` 分类校验**：`price` 触发策略对 `spot_dca` 在校验阶段即返回明确错误。

### 变更

- **`grid_create_order`：合约网格必须传 `direction`** — MCP 层新增客户端校验，`algoOrdType=contract_grid` 时缺少 `direction` 将立即返回错误，无需网络往返。
- **`grid_stop_order`：默认 `stopType` 从 `"2"` 改为 `"1"`** — 省略 `stopType` 时默认为平仓（停止网格并平仓），而非保留资产，对现货和合约网格均更安全直观。
- **`grid_create_order`：缩短工具描述** — JSON schema 大小减少约 20%（2,017 → 1,610 字符），在不删除任何信息的前提下压缩参数描述。
- **README 新增 Agent Skills 章节**：Features 表格和 Documentation 表格更新，反映 `skills/` 目录的引入。

---

## [1.2.7-beta.3] - 2026-03-27

### 新增

- **`dca_create_order` 支持 RSI 触发策略**：`triggerStrategy` 现在接受 `"rsi"`，适用于现货 DCA 和合约 DCA。新增 RSI 参数：`triggerCond`（`cross_up` | `cross_down`）、`thold`（RSI 阈值，如 `"30"`）、`timeframe`（如 `"15m"`）、`timePeriod`（默认 `"14"`）。RSI 触发同时支持 `spot_dca` 和 `contract_dca`。
- **Agent Skills 内置到 `skills/` 目录**：5 个 Skill 模块（`okx-cex-market`、`okx-cex-trade`、`okx-cex-portfolio`、`okx-cex-bot`、`okx-cex-earn`）现已直接收录在项目 `skills/` 目录中，并新增 `skills/README.md` 和 `skills/README.zh-CN.md` 使用说明。

### 修复

- **`dca_create_order` `triggerStrategy` 按 `algoOrdType` 分类校验**：`price` 触发策略对 `spot_dca` 在校验阶段即返回明确错误（`spot_dca` 只支持 `instant` 和 `rsi`）。`contract_dca` 继续支持全部三种策略（`instant`、`price`、`rsi`）。

### 变更

- **README 新增 Agent Skills 章节**：Features 表格和 Documentation 表格更新，反映 `skills/` 目录的引入。

---

## [1.2.7-beta.2] - 2026-03-27

### 新增

- **`okx diagnose --mcp` 多客户端检测**：自动检测 Cursor、Windsurf、Claude Code、Claude Desktop 的 MCP 配置；未安装的客户端直接 skip 而非报错；至少一个客户端已配置即通过 (#90)
- **`okx diagnose --mcp` Tool 数量限制检查**：统计已加载的 tool 总数，超出已知客户端限制（如 Cursor: 单服务器 40 个、总计 80 个）时发出警告并给出 `--modules` 缩减建议 (#90)
- **Cursor 工具数量限制说明**：在 `docs/configuration.md` 和 `docs/faq.md` 中新增针对 Cursor 用户的工具数量限制警告、推荐模块组合表及安全配置示例（#88）
- **现货 DCA 支持**（`bot.dca`）：5 个 DCA 工具现在同时支持现货 DCA（`algoOrdType=spot_dca`）和合约 DCA（`algoOrdType=contract_dca`）。`dca_create_order` 新增参数：`algoOrdType`（必填）、`algoClOrdId`、`reserveFunds`、`tradeQuoteCcy`；`dca_stop_order` 新增 `algoOrdType` 和 `stopType`；`dca_get_orders` 新增 `algoOrdType` 过滤；`dca_get_order_details` 和 `dca_get_sub_orders` 新增 `algoOrdType`（必填）。CLI 命令同步新增 `--algoOrdType` 选项（省略时默认 `contract_dca`，保持向后兼容）。帮助文本和 agent-skills 文档同步更新。

### 移除

- **`dca_create_order` `triggerStrategy` 不再支持 `"rsi"`**：OKX DCA API 不支持 RSI 触发策略。`triggerStrategy` 枚举现在为 `["instant", "price"]`。之前传入 `triggerStrategy: "rsi"` 的用户将收到 schema 校验错误。

### 修复

- **`dca_create_order` 缺少 `tag` 字段**：创建请求体中现在正确包含 `tag`（来自 `context.config.sourceTag`），与 `grid_create_order` 行为一致。
- **`allowReinvest` 类型不匹配**：Schema 从字符串枚举改为布尔类型，匹配后端 `Boolean` 类型。Handler 同时兼容布尔值和字符串 "true"/"false"（CLI 兼容）。
- **`cmdDcaSubOrders` 展示字段错误**：查询周期内子订单（传了 `--cycleId`）时，CLI 现在显示订单专有字段（`ordId`、`side`、`ordType`、`filledSz` 等），替代之前错误使用的周期列表字段。
- **`okx market ticker` 的"24h change %"字段显示错误**：该字段原来错误地映射到 `sodUtc8`（UTC+8 当日开盘价），而非基于 `open24h` 计算涨跌幅。现已修复：新增 `24h open` 字段展示 `open24h` 值，并基于 `open24h` 与 `last` 计算 `24h change %`。

---

## [1.2.7-beta.1] - 2026-03-26

### 新增

- **`earn_auto_set` 工具**（`earn.autoearn`）：为指定币种开启或关闭自动理财。`earnType='0'` 为自动借贷+质押（适用大多数币种），`earnType='1'` 为 USDG 理财（USDG、BUIDL）。开启后 24 小时内不可关闭。CLI 用法：`okx earn auto on <币种>` / `okx earn auto off <币种>`。
- **合约网格支持币本位（反向）合约**（如 `BTC-USD-SWAP`）：更新 `grid_create_order`、`grid_get_orders`、`grid_stop_order` 工具描述，补充币本位 instId 示例和保证金单位说明。
- **`grid_create_order` 新增止盈止损参数**：新增 `tpTriggerPx`、`slTriggerPx`（触发价格）和 `tpRatio`、`slRatio`（比例止盈止损，仅合约），用户创建网格时可同时设置止盈止损。
- **`grid_create_order` 新增 `algoClOrdId`**：用户自定义策略订单 ID（字母数字，最长 32 位）。每用户唯一，支持幂等创建，后续可用于查询或停止策略。
- **算法下单接口新增 `tgtCcy` 参数**：`spot_place_algo_order`、`swap_place_algo_order`、`futures_place_algo_order`、`option_place_algo_order` 新增 `tgtCcy` 参数。设为 `quote_ccy` 时可用 USDT 金额指定下单量，与 v1.2.6 中普通下单接口行为一致。(#86)

### 变更

- **`grid_create_order`：合约网格必须传 `direction`** — MCP 层新增客户端校验，`algoOrdType=contract_grid` 时缺少 `direction` 将立即返回错误，无需网络往返。
- **`grid_stop_order`：`stopType` 默认值从 `"2"` 改为 `"1"`** — 省略 `stopType` 时默认为关停并平仓，而非保留资产。对现货和合约网格均更安全直观。
- **`grid_create_order`：精简工具描述** — `grid_create_order` JSON schema 体积缩减约 20%（2,017 → 1,610 chars），精简 `sz`、`algoClOrdId`、TP/SL 等参数描述，信息量不变。
---

## [1.2.6] - 2026-03-23

### 新增

- **`market_get_indicator` 工具**（`market`）：通过 OKX AIGC 指标接口查询任意交易对的技术指标值。支持 70+ 指标，覆盖 10 大分类——均线（MA/EMA/WMA/HMA 等）、趋势（MACD/SuperTrend/SAR/ADX 等）、一目均衡表、动量振荡器（RSI/KDJ/StochRSI 等）、波动率（BB/ATR/Keltner 等）、成交量（OBV/VWAP/MFI 等）、统计（LR/Slope/Sigma 等）、价格辅助（TP/MP）、K 线形态（15 种）、BTC 周期指标（BTCRAINBOW/AHR999）。无需 API 凭证。支持可选参数 `params`、`returnList`、`limit`、`backtestTime`。CLI 用法：`okx market indicator <名称> <instId> [--bar <周期>] [--params <p1,p2>] [--list] [--limit N] [--backtest-time <ms>]`。
- **`OkxRestClient.publicPost()` 方法**：新增免鉴权 POST 方法，与 `publicGet` 对称，供 `market_get_indicator` 内部使用。
- **下单接口新增 `tgtCcy` 参数**：`spot_place_order`、`swap_place_order`、`futures_place_order` 新增 `tgtCcy` 参数。设为 `quote_ccy` 时可用 USDT 金额指定下单量，而非合约数/基础货币数量。

### 修复

- **CLI 业务失败时退出码为 1**：OKX 写入接口在订单被拒绝时仍返回 HTTP 200（如 `sCode="51008"`）。现在当响应中任意条目的 `sCode` 非零时，CLI 设置 `process.exitCode = 1`，脚本和 LLM 可通过退出码直接判断失败。
- **`config.toml` passphrase 含特殊字符时给出友好提示**：passphrase 含 `#`、`\`、`"`、`'` 时，错误信息现在包含 TOML 引号转义指引，替代原来的模糊解析报错。
- **余额不足错误提示优化**：错误码 `51008`（余额不足）、`51119`（保证金不足）、`51127`（可用保证金不足）的建议中，现在明确提示通过 `account_get_asset_balance` 检查资金账户，并通过 `account_transfer(from=18, to=6)` 转账后重试。

### 变更

- **CLI 输出层抽象重构**（内部）：统一 `process.stdout`/`stderr` 写入，对用户无感知行为变化。

---

## [1.2.5] - 2026-03-18

### 新增

- **`dcd_subscribe` 工具**（`earn.dcd`）：原子化 DCD 申购，内部一步完成询价+下单，彻底消灭 MCP 用户的报价过期竞争问题。支持可选参数 `minAnnualizedYield`（百分比），若实际报价年化低于该阈值则拒绝下单并返回错误。返回结果包含 trade 信息及 quote 快照（`annualizedYield`、`absYield`）。不支持模拟交易模式。
- **`dcd_redeem` 工具**（`earn.dcd`）：两阶段提前赎回设计，确保用户在执行前确认损失。第一次调用（不传 `quoteId`）：仅询价，返回赎回损失详情供用户确认。第二次调用（传入 `quoteId`）：执行赎回。若两次调用之间报价已过期，自动重新询价并原子执行，response 中包含 `autoRefreshedQuote: true`。执行步骤不支持模拟交易模式。
- **CLI `okx diagnose --mcp`**：新增 MCP 服务器专项诊断模式。检查项包括：包版本、Node.js 兼容性、MCP 入口文件存在性和可执行性、Claude Desktop `mcpServers` 配置、最近的 MCP 日志片段、模块加载冒烟测试（`--version`），以及 stdio JSON-RPC 握手（5 秒超时）。零外部依赖，仅使用 Node.js 内置模块。
- **`okx diagnose --output <file>`**：默认模式与 `--mcp` 模式均支持 `--output <路径>` 将诊断报告保存为文件，便于分享排查。
- **`allToolSpecs()` 从 `@agent-tradekit/core` 导出**：该函数现已纳入公开 API，为未来的外部消费者（如第三方 MCP 客户端、测试工具）提供枚举所有已注册工具规格的能力。

### 移除

- **低阶 DCD 拆分工具已删除**：`dcd_request_quote`、`dcd_execute_quote`、`dcd_request_redeem_quote`、`dcd_execute_redeem` 已删除。申购流程请使用 `dcd_subscribe`，提前赎回流程请使用 `dcd_redeem`。
- **`earn_get_lending_rate_summary` 工具已删除**（`earn.savings`）：借币市场利率汇总接口已从 MCP 工具集中移除。如需查询市场借贷利率，请改用 `earn_get_lending_rate_history`。

### 修复

- **Simple Earn 工具中 `rate` / `lendingRate` 字段语义说明修正**：修正了 `earn_get_savings_balance`、`earn_set_lending_rate`、`earn_get_lending_history`、`earn_get_lending_rate_history` 中具有误导性的描述。`rate` 字段现已明确说明为*最低借出利率阈值*（非市场收益率，非 APY）。`lendingRate` 字段新增稳定币 pro-rata 摊薄机制说明：当可出借的稳定币（USDT/USDC）供给超过借币需求时，总利息由所有出借方按比例分配，导致 `lendingRate` < `rate`；非稳定币无此摊薄机制，`lendingRate` 等于 `rate`。向用户展示收益时应始终使用 `lendingRate`。
- **CLI `cancel` 命令支持 `--clOrdId`**：`okx spot/swap/futures cancel` 此前仅支持 `--ordId` 位置参数。现支持 `--ordId` 或 `--clOrdId`（客户自定义订单 ID）二选一；若两者均未提供则抛出明确错误。涉及 `spot_cancel_order`、`swap_cancel_order`、`futures_cancel_order`。
- **CLI `spot/swap/futures cancel` 忽略 `--instId` 参数**：`cmdSpotCancel`、`cmdSwapCancel`、`cmdFuturesCancel` 错误地使用位置参数（`rest[0]`）作为 `instId`，导致 `--instId` 标志被静默忽略、以错误的合约 ID 执行撤单。已修复为正确读取 `v.instId`。

### 变更

- **工具描述全面优化**：从所有工具的 description 中移除 "Private endpoint"、"Public endpoint" 和 "Rate limit" 等标签，减少 MCP schema 的 token 开销。针对 earn、grid、DCA、swap/futures/option 等模块的描述进行了精简。`[CAUTION]` 标记保持不变。
- **TWAP bot 迁移为仅 CLI**：移除 `bot.twap` MCP 工具，TWAP 功能仍可通过 `okx bot twap` CLI 命令使用。
- **`sanitize()` 工具函数**：在诊断输出分享前自动屏蔽 UUID、长十六进制字符串（≥32 位）及 Bearer Token。
- **`diagnose-utils.ts`**（内部模块）：从 `diagnose.ts` 中提取 `Report`、`ok`、`fail`、`section`、`sanitize` 等共享工具函数，供 `diagnose-mcp.ts` 复用。
- **所有工具模块新增文件级注释**（内部文档）。

---

## [1.2.5-beta.5] - 2026-03-17

### 修复

- **CLI `cancel` 命令支持 `--clOrdId`**：`okx spot/swap/futures cancel` 此前仅支持 `--ordId` 位置参数。现支持 `--ordId` 或 `--clOrdId`（客户自定义订单 ID）二选一；若两者均未提供则抛出明确错误。涉及 `spot_cancel_order`、`swap_cancel_order`、`futures_cancel_order`。

---

## [1.2.5-beta.4] - 2026-03-17

### 移除

- **`feat/add-more-bots-phase-1` 已回滚**：移除该分支引入的所有改动，包含回滚带来的 bug 修复：
  - `dca_create_order` RSI 触发子参数（`triggerCond`、`thold`、`timePeriod`、`timeframe`）及跟单参数（`trackingMode`、`profitSharingRatio`）
  - 5 个 DCA CLI 命令：`margin-add`、`margin-reduce`、`set-tp`、`set-reinvest`、`manual-buy`
  - 现货定投 CLI 命令：`okx bot recurring create|amend|stop|orders|details|sub-orders`
  - `grid_create_order` 6 个新可选参数（`tpTriggerPx`、`slTriggerPx`、`algoClOrdId`、`tradeQuoteCcy`、`tpRatio`、`slRatio`）
  - 14 个新网格 CLI 命令（`amend-basic-param`、`amend-order`、`close-position`、`cancel-close-order`、`instant-trigger`、`positions`、`withdraw-income`、`compute-margin-balance`、`margin-balance`、`adjust-investment`、`ai-param`、`min-investment`、`rsi-back-testing`、`max-quantity`）
  - TWAP CLI 命令：`okx bot twap place|cancel|orders|details`
  - *（回滚副作用）* **`swap_cancel_algo_orders` 输入格式恢复**：该分支曾将入参从 `{ orders: [{ algoId, instId }] }` 数组格式错误改为扁平 `{ instId, algoId }`；回滚后恢复正确格式。
  - *（回滚副作用）* **`dca_create_order` `pxStepsMult`/`volMult` 阈值描述修正**：该分支曾将必填条件错误描述为 `maxSafetyOrds > 1`；回滚后恢复正确的 `> 0`。

---

## [1.2.5-beta.3] - 2026-03-17

### 移除

- **`copytrading` 模块已回滚**：移除 v1.2.5-beta.2 中引入的 5 个跟单 CLI 命令（`traders`、`trader-detail`、`status`、`follow`、`unfollow`）、`copytrading` MCP 工具、相关文档（`docs/cli-reference.md` 跟单章节）及 README 跟单说明。

---

## [1.2.5-beta.2] - 2026-03-17

### 新增

- **`dcd_subscribe` 工具**（`earn.dcd`）：原子化 DCD 申购，内部一步完成询价+下单，彻底消灭 MCP 用户的报价过期竞争问题。支持可选参数 `minAnnualizedYield`（百分比），若实际报价年化低于该阈值则拒绝下单并返回错误。返回结果包含 trade 信息及 quote 快照（`annualizedYield`、`absYield`）。不支持模拟交易模式。
- **`dcd_redeem` 工具**（`earn.dcd`）：两阶段提前赎回设计，确保用户在执行前确认损失。第一次调用（不传 `quoteId`）：仅询价，返回赎回损失详情供用户确认。第二次调用（传入 `quoteId`）：执行赎回。若两次调用之间报价已过期，自动重新询价并原子执行，response 中包含 `autoRefreshedQuote: true`。执行步骤不支持模拟交易模式。
- **移除低阶 DCD 拆分工具**：`dcd_request_quote`、`dcd_execute_quote`、`dcd_request_redeem_quote`、`dcd_execute_redeem` 已删除。申购流程请使用 `dcd_subscribe`，提前赎回流程请使用 `dcd_redeem`。

### 变更

- **CLI `okx diagnose --mcp`**：新增 MCP 服务器专项诊断模式。检查项包括：包版本、Node.js 兼容性、MCP 入口文件存在性和可执行性、Claude Desktop `mcpServers` 配置、最近的 MCP 日志片段、模块加载冒烟测试（`--version`），以及 stdio JSON-RPC 握手（5 秒超时）。零外部依赖，仅使用 Node.js 内置模块。
- **`okx diagnose --output <file>`**：默认模式与 `--mcp` 模式均支持 `--output <路径>` 将诊断报告保存为文件，便于分享排查。
- **`diagnose-utils.ts`**（内部模块）：从 `diagnose.ts` 中提取 `Report`、`ok`、`fail`、`section`、`sanitize` 等共享工具函数，供 `diagnose-mcp.ts` 复用。
- **`sanitize()` 工具函数**：在诊断输出分享前自动屏蔽 UUID、长十六进制字符串（≥32 位）及 Bearer Token。
- **`allToolSpecs()` 从 `@agent-tradekit/core` 导出**：该函数现已纳入公开 API，为未来的外部消费者（如第三方 MCP 客户端、测试工具）提供枚举所有已注册工具规格的能力。此前该函数已被 `buildTools()` 和 `createToolRunner()` 内部调用，本次变更是面向预期的下游使用场景而预先公开暴露，并非供 `diagnose-mcp.ts` 内部调用。

---

## [1.2.4] - 2026-03-15

### 新增

- **`market_get_stock_tokens` 工具**：新增专用工具，用于查询股票代币合约列表（如 `AAPL-USDT-SWAP`、`TSLA-USDT-SWAP`）。通过 `GET /api/v5/public/instruments` 获取全量合约后，在客户端按 `instCategory=3` 过滤。支持 `instType`（默认 `SWAP`）及可选 `instId` 参数。([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **CLI `okx market stock-tokens`**：新增 CLI 子命令，映射到 `market_get_stock_tokens`。用法：`okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>] [--json]`。([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **现货移动止损支持**（`spot_place_algo_order` 传入 `ordType='move_order_stop'`）：除支持 conditional/oco 外，现已支持移动止损。传入 `callbackRatio`（如 `'0.01'` 表示 1%）或 `callbackSpread`，可选传入 `activePx`。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`swap_place_algo_order` 新增移动止损支持**（`ordType='move_order_stop'`）：新增 `callbackRatio`、`callbackSpread`、`activePx` 参数，可替代已废弃的 `swap_place_move_stop_order` 工具。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`spot_get_algo_orders` 现已包含移动止损订单**：未指定 `ordType` 过滤时，查询现并行获取 `conditional`、`oco` 和 `move_order_stop` 三种类型。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx spot algo trail`**：新增现货移动止损下单命令。用法：`okx spot algo trail --instId BTC-USDT --side sell --sz 0.001 --callbackRatio 0.01 [--activePx <price>] [--tdMode cash]`。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx futures algo trail`**：新增期货移动止损下单命令。用法：`okx futures algo trail --instId BTC-USD-250328 --side sell --sz 1 --callbackRatio 0.01 [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]`。([#68](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/68))
- **4 个新期权算法核心工具**（`registerOptionAlgoTools`）：`option_place_algo_order`、`option_amend_algo_order`、`option_cancel_algo_orders`、`option_get_algo_orders`。支持对期权持仓挂条件单（TP/SL），修改或取消已有算法单，以及查询待成交/历史期权算法订单。([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **`option_place_order` 新增附加 TP/SL 支持**（`attachAlgoOrds`）：下单时可同步传入 `--tpTriggerPx`/`--tpOrdPx` 和/或 `--slTriggerPx`/`--slOrdPx`，一步完成期权下单与止盈止损设置。([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo` 命令**：`place`、`amend`、`cancel`、`orders` — 期权算法单全生命周期管理。([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **7 个新期货核心工具**（Phase 1，对齐 swap 功能）：`futures_amend_order`、`futures_close_position`、`futures_set_leverage`、`futures_get_leverage`、`futures_batch_orders`、`futures_batch_amend`、`futures_batch_cancel`。([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))
- **5 个新期货算法工具**（`registerFuturesAlgoTools`）：`futures_place_algo_order`、`futures_place_move_stop_order`、`futures_amend_algo_order`、`futures_cancel_algo_orders`、`futures_get_algo_orders`。([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))

### 修复

- **Bot 工具：补充 `algoId`、`algoOrdType`、`groupId` 缺失的参数描述** — Grid 和 DCA 工具缺少 `algoId` 描述，导致 AI agent 传入无效值（错误 `51000`）或 `algoOrdType` 不匹配（错误 `50016`）。同时补充了 `grid_get_sub_orders` 的 `groupId` 描述和 `spot_amend_algo_order` 的 `newSz` 描述。
- **CLI：`okx bot dca orders` 新增 `--algoId` 和 `--instId` 过滤** — 现已与 `okx bot grid orders` 行为对齐。
- **`swap_get_algo_orders` 硬编码 `instType`**：新增可选 `instType` 参数（默认 `"SWAP"`，支持 `"FUTURES"`）。([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))
- **`callBackRatio` / `callBackSpread` 参数名大小写错误**：修复 POST body 中参数名大小写，MCP 输入参数名保持不变。([#69](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/69))
- **CLI `algo place` 移动止损参数未透传**：`callbackRatio`、`callbackSpread`、`activePx` 在 `cmdSpotAlgoPlace`、`cmdSwapAlgoPlace`、`cmdFuturesAlgoPlace` 中已正确透传。([#74](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/74))
- **CLI `okx swap algo cancel` 格式错误**：修复 `cmdSwapAlgoCancel` 的参数包装格式为 `{ orders: [{ instId, algoId }] }`。([#76](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/76))

### 废弃

- **`swap_place_move_stop_order`**：已废弃，推荐使用 `swap_place_algo_order` 并传入 `ordType='move_order_stop'`。该工具仍保留以向后兼容。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))

### 变更

- **`--modules all` 现已包含 earn 子模块**：`all` 展开为所有模块，包括 `earn.savings`、`earn.onchain` 和 `earn.dcd`。默认模块保持不变。([#66](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/66))
- **CLI：移除直接 `smol-toml` 依赖** — TOML 功能现在完全通过 `@agent-tradekit/core` 提供。([#39](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/39))
- **去重 postinstall 脚本**：monorepo 根目录下的 `scripts/postinstall-notice.js` 为单一来源，包内副本在 `build` 时自动生成。([#50](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/50))
- **`earn` 重构为子模块目录**（内部重构）：`earn.ts` → `tools/earn/savings.ts`，`onchain-earn.ts` → `tools/earn/onchain.ts`。不影响公开 API。([#64](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/64))
- **消除 `normalize()` 重复实现**：删除 9 处本地实现，统一使用 `helpers.ts` 中的 `normalizeResponse`。([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))
- **提取 `buildAttachAlgoOrds()` 辅助函数**：TP/SL 组装逻辑提取为共享函数，替换 5 处重复代码块。([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))
- **精简工具描述文本**：从所有工具的 description 中移除 "Private endpoint"、"Public endpoint" 和 "Rate limit" 等标签，减少 MCP schema 的 token 开销。`[CAUTION]` 标记保持不变。([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))

---

## [1.2.4-beta.7] - 2026-03-14

### 修复

- **CLI `okx swap algo cancel` 报 "orders must be a non-empty array"**：`cmdSwapAlgoCancel` 将 `{ instId, algoId }` 直接传给 `swap_cancel_algo_orders`，而该工具要求 `{ orders: [{ instId, algoId }] }` 格式，导致命令必然失败。已修正为与 `futures`/`option` 保持一致的包装格式。([#76](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/76))

---

## [1.2.4-beta.6] - 2026-03-14

### 修复

- **CLI `algo place` 移动止损参数未透传**：`cmdSpotAlgoPlace`、`cmdSwapAlgoPlace`、`cmdFuturesAlgoPlace` 在用户传入 `callbackRatio`、`callbackSpread`、`activePx` 时会静默丢弃这些参数。通过 `okx {spot,swap,futures} algo place --ordType move_order_stop` 下移动止损单时，API 会返回错误 50015（缺少必要参数）。三个参数现已正确透传到 tool runner。([#74](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/74))

---

## [1.2.4-beta.5] - 2026-03-14

### 新增

- **4 个新期权算法核心工具**（`registerOptionAlgoTools`）：`option_place_algo_order`、`option_amend_algo_order`、`option_cancel_algo_orders`、`option_get_algo_orders`。支持对期权持仓挂条件单（TP/SL），修改或取消已有算法单，以及查询待成交/历史期权算法订单。([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **`option_place_order` 新增附加 TP/SL 支持**（`attachAlgoOrds`）：下单时可同步传入 `--tpTriggerPx`/`--tpOrdPx` 和/或 `--slTriggerPx`/`--slOrdPx`，一步完成期权下单与止盈止损设置。([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo place`**：为期权持仓下条件单（TP/SL）。用法：`okx option algo place --instId BTC-USD-250328-95000-C --side sell --ordType oco --sz 1 --tdMode cross --tpTriggerPx 0.006 --tpOrdPx -1 --slTriggerPx 0.003 --slOrdPx -1`。([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo amend`**：修改已有期权算法单的 TP/SL 价格。用法：`okx option algo amend --instId BTC-USD-250328-95000-C --algoId <id> [--newTpTriggerPx <p>] [--newSlTriggerPx <p>]`。([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo cancel`**：取消期权算法单。用法：`okx option algo cancel --instId BTC-USD-250328-95000-C --algoId <id>`。([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))
- **CLI `okx option algo orders`**：查询待成交或历史期权算法订单。用法：`okx option algo orders [--instId <id>] [--history] [--ordType <conditional|oco>] [--json]`。([#72](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/72))

- **7 个新期货核心工具**（Phase 1，对齐 swap 功能）：`futures_amend_order`、`futures_close_position`、`futures_set_leverage`、`futures_get_leverage`、`futures_batch_orders`、`futures_batch_amend`、`futures_batch_cancel`。这些工具使用 futures 专属名称（`futures_*`），而非复用 swap 工具，为期货提供独立的 API 接口。([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))
- **5 个新期货算法工具**（`registerFuturesAlgoTools`）：`futures_place_algo_order`、`futures_place_move_stop_order`、`futures_amend_algo_order`、`futures_cancel_algo_orders`、`futures_get_algo_orders`。与 swap algo 工具类似，但使用 `instType: "FUTURES"` 并注册在 `futures` 模块下。([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))

### 修复

- **`swap_get_algo_orders` 硬编码 `instType`**：该工具之前在 API 请求中硬编码 `instType: "SWAP"`，导致无法查询 FUTURES 类型的算法订单。现在新增可选 `instType` 参数（默认 `"SWAP"`，支持 `"FUTURES"`）。([#71](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/71))

### 变更

- **消除 `normalize()` 重复实现**：删除了 `spot-trade`、`swap-trade`、`futures-trade`、`option-trade`、`algo-trade`、`account`、`market`、`bot/grid`、`bot/dca` 中共 9 处本地 `normalize()` 函数，统一使用 `helpers.ts` 中的 `normalizeResponse`。([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))
- **提取 `buildAttachAlgoOrds()` 辅助函数**：将 TP/SL 组装逻辑（`tpTriggerPx`、`tpOrdPx`、`slTriggerPx`、`slOrdPx` → `attachAlgoOrds`）提取为 `helpers.ts` 中的共享函数，替换了 `spot_place_order`、`spot_batch_orders`（place）、`swap_place_order`、`swap_batch_orders`（place）、`futures_place_order` 中 5 处重复代码块。([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))
- **精简工具描述文本**：从所有工具的 description 字符串中移除 "Private endpoint"、"Public endpoint" 和 "Rate limit: X req/s per UID" 等标签，以减少 MCP schema 的 token 开销。`[CAUTION]` 标记保持不变。([#70](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/70))

### 修复

- **`callBackRatio` / `callBackSpread` 参数名大小写错误**：OKX API 要求使用 `callBackRatio` 和 `callBackSpread`（大写 B），但 POST body 中实际发送的是 `callbackRatio` 和 `callbackSpread`（小写 b），导致返回 sCode 50015 错误。已修复 `swap_place_algo_order` 和 `swap_place_move_stop_order` 两个 handler。MCP 输入参数名（`callbackRatio` / `callbackSpread`）保持不变。([#69](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/69))

---

## [1.2.4-beta.4] - 2026-03-14

### 新增

- **`market_get_stock_tokens` 工具**：新增专用工具，用于查询股票代币合约列表（如 `AAPL-USDT-SWAP`、`TSLA-USDT-SWAP`）。通过 `GET /api/v5/public/instruments` 获取全量合约后，在客户端按 `instCategory=3` 过滤。支持 `instType`（默认 `SWAP`）及可选 `instId` 参数。([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **CLI `okx market stock-tokens`**：新增 CLI 子命令，映射到 `market_get_stock_tokens`。用法：`okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>] [--json]`。([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **现货移动止盈止损支持**（`spot_place_algo_order` 传入 `ordType='move_order_stop'`）：除支持 conditional/oco 外，现已支持移动止损。传入 `ordType='move_order_stop'` 并指定 `callbackRatio`（如 `'0.01'` 表示 1%）或 `callbackSpread`（固定价格距离），可选传入 `activePx`。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`swap_place_algo_order` 新增移动止损支持**（`ordType='move_order_stop'`）：新增 `callbackRatio`、`callbackSpread`、`activePx` 参数，可替代已废弃的 `swap_place_move_stop_order` 工具。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`spot_get_algo_orders` 现已包含移动止损订单**：未指定 `ordType` 过滤时，查询现并行获取 `conditional`、`oco` 和 `move_order_stop` 三种类型。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx spot algo trail`**：新增现货移动止损下单命令。用法：`okx spot algo trail --instId BTC-USDT --side sell --sz 0.001 --callbackRatio 0.01 [--activePx <price>] [--tdMode cash]`。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx futures algo trail`**：新增期货移动止损下单命令。用法：`okx futures algo trail --instId BTC-USD-250328 --side sell --sz 1 --callbackRatio 0.01 [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]`。([#68](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/68))

### 修复

- **Bot 工具：补充 `algoId`、`algoOrdType`、`groupId` 缺失的参数描述** — Grid 工具（`grid_get_orders`、`grid_get_order_details`、`grid_get_sub_orders`、`grid_stop_order`）和 DCA 工具（`dca_get_orders`、`dca_get_order_details`）缺少 `algoId` 描述，导致 AI agent 传入无效值（错误 `51000`）或 `algoOrdType` 不匹配（错误 `50016`）。同时补充了 `grid_get_sub_orders` 的 `groupId` 描述和 `spot_amend_algo_order` 的 `newSz` 描述。
- **CLI：`okx bot dca orders` 新增 `--algoId` 和 `--instId` 过滤** — 此前 CLI 未将这些参数传递给底层 `dca_get_orders` 工具，现已与 `okx bot grid orders` 行为对齐。

### 废弃

- **`swap_place_move_stop_order`**：已废弃，推荐使用 `swap_place_algo_order` 并传入 `ordType='move_order_stop'`。该工具仍保留以向后兼容。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))

### 变更

- **`--modules all` 现已包含 earn 子模块**：`all` 现在会展开为所有模块，包括 `earn.savings`、`earn.onchain` 和 `earn.dcd`，与 bot 子模块保持一致。默认模块保持不变。([#66](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/66))
- **CLI：移除直接 `smol-toml` 依赖** — `packages/cli` 不再声明 `smol-toml` 为直接依赖，TOML 功能现在完全通过 `@agent-tradekit/core` 提供。([#39](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/39))
- **去重 postinstall 脚本**：monorepo 根目录下的 `scripts/postinstall-notice.js` 现为单一来源，`packages/cli/scripts/postinstall.js` 和 `packages/mcp/scripts/postinstall.js` 在 `build` 时自动生成，已加入 `.gitignore`。([#50](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/50))
- **`earn` 重构为子模块目录**（内部重构）：`earn.ts` → `tools/earn/savings.ts`，`onchain-earn.ts` → `tools/earn/onchain.ts`，新增 `tools/earn/index.ts` 聚合入口，不影响公开 API。([#64](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/64))

---

## [1.2.4-beta.3] - 2026-03-13

### 新增

- **CLI `okx futures algo trail`**：新增期货移动止损下单命令。用法：`okx futures algo trail --instId BTC-USD-250328 --side sell --sz 1 --callbackRatio 0.01 [--activePx <price>] [--posSide <net|long|short>] [--tdMode <cross|isolated>] [--reduceOnly]`。([#68](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/68))

---

## [1.2.4-beta.2] - 2026-03-13

### 新增

- **现货移动止盈止损支持**（`spot_place_algo_order` 传入 `ordType='move_order_stop'`）：`spot_place_algo_order` 除支持 conditional/oco 外，现已支持移动止损（trailing stop）。传入 `ordType='move_order_stop'` 并指定 `callbackRatio`（如 `'0.01'` 表示 1%）或 `callbackSpread`（固定价格距离），可选传入 `activePx`（激活价格）。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`swap_place_algo_order` 新增移动止损支持**（`ordType='move_order_stop'`）：swap 算法订单工具新增 `callbackRatio`、`callbackSpread`、`activePx` 参数，可替代已废弃的 `swap_place_move_stop_order` 工具。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **`spot_get_algo_orders` 现已包含移动止损订单**：未指定 `ordType` 过滤时，查询现并行获取 `conditional`、`oco` 和 `move_order_stop` 三种类型（此前仅查询 `conditional` 和 `oco`）。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))
- **CLI `okx spot algo trail`**：新增现货移动止损下单命令。用法：`okx spot algo trail --instId BTC-USDT --side sell --sz 0.001 --callbackRatio 0.01 [--activePx <price>] [--tdMode cash]`。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))

### 废弃

- **`swap_place_move_stop_order`**：已废弃，推荐使用 `swap_place_algo_order` 并传入 `ordType='move_order_stop'`。该工具仍保留以向后兼容。([#67](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/67))

### 变更

- **`--modules all` 现已包含 earn 子模块**：`all` 现在会展开为所有模块，包括 `earn.savings`、`earn.onchain` 和 `earn.dcd`，与 bot 子模块保持一致。此前 earn 需要通过 `all,earn` 显式启用。默认模块保持不变（`spot`、`swap`、`option`、`account`、`bot.grid`）。([#66](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/66))

---

## [1.2.4-beta.1] - 2026-03-13

### 新增

- **`market_get_stock_tokens` 工具**：新增专用工具，用于查询股票代币合约列表（如 `AAPL-USDT-SWAP`、`TSLA-USDT-SWAP`）。通过 `GET /api/v5/public/instruments` 获取全量合约后，在客户端按 `instCategory=3` 过滤。支持 `instType`（默认 `SWAP`）及可选 `instId` 参数。([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **CLI `okx market stock-tokens`**：新增 CLI 子命令，映射到 `market_get_stock_tokens`。用法：`okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>] [--json]`。
- **DCD 模块**（`earn.dcd`）— 新增 8 个 MCP 工具和 10 个 CLI 命令，支持 OKX 双币赢（Dual Currency Deposit）：`dcd_get_currency_pairs`、`dcd_get_products`、`dcd_request_quote`、`dcd_execute_quote`、`dcd_request_redeem_quote`、`dcd_execute_redeem`、`dcd_get_order_state`、`dcd_get_orders`。CLI 命令：`okx earn dcd pairs`、`products`、`quote`、`buy`、`quote-and-buy`、`redeem-quote`、`redeem`、`redeem-execute`、`order`、`orders`。支持客户端产品筛选（`--minYield`、`--strikeNear`、`--termDays`、`--expDate`）、两步提前赎回流程，以及所有写操作的模拟盘拦截。

### 修复

- **Bot 工具：补充 `algoId`、`algoOrdType`、`groupId` 缺失的参数描述** — Grid 工具（`grid_get_orders`、`grid_get_order_details`、`grid_get_sub_orders`、`grid_stop_order`）和 DCA 工具（`dca_get_orders`、`dca_get_order_details`）缺少 `algoId` 描述，导致 AI agent 传入无效值（错误 `51000`）或 `algoOrdType` 不匹配（错误 `50016`）。同时补充了 `grid_get_sub_orders` 的 `groupId` 描述和 `spot_amend_algo_order` 的 `newSz` 描述。
- **CLI：`okx bot dca orders` 新增 `--algoId` 和 `--instId` 过滤** — 此前 CLI 未将这些参数传递给底层 `dca_get_orders` 工具，尽管 MCP tool 已支持。现已与 `okx bot grid orders` 行为对齐。

### 变更

- **CLI：移除直接 `smol-toml` 依赖** — `packages/cli` 不再声明 `smol-toml` 为直接依赖。TOML 功能现在完全通过 `@agent-tradekit/core` 提供，core 包内部已内联 `smol-toml`。([#39](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/39))
- **去重 postinstall 脚本**：monorepo 根目录下的 `scripts/postinstall-notice.js` 现为单一来源。`packages/cli/scripts/postinstall.js` 和 `packages/mcp/scripts/postinstall.js` 在 `build` 时自动生成，已加入 `.gitignore`。([#50](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/50))
- **`earn` 重构为子模块目录**（内部重构）：`earn.ts` → `tools/earn/savings.ts`，`onchain-earn.ts` → `tools/earn/onchain.ts`，新增 `tools/earn/index.ts` 作为聚合入口。与 `bot/` 子模块目录结构保持一致，不影响公开 API。([#64](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/64))

---

## [1.2.4-beta.0] - 2026-03-13

### 新增

- **`market_get_stock_tokens` 工具**：新增专用工具，用于查询股票代币合约列表（如 `AAPL-USDT-SWAP`、`TSLA-USDT-SWAP`）。通过 `GET /api/v5/public/instruments` 获取全量合约后，在客户端按 `instCategory=3` 过滤。支持 `instType`（默认 `SWAP`）及可选 `instId` 参数。([#65](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/65))
- **CLI `okx market stock-tokens`**：新增 CLI 子命令，映射到 `market_get_stock_tokens`。用法：`okx market stock-tokens [--instType <SPOT|SWAP>] [--instId <id>] [--json]`。

### 修复

- **Bot 工具：补充 `algoId`、`algoOrdType`、`groupId` 缺失的参数描述** — Grid 工具（`grid_get_orders`、`grid_get_order_details`、`grid_get_sub_orders`、`grid_stop_order`）和 DCA 工具（`dca_get_orders`、`dca_get_order_details`）缺少 `algoId` 描述，导致 AI agent 传入无效值（错误 `51000`）或 `algoOrdType` 不匹配（错误 `50016`）。同时补充了 `grid_get_sub_orders` 的 `groupId` 描述和 `spot_amend_algo_order` 的 `newSz` 描述。
- **CLI：`okx bot dca orders` 新增 `--algoId` 和 `--instId` 过滤** — 此前 CLI 未将这些参数传递给底层 `dca_get_orders` 工具，尽管 MCP tool 已支持。现已与 `okx bot grid orders` 行为对齐。

### 变更

- **CLI：移除直接 `smol-toml` 依赖** — `packages/cli` 不再声明 `smol-toml` 为直接依赖。TOML 功能现在完全通过 `@agent-tradekit/core` 提供，core 包内部已内联 `smol-toml`。([#39](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/39))
- **去重 postinstall 脚本**：monorepo 根目录下的 `scripts/postinstall-notice.js` 现为单一来源。`packages/cli/scripts/postinstall.js` 和 `packages/mcp/scripts/postinstall.js` 在 `build` 时自动生成，已加入 `.gitignore`。([#50](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/50))
- **`earn` 重构为子模块目录**（内部重构）：`earn.ts` → `tools/earn/savings.ts`，`onchain-earn.ts` → `tools/earn/onchain.ts`，新增 `tools/earn/index.ts` 作为聚合入口。与 `bot/` 子模块目录结构保持一致，不影响公开 API。([#64](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/64))

---

## [1.2.3] - 2026-03-12

### 破坏性变更

- **`--modules all` 不再包含 earn 子模块**：此前 `--modules all` 会展开为所有模块，包括 `earn.savings` 和 `earn.onchain`。现在 `all` 仅包含基础模块和 bot 子模块，earn 模块需要显式启用：
  - `--modules all,earn` — 所有模块 + 全部 earn 子模块
  - `--modules all,earn.savings` — 所有模块 + 仅简单赚币
  - `--modules all,earn.onchain` — 所有模块 + 仅链上赚币
  - `--modules earn` — 仅 earn 子模块

  **迁移方案**：若此前使用 `--modules all` 且依赖 earn 工具，需在配置中追加 `,earn`：`--modules all,earn`。

### 新增

- **DCD 模块**（`earn.dcd`）— 新增 8 个 MCP 工具和 10 个 CLI 命令，支持 OKX 双币赢（Dual Currency Deposit）：`dcd_get_currency_pairs`、`dcd_get_products`、`dcd_request_quote`、`dcd_execute_quote`、`dcd_request_redeem_quote`、`dcd_execute_redeem`、`dcd_get_order_state`、`dcd_get_orders`。CLI 命令：`okx earn dcd pairs`、`products`、`quote`、`buy`、`quote-and-buy`、`redeem-quote`、`redeem`、`redeem-execute`、`order`、`orders`。支持客户端产品筛选（`--minYield`、`--strikeNear`、`--termDays`、`--expDate`）、两步提前赎回流程，以及所有写操作的模拟盘拦截。
- **HTTP/HTTPS 代理支持**：在 TOML Profile 中配置 `proxy_url`，所有 OKX API 请求将通过代理服务器转发。支持带认证的代理 URL（如 `http://user:pass@proxy:8080`）。仅支持 HTTP/HTTPS 代理，不支持 SOCKS。（[#53](https://gitlab.okg.com/retail-ai/okx-trade-mcp/-/issues/53)）
- **CLI `--verbose` 标志**：为任意命令添加 `--verbose`，可在 stderr 查看详细的网络请求/响应信息 — 包括方法、URL、认证状态（密钥脱敏）、耗时、HTTP 状态码、OKX 错误码和 trace ID。适用于排查连接和认证问题。
- **CLI `okx diagnose` 诊断命令**：逐步检查连通性 — 环境（Node.js、OS、shell、locale、时区、代理）、配置（凭证、站点、base URL）、网络（DNS → TCP → TLS → 公开 API）和认证。失败时给出具体建议，并在末尾输出可复制分享的诊断报告。
- **CLI 下单命令 — 附带止盈止损**：`okx spot place`、`okx swap place`、`okx futures place` 现支持可选的止盈止损参数：`--tpTriggerPx`、`--tpOrdPx`、`--tpTriggerPxType`、`--slTriggerPx`、`--slOrdPx`、`--slTriggerPxType`。这些参数会直接作为附带 TP/SL 传递给 OKX 下单 API。
- **Earn 模块** — 新增 7 个 OKX 简单赚币（活期/灵活借贷）工具：`earn_get_savings_balance`、`earn_savings_purchase`、`earn_savings_redeem`、`earn_set_lending_rate`、`earn_get_lending_history`、`earn_get_lending_rate_summary`、`earn_get_lending_rate_history`。包含 CLI 命令、中英文文档及完整测试覆盖。

---

## [1.2.0] - 2026-03-10

### 新增

- **合约 DCA — 可选参数**：`--slMode`（止损价格类型：`limit`/`market`）、`--allowReinvest`（利润再投入下一轮循环，默认 `true`）、`--triggerStrategy`（启动方式：`instant`/`price`/`rsi`）、`--triggerPx`（触发价格，`price` 策略时必填）。均为可选参数，仅适用于合约 DCA 创建。
- **合约 DCA 订单 — `instId` 过滤**：`dca_get_orders` 现支持可选的 `--instId` 参数，用于按合约筛选 DCA 机器人（如 `BTC-USDT-SWAP`）
- **合约 DCA 子订单 — `cycleId` 过滤**：`dca_get_sub_orders` 现支持可选的 `--cycleId` 参数，用于查询指定周期内的订单
- **链上赚币模块（6 个工具）**：新增 `onchain-earn` 模块，支持 OKX 链上赚币（质押/DeFi）产品 — `onchain_earn_get_offers`、`onchain_earn_purchase`、`onchain_earn_redeem`、`onchain_earn_cancel`、`onchain_earn_get_active_orders`、`onchain_earn_get_order_history`。CLI 命令：`okx earn onchain offers`、`okx earn onchain purchase`、`okx earn onchain redeem`、`okx earn onchain cancel`、`okx earn onchain orders`、`okx earn onchain history`。

### 变更

- **DCA 工具现仅支持合约**：从所有 5 个 DCA 工具中移除了现货 DCA 支持（`dca_create_order`、`dca_stop_order`、`dca_get_orders`、`dca_get_order_details`、`dca_get_sub_orders`）。`type` 参数已移除——所有 DCA 工具现在仅操作合约 DCA。现货 DCA 因产品风险评估而移除。
- **Agent Skill（`okx-cex-bot`）同步更新**：全面改写 `SKILL.md`，移除所有现货 DCA 引用——包括描述、快速开始示例、命令索引、跨技能工作流、操作流程、CLI 参考（create/stop/orders/details/sub-orders）、MCP 工具参考、输入输出示例、边界场景、参数展示名称表。DCA 章节现仅文档化合约用法，`--lever`、`--direction` 为必填参数，移除 `--type` 标志。
- **所有下单工具移除 `tag` 参数、改为自动注入**：`tag` 字段已从所有下单工具的输入 schema 中移除（涵盖 spot、swap、futures、option、algo、grid）。服务端现在会自动注入 `tag: "MCP"`（CLI 使用时为 `"CLI"`）。此前传入自定义 `tag` 值的用户将无法再覆盖该字段。注意：DCA bot 工具不注入 `tag`，因为合约 DCA API 不支持该字段。

### 修复

- **合约 DCA `side`/`direction` 参数错误**（严重）：MCP schema 使用 `side`（`buy`/`sell`），但 API 要求 `direction`（`long`/`short`）。已移除 `side` 字段，直接使用 `direction`。此前做空仓位无法正确创建。
- **合约 DCA `safetyOrdAmt`、`pxSteps`、`pxStepsMult`、`volMult` 条件必填**：当 `maxSafetyOrds > 0` 时这 4 个参数为业务必填（缺省返回 400），当 `maxSafetyOrds = 0` 时为可选。现在 schema 中标记为可选，描述中注明条件必填要求。
- **合约子订单发送不支持的分页参数**：合约 DCA 按周期查询订单时发送了 `after`/`before` 参数，但 API 仅支持 `limit`。已从该路径移除 `after`/`before`。

---

## [1.1.9] - 2026-03-09

### 变更

- **Spot DCA 端点路径更新**：5 个 Spot DCA 工具端点全部迁移至新路径 `/api/v5/tradingBot/spot-dca`，端点名称同步更新（`create`、`stop`、`bot-active-list`、`bot-history-list`、`bot-detail`、`trade-list`），与后端 okcoin-bots MR #210 保持一致。Contract DCA 仍使用 `/api/v5/tradingBot/dca`，不受影响。
- **`grid_create_order` — `sz` 描述修正**：`sz` 参数描述由"Investment amount in USDT"改为"investment amount in margin currency (e.g. USDT for USDT-margined contracts)"，准确覆盖 USDT 保证金和币本位合约网格两种场景。行为不变。
- **文档移除 `--no-basePos` CLI 示例**：`docs/cli-reference.md` 中移除了 `--no-basePos` 用例，与现有行为保持一致（`basePos` 默认 `true`，不作为独立 CLI 标志对外暴露）。

### 修复

- **`dca_create_order` — 合约 DCA 现已传递 `slPct` 和 `slMode`**：`slPct`（止损比例）和 `slMode`（止损价格类型）参数在 schema 中已定义，但合约 DCA handler 未将其转发至 OKX API，导致创建合约 DCA bot 时止损设置被静默忽略。现货 DCA 不受影响。注意：合约 DCA 设置 `slPct` 时，OKX API 要求同时传递 `slMode`（`"limit"` 或 `"market"`）。

---

## [1.1.8] - 2026-03-09

### 变更

- **`grid_create_order` — `basePos` 默认为 `true`**：合约网格机器人创建时默认开底仓（做多/做空方向）。中性方向忽略此参数。传 `basePos: false`（MCP）或 `--no-basePos`（CLI）可禁用。现货网格不受影响。

---

## [1.1.7] - 2026-03-09

### 变更

- 版本号升级。

---

## [1.1.6] - 2026-03-08

### 变更

- 版本号升级。

---

## [1.1.5] - 2026-03-08

### 新增

- **多层级 `--help` 导航**：`okx --help`、`okx <模块> --help`、`okx <模块> <子组> --help` 现在输出带有每条命令描述的范围化帮助信息，AI Agent 无需阅读源码即可发现可用功能。

### 修复

- **`bot dca create` 帮助文本缺少 `--reserveFunds`**：该参数在代码中已支持，但未出现在帮助输出中。

---

## [1.1.4] - 2026-03-08

### 修复

- **`--modules all` 现在包含 `bot.dca`**：此前 `all` 使用 `BOT_DEFAULT_SUB_MODULES` 展开（仅含 bot.grid），导致 DCA 模块被静默排除。现已修正为包含所有 bot 子模块。
- **`option` 加入默认模块**：默认模块集合更新为 `spot, swap, option, account, bot.grid`，MCP 服务器帮助文本同步修正以匹配实际默认值。

---

## [1.1.3] - 2026-03-08

### 新增

- **`--version` 输出 git commit hash**：CLI 和 MCP 服务器的版本号现在附带构建时的 commit hash，例如 `1.1.3 (abc1234)`，便于确认已发布包对应的具体提交

### 修复

- **现货 `tdMode` 不可配置**：`okx spot place`、`okx spot algo place`（止盈止损）、MCP `spot_place_algo_order`、MCP `spot_batch_orders` 此前均硬编码 `tdMode`，用户无法覆盖。现在 `--tdMode` 作为可选参数暴露（默认值：`cash`，适用于非保证金账户）。使用统一账户/保证金账户的用户可显式传 `--tdMode cross`。

---

## [1.1.2] - 2026-03-08

### 新增

- **一键安装脚本**：`install.sh`（macOS/Linux）和 `install.ps1`（Windows）— 一条命令完成 MCP 服务器 + CLI 安装，并自动配置已检测到的 MCP 客户端
- **自动配置 MCP 客户端**：安装脚本自动检测并配置 Claude Code、Claude Desktop、Cursor、VS Code 和 Windsurf
- **`config init --lang`**：`--lang zh` 参数启用中文交互向导；默认使用英文
- **智能默认配置名**：`config init` 根据运行环境自动推断合适的默认配置名
- **CLI 期权模块**：`okx option` 命令，支持下单、撤单、改单，以及查询持仓、成交记录、合约链和希腊字母
- **CLI 批量操作**：`okx spot batch` 和 `okx swap batch`，支持批量下单/撤单/改单
- **CLI 审计日志**：`okx trade history` 查询本地 NDJSON 审计日志
- **CLI 合约 DCA**：`okx bot dca contract` 命令，通过 `--type` 参数区分现货与合约 DCA

### 修复

- **版本上报**：MCP 服务器现在从 `package.json` 动态读取版本号，不再使用硬编码字符串
- **`okx setup` npx 命令**：独立 MCP 客户端（Claude Desktop、Cursor）的 setup 配置现在使用 `npx`，用户无需全局安装即可使用
- **Bot 写入端点错误**：网格和 DCA 写入端点的 `sCode`/`sMsg` 错误现在能正确抛出，不再被静默吞掉
- **安装脚本**：同时安装 `@okx_ai/okx-trade-mcp` 和 `@okx_ai/okx-trade-cli`（之前只安装了其中一个）

### 变更

- **Bot 子模块重构**：`bot` 模块新增 `bot.default` 子模块；内部子模块加载逻辑统一，更加健壮
- **文档**：一键安装说明从 README 移至 `docs/configuration.md`

---

## [1.1.1] - 2026-03-07

### 修复

- **构建**：CLI 产物中 `smol-toml` 未被内联打包（尽管 `noExternal` 已配置），npm registry 上的 `1.1.0` 包含外部 `import from "smol-toml"` 导致运行时报错。已将 `smol-toml` 加入运行时 `dependencies` 作为可靠修复，并升版重新发布。

---

## [1.1.0] - 2026-03-07

### 新增

- **合约 DCA 机器人**：`bot.dca` 子模块现支持合约（永续）DCA，新增工具 `dca_get_contract_orders`、`dca_get_contract_order_details`、`dca_create_contract_order`、`dca_stop_contract_order`
- **`okx setup` 子命令**：交互式向导，自动生成并写入 MCP 服务器配置，支持 Claude Code、VS Code、Windsurf 等 MCP 客户端
- **CLI `--version` / `-v` 参数**：输出当前包版本后退出
- **CLI `swap amend` 命令**：通过 CLI 改单（`okx swap amend`）

### 修复

- **重复工具**：移除重复注册的 `swap_amend_order` 工具，避免工具列表中出现两次
- **CLI swap amend 分发**：`okx swap amend` 现在正确路由到合约处理器，而非现货处理器

### 变更

- **`bot.dca` 改为按需加载**：DCA 子模块不再默认加载；通过 `--modules bot.dca` 或在 `~/.okx/config.toml` 的 `modules` 列表中添加 `bot.dca` 来启用
- **Bot 工具重组为子模块**：`bot` 模块采用子模块体系，`bot.grid` 和 `bot.dca` 可独立加载
- **CLI 架构**：CLI 命令现在通过 `ToolRunner` 直接调用 Core 工具处理器，减少 MCP 与 CLI 之间的代码重复

---

## [1.0.9] - 2026-03-06

### 修复

- **策略委托单**: `swap_get_algo_orders` 和 `spot_get_algo_orders` 查询历史记录时现在会传递必需的 `state` 参数（`/api/v5/trade/orders-algo-history`），默认值为 `effective` (#28)

---

## [1.0.8] - 2026-03-06

### 变更

- **npm 组织重命名**：包从 `@okx_retail` 迁移至 `@okx_ai` 作用域。请重新安装：
  ```
  npm uninstall -g @okx_retail/okx-trade-mcp @okx_retail/okx-trade-cli
  npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli
  ```
  二进制名称不变 — 重新安装后 `okx-trade-mcp` 和 `okx` 仍可正常使用。

---

## [1.0.7] - 2026-03-04

### 新增

- **场景测试**：新增 `scripts/scenario-test/`，包含多步骤集成测试，覆盖无状态读取流程（账户余额、市场数据、合约杠杆）和有状态写入流程（现货 下单→查询→撤单，合约 设置杠杆→下单→查询→撤单）。无状态场景可在 CI 中安全运行；有状态场景需设置 `OKX_DEMO=1`。
- **多站点支持**：OKX 全球站（`www.okx.com`）、EEA 站（`my.okx.com`）和美国站（`app.okx.com`）用户现可通过 `--site <global|eea|us>` CLI 参数、`OKX_SITE` 环境变量或 `~/.okx/config.toml` 中的 `site` 字段配置站点。API 基础 URL 根据站点自动推导；`OKX_API_BASE_URL` / `base_url` 的显式覆盖仍支持高级用法。
- **`config init` 站点选择**：交互式向导现在会在要求输入 API key 之前提示选择站点，并为所选站点打开正确的 API 管理页面。
- **`config show` 站点显示**：每个配置文件现在会显示 `site` 字段。
- **地区错误上下文**：OKX 地区限制错误码（51155、51734）的错误建议中现在包含当前配置的站点，帮助用户排查站点配置错误。
- **docs/faq.md**：新增"常见问题"部分，包含 3 个问答 — "什么是 OKX Trade MCP？"、"支持哪些交易对？"和"需要了解哪些风险？"（中英双语）
- **docs/faq.md**：新增"API 覆盖范围"部分，说明 MCP 服务器和 CLI 目前支持哪些 OKX REST API 模块，以及哪些尚未支持（中英双语）

### 修复

- **CLI**：确保通过 npm 全局软链接执行时 `main()` 始终被调用；添加防御性注释和软链接回归测试以防止未来的回归问题（#21）

### 变更

- **发布准备**：版本号更新以发布
- **`okx config init`**：站点选择（Global / EEA / US）和模拟/实盘选择现在会优先询问；CLI 会使用 `?go-demo-trading=1` 或 `?go-live-trading=1` 查询参数打开目标 API 创建页面，使用户直接进入正确的标签页。支持 EEA（`my.okx.com`）和 US（`app.okx.com`）站点，并将其保存为配置文件中的 `base_url`。
- **docs/configuration.md**、**README.md**、**README.zh.md**：API key 创建链接更新为带有 `?go-demo-trading=1` / `?go-live-trading=1` 参数的直接 URL（中英双语）。
- **npm 作用域**：包现在在 `@okx_ai` 组织下发布。请重新安装：
  ```
  npm uninstall -g okx-trade-mcp okx-trade-cli
  npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli
  ```
  二进制名称不变 — 重新安装后 `okx-trade-mcp` 和 `okx` 仍可正常使用。

---

## [1.0.6] - 2026-03-04

### 新增

### 修复

### 变更

- **项目重命名**：内部包 `@okx-hub/core` 重命名为 `@agent-tradekit/core`

---

## [1.0.5] - 2026-03-04

### 新增

- **期权模块（10 个工具）**：新增 `option` 期权交易模块 — `option_place_order`、`option_cancel_order`、`option_batch_cancel`、`option_amend_order`（写入）；`option_get_order`、`option_get_orders`、`option_get_positions`（含希腊字母）、`option_get_fills`、`option_get_instruments`（期权链）、`option_get_greeks`（IV + Delta/Gamma/Theta/Vega）（读取）

### 修复

### 变更

- 工具总数：48 → 57 → 67
- **文档结构重组**：将单个 `README.md` 拆分为 `README.md`（英文）+ `README.zh.md`（中文），并添加语言切换；新增 `docs/configuration.md`（所有客户端配置 + 启动场景）、`docs/faq.md`、`docs/cli-reference.md`，以及 `docs/modules/` 下的各模块参考文档
- **GitHub issue 模板**：在 `.github/ISSUE_TEMPLATE/` 下新增 `bug_report.md` 和 `feature_request.md`
- **`SECURITY.md`**：新增支持版本表和 GitHub 私有安全公告链接
- **错误处理 — 可操作建议**：`OkxRestClient` 现在将约 20 个 OKX 错误码映射为重试指导；限流错误码（`50011`、`50061`）抛出 `RateLimitError`；服务器繁忙错误码附带"X 秒后重试"提示；地区/合规和账户问题错误码附带"请勿重试"建议
- **测试覆盖率**：函数覆盖率从 76.5% 提升至 93.4%（199 → 243 个测试）；每个源文件的函数覆盖率现在均超过 80%
- **覆盖率脚本**：c8 现在将 `packages/cli/src` 和 `packages/mcp/src` 纳入覆盖率收集，并运行所有包的测试

---

## [1.0.4] - 2026-03-03

### 新增

- **审计日志 — `trade_get_history`**：查询所有 MCP 工具调用的本地 NDJSON 审计日志；支持 `limit`、`tool`、`level` 和 `since` 过滤器
- **审计日志记录**：MCP 服务器自动将 NDJSON 条目写入 `~/.okx/logs/trade-YYYY-MM-DD.log`；`--no-log` 禁用日志，`--log-level` 设置最低级别（默认 `info`）；敏感字段（apiKey、secretKey、passphrase）自动脱敏
- **错误追踪**：`ToolErrorPayload` 和所有错误类新增 `traceId` 字段 — 当 OKX 返回 `x-trace-id` / `x-request-id` 响应头时自动填充
- **MCP 错误中的服务器版本**：`serverVersion` 注入 MCP 错误负载，便于问题报告
- **CLI 错误中的版本信息**：错误发生时 `Version: okx-trade-cli@x.x.x` 始终输出到 stderr；`TraceId:` 在可用时一并输出
- **行情 — 指数数据**：`market_get_index_ticker`、`market_get_index_candles`（+ 历史）、`market_get_price_limit`（3 个新工具）
- **现货 — 批量订单**：`spot_batch_orders` — 单次请求批量下单/撤单/改单最多 20 个现货订单
- **现货/合约 — 订单归档**：`spot_get_orders` / `swap_get_orders` 设置 `status="archive"` → `/trade/orders-history-archive`（最长 3 个月）
- **账户 — 持仓**：`account_get_positions` — 跨产品类型持仓查询（MARGIN/SWAP/FUTURES/OPTION）
- **账户 — 账单归档**：`account_get_bills_archive` — 归档账本最长 3 个月
- **账户 — 额度查询**：`account_get_max_withdrawal`、`account_get_max_avail_size`
- **README**："问题报告 / 报错反馈"部分，附带示例错误负载
- **网格机器人（模块：`bot`）**：5 个新的 OKX 交易机器人网格策略工具 — `grid_get_orders`、`grid_get_order_details`、`grid_get_sub_orders`（读取），`grid_create_order`、`grid_stop_order`（写入）。覆盖现货网格、合约网格和天地网格。
- **CLI `--demo` 参数**：全局 `--demo` 选项，可直接从命令行启用模拟交易模式（替代 `OKX_DEMO=1` 环境变量或配置文件设置）
- **CLI bot grid 命令**：`bot grid orders`、`bot grid details`、`bot grid sub-orders`、`bot grid create`、`bot grid stop` — 通过 CLI 完整管理网格机器人生命周期
- **CLI 全覆盖**：`okx-trade-cli` 扩展覆盖所有 57 个 MCP 工具 — 新增 `market`（`instruments`、`funding-rate`、`mark-price`、`trades`、`index-ticker`、`index-candles`、`price-limit`、`open-interest`）、`account`（`positions`、`bills`、`fees`、`config`、`set-position-mode`、`max-size`、`max-avail-size`、`max-withdrawal`、`positions-history`、`asset-balance`、`transfer`）、`spot`（`get`、`amend`）、`swap`（`get`、`fills`、`close`、`get-leverage`）以及新的 `futures` 模块（`orders`、`positions`、`fills`、`place`、`cancel`、`get`）命令
- **CLI/MCP 入口测试**：为 `okx` 和 `okx-trade-mcp` 入口新增单元测试，测试帮助/初始化流程并保持覆盖率准确

### 修复

- **网格机器人端点路径**：修正全部 5 个网格工具端点以匹配 OKX API v5 规范 — `orders-algo-pending`、`orders-algo-history`、`order-algo`、`stop-order-algo`（此前使用了错误路径导致 HTTP 404）
- **`grid_stop_order`**：请求体现在序列化为数组 `[{...}]`，符合 OKX `stop-order-algo` 端点要求
- **`grid_create_order`**：移除多余的 `tdMode` 参数（`ApiPlaceGridParam` 中不存在该字段；服务器虽然静默忽略但会污染工具 schema）
- **`grid_create_order`**：`algoOrdType` 枚举限制为 `["grid", "contract_grid"]` — 服务器 `@StringMatch` 校验仅接受这两个值用于创建；`moon_grid` 仅在查询和停止操作中有效
- **`grid_stop_order`**：`stopType` 枚举从 `["1","2"]` 扩展为 `["1","2","3","5","6"]`，以匹配服务器 `StopStrategyParam` 校验
- **CLI `bot grid create`**：移除 `--tdMode` 参数，`algoOrdType` 限制为 `<grid|contract_grid>`，与 MCP 工具变更保持同步
- **CLI `bot grid stop`**：`--stopType` 提示更新为 `<1|2|3|5|6>`
- **`spot_get_algo_orders`**：修复不带 `ordType` 过滤器调用时的 `400 Parameter ordType error` — 现在并行获取 `conditional` 和 `oco` 类型并合并结果，与 `swap_get_algo_orders` 行为一致

### 变更

---

## [1.0.2] - 2026-03-01

### 新增

- **行情 — 5 个新工具**：`market_get_instruments`、`market_get_funding_rate`（+ 历史）、`market_get_mark_price`、`market_get_trades`、`market_get_open_interest`
- **行情 — K线历史**：`market_get_candles` 设置 `history=true` → `/market/history-candles`
- **现货/合约 — 成交归档**：`spot_get_fills` / `swap_get_fills` 设置 `archive=true` → `/trade/fills-history`
- **现货/合约 — 单笔订单查询**：`spot_get_order`、`swap_get_order` — 通过 `ordId` / `clOrdId` 查询
- **合约 — 平仓与批量操作**：`swap_close_position`、`swap_batch_orders`（批量下单/撤单/改单最多 20 笔）
- **合约 — 杠杆查询**：`swap_get_leverage`
- **账户 — 6 个新工具**：`account_get_bills`、`account_get_positions_history`、`account_get_trade_fee`、`account_get_config`、`account_set_position_mode`、`account_get_max_size`
- **账户 — 资金余额**：`account_get_asset_balance`（资金账户，`/asset/balances`）
- **系统能力工具**：`system_get_capabilities` — 机器可读的服务器能力信息，用于 Agent 规划
- **MCP 客户端配置**：README 中新增 Claude Code CLI、VS Code、Windsurf、openCxxW 配置示例

### 修复

- 更新通知器包名修正（`okx-trade-mcp`、`okx-trade-cli`）
- CLI 类型检查错误修复（严格的 `parseArgs` 类型、`smol-toml` 互操作）

### 变更

- 工具总数：28 → 43

---

## [1.0.1] - 2026-02-28

### 新增

- **移动止损订单**（`swap_place_move_stop_order`）用于合约 — CLI 和 MCP 服务器均可使用
- **更新通知器** — 启动时如果有更新的 npm 版本可用，会在 stderr 输出提示

---

## [1.0.0] - 2026-02-28

### 新增

- **MCP 服务器**（`okx-trade-mcp`）：通过 Model Context Protocol 集成 OKX REST API v5
- **CLI**（`okx-trade-cli`）：OKX 命令行交易界面
- **模块**：
  - `market` — 行情、深度、K线（无需凭证）
  - `spot` — 现货下单/撤单/改单、策略委托（条件单、OCO），成交记录、历史订单
  - `swap` — 永续合约订单管理、持仓、杠杆、成交记录、策略委托
  - `account` — 余额查询、资金划转
- **策略委托**：现货和合约的条件单（止盈/止损）和 OCO 订单对
- **CLI 参数**：`--modules`、`--read-only`、`--demo`
- **限流器**：客户端按工具的令牌桶限流
- **配置**：`~/.okx/config.toml` TOML 配置文件系统
- **错误层级**：`ConfigError`、`ValidationError`、`AuthenticationError`、`RateLimitError`、`OkxApiError`、`NetworkError`，具有结构化 MCP 错误负载
