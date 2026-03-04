# OKX Trade MCP Tools

[![npm](https://img.shields.io/npm/v/okx-trade-mcp)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm](https://img.shields.io/npm/v/okx-trade-cli)](https://www.npmjs.com/package/okx-trade-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

OKX toolkit with two standalone packages:

| Package | Description |
|---|---|
| `okx-trade-mcp` | MCP server for Claude / Cursor and any MCP-compatible AI client |
| `okx-trade-cli` | CLI for operating OKX from terminal |

---

## What is this?

OKX Trade MCP connects AI assistants directly to your OKX account via the [Model Context Protocol](https://modelcontextprotocol.io). Instead of switching between your AI and the exchange UI, you describe what you want — the AI calls the right tools and executes it.

It runs as a **local process** with your API keys stored only on your machine. No cloud services, no data leaving your device.

## Features

| | |
|---|---|
| **57 tools across 6 modules** | Full trading lifecycle: market data → orders → algo orders → account management → trading bots |
| **Algo orders built-in** | Conditional, OCO take-profit/stop-loss, trailing stop |
| **Safety controls** | `--read-only` flag, per-module filtering, built-in rate limiter |
| **Zero infrastructure** | Local stdio process, no server or database required |
| **MCP standard** | Works with Claude Desktop, Cursor, openCxxW, and any MCP-compatible client |
| **Open source** | MIT license, API keys never leave your machine |

## Modules

| Module | Tools | Description |
|--------|-------|-------------|
| `market` | 12 | Ticker, orderbook, candles (+history), index ticker, index candles, price limit, funding rate, mark price, open interest |
| `spot` | 11 | Place/cancel/amend orders, batch orders, fills (+archive), order history (+archive), conditional orders, OCO |
| `swap` | 11 | Perpetual trading, batch orders, trailing stop, positions, leverage |
| `algo` | 4 | Conditional, OCO, trailing stop (SWAP) |
| `account` | 14 | Balance, bills (+archive), positions, positions history, fee rates, config, position mode, max withdrawal, max avail size, audit log |
| `bot` | 5 | Trading Bot — grid strategies: list/details/sub-orders (read), create/stop (write). Spot Grid, Contract Grid, Moon Grid |

---

## Quick Start

**Prerequisites:** Node.js >= 18

```bash
# 1. Install packages
npm install -g okx-trade-mcp okx-trade-cli

# 2. Configure API credentials
mkdir -p ~/.okx && vim ~/.okx/config.toml
```

Fill live and demo keys in `~/.okx/config.toml`:

```toml
default_profile = "demo"

[profiles.live]
api_key = "your-live-api-key"
secret_key = "your-live-secret-key"
passphrase = "your-live-passphrase"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> Live key: OKX website → Profile → API → Create API Key
> Demo key: OKX website → Trading → Demo Trading → API Management

Choose your usage:

- **AI integrations (Claude / Cursor)** → See [okx-trade-mcp](#okx-trade-mcp)
- **CLI usage** → See [okx-trade-cli](#okx-trade-cli)

---

## okx-trade-mcp

### Config

Credentials are read from `~/.okx/config.toml`; only the profile name is needed in the client config.

<details>
<summary>Claude Desktop</summary>

Config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "okx-LIVE-real-money": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    },
    "okx-DEMO-simulated-trading": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

Restart Claude Desktop after updating the config.

</details>

<details>
<summary>Cursor</summary>

Config file: `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-level)

```json
{
  "mcpServers": {
    "okx-trade": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    }
  }
}
```

</details>

<details>
<summary>Claude Code CLI</summary>

Run in terminal:

```bash
claude mcp add --transport stdio okx-trade-mcp -- okx-trade-mcp --profile live --modules all
```

Or create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "type": "stdio",
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    }
  }
}
```

</details>

<details>
<summary>VS Code</summary>

Create `.mcp.json` in your project root (or `~/.claude.json` for global scope):

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "type": "stdio",
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    }
  }
}
```

</details>

<details>
<summary>Windsurf</summary>

Config file:
- macOS/Linux: `~/.codeium/windsurf/mcp_config.json`
- Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json`

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    }
  }
}
```

</details>

<details>
<summary>openCxxW</summary>

Config file: `openCxxW.json`

```json
{
  "mcpServers": {
    "okx-LIVE-real-money": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    },
    "okx-DEMO-simulated-trading": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

</details>

### Startup Options

```bash
okx-trade-mcp --profile live         # specify profile
okx-trade-mcp --modules market       # market only (no key)
okx-trade-mcp --read-only            # read-only, no trades
okx-trade-mcp --modules all          # all modules
```

---

## okx-trade-cli

### Commands

#### Market data (no API key required)

```bash
okx market ticker BTC-USDT
okx market tickers SPOT
okx market orderbook BTC-USDT --sz 5
okx market candles BTC-USDT --bar 1H --limit 10
okx market instruments --instType SWAP
okx market funding-rate BTC-USDT-SWAP
okx market funding-rate BTC-USDT-SWAP --history --limit 10
okx market mark-price --instType SWAP --instId BTC-USDT-SWAP
okx market trades BTC-USDT --limit 20
okx market index-ticker --instId BTC-USD
okx market price-limit BTC-USDT-SWAP
okx market open-interest --instType SWAP
```

Supported candle intervals: `1m` `3m` `5m` `15m` `30m` `1H` `2H` `4H` `6H` `12H` `1D` `1W` `1M`

#### Account

```bash
okx account balance
okx account balance BTC,ETH
okx account asset-balance              # funding account balance
okx account positions
okx account bills
okx account bills --archive            # bills older than 7 days
okx account fees --instType SPOT
okx account config
okx account max-size --instId BTC-USDT-SWAP --tdMode cross
okx account max-withdrawal
okx account positions-history
okx account set-position-mode --posMode net_mode
```

#### Spot Trading

```bash
okx spot orders
okx spot orders --instId BTC-USDT --history
okx spot get --instId BTC-USDT --ordId 123456
okx spot fills --instId BTC-USDT
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx spot place --instId BTC-USDT --side sell --ordType limit --sz 0.001 --px 70000
okx spot amend --instId BTC-USDT --ordId 123456 --newPx 68000
okx spot cancel BTC-USDT --ordId 123456
```

#### Swap Trading

```bash
okx swap positions
okx swap orders --history
okx swap get --instId BTC-USDT-SWAP --ordId 123456
okx swap fills --instId BTC-USDT-SWAP
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross
okx swap cancel BTC-USDT-SWAP --ordId 123456
okx swap close --instId BTC-USDT-SWAP --mgnMode cross
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
okx swap get-leverage --instId BTC-USDT-SWAP --mgnMode cross
```

#### Futures Trading

```bash
okx futures orders
okx futures orders --history
okx futures positions
okx futures fills
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross
okx futures cancel BTC-USDT-250328 --ordId 123456
okx futures get --instId BTC-USDT-250328 --ordId 123456
```

#### Grid Bot Trading

```bash
# List running grid bots
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history

# Create a spot grid bot (invest 100 USDT, 10 grids, price range 80000–100000)
okx --demo bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100

# View bot details and filled sub-orders
okx bot grid details --algoOrdType grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType grid --algoId <algoId>

# Stop a bot
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT
```

#### Config

```bash
okx config show
okx config set default_profile live
```

### Global Options

| Option | Description |
|---|---|
| `--profile <name>` | choose profile |
| `--demo` | use simulated trading (demo) mode |
| `--json` | raw JSON output |
| `--help` | show help |

```bash
# Use with jq
okx account balance --json | jq '.[] | {ccy: .ccy, eq: .eq}'
```

---

## Reporting Issues

If a tool call or CLI command fails and you can't resolve it from the error message, please open an issue and include the full error output — it contains everything needed to diagnose the problem.

**MCP** — the AI client shows a structured error block. Copy it in full:

```json
{
  "tool": "swap_place_order",
  "error": true,
  "type": "OkxApiError",
  "code": "51020",
  "message": "Order quantity invalid",
  "endpoint": "POST /api/v5/trade/order",
  "traceId": "abc123def456",
  "timestamp": "2026-03-03T10:00:00.000Z",
  "serverVersion": "1.0.2"
}
```

**CLI** — paste the full stderr output:

```
Error: Order quantity invalid
TraceId: abc123def456
Hint: Check order size against instrument minSz.
Version: okx-trade-cli@1.0.2
```

`traceId` (when present) lets OKX support trace the server-side request. `serverVersion` / `Version` tells us which release you're on. Both fields appear automatically — no extra steps needed.

---

## Build from Source

```bash
git clone https://github.com/USER/REPO.git && cd okx-hub
pnpm install && pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

### Project Structure

```
packages/
├── core/    # shared client & tools
├── mcp/     # MCP Server
└── cli/     # CLI tool
```

---

---

# OKX Trade MCP 工具集

[![npm](https://img.shields.io/npm/v/okx-trade-mcp)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm](https://img.shields.io/npm/v/okx-trade-cli)](https://www.npmjs.com/package/okx-trade-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

OKX 工具集，包含两个独立包：

| 包 | 说明 |
|---|---|
| `okx-trade-mcp` | MCP Server，供 Claude / Cursor 等 AI 工具调用 |
| `okx-trade-cli` | 命令行工具，直接在终端操作 OKX |

---

## 这是什么？

OKX Trade MCP 通过 [Model Context Protocol](https://modelcontextprotocol.io) 将 AI 助手直接接入你的 OKX 账户。不用再在 AI 和交易所界面之间来回切换，直接描述你想做什么，AI 调用对应工具完成执行。

以**本地进程**方式运行，API Key 仅存储在你的机器上，无云服务，数据不离开本地。

## 功能亮点

| | |
|---|---|
| **57 个工具，6 大模块** | 完整交易生命周期：行情 → 下单 → 算法单 → 账户管理 → 交易机器人 |
| **内置算法单** | 条件单、OCO 止盈止损、追踪止损 |
| **安全控制** | `--read-only` 只读模式、按模块过滤、内置限速器 |
| **零基础设施** | 本地 stdio 进程，无需服务器或数据库 |
| **MCP 标准** | 兼容 Claude Desktop、Cursor、openCxxW 及所有 MCP 客户端 |
| **开源** | MIT 协议，API Key 不离开本机 |

## 模块概览

| 模块 | 工具数 | 说明 |
|------|--------|------|
| `market` | 12 | Ticker、盘口、K线（含历史）、指数行情、指数K线、涨跌停、资金费率、标记价格、持仓量 |
| `spot` | 11 | 下单/改单/撤单、批量操作、成交记录（含归档）、订单历史（含归档）、条件单、OCO |
| `swap` | 11 | 合约交易、批量操作、追踪止损、持仓、杠杆 |
| `algo` | 4 | 条件单、OCO、追踪止损（SWAP） |
| `account` | 14 | 余额、账单（含归档）、持仓、持仓历史、手续费率、配置、仓位模式、最大可提币量、最大可用仓位、操作审计日志 |
| `bot` | 5 | Trading Bot — 网格策略：列表/详情/子订单（只读），创建/停止（写）。支持现货网格、合约网格、Moon Grid |

---

## 快速开始

**前置要求：** Node.js >= 18

```bash
# 1. 安装
npm install -g okx-trade-mcp okx-trade-cli

# 2. 配置 API 凭证
mkdir -p ~/.okx && vim ~/.okx/config.toml
```

`~/.okx/config.toml` 填入真实盘和模拟盘的 Key：

```toml
default_profile = "demo"

[profiles.live]
api_key = "your-live-api-key"
secret_key = "your-live-secret-key"
passphrase = "your-live-passphrase"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> 真实盘 Key：OKX 官网 → 个人中心 → API → 创建 API Key
> 模拟盘 Key：OKX 官网 → 交易 → 模拟交易 → API 管理

按使用场景选择：

- **AI 工具集成（Claude / Cursor）** → 看 [okx-trade-mcp](#okx-trade-mcp-1)
- **终端命令行** → 看 [okx-trade-cli](#okx-trade-cli-1)

---

## okx-trade-mcp

### 配置

凭证从 `~/.okx/config.toml` 读取，客户端配置中只需指定 profile 名称。

<details>
<summary>Claude Desktop</summary>

配置文件路径：
- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "okx-LIVE-real-money": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    },
    "okx-DEMO-simulated-trading": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

修改配置后重启 Claude Desktop 生效。

</details>

<details>
<summary>Cursor</summary>

配置文件：`~/.cursor/mcp.json`（全局）或 `.cursor/mcp.json`（项目级）

```json
{
  "mcpServers": {
    "okx-trade": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    }
  }
}
```

</details>

<details>
<summary>Claude Code CLI</summary>


在终端执行：

```bash
claude mcp add --transport stdio okx-trade-mcp -- okx-trade-mcp --profile live --modules all
```

或在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "type": "stdio",
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    }
  }
}
```

</details>

<details>
<summary>VS Code</summary>

在项目根目录创建 `.mcp.json`（或 `~/.claude.json` 全局生效）：

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "type": "stdio",
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    }
  }
}
```

</details>

<details>
<summary>Windsurf</summary>

配置文件：
- macOS/Linux：`~/.codeium/windsurf/mcp_config.json`
- Windows：`%USERPROFILE%\.codeium\windsurf\mcp_config.json`

```json
{
  "mcpServers": {
    "okx-trade-mcp": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    }
  }
}
```

</details>

<details>
<summary>openCxxW</summary>

配置文件：`openCxxW.json`

```json
{
  "mcpServers": {
    "okx-LIVE-real-money": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "live", "--modules", "all"]
    },
    "okx-DEMO-simulated-trading": {
      "command": "okx-trade-mcp",
      "args": ["--profile", "demo", "--modules", "all"]
    }
  }
}
```

</details>

### 启动选项

```bash
okx-trade-mcp --profile live         # 指定 profile
okx-trade-mcp --modules market       # 只加载行情（无需 Key）
okx-trade-mcp --read-only            # 只读模式，禁止下单
okx-trade-mcp --modules all          # 加载所有模块
```

---

## okx-trade-cli

### 命令

#### 市场行情（无需 API Key）

```bash
okx market ticker BTC-USDT
okx market tickers SPOT
okx market orderbook BTC-USDT --sz 5
okx market candles BTC-USDT --bar 1H --limit 10
okx market instruments --instType SWAP
okx market funding-rate BTC-USDT-SWAP
okx market funding-rate BTC-USDT-SWAP --history --limit 10
okx market mark-price --instType SWAP --instId BTC-USDT-SWAP
okx market trades BTC-USDT --limit 20
okx market index-ticker --instId BTC-USD
okx market price-limit BTC-USDT-SWAP
okx market open-interest --instType SWAP
```

支持的 K 线周期：`1m` `3m` `5m` `15m` `30m` `1H` `2H` `4H` `6H` `12H` `1D` `1W` `1M`

#### 账户

```bash
okx account balance
okx account balance BTC,ETH
okx account asset-balance              # 资金账户余额
okx account positions
okx account bills
okx account bills --archive            # 7 天前的账单（最长 3 个月）
okx account fees --instType SPOT
okx account config
okx account max-size --instId BTC-USDT-SWAP --tdMode cross
okx account max-withdrawal
okx account positions-history
okx account set-position-mode --posMode net_mode
```

#### 现货交易

```bash
okx spot orders
okx spot orders --instId BTC-USDT --history
okx spot get --instId BTC-USDT --ordId 123456
okx spot fills --instId BTC-USDT
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx spot place --instId BTC-USDT --side sell --ordType limit --sz 0.001 --px 70000
okx spot amend --instId BTC-USDT --ordId 123456 --newPx 68000
okx spot cancel BTC-USDT --ordId 123456
```

#### 永续合约

```bash
okx swap positions
okx swap orders --history
okx swap get --instId BTC-USDT-SWAP --ordId 123456
okx swap fills --instId BTC-USDT-SWAP
okx swap place --instId BTC-USDT-SWAP --side buy --ordType market --sz 1 --posSide long --tdMode cross
okx swap cancel BTC-USDT-SWAP --ordId 123456
okx swap close --instId BTC-USDT-SWAP --mgnMode cross
okx swap leverage --instId BTC-USDT-SWAP --lever 10 --mgnMode cross
okx swap get-leverage --instId BTC-USDT-SWAP --mgnMode cross
```

#### 交割合约

```bash
okx futures orders
okx futures orders --history
okx futures positions
okx futures fills
okx futures place --instId BTC-USDT-250328 --side buy --ordType market --sz 1 --tdMode cross
okx futures cancel BTC-USDT-250328 --ordId 123456
okx futures get --instId BTC-USDT-250328 --ordId 123456
```

#### 网格机器人

```bash
# 查看运行中的网格 bot
okx bot grid orders --algoOrdType grid
okx bot grid orders --algoOrdType grid --history

# 创建现货网格 bot（投入 100 USDT，10 格，价格区间 80000–100000，模拟盘）
okx --demo bot grid create --instId BTC-USDT --algoOrdType grid \
  --maxPx 100000 --minPx 80000 --gridNum 10 --quoteSz 100

# 查看 bot 详情和成交子订单
okx bot grid details --algoOrdType grid --algoId <algoId>
okx bot grid sub-orders --algoOrdType grid --algoId <algoId>

# 停止 bot
okx bot grid stop --algoId <algoId> --algoOrdType grid --instId BTC-USDT
```

#### 配置管理

```bash
okx config show
okx config set default_profile live
```

### 全局选项

| 选项 | 说明 |
|---|---|
| `--profile <name>` | 指定 profile |
| `--demo` | 使用模拟盘（simulated trading）模式 |
| `--json` | 输出原始 JSON（适合脚本/管道处理） |
| `--help` | 显示帮助 |

```bash
# 结合 jq 使用
okx account balance --json | jq '.[] | {ccy: .ccy, eq: .eq}'
```

---

## 报错反馈

如果工具调用或 CLI 命令失败，且错误信息不足以自行排查，欢迎提 Issue，请将完整报错内容一并贴出——它包含了定位问题所需的全部信息。

**MCP** — AI 客户端会展示结构化错误块，完整复制即可：

```json
{
  "tool": "swap_place_order",
  "error": true,
  "type": "OkxApiError",
  "code": "51020",
  "message": "Order quantity invalid",
  "endpoint": "POST /api/v5/trade/order",
  "traceId": "abc123def456",
  "timestamp": "2026-03-03T10:00:00.000Z",
  "serverVersion": "1.0.2"
}
```

**CLI** — 贴出完整的 stderr 输出：

```
Error: Order quantity invalid
TraceId: abc123def456
Hint: Check order size against instrument minSz.
Version: okx-trade-cli@1.0.2
```

`traceId`（如有）可用于联系 OKX 支持在服务端定位请求；`serverVersion` / `Version` 告诉我们你当前跑的版本。两个字段均自动生成，无需额外操作。

---

## 从源码构建

```bash
git clone https://github.com/USER/REPO.git && cd okx-hub
pnpm install && pnpm build
```

详细开发指引见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 项目结构

```
packages/
├── core/    # 共享 OKX client、tools、工具函数
├── mcp/     # MCP Server
└── cli/     # CLI 工具
```
