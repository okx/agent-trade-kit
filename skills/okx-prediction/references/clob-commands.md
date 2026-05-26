# CLOB Commands (EIP-712 Signed)

The CLOB family covers read-side market data keyed by **asset id** (no auth) and on-chain order placement / cancellation (EIP-712 signed).

## Asset vs market model

- A **market** has exactly two outcomes (YES / NO).
- Each outcome is an **asset**, identified by a numeric `assetId` (e.g. `100888000` for YES, `100888001` for NO).
- All CLOB read commands key off the **YES asset id** by default. Pass `--outcome no` (or just use the NO asset id) to flip.

> When the user asks "what's the YES price on market X", you typically need: `event-markets <eventId> --json` → pluck the market's YES `assetId` → `clob price --asset <assetId>`.

## Credential resolution for signed commands

```
1. --key <hex>                          (NEVER pass this from chat — see safety note below)
2. PREDICTIONS_AGENT_PRIVATE_KEY        (loaded from .env via env::load_dotenv())
3. Test-key fallback                    (only when API base is localhost / mock)
```

> **Safety**: the skill must **never** ask for or pass `--key` directly. Always rely on the env var. If the user pastes a private key in chat, refuse, tell them to revoke it, and walk them through `okx prediction setup` instead.

---

## Read commands (no auth)

### clob price

Trimmed price view (last / bid / ask / mid / spread) for one asset.

```bash
okx prediction clob price --asset 100888000 --json
okx prediction clob price --asset 100888000 --outcome no --json
```

| Flag | Required | Description |
|---|---|---|
| `--asset <id>` | Yes | YES asset id |
| `--outcome <yes\|no>` | No (default `yes`) | Switch side; NO price is derived as `1 − yes` |

### clob prices

Batch price view across multiple assets (assets are positional).

```bash
okx prediction clob prices 100888000 101128000 --json
okx prediction clob prices 100888000 101128000 --outcome no --json
```

### clob midpoint / clob midpoints

Mid-price `(bid + ask) / 2`. Same flag shape as `price` / `prices`.

```bash
okx prediction clob midpoint --asset 100888000 --json
okx prediction clob midpoints 100888000 101128000 --json
```

### clob spread / clob spreads

Bid/ask spread (absolute and percent).

```bash
okx prediction clob spread --asset 100888000 --json
okx prediction clob spreads 100888000 101128000 --json
```

### clob book / clob books

Multi-level order-book depth. `--sz` controls levels per side (max 400, default 10).

```bash
okx prediction clob book --asset 100888000 --sz 25 --json
okx prediction clob books 100888000 101128000 --outcome no --json
```

| Flag | Required | Description |
|---|---|---|
| `--asset <id>` (single) / positional (batch) | Yes | Asset id(s) |
| `--outcome <yes\|no>` | No (default `yes`) | Side switch |
| `--sz <n>` | No (default 10, max 400) | Levels per side |

### clob order \<orderId\> · clob orders · clob trades

Thin aliases for the corresponding `account *` queries. Prefer the `account *` form in skill output for clarity. See [`account-commands.md`](account-commands.md).

---

## Write commands (EIP-712 signed — REQUIRE dry-run preview)

> **Operation flow** for every command below:
> 1. Render dry-run summary (market title / outcome / price / size / notional / wallet / available balance)
> 2. Ask the user `Reply "confirm" to execute, or "cancel" to abort.`
> 3. ONLY after the literal token `confirm`, run the real command
> 4. Verify with `account orders --json` + `account positions --json`

### clob create-order

Place a limit order with EIP-712 signing.

```bash
# Standard limit (default tif=gtc, size-type=base)
okx prediction clob create-order --asset 100888000 --side buy --price 0.55 --size 100

# IOC (cancel any unfilled remainder)
okx prediction clob create-order --asset 100888000 --side sell --price 0.65 --size 50 --tif ioc

# Good-til-date with explicit expiry
okx prediction clob create-order --asset 100888000 --side buy --price 0.40 --size 200 --tif gtd --expiry 1735689600000

# Spend 50 pts buying YES, IOC the remainder (notional budget)
okx prediction clob create-order --asset 100888000 --side buy --price 0.65 --size 50 --tif ioc --size-type quote
```

| Flag | Required | Description |
|---|---|---|
| `--asset <id>` | Yes | YES asset id (use NO asset for NO side) |
| `--side <buy\|sell>` | Yes | Trade direction (**lowercase**) |
| `--price <p>` | Yes | Limit price as decimal in `[0, 1]` (e.g. `0.55`) |
| `--size <n>` | Yes | Shares (with `--size-type base`) or points budget (with `--size-type quote`) |
| `--tif <gtc\|gtd\|ioc\|fok\|alo>` | No (default `gtc`) | Time-in-force |
| `--expiry <UNIX_MS>` | Required iff `--tif gtd` | Unix-millisecond expiry; rejected with other TIFs |
| `--size-type <base\|quote>` | No (default `base`) | `quote` mode is `buy + ioc` only (rejected locally otherwise) |

Nonce and `clientOrderId` are auto-generated.

**Dry-run summary template**:

```
About to place order:
  Market           : <title from data market <mkt>>
  Asset            : <assetId>  (YES outcome)
  Side             : buy
  Price            : 0.55 pts
  Size             : 100 shares
  TIF              : gtc
  Notional         : ~55.00 pts
  Wallet           : <0x... from wallet show>
  Available (spots): <from account balance>

Reply "confirm" to execute, or "cancel" to abort.
```

### clob market-order

Cross the book immediately. Synthesizes an aggressive limit walked from a fresh book snapshot, signed with IOC (sweep visible liquidity) or FOK (atomic-or-cancel).

```bash
# Buy 100 shares, IOC
okx prediction clob market-order --asset 100888000 --side buy --size 100

# FOK — rejected locally if visible depth < 100 shares (no signed message sent)
okx prediction clob market-order --asset 100888000 --side buy --size 100 --tif fok

# Quote mode: spend 50 pts (buy + ioc only)
okx prediction clob market-order --asset 100888000 --side buy --size 50 --size-type quote
```

| Flag | Required | Description |
|---|---|---|
| `--asset <id>` | Yes | YES asset id |
| `--side <buy\|sell>` | Yes | Trade direction (`quote` mode requires `buy`) |
| `--size <n>` | Yes | Shares (base) or points budget (quote) |
| `--tif <ioc\|fok>` | No (default `ioc`) | `fok` rejected client-side when depth insufficient; `quote` mode requires `ioc` |
| `--size-type <base\|quote>` | No (default `base`) | `quote` is `buy + ioc` only |

> Use `market-order` only when the user explicitly wants immediate fill. For predictable fills at a known price, prefer `create-order --tif ioc`.

### clob cancel-oid

Cancel a single order by server-assigned order id.

```bash
okx prediction clob cancel-oid --oid 8534007 --asset 100888000
```

| Flag | Required | Description |
|---|---|---|
| `--oid <id>` | Yes | Server-assigned order id (from `account orders`) |
| `--asset <id>` | Yes | The order's asset id |

**Dry-run summary template**:

```
About to cancel order:
  Order ID  : 8534007
  Asset     : 100888000
  Market    : <title>

Reply "confirm" to execute, or "cancel" to abort.
```

### clob cancel-client-order-id

Cancel a single order by client-assigned `clientOrderId`.

```bash
okx prediction clob cancel-client-order-id --client-order-id 0x012aa0... --asset 100888000
```

| Flag | Required | Description |
|---|---|---|
| `--client-order-id <hex>` | Yes | Client-assigned id (auto-generated by `create-order`) |
| `--asset <id>` | Yes | The order's asset id |

### clob cancel-all

Cancel **every** open order for the wallet. High-risk — confirm twice.

```bash
okx prediction clob cancel-all
```

**Dry-run summary template**:

```
About to cancel ALL open orders.
  Wallet     : <0x... from wallet show>
  Open count : <count from account orders>

This affects every market. Reply "confirm" to execute, or "cancel" to abort.
```

### clob heartbeat

Dead-man switch — auto-cancels everything if not renewed within **5 minutes**.

```bash
okx prediction clob heartbeat
```

> **Do not auto-enable**: only execute after the user explicitly asks for dead-man protection (e.g. "set up heartbeat", "enable dead-man"). Never assume it.

Nonce is set to `now + 5 minutes`.

---

## Edge cases

- **`--key` flag**: the wrapper accepts it for completeness but the skill must never pass it. Refuse if the user asks the skill to pass a key.
- **Price outside [0, 1]**: binary rejects. Surface the error and tell the user to revise.
- **`--tif gtd` without `--expiry`**: rejected client-side. Always pair them.
- **`--size-type quote` outside `buy + ioc`**: rejected client-side (`create-order`) or implicitly forced to `ioc` (`market-order`). Tell the user this constraint up front when they ask for "spend N points".
- **No agent private key configured**: binary returns `NotAuthenticated` — guide the user to `okx prediction setup`.
- **Asset id vs market id mix-up**: the most common error. Read-side keys off asset, ctf keys off market, `account trades --market` filters by market. Always confirm which kind the user has before invoking.
