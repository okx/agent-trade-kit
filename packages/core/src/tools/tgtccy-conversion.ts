/**
 * tgtCcy=quote_ccy conversion layer for SWAP/FUTURES orders.
 *
 * OKX API silently ignores tgtCcy for non-SPOT instruments, treating `sz`
 * as contract count regardless. This module detects the case and auto-converts
 * a USDT amount to contract count before the order is sent to the API.
 *
 * Formula: contracts = Math.floor(usdtAmount / (ctVal * lastPx))
 */

import type { OkxRestClient } from "../client/rest-client.js";

export interface QuoteCcyResult {
  /** Resolved sz: either original value (passthrough) or converted contract count. */
  sz: string;
  /** Resolved tgtCcy: undefined after conversion (stripped from API request). */
  tgtCcy: string | undefined;
  /** Human-readable note about the conversion. Undefined if no conversion occurred. */
  conversionNote?: string;
}

/**
 * Minimal interface for the client methods we need. Allows easy mocking in tests
 * without depending on the full OkxRestClient class.
 */
interface PublicClient {
  publicGet(
    endpoint: string,
    params: Record<string, unknown>,
    ...rest: unknown[]
  ): Promise<{ endpoint: string; requestTime: string; data: unknown }>;
}

/**
 * Resolve the sz parameter for a contract order.
 *
 * Fast path: if tgtCcy is not "quote_ccy", returns the original sz and tgtCcy unchanged.
 *
 * Conversion path (tgtCcy=quote_ccy):
 * 1. Fetches ctVal from /api/v5/public/instruments
 * 2. Fetches lastPx from /api/v5/market/ticker
 * 3. Calculates contracts = Math.floor(sz / (ctVal * lastPx))
 * 4. Returns converted sz (contract count) and tgtCcy=undefined
 *
 * @param instId   Instrument ID (e.g. "BTC-USDT-SWAP")
 * @param sz       Original sz value from user (USDT amount when tgtCcy=quote_ccy)
 * @param tgtCcy   User-supplied tgtCcy (may be undefined)
 * @param instType Instrument type (e.g. "SWAP", "FUTURES") — used for instruments lookup
 * @param client   OKX REST client (only publicGet is used)
 */
export async function resolveQuoteCcySz(
  instId: string,
  sz: string,
  tgtCcy: string | undefined,
  instType: string,
  client: OkxRestClient | PublicClient,
): Promise<QuoteCcyResult> {
  // Fast path: only intercept quote_ccy
  if (tgtCcy !== "quote_ccy") {
    return { sz, tgtCcy, conversionNote: undefined };
  }

  // Parallel fetch: instruments (for ctVal) + ticker (for lastPx)
  const [instrumentsRes, tickerRes] = await Promise.all([
    (client as PublicClient).publicGet("/api/v5/public/instruments", {
      instType,
      instId,
    }),
    (client as PublicClient).publicGet("/api/v5/market/ticker", { instId }),
  ]);

  // Extract ctVal
  const instruments = Array.isArray(instrumentsRes.data)
    ? (instrumentsRes.data as Record<string, unknown>[])
    : [];
  if (instruments.length === 0) {
    throw new Error(
      `Failed to fetch instrument info for ${instId}: empty instrument list. Cannot determine ctVal for quote_ccy conversion.`,
    );
  }
  const ctValStr = String(instruments[0].ctVal ?? "");
  const ctVal = parseFloat(ctValStr);
  if (!isFinite(ctVal) || ctVal <= 0) {
    throw new Error(
      `Invalid ctVal "${ctValStr}" for ${instId}. ctVal must be a positive number for quote_ccy conversion.`,
    );
  }

  // Extract lastPx
  const tickers = Array.isArray(tickerRes.data)
    ? (tickerRes.data as Record<string, unknown>[])
    : [];
  if (tickers.length === 0) {
    throw new Error(
      `Failed to fetch ticker price for ${instId}: empty ticker response. Cannot determine last price for quote_ccy conversion.`,
    );
  }
  const lastStr = String(tickers[0].last ?? "");
  const lastPx = parseFloat(lastStr);
  if (!isFinite(lastPx) || lastPx <= 0) {
    throw new Error(
      `Invalid last price "${lastStr}" for ${instId}. Last price must be a positive number for quote_ccy conversion.`,
    );
  }

  // Calculate contracts
  const usdtAmount = parseFloat(sz);
  const contractValue = ctVal * lastPx;
  const contracts = Math.floor(usdtAmount / contractValue);

  if (contracts <= 0) {
    const minUsdt = contractValue.toFixed(2);
    throw new Error(
      `sz=${sz} USDT is too small to buy even 1 contract of ${instId}. ` +
        `Minimum amount required is at least ${minUsdt} USDT ` +
        `(ctVal=${ctValStr}, lastPx=${lastStr}, 1 contract = ${minUsdt} USDT).`,
    );
  }

  const conversionNote =
    `Converting ${sz} USDT → ${contracts} contracts ` +
    `(ctVal=${ctValStr}, lastPx=${lastStr}, ` +
    `formula: floor(${sz} / (${ctValStr} × ${lastStr})) = ${contracts})`;

  return {
    sz: String(contracts),
    tgtCcy: undefined,
    conversionNote,
  };
}
