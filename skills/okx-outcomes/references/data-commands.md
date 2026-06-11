# Data / Search Commands

Public market data — no auth required (the one exception is `search`, which needs an OAuth session; see its section below). All commands support `--json` for machine-readable output.

> Reverse-mapping: every command below forwards verbatim to the `okx-outcomes` binary. The `okx outcomes` wrapper does not modify arguments other than auto-appending `--json` when the user is in global `--json` mode.

> **Concept**: outcomes markets use **assetId** (e.g. `100888000`) as the primary identity for read-side data. An asset corresponds to a single outcome token (YES or NO) under a parent market. Price/depth/candles are keyed off the YES asset by convention — pass `--outcome no` (or use the NO asset id) when you need the NO side.

---

## events

List outcome events. Filterable, paginated.

```bash
okx outcomes data events
okx outcomes data events --status active --category sports --limit 50
okx outcomes data events --sort volume --cursor abc123 --json
```

| Flag | Description |
|---|---|
| `--status <s>` | Filter by event status (e.g. `active`, `upcoming`, `settled`) |
| `--category <c>` | Filter by category (e.g. `politics`, `sports`, `crypto`) |
| `--tag <id>` | Filter by sport tag ID |
| `--league <id>` | Filter by league ID |
| `--sort <key>` | Sort key (e.g. `volume`, `created`) |
| `--cursor <c>` | Pagination cursor |
| `--limit <n>` | Result count |

---

## event \<eventId\>

Single event top-level detail (no markets attached).

```bash
okx outcomes data event evt_t001
okx outcomes data event evt_t001 --json
```

---

## event-markets \<eventId\>

Event detail **with all its markets** attached. The most useful command for diving into an event the user wants to trade.

```bash
okx outcomes data event-markets evt_t001 --json
```

---

## market \<marketId\>

Single market detail.

```bash
okx outcomes data market mkt_t001 --json
```

---

## trending

Trending events (separate API from `events`).

```bash
okx outcomes data trending --json
```

---

## ticker \<assetId\>

24-hour ticker (last price, volume, open/high/low) for one outcome asset.

```bash
okx outcomes data ticker 100170100 --json
```

---

## candles \<assetId\>

K-line OHLCV data for one outcome asset.

```bash
okx outcomes data candles 100170100 --bar 1H --limit 50 --json
```

| Flag | Default | Description |
|---|---|---|
| `--bar <period>` | server default | Period: `1m`, `5m`, `15m`, `1H`, `4H`, `1D` |
| `--limit <n>` | 100 | Number of candles |

---

## search \<keyword\>

Keyword search across events and markets. **Requires an OAuth session** (`okx outcomes
auth login` — see [`setup-auth.md`](setup-auth.md)); unlike the other `data`/read commands
it is not public. For single-entity lookups by id, prefer the public `data event <id>` /
`data market <id>`.

```bash
okx outcomes search BTC --limit 20
okx outcomes search "US Election" --json
okx outcomes search ETH --cursor abc123 -j
```

| Flag | Description |
|---|---|
| `--cursor <c>` | Pagination cursor |
| `--limit <n>` | Result count |

> The binary no longer ships `search event <id>` / `search market <id>` subcommands. For single-entity lookups use `event <id>` / `market <id>` under `data`.

---

## ID glossary

| ID kind | Where it appears | Used by |
|---|---|---|
| `eventId` | `events`, `event`, `event-markets`, `trending` outputs | event-level queries |
| `marketId` | `event-markets`, `market` outputs; `account trades --market`, `clob trades --market`; all `ctf *` writes | market-level operations (one market has two outcomes) |
| `assetId` (numeric, e.g. `100888000`) | `ticker`, `candles`, all `clob price/book/midpoint/spread/...`, `clob create-order --asset`, `clob market-order --asset` | outcome-token-level operations |

Knowing which ID kind a command expects is the most common source of confusion — always read the parameter table before invoking.

---

## Notes

- **`markets` is not a top-level command** — there is no `markets <sub>` namespace; use `data market <id>` / `data event-markets <id>` instead.
- **CSV export removed**: the prior `data export {positions|trades}` subcommand was removed. For CSV output, pipe `--json` through `jq` and your own CSV writer, or use `account trades --json` and post-process.
- **Sports reference data removed**: `sports-tags`, `leagues`, `teams` were retired from the CLI. Equivalent IDs surface in `events --json` output (`tag`, `league` fields) when you need to filter.
