<!-- triggers: site, global, eea, us, tr, compatibility, region, 51155, 51734, smoke-test, okcoin, endpoint restriction, multi-site -->
# Multi-Site Support & Compatibility

## Regional Sites

OKX operates separate regulatory environments with distinct API domains:

| Site ID | API Base URL | Regulatory Region | Notes |
|---------|-------------|-------------------|-------|
| `global` | `https://www.okx.com` | Global (default) | Full feature set |
| `eea` | `https://eea.okx.com` | EU / EEA | Reduced instrument/feature set |
| `us` | `https://us.okx.com` | United States | Further restrictions apply |
| `tr` | `https://tr.okx.com` | Türkiye | Newly added; compatibility pending smoke test |

The base URLs are defined in `packages/core/src/constants.ts` under `OKX_SITES`. Each site has a distinct subdomain under `okx.com`.

## EEA-Specific Restrictions

The EEA site is subject to European financial regulations. Known limitations:

- **No `leverage-info` endpoint**: `account_get_leverage_info` returns OKX error `51155` ("Feature not supported in this region"). The agent should not attempt to set or query leverage for EEA accounts.
- **Reduced instrument list**: some perpetual swaps and derivatives are not available in the EEA region.
- **Account mode**: EEA accounts may be locked to specific margin modes (e.g., isolated margin only).

When a user reports `51155` errors, check if they are on the EEA site and which feature triggered the error. See `docs/site-compatibility.md` for the full matrix.

## US-Specific Restrictions

The US site is regulated by FinCEN/CFTC framework:

- **Account mode limitations**: US accounts may use a different position/margin model.
- **OKX error `51734`**: "Instrument not available in current account mode" — this appears frequently when spot margin or cross-margin operations are attempted on US accounts.
- Fewer derivatives instruments available compared to Global.

## Compatibility Matrix

The full compatibility matrix is maintained in `docs/site-compatibility.md`. It lists each MCP module/tool and which sites support it. When adding a new tool, update this matrix.

## Smoke Test

The repo includes a smoke test workflow (`.github/workflows/smoke-test.yml`) that runs a subset of read-only tool calls against the live OKX API to verify site compatibility after each release.

The smoke test:
1. Uses environment variable credentials (demo mode)
2. Calls `market_get_ticker`, `account_get_balance`, and a few other non-write tools
3. Verifies the response structure matches the expected schema
4. Runs against all sites (global, eea, us, tr) if credentials are available

## Adding a New Tool with Site Restrictions

If a new tool's underlying OKX endpoint is not supported on all sites:

1. Add a site guard in the tool handler:
   ```typescript
   if (config.site !== 'global') {
     throw new OkxMcpError(`This feature is only available on the Global site (current: ${config.site})`);
   }
   ```
2. Update `docs/site-compatibility.md` to mark the tool as restricted
3. Add a note in the tool's `description` field: "Not available on EEA or US sites."

## Constants Location

All site-related constants (base URLs, site IDs, region names) are centralized in `packages/core/src/constants.ts`. Never hardcode `okx.com` or `okcoin.com` URLs in tool handlers — always use the `RestClient` which reads the site-resolved base URL from config.
