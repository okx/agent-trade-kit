import type { ToolRunner } from "@agent-tradekit/core";
import { outputLine, printJson, printKv, printTable } from "../formatter.js";
import { resolveIndicatorCode, KNOWN_INDICATORS } from "@agent-tradekit/core";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
}

export async function cmdMarketInstruments(
  run: ToolRunner,
  opts: { instType: string; instId?: string; json: boolean },
): Promise<void> {
  const result = await run("market_get_instruments", { instType: opts.instType, instId: opts.instId });
  const items = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(items);
  printTable(
    (items ?? []).slice(0, 50).map((t) => ({
      instId: t["instId"],
      ctVal: t["ctVal"],
      lotSz: t["lotSz"],
      minSz: t["minSz"],
      tickSz: t["tickSz"],
      state: t["state"],
    })),
  );
}

export async function cmdMarketFundingRate(
  run: ToolRunner,
  instId: string,
  opts: { history: boolean; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("market_get_funding_rate", { instId, history: opts.history, limit: opts.limit });
  const items = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(items);
  if (opts.history) {
    printTable(
      (items ?? []).map((r) => ({
        instId: r["instId"],
        fundingRate: r["fundingRate"],
        realizedRate: r["realizedRate"],
        fundingTime: new Date(Number(r["fundingTime"])).toLocaleString(),
      })),
    );
  } else {
    const r = items?.[0];
    if (!r) { outputLine("No data"); return; }
    printKv({
      instId: r["instId"],
      fundingRate: r["fundingRate"],
      nextFundingRate: r["nextFundingRate"],
      fundingTime: new Date(Number(r["fundingTime"])).toLocaleString(),
      nextFundingTime: new Date(Number(r["nextFundingTime"])).toLocaleString(),
    });
  }
}

export async function cmdMarketMarkPrice(
  run: ToolRunner,
  opts: { instType: string; instId?: string; json: boolean },
): Promise<void> {
  const result = await run("market_get_mark_price", { instType: opts.instType, instId: opts.instId });
  const items = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(items);
  printTable(
    (items ?? []).map((r) => ({
      instId: r["instId"],
      instType: r["instType"],
      markPx: r["markPx"],
      ts: new Date(Number(r["ts"])).toLocaleString(),
    })),
  );
}

export async function cmdMarketTrades(
  run: ToolRunner,
  instId: string,
  opts: { limit?: number; json: boolean },
): Promise<void> {
  const result = await run("market_get_trades", { instId, limit: opts.limit });
  const items = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(items);
  printTable(
    (items ?? []).map((t) => ({
      tradeId: t["tradeId"],
      px: t["px"],
      sz: t["sz"],
      side: t["side"],
      ts: new Date(Number(t["ts"])).toLocaleString(),
    })),
  );
}

export async function cmdMarketIndexTicker(
  run: ToolRunner,
  opts: { instId?: string; quoteCcy?: string; json: boolean },
): Promise<void> {
  const result = await run("market_get_index_ticker", { instId: opts.instId, quoteCcy: opts.quoteCcy });
  const items = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(items);
  printTable(
    (items ?? []).map((t) => ({
      instId: t["instId"],
      idxPx: t["idxPx"],
      high24h: t["high24h"],
      low24h: t["low24h"],
      ts: new Date(Number(t["ts"])).toLocaleString(),
    })),
  );
}

export async function cmdMarketIndexCandles(
  run: ToolRunner,
  instId: string,
  opts: { bar?: string; limit?: number; history: boolean; json: boolean },
): Promise<void> {
  const result = await run("market_get_index_candles", { instId, bar: opts.bar, limit: opts.limit, history: opts.history });
  const candles = getData(result) as string[][];
  if (opts.json) return printJson(candles);
  printTable(
    (candles ?? []).map(([ts, o, h, l, c]) => ({
      time: new Date(Number(ts)).toLocaleString(),
      open: o, high: h, low: l, close: c,
    })),
  );
}

export async function cmdMarketPriceLimit(
  run: ToolRunner,
  instId: string,
  json: boolean,
): Promise<void> {
  const result = await run("market_get_price_limit", { instId });
  const items = getData(result) as Record<string, unknown>[];
  if (json) return printJson(items);
  const r = items?.[0];
  if (!r) { outputLine("No data"); return; }
  printKv({
    instId: r["instId"],
    buyLmt: r["buyLmt"],
    sellLmt: r["sellLmt"],
    ts: new Date(Number(r["ts"])).toLocaleString(),
  });
}

export async function cmdMarketOpenInterest(
  run: ToolRunner,
  opts: { instType: string; instId?: string; json: boolean },
): Promise<void> {
  const result = await run("market_get_open_interest", { instType: opts.instType, instId: opts.instId });
  const items = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(items);
  printTable(
    (items ?? []).map((r) => ({
      instId: r["instId"],
      oi: r["oi"],
      oiCcy: r["oiCcy"],
      ts: new Date(Number(r["ts"])).toLocaleString(),
    })),
  );
}

export async function cmdMarketTicker(
  run: ToolRunner,
  instId: string,
  json: boolean,
): Promise<void> {
  const result = await run("market_get_ticker", { instId });
  const items = getData(result) as Record<string, unknown>[];
  if (json) return printJson(items);
  if (!items?.length) { outputLine("No data"); return; }
  const t = items[0];
  printKv({
    instId: t["instId"],
    last: t["last"],
    "24h open": t["open24h"],
    "24h high": t["high24h"],
    "24h low": t["low24h"],
    "24h vol": t["vol24h"],
    "24h change %": (() => {
      const last = Number(t["last"]);
      const open24h = Number(t["open24h"]);
      return open24h !== 0 ? (((last - open24h) / open24h) * 100).toFixed(2) + "%" : "N/A";
    })(),
    time: new Date(Number(t["ts"])).toLocaleString(),
  });
}

export async function cmdMarketTickers(
  run: ToolRunner,
  instType: string,
  json: boolean,
): Promise<void> {
  const result = await run("market_get_tickers", { instType });
  const items = getData(result) as Record<string, unknown>[];
  if (json) return printJson(items);
  printTable(
    (items ?? []).map((t) => ({
      instId: t["instId"],
      last: t["last"],
      "24h high": t["high24h"],
      "24h low": t["low24h"],
      "24h vol": t["vol24h"],
    })),
  );
}

export async function cmdMarketOrderbook(
  run: ToolRunner,
  instId: string,
  sz: number | undefined,
  json: boolean,
): Promise<void> {
  const result = await run("market_get_orderbook", { instId, sz });
  const data = getData(result);
  if (json) return printJson(data);
  const book = (data as Record<string, unknown>[])[0];
  if (!book) { outputLine("No data"); return; }
  const asks = (book["asks"] as string[][]).slice(0, 5);
  const bids = (book["bids"] as string[][]).slice(0, 5);
  outputLine("Asks (price / size):");
  asks.reverse();
  for (const [p, s] of asks) outputLine(`  ${p.padStart(16)}  ${s}`);
  outputLine("Bids (price / size):");
  for (const [p, s] of bids) outputLine(`  ${p.padStart(16)}  ${s}`);
}

export async function cmdMarketCandles(
  run: ToolRunner,
  instId: string,
  opts: { bar?: string; limit?: number; after?: string; before?: string; json: boolean },
): Promise<void> {
  const result = await run("market_get_candles", { instId, bar: opts.bar, limit: opts.limit, after: opts.after, before: opts.before });
  const candles = getData(result) as string[][];
  if (opts.json) return printJson(candles);
  printTable(
    (candles ?? []).map(([ts, o, h, l, c, vol]) => ({
      time: new Date(Number(ts)).toLocaleString(),
      open: o, high: h, low: l, close: c, vol,
    })),
  );
}

export function cmdMarketIndicatorList(json: boolean): void {
  if (json) return printJson(KNOWN_INDICATORS);
  printTable(KNOWN_INDICATORS.map(({ name, description }) => ({ name, description })));
}

export async function cmdMarketIndicator(
  run: ToolRunner,
  indicator: string,
  instId: string,
  opts: {
    bar?: string;
    params?: string;
    list?: boolean;
    limit?: number;
    backtestTime?: number;
    json: boolean;
  },
): Promise<void> {
  const params = opts.params
    ? opts.params.split(",").map((p) => Number(p.trim())).filter((n) => !Number.isNaN(n))
    : undefined;

  const result = await run("market_get_indicator", {
    instId,
    indicator,
    bar: opts.bar,
    params: params && params.length > 0 ? params : undefined,
    returnList: opts.list ?? false,
    limit: opts.limit,
    backtestTime: opts.backtestTime,
  });

  // Response shape: data = Array<{ data: [{instId, timeframes}], mode, summary, timestamp }>
  const outerArray = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(outerArray);

  if (!outerArray?.length) { process.stdout.write("No data\n"); return; }

  const apiCode = resolveIndicatorCode(indicator);
  const response = outerArray[0];
  const innerArray = response["data"] as Record<string, unknown>[] | undefined;
  const instData = innerArray?.[0];
  const timeframes = instData?.["timeframes"] as Record<string, unknown> | undefined;

  if (!timeframes) {
    process.stdout.write(JSON.stringify(outerArray, null, 2) + "\n");
    return;
  }

  for (const [tf, tfData] of Object.entries(timeframes)) {
    const indicators = (tfData as Record<string, unknown>)?.["indicators"] as Record<string, unknown> | undefined;
    const values = indicators?.[apiCode] as Record<string, unknown>[] | undefined;
    if (!values?.length) continue;

    process.stdout.write(`${instId} · ${apiCode} · ${tf}\n`);
    process.stdout.write("─".repeat(40) + "\n");

    if (opts.list) {
      const tableRows = values.map((entry) => ({
        ts: new Date(Number(entry["ts"])).toLocaleString(),
        ...entry["values"] as Record<string, unknown>,
      }));
      printTable(tableRows);
    } else {
      const latest = values[0];
      printKv({
        ts: new Date(Number(latest["ts"])).toLocaleString(),
        ...latest["values"] as Record<string, unknown>,
      });
    }
  }
}

export async function cmdMarketInstrumentsByCategory(
  run: ToolRunner,
  opts: { instCategory: string; instType?: string; instId?: string; json: boolean },
): Promise<void> {
  const result = await run("market_get_instruments_by_category", {
    instCategory: opts.instCategory,
    instType: opts.instType,
    instId: opts.instId,
  });
  const items = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(items);
  const CATEGORY_LABELS: Record<string, string> = {
    "3": "Stock tokens",
    "4": "Metals",
    "5": "Commodities",
    "6": "Forex",
    "7": "Bonds",
  };
  const label = CATEGORY_LABELS[opts.instCategory] ?? opts.instCategory;
  process.stdout.write(`instCategory=${opts.instCategory} (${label}) — ${items?.length ?? 0} instruments\n\n`);
  printTable(
    (items ?? []).slice(0, 50).map((t) => ({
      instId: t["instId"],
      instCategory: t["instCategory"],
      ctVal: t["ctVal"],
      lotSz: t["lotSz"],
      minSz: t["minSz"],
      tickSz: t["tickSz"],
      state: t["state"],
    })),
  );
}

export async function cmdMarketStockTokens(
  run: ToolRunner,
  opts: { instType?: string; instId?: string; json: boolean },
): Promise<void> {
  const result = await run("market_get_stock_tokens", { instType: opts.instType, instId: opts.instId });
  const items = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(items);
  printTable(
    (items ?? []).slice(0, 50).map((t) => ({
      instId: t["instId"],
      instCategory: t["instCategory"],
      ctVal: t["ctVal"],
      lotSz: t["lotSz"],
      minSz: t["minSz"],
      tickSz: t["tickSz"],
      state: t["state"],
    })),
  );
}
