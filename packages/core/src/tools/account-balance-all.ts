import type { ToolContext } from "./types.js";
import { asRecord, compactObject, readBoolean, readString } from "./helpers.js";
import { privateRateLimit } from "./common.js";
import { AuthenticationError, OkxApiError } from "../utils/errors.js";

/**
 * Orchestration for `account_get_balance_all`.
 *
 * Strategy (OPRS-360 follow-up): prefer the server-side aggregate endpoint
 * (gateway-forwarded to okcoin-rubik BalanceAggregateOpenApiController), which
 * returns trading + funding + optional valuation in ONE call. If that call
 * fails for any reason other than authentication, fall back to querying the
 * three OKX v5 endpoints directly in parallel (the original behaviour).
 *
 * Both paths are funnelled through a single normalizer so callers see one
 * stable contract regardless of which path produced the data:
 *   { trading?, funding?, valuation?, meta }
 *   - trading.details / funding.details: flat per-currency arrays
 *   - meta.requestedAt: ISO 8601 string (aggregate emits epoch ms; normalized)
 *   - meta.source: "aggregate" | "fallback"  (added; observability)
 *   - meta.site: site code when known            (added; observability)
 */

/** Gateway-forwarded aggregate endpoint. Relative path => inherits config.baseUrl (multi-site safe). */
const AGGREGATE_ENDPOINT = "/api/v5/aigc/forward/balance-aggregate";

/** Direct OKX v5 endpoints used by the parallel fallback path. */
const TRADING_ENDPOINT = "/api/v5/account/balance";
const FUNDING_ENDPOINT = "/api/v5/asset/balances";
const VALUATION_ENDPOINT = "/api/v5/asset/asset-valuation";

interface BalanceAllParams {
  ccy?: string;
  /** Resolved comma-joined account list forwarded to the aggregate endpoint. */
  accounts: string;
  /** Resolved lowercase account list used by the parallel fallback. */
  requestedAccounts: string[];
  showValuation: boolean;
  valuationCcy: string;
  /** When true, skip the aggregate endpoint and go straight to parallel queries. */
  preferParallel: boolean;
}

interface SubError {
  code: string;
  msg: string;
}

type Section = Record<string, unknown>;

/** Parse + default the raw tool args into a typed param bag. */
function parseParams(rawArgs: unknown): BalanceAllParams {
  const args = asRecord(rawArgs);
  const accounts = readString(args, "accounts") ?? "trading,funding";
  return {
    ccy: readString(args, "ccy"),
    accounts,
    requestedAccounts: accounts
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    showValuation: readBoolean(args, "showValuation") ?? true,
    valuationCcy: readString(args, "valuationCcy") ?? "USDT",
    preferParallel: readBoolean(args, "preferParallel") ?? false,
  };
}

/** Coerce an upstream error object ({code, msg}) into the canonical string-coded shape. */
function normalizeSubError(error: unknown): SubError | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const e = error as Record<string, unknown>;
  return {
    code: e["code"] === undefined || e["code"] === null ? "UNKNOWN" : String(e["code"]),
    msg: typeof e["msg"] === "string" ? e["msg"] : String(e["msg"] ?? ""),
  };
}

/** Normalize requestedAt (epoch ms number OR ISO string) to an ISO 8601 string. */
function toIsoTimestamp(value: unknown, fallbackMs: number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  return new Date(fallbackMs).toISOString();
}

/**
 * Map the backend BalanceAggregateResponse (data[0]) onto the canonical shape.
 * The backend already returns flat per-currency detail arrays, so the main work
 * is timestamp/error coercion and stamping meta.source.
 */
function normalizeAggregate(
  agg: Record<string, unknown>,
  params: BalanceAllParams,
  startTime: number,
): Section {
  const result: Section = {};

  const trading = agg["trading"] as Record<string, unknown> | undefined;
  if (trading) {
    result.trading = compactObject({
      available: trading["available"] ?? false,
      totalEq: trading["totalEq"],
      adjEq: trading["adjEq"],
      details: Array.isArray(trading["details"]) ? trading["details"] : [],
      error: normalizeSubError(trading["error"]),
    });
  }

  const funding = agg["funding"] as Record<string, unknown> | undefined;
  if (funding) {
    result.funding = compactObject({
      available: funding["available"] ?? false,
      details: Array.isArray(funding["details"]) ? funding["details"] : [],
      error: normalizeSubError(funding["error"]),
    });
  }

  const valuation = agg["valuation"] as Record<string, unknown> | undefined;
  if (valuation) {
    result.valuation = compactObject({
      available: valuation["available"] ?? false,
      valuationCcy: valuation["valuationCcy"] ?? params.valuationCcy,
      totalBal: valuation["totalBal"] ?? "0",
      details: Array.isArray(valuation["details"]) ? valuation["details"] : [],
      error: normalizeSubError(valuation["error"]),
    });
  }

  const meta = (agg["meta"] as Record<string, unknown> | undefined) ?? {};
  result.meta = compactObject({
    requestedAt: toIsoTimestamp(meta["requestedAt"], startTime),
    elapsedMs: typeof meta["elapsedMs"] === "number" ? meta["elapsedMs"] : Date.now() - startTime,
    partialFailure: Boolean(meta["partialFailure"]),
    site: typeof meta["site"] === "string" ? meta["site"] : undefined,
    source: "aggregate",
  });

  return result;
}

/**
 * Call the server-side aggregate endpoint and normalize the response.
 * Throws when the endpoint errors, or returns a code-0 envelope with no usable
 * trading/funding payload, so the orchestrator can fall back.
 */
async function queryAggregate(
  context: ToolContext,
  params: BalanceAllParams,
  startTime: number,
): Promise<Section> {
  const resp = await context.client.privateGet(
    AGGREGATE_ENDPOINT,
    compactObject({
      ccy: params.ccy,
      accounts: params.accounts,
      showValuation: params.showValuation,
      valuationCcy: params.valuationCcy,
    }),
    privateRateLimit("account_get_balance_all", 5),
  );

  const data = resp.data;
  const agg = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
  if (!agg || (agg["trading"] === undefined && agg["funding"] === undefined)) {
    throw new OkxApiError("Aggregate endpoint returned no usable data", {
      code: "AGG_EMPTY",
      endpoint: `GET ${AGGREGATE_ENDPOINT}`,
    });
  }

  return normalizeAggregate(agg, params, startTime);
}

/**
 * Fallback path: query trading / funding / valuation directly in parallel.
 * Preserves the original semantics:
 *   - AuthenticationError propagates immediately
 *   - both requested balance sections failing throws OkxApiError(-30001)
 *   - valuation failure does NOT set partialFailure
 */
async function queryParallel(
  context: ToolContext,
  params: BalanceAllParams,
  startTime: number,
): Promise<Section> {
  const { ccy, requestedAccounts, showValuation, valuationCcy } = params;
  const wantTrading = requestedAccounts.includes("trading");
  const wantFunding = requestedAccounts.includes("funding");

  const promises: Promise<{ key: string; data: unknown }>[] = [];

  if (wantTrading) {
    promises.push(
      context.client
        .privateGet(TRADING_ENDPOINT, compactObject({ ccy }), privateRateLimit("account_get_balance", 10))
        .then((resp) => ({ key: "trading", data: resp.data })),
    );
  }

  if (wantFunding) {
    promises.push(
      context.client
        .privateGet(FUNDING_ENDPOINT, compactObject({ ccy }), privateRateLimit("account_get_asset_balance", 6))
        .then((resp) => ({ key: "funding", data: resp.data })),
    );
  }

  if (showValuation) {
    promises.push(
      context.client
        .privateGet(VALUATION_ENDPOINT, { ccy: valuationCcy }, privateRateLimit("account_get_asset_valuation", 1))
        .then((resp) => ({ key: "valuation", data: resp.data })),
    );
  }

  const settled = await Promise.allSettled(promises);

  const result: Section = {};
  let partialFailure = false;
  const authErrors: Error[] = [];
  const requestedSectionErrors: Array<{ key: string; error: Error }> = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      const { key, data } = outcome.value;
      if (key === "trading") {
        const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        const first = rows[0];
        const tradingDetails = first && Array.isArray(first["details"]) ? first["details"] : [];
        result.trading = {
          available: true,
          totalEq: first?.["totalEq"] ?? "0",
          adjEq: first?.["adjEq"] ?? "0",
          details: tradingDetails,
        };
      } else if (key === "funding") {
        result.funding = {
          available: true,
          details: Array.isArray(data) ? data : [],
        };
      } else if (key === "valuation") {
        const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
        const first = rows[0];
        result.valuation = {
          available: true,
          valuationCcy,
          totalBal: first?.["totalBal"] ?? "0",
          details: rows,
        };
      }
    } else {
      const reason = outcome.reason as Error;
      const promiseIndex = settled.indexOf(outcome);
      let key = "unknown";
      // Derive key from promise order
      let idx = 0;
      if (wantTrading) { if (promiseIndex === idx) key = "trading"; idx++; }
      if (wantFunding) { if (promiseIndex === idx) key = "funding"; idx++; }
      if (showValuation) { if (promiseIndex === idx) key = "valuation"; idx++; }

      if (reason instanceof AuthenticationError) {
        authErrors.push(reason);
        continue;
      }

      const errorInfo = {
        code: reason instanceof OkxApiError ? (reason.code ?? "UNKNOWN") : "UNKNOWN",
        msg: reason.message,
      };

      if (key === "trading") {
        result.trading = { available: false, error: errorInfo };
        partialFailure = true;
      } else if (key === "funding") {
        result.funding = { available: false, error: errorInfo };
        partialFailure = true;
      } else if (key === "valuation") {
        result.valuation = { available: false, error: errorInfo };
        // valuation failure does NOT set partialFailure
      }

      if (key === "trading" || key === "funding") {
        requestedSectionErrors.push({ key, error: reason });
      }
    }
  }

  // Auth errors propagate immediately
  if (authErrors.length > 0) {
    throw authErrors[0];
  }

  // Both requested balance sections failed -> throw
  const requestedBalanceSections = [wantTrading, wantFunding].filter(Boolean).length;
  if (requestedSectionErrors.length >= requestedBalanceSections && requestedBalanceSections > 0) {
    throw new OkxApiError("Both balance queries failed", {
      code: "-30001",
    });
  }

  const site = typeof context.config?.site === "string" ? context.config.site : undefined;
  result.meta = compactObject({
    requestedAt: new Date(startTime).toISOString(),
    elapsedMs: Date.now() - startTime,
    partialFailure,
    site,
    source: "fallback",
  });

  return result;
}

/**
 * Entry point used by the `account_get_balance_all` tool handler.
 * Aggregate-first with automatic parallel fallback; auth failures are not
 * retried (they would fail identically on the direct endpoints).
 */
export async function buildBalanceAll(rawArgs: unknown, context: ToolContext): Promise<unknown> {
  const params = parseParams(rawArgs);
  const startTime = Date.now();

  if (params.preferParallel) {
    return queryParallel(context, params, startTime);
  }

  try {
    return await queryAggregate(context, params, startTime);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    return queryParallel(context, params, startTime);
  }
}
