import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printKv, printTable } from "../formatter.js";

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
    if (!r) { process.stdout.write("No data\n"); return; }
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
  if (!r) { process.stdout.write("No data\n"); return; }
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
  if (!items?.length) { process.stdout.write("No data\n"); return; }
  const t = items[0];
  printKv({
    instId: t["instId"],
    last: t["last"],
    "24h change %": t["sodUtc8"],
    "24h high": t["high24h"],
    "24h low": t["low24h"],
    "24h vol": t["vol24h"],
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
  if (!book) { process.stdout.write("No data\n"); return; }
  const asks = (book["asks"] as string[][]).slice(0, 5);
  const bids = (book["bids"] as string[][]).slice(0, 5);
  process.stdout.write("Asks (price / size):\n");
  for (const [p, s] of asks.reverse()) process.stdout.write(`  ${p.padStart(16)}  ${s}\n`);
  process.stdout.write("Bids (price / size):\n");
  for (const [p, s] of bids) process.stdout.write(`  ${p.padStart(16)}  ${s}\n`);
}

export async function cmdMarketCandles(
  run: ToolRunner,
  instId: string,
  opts: { bar?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("market_get_candles", { instId, bar: opts.bar, limit: opts.limit });
  const candles = getData(result) as string[][];
  if (opts.json) return printJson(candles);
  printTable(
    (candles ?? []).map(([ts, o, h, l, c, vol]) => ({
      time: new Date(Number(ts)).toLocaleString(),
      open: o, high: h, low: l, close: c, vol,
    })),
  );
}
