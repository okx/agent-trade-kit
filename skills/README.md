[English](README.md) | [中文](README.zh-CN.md)

# Agent Skills

Pre-built skills for AI agents to operate OKX via the `okx` CLI. Each skill is a self-contained Markdown file with YAML frontmatter that tells the agent when to activate and how to execute tasks.

## Skills

| Skill | Description | Auth Required |
|-------|-------------|:-------------:|
| [`okx-cex-market`](okx-cex-market/SKILL.md) | Public market data: prices, order books, candles, funding rates, open interest, instruments, technical indicators | No |
| [`okx-cex-trade`](okx-cex-trade/SKILL.md) | Order management: spot, perpetual swap, delivery futures, options, TP/SL and trailing stop algo orders | Yes |
| [`okx-cex-portfolio`](okx-cex-portfolio/SKILL.md) | Account operations: balances, positions, P&L, fees, fund transfers | Yes |
| [`okx-cex-bot`](okx-cex-bot/SKILL.md) | Automated strategies: spot/contract grid bots and DCA (Spot & Contract) bots | Yes |
| [`okx-cex-earn`](okx-cex-earn/SKILL.md) | Earn products: Simple Earn, On-chain staking, Dual Investment (双币赢), AutoEarn | Yes |

## Requirements

- [`okx` CLI](https://www.npmjs.com/package/@okx_ai/okx-trade-cli) installed:
  ```bash
  npm install -g @okx_ai/okx-trade-cli
  ```
- For authenticated skills: OKX API credentials configured in `~/.okx/config.toml`:
  ```bash
  okx config init
  ```

## Skill Format

Each skill is a Markdown file with a YAML frontmatter header:

```yaml
---
name: skill-name
description: "Trigger description for the AI agent routing system."
license: MIT
metadata:
  author: okx
  version: "1.0.0"
  agent:
    requires:
      bins: ["okx"]
---
```

The `description` field is used by the agent routing system to decide when to activate the skill. Skills with `references/` subdirectories use `{baseDir}` as a runtime-resolved path variable pointing to that skill's directory.

## Contributing

To add or improve a skill:

1. Follow the existing SKILL.md structure (frontmatter + prerequisites + command index + operation flow)
2. Place reference files in a `references/` subdirectory if the skill is large
3. Keep `description` in the frontmatter exhaustive — it determines agent routing accuracy
4. See [CONTRIBUTING.md](../CONTRIBUTING.md) for branch and review conventions

## License

MIT — see [LICENSE](../LICENSE).
