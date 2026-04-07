/**
 * tgtCcy=quote_ccy conversion layer for SWAP/FUTURES orders.
 *
 * OKX API silently ignores tgtCcy for non-SPOT instruments, treating `sz`
 * as contract count regardless. This module detects the case and auto-converts
 * a USDT amount to contract count before the order is sent to the API.
 *
 * Formula: contracts = floor(usdtAmount / (ctVal * lastPx), lotSz precision)
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

interface InstrumentParams {
  ctVal: number;
  ctValStr: string;
  minSz: number;
  minSzStr: string;
  lotSz: number;
  lotSzStr: string;
}

function extractInstrumentParams(instId: string, data: unknown): InstrumentParams {
  const instruments = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  if (instruments.length === 0) {
    throw new Error(`Failed to fetch instrument info for ${instId}: empty instrument list. Cannot determine ctVal for quote_ccy conversion.`);
  }
  const inst = instruments[0];

  const ctValStr = String(inst.ctVal ?? "");
  const ctVal = parseFloat(ctValStr);
  if (!isFinite(ctVal) || ctVal <= 0) {
    throw new Error(`Invalid ctVal "${ctValStr}" for ${instId}. ctVal must be a positive number for quote_ccy conversion.`);
  }

  const minSzStr = String(inst.minSz ?? "1");
  const minSz = parseFloat(minSzStr);
  if (!isFinite(minSz) || minSz <= 0) {
    throw new Error(`Invalid minSz "${minSzStr}" for ${instId}. minSz must be a positive number for quote_ccy conversion.`);
  }

  const lotSzStr = String(inst.lotSz ?? "1");
  const lotSz = parseFloat(lotSzStr);
  if (!isFinite(lotSz) || lotSz <= 0) {
    throw new Error(`Invalid lotSz "${lotSzStr}" for ${instId}. lotSz must be a positive number for quote_ccy conversion.`);
  }

  return { ctVal, ctValStr, minSz, minSzStr, lotSz, lotSzStr };
}

function extractLastPx(instId: string, data: unknown): { lastPx: number; lastStr: string } {
  const tickers = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  if (tickers.length === 0) {
    throw new Error(`Failed to fetch ticker price for ${instId}: empty ticker response. Cannot determine last price for quote_ccy conversion.`);
  }
  const lastStr = String(tickers[0].last ?? "");
  const lastPx = parseFloat(lastStr);
  if (!isFinite(lastPx) || lastPx <= 0) {
    throw new Error(`Invalid last price "${lastStr}" for ${instId}. Last price must be a positive number for quote_ccy conversion.`);
  }
  return { lastPx, lastStr };
}

/**
 * Resolve the sz parameter for a contract order.
 *
 * Fast path: if tgtCcy is not "quote_ccy", returns the original sz and tgtCcy unchanged.
 *
 * Conversion path (tgtCcy=quote_ccy):
 * 1. Fetches ctVal, minSz, lotSz from /api/v5/public/instruments
 * 2. Fetches lastPx from /api/v5/market/ticker
 * 3. Calculates contracts = floor(sz / (ctVal * lastPx) / lotSz) * lotSz, checks >= minSz
 * 4. Returns converted sz (contract count) and tgtCcy=undefined
 */
export async function resolveQuoteCcySz(
  instId: string,
  sz: string,
  tgtCcy: string | undefined,
  instType: string,
  client: OkxRestClient | PublicClient,
): Promise<QuoteCcyResult> {
  if (tgtCcy !== "quote_ccy") {
    return { sz, tgtCcy, conversionNote: undefined };
  }

  const [instrumentsRes, tickerRes] = await Promise.all([
    (client as PublicClient).publicGet("/api/v5/public/instruments", { instType, instId }),
    (client as PublicClient).publicGet("/api/v5/market/ticker", { instId }),
  ]);

  const { ctVal, ctValStr, minSz, minSzStr, lotSz, lotSzStr } = extractInstrumentParams(instId, instrumentsRes.data);
  const { lastPx, lastStr } = extractLastPx(instId, tickerRes.data);

  // Calculate contracts: round down to lotSz precision, then check against minSz
  const usdtAmount = parseFloat(sz);
  const contractValue = ctVal * lastPx;
  const lotSzDecimals = lotSzStr.includes(".") ? lotSzStr.split(".")[1].length : 0;
  const precision = 10 ** (lotSzDecimals + 4);
  const rawContracts = Math.round((usdtAmount / contractValue) * precision) / precision;
  const rawLots = Math.round((rawContracts / lotSz) * precision) / precision;
  const contractsRounded = parseFloat((Math.floor(rawLots) * lotSz).toFixed(lotSzDecimals));

  if (contractsRounded < minSz) {
    const minUsdt = (minSz * contractValue).toFixed(2);
    throw new Error(
      `sz=${sz} USDT is too small for ${instId}. ` +
        `Minimum order size is ${minSzStr} contracts (≈ ${minUsdt} USDT). ` +
        `(ctVal=${ctValStr}, lastPx=${lastStr}, minSz=${minSzStr}, lotSz=${lotSzStr}).`,
    );
  }

  const contractsStr = contractsRounded.toFixed(lotSzDecimals);
  const conversionNote =
    `Converting ${sz} USDT → ${contractsStr} contracts ` +
    `(ctVal=${ctValStr}, lastPx=${lastStr}, minSz=${minSzStr}, lotSz=${lotSzStr}, ` +
    `formula: floor(round(${sz} / (${ctValStr} × ${lastStr})) / ${lotSzStr}) × ${lotSzStr} = ${contractsStr})`;

  return { sz: contractsStr, tgtCcy: undefined, conversionNote };
}
