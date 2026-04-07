# Event Contract Commands — Full Parameter Reference

## Outcome Values

| User input | Meaning | Applies to |
|------------|---------|------------|
| `UP` | Price rises during the period | `price_up_down` series |
| `DOWN` | Price falls during the period | `price_up_down` series |
| `YES` | Condition met (price above/touches strike) | `price_above`, `price_once_touch` series |
| `NO` | Condition not met | `price_above`, `price_once_touch` series |

- Check `settlement.method` from `event_get_series` to determine which values apply.
- `px` is a **probability** in `0.00~1.00`, NOT a regular asset price.

## Product Types (settlement.method)

| method | Description | outcome values |
|--------|-------------|----------------|
| `price_up_down` | Does price rise or fall within the period? | `UP` / `DOWN` |
| `price_above` | Is price above the strike at expiry? | `YES` / `NO` |
| `price_once_touch` | Does price ever touch the strike level? | `YES` / `NO` |

Response `outcome` field (from `event_get_markets` with `state=expired`): live/pending → empty; `"1"` → `YES`/`UP`; `"2"` → `NO`/`DOWN`.

---

## Public Commands (no API key required)

### `okx event series`

```bash
okx event series [--seriesId <id>] [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `seriesId` | string | No | Filter by series ID |

**Output fields**: `seriesId`, `title`, `freq`, `category`, `settlement.method`, `settlement.underlying`

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

**Output fields**: `eventId`, `seriesId`, `state`, `expTime`

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

**Output fields**: `instId`, `floorStrike`, `state`, `outcome` (expired: translated as `YES`/`NO` or `UP`/`DOWN`; live/pending: empty), `settleValue` (expired only)

- **CLI**: use `--state expired` to get settlement outcome; there is no `event ended` command in the CLI.
- **MCP**: use `event_get_markets(seriesId, state="expired")` instead.

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

## Private Commands (API key required)

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
| `--px` | string | No | Limit price as probability 0.00~1.00; required when `ordType=limit`; omit for market orders |
| `--ordType` | string | No | `market` (default), `limit`, or `post_only` |
- `tdMode` is always `isolated` — auto-set by the system, do not pass it.
- `speedBump` is auto-set for non-post_only orders — do not pass it.

**Output**: `ordId`, `sMsg` (empty on success). Success signal: `ordId` non-empty + `sMsg` empty.

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
| `--px` | string | No | New probability price 0.00~1.00 |
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

**Output fields**: `ordId`, `instId`, `side`, `outcome`, `ordType`, `px`, `sz`, `fillSz`, `state`

---

### `okx event fills`

```bash
okx event fills [--instId <id>] [--limit <n>] [--json]
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `--instId` | string | No | Filter by instrument ID |
| `--limit` | number | No | Max results (default 20) |

**Output fields**: `tradeId`, `ordId`, `instId`, `side`, `outcome`, `fillPx`, `fillSz`, `ts`

---

## Outcome Quick Reference

| User intent | Series method | `outcome` input | Response outcome |
|-------------|--------------|-----------------|-----------------|
| "Buy Yes" / "Bet Yes" | `price_above` / `price_once_touch` | `YES` | `"1"` = YES won |
| "Buy No" / "Bet No" | `price_above` / `price_once_touch` | `NO` | `"2"` = NO won |
| "Buy Up" / "Bet Up" | `price_up_down` | `UP` | `"1"` = UP won |
| "Buy Down" / "Bet Down" | `price_up_down` | `DOWN` | `"2"` = DOWN won |
| Sell / close | Any | Same outcome as when opened | — |
