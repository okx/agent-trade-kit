<!-- triggers: overview, project, architecture, monorepo, what is, introduction, packages, core, mcp, cli, skills -->
# Project Overview

**okx-trade-mcp** is an AI-powered trading toolkit that exposes OKX exchange capabilities to AI agents via the Model Context Protocol (MCP) and a command-line interface (CLI). It enables language models to query market data, manage accounts, place orders, and control trading bots — all through structured tool calls.

## Monorepo Structure

The project is a pnpm workspace monorepo containing three packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@okx-trade/core` | `packages/core` | Shared SDK: REST client, tool definitions, config parsing, error types |
| `@okx-trade/mcp` | `packages/mcp` | MCP server exposing ~163 tools over stdio (JSON-RPC 2.0) |
| `@okx-trade/cli` | `packages/cli` | CLI binary (`okx`) for direct terminal use |

**Bundling**: tsup (ESM output). **Testing**: node:test. **Validation**: zod. **Config**: TOML via smol-toml.

## MCP Tool Inventory

As of the latest registry scan, the server exposes **163 MCP tools** organized into **17 modules** (authoritative count: see `docs/module-registry.md`):

- **market** — public market data (tickers, candles, orderbook, trades)
- **spot** — spot trading (place/cancel/amend orders, get positions)
- **swap** — perpetual swap trading
- **futures** — dated futures trading
- **option** — options trading
- **account** — balance, positions, leverage, account config
- **event** — event contracts (binary prediction markets)
- **news** — crypto news, sentiment analysis, and coin trend tracking
- **earn.savings** — simple earn (flexible savings, fixed-term, lending)
- **earn.onchain** — on-chain earn (staking and DeFi products)
- **earn.dcd** — DCD structured products with fixed yield
- **earn.autoearn** — auto-earn on idle assets
- **earn.flash** — flash earn (short-window high-yield projects)
- **bot.grid** — grid trading bot (create, monitor, stop)
- **bot.dca** — DCA (Martingale) bot (spot or contract recurring buys)
- **smartmoney** — smart-money signals, trader leaderboard, consensus/position analysis
- **skills** — skills marketplace (search, install, manage skill packs)

## Skills Ecosystem

**11 skill packs** live in the `skills/` directory and are published to the agent-hub marketplace:

- `skills/okx-cex-trade/` — trading operations
- `skills/okx-cex-market/` — market data queries
- `skills/okx-cex-earn/` — earn product management
- `skills/okx-cex-bot/` — bot lifecycle management
- `skills/okx-cex-portfolio/` — portfolio overview
- `skills/okx-cex-skill-mp/` — skill marketplace management
- `skills/okx-cex-smartmoney/` — smart-money signals and trader leaderboard
- `skills/okx-cex-auth/` — authentication setup and credential management
- `skills/okx-sentiment-tracker/` — crypto news and market sentiment
- `skills/okx-outcomes/` — OKX Outcomes / prediction markets (YES/NO event contracts) via external `okx-outcomes` binary
- `skills/earn-hunter/` — automated earn yield scanning and alerts

Each skill pack's `SKILL.md` carries a `metadata.version` that must be synchronized with the package release version on every stable release.

## Key Design Principles

1. **MCP-first**: every trading capability must be accessible as an MCP tool
2. **CLI parity**: all MCP tool capabilities are also exposed as CLI subcommands
3. **Shared logic in core**: no duplication between `packages/mcp` and `packages/cli` — both import from `packages/core`
4. **Multi-site support**: the server supports three OKX regions (Global, EEA, US) with different API endpoints
5. **Module granularity**: tool descriptions are intent-oriented (what/when), not API-oriented (endpoints/error codes)
