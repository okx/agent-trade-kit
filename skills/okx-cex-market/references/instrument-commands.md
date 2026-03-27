# Instrument Discovery Commands

## instruments — List Tradeable Instruments

```bash
okx market instruments --instType <type> [--instId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instType` | Yes | - | `SPOT` `SWAP` `FUTURES` `OPTION` |
| `--instId` | No | - | Filter to a single instrument |
| `--uly` | Cond. | - | Required for `OPTION` (e.g., `--uly BTC-USD`) |

Returns: `instId` · `ctVal` · `lotSz` · `minSz` · `tickSz` · `state`. Displays up to 50 rows.

```bash
okx market instruments --instType SPOT
okx market instruments --instType SWAP --instId BTC-USDT-SWAP --json
okx market instruments --instType OPTION --uly BTC-USD
```

> **OPTION instruments cannot be listed without `--uly`**. If the underlying is unknown, use `open-interest --instType OPTION` first to discover active instIds, then query instruments with the known underlying.

---

## stock-tokens — List All Stock Token Perpetuals

```bash
okx market stock-tokens [--json]
```

Returns: `instId` · `ctVal` · `lotSz` · `minSz` · `tickSz` · `state` for all active stock token SWAP instruments (`instCategory=3`).

Examples: `TSLA-USDT-SWAP`, `NVDA-USDT-SWAP`, `AAPL-USDT-SWAP`, `MSFT-USDT-SWAP`

```bash
okx market stock-tokens
```

> **Fallback** (if command not yet available):
> ```bash
> okx market instruments --instType SWAP --json | jq '[.[] | select(.instCategory == "3")]'
> ```
> Requires `jq` installed.

---

## Notes

- `ctVal` — contract value (e.g., 0.01 BTC per contract for BTC-USDT-SWAP). Required for sz ↔ coin quantity conversion.
- `lotSz` — order size increment. sz must be a multiple of lotSz.
- `minSz` — minimum order size.
- `tickSz` — minimum price increment.
- `state` — `live` means currently tradeable.

### Stock Token Trading Hours

Stock tokens follow underlying exchange hours:
- US stocks (TSLA, NVDA, AAPL, etc.): Mon–Fri ~09:30–16:00 ET
- Orders outside trading hours may be queued or rejected

Always run `okx market ticker <instId>` to confirm a live last price before placing any stock token order.
