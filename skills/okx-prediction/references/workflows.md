# Cross-Command Workflows

Common composed flows. The skill should pick the matching workflow based on user intent, then chain commands.

> **Unit of value**: prediction markets transact in **points** (xp), not USDC. Balances, prices, and CTF amounts are all xp.

> **ID kinds**: `eventId` (event-level), `marketId` (market-level, used for `ctf *` and `account trades --market`), `assetId` (outcome-token-level, used for `clob *` reads and writes). See `data-commands.md` "ID glossary".

---

## 1. Daily brief (briefing of the market state)

> User: "What's happening in prediction markets today?" / "今日预测市场" / "trending markets"

```
1. okx prediction status --json                       → confirm env is OK
2. okx prediction data trending --json                     → top events
3. okx prediction data events --status active --limit 10 --json   → broader active list
4. okx prediction account balance --json              → user's current balance (if authed)
```

Display:
- Up to 5 trending events (title + volume)
- User's spots balance + available
- Any positions with > 0 unrealized PnL (from `account positions`)

---

## 2. Event deep-dive (research before trading)

> User: "Tell me more about <X event>" / "深挖 <X>"

```
1. okx prediction search <keyword> --limit 5 --json   → find candidate event IDs
   (or)
   okx prediction data events --category <c> --limit 20 --json

2. okx prediction data event-markets <eventId> --json      → full event + all sub-markets + YES/NO asset ids

3. For each sub-market the user is interested in:
   okx prediction data market <marketId> --json            → details
   okx prediction clob price --asset <yesAssetId> --json   → live price (YES side)
   okx prediction clob book --asset <yesAssetId> --sz 5 --json  → top-of-book depth
   okx prediction data candles <yesAssetId> --bar 1H --limit 50 --json  → price history
```

Output should answer: "Is this tradable now? What's the spread? How has it moved?"

---

## 3. Portfolio check (existing positions audit)

> User: "Show me my positions and PnL" / "我的持仓" / "portfolio"

```
1. okx prediction wallet show --json                  → wallet address
2. okx prediction account balance --json              → spots + points
3. okx prediction account positions --json            → open positions (note "Won" rows for redeem)
4. okx prediction account closed-positions --json     → recent realized PnL
```

Display:
- Wallet address + balance summary
- Open positions with `marketTitle / outcome / size / avgPx / mark / upl / status`
- Last 5 closed positions with realized PnL
- Any rows with `status="Won"` → call out as redeemable

---

## 4. Safe place-order (the critical write flow)

> User: "Buy 100 YES on market <id> at 0.55" / "下单 ..."

```
0. PREFLIGHT
   okx prediction status --json                       → must be healthy
   okx prediction wallet show --json                  → confirm wallet
   okx prediction data event-markets <eventId> --json      → look up the YES assetId for this market
   okx prediction data market <marketId> --json            → confirm active, fetch title
   okx prediction clob price --asset <yesAssetId> --json   → confirm current price vs user's limit
   okx prediction account balance --json              → spots.available ≥ price * size

1. DRY-RUN PREVIEW (render to user, do NOT execute)
   ```
   About to place order:
     Market           : <title>           (mkt_<id>)
     Asset            : <yesAssetId>      (YES outcome)
     Side             : buy
     Price            : 0.55 xp
     Size             : 100 shares
     TIF              : gtc
     Notional         : ~55.00 xp
     Current market   : YES bid 0.54 / ask 0.55
     Wallet           : 0x1234...abcd
     Available (spots): 1,234.56 xp

   Reply "confirm" to execute, or "cancel" to abort.
   ```

2. WAIT for the user's exact reply.
   - "confirm" → proceed
   - Anything else (including silence, "yes", "ok", "go", "yep") → abort with a polite ask for the exact word

3. EXECUTE
   okx prediction clob create-order \
     --asset <yesAssetId> --side buy --price 0.55 --size 100

4. VERIFY
   okx prediction account orders --json               → confirm the order is open
   (Optional) Poll periodically until status changes from "open" to "filled"
```

**Variations**:

- "Sell 100 NO at 0.45" → look up the **NO** assetId from `event-markets`, then `--asset <noAssetId> --side sell --price 0.45 --size 100`
- "Spend 50 points buying YES" → notional/quote mode: `--side buy --price <limit> --size 50 --tif ioc --size-type quote`
- "Market buy 100 shares of YES" → `okx prediction clob market-order --asset <yesAssetId> --side buy --size 100`
- "GTD until <date>" → `--tif gtd --expiry <UNIX_MS>` (compute Unix ms from the user's date)

Same dry-run + confirm structure applies to:
- `clob cancel-oid --oid <id> --asset <id>` — preview shows order + market detail
- `clob cancel-client-order-id` — same shape, different identifier
- `clob cancel-all` — preview shows wallet + open-order count
- `ctf split/merge/redeem` — preview shows market + amount + expected balance change

---

## 5. Resolve and redeem (after market settlement)

> User: "<X event> resolved — claim my winnings" / "结算后赎回"

```
1. okx prediction data event <eventId> --json              → confirm status == settled
                                                       → look at "winningOutcome"

2. okx prediction account positions --json | jq '.[] | select(.status=="Won") | {marketId, marketTitle, shares}'
                                                       → enumerate redeemable markets

3. DRY-RUN (required for any ctf write)
   ```
   About to REDEEM resolved tokens:
     Market           : <title>
     Status           : settled (winning outcome: YES)
     Holdings (YES)   : 250 shares
     Expected payout  : 250.00 xp
     Wallet           : 0x...

   Reply "confirm" to execute, or "cancel" to abort.
   ```

4. EXECUTE (no --amount — redeem burns the full winning balance)
   okx prediction ctf redeem --market <id>

5. VERIFY
   okx prediction account balance --json              → confirm spots increased
   okx prediction account positions --json            → confirm winning shares removed
```

If the user holds only the **losing** side: warn that redeem will return 0 xp and ask whether to skip.

---

## 6. Recovery — "okx-predict not found"

> User runs any prediction command → wrapper prints install hint.

```
1. Confirm node + npm available:
   node --version
   npm --version

2. Install platform-specific package:
   npm install -g @okx/predict-market-cli

3. Verify:
   okx-predict --version

4. (One-time) Run setup wizard:
   okx prediction setup

5. Test:
   okx prediction status --json
```

Never have the user `cargo install` from source unless they explicitly need a dev build.

---

## 7. Recovery — auth errors

> Any HMAC-protected command returns auth failure.

1. Re-check env: `cat ~/.env | grep PREDICTIONS_` (mask values when echoing)
2. Run `okx prediction setup` to re-write `.env`
3. Run `okx prediction status --json` to verify both `balance` and `events` checks pass
4. Retry the original command

If `wallet show` fails: `PREDICTIONS_AGENT_PRIVATE_KEY` is the missing piece — guide them through `setup` again, and do **not** ask them to paste the key in chat.
