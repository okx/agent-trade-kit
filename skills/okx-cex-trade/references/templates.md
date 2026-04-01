# MCP Tool Reference & Output Conventions

## MCP Tool Reference

| Tool | Description |
|---|---|
| `spot_place_order` | Place spot order |
| `spot_cancel_order` | Cancel spot order |
| `spot_amend_order` | Amend spot order |
| `spot_place_algo_order` | Place spot TP/SL algo |
| `spot_amend_algo_order` | Amend spot algo |
| `spot_cancel_algo_order` | Cancel spot algo |
| `spot_get_orders` | List spot orders |
| `spot_get_order` | Get single spot order |
| `spot_get_fills` | Spot fill history |
| `spot_get_algo_orders` | List spot algo orders |
| `swap_place_order` | Place swap order |
| `swap_cancel_order` | Cancel swap order |
| `swap_amend_order` | Amend swap order |
| `swap_close_position` | Close swap position |
| `swap_set_leverage` | Set swap leverage |
| `swap_place_algo_order` | Place swap TP/SL algo |
| `swap_place_move_stop_order` | Place trailing stop (swap/futures) |
| `swap_amend_algo_order` | Amend swap algo |
| `swap_cancel_algo_orders` | Cancel swap algo |
| `swap_get_positions` | Swap positions |
| `swap_get_orders` | List swap orders |
| `swap_get_order` | Get single swap order |
| `swap_get_fills` | Swap fill history |
| `swap_get_leverage` | Get swap leverage |
| `swap_get_algo_orders` | List swap algo orders |
| `futures_place_order` | Place futures order |
| `futures_cancel_order` | Cancel futures order |
| `futures_amend_order` | Amend futures order |
| `futures_close_position` | Close futures position |
| `futures_set_leverage` | Set futures leverage |
| `futures_place_algo_order` | Place futures TP/SL algo |
| `futures_place_move_stop_order` | Place futures trailing stop |
| `futures_amend_algo_order` | Amend futures algo |
| `futures_cancel_algo_orders` | Cancel futures algo |
| `futures_get_orders` | List futures orders |
| `futures_get_positions` | Futures positions |
| `futures_get_fills` | Futures fill history |
| `futures_get_order` | Get single futures order |
| `futures_get_leverage` | Get futures leverage |
| `futures_get_algo_orders` | List futures algo orders |
| `option_get_instruments` | Option chain (list available contracts) |
| `option_get_greeks` | IV and Greeks by underlying |
| `option_place_order` | Place option order |
| `option_cancel_order` | Cancel option order |
| `option_amend_order` | Amend option order |
| `option_batch_cancel` | Batch cancel up to 20 option orders |
| `option_get_orders` | List option orders |
| `option_get_order` | Get single option order |
| `option_get_positions` | Option positions with live Greeks |
| `option_get_fills` | Option fill history |

---

## Output Conventions

- Always pass `--json` to list/query commands and render results as a Markdown table — never paste raw terminal output
- Every command result includes a `[profile: <name>]` tag for audit reference
- `--json` returns raw OKX API v5 response

## tgtCcy Rule

**Spot / Swap / Futures**: when user specifies a quote-currency amount (e.g. "30 USDT worth"), MUST use `--tgtCcy quote_ccy` and pass the USDT amount as `--sz`. Do NOT manually calculate base currency quantity or contract count — let the API handle the conversion. When user specifies base currency quantity or contract count, omit `--tgtCcy` (defaults to `base_ccy`). Options do NOT support `--tgtCcy` — manual conversion required (see `{baseDir}/references/options-commands.md`).

## Order Amount Safety Rules

- **Order amount mismatch**: If the order would execute at a significantly different amount than the user requested (e.g. due to minSz or conversion), STOP and inform the user. Never auto-adjust order size without explicit user confirmation.
- **No follow-up orders**: After an order executes, if the filled amount materially differs from what the user requested (beyond normal rounding or minimum lot size differences), STOP immediately. Inform the user of the actual filled amount and the discrepancy. Do NOT place any additional orders to compensate for the shortfall or overfill. Wait for explicit user instruction before taking further action.
