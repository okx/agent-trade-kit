[English](ARCHITECTURE.md) | [中文](ARCHITECTURE.zh-CN.md)

# OKX Agent TradeKit — 架构文档

## 1. 概述

OKX Agent TradeKit 是一个 AI 驱动的 OKX 交易工具集。包含 MCP 服务器（`okx-trade-mcp`）和命令行工具（`okx-trade-cli`），允许 AI 代理（Claude Desktop、Cursor 等）和开发者通过 OKX REST API v5 查询行情数据、下单和管理仓位。

- **传输协议**: stdio — 通过标准输入/输出与宿主进程进行 JSON-RPC 通信
- **运行时**: Node.js >= 18
- **开发语言**: TypeScript (ESM 模块)
- **构建工具**: tsup (基于 esbuild)

---

## 2. 目录结构

```
okx-trade-mcp/
├── packages/
│   ├── core/                        # @agent-tradekit/core — 共享库（私有）
│   │   └── src/
│   │       ├── client/
│   │       │   ├── rest-client.ts   # HTTP 客户端：签名、请求、响应解析
│   │       │   └── types.ts         # 请求/响应 TypeScript 类型定义
│   │       ├── utils/
│   │       │   ├── signature.ts     # ISO 时间戳 + HMAC-SHA256 签名
│   │       │   ├── rate-limiter.ts  # 令牌桶限流器
│   │       │   ├── errors.ts        # 错误类层级 + toToolErrorPayload
│   │       │   └── update-check.ts  # npm 更新通知（stderr，带缓存）
│   │       ├── tools/
│   │       │   ├── types.ts         # ToolSpec 接口 + toMcpTool 转换
│   │       │   ├── helpers.ts       # 参数读取/校验工具函数
│   │       │   ├── common.ts        # 限流配置工厂 + 常量
│   │       │   ├── market.ts        # market 模块（公共端点）
│   │       │   ├── spot-trade.ts    # spot 模块（现货交易）
│   │       │   ├── swap-trade.ts    # swap 模块（永续/交割合约）
│   │       │   ├── account.ts       # account 模块（余额、划转）
│   │       │   └── index.ts         # buildTools()：模块 + 只读过滤
│   │       ├── config/              # 配置加载（环境变量 + CLI 参数）
│   │       ├── config.ts
│   │       ├── constants.ts         # 模块 ID、API 基础 URL、版本号
│   │       └── index.ts             # 公共导出
│   ├── mcp/                         # okx-trade-mcp
│   │   └── src/
│   │       ├── server.ts            # MCP Server：ListTools/CallTool 处理器
│   │       └── index.ts             # CLI 入口：解析参数 → 加载配置 → 启动服务器
│   └── cli/                         # okx-trade-cli
│       └── src/
│           └── index.ts             # CLI 入口
├── test/
│   ├── smoke.sh                     # 集成冒烟测试（需要凭证）
│   └── mcp-e2e.mjs                  # MCP 端到端测试（需要凭证）
├── package.json                     # 工作区根目录
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## 3. 分层架构

```
┌─────────────────────────────────────────────────────┐
│               MCP Host Process                        │
│      (Claude Desktop / Claude Code / SDK)             │
└──────────────────────┬──────────────────────────────┘
                       │ stdio JSON-RPC
┌──────────────────────▼──────────────────────────────┐
│               index.ts (CLI 入口)                     │
│   parseArgs → loadConfig → createServer → connect    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│               server.ts (MCP Server)                  │
│   ListToolsHandler  │  CallToolHandler                │
│   buildCapabilitySnapshot  │  errorResult / successResult │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           tools/ (工具注册层)                          │
│   buildTools(config) → ToolSpec[]                     │
│   market / spot-trade / swap-trade / account          │
└──────────────────────┬──────────────────────────────┘
                       │ context.client.*
┌──────────────────────▼──────────────────────────────┐
│           client/rest-client.ts (HTTP 层)             │
│   publicGet / privateGet / privatePost                │
│   → sign → fetch → parse → error handling            │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│               OKX REST API v5                         │
│             https://www.okx.com                       │
└─────────────────────────────────────────────────────┘
```

---

## 4. 核心模块

### 4.1 签名 (`utils/signature.ts`)

OKX 使用 **ISO 8601 时间戳** + **HMAC-SHA256** 签名方式。签名载荷的构造方式为：

```
payload = timestamp + METHOD + requestPath + body
```

- `timestamp`：ISO 格式，例如 `"2024-01-01T00:00:00.000Z"`
- `METHOD`：大写，例如 `"GET"` / `"POST"`
- `requestPath`：包含查询字符串，例如 `/api/v5/market/ticker?instId=BTC-USDT`
- `body`：POST 请求使用 JSON 字符串；GET 请求为空字符串

需要的请求头：`OK-ACCESS-KEY`、`OK-ACCESS-SIGN`、`OK-ACCESS-PASSPHRASE`、`OK-ACCESS-TIMESTAMP`。模拟交易还需要额外添加 `x-simulated-trading: 1` 请求头。

详见 `packages/core/src/utils/signature.ts` 中的实现。

### 4.2 REST 客户端 (`client/rest-client.ts`)

三个公共方法：

| 方法 | 鉴权 | 用途 |
|------|------|------|
| `publicGet(path, query, rateLimit)` | 无 | 公共行情端点 |
| `privateGet(path, query, rateLimit)` | 是 | 私有只读端点 |
| `privatePost(path, body, rateLimit)` | 是 | 私有写入端点 |

**错误处理流程：**

```
网络错误 (fetch 抛出异常) → NetworkError
HTTP 非 200 状态码       → OkxApiError (code = HTTP 状态码)
JSON 解析失败            → NetworkError
code !== "0"            → OkxApiError / AuthenticationError
code === "0"            → 返回 RequestResult<TData>
```

详见 `packages/core/src/client/rest-client.ts` 中的实现。

### 4.3 限流器 (`utils/rate-limiter.ts`)

基于令牌桶算法的客户端限流机制：

- 每个 `key` 拥有独立的令牌桶
- `capacity`：最大突发令牌数
- `refillPerSecond`：稳态令牌补充速率
- `maxWaitMs`：超时前最大等待时间，超出则抛出 `RateLimitError`（默认 30 秒）
- 调用方透明阻塞 — 自动休眠 + 重试

详见 `packages/core/src/utils/rate-limiter.ts` 和 `packages/core/src/tools/common.ts` 中的限流配置工厂。

### 4.4 工具注册表 (`tools/`)

每个模块导出一个 `register*Tools(): ToolSpec[]` 函数。`ToolSpec` 接口定义了：工具名称、所属模块 ID（用于过滤）、描述（供 AI 理解）、JSON Schema 输入参数、写操作标志 (`isWrite`)，以及异步处理函数。

详见 `packages/core/src/tools/types.ts` 中的 `ToolSpec` 接口定义。

`buildTools(config)` 在启动时执行两轮过滤：
1. **模块过滤**：仅加载 `config.modules` 中列出的模块
2. **只读过滤**：如果 `config.readOnly=true`，移除所有 `isWrite=true` 的工具

### 4.5 MCP Server (`server.ts`)

注册两个处理器：

**ListToolsHandler**：返回当前工具列表以及 `system_get_capabilities` 元工具。

**CallToolHandler**：
1. 特殊处理 `system_get_capabilities` → 返回能力快照
2. 在 `toolMap` 中查找工具
3. 调用 `tool.handler(args, { config, client })`
4. 成功时返回 `successResult`；异常时返回 `errorResult`

每个响应都包含 `CapabilitySnapshot`，使 AI 代理始终了解哪些模块处于活跃状态、是否启用了写操作、以及是否处于模拟交易模式。

详见 `packages/mcp/src/server.ts` 中的实现。

---

## 5. 模块与工具清单

### market 模块（公共 — 无需凭证）

| 工具 | API 端点 | 描述 |
|------|---------|------|
| `market_get_ticker` | `GET /api/v5/market/ticker` | 单个产品行情 |
| `market_get_tickers` | `GET /api/v5/market/tickers` | 按类型批量获取行情 |
| `market_get_orderbook` | `GET /api/v5/market/books` | 深度数据（买卖盘） |
| `market_get_candles` | `GET /api/v5/market/candles` | K 线数据 (OHLCV) |

### spot 模块（需要凭证）

| 工具 | API 端点 | 写操作 |
|------|---------|--------|
| `spot_place_order` | `POST /api/v5/trade/order` | 是 |
| `spot_cancel_order` | `POST /api/v5/trade/cancel-order` | 是 |
| `spot_amend_order` | `POST /api/v5/trade/amend-order` | 是 |
| `spot_get_orders` | `GET /api/v5/trade/orders-pending` 或 `orders-history` | 否 |
| `spot_get_fills` | `GET /api/v5/trade/fills` | 否 |

### swap 模块（需要凭证）

| 工具 | API 端点 | 写操作 |
|------|---------|--------|
| `swap_place_order` | `POST /api/v5/trade/order` | 是 |
| `swap_cancel_order` | `POST /api/v5/trade/cancel-order` | 是 |
| `swap_get_orders` | `GET /api/v5/trade/orders-pending` 或 `orders-history` | 否 |
| `swap_get_positions` | `GET /api/v5/account/positions` | 否 |
| `swap_set_leverage` | `POST /api/v5/account/set-leverage` | 是 |
| `swap_get_fills` | `GET /api/v5/trade/fills` | 否 |
| `move_order_stop` | `POST /api/v5/trade/order-algo` | 是 |

### account 模块（需要凭证）

| 工具 | API 端点 | 写操作 |
|------|---------|--------|
| `account_get_balance` | `GET /api/v5/account/balance` | 否 |
| `account_transfer` | `POST /api/v5/asset/transfer` | 是 |

---

## 6. 配置系统

### 环境变量

| 变量 | 是否必需 | 默认值 | 描述 |
|------|----------|--------|------|
| `OKX_API_KEY` | 私有端点需要 | — | API Key |
| `OKX_SECRET_KEY` | 私有端点需要 | — | Secret Key |
| `OKX_PASSPHRASE` | 私有端点需要 | — | Passphrase |
| `OKX_API_BASE_URL` | 否 | `https://www.okx.com` | API 基础 URL |
| `OKX_TIMEOUT_MS` | 否 | `15000` | 请求超时时间（毫秒） |

> `market` 模块使用公共端点，无需凭证。
> 三个密钥必须同时提供或全部不提供；部分配置会抛出 `ConfigError`。

### TOML 配置文件 (`~/.okx/config.toml`)

凭证按命名 profile 组织。每个 profile 包含 `api_key`、`secret_key`、`passphrase`，以及可选的 `demo` 标志。顶层的 `default_profile` 键用于选择默认使用哪个 profile。

详见 `packages/core/src/config/` 中的配置加载实现。

### CLI 参数

MCP 服务器二进制文件接受以下参数：`--modules <list>`（逗号分隔的模块名称或 "all"，默认：spot,swap,account）、`--read-only`（禁用所有写操作）、`--demo`（启用模拟交易）、`--help` 和 `--version`。

详见 `packages/mcp/src/index.ts` 中的 CLI 参数解析。

---

## 7. 错误处理

所有错误继承自 `OkxMcpError`，并通过 `toToolErrorPayload()` 序列化后返回给 MCP 宿主：

```
OkxMcpError
├── ConfigError          # 配置缺失或格式错误
├── ValidationError      # 工具参数校验失败
├── AuthenticationError  # API 密钥/签名鉴权失败（OKX 错误码 50111-50113）
├── RateLimitError       # 客户端限流超出
├── OkxApiError          # OKX 返回 code !== "0"
└── NetworkError         # 网络故障、超时或非 JSON 响应
```

失败的工具调用响应包含：工具名称、错误标志、错误类型、OKX 错误码、可读错误消息、失败的端点，以及时间戳。

详见 `packages/core/src/utils/errors.ts` 中的错误类层级和序列化逻辑。

---

## 8. Claude Desktop 配置

编辑 `~/Library/Application\ Support/Claude/claude_desktop_config.json`（macOS）以注册 MCP 服务器。

凭证从 `~/.okx/config.toml` 读取 — 配置文件中只需指定 profile 名称。典型的配置场景包括：

- **实盘交易**：使用 `--profile live --modules all`
- **模拟交易**：使用 `--profile demo --modules all`
- **只读行情数据**（无需凭证）：使用 `--modules market --read-only`

完整配置示例请参阅项目 README。

---

## 9. 与其他交易所的主要差异

| 方面 | Bitget (`agent_hub`) | OKX (`agent-tradekit`) |
|------|---------------------|-----------------|
| 鉴权请求头前缀 | `ACCESS-*` | `OK-ACCESS-*` |
| 时间戳格式 | 毫秒字符串 `"1699000000000"` | ISO 格式 `"2024-01-01T00:00:00.000Z"` |
| 签名载荷 | `ts + METHOD + path?query + body` | `ts + METHOD + requestPath + body` |
| 成功状态码 | `"00000"` | `"0"` |
| API 路径前缀 | `/api/v2/` | `/api/v5/` |
| 模拟交易 | 不支持 | `--demo` → `x-simulated-trading: 1` |
| 合约模块 | `futures`（行情 + 交易合并） | `swap`（SWAP + FUTURES 统一） |
| 行情模块 | 分散在 `spot` 和 `futures` 中 | 独立的 `market` 模块 |

---

## 10. 开发指南

安装依赖、类型检查、构建和运行测试，使用标准 pnpm 命令：`pnpm install`、`pnpm typecheck`、`pnpm build` 和 `pnpm test:unit`。开发时可通过 `node packages/mcp/dist/index.js` 直接运行服务器。

关于新增工具和模块的指南，请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。
