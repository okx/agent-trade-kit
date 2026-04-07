# Event Contract Workflows — Multi-Step Trading Scenarios

## Scenario 1: Discover Available Markets

> User: "What BTC event contracts are available?"

```
Step 1: okx event series
→ Check settlement.method to explain product type

Step 2: okx event markets BTC-ABOVE-DAILY --state live
→ Returns instId, strike, state — does NOT include current probability

Step 3 (per instId): okx market ticker <instId>
→ Use `last` field as current probability (e.g. last=0.548 → 54.8%)
→ If ticker fails or returns no data: "No live quote available (market may have low liquidity)"
→ Format results as trading cards (not raw tables)
```

Trading card format:
```
Will BTC close above the following prices today? (Expires: 2026-03-20 16:00, 3h 20min remaining)

Strike 69,700: Probability 54.8%  Buy YES @ 0.548 | Buy NO @ ~0.452
Strike 69,800: Probability 45.2%  Buy YES @ 0.452 | Buy NO @ ~0.548
Strike 69,900: No live quote available

Buy YES = bet that BTC > strike at expiry; max gain per contract is (1 − entry price) USDC, max loss is entry price USDC.
```

---

## Scenario 2: Place Above Contract Order (YES/NO)

> User: "I want to buy 10 contracts of BTC above 69,700 (YES), limit price 0.6"

```
Step 1: okx market ticker BTC-ABOVE-DAILY-260320-1600-69700
→ Check current ask; if user's limit px > ask, likely fills immediately

Step 2: Show summary before placing:
→ Cost = sz × px (e.g. 10 × 0.6 = 6 USDT)
→ Max gain = sz × (1 − px) (e.g. 10 × 0.4 = 4 USDT)
→ Max loss = cost (6 USDT)

Step 3: [user confirms]
okx event place BTC-ABOVE-DAILY-260320-1600-69700 buy YES 10 --px 0.6 --ordType limit
```

After success: state ordId, order type, and offer to check fill status (`okx event orders --state live`).

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
→ fill found: confirm sz, fillPx, timestamp
→ no fill: order was cancelled
```

Response includes: fill price, quantity, current max loss (cost + fees), and a next-step offer (hold or set exit target).

---

## Scenario 5: Place 15min Contract (UP/DOWN)

> User: "Bet that BTC rises in the next 15 minutes — buy 5 contracts, market order"

```
Step 1: okx event markets BTC-15MIN --state live
→ Find current live 15min event and its instId

Step 2: [user confirms]
okx event place BTC-15MIN-260320-1600 buy UP 5 --ordType market
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
- Infer expiry from instId date part: `YYMMDD-HHMM` → e.g. `260320-1600` = 2026-03-20 16:00 UTC
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

(`reduceOnly` is automatically applied for sell orders — do not pass it.)

---

## Scenario 7: Check Settlement Result

> User: "Has today's BTC contract settled? What was the outcome?"

```
okx event markets BTC-ABOVE-DAILY --state expired [--limit 5]
→ outcome field: CLI returns "YES"/"NO"/"UP"/"DOWN" (translated from raw "1"/"2")
```

Present as a table with date, strike, settlement price, and outcome (✅/❌).

---

## Scenario 8: Cancel Order

> User: "Cancel order EVT-ORDER-001" / "Cancel my order 800000024"

`okx event cancel` requires both instId and ordId. If the user only provides ordId, look up instId first — never ask the user for it.

```
Step 1: okx event orders --state live
→ if ordId found: use that row's instId
→ if not found: okx event orders [history, no --state flag]
   → find matching ordId, extract instId

Step 2: okx event cancel <instId> <ordId>
→ on sCode 51400: order no longer exists (filled, cancelled, or wrong ID)
   → offer to check fills or current positions
```

If ordId not found in any order list: explain it may be outside history range or the ID may be incorrect; ask the user for strike price and expiry date to help locate it.

Never show `sCode`. Always give a next step.

---

## Scenario 9: Order History and Fills

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
4. **px is probability, not price**: 0.00~1.00 (e.g. 0.55 = 55%). Always explain this.
5. **Present markets as trading cards**: strike + probability + what winning means + time to expiry.
6. **Translate all errors to user language**: never show `sCode`, `code`, or internal field names. Always give a next step.
7. **After every place/cancel/close**, distinguish order type in the follow-up:
   - market order → "typically filled immediately — would you like me to confirm the fill?"
   - limit / post_only → "may still be resting in the order book — would you like me to check? (`okx event orders --state live`)"
8. **Positions show PnL context**: current exit value + breakeven + time remaining + expiry condition.
9. **Never expose implementation details**: outcome codes ("2"), speedBump, tdMode, MCP internals.
10. **Settled results**: use `okx event markets <seriesId> --state expired` (CLI) or `event_get_markets(seriesId, state="expired")` (MCP) — there is no separate `event ended` command.
11. **Always append next-step suggestion**: every response ends with a concrete offer for what to do next.
12. **Never expose raw CLI commands to users**: use natural language instead.
13. **Expired positions**: always check expiry before displaying; front-load ⚠️ warning and auto-fetch settlement via `okx event markets <seriesId> --state expired`.
