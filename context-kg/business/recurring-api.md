# Recurring Buy — API & Tool Notes

Recurring Buy invests a fixed amount in a basket of coins at fixed intervals. CLI-only module `bot.recurring` (see `technical/02-configuration.md`): 12 `recurring_*` core tool specs, surfaced as `okx bot recurring <sub>`, never as MCP tools.

Contract source of truth: the OKX V5 Recurring Buy OpenAPI document (13 endpoints under `/api/v5/tradingBot/recurring`, rate limit 20 req / 2 s per user; tools use `privateRateLimit(key, 10)`).

## Tool ↔ endpoint ↔ CLI

| Tool | Endpoint | CLI |
|---|---|---|
| `recurring_create_order` | POST `/order-algo` | `create` |
| `recurring_pause` / `recurring_restart` | POST `/pause` / `/restart` | `pause` / `restart` |
| `recurring_stop_order` | POST `/stop-order-algo` — **body is a JSON array** `[{algoId}]` (API allows ≤10; tool sends one, no `tag`) | `stop` |
| `recurring_amend_name` | POST `/amend-order-algo` | `amend-name` |
| `recurring_amend_price_range` | POST `/amend-price-range` | `amend-price-range` |
| `recurring_amend_amount` | POST `/amend-recurring-amount` | `amend-amount` (`--amount`, `--amt` alias) |
| `recurring_amend_time` | POST `/amend-recurring-time` | `amend-time` |
| `recurring_add_investment` | POST `/add-investment` | `add-investment` |
| `recurring_get_order_details` | GET `/orders-algo-details` | `details` |
| `recurring_get_orders` | GET `/orders-algo-pending` (`status=active`, default) or `/orders-algo-history` (`status=history`) | `orders [--history]` |
| `recurring_get_sub_orders` | GET `/sub-orders` (`ordType`: `market`, or `manual_add_order` for `add-investment` orders) | `sub-orders` |

## Parameter rules enforced client-side (only those written in the contract)

- `stgyName` ≤ 40 chars; `period` ∈ monthly/weekly/daily/hourly; `investmentCcy` ∈ USDT/USDC; `tdMode` ∈ cash/cross; `recurringTimeType` ∈ 1/2; `source` entries ∈ 1/2/3 (CLI flag is comma-separated, sent as an array).
- `recurringTime` integer 0–23 (required on create always; on amend-time only when `recurringTimeType=1`).
- `timeZone` numeric in [-12, 14]; decimals such as `5.5` are accepted because the server accepts them.
- Period-scoped: `recurringDay` required + range-checked for monthly (1–28) / weekly (1–7, where 1 = Monday … 7 = Sunday); a day supplied for daily/hourly is tolerated. `recurringHour` ∈ 1/4/8/12, required when `period=hourly`.
- `recurringList` is a JSON string, assembled into an array in the handler. create: `ccy` + `ratio` required, `minPx`/`maxPx` optional; amend-price-range: `ccy` + `minPx` + `maxPx` required (`""` = no limit), no `ratio`. JSON numbers are coerced to strings.
- **`tdMode` is required with no default and no auto-detection in code.** The code does not check it against the account; the skill guides it from `acctLv` (agent runs `okx account config` first): 1 → `cash` only; 2 → ask the user, `cash` (spot) or `cross` (real leverage), `cash` if no preference; 3 → `cross` only; 4 → `cross` only (`cash` is still accepted by the server today but is not executed — no sub-order, `investmentAmt` unchanged — so it must never be used; the server will be changed to reject it). Recurring Buy executes as spot except `acctLv` 2 + `cross`. The flag must always be passed explicitly.
- Server-owned (deliberately NOT validated here): ratio sum, duplicate coins, max coin count, per-coin minimum ratio, minimum investment, `minPx`/`maxPx` consistency, KYC level.

## Response handling

- Write responses carry `sCode`/`sMsg` per item; `sCode != "0"` → `OkxApiError`.
- `amend-time`, `amend-amount`, `amend-price-range`, `add-investment` return **empty/absent `data`** on success (the amend-time example has no `algoId`). Tools treat that as success; the CLI prints `… (OK)` using the algoId the caller passed.
- **`create` is the exception:** a success response must carry `data[0].algoId` (a non-empty string), otherwise the tool throws `OkxApiError` with a hint to check `okx bot recurring orders` and not to retry on its own (the strategy might exist, and the lists can lag, so a retry could duplicate it). For every write, an uncertain failure — a `NetworkError`, an HTTP 5xx, business codes 50001/50004/50013/50026, or any other coded API error whose hint says "retry" — is rethrown with the same type, code and message but a suggestion that says the request may already have been executed, not to retry on its own, to check the current state (`orders` for `create`, `sub-orders` / `details` for the others), wait and check once more, and to let the user decide; for the non-idempotent writes (`create`, `add-investment`, `amend-time` with `recurringTimeType=2`) it also warns that a retry may duplicate the strategy or buy again. The generic "retry later" hint is replaced. Definite rejections (e.g. `51000`, rate limit, authentication) keep their normal hints. `pause`, `restart`, `stop` and `amend-name` still accept an empty response: their live behaviour has not been verified, so they are deliberately not tightened.
- Details include per-coin stats (`totalAmt`, `avgPx`, `px`, `profit`) that list endpoints omit.

## CLI specifics

- Negative time zones: `--timeZone=-5` (the parser also joins `--timeZone -5`).
- `--aiBuilderCode` is accepted only on `create` and becomes the order `tag`.
