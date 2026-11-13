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
| 3 | `smart_portfolio_get_order_details` | GET | `/orders-algo-details` | false |
| 4 | `smart_portfolio_stop_order` | POST | `/stop-order-algo` | true |
| 5 | `smart_portfolio_amend_rebalance` | POST | `/amend-rebalance` | true |
| 6 | `smart_portfolio_instant_rebalance` | POST | `/instant-rebalance` | true |
| 7 | `smart_portfolio_get_recommend_zones` | GET | `/recommend-zones` | false |
| 8 | `smart_portfolio_get_zones_backtest` | GET | `/zones-backtest` | false |
| 9 | `smart_portfolio_manual_pause` | POST | `/manual-pause` | true |
| 10 | `smart_portfolio_manual_resume` | POST | `/manual-resume` | true |
| 11 | `smart_portfolio_add_investment` | POST | `/add-investment` | true |
| 12 | `smart_portfolio_edit_portfolio` | POST | `/edit-portfolio` | true |

## Key Implementation Constraints

| Constraint | Implementation |
|---|---|
| `investmentCcy` (create and query) ≠ `tradeQuoteCcy` (debit / settlement) ≠ `quoteCcy` (recommend) | Distinct field names; no shared normalizer. Query tool descriptions say `investmentCcy`; `investCcy` is not a field of this API |
| `portfolioList[].ccy`: server doesn't trim/uppercase | Handler: `ccy.trim().toUpperCase()` before dedup check |
| `deltaRatio` truncation: toward zero to two decimals, result `∈ [0.01, 1)` | `normalizeDeltaRatio()` in `smart-portfolio-validation.ts`, used by tools 1 & 5. Works on the raw string with exact decimal arithmetic (`smart-portfolio-decimal.ts`) — never `Number`, so `0.29` stays `0.29` |
| `portfolioList` weights | Each a positive exact decimal, 2–10 unique coins, sum **exactly** 1 (the old 0.0001 float tolerance is gone). Null / non-object elements raise `ValidationError`. Weights are never rescaled or normalised |
| Tools 2/3/4: no `balType` in response | No attempt to read `balType` |
| Tool 5 response: no `clOrdId` | Separate `normalizeWriteStop` (pass-through) vs `normalizeWriteCreate` (sCode check) for tool 1 |
| Tool 6: `data: []` always | Only check outer `code` via `normalizeResponse()`; never call the sCode-checking normalizer |
| Tool 6: `triggered` is Boolean | Pass through as-is. `true` = the rebalance flow started, **not** that trades executed; `false` = no trade flow started this time, **not** "already balanced" |
| Tool 7: strip `profitHistory` | Client-side: delete `item.defaultBacktestYield.profitHistory` |
| Tools 2+3: no `algoOrdType` | Not in inputSchema; not sent in request |
| Tool 2: no `instType` | Not in inputSchema; not sent |
| Tool 3: `instType` valid | Included in inputSchema |

## Operation tools (tools 9–12)

`POST` with `code=0, msg="", data=[]` on success (no `data[0]`, no `sCode`), so they use `normalizeResponse()`; the REST client already raises `OkxApiError` (code / msg / endpoint kept) for any non-zero code. Success means **accepted** — not new state in effect, not funds arrived, not trades filled. Implementation lives in `smart-portfolio-operations.ts`; validation in `smart-portfolio-validation.ts`.

| Tool | Body | Notes |
|---|---|---|
| `smart_portfolio_manual_pause` / `_manual_resume` | `{algoId}` | no other field is ever sent |
| `smart_portfolio_add_investment` | `{algoId, addInvest, tradeQuoteCcy?}` | `addInvest` must be a positive exact decimal, validated before any request |
| `smart_portfolio_edit_portfolio` | `{algoId, portfolioList, addInvest?, tradeQuoteCcy?}` | `portfolioList` is the complete new target (real JSON array; MCP takes it as a JSON string like create). Missing / null / blank / zero `addInvest` = no top-up → neither `addInvest` nor `tradeQuoteCcy` is sent. A positive `addInvest` is always kept, even if the currency is blank |

- **`tradeQuoteCcy`** is only normalised by this MCP/CLI layer: trimmed, case preserved (no upper-casing); missing / null / blank → omitted so the backend resolves the bot's own settlement currency (backend MR !3272, treated as deployed — older backends that require the currency are not supported); a non-empty value is passed on and the backend must match it exactly (mismatch → `51000`). The backend itself does not trim a non-empty value. No automatic currency switching or retry.
- **No retries**: `privatePost` is called without `retryOnNetworkError` (a top-up/edit is not idempotent, and an uncertain write result must not be repeated blindly).
- **Rate limit**: the usual module default (`privateRateLimit(name, 20)`), a client-side throttle only — *not* a verified server-side quota. The official per-endpoint numbers are still to be confirmed.
- **Errors** come from the backend unchanged: `50014 / 51000 / 51059 / 51293` (all), `51318 / 51360 / 51361` (add-investment, edit-portfolio), `51320` (edit-portfolio only; weight range / sum — never rewritten to 51318 or 51361).
- **Not covered** (non-goals): cumulative top-up field, quota query, per-top-up status, automatic transfers, PriAPI.

## CLI

`okx bot smart-portfolio manual-pause|manual-resume|add-investment|edit-portfolio` (`handleBotSmartPortfolioCommand` → `cmdSmartPortfolio*` in `commands/bot.ts`; empty `data=[]` prints "request accepted" and never goes through `emitWriteResult`).

`bot recurring <action>` and `bot smart-portfolio <action>` additionally validate options per full action (`packages/cli/src/command-options.ts`): an action only accepts the options it reads plus the global ones (`--profile --demo --live --site --json --env --verbose --help --version`); anything else fails with `Unknown option` (exit 1) before any request, `--no-<flag>` is only honoured for a boolean that action has, and negative amounts (`--addInvest -5`, `--timeZone -5`) reach validation. `--aiBuilderCode` is limited to the two `create` actions; no aliases were added (`--amt`/`--amount` stay only on `recurring amend-amount` / `add-investment`; `recurring create` takes `--amt`). Every other CLI command keeps the shared option table — this is a scoped fix, not a CLI-wide one. `test/command-options.test.ts` keeps the table in sync with the registry usage strings.

## Alternatives Considered

**Alternative: Reuse existing normalizeWrite from dca.ts** — Rejected. The response shapes are different enough (tool 5 has no `sCode`, tool 6 always has empty data) that a shared normalizer would require flag parameters. Separate functions keep each tool's response handling clear.

**Alternative: decimal library / `Number` for precision** — Rejected: no decimal dependency exists, and `Number` is exactly the source of the bug. `smart-portfolio-decimal.ts` parses `[sign] digits [. digits] [e exp]` into `digits × 10^exp` and compares by magnitude, so huge exponents are never expanded; input length (1024), exponent literal length (15 digits), and — only where a value is expanded or summed — integer digits / decimal places (100) are bounded implementation guards, not business rules.

**Alternative: derive the CLI allow-list from usage strings / ToolSpec schemas** — Rejected: CLI options include aliases, composite actions and globals that do not map one-to-one. The table is explicit and a test checks it against the registry.

**Alternative: Add to DEFAULT_MODULES** — Rejected. Token budget is already 2× over limit. Adding more tools to the default set without a module load decision would further degrade performance for users who don't need Smart Portfolio.

## Risks

- **Token budget**: Adding ~2,800 tokens brings `bot.all` / `all` to ~52,824 tokens total. This is documented and accepted per issue specification. The four operation tools add a further ~972 tokens (measured; see `docs/module-registry.md`).
- **Behavior changes** (issue #225, accepted): the 0.0001 weight tolerance is removed (requests the backend would reject now fail locally); `deltaRatio` inputs such as `0.29` are no longer shaved to `0.28`; unrelated options on the two bot products are now `Unknown option` (including `--amount` on `recurring create`, which was never read).
- **Baseline branch merge conflicts**: Targeting `feat/dca-margin-tp-manual-buy-rerun1-manual` — `docs/module-registry.md`, `constants.ts`, and skills files may conflict during rebase to master.
