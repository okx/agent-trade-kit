# Event Contract Commands — Full Parameter Reference

## Outcome Values

| User input | Meaning | Applies to |
|------------|---------|------------|
| `UP` | Price rises during the period | `price_up_down` series |
| `DOWN` | Price falls during the period | `price_up_down` series |
| `YES` | Condition met (price above/touches strike) | `price_above`, `price_once_touch` series |
| `NO` | Condition not met | `price_above`, `price_once_touch` series |

- Check `settlement.method` from `event_get_series` to determine which values apply.
- `px` is the **event contract price** (`0.01–0.99`), NOT the underlying asset price.
- When the contract is actively trading, `px` reflects the market-implied probability. Example: `px=0.6` means the market is pricing the event at roughly 60%.

## Product Types (settlement.method)

| method | Description | outcome values |
|--------|-------------|----------------|
| `price_up_down` | Does price rise or fall within the period? | `UP` / `DOWN` |
| `price_above` | Is price above the strike at expiry? | `YES` / `NO` |
| `price_once_touch` | Does price ever touch the strike level? | `YES` / `NO` |

Response `outcome` field (from `event_get_markets` with `state=expired`): live/pending → empty; `"1"` → `YES`/`UP`; `"2"` → `NO`/`DOWN`.

---

## Query Commands (API key required)

### `okx event series`

```bash
okx event series [--seriesId <id>] [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `seriesId` | string | No | Filter by series ID |

**Output fields**: Series ID, Title, Frequency, Category, Settlement method, Underlying

---

### `okx event events <seriesId>`

List events in a series. Each event corresponds to one expiry.

```bash
okx event events <seriesId> [--eventId <id>] [--state <preopen|live|settling|expired>] [--limit <n>] [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `seriesId` | string | Yes | Series ID (positional or `--seriesId`) |
| `--eventId` | string | No | Filter by specific event ID |
| `--state` | string | No | `preopen`, `live`, `settling`, or `expired` |
| `--limit` | number | No | Max results (default 100) |

State lifecycle: preopen → live → settling → expired

Use `state=preopen` to discover upcoming events not yet available for trading. Contracts in `preopen` state cannot be traded yet — wait until state transitions to `live`.

**Output fields**: Event ID, Series ID, State, Expiry time

---

### `okx event markets <seriesId>`

List markets (instruments) in a series. Use `--state expired` to see settlement results.

```bash
okx event markets <seriesId> [--eventId <id>] [--state <preopen|live|settling|expired>] [--limit <n>] [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `seriesId` | string | Yes | Series ID (positional or `--seriesId`) |
| `--eventId` | string | No | Filter by event ID |
| `--instId` | string | No | Filter by instrument ID |
| `--state` | string | No | `preopen`, `live`, `settling`, or `expired` |
| `--limit` | number | No | Max results (default 100) |

**Output fields**: Contract, Target price, Price (event contract price 0.01–0.99, not the underlying asset price; reflects market-implied probability when actively trading), Outcome (expired: translated as `YES`/`NO` or `UP`/`DOWN`; live/pending: `—`), Settlement value (expired only)

- **CLI**: use `--state expired` to get settlement outcome; there is no `event ended` command in the CLI.
- **MCP**: use `event_get_markets(seriesId, state="expired")` instead.
- Use `state=preopen` to discover upcoming contracts not yet available for trading (no live quote/px yet). Do NOT attempt to place orders on preopen contracts.

---

## instId Format

Event contract instIds are obtained from `okx event markets <seriesId>`. Never guess or use placeholders.

| Series type | instId format | Example |
|-------------|--------------|---------|
| `price_above` / `price_once_touch` | `{UNDERLYING}-{TYPE}-{YYMMDD}-{HHMM}-{STRIKE}` | `BTC-ABOVE-DAILY-260224-1600-70000` |
| `price_up_down` | `{UNDERLYING}-{TYPE}-{YYMMDD}-{START}-{END}` | `BTC-UPDOWN-15MIN-260224-1600-1615` |

Recommended workflow to obtain instId:
1. `okx event series` → select a seriesId (e.g. `BTC-ABOVE-DAILY`)
2. `okx event events <seriesId> --state live` → see active events and their eventId
3. `okx event markets <seriesId> --state live` → see each tradeable instId
4. Use the instId from step 3 in place / amend / cancel commands

## Write Commands (API key required)

### `okx event place` ⚠️ WRITE

Places a real order.

```bash
okx event place <instId> <side> <outcome> <sz> \
  [--px <prob>] [--ordType <market|limit|post_only>] [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instId` | string | Yes | Instrument ID (positional) |
| `side` | string | Yes | `buy` = open, `sell` = close (positional) |
| `outcome` | string | Yes | `UP`, `YES`, `DOWN`, or `NO` (positional) |
| `sz` | string | Yes | For limit/post_only: number of contracts. For market: quote currency amount |
| `--px` | string | No | Event contract price (0.01–0.99); required when `ordType=limit`; omit for market orders |
| `--ordType` | string | No | `market` (default), `limit`, or `post_only` |
- `tdMode` is always `isolated` — auto-set by the system, do not pass it.
- `speedBump` is auto-set for non-post_only orders — do not pass it.

**Output**: Order number, error message (empty on success). Success signal: order number non-empty + error message empty.

---

### `okx event cancel` ⚠️ WRITE

Cancel a pending order.

```bash
okx event cancel <instId> <ordId> [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instId` | string | Yes | Instrument ID (positional) |
| `ordId` | string | Yes | Order ID to cancel (positional or `--ordId`) |

---

### `okx event amend` ⚠️ WRITE

Amend a pending limit or post-only order.

```bash
okx event amend <instId> <ordId> [--px <prob>] [--sz <n>] [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instId` | string | Yes | Instrument ID (positional) |
| `ordId` | string | Yes | Order ID to amend (positional or `--ordId`) |
| `--px` | string | No | New event contract price (0.01–0.99) |
| `--sz` | string | No | New number of contracts |

---

### `okx event orders`

```bash
okx event orders [--instId <id>] [--state live] [--limit <n>] [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--instId` | string | No | Filter by instrument ID |
| `--state` | string | No | `live` = pending only; omit for history |
| `--limit` | number | No | Max results (default 20) |

**Output fields**: Order number, Contract, Direction, Outcome, Order type, Price, Size, Filled, Status

---

### `okx event fills`

```bash
okx event fills [--instId <id>] [--limit <n>] [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--instId` | string | No | Filter by instrument ID |
| `--limit` | number | No | Max results (default 20) |

**Output fields**: Trade ID, Order number, Contract, Direction, Outcome, Fill price, Fill size, Time

---

## Outcome Quick Reference

| User intent | Series method | `outcome` input | Response outcome |
|-------------|--------------|-----------------|-----------------|
| "Buy Yes" / "Bet Yes" | `price_above` / `price_once_touch` | `YES` | `"1"` = YES won |
| "Buy No" / "Bet No" | `price_above` / `price_once_touch` | `NO` | `"2"` = NO won |
| "Buy Up" / "Bet Up" | `price_up_down` | `UP` | `"1"` = UP won |
| "Buy Down" / "Bet Down" | `price_up_down` | `DOWN` | `"2"` = DOWN won |
| Sell / close | Any | Same outcome as when opened | — |
