<!-- triggers: earn, savings, dcd, onchain, autoearn, auto-earn, flash, flash-earn, bot, grid, dca, recurring, yield, staking, flexible, fixed, subscribe, redeem -->
# Earn & Bot Modules

## Earn Module (`packages/core/src/tools/earn/`)

The earn module is split into five sub-modules, each targeting a different OKX earn product. They share the parent `earn/index.ts` which registers tools with the shorthand `earn.all` (expands to all five sub-modules).

### savings (`earn/savings.ts`)
- Flexible savings: subscribe/redeem at any time, earn lending yield
- `earn_get_savings_balance` — current savings positions
- `earn_subscribe_savings` / `earn_redeem_savings` — move funds in/out
- APY shown as current lending rate (changes hourly)

### dcd (`earn/dcd.ts`)
- Dual Currency Deposits: structured product — earn premium but may settle in either currency depending on price at expiry
- `earn_get_dcd_products` — list available DCD products by currency pair and tenor
- `earn_subscribe_dcd` — place DCD subscription (write operation)
- Higher yield than savings but with price risk at settlement

### onchain (`earn/onchain.ts`)
- On-chain staking: delegate assets to DeFi protocols or validator nodes
- `earn_get_onchain_offers` — list staking offers by currency
- `earn_subscribe_onchain` / `earn_redeem_onchain`
- Redemption may have a lock-up period (shown in `redemptionPeriod`)

### autoearn (`earn/autoearn.ts`)
- Auto-earn: automatically route idle funds to the best available yield product
- `earn_get_autoearn_config` — current auto-earn settings
- `earn_set_autoearn` — enable/configure auto-earn per currency (write)
- Internally calls savings or on-chain depending on the yield optimization

### flash (`earn/flash-earn.ts`)
- Flash Earn: time-limited, high-yield promotional earn events
- `earn_get_flash_earn_projects` — list flash earn projects, optionally filtered by status (upcoming / in-progress)
- Read-only module — no subscribe/redeem operations currently exposed
- Projects have limited quotas and specific start/end windows

### Sub-module ID Expansion

In config and CLI, `earn.all` is a shorthand that expands to all five earn sub-modules:
```
earn.all → [earn.savings, earn.dcd, earn.onchain, earn.autoearn, earn.flash]
```
This expansion happens in `packages/core/src/constants.ts`.

## Bot Module (`packages/core/src/tools/bot/`)

The bot module exposes two automated strategy types. Like earn, it uses `bot.all` shorthand.

### grid (`bot/grid.ts`)
- Grid trading bots: place buy/sell orders at regular price intervals
- Supports spot grid and contract grid variants
- `grid_create_order` — create a new grid bot (write)
- `grid_list_orders` — list running or historical grid bots with PnL
- `grid_get_order_details` — get detail of a specific grid bot
- `grid_get_sub_orders` — list sub-orders (grid trades) of a bot
- `grid_amend_order` — amend a running grid bot without stopping it (write); supports price-range mode (maxPx/minPx/gridNum), TP/SL mode (instId + tpTriggerPx/slTriggerPx/tpRatio/slRatio), or both combined in one call
- `grid_stop_order` — terminate a grid bot (write); stopType `"1"` closes all positions (default), `"2"` keeps positions open

### dca (`bot/dca.ts`)
- DCA (Dollar Cost Averaging) bots: recurring purchases at fixed intervals
- `bot_create_dca` — create a DCA bot with amount, frequency, and instrument (write)
- `bot_list_dca` — list active DCA bots
- `bot_stop_dca` — terminate a DCA bot (write)

### Sub-module ID Expansion

```
bot.all → [bot.grid, bot.dca]
```

## Write Safety

All subscribe/redeem/create/stop operations are `isWrite: true`. The MCP server enforces a confirmation flow for write tools — the agent must not bypass this with silent auto-confirms.

When the agent is managing a bot and encounters a `set-leverage` failure before starting the bot, it should **not** automatically stop the bot. Instead, it should surface the error and ask the user for guidance. (See issue #229 for the leverage-gap incident.)
