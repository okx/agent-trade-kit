import type { ToolRunner } from "@agent-tradekit/core";
import { outputLine, printJson, printKv, printTable } from "../formatter.js";

function extractArray(result: unknown): Record<string, unknown>[] {
  if (result && typeof result === "object") {
    const data = (result as Record<string, unknown>)["data"];
    if (Array.isArray(data)) return data as Record<string, unknown>[];
  }
  return [];
}

function extractProducts(result: unknown): Record<string, unknown>[] {
  if (result && typeof result === "object") {
    const data = (result as Record<string, unknown>)["data"];
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const products = (data as Record<string, unknown>)["products"];
      if (Array.isArray(products)) return products as Record<string, unknown>[];
    }
  }
  return [];
}

export async function cmdDcdPairs(run: ToolRunner, json: boolean): Promise<void> {
  const result = await run("dcd_get_currency_pairs", {});
  const data = extractArray(result);
  if (json) { printJson(data); return; }
  if (!data.length) { outputLine("No currency pairs available"); return; }
  printTable(data.map((r) => ({
    baseCcy: r["baseCcy"],
    quoteCcy: r["quoteCcy"],
    optType: r["optType"],
  })));
}

type ProductFilterOpts = {
  minYield?: number;
  strikeNear?: number;
  termDays?: number;
  minTermDays?: number;
  maxTermDays?: number;
  expDate?: string;
};

// Note: minYield is in decimal (0.05 = 5%), matching the raw API format.
// This differs from --minAnnualizedYield in quote-and-buy which is in percent (18 = 18%).
function filterByYield(data: Record<string, unknown>[], minYield: number): Record<string, unknown>[] {
  return data.filter((r) => {
    const y = parseFloat(r["annualizedYield"] as string);
    return !isNaN(y) && y >= minYield;
  });
}

function filterByStrike(data: Record<string, unknown>[], ref: number): Record<string, unknown>[] {
  return data.filter((r) => {
    const strike = parseFloat(r["strike"] as string);
    return !isNaN(strike) && Math.abs(strike - ref) / ref <= 0.1;
  });
}

function filterByTerm(
  data: Record<string, unknown>[],
  termDays?: number,
  minTermDays?: number,
  maxTermDays?: number,
): Record<string, unknown>[] {
  const MS_PER_DAY = 86400_000;
  return data.filter((r) => {
    const exp = Number(r["expTime"]);
    const start = Number(r["interestAccrualTime"]);
    if (!exp || !start) return false;
    const days = Math.round((exp - start) / MS_PER_DAY);
    if (termDays !== undefined && days !== termDays) return false;
    if (minTermDays !== undefined && days < minTermDays) return false;
    if (maxTermDays !== undefined && days > maxTermDays) return false;
    return true;
  });
}

function filterByExpDate(data: Record<string, unknown>[], expDate: string): Record<string, unknown>[] {
  // Accept YYYY-MM-DD (day precision) or YYYY-MM-DDTHH:mm (hour precision)
  const hasTime = expDate.includes("T") || expDate.includes(" ");
  const precision = hasTime ? 13 : 10;
  const target = new Date(expDate).toISOString().slice(0, precision);
  return data.filter((r) => {
    const exp = Number(r["expTime"]);
    if (!exp) return false;
    return new Date(exp).toISOString().slice(0, precision) === target;
  });
}

function applyProductFilters(data: Record<string, unknown>[], opts: ProductFilterOpts): Record<string, unknown>[] {
  if (opts.minYield !== undefined) data = filterByYield(data, opts.minYield);
  if (opts.strikeNear !== undefined) data = filterByStrike(data, opts.strikeNear);
  if (opts.termDays !== undefined || opts.minTermDays !== undefined || opts.maxTermDays !== undefined) {
    data = filterByTerm(data, opts.termDays, opts.minTermDays, opts.maxTermDays);
  }
  if (opts.expDate !== undefined) data = filterByExpDate(data, opts.expDate);
  return data;
}

export async function cmdDcdProducts(
  run: ToolRunner,
  opts: { baseCcy?: string; quoteCcy?: string; optType?: string; json: boolean } & ProductFilterOpts,
): Promise<void> {
  const result = await run("dcd_get_products", {
    baseCcy: opts.baseCcy,
    quoteCcy: opts.quoteCcy,
    optType: opts.optType,
  });
  const data = applyProductFilters(extractProducts(result), opts);

  if (opts.json) { printJson(data); return; }
  if (!data.length) { outputLine("No products matched"); return; }
  printTable(data.map((r) => ({
    productId: r["productId"],
    baseCcy: r["baseCcy"],
    quoteCcy: r["quoteCcy"],
    optType: r["optType"],
    strike: r["strike"],
    // products endpoint returns decimal (e.g. 0.3423 = 34.23%) — multiply by 100
    annualizedYield: r["annualizedYield"] ? `${(parseFloat(r["annualizedYield"] as string) * 100).toFixed(2)}%` : "—",
    minSize: r["minSize"],
    expTime: r["expTime"] ? new Date(Number(r["expTime"])).toLocaleDateString() : "",
  })));
}

export async function cmdDcdRedeemExecute(
  run: ToolRunner,
  opts: { ordId: string; json: boolean },
): Promise<void> {
  // Step 1: get redeem quote via dcd_redeem preview (no quoteId)
  const quoteResult = await run("dcd_redeem", { ordId: opts.ordId });
  const quoteData = extractArray(quoteResult);
  const q = quoteData[0];
  if (!q) { outputLine("Failed to get redeem quote"); return; }

  // Step 2: execute immediately via dcd_redeem with quoteId
  const redeemResult = await run("dcd_redeem", {
    ordId: opts.ordId,
    quoteId: q["quoteId"] as string,
  });
  const redeemData = extractArray(redeemResult);
  const r = redeemData[0];
  if (!r) { outputLine("No response data"); return; }

  if (opts.json) {
    printJson({ quote: q, redeem: r });
    return;
  }

  printKv({
    ordId: r["ordId"],
    state: r["state"],
    redeemSz: q["redeemSz"] ? `${parseFloat(q["redeemSz"] as string).toFixed(8)} ${q["redeemCcy"]}` : "—",
    termRate: q["termRate"] ? `${(parseFloat(q["termRate"] as string) * 100).toFixed(2)}%` : "—",
  });
}

export async function cmdDcdOrderState(
  run: ToolRunner,
  opts: { ordId: string; json: boolean },
): Promise<void> {
  const result = await run("dcd_get_order_state", { ordId: opts.ordId });
  const data = extractArray(result);
  if (opts.json) { printJson(data); return; }
  const r = data[0];
  if (!r) { outputLine("Order not found"); return; }
  printKv({
    ordId: r["ordId"],
    state: r["state"],
    productId: r["productId"],
    strike: r["strike"],
    notionalSz: r["notionalSz"],
    settleTime: r["settleTime"] ? new Date(Number(r["settleTime"])).toLocaleDateString() : "",
  });
}

export async function cmdDcdOrders(
  run: ToolRunner,
  opts: {
    ordId?: string;
    productId?: string;
    uly?: string;
    state?: string;
    beginId?: string;
    endId?: string;
    begin?: string;
    end?: string;
    limit?: number;
    json: boolean;
  },
): Promise<void> {
  const result = await run("dcd_get_orders", {
    ordId: opts.ordId,
    productId: opts.productId,
    uly: opts.uly,
    state: opts.state,
    beginId: opts.beginId,
    endId: opts.endId,
    begin: opts.begin,
    end: opts.end,
    limit: opts.limit,
  });
  const data = extractArray(result);
  if (opts.json) { printJson(data); return; }
  if (!data.length) { outputLine("No orders found"); return; }
  printTable(data.map((r) => ({
    ordId: r["ordId"],
    productId: r["productId"],
    state: r["state"],
    baseCcy: r["baseCcy"],
    quoteCcy: r["quoteCcy"],
    strike: r["strike"],
    notionalSz: r["notionalSz"],
    annualizedYield: r["annualizedYield"] ? `${(parseFloat(r["annualizedYield"] as string) * 100).toFixed(2)}%` : "—",
    yieldSz: r["yieldSz"],
    settleTime: r["settleTime"] ? new Date(Number(r["settleTime"])).toLocaleDateString() : "",   // scheduled settlement time
    settledTime: r["settledTime"] ? new Date(Number(r["settledTime"])).toLocaleDateString() : "", // actual settled time (non-empty only after settlement)
  })));
}

export async function cmdDcdQuoteAndBuy(
  run: ToolRunner,
  opts: { productId: string; notionalSz: string; notionalCcy: string; clOrdId?: string; minAnnualizedYield?: number; json: boolean },
): Promise<void> {
  // Atomic subscribe via dcd_subscribe (quote + execute in one step)
  const result = await run("dcd_subscribe", {
    productId: opts.productId,
    notionalSz: opts.notionalSz,
    notionalCcy: opts.notionalCcy,
    clOrdId: opts.clOrdId,
    minAnnualizedYield: opts.minAnnualizedYield,
  }) as unknown as Record<string, unknown>;

  const tradeData = extractArray(result);
  const r = tradeData[0];
  const q = result["quote"] as Record<string, unknown> | undefined;

  if (!r) { outputLine("No quote returned"); return; }

  // Auto-query full order detail via dcd_get_orders (richer than dcd_get_order_state).
  // Wrapped in try/catch: a failure here must NOT mask the successful order placement.
  const ordId = r["ordId"] as string | undefined;
  let stateRow: Record<string, unknown> | undefined;
  if (ordId) {
    try {
      const stateResult = await run("dcd_get_orders", { ordId });
      stateRow = extractArray(stateResult)[0];
    } catch {
      // Secondary query failed — order was already placed, do not propagate
    }
  }

  if (opts.json) {
    printJson({ quote: q ?? null, order: r, state: stateRow ?? null });
    return;
  }

  if (q) {
    outputLine("Quote:");
    printKv({
      quoteId: q["quoteId"],
      annualizedYield: q["annualizedYield"] ? `${(parseFloat(q["annualizedYield"] as string) * 100).toFixed(2)}%` : "—",
      absYield: q["absYield"],
      notionalSz: q["notionalSz"],
      notionalCcy: q["notionalCcy"],
    });
    outputLine("");
  }
  outputLine("Order placed:");
  printKv({ ordId: r["ordId"], quoteId: r["quoteId"], state: r["state"] ?? r["status"] });
  if (stateRow) {
    outputLine("");
    outputLine("Order state:");
    printKv({
      ordId: stateRow["ordId"],
      state: stateRow["state"],
      productId: stateRow["productId"],
      strike: stateRow["strike"],
      notionalSz: stateRow["notionalSz"],
      settleTime: stateRow["settleTime"] ? new Date(Number(stateRow["settleTime"])).toLocaleDateString() : "",
    });
  }
}
