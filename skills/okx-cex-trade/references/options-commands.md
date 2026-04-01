# Options Command Reference

## USDT-to-Contracts Conversion (Options Only)

Options (`*-USD-YYMMDD-strike-C/P`) do **NOT** support `tgtCcy`. When the user specifies a USDT amount for options, you must convert manually:

### Step 1 — Fetch contract parameters

```bash
okx market instruments --instType OPTION --instId <instId> --json
okx option greeks --uly <BTC-USD> --expTime <YYMMDD> --json  → markPx (BTC)
okx market ticker BTC-USDT --json                            → last price (btcPx)
```

### Step 2 — Convert USDT to contracts

```
markPx unit: base currency (e.g. BTC per contract)
ctVal unit: base currency (e.g. 0.1 BTC)

Formula (buyer cost):
  sz = floor(usdtAmt / (markPx_BTC × btcPx × ctVal))

Example — BTC-USD-250328-95000-C (markPx=0.005 BTC, btcPx=95000, ctVal=0.1 BTC):
  200 USDT → floor(200 / (0.005 × 95000 × 0.1))
           = floor(200 / 47.5) = floor(4.21) = 4 contracts
  Total premium ≈ 4 × 0.005 × 0.1 = 0.002 BTC ≈ 190 USDT

⚠ Always show both BTC and USDT premium cost to the buyer.
⚠ Seller margin is also in BTC — remind user of liquidation risk.
```

### Step 3 — Validate before placing

```
After computing sz:

1. sz == 0 or sz < minSz
   → Reject. Inform user:
     "Amount too small: minimum order is {minSz} contract(s),
      equivalent to ~{minSz × markPx × ctVal × btcPx} USDT."

2. sz not a multiple of lotSz
   → Round down to the nearest valid multiple:
     sz = floor(sz / lotSz) × lotSz

3. sz ≥ minSz
   → Show conversion summary and wait for user confirmation before placing:

     Conversion summary:
       Input:    {usdtAmt} USDT
       markPx:   {markPx}  |  ctVal: {ctVal}  |  btcPx: {btcPx}
       Raw:      {rawResult}
       Rounded:  {sz} contracts  (~{actual USDT value})
     Confirm order with sz={sz}?
```

---

## Option — Get Instruments (Option Chain)

```bash
okx option instruments --uly <underlying> [--expTime <YYMMDD>] [--json]
```

| Param | Required | Description |
|---|---|---|
| `--uly` | Yes | Underlying, e.g. `BTC-USD` or `ETH-USD` |
| `--expTime` | No | Filter by expiry date, e.g. `250328` |

Returns: `instId`, `uly`, `expTime`, `stk` (strike), `optType` (C/P), `state`.

Run this **before placing any option order** to get the exact `instId`.

---

## Option — Get Greeks

```bash
okx option greeks --uly <underlying> [--expTime <YYMMDD>] [--json]
```

Returns IV (`markVol`) and BS Greeks (`deltaBS`, `gammaBS`, `thetaBS`, `vegaBS`) plus `markPx` for each contract.

---

## Option — Place Order

```bash
okx option place --instId <id> --side <buy|sell> --ordType <type> \
  --tdMode <cash|cross|isolated> --sz <n> \
  [--px <price>] [--reduceOnly] [--clOrdId <id>] [--json]
```

| Param | Required | Default | Description |
|---|---|---|---|
| `--instId` | Yes | - | e.g. `BTC-USD-250328-95000-C` (call) or `...-P` (put) |
| `--side` | Yes | - | `buy` or `sell` |
| `--ordType` | Yes | - | `market`, `limit`, `post_only`, `fok`, `ioc` |
| `--tdMode` | Yes | - | `cash` = buyer (full premium); `cross`/`isolated` = seller (margin) |
| `--sz` | Yes | - | Number of contracts |
| `--px` | Cond. | - | Required for `limit`, `post_only`, `fok`, `ioc` |
| `--reduceOnly` | No | false | Close-only; do not open a new position |

**tdMode rules:**
- Buyer (`side=buy`): always use `cash` — pay full premium, no margin call risk
- Seller (`side=sell`): use `cross` or `isolated` — margin required, liquidation risk

---

## Option — Cancel Order

```bash
okx option cancel --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

---

## Option — Amend Order

```bash
okx option amend --instId <id> [--ordId <id>] [--clOrdId <id>] \
  [--newSz <n>] [--newPx <p>] [--json]
```

Must provide at least one of `--newSz` or `--newPx`.

---

## Option — Batch Cancel

```bash
okx option batch-cancel --orders '<JSON>' [--json]
```

`--orders` is a JSON array of up to 20 objects, each `{"instId":"...","ordId":"..."}`:

```bash
okx option batch-cancel --orders '[{"instId":"BTC-USD-250328-95000-C","ordId":"123"},{"instId":"BTC-USD-250328-90000-P","ordId":"456"}]'
```

---

## Option — List Orders

```bash
okx option orders [--instId <id>] [--uly <underlying>] [--history] [--archive] [--json]
```

| Flag | Effect |
|---|---|
| *(default)* | Live/pending orders |
| `--history` | Historical (7d) |
| `--archive` | Older archive (3mo) |

---

## Option — Get Order

```bash
okx option get --instId <id> [--ordId <id>] [--clOrdId <id>] [--json]
```

Returns: `ordId`, `instId`, `side`, `ordType`, `px`, `sz`, `fillSz`, `avgPx`, `state`, `cTime`.

---

## Option — Positions

```bash
okx option positions [--instId <id>] [--uly <underlying>] [--json]
```

Returns: `instId`, `posSide`, `pos`, `avgPx`, `upl`, `deltaPA`, `gammaPA`, `thetaPA`, `vegaPA`. Only non-zero positions shown.

---

## Option — Fills

```bash
okx option fills [--instId <id>] [--ordId <id>] [--archive] [--json]
```

`--archive`: access fills beyond the default 3-day window (up to 3 months).

---

## Edge Cases — Options

- **sz unit**: always number of contracts — Options do NOT support `--tgtCcy`, so manually convert when user gives a USDT amount. For inverse options (BTC-USD), premium is quoted in BTC; convert via `sz = floor(usdtAmt / (markPx_BTC × btcPx × ctVal))`
- **instId format**: `{uly}-{YYMMDD}-{strike}-{C|P}` — e.g. `BTC-USD-250328-95000-C`; always run `okx option instruments --uly BTC-USD` first to confirm the exact contract exists
- **tdMode**: buyers always use `cash` (full premium paid upfront, no liquidation); sellers use `cross` or `isolated` (margin required, liquidation risk)
- **px unit**: quoted in base currency for inverse options (e.g. `0.005` = 0.005 BTC premium per contract); always show equivalent USDT value to the user
- **Expiry**: options expire at 08:00 UTC on the expiry date; in-the-money options are auto-exercised; do not hold through expiry unless intended
- **No TP/SL algo on options**: the `swap algo` / `spot algo` commands do not apply to option positions; manage risk by cancelling/amending option orders directly
- **Greeks in positions**: `okx option positions` returns live portfolio Greeks (`deltaPA`, `gammaPA`, etc.) from the account's position-level calculation, while `okx option greeks` returns BS model Greeks per contract
