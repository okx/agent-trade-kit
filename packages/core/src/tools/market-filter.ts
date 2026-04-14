import type { ToolSpec } from "./types.js";
import {
  asRecord,
  compactObject,
  normalizeResponse,
  readNumber,
  readString,
  requireString,
} from "./helpers.js";
import { publicRateLimit } from "./common.js";

const OI_BARS = ["5m", "15m", "1H", "4H", "1D"] as const;

export function registerMarketFilterTools(): ToolSpec[] {
  return [
    // ─────────────────────────────────────────────────────────────────────────
    // market_filter — /api/v5/aigc/mcp/market-filter
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: "market_filter",
      module: "market",
      description:
        "Screen / rank instruments across SPOT, SWAP, or FUTURES by multi-dimensional criteria: " +
        "price range, 24h change %, market cap, 24h volume (USD), funding rate (SWAP), " +
        "open interest (USD), listing time. Returns ranked rows with full ticker snapshot. " +
        "Use to find top movers, high-OI contracts, newly listed tokens, etc. No credentials required. " +
        "Do NOT use to get OI change rankings across contracts — use market_filter_oi_change instead. " +
        "Do NOT use to get OI time series for a single instrument — use market_get_oi_history instead.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SPOT", "SWAP", "FUTURES"],
            description: "Instrument type to scan. OPTION is not supported.",
          },
          baseCcy: {
            type: "string",
            description: "Filter by base currency, e.g. BTC",
          },
          quoteCcy: {
            type: "string",
            description: "Filter by quote currency. Comma-separated list supported, e.g. USDT or USDT,USDC",
          },
          settleCcy: {
            type: "string",
            description: "Filter by settlement currency (SWAP/FUTURES only), e.g. USDT",
          },
          instFamily: {
            type: "string",
            description: "Filter by instrument family (SWAP/FUTURES only), e.g. BTC-USD",
          },
          ctType: {
            type: "string",
            enum: ["linear", "inverse"],
            description: "Contract type filter (SWAP/FUTURES only): linear or inverse",
          },
          // Numeric range filters
          minLast: {
            type: "string",
            description: "Minimum last price (USD), e.g. 10000",
          },
          maxLast: {
            type: "string",
            description: "Maximum last price (USD), e.g. 100000",
          },
          minChg24hPct: {
            type: "string",
            description: "Minimum 24h price change %, e.g. -5 means -5%",
          },
          maxChg24hPct: {
            type: "string",
            description: "Maximum 24h price change %, e.g. 10 means 10%",
          },
          minMarketCapUsd: {
            type: "string",
            description: "Minimum market cap in USD (SPOT only; ignored for SWAP/FUTURES)",
          },
          maxMarketCapUsd: {
            type: "string",
            description: "Maximum market cap in USD (SPOT only; ignored for SWAP/FUTURES)",
          },
          minVolUsd24h: {
            type: "string",
            description: "Minimum 24h volume in USD",
          },
          maxVolUsd24h: {
            type: "string",
            description: "Maximum 24h volume in USD",
          },
          minFundingRate: {
            type: "string",
            description: "Minimum funding rate (SWAP only), e.g. 0.0001",
          },
          maxFundingRate: {
            type: "string",
            description: "Maximum funding rate (SWAP only), e.g. 0.001",
          },
          minOiUsd: {
            type: "string",
            description: "Minimum open interest in USD",
          },
          maxOiUsd: {
            type: "string",
            description: "Maximum open interest in USD",
          },
          // Sort / pagination
          sortBy: {
            type: "string",
            enum: ["last", "chg24hPct", "marketCapUsd", "volUsd24h", "fundingRate", "oiUsd", "listTime"],
            description: "Sort field. Default: volUsd24h. Note: marketCapUsd is only meaningful for SPOT (null for SWAP/FUTURES).",
          },
          sortOrder: {
            type: "string",
            enum: ["asc", "desc"],
            description: "Sort order: asc or desc. Default: desc",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 20, max 100)",
          },
        },
        required: ["instType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const body = compactObject({
          instType: requireString(args, "instType").toUpperCase(),
          baseCcy:        readString(args, "baseCcy"),
          quoteCcy:       readString(args, "quoteCcy"),
          settleCcy:      readString(args, "settleCcy"),
          instFamily:     readString(args, "instFamily"),
          ctType:         readString(args, "ctType"),
          minLast:        readString(args, "minLast"),
          maxLast:        readString(args, "maxLast"),
          minChg24hPct:   readString(args, "minChg24hPct"),
          maxChg24hPct:   readString(args, "maxChg24hPct"),
          minMarketCapUsd: readString(args, "minMarketCapUsd"),
          maxMarketCapUsd: readString(args, "maxMarketCapUsd"),
          minVolUsd24h:   readString(args, "minVolUsd24h"),
          maxVolUsd24h:   readString(args, "maxVolUsd24h"),
          minFundingRate: readString(args, "minFundingRate"),
          maxFundingRate: readString(args, "maxFundingRate"),
          minOiUsd:       readString(args, "minOiUsd"),
          maxOiUsd:       readString(args, "maxOiUsd"),
          sortBy:         readString(args, "sortBy"),
          sortOrder:      readString(args, "sortOrder"),
          limit:          readNumber(args, "limit"),
        });
        const response = await context.client.publicPost(
          "/api/v5/aigc/mcp/market-filter",
          body,
          publicRateLimit("market_filter", 5),
        );
        return normalizeResponse(response);
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // market_get_oi_history — /api/v5/aigc/mcp/oi-history
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: "market_get_oi_history",
      module: "market",
      description:
        "Get open interest (OI) history time series for a single SWAP or FUTURES instrument. " +
        "Returns per-bar OI in contracts, base currency and USD, plus bar-over-bar delta and delta %. " +
        "Useful for tracking how OI evolves around price moves. No credentials required. " +
        "Do NOT use to compare OI changes across multiple contracts — use market_filter_oi_change instead. " +
        "Do NOT use to screen instruments by current OI level — use market_filter instead.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instId: {
            type: "string",
            description: "Instrument ID, e.g. BTC-USDT-SWAP",
          },
          bar: {
            type: "string",
            enum: [...OI_BARS],
            description: "Bar size: 5m, 15m, 1H, 4H, 1D. Default: 1H",
          },
          limit: {
            type: "number",
            description: "Number of data points to return (default 50, max 500)",
          },
          ts: {
            type: "number",
            description: "Return bars with timestamp <= this value (Unix ms). Used for historical pagination.",
          },
        },
        required: ["instId"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const body = compactObject({
          instId: requireString(args, "instId"),
          bar:    readString(args, "bar"),
          limit:  readNumber(args, "limit"),
          ts:     readNumber(args, "ts"),
        });
        const response = await context.client.publicPost(
          "/api/v5/aigc/mcp/oi-history",
          body,
          publicRateLimit("market_get_oi_history", 10),
        );
        return normalizeResponse(response);
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // market_filter_oi_change — /api/v5/aigc/mcp/oi-change-filter
    // ─────────────────────────────────────────────────────────────────────────
    {
      name: "market_filter_oi_change",
      module: "market",
      description:
        "Find SWAP or FUTURES instruments with significant open interest changes over a given bar window. " +
        "Returns ranked rows with current OI (USD), previous OI (USD), OI delta (USD and %), " +
        "price change %, 24h volume and funding rate. " +
        "Ideal for spotting unusual accumulation/distribution or confirming trend momentum. " +
        "No credentials required. " +
        "Do NOT use to get OI time series for a single instrument — use market_get_oi_history instead. " +
        "Do NOT use to screen by current OI absolute level or other non-OI metrics — use market_filter instead.",
      isWrite: false,
      inputSchema: {
        type: "object",
        properties: {
          instType: {
            type: "string",
            enum: ["SWAP", "FUTURES"],
            description: "Instrument type: SWAP or FUTURES",
          },
          bar: {
            type: "string",
            enum: [...OI_BARS],
            description: "Bar window for OI change computation: 5m, 15m, 1H, 4H, 1D. Default: 1H",
          },
          // Filters
          minOiUsd: {
            type: "string",
            description: "Minimum current OI in USD (filters small/illiquid contracts)",
          },
          minVolUsd24h: {
            type: "string",
            description: "Minimum 24h volume in USD (filters low-activity contracts)",
          },
          minAbsOiDeltaPct: {
            type: "string",
            description: "Minimum absolute OI change % threshold, e.g. 1.0 means |oiDeltaPct| >= 1.0%",
          },
          // Sort / pagination
          sortBy: {
            type: "string",
            enum: ["oiUsd", "oiDeltaUsd", "oiDeltaPct", "volUsd24h", "last"],
            description: "Sort field. Default: oiDeltaPct (largest movers first)",
          },
          sortOrder: {
            type: "string",
            enum: ["asc", "desc"],
            description: "Sort order: asc or desc. Default: desc",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 20, max 100)",
          },
        },
        required: ["instType"],
      },
      handler: async (rawArgs, context) => {
        const args = asRecord(rawArgs);
        const body = compactObject({
          instType:         requireString(args, "instType").toUpperCase(),
          bar:              readString(args, "bar"),
          minOiUsd:         readString(args, "minOiUsd"),
          minVolUsd24h:     readString(args, "minVolUsd24h"),
          minAbsOiDeltaPct: readString(args, "minAbsOiDeltaPct"),
          sortBy:           readString(args, "sortBy"),
          sortOrder:        readString(args, "sortOrder"),
          limit:            readNumber(args, "limit"),
        });
        const response = await context.client.publicPost(
          "/api/v5/aigc/mcp/oi-change-filter",
          body,
          publicRateLimit("market_filter_oi_change", 5),
        );
        return normalizeResponse(response);
      },
    },
  ];
}
