[English](CHANGELOG.md) | [中文](CHANGELOG.zh-CN.md)

# 更新日志

本文件记录项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
版本管理遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)。

---

## [Unreleased]

### ⚠ 破坏性变更 —— `smartmoney` 模块重构

Smart Money MCP / CLI 工具面完全重写，目标是让 AI agent 仅凭工具名 / 参数 schema 就能选对工具。**不保留 alias**——旧工具/参数/字段名一律删除。完整设计依据见 [`docs/designs/smartmoney.md`](docs/designs/smartmoney.md)。

CLI 同步：每个 CLI 命令名 = MCP 工具名去 `smartmoney_` 前缀和 `get_` 动词，snake → kebab（如 `smartmoney_get_traders_by_filter` ↔ `okx smartmoney traders-by-filter`）。`--authorIds` / `--instCcyList` 仍可传逗号分隔字符串，CLI 在边界拆为数组。

#### 工具面（8 → 10 个原子工具）

| 旧（1.3.2） | 新 | 备注 |
|---|---|---|
| `get_traders`（pool-filter） | `get_traders_by_filter` | `limit` 默认 100 → 10 |
| `get_traders`（authorIds） | `get_performance_by_trader` | 直查，不接池过滤 |
| `get_trader_records` | `get_trader_orders_history` | 与 `*_get_orders` 家族对齐 |
| `get_trader_positions` | `get_trader_positions` | 名称不变 |
| `get_trader_position_history` | `get_trader_positions_history` | 复数化 |
| `get_signal`（pool-filter） | `get_signal_overview_by_filter` | 删除 `ts`；`topInstruments`（默认 20）承接"top-N 最热" |
| `get_signal`（authorIds） | `get_signal_overview_by_trader` | 入参收紧，不再接池过滤 |
| `get_signal_history` | `get_signal_trend_by_filter` | 与 `_by_trader` 对仗 |
| `get_overview`、`get_top_coin_signals`、`get_trader_detail` | _(删除)_ | 已被替代；`_trader_detail` 违反原子化 |
| _(新增)_ | `search_trader` | 昵称 → authorId 解析（最多 10 条，按粉丝数倒序） |
| _(新增)_ | `get_signal_trend_by_trader` | 单币时序，限定 authorIds |

#### 入参变更

- **`authorIds` / `instCcyList` 改为字符串数组**（原 CSV 字符串）—— 强类型 schema 在 input 阶段就能拦下形状错误。
- **Leaderboard 池过滤入参重命名** 与 signal 家族 `*Tier` 枚举消歧：`pnl` → `minPnl`、`winRate` → `minWinRate`、`asset` → `minAum`（`maxDrawdown` 不变）。Signal 家族保留 `pnlTier` / `winRateTier` / `maxDrawdownTier` / `aumTier`。
- **时间锚点按家族拆分**：leaderboard 用 `updateTime`（12 位 `yyyyMMddHHmm` UTC+8）；signal-trend 用可选 `asOfTime`（10 位 `yyyyMMddHH` UTC，缺省=当前整点）；signal-overview 不接受时间入参。`ts` 与 `dataVersion` 作为入参全部删除。
- **`signal_*_by_trader` 不再接受池过滤入参** —— 池过滤轴仅 `_by_filter` 暴露，详见 [`docs/designs/smartmoney.md`](docs/designs/smartmoney.md) §13。
- **Trader 端 `instCcy` → `instId`**：`_trader_positions` / `_positions_history` / `_orders_history` 接受完整 `instId` 或裸 base ccy；handler 自动提取 base。
- **Signal 池过滤新增 `period`**（3/7/30/90，默认 7），覆盖所有 signal 工具（之前仅 leaderboard）。
- **`lmtNum` 上限 500 → 2000**（signal-overview 工具）。

#### 出参变更

- **Leaderboard 字段重命名**（所有出现处）：`winRatio` → `winRate`、`maxRetreat` → `maxDrawdown`、`dataVersion` → `updateTime`（仅 leaderboard；signal 条目仍在 bucket 级保留 `dataVersion`）。
- **Signal-overview 改为嵌套分组** 对齐 OpenAPI `/overview` 规范 —— 外层 `ccy` + `notional` / `longShortRatio` / `winRate` 三个对象。原扁平字段（`vs1h` / `vs24h` / `vs7d`、顶层 `longNotionalUsdt` 等）已移除。
- **新增字段**：`direction`（由 `posSide` + `pos` 符号派生的 `"long" | "short"`）与 `upl`（未实现盈亏，计价币单位），仅 `_trader_positions`。
- **删除字段**：`topNUsed` / `currentPrice` / `priceChange24h` / `fundingRate` / `openInterest` / `longShortAccountRatio` / `ts` —— 后端不再返回。

#### 其他

- 全部工具显式声明 MCP tool annotation：`readOnlyHint` / `idempotentHint` / `openWorldHint`。
- handler 改返回人类可读的引导信息，替代后端 `sCode`。

#### 迁移示例

```ts
// 多币 overview —— instCcyList 仍可用，无需时间入参
smartmoney_get_signal_overview_by_filter({ instCcyList: ["BTC", "ETH"] })

// 单币 signal-history → signal-trend；asOfTime 可选
smartmoney_get_signal_trend_by_filter({ instCcy: "BTC", granularity: "1h", limit: 24 })

// trader_detail 复合工具已删除 → 3 次原子并发
Promise.all([
  smartmoney_get_performance_by_trader({ authorIds: ["X"] }),
  smartmoney_get_trader_positions({ authorId: "X" }),
  smartmoney_get_trader_orders_history({ authorId: "X", limit: 50 }),
])
```

---

### 修复

- **`event_browse` 并发限流修复**（`packages/core/src/tools/event-trade.ts`、`event-helpers.ts`）：将无上限的 `Promise.all` 替换为基于信号量的 `withConcurrency` 工具函数，最大并发市场拉取请求数限制为 `MAX_CONCURRENT_MARKET_FETCHES = 8`（频率限制窗口为 20 req；预留 12 个请求作为重试及同一窗口内其他调用的缓冲：`20 - 12 = 8`）。同时将 `Promise.all` 改为 `Promise.allSettled` 语义，单个 series 拉取失败不再中断整个 browse —— 无活跃合约的 series 静默跳过，成功的 series 正常返回。Closes #146。

- **`cmdAuthRemove` 错误处理**（`packages/cli/src/commands/auth.ts`）：`removeAuthBinary()` 外围已有的 try/catch 现已补充测试覆盖。在 `packages/cli/test/auth.test.ts` 中新增两个单元测试，验证当 `removeAuthBinary()` 抛出异常（如权限拒绝 / EACCES）时：(a) 文本模式下 `errorLine` 被调用且包含错误信息，(b) JSON 模式下输出 `{status:"failed", error:<msg>}`，(c) 两种模式下 `process.exitCode` 均置为 `1`，且不向上层重新抛出。Closes #159。

- **分层架构图**（`ARCHITECTURE.md`、`ARCHITECTURE.zh-CN.md`）：将错误的单路径瀑布式架构图（误将 `packages/mcp/src/index.ts` 标记为"CLI 入口"）替换为双 binary 架构图，正确展示 `okx-trade-mcp` 与 `okx` 作为两个独立可执行文件，均从 `@agent-tradekit/core`（共享 SDK）导入。Closes #185。
- **`docs/faq.md` — API 密钥存储说明**：补充一句说明 CLI（`okx`）与 MCP server（`okx-trade-mcp`）各自独立读取 `~/.okx/config.toml`，互不依赖。

### 变更（其他）

- **`linux-arm64` 主机现使用原生 arm64 pilot 二进制**（`packages/core/src/pilot/installer.ts` `PLATFORM_MAP` + `scripts/postinstall-notice.js`）。此前 `linux-arm64 → linux-x64` 的临时回退（当时 CDN 上没有原生 arm64 二进制）会让用户下载 x64 二进制经 qemu/binfmt 模拟运行。现在原生 arm64 二进制已发布在 `/upgradeapp/tools/pilot/linux-arm64/okx-pilot`（2026-04-29 验证），直接路由到该文件，去掉模拟层 —— 启动更快、CPU 占用更低。

- **`context-kg/` 06/07/08 Mapping 章节刷新**（`context-kg/business/06-leaderboard-smartmoney-api.md`、`07-dcd-api.md`、`08-dca-api.md`）：三份文档末尾的"Mapping to …"章节已全部重写，改为反映实际已交付的工具清单。`06` 现列出 5 个已发布的 `smartmoney_*` 工具（替换原先 7 个 `market_*` 提案命名），并注明 `feat/smartmoney-fix` 分支正在进行进一步重构。`07` 现列出 6 个扁平 `dcd_*` 工具，并说明将 quote→trade 和 redeem-quote→redeem 合并为单一工具的设计决策。`08` 现列出 5 个统一的 `dca_*` 工具（通过 `algoOrdType: spot_dca | contract_dca` 区分 V1/V2），并新增"待实现（Backlog）"小节，列出 10 个尚未封装的 V2 上游 API 路径。Closes #187。

---

## [1.3.2] - 2026-04-27

### 变更

- **`skills/okx-cex-auth/SKILL.md` — 严格展示模板 + 等用户信号流程**：
  - 登录发起：从"示例回复格式"升级为中英双语严格模板，四个必显字段（`站点` / `链接` / `验证码` / `有效期`）。模板措辞为硬约束，不得缩写、改写、调序、翻译。
  - 取消自动轮询：不再每 5–10 秒自动轮询 `okx auth status --json`。改为等用户信号（如 "done" / "好了"），收到后跑一次 `auth status --json` 验证。
  - 登录成功展示：仅保留 `站点` + `权限` 两个字段。显式负面清单禁止暴露 `expiresAt` / `ttl`（这是 access token TTL，不是 OAuth session 有效期，token 会自动展期，显示会误导用户以为马上过期）和 `profile`（内部路由字段）。用户询问 session 何时过期时，必须使用固定话术 "Session stays active as long as you use the CLI periodically."，禁止引用具体数字。
  - 跨段落一致性：Step 0.3 表格与 Login Status Check 表格已同步引用新模板与等信号语义。

### 新增

- **Phase 3b CLI 高级用户参数 — `--tpLevel`（多值可重复）**（issue #183，CLI 高级参数 — 不暴露至 MCP / skill）。支持在单笔订单上附加多层次止盈，替代此前需在建仓后手动挂第二笔算法单的变通方式，实现真正的多级止盈一单下达。使用方式：多次传 `--tpLevel`，每次值为逗号分隔的 `key:value` mini-DSL 字符串（例如 `--tpLevel "px:78000,sz:0.5,kind:limit" --tpLevel "px:81000,sz:0.5,kind:limit"`）。有效 key：`px`（tpOrdPx）、`sz`、`kind`（tpOrdKind）、`triggerPx`（tpTriggerPx）、`triggerPxType`、`amendPxOnTrigger`、`clOrdId`。适用于 `okx {swap,spot,futures} place` 和 `okx {swap,spot,futures} algo place`。冲突检测：同时传 `--tpLevel` 与 `--tpTriggerPx`/`--tpOrdPx` 将在 CLI 层报错。向后兼容：不传 `--tpLevel` 时与 Phase 3a+c 产生完全相同的报文。MCP 工具 `inputSchema.properties` 不变——该参数不可通过 MCP 工具描述或 skill 工作流发现，有意限制 AI agent 自主调用。
- **Phase 3a+c CLI 高级用户参数 — `--tpTriggerRatio`、`--slTriggerRatio`、`--closeFraction`、`--tradeQuoteCcy`、`--banAmend`、`--pxAmendType`**（issue #182，CLI 高级参数 — 不暴露至 MCP / skill）。新增六个可选 CLI 参数，面向量化高级用户。`--tpTriggerRatio`/`--slTriggerRatio`：基于比例的止盈/止损触发（相对入场价的百分比），适用于 swap/spot/futures algo place 命令。`--closeFraction`：条件/OCO 算法订单的部分平仓比例（与 `--sz` 互斥，由 OKX 服务端强制校验，冲突返回错误码 51000，CLI 侧不做验证）。`--tradeQuoteCcy`：SPOT 下单时指定计价货币（如 USDT|USDC|BTC）。`--banAmend`：禁止 OKX 对 SPOT 市价单自动修正数量。`--pxAmendType`：禁止 OKX 对超出范围的价格自动纠正（"0"=允许自动纠正，"1"=拒绝下单）。所有参数均为可选且无默认值，不传时与 Phase 2 产生完全相同的报文，向后兼容。MCP 工具 `inputSchema.properties` 不变——这些参数不可通过 MCP 工具描述或 skill 工作流发现，有意限制 AI agent 自主调用。
- **Phase 2 算法订单类型 — `trigger`（挂单）、`chase`（追单）、`iceberg`（冰山）、`twap`**（issue #181）。在 `okx {swap,spot,futures} algo place` 上新增四个 `ordType` 值，补齐 OKX OpenAPI v5 枚举缺口。`trigger`（挂单）：市场价触达 `--triggerPx` 时自动挂出限价/市价单（需传 `--triggerPx` + `--orderPx`）。`chase`（追单）：智能追踪最优买卖价，在可配置距离/比例范围内跟单（`--chaseType`、`--chaseVal`、`--maxChaseType`、`--maxChaseVal`）。`iceberg`（冰山）：将大单拆分为固定间隔的子单以减少市场冲击（`--szLimit`、`--pxLimit`、`--timeInterval`、`--pxVar`/`--pxSpread`）。`twap`（时间加权均价）：与冰山共用同一组参数，按时间均匀拆单。向后兼容：现有 `conditional`/`oco`/`move_order_stop` 调用产生完全相同的报文。Token 预算增量：约 +600 tokens（3 个工具 × 4 个新 ordType × 约 5 个新参数）。
- **Phase 1 算法订单参数 — `--tpOrdKind`、`--tpTriggerPxType`、`--slTriggerPxType`、`--stpMode`、`--cxlOnClosePos`**（issue #178）。新增五个可选参数，补齐 CLI/MCP 与 OKX OpenAPI 的高优先级参数差距。`--tpOrdKind limit` 立即以限价挂单形式下止盈（无触发阶段）。`--tpTriggerPxType`/`--slTriggerPxType` 控制止盈/止损触发价来源（`last`/`index`/`mark`）。`--stpMode` 启用自成交保护（`cancel_maker`/`cancel_taker`/`cancel_both`）。`--cxlOnClosePos` 在对应仓位平仓时自动撤销算法订单。所有参数均为可选；不传则与旧版行为完全一致，向后兼容。适用于：`okx {swap,spot,futures,option} place`、`okx {swap,futures} algo place`、`okx spot algo place`。

### 修复

- **`suggestSubcommand` 不再幻觉出不存在的子命令路径**（issue #179）。此前，`packages/cli/src/unknown-command.ts` 中的 `x-y → y x` 启发式规则只要 `b` 出现在模块的 `knownActions` 列表中就会建议 `"<b> <a>"`，而不验证该路径是否真实存在。例如 `okx swap set-leverage` 会建议 `okx swap leverage set`，但该子命令根本不存在。修复方案：`suggestSubcommand` 新增 `knownPaths: readonly string[]` 参数，仅当组合路径被明确列出时才返回建议。`place-algo → algo place` 的正向场景（#173）得以保留——调用方传入 `["algo place", "algo cancel", ...]` 作为 `knownPaths`。不含多词子命令路径的模块默认传 `[]`，完全屏蔽错误建议。
- **Codex CLI 无法加载 `okx-cex-trade` skill** — description 字段超过 Codex 1024 字符上限（原为 1448 字符）。通过去重同义触发词短语精简至 1017 字符，保留全部具体交易类型触发词。同步精简 `okx-sentiment-tracker`（944 → 652 字符）和 `okx-cex-market`（887 → 706 字符）以留有余量。新增 CI 测试 `packages/cli/test/skill-description-length.test.ts`，自动检查 1024 字符上限，防止未来回归。

## [1.3.2-beta.4] - 2026-04-24

### 新增

- **OAuth Bearer token 认证（`okx auth`）**：基于 `okx-auth` Rust 二进制的全新认证方式，支持 OAuth 2.1 Device Flow。`okx auth login` 发起浏览器登录，`okx auth status` 查看会话状态，`okx auth logout` 注销令牌。二进制负责令牌存储、刷新（300 秒提前量）及 scrypt + AES-256-GCM 加密。运行时通过 fd3 管道读取令牌，JS 侧 60 秒缓存。每次请求动态选择认证方式：API key HMAC 优先，OAuth Bearer token 兜底。
- **`okx auth install/install-status/remove` CLI 命令**：管理 `okx-auth` 二进制安装。CDN 下载带校验和验证、原子替换及多源备用——复用 DoH installer 模式。
- **`skills/okx-cex-auth/SKILL.md`**：新增 OAuth 认证工作流 Skill 文档。
- **`postinstall` 自动下载 okx-auth 二进制**：`npm install` 时与 DoH 二进制一起 best-effort 下载。
- **`context-kg/` 知识库**：新增 `technical/06-oauth-authentication.md`，覆盖 OAuth 子系统架构、二进制分发、fd3 令牌读取、认证优先级及 CLI 命令。

### 变更

- **`loadConfig()` 改为异步**（返回 `Promise<OkxConfig>`）：启动时调用 `execAuthStatus()` 检测 OAuth 登录状态。
- **`OkxConfig` 新增必需字段 `profile`**：已解析的 profile 名称，用于 OAuth 令牌存储路径。
- **`OkxRestClient.buildHeaders()` 改为异步**：支持每次请求动态选择认证方式（API key HMAC 或 OAuth Bearer token）。
- **`PLATFORM_MAP["linux-arm64"]` 现在映射为 `linux-x64`**（`packages/core/src/pilot/installer.ts`）。这是为了匹配 Apple Silicon 上的 Docker Desktop 标准测试环境——容器在 `linux/amd64` 模拟下运行。原生 `linux-arm64` 主机将安装 `linux-x64` binary 并依赖主机的 binfmt / 模拟层。这是有意的 alias，并非 issue #166 修复的回归——条目依然存在，只是指向 x64 目录。原生 `linux-arm64` CDN 目录作为后续工作跟进。

### 修复

- **`okx auth login` 现在会在已有 API key 配置时拒绝启动 OAuth。** 之前 `cmdAuthLogin` 不看 `~/.okx/config.toml` 就直接 spawn `okx-auth` binary，导致 agent 按旧 skill 流程在已有 API key profile 的机器上发起 OAuth device flow，用户会拿到一个根本不需要的登录 URL + 验证码。修复后 `cmdAuthLogin` 先调 `readFullConfig()`：任一 profile 有非空 `api_key` 时打印 `"API key already configured (profile: <name>). OAuth login skipped — API key will be used automatically."` 并直接 exit 0，不再 spawn binary。`--manual` 模式下改输出 JSON `{"status":"skipped","reason":"api_key_configured","profile":"<name>","message":"..."}`，方便 agent 程序化识别。与 REST client 中既有的 "api_key 优先、从不回退 OAuth"（`rest-client.ts applyAuth`）形成双保险。

- **`skills/okx-cex-auth/SKILL.md` 的 pre-flight 决策树重写**，改为严格的三步序：（1）先看有没有选过 site（`config show --json` 任一 profile 的 `site` 字段 ∪ `auth status --json` 的 `site` 字段），没选过则 agent 在对话里按固定文案弹出站点菜单让用户选，**然后**才进入任何登录分支；（2）再看有没有 `api_key`，有就停；（3）都没有才真正走 OAuth，并带上第 1 步选定的 `--site`。此前决策树把 "First-Time Setup 或 Login Flow" 当成可互换分支，模型因而可能跳过站点选择、直接让 `okx-auth` binary 兜底到 `global`。同步修正了"`okx config init` 一步搞定 site 选择 + OAuth"的错误描述——`cmdConfigInit` 是 API key 向导（site + demo/live + AK/SK/PP），不触碰 OAuth。新增 **Step 0.2.a**：当 config 里有 api_key profile 但 API 调用返回 `401 Unauthorized` / `Invalid Sign` 时，**OAuth 登录不是有效的补救**——rest-client 依然优先用那条坏掉的 api_key，拿到 OAuth token 也用不上。agent 必须中性列出两条路（换新 api_key，或先删 profile 再走 OAuth）让用户选，不许把 OAuth 标成"推荐"。修复在 openclaw 里观察到的 Haiku 4.5 错误行为：在有坏 api_key 的情况下把 OAuth 打上"推荐"标签，而实际上 OAuth 根本没法生效。

- **`skills/_shared/preflight.md` 和 `skills/okx-cex-portfolio/SKILL.md` 的认证方式检测修正。** 此前两份文档都用 `okx auth status --json` 的 `apiKey` 字段来区分 API key 模式和 OAuth 模式——但这个字段反映的是 `okx-auth` binary 自身的状态，**无论 `~/.okx/config.toml` 里有没有 API key profile 永远是 `false`**，根本检测不到 API key 用户。后果：agent 按老 preflight 查出来 `apiKey: false, status: not_logged_in` 就会判成"无认证"，把已经有效配置了 API key 的用户误导到 OAuth 登录流程。修复后要求**同时**跑 `okx config show --json`（API key 的唯一可靠来源）和 `okx auth status --json`（OAuth session 状态），决策表先查 API key，不再依赖 `apiKey` 这个不可靠字段。

- **`skills/okx-cex-trade/SKILL.md`、`skills/okx-cex-bot/SKILL.md`、`skills/okx-cex-earn/SKILL.md` 的 Step A 认证检测修正。** 与上一条 preflight/portfolio 修复同类问题：这三个 skill 的凭证检查都基于 `auth status --json` → `apiKey`（永远 `false`），导致 API key 用户被误导到 OAuth 登录流程。Step A 现在要求同时跑 `okx config show --json` 和 `okx auth status --json`，先查 API key 是否存在，只有在确认没有 API key profile 时才走 OAuth 分支。

## [1.3.2-beta.3] - 2026-04-23

### 修复

- **`event_get_orders` / `event_get_fills` 返回空数组** — 根因：EVENTS 合约的 `/api/v5/trade/fills`（3 天窗口）经常返回空，而 `/api/v5/trade/fills-history`（3 个月）才有数据。wrapper 缺少 `archive` 模式和其他查询参数。已添加 fills 的 `archive` 模式、orders 的 `status`（open/history/archive）路由、时间范围过滤（`begin`/`end`）、游标分页（`after`/`before`）和 `ordId` 过滤。同时确认 `instFamily` 对 EVENTS 不支持（会导致 HTTP 400）。响应中新增 `requestParams` 字段便于调试。

### 变更

- **`smartmoney` 描述优化。** MCP / CLI / skill 统一为 "instId takes precedence if both set"。池过滤器描述保留枚举/默认值/关键语义（`PNL_TOP20` = 前 20%、`period` 仅胜率窗口），去掉冗长解释；各 tool 描述显式 ts-or-dataVersion 必填。仅文档变更，无运行时行为变化。

## [1.3.2-beta.2] - 2026-04-23

### 变更

- **`smartmoney signal` / `smartmoney_get_signal`：文档推荐使用 `--instId`，`--instCcy` 可能返空。** `/api/v5/journal/smartmoney/signal` 接口按 spec 支持 `instCcy`，但实际调用时即便 `/overview` 能用同样的 `instCcy` 返回数据，`/signal` 仍可能返回 `data: []`。工具描述、CLI 参考文档和 API 文档现已引导调用方使用 `--instId`（如 `BTC-USDT-SWAP`）以获得稳定结果。未改代码，`instCcy` 仍会照常透传。

- **`okx doh` 命令已替换为 `okx pilot`**（issue #169）。`doh` CLI 模块已移除，改为 `pilot`（`okx pilot status/install/remove`）。现在运行 `okx doh` 会报未知命令。

- **CDN 路径统一：`installer.ts` 与 `postinstall-notice.js` 现均使用 `/upgradeapp/tools/pilot`**（issue #169）。此前两个文件不同步——`installer.ts` 使用 `/upgradeapp/doh`，而 `postinstall-notice.js` 已更新为 `/upgradeapp/tools/doh`。两者现统一指向 `/upgradeapp/tools/pilot`，旧路径已不再有效。

#### 破坏性变更

- **环境变量 `OKX_DOH_BINARY_PATH` 已重命名为 `OKX_PILOT_BINARY_PATH`**。不提供向后兼容的 shim。请更新所有设置了此变量的脚本或 shell 配置文件。

- **环境变量 `OKX_DOH_CACHE_PATH` 已重命名为 `OKX_PILOT_CACHE_PATH`**。不提供向后兼容的 shim。请更新所有设置了此变量的脚本或 shell 配置文件。

- **缓存文件 `~/.okx/doh-cache.json` 已替换为 `~/.okx/pilot-cache.json`**。旧文件已废弃，可安全删除（`rm ~/.okx/doh-cache.json`）。新缓存将在下次请求时自动生成。

- **`okx doh` 命令已移除，替换为 `okx pilot`**。三个子命令均已迁移：`okx pilot status`、`okx pilot install`、`okx pilot remove`。

### 修复

- **`okx market oi-history` 表格渲染修复——不再在有数据时错误打印 "No OI data"**。接口返回的 `data` 是数组 `[{ instId, bar, rows: [...] }]`，但 CLI 直接在数组上访问 `data["rows"]`，结果恒为 `undefined`，永远走到"空数据"分支。现在 handler 先取 `data[0]` 再读 `rows`/`instId`/`bar`。`--json` 模式原本就不受影响，输出保持不变。单元测试同步更新为真实的数组包裹形状，防止此类 bug 在测试中被悄悄吃掉。

- **Pilot 二进制安装器现已支持 `linux-arm64` 平台**（issue #166）。`getPlatformDir()` 缺少 `"linux-arm64"` 映射条目，导致 ARM64 Linux 主机安装/更新时回退到 `undefined`，将二进制写入错误路径。现已补充 `"linux-arm64": "linux-arm64"` 条目。

- **网络故障时 Pilot 代理重解析现在使用 `await` 等待完成**（issue #166）。`rest-client.ts` 中有两处调用 `handleNetworkFailure()` 为 fire-and-forget（`handleNetworkFailure().catch(() => {})`），导致缓存写入和代理状态更新可能与重试请求产生竞态条件。两处现均改为 `try { await this.pilot.handleNetworkFailure(); } catch {}`，确保代理节点完全解析、缓存已持久化后再发起重试。

- **`market` 分发器：`orderbook`、`candles`、`trades`、`funding-rate` 不再触发虚假的 `Unknown market command` 错误和 exit 1**（issue #175，回归来自 2026-04-14 的 commit `9fd4717`）。该次重构将过滤命令提取到 `handleMarketFilterCommand`，但在函数尾部保留了 `errorLine + exitCode=1` 的副作用代码。由于 `handleMarketPublicCommand` 无条件以 tail-call 方式调用 `handleMarketFilterCommand` 作为兜底，这段副作用会在 `handleMarketDataCommand` 有机会分发之前就触发——四个子命令的 stdout 输出正确 JSON，但同时向 stderr 写入了报错并 exit 1，导致使用 `set -e` 的脚本即便 API 调用成功也会被强制中断。修复方案：从 `handleMarketFilterCommand` 尾部移除副作用代码块（无匹配时静默返回 `undefined`，与其他所有子处理函数保持一致）；在 `handleMarketCommand` 中两个子分发器均返回 `undefined` 后调用 `unknownSubcommand("market", action, [...])`——与 #173 之后 `swap`、`spot`、`futures`、`option`、`account`、`bot` 所采用的模式完全相同。真正未知的 market 子命令（如 `okx market foo`）仍会通过 `unknownSubcommand()` 输出结构化诊断信息并 exit 1。

- **`account_get_asset_balance` 总资产估值现在默认以 USDT 计价**（issue #174）。此前 `showValuation=true` 调用 `/api/v5/asset/asset-valuation` 时未传 `ccy` 参数，OKX 默认以 BTC 计价——持有 $3,834 的用户会看到 `0.049` 而非 `3834`。新增 `valuationCcy` 参数（默认 `"USDT"`），该值现在作为 `ccy` 参数传入估值接口。调用方可以覆盖为任意 OKX 支持的计价币种（例如 `valuationCcy="BTC"`）。所选计价币种同时以 `valuationCcy` 字段回写到返回 JSON 中，方便调用方判断单位。CLI：`okx account asset-balance --valuation` 现在默认显示 USDT 计价的总资产；如需 BTC 计价请用 `--valuationCcy BTC`。

- **CLI 不再在遇到未知子命令时静默退出 0**（issue #173）。之前每个二级 module 分发器（`swap`、`spot`、`futures`、`option`、`account`、`bot`）在 action 名未命中任何注册分支时，会 `return undefined` 直接 fall-through——`okx swap place-algo` 直接 exit 0 无任何输出，脚本里的 `&& echo OK` 会把失败当成功，完全掩盖真实问题。现在每个分发器调用共享的 `unknownSubcommand()` helper：向 stderr 打印 `Unknown command: okx <模块> <动作>`、列出该模块可用子命令、在适配场景下建议从 MCP 名反推 CLI 形式（如 `place-algo` → `algo place`），并设置非零 exit code。线索来自 CS Telegram 2026-04-21 客户反馈——`okx --profile demo swap place-algo ...` 全静默退出，客户无法判断是功能坏了还是命令写错了。

- **`skills/okx-cex-trade/` 参考文档现在显式说明 CLI ↔ MCP 命名不一致**。顶层 `SKILL.md` 加了 warning；`references/swap-commands.md` 加了专门的"Naming — CLI vs MCP tool"映射表，把每个 MCP 工具标识符和对应的 CLI 子命令路径一一列出。和上一条同一 #173 事件：客户看到 MCP 工具列表里的 `swap_place_algo_order` 就把 CLI 形式猜成 `swap place-algo`——修复前会静默失败，现在会显式报错。

## [1.3.2-beta.1] - 2026-04-21

### 新增

- **`spot_set_leverage` MCP 工具及 `okx spot leverage` CLI 命令**：设置现货保证金或全仓杠杆倍数。支持 `--instId`（标的级别）或 `--ccy`（币种级别）与 `--lever`、`--mgnMode` 组合使用。HTTP 请求发出前进行输入验证——非数字、零值或负值的 `lever` 将立即返回可操作的错误信息。覆盖 OKX 现货/保证金全部 5 种杠杆场景。

- **Smart Money 模块**（`smartmoney`）：新增 5 个只读 MCP 工具（`smartmoney_get_overview`、`smartmoney_get_signal`、`smartmoney_get_signal_history`、`smartmoney_get_traders`、`smartmoney_get_trader_detail`）及对应 CLI 命令，支持查询交易员排行榜、持仓分析和聪明钱信号。

- **`context-kg/` 上游 API 规格**：在 `context-kg/business/` 新增三份业务域参考文档，记录本仓库调用的上游 OKX API 合约 —— `06-leaderboard-smartmoney-api.md`（issue #94 所需的 7 个牛人榜/聪明钱端点，含实盘探测状态和字段漂移说明）、`07-dcd-api.md`（8 个 DCD 结构化产品端点，含状态机和错误码）、`08-dca-api.md`（19 个现货/合约 DCA 机器人端点，含同步跟单限制）。用作实现阶段核对工具设计、请求/响应结构、枚举值的权威依据。
- **`grid_amend_order` MCP 工具 及 `okx bot grid amend` CLI 命令** — 无需停止即可修改运行中的网格机器人。支持三种模式，可在同一次调用中组合使用：价格区间模式（`maxPx`+`minPx`+`gridNum`）调整上下边界和格数；止盈止损模式（`instId` + 任意 `tpTriggerPx`/`slTriggerPx`/`tpRatio`/`slRatio`）设置或清除止盈止损；组合模式同时修改两类参数。传入 `"-1"` 可明确清除已有的止盈或止损。CLI：`okx bot grid amend --algoId <id> [--maxPx ..] [--minPx ..] [--gridNum ..] [--instId ..] [--tpTriggerPx ..] [--slTriggerPx ..]`。

#### 破坏性变更

- **`grid_stop_order` MCP 工具：`stopType` 值 `"3"`、`"5"`、`"6"` 已明确删除**（ALGO-37613）— 这些值对网格机器人停止操作不再有效，禁止继续使用。有效集合缩减为 `["1","2"]`：`"1"` 立即平仓退出（默认），`"2"` 停止策略但不平仓。传入 `"3"`/`"5"`/`"6"` 的调用方将在 schema 校验阶段失败。**迁移方案**：根据期望的退出行为，将 `"3"/"5"/"6"` 替换为 `"1"`（立即平仓）或 `"2"`（保留持仓）。

### 修复

- **`swap_set_leverage` / `futures_set_leverage` 输入校验增强**：无效的 `lever` 值（非数字、零值、负值）现在在 HTTP 请求发出前即被拒绝，并返回明确的错误信息，不再透传为 OKX 51xxx 错误。`mgnMode` 和 `posSide` 字段校验已对齐允许枚举值。`cross` 与 `long`/`short` 的组合被明确拦截，提示"posSide 仅在逐仓模式下有效"，与 OKX 业务规则一致，可将约 9.7% 的无效请求失败率显著降低。工具描述已重写，枚举了 SWAP/FUTURES 的三种适用场景（全仓指数级 / 逐仓单向 / 逐仓对冲），并明确标注组合保证金全仓模式不支持。

### 变更

- Smart Money 信号接口路径变更：`/api/v5/journal/public/smartmoney/*` → `/api/v5/journal/smartmoney/*`，与上游 OKX 端点对齐（4.1 signal、4.2 signal-history、4.3 overview）。
- 移除 Smart Money 模块的模拟盘限制——5 个工具现在在实盘和模拟盘模式下均可使用。此前在 demo 模式下会抛出 `ConfigError`。

- **News CLI `--importance` 默认值改为 `low`**：`okx news latest`、`okx news by-coin`、`okx news search` 原先在用户未指定 `--importance` 时会透传 `undefined`，服务端按 `high` 默认只返回高重要性新闻，导致结果偏窄。现在三个命令默认使用 `low`（返回全部新闻，同时包含 high 和 low），更贴合"尽可能多"的浏览意图。用户只想看突发 / 重大新闻时，显式传 `--importance high`，或使用专门的 `okx news important` 命令。MCP `news_get_latest` / `news_get_by_coin` / `news_search` 工具描述同步更新，引导 AI 在用户泛泛浏览时使用 `low`，仅在明确要求"重要新闻"时切换到 `high`。

- **News skill：优化 `--platform` 场景的时间窗口处理**。API 的 `--begin` 默认窗口只有 72 小时，对发文节奏不稳定的来源来说太窄，经常返回空结果。`okx-sentiment-tracker` 的 Source-Filtered News 与 Empty Results 降级章节现在指导 Agent：在判定某来源无数据之前，先把 `--begin` 放宽到 7 天、再放宽到 30 天重试。Known Limitations 中写死各平台活跃度的表被移除——这些判定基于 72 小时窗口假象，会误导 Agent 过早放弃。替换为通用规则：平台发文节奏不稳定，候选平台应由 `okx news platforms` 解析而非硬编码。

---

## [1.3.1] - 2026-04-17

### 新增

- **`news` 模块（恢复上线）**：Orbit News API 集成获合规审批后重新上线，提供七个工具：最新资讯、按币种查询、搜索、文章详情、来源列表、币种情绪及情绪排行。CLI：`okx news latest / by-coin / search / detail / platforms / sentiment / sentiment-ranking`。支持 `--platform` 参数按新闻来源过滤（如 `blockbeats`、`odaily_flash`）。`Accept-Language` 使用标准 IETF BCP 47 格式。所有新闻工具在模拟盘模式下返回明确的 `ConfigError`。(!251, !249, !235)

- **事件合约模块**（`event`）：全新二元预测市场模块，包含 9 个 MCP 工具及对应 CLI 命令，支持浏览开放事件、查询合约详情、下单及管理事件合约订单。(!216)

- **闪电赚币模块**（`earn.flash`）：新增闪电赚币工具，支持即时申购和赎回操作。(!246)

- **三个新市场工具**——`market_filter`（多维度筛选标的）、`market_get_oi_history`（持仓量历史）和 `market_get_oi_change_filter`（按 OI 变化幅度筛选）。CLI：`okx market filter / oi-history / oi-change-filter`。(!245)

- **CLI 帮助文本自动生成及 `okx list-tools`**：CLI 帮助文本现从 `@agent-tradekit/core` ToolSpec 对象的 `CLI_REGISTRY` 映射中动态生成，确保帮助文本与 MCP 工具注册表保持同步。新增 `okx list-tools [--json]` 命令，将完整注册表序列化为结构化 JSON，供 AI Agent 自发现枚举所有能力。(!234)

- **`okx doh` 二进制管理命令**：`okx doh status` 显示二进制路径、大小、SHA-256 及 CDN 匹配状态；`okx doh install` 下载或更新二进制；`okx doh remove` 删除二进制（需确认或加 `--force`）。DoH 状态同步集成至 `okx --version` 和 `okx diagnose` 输出。(!232)

- **DoH（DNS-over-HTTPS）API 代理**：当 OKX API 域名无法直连时（如 DNS 污染），SDK 透明地通过本地 `okx-doh-resolver` 二进制解析备用代理节点，采用缓存优先策略并自动排除失败节点。`postinstall` 自动下载平台专用二进制至 `~/.okx/bin/`，支持 darwin-arm64、darwin-x64、linux-x64、linux-arm64 和 win32-x64。(!230, !237)

- **`context-kg/` 代理知识库及准确性漂移测试**：面向 AI 代理的结构化知识文件，涵盖交易、市场/账户、赚币/机器人、错误处理、多站点架构、DoH 代理、`tgtCcy=margin` 用法及测试质量规则。自动漂移测试在 CI 时校验声明数量与代码实际状态一致。(#137, #160, !231, !238, !248)

### 修复

- **错误码修复建议与 OKX 官方 API 错误文档一致**：自定义提示语替换为 OKX 官方 API 错误文档的原文内容。(#163, !250)

- **CLI `list-tools` 路由修复**：`okx list-tools` 不再回落为主路由的"Unknown command"。(#161, !247)

- **CLI 帮助文本：缺失参数已审计补全**：审计发现的所有帮助文本参数缺失问题已逐一修复。(#155, !244)

- **市场指标描述优化及名称验证**：指标名称现进行合法性校验，无效名称返回明确错误而非静默返回空结果。(#153, !243)

- **`market_get_funding_rate` 校验 SWAP `instId`**：非 SWAP 合约 ID 现在调用 OKX API 前即被拦截并返回明确错误。(#152, !242)

- **市场筛选文档：SPOT 查询需显式传入 `quoteCcy=USDT`**：在工具和 CLI 描述中明确说明 SPOT 市场查询须包含 `quoteCcy=USDT`，以避免空结果。(!257)

- **Skills 语言中立化**：移除 `SKILL.md` 中硬编码的中文提示，确保 Agent 在任意语言环境下行为一致。(!233)

- **Skills：杠杆错误排查指引**：新增杠杆相关错误的具体修复步骤，并增加通用保护规则——执行写操作修复前须先通过只读查询诊断并获得用户确认。(!229)

- **CLI 代码审查建议修复**：修复代码审查中发现的多处外观和行为问题。(#141, #142, #143, !236)

### 变更

- **Skills 下载改为两步预签名流程**：`skills_download`（MCP）和 `okx skill download`（CLI）现先获取短效预签名 URL 再下载技能包，提升下载安全性和可靠性。(!240)

- **DoH 解析器升级至 v9**：二进制更新，包含修订的协议及 CDN 节点列表。(!255)

- **Skills 文档：止盈止损修改流程说明优化**：技能文档现引导用户对已有算法单使用 `algo_amend_order` 修改止盈止损，提升功能可发现性。(!241)

- **CLI `okx news domains` 重命名为 `okx news platforms`**：与 `--platform` 参数术语保持一致。

- **Skill 重命名 `okx-cex-news` → `okx-sentiment-tracker`**：Skill 目录和 frontmatter name 已更新。MCP 工具名（`news_*`）和 CLI 命令（`okx news`）不变。

### 移除

- **`importance=medium` 枚举值**：从 `NEWS_IMPORTANCE` 校验中移除。OKX API 不支持 `medium`，传入会返回参数错误（51000）。仅 `high` 和 `low` 有效。

---

## [1.3.1-beta.7] - 2026-04-15

### 修复

- **`okx list-tools` 路由穿透"Unknown command"问题**：修复命令路由，`list-tools` 可正确派发，不再穿透到默认未知命令处理器。(#161)

---

## [1.3.1-beta.6] - 2026-04-14

### 新增

- **事件合约模块**：新增 `event` 模块，包含 9 个 MCP 工具和 CLI 命令，支持二元预测市场 — 浏览系列/事件/合约、下单/改单/撤单、查询订单/成交记录。
- **DoH（DNS-over-HTTPS）代理**：OKX API 不可直连时自动切换备用代理节点，缓存优先，零额外开销，支持 `--verbose` 日志。支持 darwin-arm64/x64、linux-x64/arm64、win32-x64。
- **`okx doh` 管理命令**：`okx doh status`（查看状态/SHA-256/CDN 校验）、`okx doh install`（下载/更新）、`okx doh remove`（删除）。(#138)
- **`okx --version` 及 `okx diagnose` 显示 DoH 状态**。(#138)
- **CLI 帮助内容自动从 ToolSpec 注册表生成**：帮助文本由 `CLI_REGISTRY` 动态生成，与 MCP 工具注册表保持同步，双向漂移测试捕获不一致。(#140)
- **`okx list-tools [--json]` Agent 自发现命令**：将完整 CLI 注册表序列化为结构化 JSON，供 AI Agent 编程枚举能力。(#140)
- **止盈止损修改可发现性提升**：`{module}_amend_order` 引导至 `{module}_amend_algo_order`；Skills `workflows.md` 新增"修改止盈止损"场景。(#151)
- **行情筛选工具**（`market`）：3 个新 MCP 工具和 CLI 命令 — `market_filter` / `okx market filter`（按价格/涨跌幅/市值/成交量/资金费率/持仓量筛选）、`market_get_oi_history` / `okx market oi-history`（OI 时序及 bar 变化量）、`market_filter_oi_change` / `okx market oi-change`（按 OI 变化幅度排序）。
- **`news` 模块恢复**：7 个 MCP 工具和 CLI 命令，含最新新闻、按币种查询、全文搜索、文章详情、来源列表、情绪分析，修复 `Accept-Language` 头默认值。
- **Flash Earn 模块**（`earn.flash`）：`earn_get_flash_earn_projects` MCP 工具和 `okx earn flash-earn projects` CLI 命令，浏览即将开始和进行中的闪赚项目。
- **`context-kg/` 知识库扩充**：新增 DoH 子系统文档，补充 `tgtCcy=margin` 说明，更新架构文档及完整测试 QA 规范。(#150)
- **Skills 下载改用两步预签名流程**：`skills_download` / `okx skill download` 改用 presigned URL，提升下载可靠性。

### 变更

- **`market_get_indicator` 描述优化 + 指标名校验前置**：内联列出常用指标名并引导使用 `market_list_indicators`；未知指标名在 API 调用前抛出 `ValidationError` 并附相似名称建议。(#153)
- **`market_filter` `marketCapUsd` 仅限 SPOT**：描述明确该过滤条件仅适用于 `instType=SPOT`，与上游 API 行为一致。

### 修复

- **事件合约接口改用鉴权请求**：4 个事件查询工具改为 `privateGet`，OKX `/public/event-contract/*` 需要鉴权头。
- **Skill docs + MCP server remediation safeguard**：错误建议写操作时，agent 须先只读诊断并等待用户确认。
- **CLI help 缺少参数修复**：补充 `spot`、`swap`、`futures` CLI help 条目中缺少的参数。(#155)
- **Skills 移除硬编码中文提示**：改为英文指令式文本，agent 自适应用户语言。

---

## [1.3.1-beta.4] - 2026-04-10

### 新增

- **DoH（DNS-over-HTTPS）代理**：当 OKX API 域名无法直连（如 DNS 污染）时，SDK 自动通过本地 `okx-pilot` 二进制解析备用代理节点，透明切换。缓存优先策略：首次请求尝试直连，失败后调用二进制并缓存结果，后续请求直接复用，零额外开销。失效节点自动排除并重新解析，支持 `--verbose` 查看完整 DoH 生命周期日志。
- **安装时自动下载 DoH 二进制**：`postinstall` 脚本从 CDN（多源备用）下载平台专属 `okx-pilot` 到 `~/.okx/bin/`，完全 best-effort，不阻塞 `npm install`。支持 darwin-arm64、darwin-x64、linux-x64、win32-x64。
- **`context-kg/` 知识库**：为 AI agent 初始化结构化知识文件——5 个业务域文档（概述、交易、行情/账户、理财/机器人、Skills 生态）+ 4 个技术文档（架构、配置、错误处理、多站点）+ 质量目录占位。同步在 `config.toml.example` 中新增 `knowledge_dir` 配置项。(#137)

### 修复

- **Skill 文档：错误修复建议 safeguard 规则** — 新增通用规则：当 OKX API 错误信息建议执行写操作（撤单、平仓、停止机器人等）时，agent 必须先用只读查询诊断，展示结果并等待用户确认后才能操作。同时补充了杠杆设置失败的具体排查指引。涉及文件：`swap-commands.md`、`futures-commands.md`、`workflows.md`、`SKILL.md`。
- **MCP server：remediation safeguard** — MCP server 初始化时返回 `instructions` safeguard 规则；当错误信息暗示写操作修复（cancel/close/stop）时，自动在 suggestion 中追加警告，提醒 agent 先诊断再确认。

---

## [1.3.1-beta.2] - 2026-04-09

### 新增

- **事件合约模块**：新增 `event` 模块，包含 9 个 MCP 工具和 CLI 命令，支持二元预测市场 — 浏览系列/事件/合约、下单/改单/撤单、查询订单/成交记录，以及带指数价格的方向分析。

### 修复

- **事件合约接口改用鉴权请求**：4 个事件浏览/查询工具（`event_browse_contracts`、`event_get_series`、`event_get_events`、`event_get_markets`）由 `publicGet` 改为 `privateGet`。OKX 的 `/api/v5/public/event-contract/*` 接口虽路径含 `/public/`，实际须携带鉴权头，未鉴权时返回 401。

---

## [1.3.0] - 2026-04-08

### 新增

- **`market_list_indicators` MCP 工具及 `okx market indicator list` CLI 命令**：按分类浏览所有支持的 OKX 市场指标，支持区间过滤（`--fearGreedIndexMin/Max`、`--longShortRatioMin/Max` 等），便于 AI 进行市场情绪筛选。(#124)
- **Market 工具 `demo` 参数**：所有 market MCP 工具新增可选 `demo: boolean` 参数，CLI market 命令支持全局 `--demo` 标志，可独立于服务器 demo 模式显式查询模拟盘行情。
- **简单赚币定期工具**（`earn.savings`）：新增三个工具——`earn_get_fixed_order_list`、`earn_fixed_purchase`（两步申购：预览后确认）、`earn_fixed_redeem`。`earn_get_lending_rate_history` 现同时返回定期产品的年化利率、期限、最低金额和剩余额度。CLI：`okx earn savings fixed-orders/fixed-purchase/fixed-redeem`。
- **按保证金下单模式（`tgtCcy=margin`）**：SWAP、FUTURES 及期权下单/算法单工具支持 `tgtCcy=margin`，此时 `sz` 表示 USDT 保证金金额，系统自动查询当前杠杆倍数并换算合约张数（`contracts = floor(margin × lever / (ctVal × lastPx))`）。(#128)
- **CLI 审计日志**：CLI 将所有工具调用记录写入 `~/.okx/logs/trade-YYYY-MM-DD.log`，与 MCP server 行为一致，`okx account audit-log` 对 CLI 用户生效。(#129)
- **`skills_download` `format` 参数**：支持 `"zip"` 或 `"skill"`。MCP 默认 `"skill"`（agent 友好），CLI 默认 `"zip"`（向后兼容）。文件内容完全相同。

### 变更

- **CLI 表格输出新增环境标题行**：表格输出现显示 `Environment: live` / `Environment: demo (simulated trading)` 标题。
- **`earn_get_lending_rate_history` 新增定期产品查询**：额外发起 best-effort `privateGet` 请求，未配置 API key 时降级返回空 `fixedOffers` 数组。
- **`earn_get_lending_rate_history` 默认 limit 从 100 降为 7**：减少 agent 对话中的 token 消耗。

### 修复

- **Indicator range-filter 代码映射修复**：修正内部代码映射并移除不支持的指标类型，避免静默返回空结果。
- **Skills 文档 indicator 同步**：更新所有指标相关说明和示例，与当前后端数据结构和新 CLI 命令对齐。
- **Skills 文档转账类型码写反**：修正 portfolio 和 earn 文档中 `6`=资金账户 / `18`=交易账户（此前写反）。(#126)
- **`tgtCcy=quote_ccy` 换算改用 `minSz`/`lotSz`**：按 `lotSz` 精度向下取整并与 `minSz` 比较，修复 `minSz < 1` 合约（如 BTC-USDT-SWAP）误报"金额不足"的问题。(#127)
- **CLI `--json` env 包装改为 opt-in（`--env` 标志）**：`--json` 默认返回原始数据（向后兼容），`--json --env` 可获取 `{env, profile, data}` 包装格式。(#131)
- **未知 `tgtCcy` 值抛出 `ValidationError`**：仅接受 `base_ccy`、`quote_ccy` 和 `margin`，其他值抛出异常并附带修复建议，不再静默透传。(#133)
- **`--verbose` 对 CLI 审计日志生效**：verbose 模式写入包含完整请求参数和响应数据的 debug 级别条目；非 verbose 模式仅记录精简摘要。(#130)
- **行情数据默认始终走实盘**：market 工具显式覆盖服务器级别 demo 标志，默认返回实盘数据，显式传 `demo: true` 时才查询模拟盘。

---

## [1.3.0-beta.5] - 2026-04-08

### 新增

- **Skill 下载 `format` 参数**：`skills_download` MCP tool 和 `okx skill download` CLI 命令新增 `format` 选项（`"zip"` 或 `"skill"`）。MCP 默认 `"skill"`（便于 Claude Desktop 等 agent 自动识别文件类型），CLI 默认 `"zip"`（向后兼容）。文件内容完全相同，仅后缀不同。
- **Market 工具 `demo` 参数**：全部 14 个 market MCP 工具新增可选参数 `demo: boolean`，CLI market 命令同步支持全局 `--demo` 标志。传 `demo=true` / `--demo` 时请求打到 OKX 模拟盘行情环境（附加 `x-simulated-trading: 1`）；省略或传 `false`（默认）时始终返回实盘行情——与服务器是否以 `--demo` 模式启动无关。

### 修复

- **行情数据默认始终走实盘**：此前以 `--demo` 启动服务器时，行情查询也会带上 `x-simulated-trading: 1` 导致返回模拟盘数据。现在 market 工具在工具层显式传 `simulatedTrading: false`，覆盖服务器级别的 demo 标志。需要查询模拟盘行情时，显式传 `demo: true` 即可。其他模块（交易、账户、Earn、指标）不受影响，仍跟随服务器 demo 标志。
- **未知 `tgtCcy` 值现在抛出 `ValidationError` 而非静默跳过**：此前 `--tgtCcy margin_ccy` 或 `--tgtCcy QUOTE_CCY` 等拼写错误会被静默忽略，`sz` 原样传给 API 未经转换。现在仅接受 `base_ccy`、`quote_ccy` 和 `margin`，其他值抛出 `ValidationError` 并附带修复建议。(#133)
- **`--verbose` 标志现在对 CLI 审计日志生效**：此前 `TradeLogger` 始终以 `"info"` 级别构造，成功日志也全部使用 `"info"`，导致 `--verbose` 对日志文件内容无任何影响。现在 verbose 模式将日志级别设为 `"debug"`，每次成功的工具调用额外写入一条包含完整请求参数和响应数据的 debug 级别条目；非 verbose 模式仅记录精简摘要。(#130)

---

## [1.3.0-beta.4] - 2026-04-08

### 新增

- **DoH（DNS-over-HTTPS）代理支持**：当 OKX API 域名因 DNS 污染等原因无法直连时，SDK 会透明地通过本地 `okx-pilot` 二进制解析备用代理节点。采用缓存优先策略：首次请求尝试直连，网络失败时调用二进制并缓存结果，后续请求复用缓存节点，零额外开销。故障节点自动排除并重新解析。`--verbose` 模式下可查看完整 DoH 生命周期日志。
- **安装时自动下载 DoH 二进制**：`postinstall` 现从 CDN（多源容灾）下载对应平台的 `okx-pilot` 二进制至 `~/.okx/bin/`。Best-effort，不会阻塞 `npm install`。支持 darwin-arm64、darwin-x64、linux-x64 和 win32-x64。

---

## [1.3.0-beta.2] - 2026-04-07

### 新增

- **简单赚币定期（Simple Earn Fixed）工具**（`earn.savings`）：新增三个工具——`earn_get_fixed_order_list`（按币种/状态查询定期订单）、`earn_fixed_purchase`（两步申购：先预览产品详情再确认，资金锁定至到期）、`earn_fixed_redeem`（赎回定期订单）。`earn_get_lending_rate_history` 现同时返回可用定期产品的年化利率、期限、最低金额和剩余额度。CLI 命令：`okx earn savings fixed-orders`、`okx earn savings fixed-purchase`、`okx earn savings fixed-redeem`。
- **按保证金下单模式（`tgtCcy=margin`）**：SWAP、FUTURES 及期权下单/算法单工具新增 `tgtCcy=margin` 参数值。当 `tgtCcy=margin` 时，`sz` 表示投入的 USDT 保证金成本，系统自动查询当前杠杆倍数并换算为正确的合约张数（公式：`contracts = floor(margin * lever / (ctVal * lastPx))`）。原有 `quote_ccy`（名义价值）和 `base_ccy`（合约张数）模式行为不变。Skills 确认模板现在要求 agent 在用户说"500U"时显性确认是名义价值还是保证金成本。(#128)
- **CLI 审计日志**：CLI 现在会将所有工具执行记录写入 `~/.okx/logs/trade-YYYY-MM-DD.log`，与 MCP server 行为一致。`okx account audit-log` 命令对 CLI 用户不再返回空。(#129)

### 变更

- **`earn_get_lending_rate_history` 新增认证 API 调用以获取定期产品**（`earn.savings`）：该工具现通过 `privateGet` 请求定期产品列表。此调用为 best-effort——若用户未配置 API key，工具仍正常返回活期借贷利率历史，`fixedOffers` 为空数组。
- **`earn_get_lending_rate_history` 默认 limit 从 100 降为 7**（`earn.savings`）：未传 `limit` 时，工具现返回最近 7 条记录而非 100 条，减少 agent 对话中的 token 消耗。

### 修复

- **CLI `--json` 环境包装改为 opt-in（通过 `--env` 标志）**：回退 1.3.0-beta.1 中的破坏性变更，`--json` 输出现默认返回原始数据（向后兼容）。使用 `--json --env` 可获取带环境元数据的包装格式。表格输出的环境标题行不受影响。(#131)
- **`tgtCcy=quote_ccy` 换算：使用 `minSz`/`lotSz` 替代 `Math.floor`**：USDT 转合约张数的换算现在按 `lotSz` 精度向下取整，并与 instruments API 返回的 `minSz` 比较，不再假设最小张数为整数。修复了 `minSz < 1` 的合约（如 BTC-USDT-SWAP `minSz=0.01`）误报"金额不足"的问题。(#127)

---

## [1.3.0-beta.1] - 2026-04-07

### 新增

- **`market_list_indicators` MCP 工具及 `okx market indicator list` CLI 命令**：列出 OKX 市场指标，支持按类别、分页和数量过滤。支持区间过滤参数（`--fearGreedIndexMin/Max`、`--longShortRatioMin/Max` 等），便于 AI 进行市场情绪筛选。(#124)

### 修复

- **Indicator range-filter 代码映射修复**：修正区间过滤参数的内部代码映射，并移除 OKX API 不支持的指标类型，避免返回静默空结果。
- **Skills 文档 indicator 同步**：将所有指标相关说明和示例输出更新为与当前后端数据结构和新增 CLI 命令一致。
- **Skills 文档转账账户类型码写反**：修正 portfolio 和 earn 技能文档中的账户类型码，正确映射为 `6`=资金账户 / `18`=交易账户（此前写反）。(#126)

### 变更

- **CLI `--json` 输出新增环境元数据**：`--json` 输出从原始 OKX API 响应改为 `{"env", "profile", "data"}` 包装结构。使用 `jq '.[0].field'` 的脚本需改为 `jq '.data[0].field'`。表格输出现在会显示环境标题行（`Environment: live` / `Environment: demo (simulated trading)`）。(#207，关联 #117)

---

## [1.2.9] - 2026-04-06

### 新增

- **技能市场第三方免责声明**：在技能市场提示、安装/下载说明以及 CLI 安装流程等关键决策节点新增提示，明确说明市场中的技能由独立第三方开发者提供，帮助用户在安装前做出知情判断。

### 修复

- **SWAP / FUTURES / 期权 `tgtCcy=quote_ccy` 自动换算**：下单处理器现在会在请求发送到 OKX API 之前，自动将计价货币金额（如 USDT）换算为合约张数，覆盖 SWAP、FUTURES 以及期权普通单/算法单场景，避免将报价金额误当作原始张数而导致下单仓位被放大。(#114)
- **`dcd_subscribe` 收益率阈值比较修复**：在与 `minAnnualizedYield` 比较前，现会先将 `annualizedYield` 从小数转换为百分比，因此收益率阈值过滤已恢复正确；同时对非法收益率值会直接拒绝。
- **Skills 文档中的 `tgtCcy` 描述修正**：已明确说明 `tgtCcy` 由内部换算层处理，而不是直接透传给 OKX API，从而减少技能文档中的下单数量理解偏差。
- **CLI 文档：负数值必须使用 `=` 形式**：更新所有 skill 参考文档（swap/futures/spot 命令文档、workflows、SKILL.md），将 `--tpOrdPx -1` / `--slOrdPx -1` 改为 `--tpOrdPx=-1` / `--slOrdPx=-1`，避免 Node `parseArgs()` 将 `-1` 误判为独立 flag。参数说明表中补充说明此语法限制。(#123，关联 #115)

---

## [1.2.9-beta.2] - 2026-04-06

### 新增

- **Skills Marketplace 三方内容免责声明**：在关键信任决策节点（SKILL.md agent 提示、`skills_download` 工具描述、CLI 安装输出、模块文档）添加声明，提示用户 skill 由独立第三方开发者创建，请在安装前知悉。

### 修复

- **SWAP/FUTURES/期权 `tgtCcy=quote_ccy` 自动换算**：对 SWAP、FUTURES 或期权 algo 下单设置 `tgtCcy=quote_ccy` 时，handler 现在会在请求发送至 OKX API 前自动将 USDT 金额换算为合约数量，防止因 OKX 静默忽略该参数而导致仓位放大（例如"100 USDT"变成"100 张合约 ≈$6,700"）。换算并行拉取 `ctVal` 和 `lastPx`，并在响应中附加 `_conversion` 字段说明换算过程。(#114)
- **`dcd_subscribe` 收益率门槛比较**：OKX API 返回的 `annualizedYield` 为小数（如 `0.18` = 18%），但 `minAnnualizedYield` 直接与原始值比较，导致所有门槛检查均误判为不达标。现在正确乘以 100 后再比较。同时新增 `INVALID_YIELD_VALUE` 错误码，当 quote 返回非数值 yield 时明确拒绝。
- **DCD 工具描述优化**：在 `dcd_get_products`、`dcd_get_orders`、`dcd_subscribe` 的 description 中补充 yield 单位说明（小数而非百分比），避免 LLM 误解。

---

## [1.2.8] - 2026-04-03

### 新增

- **`market_get_instruments_by_category` MCP 工具及 `okx market instruments-by-category` CLI 命令**：按 `instCategory` 发现可交易标的——股票代币（3）、金属（4）、大宗商品（5）、外汇（6）、债券（7）。取代 `market_get_stock_tokens`（分类 3）。(#109)
- **技能市场模块**（`skills`）：浏览、搜索并安装 AI 交易技能。工具：`skills_get_categories`、`skills_search`、`skills_download`。CLI：`okx skill search/categories/add/download/remove/check/list`。默认启用。
- **`--live` 标志**：即使当前 profile 设置了 `demo=true`，也强制使用实盘模式，与 `--demo` 互斥。(#108)
- **三通道自动更新**（`okx upgrade`）：支持 stable、beta、latest 三个升级渠道，升级后自动同步内置 agent-skills 版本。
- **`account_get_asset_balance` 新增 `showValuation` 参数**：返回各账户类型（交易/资金/理财等）总资产估值汇总。CLI：`okx account asset-balance --valuation`。(#102)
- **`market_get_candles` 历史端点自动路由**：`after`/`before` 超过 2 天时自动切换至 `/market/history-candles`，`history` 参数已移除。(#101)
- **`okx-cex-trade` SKILL.md 拆分重构**：将详细 CLI 参数表提取至 `references/` 子目录（spot/swap/futures/options/workflows/templates），支持 agent 按需加载。

### 修复

- **合约下单前强制 `ctVal` 查询**：`swap_place_order`、`futures_place_order`、`option_place_order` 均要求先调用 `market_get_instruments` 获取合约面值 `ctVal`。(#113)
- **`account_get_config` 保留 `settleCcy`/`settleCcyList`**：字段不再剔除，改在 description 中说明，避免 AI 模型误解。
- **Earn 写操作在 demo 模式下明确报错**：所有 earn 写工具在模拟交易模式下返回清晰的 `ConfigError`，而非 OKX API 返回的不透明 500 错误。
- **`account_get_asset_balance` 余额零值显示**：余额为 0 时正确显示 `0` 而非 "(no data)"。
- **`--no-demo` 正确覆盖 profile 中的 `demo=true`**：采用三态解析：`--live` 强制实盘，`--demo` 强制模拟，否则读取 profile。(#108)
- **`okx upgrade` 安全修复**：通过 `process.execPath` 解析 npm（S4036）、消除 ReDoS 风险（S5852）、`execSync` 替换为 `spawnSync`（S4721）。
- **预发布版本跳过 preflight drift 检查**：本地 CLI 含预发布后缀时不触发误报。

### 废弃

- **`market_get_stock_tokens`**：由 `market_get_instruments_by_category`（`instCategory="3"`）替代，保留向后兼容，未来主版本移除。
- **`okx market stock-tokens`**：由 `okx market instruments-by-category --instCategory 3` 替代，保留向后兼容，未来主版本移除。

### 移除

- **`news` 模块**：Orbit News API 集成因等待监管合规审批而移除，审批通过后将重新上线。

---

## [1.2.8-beta.7] - 2026-04-03

### 移除

- **`news` 模块已移除，等待合规审批**：[1.2.8-beta.4] 引入的 Orbit News API 集成已回退。所有新闻工具（`news_get_latest`、`news_get_by_coin`、`news_search`、`news_get_detail`、`news_get_domains`、`news_get_coin_sentiment`、`news_get_sentiment_ranking`）、CLI 命令（`okx news …`）及 `okx-sentiment-tracker` Agent Skill 均已移除，待监管合规审批通过后方可重新上线。`skills`（技能市场）模块不受影响。

---

## [1.2.8-beta.6] - 2026-04-02

### 修复

- **合约下单前强制 `ctVal` 查询**：`swap_place_order`、`futures_place_order`、`option_place_order` 的 tool description 新增前置要求——下单前必须先调用 `market_get_instruments` 获取 `ctVal`（合约面值），不得假设合约大小。`sz` 参数说明补充示例（如 ETH-USDT-SWAP：1 张合约 = 0.1 ETH）。`okx-cex-trade` SKILL.md 同步新增关键警告段落。(#113)
- **`account_get_config`：回退字段剥离，改为 description 说明**：beta.5 中直接从响应移除 `settleCcy`/`settleCcyList` 的做法已回退。现保留这两个字段，并在 tool description 中注明其含义——仅适用于 USDS 合约，标准 USDT/coin-margined 交易可忽略。

---

## [1.2.8-beta.5] - 2026-04-02

### 新增

- **新增 MCP 工具 `market_get_instruments_by_category` 及 CLI 命令 `okx market instruments-by-category`**：通过 `instCategory` 字段发现可交易品种——股票代币（3，如 AAPL-USDT-SWAP）、贵金属（4，如 XAUUSDT-USDT-SWAP 黄金）、大宗商品（5，如 OIL-USDT-SWAP 原油）、外汇（6，如 EURUSDT-USDT-SWAP）、债券（7，如 US30Y-USDT-SWAP）。支持 `--instCategory <3|4|5|6|7>`，可选 `--instType`（默认 SWAP）和 `--instId`。category=3 场景替代原 `market_get_stock_tokens`。(#109)
- **`okx-cex-market` skill 更新**：description、command index、instrument-commands 参考文档及 workflows 均已覆盖全部非加密资产类别。新增"非加密资产发现"工作流，引导 agent 完成：发现品种 → 查询行情 → 获取合约规格 → 下单。(#109)
- **Skills Marketplace 模块**（`skills`）：从 OKX Skills Marketplace 浏览、搜索和安装 AI 交易技能。默认启用，可通过 `--modules skills` 单独加载。
  - `skills_get_categories` — 列出所有可用技能分类；返回 `categoryId` 供 `skills_search` 使用。
  - `skills_search` — 按关键词和/或分类搜索技能，返回 `totalPage` 支持分页。
  - `skills_download` — 将技能 zip 包下载到本地目录。
  - CLI 命令：`okx skill search <关键词>`、`okx skill categories`、`okx skill add <名称>`、`okx skill download <名称> [--dir]`、`okx skill remove <名称>`、`okx skill check <名称>`、`okx skill list`。
  - `okx skill add` 自动解压、校验 `SKILL.md`、执行 `npx skills add`，并将安装记录写入 `~/.okx/skills/registry.json`。
  - Agent Skill：`skills/okx-cex-skill-mp/SKILL.md`。

### 废弃
- **MCP 工具 `market_get_stock_tokens`**：由 `market_get_instruments_by_category`（`instCategory="3"`）替代。保留以维持向后兼容，将在未来大版本中移除。
- **CLI 命令 `okx market stock-tokens`**：由 `okx market instruments-by-category --instCategory 3` 替代。保留以维持向后兼容，将在未来大版本中移除。

### 修复

- **Earn 模块：写操作在模拟盘（demo）模式下现在会立即返回语义明确的错误**，而不是打到 OKX API 拿到不透明的 500 服务器错误。在 `earn/index.ts` 注册层增加了统一的 `withDemoGuard` wrapper，所有 earn 写操作工具（savings 申购/赎回、DCD 认购、链上理财、自动申购）在执行前均会被拦截，抛出 `ConfigError`，错误信息为："Earn features (savings, DCD, on-chain staking, auto-earn) are not available in simulated trading mode."，并提示切换为真实账户。只读工具（余额查询、利率历史、产品列表）在 demo 模式下仍可正常使用。`dcd_redeem` 的 preview 模式（不传 `quoteId`，只读价格查询）在 demo 模式下同样可用。未来新增的 earn 工具基于 `isWrite` 标志自动受到保护。
- **`account_get_config` 响应剔除 `settleCcy` / `settleCcyList`**：这两个字段仅适用于 USDS 合约账户，现已从响应中移除，避免 AI 模型将其误解为通用账户设置。*（已在 [1.2.8-beta.6] 中回退——字段保留，改为在 description 中说明。）*

---

## [1.2.8-beta.4] - 2026-04-02

### 新增

- **`news` 模块**（7 个工具）：通过 Orbit News API 提供实时加密新闻查询、全文搜索和情绪分析。所有工具均为只读，无需资金权限。启动参数：`--modules news`。
  - `news_get_latest` — 按时间排序获取最新新闻；支持重要性筛选（`high`/`medium`/`low`）、币种筛选、语言、分页。
  - `news_get_by_coin` — 获取指定币种的新闻（逗号分隔，如 `BTC,ETH`）。
  - `news_search` — 按关键词全文搜索，支持币种、重要性、情绪、排序等过滤条件。
  - `news_get_detail` — 通过新闻 ID 获取完整文章（标题 + AI 摘要 + 原文）。
  - `news_get_domains` — 列出可用新闻来源域名（如 CoinDesk、CoinTelegraph）。
  - `news_get_coin_sentiment` — 获取币种的看涨/看跌快照或时间序列趋势；传入 `trendPoints` 进入趋势模式。
  - `news_get_sentiment_ranking` — 按热度或情绪方向对币种排名。
  - CLI 用法：`okx news latest`、`okx news by-coin <coins>`、`okx news search <关键词>`、`okx news detail <id>`、`okx news domains`、`okx news sentiment <coins>`、`okx news sentiment-ranking`。
  - Agent Skill：`skills/okx-sentiment-tracker/`，含 workflows 引导文档。

### 新增

- **CLI 和 MCP 新增 `--live` 标志**：强制使用实盘交易模式，即使当前 profile 设置了 `demo=true` 也生效。与 `--demo` 互斥（同时传入会报错）。CLI 用法：`okx --live <模块> <命令>`；MCP 启动参数：`--live`。(#108)

### 修复
- **`--no-demo` 标志现在可以正确覆盖 profile 中的 `demo=true`**：此前，由于 `cli.demo` 默认值为 `false`，布尔逻辑导致 `--no-demo` 无法覆盖 profile 配置。现已改为三态逻辑：`--live` 强制实盘、`--demo` 强制模拟盘，否则依次读取环境变量和 profile 配置。(#108)

---

## [1.2.8-beta.3] - 2026-04-01

### 新增

- **三通道自动更新 + skill 版本同步**（`okx upgrade`）：支持 stable、beta、latest 三个 dist-tag 升级渠道，升级后自动同步内置 agent-skills 版本。core 包新增导出 `fetchLatestVersion`、`isNewerVersion`、`fetchDistTags`。
- **`okx-cex-trade` SKILL.md 拆分重构**：将 1,594 行的单体 SKILL.md 精简为 342 行索引文件，详细 CLI 参数表和工作流提取至 `references/spot-commands.md`、`references/swap-commands.md`、`references/futures-commands.md`、`references/options-commands.md`、`references/workflows.md`、`references/templates.md`。与 `okx-cex-earn`、`okx-cex-market` 保持一致，支持 agent 按需动态加载。

### 修复

- **`okx upgrade`：通过 `process.execPath` 动态解析 `npm` 路径**，避免依赖 PATH 环境变量导致升级失败（SonarQube S4036）。
- **`okx upgrade`：消除 ReDoS 风险**——字符串替换从正则改为 `split`/`join` 实现（SonarQube S5852）。
- **`okx upgrade`：`execSync` 替换为 `spawnSync`**，消除安全热点（SonarQube S4721）。
- **预发布版本跳过 preflight drift 检查**：本地 CLI 版本含预发布后缀（如 `1.2.8-beta.3`）时，跳过版本漂移检查，避免误报。

---

## [1.2.8-beta.2] - 2026-03-31

### 修复

- **`account_get_asset_balance` 余额为零时正确显示 `0`**：当账户余额恰好为 0 时，CLI 不再显示占位文字"(no data)"，而是正确展示 `0`。

### 变更

- **`market_get_candles` 自动路由历史端点**：当 `after`/`before` 时间戳超过 2 天前时，自动切换至 `/market/history-candles`，支持查询 2021 年至今的历史K线。新增兜底机制：若近期端点对带时间戳的请求返回空数据，自动重试历史端点。移除 `history` 参数，无需手动切换。CLI 用法：`okx market candles BTC-USDT --after <时间戳>`。(#101)
- **`account_get_asset_balance` 新增 `showValuation` 参数**：设置 `showValuation=true` 可同时返回各账户类型（交易/资金/理财等）的总资产估值汇总，底层调用 `/api/v5/asset/asset-valuation`。默认行为不变（向后兼容）。CLI 用法：`okx account asset-balance --valuation`。(#102)

---

## [1.2.8-beta.1] - 2026-03-31

### 新增

- **DoH（DNS-over-HTTPS）节点解析基础设施** *（实验性——代码在后续 merge 中意外丢失，未包含在稳定版 1.2.8 中）*：新增 `packages/core/src/doh/` 模块（`DohNode` 类型与 `resolveDoh()` 解析器），REST client 集成 DoH 代理节点选择以改善受限网络下的连接稳定性。因依赖平台专属原生二进制包（`@okx_ai/doh-darwin`、`doh-linux`、`doh-win32`）未就绪，代码已从后续版本移除。

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
