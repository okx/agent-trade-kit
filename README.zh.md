# OKX Trade MCP 工具集

[![CI](https://github.com/okx/agent-tradekit/actions/workflows/ci.yml/badge.svg)](https://github.com/okx/agent-tradekit/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/okx/agent-tradekit/branch/master/graph/badge.svg)](https://codecov.io/gh/okx/agent-tradekit)
[![npm: mcp](https://img.shields.io/npm/v/okx-trade-mcp?label=okx-trade-mcp)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm downloads: mcp](https://img.shields.io/npm/dm/okx-trade-mcp?label=mcp+downloads)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm: cli](https://img.shields.io/npm/v/okx-trade-cli?label=okx-trade-cli)](https://www.npmjs.com/package/okx-trade-cli)
[![npm downloads: cli](https://img.shields.io/npm/dm/okx-trade-cli?label=cli+downloads)](https://www.npmjs.com/package/okx-trade-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | [中文](README.zh.md)

OKX 工具集，包含两个独立包：

| 包 | 说明 |
|---|---|
| `okx-trade-mcp` | MCP Server，供 Claude / Cursor 等 AI 工具调用 |
| `okx-trade-cli` | 命令行工具，直接在终端操作 OKX |

---

## 这是什么？

OKX Trade MCP 通过 [Model Context Protocol](https://modelcontextprotocol.io) 将 AI 助手直接接入你的 OKX 账户。不用再在 AI 和交易所界面之间来回切换，直接描述你想做什么，AI 调用对应工具完成执行。

以**本地进程**方式运行，API Key 仅存储在你的机器上，数据不离开本地。

## 功能亮点

| | |
|---|---|
| **77 个工具，7 大模块** | 完整交易生命周期：行情 → 下单 → 算法单 → 账户管理 → 交易机器人 |
| **内置算法单** | 条件单、OCO 止盈止损、追踪止损 |
| **安全控制** | `--read-only` 只读模式、按模块过滤、内置限速器 |
| **零基础设施** | 本地 stdio 进程，无需服务器或数据库 |
| **MCP 标准** | 兼容 Claude Desktop、Cursor、openCxxW 及所有 MCP 客户端 |
| **开源** | MIT 协议，API Key 不离开本机 |

## 模块概览

| 模块 | 工具数 | 说明 | 文档 |
|------|--------|------|------|
| `market` | 12 | Ticker、盘口、K线（含历史）、指数行情、指数K线、涨跌停、资金费率、标记价格、持仓量 | [→](docs/modules/market.md) |
| `spot` | 13 | 下单/改单/撤单、批量操作、成交记录（含归档）、订单历史（含归档）、条件单、OCO | [→](docs/modules/spot.md) |
| `swap` | 17 | 永续合约交易、批量操作、持仓、杠杆、条件单、OCO、追踪止损 | [→](docs/modules/swap.md) |
| `futures` | 6 | 交割合约下单/撤单/改单、持仓、成交记录、订单历史 | [→](docs/modules/futures.md) |
| `option` | 10 | 期权交易：下单/撤单/改单/批量撤单、订单历史、持仓（含 Greeks）、成交记录、期权链、IV + Greeks | [→](docs/modules/option.md) |
| `account` | 14 | 余额、账单（含归档）、持仓、持仓历史、手续费率、配置、仓位模式、最大可提币量、最大可用仓位、操作审计日志 | [→](docs/modules/account.md) |
| `bot` | 5 | Trading Bot — 网格策略：列表/详情/子订单（只读），创建/停止（写）。支持现货网格、合约网格、Moon Grid | [→](docs/modules/bot.md) |

---

## 快速开始

**前置要求：** Node.js >= 18

```bash
# 1. 安装
npm install -g @okx_retail/okx-trade-mcp @okx_retail/okx-trade-cli

# 2. 将 MCP Server 注册到 AI 客户端
okx-trade-mcp setup --client claude-desktop   # 或：cursor / vscode / claude-code
```

然后配置 OKX API 凭证（与上面独立，仅需要鉴权接口时才必填）：

```bash
mkdir -p ~/.okx && vim ~/.okx/config.toml
```

填入 `~/.okx/config.toml`：

```toml
default_profile = "demo"

[profiles.demo]
site = "global"          # global | eea | us（默认：global）
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> 模拟盘 Key：OKX 官网 → 交易 → 模拟交易 → API 管理

**多站点用户：** OKX 运营多个区域站点——EEA 用户（`my.okx.com`）请设置 `site = "eea"`，美国用户（`app.okx.com`）请设置 `site = "us"`。详见 [配置说明 →](docs/configuration.md#站点配置)。

真实盘或多账户配置，见 [配置说明 →](docs/configuration.md)。

---

## okx-trade-mcp

```bash
# Claude Desktop
okx-trade-mcp setup --client claude-desktop

# Cursor
okx-trade-mcp setup --client cursor

# Claude Code CLI
okx-trade-mcp setup --client claude-code
```

[VS Code · Windsurf · openCxxW →](docs/configuration.md) — [启动场景说明 →](docs/configuration.md#startup-scenarios)（纯行情、只读、仅现货等）

---

## okx-trade-cli

```bash
okx market ticker BTC-USDT
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx account balance
```

**[完整 CLI 命令参考 →](docs/cli-reference.md)**

---

## 报错反馈

如果工具调用或命令失败，提 Issue 时请贴出完整报错内容。

**MCP** — 复制 AI 客户端展示的结构化错误块：

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
  "serverVersion": "1.0.4"
}
```

**CLI** — 贴出完整的 stderr 输出：

```
Error: Order quantity invalid
TraceId: abc123def456
Hint: Check order size against instrument minSz.
Version: okx-trade-cli@1.0.4
```

常见问题见 **[FAQ →](docs/faq.md)**。

---

## 从源码构建

```bash
git clone https://github.com/okx/agent-tradekit.git && cd okx-trade-mcp
pnpm install && pnpm build
```

```
packages/
├── core/    # 共享 OKX client、tools、工具函数
├── mcp/     # MCP Server
└── cli/     # CLI 工具
```
