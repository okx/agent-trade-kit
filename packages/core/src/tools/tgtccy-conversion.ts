/**
 * tgtCcy conversion layer for SWAP/FUTURES/OPTION orders.
 *
 * OKX API silently ignores tgtCcy for non-SPOT instruments, treating `sz`
 * as contract count regardless. This module detects the case and auto-converts
 * a USDT amount to contract count before the order is sent to the API.
 *
 * Supported modes:
 * - tgtCcy=quote_ccy: sz is nominal value (USDT).
 *   Formula: contracts = floor(usdtAmount / (ctVal * lastPx), lotSz precision)
 * - tgtCcy=margin: sz is margin cost (USDT). Actual notional = sz * lever.
 *   Formula: contracts = floor(marginAmount * lever / (ctVal * lastPx), lotSz precision)
 */

import type { OkxRestClient } from "../client/rest-client.js";
import { ValidationError } from "../utils/errors.js";

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
interface ConversionClient {
  publicGet(
    endpoint: string,
    params: Record<string, unknown>,
    ...rest: unknown[]
  ): Promise<{ endpoint: string; requestTime: string; data: unknown }>;
  privateGet(
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
    throw new Error(`Failed to fetch instrument info for ${instId}: empty instrument list. Cannot determine ctVal for conversion.`);
  }
  const inst = instruments[0];

  const ctValStr = String(inst.ctVal ?? "");
  const ctVal = parseFloat(ctValStr);
  if (!isFinite(ctVal) || ctVal <= 0) {
    throw new Error(`Invalid ctVal "${ctValStr}" for ${instId}. ctVal must be a positive number for conversion.`);
  }

  const minSzStr = String(inst.minSz ?? "1");
  const minSz = parseFloat(minSzStr);
  if (!isFinite(minSz) || minSz <= 0) {
    throw new Error(`Invalid minSz "${minSzStr}" for ${instId}. minSz must be a positive number for conversion.`);
  }

  const lotSzStr = String(inst.lotSz ?? "1");
  const lotSz = parseFloat(lotSzStr);
  if (!isFinite(lotSz) || lotSz <= 0) {
    throw new Error(`Invalid lotSz "${lotSzStr}" for ${instId}. lotSz must be a positive number for conversion.`);
  }

  return { ctVal, ctValStr, minSz, minSzStr, lotSz, lotSzStr };
}

function extractLastPx(instId: string, data: unknown): { lastPx: number; lastStr: string } {
  const tickers = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  if (tickers.length === 0) {
    throw new Error(`Failed to fetch ticker price for ${instId}: empty ticker response. Cannot determine last price for conversion.`);
  }
  const lastStr = String(tickers[0].last ?? "");
  const lastPx = parseFloat(lastStr);
  if (!isFinite(lastPx) || lastPx <= 0) {
    throw new Error(`Invalid last price "${lastStr}" for ${instId}. Last price must be a positive number for conversion.`);
  }
  return { lastPx, lastStr };
}

function extractLeverage(instId: string, mgnMode: string, data: unknown): { lever: number; leverStr: string } {
  const leverageData = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  if (leverageData.length === 0) {
    throw new Error(
      `Failed to fetch leverage info for ${instId} (mgnMode=${mgnMode}): empty response. ` +
        `Cannot determine leverage for margin conversion. Please set leverage first using set_leverage.`,
    );
  }
  const leverStr = String(leverageData[0].lever ?? "1");
  const lever = parseFloat(leverStr);
  if (!isFinite(lever) || lever <= 0) {
    throw new Error(`Invalid leverage "${leverStr}" for ${instId}. Leverage must be a positive number for margin conversion.`);
  }
  return { lever, leverStr };
}

interface ConversionParams {
  instId: string;
  sz: string;
  isMarginMode: boolean;
  inst: InstrumentParams;
  lastPx: number;
  lastStr: string;
  lever: number;
  leverStr: string;
}

function computeContracts(p: ConversionParams): { contractsStr: string; conversionNote: string } {
  const { instId, sz, isMarginMode, inst, lastPx, lastStr, lever, leverStr } = p;
  const { ctVal, ctValStr, minSz, minSzStr, lotSz, lotSzStr } = inst;

  const userAmount = parseFloat(sz);
  const contractValue = ctVal * lastPx;
  const effectiveNotional = isMarginMode ? userAmount * lever : userAmount;
  const lotSzDecimals = lotSzStr.includes(".") ? lotSzStr.split(".")[1].length : 0;
  const precision = 10 ** (lotSzDecimals + 4);
  const rawContracts = Math.round((effectiveNotional / contractValue) * precision) / precision;
  const rawLots = Math.round((rawContracts / lotSz) * precision) / precision;
  const contractsRounded = parseFloat((Math.floor(rawLots) * lotSz).toFixed(lotSzDecimals));

  if (contractsRounded < minSz) {
    const minAmount = isMarginMode
      ? (minSz * contractValue / lever).toFixed(2)
      : (minSz * contractValue).toFixed(2);
    const unit = isMarginMode ? "USDT margin" : "USDT";
    throw new Error(
      `sz=${sz} ${unit} is too small for ${instId}. ` +
        `Minimum order size is ${minSzStr} contracts (≈ ${minAmount} ${unit}). ` +
        `(ctVal=${ctValStr}, lastPx=${lastStr}, minSz=${minSzStr}, lotSz=${lotSzStr}` +
        (isMarginMode ? `, lever=${leverStr}` : "") + `).\n`,
    );
  }

  const contractsStr = contractsRounded.toFixed(lotSzDecimals);
  const conversionNote = isMarginMode
    ? `Converting ${sz} USDT margin (${leverStr}x leverage) → ${contractsStr} contracts ` +
      `(notional value ≈ ${(contractsRounded * contractValue).toFixed(2)} USDT, ` +
      `ctVal=${ctValStr}, lastPx=${lastStr}, lever=${leverStr}, minSz=${minSzStr}, lotSz=${lotSzStr})`
    : `Converting ${sz} USDT → ${contractsStr} contracts ` +
      `(ctVal=${ctValStr}, lastPx=${lastStr}, minSz=${minSzStr}, lotSz=${lotSzStr})`;

  return { contractsStr, conversionNote };
}

/**
 * Resolve the sz parameter for a contract order.
 *
 * Fast path: if tgtCcy is undefined or "base_ccy", returns unchanged.
 * Throws ValidationError for unknown tgtCcy values.
 * Conversion: fetches instrument params + ticker (+ leverage for margin mode),
 * then delegates to computeContracts() for the math.
 */
export async function resolveQuoteCcySz(
  instId: string,
  sz: string,
  tgtCcy: string | undefined,
  instType: string,
  client: OkxRestClient | ConversionClient,
  tdMode?: string,
): Promise<QuoteCcyResult> {
  // passthrough: undefined or base_ccy (default behavior, no conversion needed)
  if (tgtCcy === undefined || tgtCcy === "base_ccy") {
    return { sz, tgtCcy, conversionNote: undefined };
  }
  // only quote_ccy and margin enter conversion
  if (tgtCcy !== "quote_ccy" && tgtCcy !== "margin") {
    throw new ValidationError(
      `Unknown tgtCcy value "${tgtCcy}". Valid values: base_ccy, quote_ccy, margin.`,
      `Check the --tgtCcy flag. Use base_ccy (default, sz in contracts), quote_ccy (sz in USDT notional), or margin (sz in USDT margin cost).`,
    );
  }

  const isMarginMode = tgtCcy === "margin";
  if (isMarginMode && !tdMode) {
    throw new Error(
      "tdMode (cross or isolated) is required when tgtCcy=margin. " +
        "Cannot determine leverage without knowing the margin mode.",
    );
  }

  const mgnMode = tdMode === "cross" ? "cross" : "isolated";
  const fetchPromises: Promise<{ endpoint: string; requestTime: string; data: unknown }>[] = [
    (client as ConversionClient).publicGet("/api/v5/public/instruments", { instType, instId }),
    (client as ConversionClient).publicGet("/api/v5/market/ticker", { instId }),
  ];
  if (isMarginMode) {
    fetchPromises.push((client as ConversionClient).privateGet("/api/v5/account/leverage-info", { instId, mgnMode }));
  }
  const results = await Promise.all(fetchPromises);

  const inst = extractInstrumentParams(instId, results[0].data);
  const { lastPx, lastStr } = extractLastPx(instId, results[1].data);
  const { lever, leverStr } = isMarginMode
    ? extractLeverage(instId, mgnMode, results[2].data)
    : { lever: 1, leverStr: "1" };

  const { contractsStr, conversionNote } = computeContracts({
    instId, sz, isMarginMode, inst, lastPx, lastStr, lever, leverStr,
  });

  return { sz: contractsStr, tgtCcy: undefined, conversionNote };
}
