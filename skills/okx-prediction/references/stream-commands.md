# WebSocket Streaming Commands

Real-time data via OKX Predictions WebSocket. Output is NDJSON when `--json` is set — one compact JSON object per push.

> **CRITICAL**: streams emit forever. **ALWAYS** chain `| head -n N` (e.g. `head -n 20`) when invoking from skill / chat — never let a `ws *` command hang the conversation.

## Environment

| Variable | Default | Description |
|---|---|---|
| `PREDICTIONS_WS_HOST` | `wss://ws.okx.com:8443` | Override WS host per region (HK / EU / US — setup wizard sets this) |
| `PREDICTIONS_DEBUG` | unset | Set to `1` for verbose SDK logs |

## Command shape

```bash
okx prediction ws <channel> [<assetId>...] [--json]
```

`assetId` is positional (numeric outcome-token id, e.g. `100170100`). Pass multiple to batch-subscribe:

```bash
okx prediction ws prices 100170100 100888000 --json | head -n 20
```

Channels with no positional id: `terminal`, all private channels (`orders`, `positions`, `balance`, `user-trades`, `pnl`, `private`).

> `ws status` and `ws doctor` no longer exist in the binary; they were retired. Use `ws event-status <eventId>` for settlement signals.

---

## Public channels (no auth)

### ws prices \<assetId...\>

Real-time YES/NO price ticks. Channel: `prediction-market-prices`.

```bash
okx prediction ws prices 100170100 --json | head -n 20
```

### ws books \<assetId...\>

Order-book depth with checksum. Channel: `pm-books`. Also internally subscribes `prediction-market-prices` for mid-point context.

```bash
okx prediction ws books 100170100 --json | head -n 10
```

### ws trades \<assetId...\>

Public trade tape — one row per public trade. Channel: `pm-trades`.

```bash
okx prediction ws trades 100170100 --json | head -n 20
okx prediction ws trades 100170100 --json | jq '.px'
```

### ws tickers \<assetId...\>

16-field ticker push. Channel: `pm-tickers`.

```bash
okx prediction ws tickers 100170100 --json | head -n 5
```

### ws event-status \<eventId...\>

Event settlement results (for negRisk / multi-outcome events). Channel: `pm-event-status`. The CLI auto-prefixes `event-` if missing.

```bash
okx prediction ws event-status 12345 --json | head -n 5
okx prediction ws event-status event-12345 --json | head -n 5    # also accepted
```

Use this right before `ctf redeem` to verify the winning outcome.

### ws game \<gameId...\>

Sports game score push. Channel: `game-status`. ID is the raw `gameId` (no prefix).

```bash
okx prediction ws game 1317359 --json | head -n 10
```

### ws candle\<period\> \<assetId...\>

K-line stream. Any period maps to `pm-candle<period>`: `candle1m`, `candle5m`, `candle15m`, `candle1H`, `candle4H`, `candle1D`.

```bash
okx prediction ws candle1m 100170100 --json | head -n 30
okx prediction ws candle1H 100170100 --json | head -n 5
```

---

## Private channels (HMAC auth required)

All require `PREDICTIONS_API_KEY` / `SECRET` / `PASSPHRASE` in `.env`. The SDK sends a login frame on connect.

| Command | Channel | Description |
|---|---|---|
| `okx prediction ws orders` | `pm-order` | Order status changes (OPEN / FILLED / CANCELLED) |
| `okx prediction ws positions` | `pm-position` | Position changes |
| `okx prediction ws balance` | `pm-balance` | Balance changes |
| `okx prediction ws user-trades` | `pm-user-trade` | Trade execution details |
| `okx prediction ws pnl` | `pm-pnl` | Floating P&L updates |
| `okx prediction ws private` | (all 5 above) | Subscribe to every private channel at once |

```bash
okx prediction ws orders --json | head -n 10
okx prediction ws private --json | head -n 30
```

---

## TUI: ws terminal \[assetId\]

Full-screen ratatui trading terminal — chart + orderbook + trades + portfolio + quick trade.

```bash
okx prediction ws terminal                  # default starting asset
okx prediction ws terminal 100170100        # pre-select an asset
```

Layout includes:
- Markets list (from trending API)
- Price chart (line / candle toggle with `v`)
- Real-time orderbook + trades
- Portfolio panel (balance / positions / orders)
- Quick Trade mode (`t` to BUY, `s` to SELL)

**Keybindings — normal mode**:

| Key | Action |
|---|---|
| `q` / `Esc` / `Ctrl+C` | Quit |
| `j` / `k` (or arrows) | Select market |
| `Enter` | Switch to selected market |
| `t` | BUY mode |
| `s` | SELL mode |
| `r` | Refresh REST data |
| `v` | Toggle chart line/candle |

**Keybindings — trade mode**:

| Key | Action |
|---|---|
| `Esc` | Cancel trade |
| `Tab` / arrows | Toggle YES / NO |
| `Down` / `Up` | Next / previous field |
| `0-9` / `.` | Type digits |
| `Backspace` | Delete |
| `Enter` | Next field, or submit on size field |

> The TUI takes over stdin/stdout. Skills should only launch it on **explicit user request** ("open terminal", "TUI", "trade terminal").

---

## Output handling guidance

| Scenario | Recommendation |
|---|---|
| Snapshot ("show me a few ticks") | `--json \| head -n 10` |
| User wants "live", brief watch | `--json \| head -n 60` |
| Long-running monitor | Run in a separate terminal, NOT through the skill |
| Pipe into jq for filtering | Always include `--json` first |
| Single value extraction | `--json \| head -n 1 \| jq '.px'` |

---

## Edge cases

- **Connection drops mid-stream**: SDK retries with backoff. If user sees repeated reconnects, ask them to check `PREDICTIONS_WS_HOST` or run `okx prediction status`.
- **Private channel login fails**: typically a wrong `PREDICTIONS_API_PASSPHRASE`. Re-run `okx prediction setup`.
- **Subscribing to many assets**: each adds to the subscription frame; large batches may hit server-side limits. Prefer batches of ≤ 20.
- **Time zone**: timestamps in NDJSON are UTC milliseconds; convert in jq if needed (`(.ts | tonumber / 1000 | strftime("%Y-%m-%dT%H:%M:%SZ"))`).
- **`ws status` removed**: prior market-status channel command was retired. The information is now part of `data market <id>` (snapshot) and `data event-markets <id>` (full state).
- **`ws doctor` removed**: developer diagnostic retired from the binary.
