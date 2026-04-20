# Event Contract Workflows — Multi-Step Trading Scenarios

> **Display rule**: When presenting tool results to users, always use user-facing labels
> (e.g., "Order number", "Contract", "Fill price"), not raw API field names
> (e.g., `ordId`, `instId`, `fillPx`).

> **Category naming rule**: When summarizing contract types in user-facing text,
> do not use internal category names like `above`, `up/down`.
> Use product language: "Price Above Target" contracts, "Price Direction (Up/Down)" contracts.

## Scenario 1: Discover Available Markets

> User: "What BTC event contracts are available?"

```
Step 1: okx event browse --underlying BTC-USD
→ Preferred entry point: returns active contracts grouped by product type

Step 2: if the user wants one specific series, refine with:
okx event markets BTC-ABOVE-DAILY --state live
→ Returns Contract, Target price, Probability, Outcome, and settlement context
→ If live `px` is present, it is the event contract price (0.01–0.99), not the underlying asset price — reflects the market-implied probability when actively trading

Step 3:
→ Present the available contracts directly from event results
→ If multiple strikes/periods exist, explain the expiry window and what YES/NO or UP/DOWN means
→ Only show a probability number when a live `px`/quote is actually available from the response
```

Trading card format:
```
Will BTC close above the following prices today? (Expires: 2026-03-20 16:00, 3h 20min remaining)

Strike 69,700: Probability 54.8%  Buy YES @ 0.548 | Buy NO @ ~0.452
Strike 69,800: Probability 45.2%  Buy YES @ 0.452 | Buy NO @ ~0.548
Strike 69,900: No live quote available

Buy YES = bet that BTC > strike at expiry; max gain per contract is (1 − entry price), max loss is entry price.
```

`Probability 54.8%` above is derived from `px=0.548`. For event contracts, `px` is the event contract price (0.01–0.99), not the underlying asset price. When actively trading, it reflects the market-implied probability.

---

## Scenario 2: Place Above Contract Order (YES/NO)

> User: "I want to buy 10 contracts of BTC above 69,700 (YES), limit price 0.6"

```
Step 1: Show summary before placing:
→ Cost = sz × px (e.g. 10 × 0.6 = 6)
→ Max gain = sz × (1 − px) (e.g. 10 × 0.4 = 4)
→ Max loss = cost (e.g. 6)

Step 2: [user confirms]
okx event place BTC-ABOVE-DAILY-260320-1600-69700 buy YES 10 --px 0.6 --ordType limit
```

After success: check Status, Order number, order type, and offer to check fill status (`okx event orders --state live`).

---

## Scenario 3: Direction Analysis (UP/DOWN Contracts)

> Trigger: user asks about UP/DOWN contracts without specifying direction, or asks "should I buy UP or DOWN?"

Extract the underlying from the seriesId (e.g. `BTC-UPDOWN-15MIN` → `BTC-USDT`) and fetch candle data in parallel:

```
Step 1 (parallel):
  okx market index-candles BTC-USDT --bar 15m --limit 20  → recent 20 candles of 15m OHLCV
  okx market index-candles BTC-USDT --bar 1H --limit 8    → 8 candles of 1H for trend context
```

Analyze the raw OHLCV data and present:
- Overall trend direction (based on recent closes and highs/lows pattern)
- Short-term momentum (last few candles)
- Recommended direction: **UP** or **DOWN**
- Confidence: High / Medium / Low
- Brief reasoning (2–3 sentences)

Then ask: "Based on the analysis, I recommend **{UP/DOWN}** ({confidence}). Would you like to place the order in that direction, or choose differently?"

This is a data-driven suggestion — the user makes the final call.

---

## Scenario 4: Check Order Status After Placing

> User: "Has my order been filled?"

```
Step 1: okx event orders --instId <instId> --state live
→ found: "Still resting in the order book"
→ empty: filled or cancelled

Step 2: okx event fills --instId <instId> --limit 5
→ fill found: confirm Fill size, Fill price, Time
→ no fill: order was cancelled
```

Response includes: Fill price, Fill size, timestamp, and a next-step offer (hold or set exit target).

---

## Scenario 5: Place 15min Contract (UP/DOWN)

> User: "Bet that BTC rises in the next 15 minutes — buy 5 contracts, market order"

```
Step 1: okx event markets BTC-UPDOWN-15MIN --state live
→ Find current live 15min event and its instrument ID

Step 2: [user confirms]
okx event place BTC-UPDOWN-15MIN-260320-1600-1615 buy UP 5 --ordType market
→ For market orders, sz is quote currency amount (e.g. 5)
```

For market orders: note that they fill immediately; offer to confirm via `okx event fills`.

---

## Scenario 6: Check Positions and Context

> User: "What event contract positions do I currently have?"

```
okx account positions --instType EVENTS
```

**Expiry check (MANDATORY before displaying anything):**
- Infer expiry from the instrument ID (`instId`, API field):
  - `price_above` / `price_once_touch`: `YYMMDD-HHMM` → e.g. `260320-1600` = 2026-03-20 16:00 UTC+8
  - `price_up_down`: `YYMMDD-START-END` → expiry is the `END` time
- If expired → **immediately run without asking**:
  ```
  okx event markets <seriesId> --state expired
  ```
  Include settlement result in the same response. Never say "I can check for you" — just check.
  If no data yet: "Settlement data not yet available — please retry in a few minutes."
- If expires within 1 hour → mark 🔴 Settling soon

Active position response includes: entry price, current market price, unrealized PnL, exit value, breakeven, time remaining, expiry condition.

Expired position response includes: ⚠️ warning, settlement price, outcome (YES/NO/UP/DOWN), expected payout.

> User: "Close my YES position"

```
Step 1: [user confirms]
okx event place BTC-ABOVE-DAILY-260320-1600-69700 sell YES 10 --ordType market
```

Use the same outcome that the position was opened with. Do not pass extra exchange-internal fields such as `reduceOnly`, `tdMode`, or `speedBump`.

---

## Scenario 7: Check Settlement Result

> User: "Has today's BTC contract settled? What was the outcome?"

```
okx event markets BTC-ABOVE-DAILY --state expired [--limit 5]
→ Outcome field: CLI returns translated "YES"/"NO"/"UP"/"DOWN"
```

Present as a table with date, strike, settlement price, and outcome (✅/❌).

---

## Scenario 8: Cancel Order

> User: "Cancel order EVT-ORDER-001" / "Cancel my order 800000024"

`okx event cancel` requires both the instrument ID and Order number. If the user only provides the Order number, look up the instrument ID first — never ask the user for it.

```
Step 1: okx event orders --state live
→ if Order number found: use that row's instrument ID
→ if not found: okx event orders [history, no --state flag]
   → find matching Order number, extract instrument ID

Step 2: okx event cancel <instId> <ordId>
→ if cancellation fails because the order no longer exists, it was likely filled or already cancelled
   → offer to check fills or current positions
```

If Order number not found in any order list: explain it may be outside history range or the ID may be incorrect; ask the user for strike price and expiry date to help locate it.

Never show `sCode`. Always give a next step.

---

## Scenario 9: Order History and Fills

---

## Scenario 10: Discover Upcoming Events (state=preopen)

> User: "Are there any BTC contracts opening soon?" / "What's coming up in event contracts?"

Use `state=preopen` to find contracts that exist but are **not yet open for trading**.
This is different from `event_browse` / `okx event browse`, which only returns **active (live) contracts**.

```
Step 1: okx event series [--underlying BTC-USD]
→ Identify relevant seriesId values (e.g. BTC-ABOVE-DAILY, BTC-UPDOWN-15MIN)

Step 2: okx event events <seriesId> --state preopen
→ Returns upcoming expiry periods not yet open for trading
→ Output fields: Event ID, State (preopen), Expiry time

Step 3: okx event markets <seriesId> --state preopen
→ Returns upcoming individual contracts (strikes/directions) for each preopen event
→ No live quote (px) available yet — contracts are not tradeable until state turns live
```

Use `state=preopen` to:
- Warn the user before a contract expires and the next session is preopen
- Help users plan ahead — they can see upcoming strike levels before trading opens
- Distinguish from `event_browse`: browse only shows **currently tradeable** contracts; preopen shows **upcoming** contracts that cannot be traded yet

**Do NOT attempt to place orders on preopen contracts** — they will fail with "instrument not found". Wait until state transitions to `live`.

---

> User: "Show my recent event contract fills"

```
okx event fills [--limit 10]
```

> User: "Any pending orders?"

```
okx event orders --state live
→ if empty: "No open orders at the moment."
```

---

## Key Rules for AI Agents

1. **Place directly after user confirms** — no pre-flight check required.
2. **Check settlement.method**: determines which outcomes apply (UP/DOWN for `price_up_down`; YES/NO for `price_above`/`price_once_touch`).
3. **Confirm outcome with user** if unclear.
4. **px is event contract price, not underlying asset price**: range 0.01–0.99. When actively trading, it reflects the market-implied probability (e.g. 0.55 ≈ 55%). Always explain this.
5. **Present markets as trading cards**: strike + probability + what winning means + time to expiry.
6. **Translate all errors to user language**: never show `sCode`, `code`, or internal field names. Always give a next step.
7. **After every place/cancel/close**, distinguish order type in the follow-up:
   - market order → "typically filled immediately — would you like me to confirm the fill?"
   - limit / post_only → "may still be resting in the order book — would you like me to check? (`okx event orders --state live`)"
8. **Positions show PnL context**: current exit value + breakeven + time remaining + expiry condition.
9. **Never expose implementation details**: outcome codes, speedBump, tdMode, MCP internals.
10. **Settled results**: use `okx event markets <seriesId> --state expired` (CLI) or `event_get_markets(seriesId, state="expired")` (MCP) — there is no separate `event ended` command.
11. **Always append next-step suggestion**: every response ends with a concrete offer for what to do next.
12. **Never expose raw CLI commands to users**: use natural language instead.
13. **Expired positions**: always check expiry before displaying; front-load ⚠️ warning and auto-fetch settlement via `okx event markets <seriesId> --state expired`.
