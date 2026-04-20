# OKX Agent Trade Kit

[![CI](https://github.com/okx/agent-tradekit/actions/workflows/ci.yml/badge.svg)](https://github.com/okx/agent-tradekit/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/okx/agent-tradekit/branch/master/graph/badge.svg)](https://codecov.io/gh/okx/agent-tradekit)
[![npm: mcp](https://img.shields.io/npm/v/okx-trade-mcp?label=okx-trade-mcp)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm downloads: mcp](https://img.shields.io/npm/dt/okx-trade-mcp?label=mcp+total+downloads)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm: cli](https://img.shields.io/npm/v/okx-trade-cli?label=okx-trade-cli)](https://www.npmjs.com/package/okx-trade-cli)
[![npm downloads: cli](https://img.shields.io/npm/dt/okx-trade-cli?label=cli+total+downloads)](https://www.npmjs.com/package/okx-trade-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | [中文](README.zh-CN.md)

OKX Agent Trade Kit — AI 驱动的交易工具集，包含两个独立包：

| 包 | 说明 |
|---|---|
| `okx-trade-mcp` | MCP Server，供 Claude / Cursor 等 AI 工具调用 |
| `okx-trade-cli` | 命令行工具，直接在终端操作 OKX |

---

## 这是什么？

OKX Agent Trade Kit 通过 [Model Context Protocol](https://modelcontextprotocol.io) 将 AI 助手直接接入你的 OKX 账户。不用再在 AI 和交易所界面之间来回切换，直接描述你想做什么，AI 调用对应工具完成执行。

以**本地进程**方式运行，API Key 仅存储在你的机器上，数据不离开本地。

## 功能亮点

| 特性 | 说明 |
|------|------|
| **140 个工具，10 大模块** | 完整交易生命周期：行情 → 下单 → 算法单 → 账户管理 → 赚币 → 交易机器人 → 事件合约 → 资讯 |
| **内置算法单** | 条件单、OCO 止盈止损、追踪止损 |
| **安全控制** | `--read-only` 只读模式、按模块过滤、内置限速器 |
| **零基础设施** | 本地 stdio 进程，无需服务器或数据库 |
| **MCP 标准** | 兼容 Claude Desktop、Cursor、openCxxW 及所有 MCP 客户端 |
| **内置 Agent Skills** | 预置 AI agent skill 文件，覆盖行情、交易、账户、机器人、赚币，即插即用 |
| **开源** | MIT 协议，API Key 不离开本机 |

## 模块概览

| 模块 | 工具数 | 说明 | 文档 |
|------|--------|------|------|
| `market` | 19 | Ticker、盘口、K线（含历史）、指数行情、指数K线、涨跌停、资金费率、标记价格、持仓量、股票代币、**技术指标**（70+ 指标）、**指标列表**、**行情筛选**（按价格/涨跌幅/市值/成交量/资金费率/持仓量筛选）、**持仓量历史**、**持仓量变化筛选** | [→](docs/modules/market.md) |
| `spot` | 13 | 下单/改单/撤单、批量操作、成交记录（含归档）、订单历史（含归档）、条件单、OCO | [→](docs/modules/spot.md) |
| `swap` | 17 | 永续合约交易、批量操作、持仓、杠杆、条件单、OCO、追踪止损 | [→](docs/modules/swap.md) |
| `futures` | 18 | 交割合约下单/撤单/改单、持仓、成交记录、订单历史、平仓、杠杆设置、批量订单、算法单（止盈止损、OCO、追踪止损） | [→](docs/modules/futures.md) |
| `option` | 10 | 期权交易：下单/撤单/改单/批量撤单、订单历史、持仓（含 Greeks）、成交记录、期权链、IV + Greeks | [→](docs/modules/option.md) |
| `account` | 14 | 余额、账单（含归档）、持仓、持仓历史、手续费率、配置、仓位模式、最大可提币量、最大可用仓位、操作审计日志 | [→](docs/modules/account.md) |
| `event` | 9 | 事件合约交易：浏览、系列/事件/市场查询（查询）；下单、改单、撤单、订单、成交记录（私有）。语义化 outcome：UP/YES/DOWN/NO | [→](docs/modules/event.md) |
| `earn` | 23 | 简单赚币：余额、申购、赎回、出借利率管理、**定期赚币** (10)。链上质押/DeFi (6)。双币赢/Dual Currency Deposit (6)。**闪赚** (1)。子模块：`earn.savings`、`earn.onchain`、`earn.dcd`、`earn.flash`。包含在 `all` 中。 | [→](docs/modules/earn.md) |
| `bot` | 10 | 交易机器人：网格 (5)、DCA — 现货 & 合约 (5)。子模块：`bot.grid`、`bot.dca` | [→](docs/modules/bot.md) |
| `news` | 7 | 加密资讯：最新新闻、按币种查询、全文搜索、文章详情、来源列表、币种情绪（快照 + 趋势） | [→](docs/modules/news.md) |

---

## 快速开始

**前置要求：** Node.js >= 18

```bash
# 1. 安装
npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli

# 2. 配置 OKX API 凭证（交互式向导）
okx config init --lang zh

# 3. 将 MCP Server 注册到 AI 客户端
okx-trade-mcp setup --client claude-desktop
okx-trade-mcp setup --client cursor
okx-trade-mcp setup --client claude-code
okx-trade-mcp setup --client vscode          # 在当前目录写入 .mcp.json
```

> **也可使用** [一键安装脚本](docs/configuration.md#one-line-install) — 自动检查 Node.js、安装包、检测并配置 MCP 客户端。
>
> 实盘交易、多账户或其他客户端，见 [配置说明 →](docs/configuration.md)。

---

## okx-trade-mcp

```bash
okx-trade-mcp                                        # 默认：现货、合约、账户
okx-trade-mcp --modules market                       # 纯行情，无需 API Key
okx-trade-mcp --modules spot,account                 # 现货 + 账户
okx-trade-mcp --profile live --modules all           # 所有模块（含赚币）
okx-trade-mcp --read-only                            # 只读，禁止下单等写操作
```

[启动场景说明 →](docs/configuration.md#startup-scenarios) — [VS Code · Windsurf →](docs/configuration.md)

---

## okx-trade-cli

```bash
okx market ticker BTC-USDT
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx account balance
```

**[完整 CLI 命令参考 →](docs/cli-reference.md)**

---

## Agent Skills

[`skills/`](skills/) 目录内置了供 AI agent 框架使用的 skill 文件。每个 skill 定义了 agent 的激活时机和 `okx` CLI 的使用方式。

| Skill | 说明 | 需要鉴权 |
|-------|------|:--------:|
| [`okx-cex-market`](skills/okx-cex-market/SKILL.md) | 行情数据：价格、K线、盘口、资金费率、技术指标 | 否 |
| [`okx-cex-trade`](skills/okx-cex-trade/SKILL.md) | 订单管理：现货、永续合约、交割合约、期权、算法单 | 是 |
| [`okx-cex-portfolio`](skills/okx-cex-portfolio/SKILL.md) | 账户：余额、持仓、盈亏、资金划转 | 是 |
| [`okx-cex-bot`](skills/okx-cex-bot/SKILL.md) | 交易机器人：网格、DCA（现货 & 合约） | 是 |
| [`okx-cex-earn`](skills/okx-cex-earn/SKILL.md) | 赚币：简单赚币、链上质押、双币赢、自动赚币 | 是 |

**[Skills 说明文档 →](skills/README.zh-CN.md)**

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

---

## 文档导航

| 文档 | 说明 |
|------|------|
| [架构](ARCHITECTURE.zh-CN.md) | 系统设计与模块概览 |
| [贡献指南](CONTRIBUTING.zh-CN.md) | 开发环境搭建与 PR 规范 |
| [更新日志](CHANGELOG.zh-CN.md) | 版本历史 |
| [Agent Skills](skills/README.zh-CN.md) | AI agent 框架预置 skill 文件 |
| [安全政策](SECURITY.md) | 漏洞上报 |
