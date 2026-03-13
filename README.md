# OKX Agent Trade Kit

[![CI](https://github.com/okx/agent-tradekit/actions/workflows/ci.yml/badge.svg)](https://github.com/okx/agent-tradekit/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/okx/agent-tradekit/branch/master/graph/badge.svg)](https://codecov.io/gh/okx/agent-tradekit)
[![npm: mcp](https://img.shields.io/npm/v/okx-trade-mcp?label=okx-trade-mcp)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm downloads: mcp](https://img.shields.io/npm/dt/okx-trade-mcp?label=mcp+total+downloads)](https://www.npmjs.com/package/okx-trade-mcp)
[![npm: cli](https://img.shields.io/npm/v/okx-trade-cli?label=okx-trade-cli)](https://www.npmjs.com/package/okx-trade-cli)
[![npm downloads: cli](https://img.shields.io/npm/dt/okx-trade-cli?label=cli+total+downloads)](https://www.npmjs.com/package/okx-trade-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | [中文](README.zh-CN.md)

OKX Agent Trade Kit — an AI-powered trading toolkit with two standalone packages:

| Package | Description |
|---|---|
| `okx-trade-mcp` | MCP server for Claude / Cursor and any MCP-compatible AI client |
| `okx-trade-cli` | CLI for operating OKX from terminal |

---

## What is this?

OKX Agent Trade Kit connects AI assistants directly to your OKX account via the [Model Context Protocol](https://modelcontextprotocol.io). Instead of switching between your AI and the exchange UI, you describe what you want — the AI calls the right tools and executes it.

It runs as a **local process** with your API keys stored only on your machine. No cloud services, no data leaving your device.

## Features

| Feature | Description |
|---------|-------------|
| **96 tools across 8 modules** | Full trading lifecycle: market data → orders → algo orders → account management → earn → trading bots |
| **Algo orders built-in** | Conditional, OCO take-profit/stop-loss, trailing stop |
| **Safety controls** | `--read-only` flag, per-module filtering, built-in rate limiter |
| **Zero infrastructure** | Local stdio process, no server or database required |
| **MCP standard** | Works with Claude Desktop, Cursor, openCxxW, and any MCP-compatible client |
| **Open source** | MIT license, API keys never leave your machine |

## Modules

| Module | Tools | Description | Docs |
|--------|-------|-------------|------|
| `market` | 13 | Ticker, orderbook, candles (+history), index ticker, index candles, price limit, funding rate, mark price, open interest, stock tokens | [→](docs/modules/market.md) |
| `spot` | 13 | Place/cancel/amend orders, batch orders, fills (+archive), order history (+archive), conditional orders, OCO | [→](docs/modules/spot.md) |
| `swap` | 17 | Perpetual trading, batch orders, positions, leverage, conditional orders, OCO, trailing stop | [→](docs/modules/swap.md) |
| `futures` | 6 | Delivery contract trading, positions, fills, order history | [→](docs/modules/futures.md) |
| `option` | 10 | Options trading: place/cancel/amend/batch-cancel, order history, positions (with Greeks), fills, option chain, IV + Greeks | [→](docs/modules/option.md) |
| `account` | 14 | Balance, bills (+archive), positions, positions history, fee rates, config, position mode, max withdrawal, max avail size, audit log | [→](docs/modules/account.md) |
| `earn` | 21 | Simple Earn: balance, purchase, redeem, lending rate (7). On-chain staking/DeFi (6). Dual Currency Deposit/双币赢 (8). Sub-modules: `earn.savings`, `earn.onchain`, `earn.dcd`. Included in `all`. | [→](docs/modules/earn.md) |
| `bot` | 10 | Trading bots: Grid (5) and DCA (5). Sub-modules: `bot.grid`, `bot.dca` | [→](docs/modules/bot.md) |

---

## Quick Start

**Prerequisites:** Node.js >= 18

```bash
# 1. Install
npm install -g @okx_ai/okx-trade-mcp @okx_ai/okx-trade-cli

# 2. Configure OKX API credentials (interactive wizard)
okx config init

# 3. Register the MCP server with your AI client
okx-trade-mcp setup --client claude-desktop
okx-trade-mcp setup --client cursor
okx-trade-mcp setup --client claude-code
okx-trade-mcp setup --client vscode          # writes .mcp.json in current directory
```

> **Alternative:** [One-line install script](docs/configuration.md#one-line-install) — handles Node.js check, install, and client detection automatically.
>
> For live trading, multiple profiles, or other clients, see [configuration →](docs/configuration.md).

---

## okx-trade-mcp

```bash
okx-trade-mcp                                        # default: spot, swap, account
okx-trade-mcp --modules market                       # market data only (no auth needed)
okx-trade-mcp --modules spot,account                 # spot trading + account
okx-trade-mcp --profile live --modules all           # all modules including earn
okx-trade-mcp --read-only                            # query tools only, no writes
```

[Startup scenarios →](docs/configuration.md#startup-scenarios) — [VS Code · Windsurf →](docs/configuration.md)

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

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](ARCHITECTURE.md) | System design and module overview |
| [Contributing](CONTRIBUTING.md) | Development setup and PR guidelines |
| [Changelog](CHANGELOG.md) | Version history |
| [Security](SECURITY.md) | Vulnerability reporting |
