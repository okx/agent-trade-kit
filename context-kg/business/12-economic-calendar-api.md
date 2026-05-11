<!-- triggers: economic calendar, macro data, GDP, CPI, NFP, FOMC, PMI, interest rate, nonfarm, unemployment, calendar region, news_get_economic_calendar, news_list_calendar_regions, economic-calendar -->
# Economic Calendar Open API v5 Spec

**Source**: OKX Public API `GET /api/v5/public/economic-calendar` (documented in OKX Open API v5).

**Purpose**: Upstream OKX endpoint that backs the MCP `news_get_economic_calendar` and `news_list_calendar_regions` tools in `packages/core/src/tools/news.ts`. Use this as the source of truth when validating request/response shapes, parameter semantics, and rate limits.

## Conventions

- **Base URL**: `/api/v5/public/economic-calendar`
- **Method**: `GET`
- **Auth**: `privateGet` (API key + signature required)
- **Rate limit**: 1 request per 5 seconds (IP-based)
- **Data range**: Recent 3 months for standard users; data older than 3 months requires VIP1+
- **Response wrapper**: `{ "code": "0", "msg": "", "data": [...] }`

---

## Endpoint

| Method + Path | Purpose | Rate Limit |
|---|---|---|
| `GET /api/v5/public/economic-calendar` | List scheduled and released macro-economic events (GDP, CPI, NFP, PMI, FOMC, etc.) | 1 req / 5s (IP) |

---

## Request Parameters

| Param | Type | Required | Default | Notes |
|---|---|---|---|---|
| `region` | String | No | — | Country/region filter in **snake_case** (e.g. `united_states`, `euro_area`, `japan`). 210+ valid values; invalid values return empty results silently. See `news_list_calendar_regions` for the full list. |
| `importance` | String | No | — (all levels) | Importance level: `1` = low, `2` = medium, `3` = high. Omit to return all levels. |
| `before` | String | No | — | **Lower time bound** — returns events **NEWER** than this timestamp. ⚠️ **Reversed semantics**: despite the name `before`, this acts as the lower bound (floor). Unix milliseconds. |
| `after` | String | No | now | **Upper time bound** — returns events **OLDER** than this timestamp. ⚠️ **Reversed semantics**: despite the name `after`, this acts as the upper bound (ceiling). Default = current time (returns past events). Unix milliseconds. |
| `limit` | String | No | `100` | Number of results to return. Maximum `100`. Minimum `1`. |

### ⚠️ Reversed `before` / `after` Semantics

The `before` and `after` parameters have **counterintuitive semantics** compared to standard OKX pagination:

- `before` = lower bound = events **newer than** this timestamp (i.e. events that happened **before** now but **after** this point)
- `after` = upper bound = events **older than** this timestamp

To query a **future-event window** (e.g. upcoming events), set `before=now` and `after=future_timestamp`. To query **historical events**, set `after=past_timestamp` (or omit to default to now) and optionally `before=older_timestamp`.

---

## Response Field Schema (`data[]`)

| Field | Type | Description |
|---|---|---|
| `calendarId` | String | Unique event identifier |
| `date` | String | Event scheduled time (Unix ms) |
| `region` | String | Country/region in snake_case (e.g. `united_states`) |
| `category` | String | Event category (e.g. `GDP`, `Interest Rate`, `Labor`) |
| `event` | String | Full event name/description |
| `refDate` | String | Reference period date (Unix ms) — the period the data applies to |
| `actual` | String | Actual released value (empty if not yet released) |
| `forecast` | String | Market consensus forecast value |
| `previous` | String | Previous period's value |
| `prevInitial` | String | Previous period's initial (unrevised) value — may differ from `previous` if revised |
| `importance` | String | `1` = low, `2` = medium, `3` = high |
| `ccy` | String | Related currency (e.g. `USD`, `EUR`) |
| `unit` | String | Data unit (e.g. `%`, `K`, `M`). May be empty for dimensionless values. |
| `dateSpan` | String | Reporting period span indicator |
| `uTime` | String | Last update time (Unix ms) |

---

## Mapping to MCP / CLI

| MCP Tool | CLI Command | Backing API |
|---|---|---|
| `news_get_economic_calendar` | `okx news economic-calendar` | `GET /api/v5/public/economic-calendar` |
| `news_list_calendar_regions` | `okx news list-regions` | Local — returns hardcoded region list (no API call) |

### MCP Tool: `news_get_economic_calendar`

- **Rate limit**: `publicRateLimit("news_get_economic_calendar", 0.2)` — 1 req / 5 seconds, matching the upstream IP-based limit
- **Handler**: Clamps `limit` to `Math.min(rawLimit, 100)`; passes `region`, `importance`, `before`, `after` as-is
- **Auth**: `privateGet` (despite the `/public/` path prefix, the endpoint requires authentication)

### MCP Tool: `news_list_calendar_regions`

- **No API call** — returns the hardcoded `CALENDAR_REGIONS` array (210+ snake_case values)
- **Use case**: Verify a region value when `news_get_economic_calendar` returns empty results, or help users pick a valid region

## Region Values

210+ valid snake_case region codes including sovereign states (e.g. `united_states`, `china`, `japan`, `germany`), supranational entities (`euro_area`, `european_union`, `g7`, `g20`), international organizations (`imf`, `opec`), and the aggregate `world`. Full list available via `news_list_calendar_regions`.
