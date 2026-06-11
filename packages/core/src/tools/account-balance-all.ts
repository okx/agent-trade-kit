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

/** Canonical sections produced by the parallel fallback. */
type SectionKey = "trading" | "funding" | "valuation";

/** A balance sub-query tagged with the section it produces. */
interface BalanceTask {
  key: SectionKey;
  run: () => Promise<unknown>;
}

/** Resolved outcome of a BalanceTask: either `data` (success) or `error`. */
interface TaskOutcome {
  key: SectionKey;
  data?: unknown;
  error?: Error;
}

/** Balance sections that count toward partialFailure / "both failed"; valuation is excluded. */
const REQUESTED_KEYS: ReadonlySet<SectionKey> = new Set(["trading", "funding"]);

/** Build the list of sub-queries to run, each tagged with its section key. */
function buildBalanceTasks(context: ToolContext, params: BalanceAllParams): BalanceTask[] {
  const { ccy, requestedAccounts, showValuation, valuationCcy } = params;
  const tasks: BalanceTask[] = [];

  if (requestedAccounts.includes("trading")) {
    tasks.push({
      key: "trading",
      run: () =>
        context.client
          .privateGet(TRADING_ENDPOINT, compactObject({ ccy }), privateRateLimit("account_get_balance", 10))
          .then((resp) => resp.data),
    });
  }
  if (requestedAccounts.includes("funding")) {
    tasks.push({
      key: "funding",
      run: () =>
        context.client
          .privateGet(FUNDING_ENDPOINT, compactObject({ ccy }), privateRateLimit("account_get_asset_balance", 6))
          .then((resp) => resp.data),
    });
  }
  if (showValuation) {
    tasks.push({
      key: "valuation",
      run: () =>
        context.client
          .privateGet(VALUATION_ENDPOINT, { ccy: valuationCcy }, privateRateLimit("account_get_asset_valuation", 1))
          .then((resp) => resp.data),
    });
  }

  return tasks;
}

/** Run every task to completion, capturing each result/error alongside its key. */
async function settleBalanceTasks(tasks: BalanceTask[]): Promise<TaskOutcome[]> {
  return Promise.all(
    tasks.map(async (task) => {
      try {
        return { key: task.key, data: await task.run() };
      } catch (error) {
        return { key: task.key, error: error as Error };
      }
    }),
  );
}

/** Build the populated section for a successful sub-query. */
function buildSuccessSection(key: SectionKey, data: unknown, valuationCcy: string): Section {
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const first = rows[0];
  if (key === "funding") {
    return { available: true, details: rows };
  }
  if (key === "valuation") {
    return { available: true, valuationCcy, totalBal: first?.["totalBal"] ?? "0", details: rows };
  }
  return {
    available: true,
    totalEq: first?.["totalEq"] ?? "0",
    adjEq: first?.["adjEq"] ?? "0",
    details: first && Array.isArray(first["details"]) ? first["details"] : [],
  };
}

/** Build the error section for a failed sub-query. */
function buildErrorSection(error: Error): Section {
  return {
    available: false,
    error: {
      code: error instanceof OkxApiError ? (error.code ?? "UNKNOWN") : "UNKNOWN",
      msg: error.message,
    } satisfies SubError,
  };
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
  const tasks = buildBalanceTasks(context, params);
  const outcomes = await settleBalanceTasks(tasks);

  // Auth failures propagate immediately (the direct endpoints would fail identically).
  const authFailure = outcomes.find((o) => o.error instanceof AuthenticationError);
  if (authFailure?.error) {
    throw authFailure.error;
  }

  const result: Section = {};
  for (const outcome of outcomes) {
    result[outcome.key] = outcome.error
      ? buildErrorSection(outcome.error)
      : buildSuccessSection(outcome.key, outcome.data, params.valuationCcy);
  }

  // Both requested balance sections (trading/funding) failed -> hard error.
  const requestedCount = tasks.filter((t) => REQUESTED_KEYS.has(t.key)).length;
  const requestedFailures = outcomes.filter((o) => o.error && REQUESTED_KEYS.has(o.key)).length;
  if (requestedCount > 0 && requestedFailures >= requestedCount) {
    throw new OkxApiError("Both balance queries failed", { code: "-30001" });
  }

  const site = typeof context.config?.site === "string" ? context.config.site : undefined;
  result.meta = compactObject({
    requestedAt: new Date(startTime).toISOString(),
    elapsedMs: Date.now() - startTime,
    partialFailure: requestedFailures > 0,
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
