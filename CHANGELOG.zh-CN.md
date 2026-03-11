[English](CHANGELOG.md) | [中文](CHANGELOG.zh-CN.md)

# 更新日志

本文件记录项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
版本管理遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)。

---

## [Unreleased]

### 新增

- **CLI 下单命令 — 附带止盈止损**：`okx spot place`、`okx swap place`、`okx futures place` 现支持可选的止盈止损参数：`--tpTriggerPx`、`--tpOrdPx`、`--tpTriggerPxType`、`--slTriggerPx`、`--slOrdPx`、`--slTriggerPxType`。这些参数会直接作为附带 TP/SL 传递给 OKX 下单 API。

---

## [1.2.2] - 2026-03-11

### 修复

- **安全提示时机改为首次 CLI 运行时展示**：安全提醒不再于 `npm install`（postinstall）阶段打印，改为在安装后首次调用 `okx` CLI 时展示。此改动避免了在 CI/CD 环境中 npm 静默抑制 lifecycle 输出的问题，确保用户在实际使用工具时能看到安全提示。

---

## [1.2.1] - 2026-03-11

### 新增

- **安装后安全提示**：`npm install` 完成后会向 stderr 输出双语安全提醒——提示用户切勿在 Agent 对话中分享 API Key、使用专用子账户、先在模拟盘测试再接入实盘。适用于 `@okx_ai/okx-trade-cli` 和 `@okx_ai/okx-trade-mcp` 两个包。一键安装脚本（`install.sh` / `install.ps1`）也会在安装完成后展示相同提示。

---

## [1.2.0] - 2026-03-10

### 新增

- **合约 DCA — 可选参数**：`--slMode`（止损价格类型：`limit`/`market`）、`--allowReinvest`（利润再投入下一轮循环，默认 `true`）、`--triggerStrategy`（启动方式：`instant`/`price`/`rsi`）、`--triggerPx`（触发价格，`price` 策略时必填）。均为可选参数，仅适用于合约 DCA 创建。
- **合约 DCA 订单 — `instId` 过滤**：`dca_get_orders` 现支持可选的 `--instId` 参数，用于按合约筛选 DCA 机器人（如 `BTC-USDT-SWAP`）
- **合约 DCA 子订单 — `cycleId` 过滤**：`dca_get_sub_orders` 现支持可选的 `--cycleId` 参数，用于查询指定周期内的订单

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
