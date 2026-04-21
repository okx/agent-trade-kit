import type { ToolRunner } from "@agent-tradekit/core";
import { extractData, outputLine, printJson, printKv, printTable } from "../formatter.js";


function printDataList(
  data: Record<string, unknown>[],
  json: boolean,
  emptyMsg: string,
  mapper: (r: Record<string, unknown>) => Record<string, unknown>,
): void {
  if (json) { printJson(data); return; }
  if (!data.length) { outputLine(emptyMsg); return; }
  printTable(data.map(mapper));
}

/** Shared pool-filter fields reused across overview / signal / signal-history / traders. */
export interface PoolFilterOpts {
  sortType?: string;
  period?: string;
  pnl?: string;
  winRatio?: string;
  maxRetreat?: string;
  asset?: string;
}

function poolFilterArgs(o: PoolFilterOpts): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (o.sortType) result.sortType = o.sortType;
  if (o.period) result.period = o.period;
  if (o.pnl) result.pnl = o.pnl;
  if (o.winRatio) result.winRatio = o.winRatio;
  if (o.maxRetreat) result.maxRetreat = o.maxRetreat;
  if (o.asset) result.asset = o.asset;
  return result;
}

export async function cmdSmartmoneyOverview(
  run: ToolRunner,
  opts: PoolFilterOpts & {
    dataVersion?: string;
    ts?: string;
    instType?: string;
    lmtNum?: string;
    instCcyList?: string;
    instCcy?: string;
    topInstruments?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_overview", {
    dataVersion: opts.dataVersion,
    ts: opts.ts,
    instType: opts.instType,
    ...poolFilterArgs(opts),
    lmtNum: opts.lmtNum,
    instCcyList: opts.instCcyList,
    instCcy: opts.instCcy,
    topInstruments: opts.topInstruments,
  });
  const data = extractData(result);
  printDataList(data, opts.json, "No overview data", (r) => ({
    instId: r["instId"],
    tradersWithPosition: r["tradersWithPosition"],
    longRatio: r["longRatio"],
    weightedLongRatio: r["weightedLongRatio"],
    netNotionalUsdt: r["netNotionalUsdt"],
    vs24h: r["vs24h"],
  }));
}

export async function cmdSmartmoneySignal(
  run: ToolRunner,
  opts: PoolFilterOpts & {
    instId?: string;
    dataVersion?: string;
    ts?: string;
    instCcy?: string;
    lmtNum?: string;
    authorIds?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal", {
    instId: opts.instId,
    instCcy: opts.instCcy,
    dataVersion: opts.dataVersion,
    ts: opts.ts,
    ...poolFilterArgs(opts),
    lmtNum: opts.lmtNum,
    authorIds: opts.authorIds,
  });
  const data = extractData(result);
  const signal = data[0] as Record<string, unknown> | undefined;
  if (opts.json) { printJson(signal ?? {}); return; }
  if (!signal) { outputLine("No signal data"); return; }

  printKv({
    instId: signal["instId"],
    instType: signal["instType"],
    tradersWithPosition: signal["tradersWithPosition"],
    tradersTotal: signal["tradersTotal"],
    longRatio: signal["longRatio"],
    weightedLongRatio: signal["weightedLongRatio"],
    avgLongWinRatio: signal["avgLongWinRatio"],
    avgShortWinRatio: signal["avgShortWinRatio"],
    longNotionalUsdt: signal["longNotionalUsdt"],
    shortNotionalUsdt: signal["shortNotionalUsdt"],
    netNotionalUsdt: signal["netNotionalUsdt"],
    longTraders: signal["longTraders"],
    shortTraders: signal["shortTraders"],
    vs1h: signal["vs1h"],
    vs24h: signal["vs24h"],
    vs7d: signal["vs7d"],
    smartMoneyLongAvgEntry: signal["smartMoneyLongAvgEntry"],
    smartMoneyShortAvgEntry: signal["smartMoneyShortAvgEntry"],
    totalNotionalVs24h: signal["totalNotionalVs24h"],
    currentPrice: signal["currentPrice"],
    priceChange24h: signal["priceChange24h"],
    fundingRate: signal["fundingRate"],
    openInterest: signal["openInterest"],
    longShortAccountRatio: signal["longShortAccountRatio"],
  });
}

export async function cmdSmartmoneySignalHistory(
  run: ToolRunner,
  opts: PoolFilterOpts & {
    instId: string;
    dataVersion?: string;
    ts?: string;
    granularity?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_history", {
    instId: opts.instId,
    dataVersion: opts.dataVersion,
    ts: opts.ts,
    granularity: opts.granularity,
    limit: opts.limit,
    ...poolFilterArgs(opts),
  });
  const data = extractData(result);
  printDataList(data, opts.json, "No signal history data", (r) => ({
    ts: r["ts"],
    longRatio: r["longRatio"],
    weightedLongRatio: r["weightedLongRatio"],
    tradersWithPosition: r["tradersWithPosition"],
    netNotionalUsdt: r["netNotionalUsdt"],
    totalNotionalUsdt: r["totalNotionalUsdt"],
    tradersQualified: r["tradersQualified"],
  }));
}

export async function cmdSmartmoneyTraders(
  run: ToolRunner,
  opts: PoolFilterOpts & {
    dataVersion?: string;
    authorIds?: string;
    after?: string;
    before?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const data = extractData(await run("smartmoney_get_traders", {
    dataVersion: opts.dataVersion,
    ...poolFilterArgs(opts),
    authorIds: opts.authorIds,
    after: opts.after,
    before: opts.before,
    limit: opts.limit,
  }));
  printDataList(data, opts.json, "No traders found", (r) => ({
    authorId: r["authorId"],
    nickName: r["nickName"],
    pnl: r["pnl"],
    pnlRatio: r["pnlRatio"],
    winRatio: r["winRatio"],
    asset: r["asset"],
  }));
}

export async function cmdSmartmoneyTraderDetail(
  run: ToolRunner,
  opts: {
    authorId: string;
    period?: string;
    instCcy?: string;
    tradeLimit?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_trader_detail", {
    authorId: opts.authorId,
    period: opts.period,
    instCcy: opts.instCcy,
    tradeLimit: opts.tradeLimit,
  });
  const data = result as unknown as Record<string, unknown>;
  const inner = data["data"] as Record<string, unknown> | undefined;
  if (opts.json) { printJson(inner ?? {}); return; }
  if (!inner) { outputLine("No data"); return; }

  // Profile
  const profileArr = inner["profile"];
  if (Array.isArray(profileArr) && profileArr.length > 0) {
    const p = profileArr[0] as Record<string, unknown>;
    outputLine("=== Profile ===");
    printKv({
      authorId: p["authorId"],
      nickName: p["nickName"],
      pnl: p["pnl"],
      pnlRatio: p["pnlRatio"],
      winRatio: p["winRatio"],
      maxRetreat: p["maxRetreat"],
      asset: p["asset"],
      onboardDuration: p["onboardDuration"],
    });
  }

  // Positions
  const posArr = inner["positions"];
  if (Array.isArray(posArr) && posArr.length > 0) {
    outputLine("\n=== Current Positions ===");
    printJson(posArr);
  }

  // Trades
  const tradeArr = inner["trades"];
  if (Array.isArray(tradeArr) && tradeArr.length > 0) {
    outputLine("\n=== Recent Trades ===");
    printJson(tradeArr);
  }
}
