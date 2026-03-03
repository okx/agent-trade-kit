import type { OkxRestClient } from "@okx-hub/core";
import { printJson, printKv, printTable } from "../formatter.js";

export async function cmdMarketInstruments(
  client: OkxRestClient,
  opts: { instType: string; instId?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instType: opts.instType };
  if (opts.instId) params["instId"] = opts.instId;
  const res = await client.publicGet("/api/v5/public/instruments", params);
  const items = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  instId: string,
  opts: { history: boolean; limit?: number; json: boolean },
): Promise<void> {
  if (opts.history) {
    const params: Record<string, unknown> = { instId };
    if (opts.limit) params["limit"] = String(opts.limit);
    const res = await client.publicGet("/api/v5/public/funding-rate-history", params);
    const items = res.data as Record<string, unknown>[];
    if (opts.json) return printJson(items);
    printTable(
      (items ?? []).map((r) => ({
        instId: r["instId"],
        fundingRate: r["fundingRate"],
        realizedRate: r["realizedRate"],
        fundingTime: new Date(Number(r["fundingTime"])).toLocaleString(),
      })),
    );
  } else {
    const res = await client.publicGet("/api/v5/public/funding-rate", { instId });
    const items = res.data as Record<string, unknown>[];
    if (opts.json) return printJson(items);
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
  client: OkxRestClient,
  opts: { instType: string; instId?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instType: opts.instType };
  if (opts.instId) params["instId"] = opts.instId;
  const res = await client.publicGet("/api/v5/public/mark-price", params);
  const items = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  instId: string,
  opts: { limit?: number; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instId };
  if (opts.limit) params["limit"] = String(opts.limit);
  const res = await client.publicGet("/api/v5/market/trades", params);
  const items = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  opts: { instId?: string; quoteCcy?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.instId) params["instId"] = opts.instId;
  if (opts.quoteCcy) params["quoteCcy"] = opts.quoteCcy;
  const res = await client.publicGet("/api/v5/market/index-tickers", params);
  const items = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  instId: string,
  opts: { bar?: string; limit?: number; history: boolean; json: boolean },
): Promise<void> {
  const path = opts.history
    ? "/api/v5/market/history-index-candles"
    : "/api/v5/market/index-candles";
  const params: Record<string, unknown> = { instId };
  if (opts.bar) params["bar"] = opts.bar;
  if (opts.limit) params["limit"] = String(opts.limit);
  const res = await client.publicGet(path, params);
  const candles = res.data as string[][];
  if (opts.json) return printJson(candles);
  printTable(
    (candles ?? []).map(([ts, o, h, l, c]) => ({
      time: new Date(Number(ts)).toLocaleString(),
      open: o, high: h, low: l, close: c,
    })),
  );
}

export async function cmdMarketPriceLimit(
  client: OkxRestClient,
  instId: string,
  json: boolean,
): Promise<void> {
  const res = await client.publicGet("/api/v5/public/price-limit", { instId });
  const items = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  opts: { instType: string; instId?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instType: opts.instType };
  if (opts.instId) params["instId"] = opts.instId;
  const res = await client.publicGet("/api/v5/public/open-interest", params);
  const items = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  instId: string,
  json: boolean,
): Promise<void> {
  const res = await client.publicGet("/api/v5/market/ticker", { instId });
  const items = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  instType: string,
  json: boolean,
): Promise<void> {
  const res = await client.publicGet("/api/v5/market/tickers", { instType });
  const items = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  instId: string,
  sz: number | undefined,
  json: boolean,
): Promise<void> {
  const params: Record<string, unknown> = { instId };
  if (sz !== undefined) params["sz"] = String(sz);
  const res = await client.publicGet("/api/v5/market/books", params);
  if (json) return printJson(res.data);
  const book = (res.data as Record<string, unknown>[])[0];
  if (!book) { process.stdout.write("No data\n"); return; }
  const asks = (book["asks"] as string[][]).slice(0, 5);
  const bids = (book["bids"] as string[][]).slice(0, 5);
  process.stdout.write("Asks (price / size):\n");
  for (const [p, s] of asks.reverse()) process.stdout.write(`  ${p.padStart(16)}  ${s}\n`);
  process.stdout.write("Bids (price / size):\n");
  for (const [p, s] of bids) process.stdout.write(`  ${p.padStart(16)}  ${s}\n`);
}

export async function cmdMarketCandles(
  client: OkxRestClient,
  instId: string,
  opts: { bar?: string; limit?: number; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instId };
  if (opts.bar) params["bar"] = opts.bar;
  if (opts.limit) params["limit"] = String(opts.limit);
  const res = await client.publicGet("/api/v5/market/candles", params);
  const candles = res.data as string[][];
  if (opts.json) return printJson(candles);
  printTable(
    (candles ?? []).map(([ts, o, h, l, c, vol]) => ({
      time: new Date(Number(ts)).toLocaleString(),
      open: o, high: h, low: l, close: c, vol,
    })),
  );
}
