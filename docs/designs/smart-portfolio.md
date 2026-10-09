# Smart Portfolio Module Design

## Overview

The `bot.smartportfolio` module adds a new bot strategy to the okx-trade-mcp server: Smart Portfolio — an auto-rebalancing multi-asset portfolio strategy. Users define a target allocation across 2–10 assets and the bot rebalances when the actual allocation drifts beyond a configurable threshold (`deltaRatio`).

## Approach

Follow the existing `bot.dca` pattern exactly:
- New file `packages/core/src/tools/bot/smart-portfolio.ts` exports `registerSmartPortfolioTools(): ToolSpec[]`
- `packages/core/src/tools/bot/index.ts` spreads these tools into `registerBotTools()`
- `packages/core/src/constants.ts` adds `"bot.smartportfolio"` to `BOT_SUB_MODULE_IDS` (but NOT `DEFAULT_MODULES` or `BOT_DEFAULT_SUB_MODULES`)

## Why NOT in DEFAULT_MODULES

Token budget: adding 9 tools (~2,800 tokens) would bring the total to ~52,824 tokens — already over the 25,000-token budget for the full all-modules load. Per project convention, newer bot strategies are not in the default set. Users opt in via `bot.all` or `all`.

## API Base Path

`/api/v5/tradingBot/smart-portfolio`

## Tool Summary

| # | Name | Method | Endpoint | isWrite |
|---|------|--------|----------|---------|
| 1 | `smart_portfolio_create_order` | POST | `/order-algo` | true |
| 2 | `smart_portfolio_get_orders` | GET | `/orders-algo-pending` or `/orders-algo-history` (via `status` param) | false |
| 3 | `smart_portfolio_get_order_details` | GET | `/order-algo` | false |
| 4 | `smart_portfolio_stop_order` | POST | `/stop-order-algo` | true |
| 5 | `smart_portfolio_amend_rebalance` | POST | `/amend-rebalance` | true |
| 6 | `smart_portfolio_instant_rebalance` | POST | `/instant-rebalance` | true |
| 7 | `smart_portfolio_get_recommend_zones` | GET | `/recommend-zones` | false |
| 9 | `smart_portfolio_get_zones_backtest` | GET | `/zones-backtest` | false |

## Key Implementation Constraints

| Constraint | Implementation |
|---|---|
| `investmentCcy` (create) ≠ `investCcy` (query) ≠ `quoteCcy` (recommend) | Three distinct field names; no shared normalizer |
| `portfolioList[].ccy`: server doesn't trim/uppercase | Handler: `ccy.trim().toUpperCase()` before dedup check |
| `deltaRatio` truncation: `floor(x*100)/100 ∈ [0.01, 1)` | Custom `validateDeltaRatio()` used in tools 1 & 6 |
| Tools 2/3/4: no `balType` in response | No attempt to read `balType` |
| Tool 5 response: no `clOrdId` | Separate `normalizeWriteStop` (pass-through) vs `normalizeWriteCreate` (sCode check) for tool 1 |
| Tool 6: `data: []` always | Only check outer `code` via `normalizeResponse()`; never call the sCode-checking normalizer |
| Tool 7: `triggered` is Boolean | Pass through as-is |
| Tool 8: strip `profitHistory` | Client-side: delete `item.defaultBacktestYield.profitHistory` |
| Tools 2+3: no `algoOrdType` | Not in inputSchema; not sent in request |
| Tool 2: no `instType` | Not in inputSchema; not sent |
| Tool 3: `instType` valid | Included in inputSchema |

## Alternatives Considered

**Alternative: Reuse existing normalizeWrite from dca.ts** — Rejected. The response shapes are different enough (tool 5 has no `sCode`, tool 6 always has empty data) that a shared normalizer would require flag parameters. Separate functions keep each tool's response handling clear.

**Alternative: Add to DEFAULT_MODULES** — Rejected. Token budget is already 2× over limit. Adding more tools to the default set without a module load decision would further degrade performance for users who don't need Smart Portfolio.

## Risks

- **Token budget**: Adding ~2,800 tokens brings `bot.all` / `all` to ~52,824 tokens total. This is documented and accepted per issue specification.
- **Baseline branch merge conflicts**: Targeting `feat/dca-margin-tp-manual-buy-rerun1-manual` — `docs/module-registry.md`, `constants.ts`, and skills files may conflict during rebase to master.
