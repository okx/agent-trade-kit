# Account Commands

Authenticated account view. All commands require **HMAC** credentials in `.env`:

- `PREDICTIONS_API_KEY`
- `PREDICTIONS_API_SECRET`
- `PREDICTIONS_API_PASSPHRASE`

> These are **independent** from the main OKX CLI's OAuth / API key. Do **not** call `okx auth login` for outcomes. Run `okx outcomes setup` to populate `.env` interactively.

> **Aliases**: `clob order <id>`, `clob orders`, `clob trades` all delegate to the corresponding `account *` command — same SDK call, same rendering. Prefer the `account *` form in skill output for clarity.

---

## account balance

One row per `oddsType`:
- `spots` — real market
- `points` — points / paper market

Each row reports:
- `balance` — total
- `available` — `total − frozen by open orders`

```bash
okx outcomes account balance --json
```

---

## account order \<orderId\>

Single-order detail.

```bash
okx outcomes account order 11309900 --json
```

`clob order <orderId>` is a thin alias for this command.

---

## account orders

List **open** orders.

```bash
okx outcomes account orders --json
okx outcomes account orders --cursor abc123
```

| Flag | Description |
|---|---|
| `--cursor <c>` | Pagination cursor |

`clob orders` is a thin alias.

---

## account positions

List **open** positions.

```bash
okx outcomes account positions --json
okx outcomes account positions --cursor abc123
```

Each row includes a `Status` column. Rows showing `Won` mark resolved markets where you hold winning tokens — feed their `marketId` into `okx outcomes ctf redeem --market <id>`.

---

## account closed-positions

List **closed** positions with realized PnL.

```bash
okx outcomes account closed-positions --json
okx outcomes account closed-positions --cursor abc123
```

---

## account trades

Trade execution history.

```bash
okx outcomes account trades --json
okx outcomes account trades --market 12345
okx outcomes account trades --side BUY --json
```

| Flag | Description |
|---|---|
| `--market <id>` | Filter by market ID |
| `--side <BUY\|SELL>` | Filter by side |
| `--cursor <c>` | Pagination cursor |

`clob trades` is a thin alias.

---

## wallet show

The wallet address derived from `PREDICTIONS_AGENT_PRIVATE_KEY`. Useful as a pre-trade sanity check: confirm the agent will sign with the address the user expects.

```bash
okx outcomes wallet show --json
```

> Does **not** require HMAC — only the agent private key. No `--private-key` override flag; the value must come from `.env`.

---

## status

Health check that pings the events API **and** reads balance.

```bash
okx outcomes status --json
```

Output legend:
- `OK` — endpoint reachable, auth succeeded
- `SKIP` — credentials missing (no failure, just informational)
- `FAIL` — endpoint reachable but auth rejected

Use this as the very first command in any outcomes session.

---

## Common patterns

### Pre-trade balance check

```bash
okx outcomes wallet show --json | jq '.address'
okx outcomes account balance --json | jq '.[] | select(.oddsType=="spots")'
```

### Portfolio snapshot

```bash
okx outcomes account positions --json
okx outcomes account closed-positions --json
okx outcomes account trades --json
```

### Find redeemable markets after settlement

```bash
okx outcomes account positions --json | jq '.[] | select(.status=="Won") | .marketId'
# pipe each marketId into:  okx outcomes ctf redeem --market <id>
```

> **CSV export removed**: the prior `data export {positions|trades}` subcommand is no longer available. To produce CSV, pipe `--json` through your own `jq`/`csvkit`/script.
