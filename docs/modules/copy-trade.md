[English](./copy-trade.md) | [中文](./copy-trade.zh-CN.md)

# Copy Trading Module

The `copytrading` module lets you discover lead traders, follow them, manage copy positions, and query public trader analytics — all via MCP tools or CLI commands.

## MCP Tools

| Tool | Auth | Description |
|------|------|-------------|
| `copytrading_public_lead_traders` | Public | Get top lead traders ranking |
| `copytrading_current_lead_traders` | Private | List lead traders I am currently copying |
| `copytrading_copy_positions` | Private | Get my current open copy positions |
| `copytrading_follow_trader` | Private ⚠️ | Start copy trading a lead trader (allocates funds) |
| `copytrading_amend_settings` | Private | Update copy settings for a lead trader |
| `copytrading_stop_copy_trader` | Private ⚠️ | Stop copy trading a lead trader |
| `copytrading_copy_settings` | Private | Get current copy settings for a trader |
| `copytrading_history_positions` | Private | Get copy position history (last 3 months) |
| `copytrading_public_lead_trader_pnl` | Public | Get a lead trader daily P&L |
| `copytrading_public_weekly_pnl` | Public | Get a lead trader weekly P&L (last 12 weeks) |
| `copytrading_public_stats` | Public | Get lead trader statistics (win rate, avg position) |
| `copytrading_public_preference_currency` | Public | Get lead trader preferred currencies |
| `copytrading_public_current_positions` | Public | Get lead trader current open positions |
| `copytrading_public_history_positions` | Public | Get lead trader closed positions history |
| `copytrading_public_followers` | Public | Get lead trader followers info |
| `copytrading_public_config` | Public | Get platform copy trading config (limits) |

## Enabling the Module

The `copytrading` module is not included in the default module set. Enable it explicitly:

```bash
# MCP server
okx-trade-mcp --modules copytrading,spot,swap,account

# CLI — the CLI always has access to all modules regardless of config
okx copy-trade traders
```

Or in `config.toml`:

```toml
[profiles.default]
modules = "spot,swap,account,copytrading"
```

## Key Parameters

| Parameter | Description |
|-----------|-------------|
| `uniqueCode` | Lead trader unique identifier (16-character code) |
| `copyTotalAmt` | Maximum total USDT to allocate to this trader |
| `copyMode` | `fixed_amount` (fixed USDT per order) or `ratio_copy` (proportion of lead order) |
| `copyAmt` | Fixed USDT amount per order (for `fixed_amount` mode) |
| `copyRatio` | Copy ratio, e.g. `0.1` = 10% of lead order size (for `ratio_copy` mode) |
| `copyMgnMode` | Margin mode: `cross`, `isolated`, or `copy` (follow lead trader) |
| `subPosCloseType` | What to do with positions when stopping: `copy_close`, `market_close`, `manual_close` |
| `lastDays` | Time range: `1`=7d `2`=30d `3`=90d `4`=365d |

## CLI Quick Reference

```bash
# Discover traders
okx copy-trade traders
okx copy-trade trader-stats --uniqueCode <code> --lastDays 2
okx copy-trade trader-pnl   --uniqueCode <code> --lastDays 2

# Follow / manage
okx copy-trade follow   --uniqueCode <code> --copyAmt 500 --fixedAmt 50
okx copy-trade update   --uniqueCode <code> --copyAmt 1000
okx copy-trade unfollow --uniqueCode <code>

# Monitor
okx copy-trade pnl
okx copy-trade positions
okx copy-trade orders
```

See [CLI Reference](../cli-reference.md#copy-trade--copy-trading) for full examples.
