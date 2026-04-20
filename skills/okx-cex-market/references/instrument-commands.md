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

## stock-tokens — List All Stock Token Perpetuals *(Deprecated)*

> **Deprecated**: use `okx market instruments-by-category --instCategory 3` instead. This command is kept for backward compatibility and will be removed in a future major version.

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

## instruments-by-category — Discover Metals, Commodities, Forex, and Bond Instruments

OKX supports non-crypto asset categories distinguished by the `instCategory` field:

| instCategory | Asset Class | Examples |
|---|---|---|
| `3` | Stock tokens | Apple (AAPL-USDT-SWAP), Tesla (TSLA-USDT-SWAP), Nvidia (NVDA-USDT-SWAP) |
| `4` | Metals | Gold (XAUUSDT-USDT-SWAP), Silver (XAGUSDT-USDT-SWAP) |
| `5` | Commodities | Crude Oil (OIL-USDT-SWAP), Natural Gas (GAS-USDT-SWAP) |
| `6` | Forex | EUR/USD (EURUSDT-USDT-SWAP), GBP/USD (GBPUSDT-USDT-SWAP) |
| `7` | Bonds | US 30Y Treasury (US30Y-USDT-SWAP) |

```bash
okx market instruments-by-category --instCategory <3|4|5|6|7> [--instType <SPOT|SWAP>] [--instId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instCategory` | Yes | - | `3`=Stock tokens `4`=Metals `5`=Commodities `6`=Forex `7`=Bonds |
| `--instType` | No | SWAP | `SPOT` or `SWAP` |
| `--instId` | No | - | Filter to a specific instrument |

Returns: `instId` · `instCategory` · `ctVal` · `lotSz` · `minSz` · `tickSz` · `state`.

```bash
# Discover stock token perpetuals (replaces the deprecated stock-tokens command)
okx market instruments-by-category --instCategory 3

# Discover all gold/silver instruments
okx market instruments-by-category --instCategory 4

# Discover all forex perpetuals
okx market instruments-by-category --instCategory 6

# Discover commodities
okx market instruments-by-category --instCategory 5

# Inspect a specific bond instrument
okx market instruments-by-category --instCategory 7 --instId US30Y-USDT-SWAP --json
```

> **Fallback** (if command not yet available):
> ```bash
> okx market instruments --instType SWAP --json | jq '[.[] | select(.instCategory == "3")]'
> ```
> Replace `"3"` with `"4"`, `"5"`, `"6"`, or `"7"` as needed. Requires `jq` installed.

> **Discovery workflow**: always run `instruments-by-category` first to get valid instIds, then use `ticker` / `orderbook` / `candles` to get price data.

### Trading Hours Notes

- **Forex** (category 6): follows FX market hours (Mon 00:00 – Fri 22:00 UTC, closed weekends)
- **Metals** (category 4): generally trades with FX hours; verify with `ticker` before placing orders
- **Commodities** (category 5): session-based hours; check `state=live` in instruments list
- **Bonds** (category 7): US bond instruments follow US market hours

Always run `okx market ticker <instId>` to confirm a live last price before placing any order on these instruments.

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

> **Demo market data**: All commands above support `--demo` (CLI) or `demo: true` (MCP) to query OKX's simulated trading market data. Default is live data.
