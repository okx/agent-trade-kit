# Recurring Buy Commands (定投)

> CLI-only: these commands are available through `okx bot recurring ...` and are **not** exposed as MCP tools. No `--modules` flag is needed.

Recurring Buy invests a fixed amount in a basket of coins at fixed intervals (monthly / weekly / daily / hourly). It runs on OKX servers.

## Before creating: pick `--tdMode` from the account level

`--tdMode` is **required** on `create`. The CLI/tool has no default and does not check the value against the account — the server decides what it accepts. So the skill guides the choice from the account level:

1. Run `okx account config` and read `acctLv`.
2. Apply the rule:

| `acctLv` | Account mode | Server accepts | Executed as | `--tdMode` |
|---|---|---|---|---|
| `1` | Simple mode (简单模式 / spot mode) | `cash` only | spot | `cash`. Only one option: state it in the confirmation summary |
| `2` | Single-currency margin (单币种保证金模式 / spot and futures mode) | `cash`, `cross` | `cash` → spot; `cross` → **real leverage (MARGIN)** | **Ask the user**: `cash` (spot) or `cross` (leveraged, with leverage risk). `cash` if no preference |
| `3` | Multi-currency margin (跨币种保证金模式) | `cross` only | spot (downgraded by the system) | `cross`. Only one option: state it in the summary |
| `4` | Portfolio margin (组合保证金模式) | `cross`, plus `cash` — accepted today (`code=0`) but **does not execute** (no sub-order, `investmentAmt` unchanged); the server will be changed to reject it | spot (downgraded by the system) | `cross`. Only one option: state it in the summary. **Never `cash`** |

3. Ask (`acctLv` 2 only) or state (`acctLv` 1, 3 and 4) the choice in the same confirmation round as the other parameters (do not ask twice). On `acctLv` 2, skip the question if the user already said `cash` or `cross`, use `cash` if they have no preference, and always state that `cross` opens a real leveraged position.
4. If the user asks for a combination the account does not support (`cross` on `acctLv` 1, `cash` on `acctLv` 3 or 4; on 4 the server would report success but not trade), explain why and offer the supported option. If the user wants leverage but `acctLv` is 3 or 4, explain that `cross` is executed as spot there (no leverage).
5. If `acctLv` cannot be read or is not 1–4, do not guess (never `cross`): ask the user to confirm their account mode. Always pass `--tdMode` explicitly — the CLI has no default.

## Create

```bash
okx bot recurring create \
  --stgyName <name> \
  --recurringList '[{"ccy":"BTC","ratio":"0.2"},{"ccy":"ETH","ratio":"0.8"}]' \
  --period monthly --recurringDay 1 --recurringTime 0 --timeZone 8 \
  --amt 100 --investmentCcy USDT --tdMode cash
```

- Required: `stgyName` (max 40 chars), `recurringList`, `period`, `recurringTime`, `timeZone`, `amt`, `investmentCcy`, `tdMode`.
- `recurringList`: JSON array of `{ccy, ratio, minPx?, maxPx?}`. `minPx` / `maxPx` limit the price range in which that coin is bought; `""` or omitted = no limit. Ratio sum, duplicate coins, minimum investment and similar rules are checked by the server.
- `period`: `monthly` | `weekly` | `daily` | `hourly`.
  - `monthly` requires `--recurringDay` 1–28; `weekly` requires `--recurringDay` 1–7 (1 = Monday … 7 = Sunday); `daily` / `hourly` do not need it.
  - `hourly` requires `--recurringHour` (`1`, `4`, `8` or `12` = buy every N hours); `--recurringTime` is then the hour of the first buy.
- `recurringTime`: hour of day, integer 0–23.
- `timeZone`: UTC offset in [-12, 14], e.g. `8` for UTC+8. **For a negative offset write `--timeZone=-5`** (the `=` form is the documented one).
- `investmentCcy`: `USDT` or `USDC`. `amt` is the amount invested per cycle.
- Optional: `--source <1,2,3>` funding sources (1 = trading account (default), 2 = funding account, 3 = simple earn), `--recurringTimeType <1|2>` (1 = custom time (default), 2 = trigger immediately — the create itself buys right away and is not idempotent: confirm first, then check `sub-orders`), `--tradeQuoteCcy <ccy>`, `--algoClOrdId <id>`.
- `--aiBuilderCode <code>`: Optional builder attribution code, forwarded as the order tag. Only `create` accepts it.

## List Strategies (Running or History)

```bash
# Running / paused (default)
okx bot recurring orders [--algoId <id>] [--after <id>] [--before <id>] [--limit <n>]

# Stopped
okx bot recurring orders --history [--algoId <id>] [--after <id>] [--before <id>] [--limit <n>]
```

`--limit` max is 100 (the default).

## Get Details

```bash
okx bot recurring details --algoId <id>
```

Shows the schedule, invested amount, PnL, next invest time and the per-coin table (holdings `totalAmt`, average price `avgPx`, current price `px`, `profit`).

## Sub Orders

```bash
okx bot recurring sub-orders --algoId <id> [--ordId <id>] [--after <id>] [--before <id>] [--limit <n>]
```

Lists the buy orders the strategy has executed (`ordType` is `market`, or `manual_add_order` for `add-investment`).

`--limit` max is 300 (the default) here — unlike `orders`, whose max is 100.

## Pause / Restart / Stop

```bash
okx bot recurring pause --algoId <id>
okx bot recurring restart --algoId <id>
okx bot recurring stop --algoId <id>
```

- `pause` stops scheduled purchases until `restart` resumes them (do not promise that cycles missed while paused are bought later). Read `details` first (`pause` needs `state` `running`, `restart` needs `pause`, otherwise tell the user instead of running it), confirm `algoId` and name, and wait for an explicit yes; `(OK)` is not proof — check `details` (`nextInvestTime`) afterwards.
- `stop` is permanent. Always check the state via `details` first. One strategy is stopped per call.

## Amend

```bash
# Name (max 40 chars)
okx bot recurring amend-name --algoId <id> --stgyName <name>

# Per-coin price range (all of ccy / minPx / maxPx required per item; "" = no limit;
# the coin must already be part of the strategy)
okx bot recurring amend-price-range --algoId <id> \
  --recurringList '[{"ccy":"BTC","minPx":"80000","maxPx":"120000"}]'

# Amount per cycle (in the investment currency used at creation)
okx bot recurring amend-amount --algoId <id> --amount 20

# Schedule
okx bot recurring amend-time --algoId <id> --recurringTimeType 1 --period monthly \
  --recurringDay 1 --recurringTime 11 --timeZone 8
```

- `amend-amount` / `add-investment` use `--amount` (`--amt` is accepted as an alias).
- `amend-time`: `--recurringTimeType 1` (custom time) needs `--recurringTime` and, for `monthly` / `weekly`, `--recurringDay`; `--recurringTimeType 2` triggers immediately and needs neither — **it buys right away and every call buys again (not idempotent), so confirm with the user first**; afterwards check `recurring sub-orders` and `details`. `hourly` always needs `--recurringHour`. Negative offsets: `--timeZone=-5`.
- Price-range, amount, time and add-investment amends return no data on success; the CLI prints `... (OK)`.

## Add Investment

```bash
okx bot recurring add-investment --algoId <id> --amount <amount>
```

Invests an extra one-off amount now (real trade, not idempotent), in the strategy's investment currency. Confirm `algoId` and the amount first, and note `investmentAmt` from `details` and the newest `sub-orders` entry beforehand. Afterwards `sub-orders` should list a new buy order (normally `ordType` `manual_add_order`) and `investmentAmt` should rise by the amount (otherwise rely on `sub-orders`); `(OK)` alone is not proof.

---

## Edge Cases

- **`tdMode` is never defaulted or account-checked in code**: follow the "Before creating" section at the top of this file. A missing or non-`cash|cross` value is rejected before any request is sent; the server rejects a combination the account does not accept, except `cash` on `acctLv` 4, which it accepts but does not execute today, so never use it.
- **Negative time zones**: write `--timeZone=-5`; a bare negative value after the flag looks like another option to generic argument parsers.
- **Numeric strings**: pass plain decimals (no scientific notation). `amount` for `amend-amount` / `add-investment` must be > 0 (the server allows at most 2 decimals).
- **Errors on writes**: never retry a failed or uncertain write yourself, and ignore any "retry later" hint in the error output. Check the current state (`orders` and `--history` for `create`, `sub-orders` / `details` otherwise), wait a moment and check once more, tell the user what you found, and re-run only after they explicitly ask or agree. A retry of `create`, `add-investment` or `amend-time --recurringTimeType 2` may duplicate the strategy or buy again.
- **State check before changes**: `stop` / `pause` / `restart` / amend commands act on the current state; use `details` first. Stopped strategies appear only with `orders --history`.
- **Empty-data success**: `amend-time`, `amend-amount`, `amend-price-range` and `add-investment` return an empty `data` array on success; that is success, not an error.
- **`algoId`** comes from `create` or `orders`; never fabricate it.
- **Demo mode**: `okx --demo bot recurring create ...` (OAuth) or `okx --profile <demo-profile> bot recurring create ...` (API Key) — strategies created in demo mode are isolated from live strategies.

---

## Parameter Display Names

### Recurring Buy (定投)

| API Field | EN | ZH |
|---|---|---|
| `stgyName` | Strategy name | 策略名称 |
| `recurringList` | Coin allocation list | 定投币种列表 |
| `ccy` | Coin | 币种 |
| `ratio` | Allocation ratio | 配比 |
| `minPx` / `maxPx` | Price range (min / max) | 价格区间（下限 / 上限） |
| `period` | Period (monthly / weekly / daily / hourly) | 定投周期（每月 / 每周 / 每日 / 每小时） |
| `recurringDay` | Day of month / week | 定投日 |
| `recurringHour` | Hourly interval | 每 N 小时 |
| `recurringTime` | Buy time (hour of day) | 定投时间（小时） |
| `recurringTimeType` | Time type (1=custom / 2=immediate) | 时间类型（1=自定义 / 2=立即触发） |
| `timeZone` | UTC time zone | 时区 |
| `amt` / `amount` | Amount per cycle / extra investment | 每期投入金额 / 追加金额 |
| `investmentCcy` | Investment currency | 投入币种 |
| `investmentAmt` | Accumulated investment | 累计投入 |
| `tdMode` | Trade mode (cash / cross; accepted values depend on `acctLv`, see above) | 交易模式（cash / cross，可接受的值取决于 acctLv，见上文） |
| `source` | Funding source (1=trading / 2=funding / 3=simple earn) | 资金来源（1=交易账户 / 2=资金账户 / 3=简单赚币） |
| `tradeQuoteCcy` | Trade quote currency | 交易计价币种 |
| `algoClOrdId` | Client strategy ID | 客户端策略 ID |
| `aiBuilderCode` | Builder attribution code (optional) | Builder 归因码（可选） |
| `cycles` | Completed cycles | 已定投期数 |
| `mktCap` | Market value | 持仓市值 |
| `totalPnl` | Total profit and loss | 累计盈亏 |
| `pnlRatio` | PnL ratio | 累计收益率 |
| `totalAnnRate` | Annualized rate of return | 年化收益率 |
| `nextInvestTime` | Next invest time | 下次定投时间 |
| `state` | State (running / stopping / stopped / pause) | 策略状态（运行中 / 停止中 / 已停止 / 暂停） |
