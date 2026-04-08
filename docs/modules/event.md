# event

Event contract trading module.

## Business Context

Event contract module for binary outcome prediction markets (price up/down, price above, price touch).

## Tools

| Name | R/W | Description |
|---|---|---|
| event_browse | R | Browse currently active (in-progress) event contracts |
| event_get_series | R | List event contract series |
| event_get_events | R | List expiry periods within a series |
| event_get_markets | R | List tradeable contracts with settlement results (live `px` is event contract price 0.01–0.99, not underlying asset price; reflects market-implied probability when actively trading; after expiry returns outcome/settleValue) |
| event_place_order | W | Place an event contract order |
| event_amend_order | W | Amend a pending event contract order |
| event_cancel_order | W | Cancel a pending event contract order |
| event_get_orders | R | Query event contract orders (state=live for open orders) |
| event_get_fills | R | Get event contract fill history |

9 tools

## Token Budget Estimate

Estimated ~1800 tokens (9 tools x ~200)

## Key Field Semantics

- `px`: Event contract price (0.01–0.99), not the underlying asset price. Reflects market-implied probability when actively trading
- `sz`: For market orders = quote currency amount; for limit/post_only orders = number of contracts

## Typical Workflow

Browse series/markets -> Place order -> Query orders/fills
