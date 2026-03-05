# OKX Trade MCP Tools

[![CI](https://github.com/okx/agent-tradekit/actions/workflows/ci.yml/badge.svg)](https://github.com/okx/agent-tradekit/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/okx/agent-tradekit/branch/master/graph/badge.svg)](https://codecov.io/gh/okx/agent-tradekit)
[![npm: mcp](https://img.shields.io/npm/v/okx-trade-mcp?label=okx-trade-mcp)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm downloads: mcp](https://img.shields.io/npm/dm/okx-trade-mcp?label=mcp+downloads)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm: cli](https://img.shields.io/npm/v/okx-trade-cli?label=okx-trade-cli)](https://www.npmjs.com/package/okx-trade-cli)
[![npm downloads: cli](https://img.shields.io/npm/dm/okx-trade-cli?label=cli+downloads)](https://www.npmjs.com/package/okx-trade-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | [中文](README.zh.md)

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
| **77 tools across 7 modules** | Full trading lifecycle: market data → orders → algo orders → account management → trading bots |
| **Algo orders built-in** | Conditional, OCO take-profit/stop-loss, trailing stop |
| **Safety controls** | `--read-only` flag, per-module filtering, built-in rate limiter |
| **Zero infrastructure** | Local stdio process, no server or database required |
| **MCP standard** | Works with Claude Desktop, Cursor, openCxxW, and any MCP-compatible client |
| **Open source** | MIT license, API keys never leave your machine |

## Modules

| Module | Tools | Description | Docs |
|--------|-------|-------------|------|
| `market` | 12 | Ticker, orderbook, candles (+history), index ticker, index candles, price limit, funding rate, mark price, open interest | [→](docs/modules/market.md) |
| `spot` | 13 | Place/cancel/amend orders, batch orders, fills (+archive), order history (+archive), conditional orders, OCO | [→](docs/modules/spot.md) |
| `swap` | 17 | Perpetual trading, batch orders, positions, leverage, conditional orders, OCO, trailing stop | [→](docs/modules/swap.md) |
| `futures` | 6 | Delivery contract trading, positions, fills, order history | [→](docs/modules/futures.md) |
| `option` | 10 | Options trading: place/cancel/amend/batch-cancel, order history, positions (with Greeks), fills, option chain, IV + Greeks | [→](docs/modules/option.md) |
| `account` | 14 | Balance, bills (+archive), positions, positions history, fee rates, config, position mode, max withdrawal, max avail size, audit log | [→](docs/modules/account.md) |
| `bot` | 5 | Trading Bot — grid strategies: list/details/sub-orders (read), create/stop (write). Spot Grid, Contract Grid, Moon Grid | [→](docs/modules/bot.md) |

---

## Quick Start

**Prerequisites:** Node.js >= 18

```bash
# 1. Install packages
npm install -g @okx_retail/okx-trade-mcp @okx_retail/okx-trade-cli

# 2. Register the MCP server with your AI client
okx-trade-mcp setup --client claude-desktop   # or: cursor / vscode / claude-code
```

Then add your OKX API credentials (separate from the above — only needed for authenticated tools):

```bash
mkdir -p ~/.okx && vim ~/.okx/config.toml
```

Fill in `~/.okx/config.toml`:

```toml
default_profile = "demo"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> Demo key: OKX website → Trading → Demo Trading → API Management

For live trading or multiple profiles, see [configuration →](docs/configuration.md).

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

[VS Code · Windsurf · openCxxW →](docs/configuration.md) — [Startup scenarios →](docs/configuration.md#startup-scenarios) (market-only, read-only, spot-only, etc.)

---

## okx-trade-cli

```bash
okx market ticker BTC-USDT
okx spot place --instId BTC-USDT --side buy --ordType market --sz 100
okx account balance
```

**[Full CLI reference →](docs/cli-reference.md)**

---

## Reporting Issues

If a tool call or CLI command fails, open an issue and include the full error output.

**MCP** — copy the structured error block shown in your AI client:

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

**CLI** — paste the full stderr output:

```
Error: Order quantity invalid
TraceId: abc123def456
Hint: Check order size against instrument minSz.
Version: okx-trade-cli@1.0.4
```

See **[FAQ →](docs/faq.md)** for common issues.

---

## Build from Source

```bash
git clone https://github.com/okx/agent-tradekit.git && cd okx-trade-mcp
pnpm install && pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development guide.

```
packages/
├── core/    # shared client & tools
├── mcp/     # MCP Server
└── cli/     # CLI tool
```
