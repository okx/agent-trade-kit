# Derivatives & Contract Data Commands

These commands apply to SWAP, FUTURES, and/or OPTION instruments. Not applicable to SPOT unless noted.

---

## funding-rate — Funding Rate

```bash
okx market funding-rate <instId> [--history] [--limit <n>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `instId` | Yes | - | SWAP instrument only (e.g., `BTC-USDT-SWAP`) |
| `--history` | No | false | Return historical funding rates |
| `--limit` | No | 100 | Number of historical records (only with `--history`) |

**Current rate** (no `--history`):
Returns: `fundingRate` · `nextFundingRate` · `fundingTime` · `nextFundingTime`

**Historical** (`--history`):
Returns table: `fundingRate` · `realizedRate` · `fundingTime`

```bash
okx market funding-rate BTC-USDT-SWAP
okx market funding-rate BTC-USDT-SWAP --history --limit 10
```

> Funding rate applies to SWAP instruments only. Returns an error for SPOT or FUTURES.

---

## mark-price — Mark Price

```bash
okx market mark-price --instType <type> [--instId <id>] [--json]
```

| Param | Required | Values |
|---|---|---|
| `--instType` | Yes | `SWAP` `FUTURES` `OPTION` |
| `--instId` | No | Filter to a single instrument |

Returns: `instId` · `instType` · `markPx` · `ts`

Used for liquidation price calculation and contract fair-value reference.

```bash
okx market mark-price --instType SWAP --instId BTC-USDT-SWAP
okx market mark-price --instType FUTURES
```

---

## price-limit — Upper / Lower Price Limits

```bash
okx market price-limit <instId> [--json]
```

Returns: `buyLmt` (max buy price) · `sellLmt` (min sell price)

Applies to SWAP and FUTURES only. Used to check whether a limit order price is within allowed range.

```bash
okx market price-limit BTC-USDT-SWAP
```

---

## open-interest — Open Interest

```bash
okx market open-interest --instType <type> [--instId <id>] [--json]
```

| Param | Required | Values |
|---|---|---|
| `--instType` | Yes | `SWAP` `FUTURES` `OPTION` |
| `--instId` | No | Filter to a single instrument |

Returns: `instId` · `oi` (contracts) · `oiCcy` (base currency amount) · `ts`

```bash
okx market open-interest --instType SWAP --instId BTC-USDT-SWAP
okx market open-interest --instType SWAP
```

> For OPTION: use `--instId BTC-USD` (underlying, not a specific strike/expiry) to list all active option series OI.

---

## index-ticker — Index Price

```bash
okx market index-ticker [--instId <id>] [--quoteCcy <ccy>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Cond. | - | Index ID (e.g., `BTC-USD`). Either this or `--quoteCcy` required. |
| `--quoteCcy` | Cond. | - | Filter all indices by quote currency (e.g., `USD`, `USDT`) |

Returns: `instId` · `idxPx` · `high24h` · `low24h`

> Use `BTC-USD` format for index IDs (not `BTC-USDT`).

```bash
okx market index-ticker --instId BTC-USD
okx market index-ticker --quoteCcy USD
```
