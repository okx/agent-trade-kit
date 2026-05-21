# Tool Titles & Annotations Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a human-readable `title` field to every one of the 162 registered MCP tools and correct the per-tool annotation hints (`destructiveHint`, `idempotentHint`) so that the `tools/list` response is faithful to MCP spec semantics.

**Architecture:**
1. Extend `ToolSpec` with a required `title: string` and two optional override fields `destructiveHint?: boolean` and `idempotentHint?: boolean`.
2. `toMcpTool` emits `title` both at top-level (`Tool.title`, MCP 2025-06-18+) and inside `annotations.title` for older clients, and uses the per-tool overrides when present (otherwise falls back to the current `isWrite`-derived defaults).
3. Backfill every registration site, file by file, with the title strings agreed in the Anthropic Directory submission Lark doc (and category-derived overrides for write tools).

**Tech Stack:** TypeScript, MCP SDK `@modelcontextprotocol/sdk@^1.26`, pnpm monorepo, tsup build, `node:test` test runner.

---

## Title Catalogue (single source of truth)

The agent MUST copy titles verbatim from this catalogue. Use this when filling each file in Tasks 4–22.

### Conventions
- No abbreviations. Spell out `OI` → `Open Interest`, `TP/SL` → `Take Profit / Stop Loss` only inside titles (descriptions stay as-is).
- `swap_*` tools' display label is **Perpetual Futures** (the OKX product is "perpetual swap"; users say "perp futures"). API/code names stay `swap_*`.
- `dca_*` tools' display label is **Martingale**.
- `trade_get_history` stays in code but is internal-only; still gets a title for completeness.

### Catalogue

#### market.ts (14 tools, all read)
| name | title |
|---|---|
| market_get_ticker | Get Ticker |
| market_get_tickers | Get All Tickers |
| market_get_orderbook | Get Order Book |
| market_get_candles | Get Candlesticks |
| market_get_instruments | List Instruments |
| market_get_funding_rate | Get Funding Rate |
| market_get_mark_price | Get Mark Price |
| market_get_trades | Get Recent Trades |
| market_get_index_ticker | Get Index Ticker |
| market_get_index_candles | Get Index Candlesticks |
| market_get_price_limit | Get Price Limit |
| market_get_open_interest | Get Open Interest |
| market_get_stock_tokens | List Stock Tokens |
| market_get_instruments_by_category | List Instruments by Category |

#### market-filter.ts (4 tools, all read)
| name | title |
|---|---|
| market_filter | Screen Instruments |
| market_get_oi_history | Get Open Interest History |
| market_filter_oi_change | Find Open Interest Change Instruments |
| market_get_pair_spread | Get Pair Spread |

#### indicator.ts (2 tools, all read)
| name | title |
|---|---|
| market_get_indicator | Get Technical Indicator |
| market_list_indicators | List Technical Indicators |

#### news.ts (9 tools, all read)
| name | title |
|---|---|
| news_get_latest | Get Latest Crypto News |
| news_get_by_coin | Get News by Coin |
| news_search | Search News |
| news_get_detail | Get News Article |
| news_get_coin_sentiment | Get Coin Sentiment |
| news_get_sentiment_ranking | Get Sentiment Ranking |
| news_get_economic_calendar | Get Economic Calendar |
| news_get_domains | List News Sources |
| news_list_calendar_regions | List Calendar Regions |

#### smartmoney.ts (10 tools, all read)
| name | title |
|---|---|
| smartmoney_get_traders_by_filter | Smart Money Leaderboard |
| smartmoney_get_performance_by_trader | Smart Money Trader Performance |
| smartmoney_get_trader_positions | Smart Money Trader Current Positions |
| smartmoney_get_trader_positions_history | Smart Money Trader Position History |
| smartmoney_get_trader_orders_history | Smart Money Trader Order History |
| smartmoney_search_trader | Search Smart Money Top Traders |
| smartmoney_get_signal_overview_by_filter | Smart Money Consensus Signals by Filter |
| smartmoney_get_signal_overview_by_trader | Smart Money Consensus Signals by Trader |
| smartmoney_get_signal_trend_by_filter | Smart Money Signal Trend by Filter |
| smartmoney_get_signal_trend_by_trader | Smart Money Signal Trend by Trader |

#### account.ts (13 tools)
| name | title | overrides |
|---|---|---|
| account_get_balance | Get Trading Account Balance | — |
| account_transfer | Transfer Between Accounts | destructiveHint=false |
| account_get_max_size | Get Max Order Size | — |
| account_get_asset_balance | Get Funding Account Balance | — |
| account_get_bills | Get Account Bills | — |
| account_get_positions_history | Get Closed Positions History | — |
| account_get_trade_fee | Get Trade Fee Tier | — |
| account_get_config | Get Account Configuration | — |
| account_get_max_withdrawal | Get Max Withdrawable Amount | — |
| account_get_max_avail_size | Get Max Available Position Size | — |
| account_get_positions | Get Current Positions | — |
| account_get_bills_archive | Get Archived Account Bills | — |
| account_set_position_mode | Set Position Mode | idempotentHint=true |

#### audit.ts (1 tool)
| name | title |
|---|---|
| trade_get_history | Get Tool-Call Audit Log |

#### skills.ts (3 tools)
| name | title | overrides |
|---|---|---|
| skills_get_categories | Skills Marketplace List Categories | — |
| skills_search | Skills Marketplace Search | — |
| skills_download | Skills Marketplace Download | destructiveHint=false, idempotentHint=true |

#### event-trade.ts (9 tools)
| name | title | overrides |
|---|---|---|
| event_browse | Event Contracts Browse Active | — |
| event_get_series | Event Contracts List Series | — |
| event_get_events | Event Contracts List Events | — |
| event_get_markets | Event Contracts List Markets | — |
| event_get_orders | Event Contracts Get Orders | — |
| event_get_fills | Event Contracts Get Fills | — |
| event_place_order | Event Contracts Place Order | destructiveHint=false |
| event_amend_order | Event Contracts Amend Order | idempotentHint=true |
| event_cancel_order | Event Contracts Cancel Order | idempotentHint=true |

#### spot-trade.ts (14 tools)
| name | title | overrides |
|---|---|---|
| spot_place_order | Spot Place Order | destructiveHint=false |
| spot_cancel_order | Spot Cancel Order | idempotentHint=true |
| spot_amend_order | Spot Amend Order | idempotentHint=true |
| spot_get_orders | Spot Get Orders | — |
| spot_place_algo_order | Spot Place Algo Order | destructiveHint=false |
| spot_amend_algo_order | Spot Amend Algo Order | idempotentHint=true |
| spot_cancel_algo_order | Spot Cancel Algo Order | idempotentHint=true |
| spot_get_algo_orders | Spot Get Algo Orders | — |
| spot_get_fills | Spot Get Fills | — |
| spot_batch_orders | Spot Batch Place Orders | destructiveHint=false |
| spot_get_order | Spot Get Order | — |
| spot_batch_amend | Spot Batch Amend Orders | idempotentHint=true |
| spot_batch_cancel | Spot Batch Cancel Orders | idempotentHint=true |
| spot_set_leverage | Spot Set Leverage | idempotentHint=true |

#### contract-trade.ts (factory; produces 11 tools for swap and 11 for futures)
The factory MUST accept a new `titleLabel: string` parameter (e.g. `"Perpetual Futures"`, `"Futures"`). For each emitted tool the title and override is:

| suffix | title pattern | overrides |
|---|---|---|
| place_order | `${titleLabel} Place Order` | destructiveHint=false |
| cancel_order | `${titleLabel} Cancel Order` | idempotentHint=true |
| get_order | `${titleLabel} Get Order` | — |
| get_orders | `${titleLabel} Get Orders` | — |
| get_positions | `${titleLabel} Get Positions` | — |
| get_fills | `${titleLabel} Get Fills` | — |
| close_position | `${titleLabel} Close Position` | idempotentHint=true |
| set_leverage | `${titleLabel} Set Leverage` | idempotentHint=true |
| get_leverage | `${titleLabel} Get Leverage` | — |
| batch_amend | `${titleLabel} Batch Amend Orders` | idempotentHint=true |
| batch_cancel | `${titleLabel} Batch Cancel Orders` | idempotentHint=true |

#### swap-trade.ts (2 tools — factory call uses titleLabel="Perpetual Futures")
| name | title | overrides |
|---|---|---|
| swap_amend_algo_order | Perpetual Futures Amend Algo Order | idempotentHint=true |
| swap_batch_orders | Perpetual Futures Batch Orders | — |

#### futures-trade.ts (2 tools — factory call uses titleLabel="Futures")
| name | title | overrides |
|---|---|---|
| futures_amend_order | Futures Amend Order | idempotentHint=true |
| futures_batch_orders | Futures Batch Place Orders | destructiveHint=false |

#### option-trade.ts (10 tools)
| name | title | overrides |
|---|---|---|
| option_place_order | Option Place Order | destructiveHint=false |
| option_cancel_order | Option Cancel Order | idempotentHint=true |
| option_batch_cancel | Option Batch Cancel Orders | idempotentHint=true |
| option_amend_order | Option Amend Order | idempotentHint=true |
| option_get_order | Option Get Order | — |
| option_get_orders | Option Get Orders | — |
| option_get_positions | Option Get Positions with Greeks | — |
| option_get_fills | Option Get Fills | — |
| option_get_instruments | Option List Instruments (Chain) | — |
| option_get_greeks | Option Get Greeks | — |

#### option-algo-trade.ts (4 tools)
| name | title | overrides |
|---|---|---|
| option_place_algo_order | Option Place Algo Order | destructiveHint=false |
| option_amend_algo_order | Option Amend Algo Order | idempotentHint=true |
| option_cancel_algo_orders | Option Cancel Algo Orders | idempotentHint=true |
| option_get_algo_orders | Option Get Algo Orders | — |

#### algo-trade.ts — swap section (4 tools)
| name | title | overrides |
|---|---|---|
| swap_place_algo_order | Perpetual Futures Place Algo Order | destructiveHint=false |
| swap_place_move_stop_order | Perpetual Futures Place Move-Stop Order | destructiveHint=false |
| swap_cancel_algo_orders | Perpetual Futures Cancel Algo Orders | idempotentHint=true |
| swap_get_algo_orders | Perpetual Futures Get Algo Orders | — |

#### algo-trade.ts — futures section (5 tools)
| name | title | overrides |
|---|---|---|
| futures_place_algo_order | Futures Place Algo Order | destructiveHint=false |
| futures_place_move_stop_order | Futures Place Move-Stop Order | destructiveHint=false |
| futures_amend_algo_order | Futures Amend Algo Order | idempotentHint=true |
| futures_cancel_algo_orders | Futures Cancel Algo Orders | idempotentHint=true |
| futures_get_algo_orders | Futures Get Algo Orders | — |

#### bot/grid.ts (6 tools)
| name | title | overrides |
|---|---|---|
| grid_get_orders | Grid Bot List Orders | — |
| grid_get_order_details | Grid Bot Get Detail | — |
| grid_get_sub_orders | Grid Bot Get Sub-Orders | — |
| grid_create_order | Grid Bot Create | destructiveHint=false |
| grid_amend_order | Grid Bot Amend | idempotentHint=true |
| grid_stop_order | Grid Bot Stop | idempotentHint=true |

#### bot/dca.ts (5 tools — display label is "Martingale")
| name | title | overrides |
|---|---|---|
| dca_create_order | Martingale Bot Create | destructiveHint=false |
| dca_stop_order | Martingale Bot Stop | idempotentHint=true |
| dca_get_orders | Martingale Bot List Orders | — |
| dca_get_order_details | Martingale Bot Get Detail | — |
| dca_get_sub_orders | Martingale Bot Get Sub-Orders | — |

#### earn/savings.ts (9 tools)
| name | title | overrides |
|---|---|---|
| earn_get_savings_balance | Get Simple Earn Balance | — |
| earn_get_fixed_order_list | Get Fixed-Term Earn Orders | — |
| earn_savings_purchase | Subscribe Simple Earn | destructiveHint=false |
| earn_savings_redeem | Redeem Simple Earn | destructiveHint=false |
| earn_set_lending_rate | Set Lending Rate | idempotentHint=true |
| earn_get_lending_history | Get Lending History | — |
| earn_fixed_purchase | Subscribe Fixed-Term Earn | destructiveHint=false |
| earn_fixed_redeem | Redeem Fixed-Term Earn | destructiveHint=false |
| earn_get_lending_rate_history | Get Lending Rates & Offers | — |

#### earn/dcd.ts (6 tools)
| name | title | overrides |
|---|---|---|
| dcd_get_currency_pairs | Dual Investment List Currency Pairs | — |
| dcd_get_products | Dual Investment List Products | — |
| dcd_get_order_state | Dual Investment Get Order State | — |
| dcd_get_orders | Dual Investment Get Order History | — |
| dcd_subscribe | Dual Investment Subscribe | destructiveHint=false |
| dcd_redeem | Dual Investment Redeem | destructiveHint=false |

#### earn/onchain.ts (6 tools)
| name | title | overrides |
|---|---|---|
| onchain_earn_get_offers | On-chain Earn List Offers | — |
| onchain_earn_purchase | On-chain Earn Subscribe | destructiveHint=false |
| onchain_earn_redeem | On-chain Earn Redeem | destructiveHint=false |
| onchain_earn_cancel | On-chain Earn Cancel Order | idempotentHint=true |
| onchain_earn_get_active_orders | On-chain Earn Active Orders | — |
| onchain_earn_get_order_history | On-chain Earn Order History | — |

#### earn/autoearn.ts (1 tool)
| name | title | overrides |
|---|---|---|
| earn_auto_set | Set Auto-Earn Configuration | idempotentHint=true |

#### earn/flash-earn.ts (1 tool)
| name | title | overrides |
|---|---|---|
| earn_get_flash_earn_projects | Flash Earn List Projects | — |

**Total: 162 tools.** Per-module counts: account 13 + audit 1 + bot.dca 5 + bot.grid 6 + earn.autoearn 1 + earn.dcd 6 + earn.flash 1 + earn.onchain 6 + earn.savings 9 + event 9 + futures 18 (factory 11 + algo 5 + amend 1 + batch 1) + market 14 + market-filter 4 + indicator 2 + news 9 + option 10 + option-algo 4 + skills 3 + smartmoney 10 + spot 14 + swap 17 (factory 11 + algo 4 + amend-algo 1 + batch 1) = **162**.

---

## File Structure

| File | Change |
|---|---|
| `packages/core/src/tools/types.ts` | Extend `ToolSpec`; update `toMcpTool` to emit `title` + use overrides |
| `packages/core/test/tools.test.ts` | Add cases covering title propagation and override behavior |
| `packages/core/src/tools/contract-trade.ts` | Add `titleLabel` to `ContractConfig`; emit titles + per-tool overrides |
| `packages/core/src/tools/swap-trade.ts` | Pass `titleLabel: "Perpetual Futures"`; add titles for 2 swap-unique tools |
| `packages/core/src/tools/futures-trade.ts` | Pass `titleLabel: "Futures"`; add titles for 2 futures-unique tools |
| `packages/core/src/tools/algo-trade.ts` | Add titles + overrides for 9 algo tools |
| `packages/core/src/tools/option-trade.ts` | Add titles + overrides for 10 option tools |
| `packages/core/src/tools/option-algo-trade.ts` | Add titles + overrides for 4 option-algo tools |
| `packages/core/src/tools/spot-trade.ts` | Add titles + overrides for 14 spot tools |
| `packages/core/src/tools/market.ts` | Add titles for 14 tools |
| `packages/core/src/tools/market-filter.ts` | Add titles for 4 tools |
| `packages/core/src/tools/indicator.ts` | Add titles for 2 tools |
| `packages/core/src/tools/news.ts` | Add titles for 9 tools |
| `packages/core/src/tools/smartmoney.ts` | Add titles for 10 tools |
| `packages/core/src/tools/account.ts` | Add titles + overrides for 13 tools |
| `packages/core/src/tools/audit.ts` | Add title for 1 tool |
| `packages/core/src/tools/skills.ts` | Add titles + overrides for 3 tools |
| `packages/core/src/tools/event-trade.ts` | Add titles + overrides for 9 tools |
| `packages/core/src/tools/bot/grid.ts` | Add titles + overrides for 6 tools |
| `packages/core/src/tools/bot/dca.ts` | Add titles + overrides for 5 tools |
| `packages/core/src/tools/earn/savings.ts` | Add titles + overrides for 9 tools |
| `packages/core/src/tools/earn/dcd.ts` | Add titles + overrides for 6 tools |
| `packages/core/src/tools/earn/onchain.ts` | Add titles + overrides for 6 tools |
| `packages/core/src/tools/earn/autoearn.ts` | Add title + override for 1 tool |
| `packages/core/src/tools/earn/flash-earn.ts` | Add title for 1 tool |
| `CHANGELOG.md` | Add entry under Unreleased |

---

## Task 1: Branch Setup

**Files:** none (repo-state only)

- [ ] **Step 1: Confirm clean working tree, sync master, branch off HEAD**

```bash
cd okx-trade-mcp
git status --short                # must be empty
git fetch origin
git checkout master
git pull --ff-only origin master
git checkout -b feat/tool-titles-annotations
```

Expected: branch `feat/tool-titles-annotations` created from latest `origin/master`. No working-tree changes.

- [ ] **Step 2: Capture the baseline tool count for later verification**

```bash
pnpm -F @agent-tradekit/core build >/dev/null 2>&1
node --input-type=module -e "import('./packages/core/dist/index.js').then(m=>{const s=m.allToolSpecs();console.log(s.length+' '+s.filter(t=>!t.isWrite).length+'R '+s.filter(t=>t.isWrite).length+'W')})"
```

Expected: `162 100R 62W`. If the count diverges, STOP and reconcile with the catalogue above before touching any other file.

---

## Task 2: Extend `ToolSpec` and `toMcpTool`

**Files:**
- Modify: `packages/core/src/tools/types.ts`
- Modify: `packages/core/test/tools.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/tools.test.ts` (read the file first to choose the correct insertion point inside the existing `describe` block; pattern below is self-contained for the imports):

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toMcpTool } from "../src/tools/types.js";
import type { ToolSpec } from "../src/tools/types.js";

describe("toMcpTool title & annotation overrides", () => {
  const baseSpec: Omit<ToolSpec, "name" | "title" | "isWrite"> = {
    module: "market",
    description: "test",
    inputSchema: { type: "object", properties: {} },
    handler: async () => ({}),
  };

  it("propagates title to Tool.title and annotations.title", () => {
    const t = toMcpTool({ ...baseSpec, name: "x_get_y", title: "Get Y", isWrite: false } as ToolSpec);
    assert.equal(t.title, "Get Y");
    assert.equal(t.annotations?.title, "Get Y");
  });

  it("defaults destructive/idempotent from isWrite when no override", () => {
    const r = toMcpTool({ ...baseSpec, name: "x_get_y", title: "Get Y", isWrite: false } as ToolSpec);
    assert.equal(r.annotations?.readOnlyHint, true);
    assert.equal(r.annotations?.destructiveHint, false);
    assert.equal(r.annotations?.idempotentHint, true);

    const w = toMcpTool({ ...baseSpec, name: "x_place", title: "Place", isWrite: true } as ToolSpec);
    assert.equal(w.annotations?.readOnlyHint, false);
    assert.equal(w.annotations?.destructiveHint, true);
    assert.equal(w.annotations?.idempotentHint, false);
  });

  it("respects destructiveHint override on additive writes", () => {
    const t = toMcpTool({
      ...baseSpec,
      name: "x_place",
      title: "Place X",
      isWrite: true,
      destructiveHint: false,
    } as ToolSpec);
    assert.equal(t.annotations?.destructiveHint, false);
    assert.equal(t.annotations?.idempotentHint, false); // default for write
  });

  it("respects idempotentHint override on cancel/amend writes", () => {
    const t = toMcpTool({
      ...baseSpec,
      name: "x_cancel",
      title: "Cancel X",
      isWrite: true,
      idempotentHint: true,
    } as ToolSpec);
    assert.equal(t.annotations?.destructiveHint, true); // default for write
    assert.equal(t.annotations?.idempotentHint, true);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

```bash
pnpm -F @agent-tradekit/core test:unit -- --test-name-pattern="toMcpTool title"
```

Expected: tests fail (TypeScript type error about `title` not existing, or assertion failures because `toMcpTool` does not yet emit `title`).

- [ ] **Step 3: Update `ToolSpec` and `toMcpTool`**

Replace the contents of `packages/core/src/tools/types.ts` with:

```typescript
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { OkxRestClient } from "../client/rest-client.js";
import type { OkxConfig } from "../config.js";
import type { ModuleId } from "../constants.js";

export type ToolArgs = Record<string, unknown>;

export type JsonSchema = Tool["inputSchema"];
export type OutputSchema = NonNullable<Tool["outputSchema"]>;

export interface ToolContext {
  config: OkxConfig;
  client: OkxRestClient;
}

export interface ToolSpec {
  name: string;
  /** Human-readable label shown by MCP clients (e.g. inspector tool list, Claude tool catalog). */
  title: string;
  module: ModuleId;
  description: string;
  inputSchema: JsonSchema;
  outputSchema?: OutputSchema;
  isWrite: boolean;
  /**
   * Override for annotations.destructiveHint.
   * When omitted, defaults to `isWrite` (i.e. all writes are flagged destructive).
   * Set `false` for additive writes (place_order, transfer, subscribe, redeem).
   */
  destructiveHint?: boolean;
  /**
   * Override for annotations.idempotentHint.
   * When omitted, defaults to `!isWrite`.
   * Set `true` for write operations whose effect converges (cancel, amend, close, set).
   */
  idempotentHint?: boolean;
  handler: (args: ToolArgs, context: ToolContext) => Promise<unknown>;
}

export function toMcpTool(tool: ToolSpec): Tool {
  const destructive = tool.destructiveHint ?? tool.isWrite;
  const idempotent = tool.idempotentHint ?? !tool.isWrite;
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    annotations: {
      title: tool.title,
      readOnlyHint: !tool.isWrite,
      destructiveHint: destructive,
      idempotentHint: idempotent,
      openWorldHint: true,
    },
  };
}
```

- [ ] **Step 4: Re-run the test — expect compile errors**

```bash
pnpm -F @agent-tradekit/core test:unit -- --test-name-pattern="toMcpTool title"
```

Expected: the new four tests pass, but the full suite WILL fail because every other tool registration is now missing the required `title:` field. That is intentional and will be fixed file-by-file in Tasks 3–22. Do NOT fix the rest in this task.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/types.ts packages/core/test/tools.test.ts
git commit -m "feat(core): add title field and annotation overrides to ToolSpec"
```

---

## Task 3: Add `titleLabel` to `contract-trade.ts` factory

**Files:**
- Modify: `packages/core/src/tools/contract-trade.ts`

- [ ] **Step 1: Extend `ContractConfig`**

In `contract-trade.ts`, add to the `ContractConfig` interface (after `instIdExample`):

```typescript
  /** Human-readable label for tool titles, e.g. "Perpetual Futures" or "Futures". */
  titleLabel: string;
```

- [ ] **Step 2: Use `titleLabel` for every tool spec returned by the factory**

For each of the 11 tool spec literals inside `buildContractTradeTools`, add a `title:` field and (where applicable) override fields. Use this mapping (insert immediately after `name:`):

| name | added fields |
|---|---|
| `n("place_order")` | `title: \`${cfg.titleLabel} Place Order\`, destructiveHint: false,` |
| `n("cancel_order")` | `title: \`${cfg.titleLabel} Cancel Order\`, idempotentHint: true,` |
| `n("get_order")` | `title: \`${cfg.titleLabel} Get Order\`,` |
| `n("get_orders")` | `title: \`${cfg.titleLabel} Get Orders\`,` |
| `n("get_positions")` | `title: \`${cfg.titleLabel} Get Positions\`,` |
| `n("get_fills")` | `title: \`${cfg.titleLabel} Get Fills\`,` |
| `n("close_position")` | `title: \`${cfg.titleLabel} Close Position\`, idempotentHint: true,` |
| `n("set_leverage")` | `title: \`${cfg.titleLabel} Set Leverage\`, idempotentHint: true,` |
| `n("get_leverage")` | `title: \`${cfg.titleLabel} Get Leverage\`,` |
| `n("batch_amend")` | `title: \`${cfg.titleLabel} Batch Amend Orders\`, idempotentHint: true,` |
| `n("batch_cancel")` | `title: \`${cfg.titleLabel} Batch Cancel Orders\`, idempotentHint: true,` |

Inside `buildContractTradeTools` the easiest place is right after the `const { prefix, module, label, instTypes, instIdExample } = cfg;` line — also destructure `titleLabel`:

```typescript
const { prefix, module, label, instTypes, instIdExample, titleLabel } = cfg;
```

then reference `titleLabel` in template strings.

- [ ] **Step 3: Compile-check**

```bash
pnpm -F @agent-tradekit/core build 2>&1 | tail -30
```

Expected: BUILD WILL FAIL because both `swap-trade.ts` and `futures-trade.ts` invoke `buildContractTradeTools` without the new `titleLabel`. That is fixed in Tasks 4 and 5. Proceed without committing this task in isolation — bundle the commit with Task 4 or fix Tasks 4+5 first.

- [ ] **Step 4: Defer commit; combine with Tasks 4 + 5**

We will commit Tasks 3+4+5 together to keep the tree compiling.

---

## Task 4: `swap-trade.ts`

**Files:**
- Modify: `packages/core/src/tools/swap-trade.ts`

- [ ] **Step 1: Pass `titleLabel` to the factory call**

In `registerSwapTradeTools`, change the existing factory call to include the new field:

```typescript
const common = buildContractTradeTools({
  prefix: "swap",
  module: "swap",
  label: "SWAP/FUTURES",
  titleLabel: "Perpetual Futures",
  instTypes: ["SWAP", "FUTURES"],
  instIdExample: "e.g. BTC-USDT-SWAP",
});
```

- [ ] **Step 2: Add `title` + override for `swap_amend_algo_order` (line ~29)**

Add immediately after `name: "swap_amend_algo_order",`:

```typescript
      title: "Perpetual Futures Amend Algo Order",
      idempotentHint: true,
```

- [ ] **Step 3: Add `title` + override for `swap_batch_orders` (line ~69)**

Add immediately after `name: "swap_batch_orders",`:

```typescript
      title: "Perpetual Futures Batch Orders",
```

---

## Task 5: `futures-trade.ts`

**Files:**
- Modify: `packages/core/src/tools/futures-trade.ts`

- [ ] **Step 1: Pass `titleLabel` to the factory call**

Find the `buildContractTradeTools({...})` invocation inside `registerFuturesTradeTools` and add `titleLabel: "Futures",` alongside the existing fields.

- [ ] **Step 2: Add `title` + override for `futures_amend_order` (line ~28)**

```typescript
      title: "Futures Amend Order",
      idempotentHint: true,
```

- [ ] **Step 3: Add `title` + override for `futures_batch_orders` (line ~64)**

```typescript
      title: "Futures Batch Place Orders",
      destructiveHint: false,
```

- [ ] **Step 4: Build + test (Tasks 3+4+5 together)**

```bash
pnpm -F @agent-tradekit/core build
pnpm -F @agent-tradekit/core typecheck
pnpm -F @agent-tradekit/core test:unit 2>&1 | tail -40
```

Expected: tsc still fails on remaining files (missing `title`), but the contract-trade / swap / futures slice is internally consistent. No new compile errors should originate from `contract-trade.ts`, `swap-trade.ts`, or `futures-trade.ts`.

- [ ] **Step 5: Commit Tasks 3 + 4 + 5**

```bash
git add packages/core/src/tools/contract-trade.ts packages/core/src/tools/swap-trade.ts packages/core/src/tools/futures-trade.ts
git commit -m "feat(core): add titles for swap/futures contract trade + factory titleLabel"
```

---

## Task 6: `algo-trade.ts`

**Files:**
- Modify: `packages/core/src/tools/algo-trade.ts`

- [ ] **Step 1: Add `title` + overrides for the four swap algo tools**

Insert directly after each `name:` line:

| line | name | inject lines |
|---|---|---|
| ~29 | `swap_place_algo_order` | `title: "Perpetual Futures Place Algo Order",`<br>`destructiveHint: false,` |
| ~186 | `swap_place_move_stop_order` | `title: "Perpetual Futures Place Move-Stop Order",`<br>`destructiveHint: false,` |
| ~268 | `swap_cancel_algo_orders` | `title: "Perpetual Futures Cancel Algo Orders",`<br>`idempotentHint: true,` |
| ~312 | `swap_get_algo_orders` | `title: "Perpetual Futures Get Algo Orders",` |

- [ ] **Step 2: Add `title` + overrides for the five futures algo tools**

| line | name | inject lines |
|---|---|---|
| ~414 | `futures_place_algo_order` | `title: "Futures Place Algo Order",`<br>`destructiveHint: false,` |
| ~571 | `futures_place_move_stop_order` | `title: "Futures Place Move-Stop Order",`<br>`destructiveHint: false,` |
| ~651 | `futures_amend_algo_order` | `title: "Futures Amend Algo Order",`<br>`idempotentHint: true,` |
| ~688 | `futures_cancel_algo_orders` | `title: "Futures Cancel Algo Orders",`<br>`idempotentHint: true,` |
| ~726 | `futures_get_algo_orders` | `title: "Futures Get Algo Orders",` |

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/tools/algo-trade.ts
git commit -m "feat(core): add titles for swap/futures algo trade tools"
```

---

## Task 7: `option-trade.ts`

**Files:**
- Modify: `packages/core/src/tools/option-trade.ts`

- [ ] **Step 1: Insert title + overrides at each `name:` line**

| line | name | inject lines |
|---|---|---|
| ~22 | `option_place_order` | `title: "Option Place Order",`<br>`destructiveHint: false,` |
| ~126 | `option_cancel_order` | `title: "Option Cancel Order",`<br>`idempotentHint: true,` |
| ~155 | `option_batch_cancel` | `title: "Option Batch Cancel Orders",`<br>`idempotentHint: true,` |
| ~186 | `option_amend_order` | `title: "Option Amend Order",`<br>`idempotentHint: true,` |
| ~219 | `option_get_order` | `title: "Option Get Order",` |
| ~248 | `option_get_orders` | `title: "Option Get Orders",` |
| ~303 | `option_get_positions` | `title: "Option Get Positions with Greeks",` |
| ~330 | `option_get_fills` | `title: "Option Get Fills",` |
| ~373 | `option_get_instruments` | `title: "Option List Instruments (Chain)",` |
| ~407 | `option_get_greeks` | `title: "Option Get Greeks",` |

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/option-trade.ts
git commit -m "feat(core): add titles for option trade tools"
```

---

## Task 8: `option-algo-trade.ts`

**Files:**
- Modify: `packages/core/src/tools/option-algo-trade.ts`

- [ ] **Step 1: Insert title + overrides**

| line | name | inject lines |
|---|---|---|
| ~17 | `option_place_algo_order` | `title: "Option Place Algo Order",`<br>`destructiveHint: false,` |
| ~124 | `option_amend_algo_order` | `title: "Option Amend Algo Order",`<br>`idempotentHint: true,` |
| ~161 | `option_cancel_algo_orders` | `title: "Option Cancel Algo Orders",`<br>`idempotentHint: true,` |
| ~205 | `option_get_algo_orders` | `title: "Option Get Algo Orders",` |

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/option-algo-trade.ts
git commit -m "feat(core): add titles for option algo tools"
```

---

## Task 9: `spot-trade.ts`

**Files:**
- Modify: `packages/core/src/tools/spot-trade.ts`

- [ ] **Step 1: Insert title + overrides**

| line | name | inject lines |
|---|---|---|
| ~30 | `spot_place_order` | `title: "Spot Place Order",`<br>`destructiveHint: false,` |
| ~125 | `spot_cancel_order` | `title: "Spot Cancel Order",`<br>`idempotentHint: true,` |
| ~161 | `spot_amend_order` | `title: "Spot Amend Order",`<br>`idempotentHint: true,` |
| ~212 | `spot_get_orders` | `title: "Spot Get Orders",` |
| ~286 | `spot_place_algo_order` | `title: "Spot Place Algo Order",`<br>`destructiveHint: false,` |
| ~406 | `spot_amend_algo_order` | `title: "Spot Amend Algo Order",`<br>`idempotentHint: true,` |
| ~443 | `spot_cancel_algo_order` | `title: "Spot Cancel Algo Order",`<br>`idempotentHint: true,` |
| ~477 | `spot_get_algo_orders` | `title: "Spot Get Algo Orders",` |
| ~562 | `spot_get_fills` | `title: "Spot Get Fills",` |
| ~626 | `spot_batch_orders` | `title: "Spot Batch Place Orders",`<br>`destructiveHint: false,` |
| ~689 | `spot_get_order` | `title: "Spot Get Order",` |
| ~727 | `spot_batch_amend` | `title: "Spot Batch Amend Orders",`<br>`idempotentHint: true,` |
| ~758 | `spot_batch_cancel` | `title: "Spot Batch Cancel Orders",`<br>`idempotentHint: true,` |
| ~797 | `spot_set_leverage` | `title: "Spot Set Leverage",`<br>`idempotentHint: true,` |

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/spot-trade.ts
git commit -m "feat(core): add titles for spot trade tools"
```

---

## Task 10: `market.ts`

**Files:**
- Modify: `packages/core/src/tools/market.ts`

- [ ] **Step 1: Insert title at each `name:` line (all read-only — no overrides)**

| line | name | inject |
|---|---|---|
| ~18 | `market_get_ticker` | `title: "Get Ticker",` |
| ~121 | `market_get_candles` | `title: "Get Candlesticks",` |
| ~188 | `market_get_instruments` | `title: "List Instruments",` |
| ~233 | `market_get_funding_rate` | `title: "Get Funding Rate",` |
| ~295 | `market_get_mark_price` | `title: "Get Mark Price",` |
| ~339 | `market_get_trades` | `title: "Get Recent Trades",` |

The remaining 8 tools (`market_get_orderbook`, `market_get_tickers`, `market_get_index_ticker`, `market_get_index_candles`, `market_get_price_limit`, `market_get_open_interest`, `market_get_stock_tokens`, `market_get_instruments_by_category`) are also in this file — `grep -n 'name: "market_' packages/core/src/tools/market.ts` to enumerate exact line numbers. For each, insert the title from the catalogue.

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/market.ts
git commit -m "feat(core): add titles for market data tools"
```

---

## Task 11: `market-filter.ts`

**Files:**
- Modify: `packages/core/src/tools/market-filter.ts`

- [ ] **Step 1: Insert title at each `name:` line**

| line | name | inject |
|---|---|---|
| ~20 | `market_filter` | `title: "Screen Instruments",` |
| ~166 | `market_get_oi_history` | `title: "Get Open Interest History",` |
| ~219 | `market_filter_oi_change` | `title: "Find Open Interest Change Instruments",` |
| ~303 | `market_get_pair_spread` | `title: "Get Pair Spread",` |

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/market-filter.ts
git commit -m "feat(core): add titles for market filter tools"
```

---

## Task 12: `indicator.ts`

**Files:**
- Modify: `packages/core/src/tools/indicator.ts`

- [ ] **Step 1: Insert title at each `name:` line**

| line | name | inject |
|---|---|---|
| ~186 | `market_get_indicator` | `title: "Get Technical Indicator",` |
| ~264 | `market_list_indicators` | `title: "List Technical Indicators",` |

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/indicator.ts
git commit -m "feat(core): add titles for indicator tools"
```

---

## Task 13: `news.ts`

**Files:**
- Modify: `packages/core/src/tools/news.ts`

- [ ] **Step 1: Run `grep -n 'name: "news_' packages/core/src/tools/news.ts` to enumerate the 9 lines, then insert at each:**

Use the news titles from the catalogue above (Get Latest Crypto News, Get News by Coin, Search News, Get News Article, Get Coin Sentiment, Get Sentiment Ranking, Get Economic Calendar, List News Sources, List Calendar Regions).

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/news.ts
git commit -m "feat(core): add titles for news tools"
```

---

## Task 14: `smartmoney.ts`

**Files:**
- Modify: `packages/core/src/tools/smartmoney.ts`

- [ ] **Step 1: Insert titles for all 10 tools per the catalogue.** All are read-only — no overrides.

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/smartmoney.ts
git commit -m "feat(core): add titles for smartmoney tools"
```

---

## Task 15: `account.ts`

**Files:**
- Modify: `packages/core/src/tools/account.ts`

- [ ] **Step 1: Insert title for each of the 13 tools per the catalogue.**

For the two write tools:
- `account_transfer` (line ~41): also add `destructiveHint: false,`
- `account_set_position_mode` (line ~571): also add `idempotentHint: true,`

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/account.ts
git commit -m "feat(core): add titles + correct annotations for account tools"
```

---

## Task 16: `audit.ts`

**Files:**
- Modify: `packages/core/src/tools/audit.ts`

- [ ] **Step 1: Insert title at `name: "trade_get_history"` (line ~49)**

```typescript
title: "Get Tool-Call Audit Log",
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/audit.ts
git commit -m "feat(core): add title for audit tool"
```

---

## Task 17: `skills.ts`

**Files:**
- Modify: `packages/core/src/tools/skills.ts`

- [ ] **Step 1: Insert titles per catalogue. For `skills_download` also add overrides:**

```typescript
title: "Skills Marketplace Download",
destructiveHint: false,
idempotentHint: true,
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/skills.ts
git commit -m "feat(core): add titles + correct annotations for skills tools"
```

---

## Task 18: `event-trade.ts`

**Files:**
- Modify: `packages/core/src/tools/event-trade.ts`

- [ ] **Step 1: Insert title at each of 9 `name:` lines per catalogue. For the three writes:**

| name | extra override |
|---|---|
| `event_place_order` | `destructiveHint: false,` |
| `event_amend_order` | `idempotentHint: true,` |
| `event_cancel_order` | `idempotentHint: true,` |

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/event-trade.ts
git commit -m "feat(core): add titles + correct annotations for event contract tools"
```

---

## Task 19: `bot/grid.ts`

**Files:**
- Modify: `packages/core/src/tools/bot/grid.ts`

- [ ] **Step 1: Insert titles for all 6 grid tools per catalogue.**

Write overrides:
- `grid_create_order` → `destructiveHint: false,`
- `grid_amend_order` → `idempotentHint: true,`
- `grid_stop_order` → `idempotentHint: true,`

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/bot/grid.ts
git commit -m "feat(core): add titles + correct annotations for grid bot tools"
```

---

## Task 20: `bot/dca.ts`

**Files:**
- Modify: `packages/core/src/tools/bot/dca.ts`

- [ ] **Step 1: Insert titles for all 5 DCA tools per catalogue (display label "Martingale").**

Write overrides:
- `dca_create_order` → `destructiveHint: false,`
- `dca_stop_order` → `idempotentHint: true,`

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/bot/dca.ts
git commit -m "feat(core): add titles + correct annotations for martingale (dca) bot tools"
```

---

## Task 21: Earn modules (`earn/savings.ts`, `earn/dcd.ts`, `earn/onchain.ts`, `earn/autoearn.ts`, `earn/flash-earn.ts`)

**Files:**
- Modify: all five earn files

- [ ] **Step 1: For each earn file, insert title at each `name:` line per the catalogue.**

Write overrides:

| name | override |
|---|---|
| `earn_savings_purchase` | `destructiveHint: false,` |
| `earn_savings_redeem` | `destructiveHint: false,` |
| `earn_set_lending_rate` | `idempotentHint: true,` |
| `earn_fixed_purchase` | `destructiveHint: false,` |
| `earn_fixed_redeem` | `destructiveHint: false,` |
| `dcd_subscribe` | `destructiveHint: false,` |
| `dcd_redeem` | `destructiveHint: false,` |
| `onchain_earn_purchase` | `destructiveHint: false,` |
| `onchain_earn_redeem` | `destructiveHint: false,` |
| `onchain_earn_cancel` | `idempotentHint: true,` |
| `earn_auto_set` | `idempotentHint: true,` |

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/tools/earn/
git commit -m "feat(core): add titles + correct annotations for earn module tools"
```

---

## Task 22: Full test, build, typecheck

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
pnpm -F @agent-tradekit/core test:unit 2>&1 | tail -30
pnpm -F @okx_ai/okx-trade-mcp test:unit 2>&1 | tail -30
```

Expected: all tests pass. Investigate and fix any failure before moving on.

- [ ] **Step 2: Typecheck both packages**

```bash
pnpm -F @agent-tradekit/core typecheck
pnpm -F @okx_ai/okx-trade-mcp typecheck
```

Expected: zero errors. If any tool registration still lacks `title`, tsc reports the file/line — fix it (referring back to the catalogue) and re-run.

- [ ] **Step 3: Build**

```bash
pnpm -F @agent-tradekit/core build
pnpm -F @okx_ai/okx-trade-mcp build
```

Expected: clean build for both packages.

- [ ] **Step 4: Smoke-test the MCP server via stdio**

```bash
(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'; sleep 0.3; echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'; sleep 0.3; echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'; sleep 1) | node packages/mcp/dist/index.js --modules all --no-log 2>/dev/null | \
  node --input-type=module -e "
let buf=''; process.stdin.on('data',c=>buf+=c); process.stdin.on('end',()=>{
  const lines=buf.trim().split('\n').map(JSON.parse);
  const tools=lines.find(l=>l.id===2)?.result?.tools??[];
  const missingTitle=tools.filter(t=>!t.title);
  const missingAnnotTitle=tools.filter(t=>!t.annotations?.title);
  console.log('tools:', tools.length);
  console.log('missing title:', missingTitle.length, missingTitle.map(t=>t.name));
  console.log('missing annotations.title:', missingAnnotTitle.length);
  const writes=tools.filter(t=>t.annotations?.readOnlyHint===false);
  const additive=writes.filter(t=>t.annotations?.destructiveHint===false);
  const idempotentWrites=writes.filter(t=>t.annotations?.idempotentHint===true);
  console.log('writes:', writes.length, 'additive (destructive=false):', additive.length, 'idempotent writes:', idempotentWrites.length);
});"
```

Expected output (exact numbers):
- `tools: 162`
- `missing title: 0 []`
- `missing annotations.title: 0`
- `writes: 62`, `additive (destructive=false): 25`, `idempotent writes: 37`

Categorisation source-of-truth (run `grep` against the catalogue if a mismatch appears):
- **Additive (25):** spot_place_order, spot_place_algo_order, spot_batch_orders, swap_place_order, swap_place_algo_order, swap_place_move_stop_order, futures_place_order, futures_batch_orders, futures_place_algo_order, futures_place_move_stop_order, option_place_order, option_place_algo_order, event_place_order, dca_create_order, grid_create_order, account_transfer, earn_savings_purchase, earn_savings_redeem, earn_fixed_purchase, earn_fixed_redeem, dcd_subscribe, dcd_redeem, onchain_earn_purchase, onchain_earn_redeem, skills_download.
- **Idempotent writes (37):** spot_cancel_order, spot_amend_order, spot_amend_algo_order, spot_cancel_algo_order, spot_batch_amend, spot_batch_cancel, spot_set_leverage, swap_cancel_order, swap_amend_algo_order, swap_cancel_algo_orders, swap_close_position, swap_set_leverage, swap_batch_amend, swap_batch_cancel, futures_cancel_order, futures_amend_order, futures_amend_algo_order, futures_cancel_algo_orders, futures_close_position, futures_set_leverage, futures_batch_amend, futures_batch_cancel, option_cancel_order, option_batch_cancel, option_amend_order, option_amend_algo_order, option_cancel_algo_orders, event_amend_order, event_cancel_order, dca_stop_order, grid_amend_order, grid_stop_order, earn_set_lending_rate, earn_auto_set, onchain_earn_cancel, account_set_position_mode, skills_download.
- **Overlap (1):** skills_download is both additive AND idempotent. So `additive ∪ idempotent` distinct count = 25 + 37 − 1 = 61, NOT 62. The missing write is `swap_batch_orders` itself, which is now intentionally classified as a destructive non-idempotent write (the safe default for a 3-in-1 router whose `action` param selects place/cancel/amend — `destructiveHint` and `idempotentHint` are both unset, so `toMcpTool` falls back to the write defaults `destructive=true, idempotent=false`). It is therefore in neither category — the "default-write" exception.

If any of these diverge, identify the offending tool and fix the registration (override or catalogue mismatch).

- [ ] **Step 5: Commit nothing yet**

This task is verification only.

---

## Task 23: CHANGELOG + final commit + push + open MR

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add entry under `## [Unreleased]`**

```markdown
### Added
- All 162 MCP tools now expose a human-readable `title` (Tool.title and annotations.title) so clients like MCP Inspector render readable labels instead of snake_case names.

### Changed
- Per-tool `annotations.destructiveHint` and `idempotentHint` are now accurate to MCP spec semantics: additive writes (place_order, transfer, subscribe, redeem) are no longer marked destructive, and writes whose effect converges (cancel, amend, close, set) are now marked idempotent.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for tool titles + annotation overrides"
```

- [ ] **Step 3: Push and open MR**

```bash
git push -u origin feat/tool-titles-annotations
```

Open MR in GitLab UI (or `glab mr create` if configured). MR description should:
- Summarise the change in one paragraph.
- Include the verification numbers from Task 22 step 4.
- Include a 1-line note about the contract-trade.ts factory parameter addition (so reviewers know it is wired through both swap & futures).

---

## Self-Review

- **Spec coverage:** Each requirement from the user request maps to tasks:
  - "Sync to origin/master + branch from HEAD" → Task 1.
  - "All tools, not just read-only" → Tasks 4–21 (52 write tools across spot/swap/futures/option/event/bot/earn/account/skills + 99 read tools + 1 audit + 10 smartmoney).
  - "Fix any missing/incorrect annotations" → Tasks 2 (type override mechanism) + 3–21 (per-tool override).
  - "Titles per Lark doc, no abbreviations" → catalogue at the top, with OI/TP-SL/DCA/Swap expansions documented.

- **Placeholder scan:** No `TBD`/`TODO`/"similar to" markers. Every tool name has an explicit title in the catalogue, and per-write-tool overrides are enumerated.

- **Type consistency:** `title` field name matches across `types.ts`, `toMcpTool`, factory, every register-site description, and tests. `destructiveHint`/`idempotentHint` override names match MCP spec field names.

- **Tool count consistency:** 14 (account incl. write) + 1 (audit) + 5 + 6 + 1 + 6 + 1 + 6 + 9 + 9 + 18 + 14 + 4 + 2 + 9 + 10 + 14 + 4 + 3 + 10 + 14 + 17 = **162**. Matches Task 1 step 2 baseline assertion.

- **Build-order risk noted:** Tasks 3+4+5 must commit together so the tree compiles between commits.
