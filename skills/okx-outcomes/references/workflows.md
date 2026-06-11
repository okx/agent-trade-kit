# Cross-Command Workflows

Common composed flows. The skill should pick the matching workflow based on user intent, then chain commands.

> **Unit of value**: outcomes markets transact in **points** (xp), not USDC. Balances, prices, and CTF amounts are all xp.

> **ID kinds**: `eventId` (event-level), `marketId` (market-level, used for `ctf *` and `account trades --market`), `assetId` (outcome-token-level, used for `clob *` reads and writes). See `data-commands.md` "ID glossary".

---

## 0. First-time setup (onboarding) — fully agent-driven

> User: "set me up" / "首次配置" / "sign in" / any authed command fails with not-signed-in.

Three pieces in dependency order: region → OAuth sign-in → wallet binding. **The agent runs
every command**; the user only acts in a browser (device-code URL) and by opening the bind
short link (tap on phone → OKX app, or paste into a browser). No terminal, no `!` prefix.

```
1. okx outcomes setup status --json             → detect next_step / complete
2. okx outcomes setup region <global|us>         → (if region not done) agent runs it
3. okx outcomes auth login --manual --json       → agent runs it; capture {verificationUri,userCode,expiresIn}
   → relay to user: "Open <verificationUri> on any device, enter code <userCode> (valid ~N min)"
4. (user authorizes in browser — out-of-band, no terminal)
5. okx outcomes auth refresh --json              → agent verifies; poll w/ backoff until signed-in
                                                   (or run once after user says "done")
6. okx outcomes setup bind --json                → (if eoa not done) agent runs it; relay address + short link (deeplink field)
   → user opens link on phone/browser; if it won't open, copy wallet address & bind manually in OKX app
                                       (Outcomes → Profile → Settings → API Bind Wallet)
                                       (re-display without rotating the wallet: setup bind --keep)
7. okx outcomes setup status --json              → re-check until complete:true
8. okx outcomes status --json                    → final health check
```

> **Agent rules**: all per-step commands above are agent-runnable (device-code `auth login --manual`
> prints JSON and exits; it does NOT block or read stdin). The user's only actions are browser
> (authorize the URL+code) and opening the bind short link. **Never** spawn the full interactive
> `okx outcomes setup` wizard, `okx outcomes shell`, or plain `auth login` (no `--manual`) from an
> agent — they need a TTY. See [`setup-auth.md`](setup-auth.md).

---

## 1. Daily brief (briefing of the market state)

> User: "What's happening in outcomes markets today?" / "今日预测市场" / "trending markets"

```
1. okx outcomes status --json                       → confirm env is OK
2. okx outcomes data trending --json                     → top events
3. okx outcomes data events --status active --limit 10 --json   → broader active list
4. okx outcomes account balance --json              → user's current balance (if authed)
```

Display:
- Up to 5 trending events (title + volume)
- User's spots balance + available
- Any positions with > 0 unrealized PnL (from `account positions`)

---

## 2. Event deep-dive (research before trading)

> User: "Tell me more about <X event>" / "深挖 <X>"

```
1. okx outcomes search <keyword> --limit 5 --json   → find candidate event IDs
   (or)
   okx outcomes data events --category <c> --limit 20 --json

2. okx outcomes data event-markets <eventId> --json      → full event + all sub-markets + YES/NO asset ids

3. For each sub-market the user is interested in:
   okx outcomes data market <marketId> --json            → details
   okx outcomes clob price --asset <yesAssetId> --json   → live price (YES side)
   okx outcomes clob book --asset <yesAssetId> --sz 5 --json  → top-of-book depth
   okx outcomes data candles <yesAssetId> --bar 1H --limit 50 --json  → price history
```

Output should answer: "Is this tradable now? What's the spread? How has it moved?"

---

## 3. Portfolio check (existing positions audit)

> User: "Show me my positions and PnL" / "我的持仓" / "portfolio"

```
1. okx outcomes wallet show --json                  → wallet address
2. okx outcomes account balance --json              → spots + points
3. okx outcomes account positions --json            → open positions (note "Won" rows for redeem)
4. okx outcomes account positions --status closed --json  → recent realized PnL
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
   okx outcomes status --json                       → must be healthy
   okx outcomes wallet show --json                  → confirm wallet
   okx outcomes data event-markets <eventId> --json      → look up the YES assetId for this market
   okx outcomes data market <marketId> --json            → confirm active, fetch title
   okx outcomes clob price --asset <yesAssetId> --json   → confirm current price vs user's limit
   okx outcomes account balance --json              → spots.available ≥ price * size

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
   okx outcomes clob create-order \
     --asset <yesAssetId> --side buy --price 0.55 --size 100

4. VERIFY
   okx outcomes account orders --json               → confirm the order is open
   (Optional) Poll periodically until status changes from "open" to "filled"
```

**Variations**:

- "Sell 100 NO at 0.45" → look up the **NO** assetId from `event-markets`, then `--asset <noAssetId> --side sell --price 0.45 --size 100`
- "Spend 50 points buying YES" → notional/quote mode: `--side buy --price <limit> --size 50 --tif ioc --size-type quote`
- "Market buy 100 shares of YES" → `okx outcomes clob market-order --asset <yesAssetId> --side buy --size 100`
- "GTD until <date>" → `--tif gtd --expiry <UNIX_MS>` (compute Unix ms from the user's date)

Same dry-run + confirm structure applies to:
- `clob cancel-oid --oid <id> --asset <id>` — preview shows order + market detail
- `clob cancel-all` — preview shows wallet + open-order count
- `ctf split/merge/redeem` — preview shows market + amount + expected balance change

---

## 5. Resolve and redeem (after market settlement)

> User: "<X event> resolved — claim my winnings" / "结算后赎回"

```
1. okx outcomes data event <eventId> --json              → confirm status == settled
                                                       → look at "winningOutcome"

2. okx outcomes account positions --json | jq '.[] | select(.status=="Won") | {marketId, marketTitle, shares}'
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
   okx outcomes ctf redeem --market <id>

5. VERIFY
   okx outcomes account balance --json              → confirm spots increased
   okx outcomes account positions --json            → confirm winning shares removed
```

If the user holds only the **losing** side: warn that redeem will return 0 xp and ask whether to skip.

---

## 6. Recovery — "okx-outcomes not found"

> User runs any outcomes command → wrapper prints install hint.

```
1. Confirm curl + sh available (macOS / Linux):
   curl --version
   sh --version

2. Install prebuilt binary from GitHub Releases:
   curl -fsSL https://raw.githubusercontent.com/okx/outcomes-cli/main/install.sh | sh

3. Verify:
   okx-outcomes --version

4. (One-time) Complete setup — see workflow 0 (per-step in agent contexts).

5. Test:
   okx outcomes status --json
```

Never have the user `cargo install` from source unless they explicitly need a dev build.

---

## 7. Recovery — auth errors

> Any authenticated command (account / search / status balance) returns auth failure.

1. Check session state (no secrets read): `okx outcomes auth status --json` and `okx outcomes setup status --json`
2. If the OAuth session is expired but present, try `okx outcomes auth refresh --json` (agent-runnable).
3. If missing, re-run the device-code sign-in (workflow 0 step 3): `okx outcomes auth login --manual --json` → relay the URL+code → user authorizes in a browser → `okx outcomes auth refresh --json` to verify. No terminal needed.
4. Run `okx outcomes status --json` to verify both `balance` and `events` checks pass
5. Retry the original command

If `wallet show` or a write fails with `NotAuthenticated`: the signing wallet isn't bound — run `okx outcomes setup bind --json` (agent-runnable), relay the **short link** (`deeplink` field, `https://okx.com/ul/3OauBX?eoa=…&uid=…`), and have the user open it (tap on phone → OKX app, or copy into a browser); if the link won't open, have them copy the wallet address and bind it manually in the OKX app (**Outcomes → Profile → Settings → API Bind Wallet**). Do **not** ask them to paste the key in chat.
