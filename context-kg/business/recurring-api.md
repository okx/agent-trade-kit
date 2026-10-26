# Recurring Buy (定投) — API & Tool Notes

Recurring Buy invests a fixed amount in a basket of coins at fixed intervals. CLI-only module `bot.recurring` (see `technical/02-configuration.md`): 12 `recurring_*` core tool specs, surfaced as `okx bot recurring <sub>`, never as MCP tools.

Contract source of truth: the OKX V5 Recurring Buy OpenAPI document (13 endpoints under `/api/v5/tradingBot/recurring`, rate limit 20 req / 2 s per user; tools use `privateRateLimit(key, 10)`).

## Tool ↔ endpoint ↔ CLI

| Tool | Endpoint | CLI |
|---|---|---|
| `recurring_place_order` | POST `/order-algo` | `create` |
| `recurring_pause` / `recurring_restart` | POST `/pause` / `/restart` | `pause` / `restart` |
| `recurring_stop` | POST `/stop-order-algo` — **body is a JSON array** `[{algoId}]` (API allows ≤10; tool sends one, no `tag`) | `stop` |
| `recurring_amend_name` | POST `/amend-order-algo` | `amend-name` |
| `recurring_amend_price_range` | POST `/amend-price-range` | `amend-price-range` |
| `recurring_amend_amount` | POST `/amend-recurring-amount` | `amend-amount` (`--amount`, `--amt` alias) |
| `recurring_amend_time` | POST `/amend-recurring-time` | `amend-time` |
| `recurring_add_investment` | POST `/add-investment` | `add-investment` |
| `recurring_get_order_details` | GET `/orders-algo-details` | `details` |
| `recurring_get_orders` | GET `/orders-algo-pending` (`status=active`, default) or `/orders-algo-history` (`status=history`) | `orders [--history]` |
| `recurring_get_sub_orders` | GET `/sub-orders` | `sub-orders` |

## Parameter rules enforced client-side (only those written in the contract)

- `stgyName` ≤ 40 chars; `period` ∈ monthly/weekly/daily/hourly; `investmentCcy` ∈ USDT/USDC; `tdMode` ∈ cash/cross; `recurringTimeType` ∈ 1/2; `source` entries ∈ 1/2/3 (CLI flag is comma-separated, sent as an array).
- `recurringTime` integer 0–23 (required on create always; on amend-time only when `recurringTimeType=1`).
- `timeZone` numeric in [-12, 14]; decimals such as `5.5` are accepted because the server accepts them.
- Period-scoped: `recurringDay` required + range-checked for monthly (1–28) / weekly (1–7); a day supplied for daily/hourly is tolerated. `recurringHour` ∈ 1/4/8/12, required when `period=hourly`.
- `recurringList` is a JSON string, assembled into an array in the handler. create: `ccy` + `ratio` required, `minPx`/`maxPx` optional; amend-price-range: `ccy` + `minPx` + `maxPx` required (`""` = no limit), no `ratio`. JSON numbers are coerced to strings.
- **`tdMode` is required with no default and no auto-detection in code.** The skill decides it from `acctLv` (agent runs `okx account config` first): 1/2 → `cash` only; 3/4 → ask the user, `cash` or `cross` (`cash` if no preference). The flag must always be passed explicitly.
- Server-owned (deliberately NOT validated here): ratio sum, duplicate coins, max coin count, per-coin minimum ratio, minimum investment, `minPx`/`maxPx` consistency, KYC level.

## Response handling

- Write responses carry `sCode`/`sMsg` per item; `sCode != "0"` → `OkxApiError`.
- `amend-time`, `amend-amount`, `amend-price-range`, `add-investment` return **empty/absent `data`** on success (the amend-time example has no `algoId`). Tools treat that as success; the CLI prints `… (OK)` using the algoId the caller passed.
- Details include per-coin stats (`totalAmt`, `avgPx`, `px`, `profit`) that list endpoints omit.

## CLI specifics

- Negative time zones: `--timeZone=-5` (the parser also joins `--timeZone -5`).
- `--aiBuilderCode` is accepted only on `create` and becomes the order `tag`.
