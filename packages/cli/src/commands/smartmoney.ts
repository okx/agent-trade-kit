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

/** Pool-filter fields for signal endpoints (top-coin / signal / signal-history). Enum tiers. */
export interface SignalPoolFilterOpts {
  sortBy?: string;
  period?: string;
  pnlTier?: string;
  winRateTier?: string;
  maxDrawdownTier?: string;
  aumTier?: string;
}

/** Pool-filter fields for the leaderboard (`top-traders`) endpoint. Numeric thresholds. */
export interface LeaderboardPoolFilterOpts {
  sortBy?: string;
  period?: string;
  pnl?: string;
  winRate?: string;
  maxDrawdown?: string;
  asset?: string;
}

function signalPoolFilterArgs(o: SignalPoolFilterOpts): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (o.sortBy) result.sortBy = o.sortBy;
  if (o.period) result.period = o.period;
  if (o.pnlTier) result.pnlTier = o.pnlTier;
  if (o.winRateTier) result.winRateTier = o.winRateTier;
  if (o.maxDrawdownTier) result.maxDrawdownTier = o.maxDrawdownTier;
  if (o.aumTier) result.aumTier = o.aumTier;
  return result;
}

function leaderboardPoolFilterArgs(o: LeaderboardPoolFilterOpts): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (o.sortBy) result.sortBy = o.sortBy;
  if (o.period) result.period = o.period;
  if (o.pnl) result.pnl = o.pnl;
  if (o.winRate) result.winRate = o.winRate;
  if (o.maxDrawdown) result.maxDrawdown = o.maxDrawdown;
  if (o.asset) result.asset = o.asset;
  return result;
}

/* ------------------------------------------------------------------ */
/*  Trader family (5)                                                  */
/* ------------------------------------------------------------------ */

export async function cmdSmartmoneyTopTraders(
  run: ToolRunner,
  opts: LeaderboardPoolFilterOpts & {
    updateTime?: string;
    after?: string;
    before?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const data = extractData(await run("smartmoney_get_top_traders", {
    updateTime: opts.updateTime,
    ...leaderboardPoolFilterArgs(opts),
    after: opts.after,
    before: opts.before,
    limit: opts.limit,
  }));
  printDataList(data, opts.json, "No traders found", (r) => ({
    authorId: r["authorId"],
    nickName: r["nickName"],
    pnl: r["pnl"],
    pnlRatio: r["pnlRatio"],
    winRate: r["winRate"],
    maxDrawdown: r["maxDrawdown"],
    asset: r["asset"],
  }));
}

export async function cmdSmartmoneyTraderPerformance(
  run: ToolRunner,
  opts: {
    authorIds: string;
    period?: string;
    json: boolean;
  },
): Promise<void> {
  const data = extractData(await run("smartmoney_get_trader_performance", {
    authorIds: opts.authorIds,
    period: opts.period,
  }));
  printDataList(data, opts.json, "No traders found", (r) => ({
    authorId: r["authorId"],
    nickName: r["nickName"],
    pnl: r["pnl"],
    pnlRatio: r["pnlRatio"],
    winRate: r["winRate"],
    maxDrawdown: r["maxDrawdown"],
    asset: r["asset"],
  }));
}

export async function cmdSmartmoneyTraderPositions(
  run: ToolRunner,
  opts: {
    authorId: string;
    instCcy?: string;
    json: boolean;
  },
): Promise<void> {
  const data = extractData(await run("smartmoney_get_trader_positions", {
    authorId: opts.authorId,
    instCcy: opts.instCcy,
  }));
  printDataList(data, opts.json, "No open positions", (r) => ({
    instId: r["instId"],
    posSide: r["posSide"],
    pos: r["pos"],
    lever: r["lever"],
    avgPx: r["avgPx"],
    last: r["last"],
    notionalUsd: r["notionalUsd"],
    upl: r["upl"],
    pnl: r["pnl"],
    positionIntensity: r["positionIntensity"],
  }));
}

export async function cmdSmartmoneyTraderPositionHistory(
  run: ToolRunner,
  opts: {
    authorId: string;
    instCcy?: string;
    after?: string;
    before?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_trader_position_history", {
    authorId: opts.authorId,
    instCcy: opts.instCcy,
    after: opts.after,
    before: opts.before,
    limit: opts.limit,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataList(data, false, "No closed positions", (r) => ({
    cTime: r["cTime"],
    uTime: r["uTime"],
    instId: r["instId"],
    posSide: r["posSide"],
    openAvgPx: r["openAvgPx"],
    closeAvgPx: r["closeAvgPx"],
    pnl: r["pnl"],
    pnlRatio: r["pnlRatio"],
    closeType: r["closeType"],
  }));
}

export async function cmdSmartmoneyTraderOrderHistory(
  run: ToolRunner,
  opts: {
    authorId: string;
    instCcy?: string;
    after?: string;
    before?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_trader_order_history", {
    authorId: opts.authorId,
    instCcy: opts.instCcy,
    after: opts.after,
    before: opts.before,
    limit: opts.limit,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataList(data, false, "No order history", (r) => ({
    cTime: r["cTime"],
    instId: r["instId"],
    side: r["side"],
    posSide: r["posSide"],
    ordType: r["ordType"],
    avgPx: r["avgPx"],
    sz: r["sz"],
    value: r["value"],
  }));
}

/* ------------------------------------------------------------------ */
/*  Signal/Coin family (5)                                             */
/* ------------------------------------------------------------------ */

export async function cmdSmartmoneyTopCoinSignals(
  run: ToolRunner,
  opts: SignalPoolFilterOpts & {
    ts?: string;
    lmtNum?: string;
    topInstruments?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_top_coin_signals", {
    ts: opts.ts,
    ...signalPoolFilterArgs(opts),
    lmtNum: opts.lmtNum,
    topInstruments: opts.topInstruments,
  });
  const data = extractData(result);
  printDataList(data, opts.json, "No top coin signals", (r) => ({
    instId: r["instId"],
    tradersWithPosition: r["tradersWithPosition"],
    longRatio: r["longRatio"],
    weightedLongRatio: r["weightedLongRatio"],
    netNotionalUsdt: r["netNotionalUsdt"],
    vs24h: r["vs24h"],
  }));
}

export async function cmdSmartmoneySignalByCoin(
  run: ToolRunner,
  opts: SignalPoolFilterOpts & {
    instId: string;
    lmtNum?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_by_coin", {
    instId: opts.instId,
    ...signalPoolFilterArgs(opts),
    lmtNum: opts.lmtNum,
  });
  const data = extractData(result);
  const signal = data[0] as Record<string, unknown> | undefined;
  if (opts.json) { printJson(signal ?? {}); return; }
  if (!signal) { outputLine("No signal data"); return; }

  printKv({
    instId: signal["instId"],
    tradersWithPosition: signal["tradersWithPosition"],
    tradersTotal: signal["tradersTotal"],
    longRatio: signal["longRatio"],
    weightedLongRatio: signal["weightedLongRatio"],
    avgLongWinRate: signal["avgLongWinRate"],
    avgShortWinRate: signal["avgShortWinRate"],
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
  });
}

export async function cmdSmartmoneySignalByTraders(
  run: ToolRunner,
  opts: {
    instId: string;
    authorIds: string;
    lmtNum?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_by_traders", {
    instId: opts.instId,
    authorIds: opts.authorIds,
    lmtNum: opts.lmtNum,
  });
  const data = extractData(result);
  const signal = data[0] as Record<string, unknown> | undefined;
  if (opts.json) { printJson(signal ?? {}); return; }
  if (!signal) { outputLine("No signal data"); return; }

  printKv({
    instId: signal["instId"],
    tradersWithPosition: signal["tradersWithPosition"],
    tradersTotal: signal["tradersTotal"],
    longRatio: signal["longRatio"],
    weightedLongRatio: signal["weightedLongRatio"],
    avgLongWinRate: signal["avgLongWinRate"],
    avgShortWinRate: signal["avgShortWinRate"],
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
  });
}

export async function cmdSmartmoneySignalHistoryByCoin(
  run: ToolRunner,
  opts: SignalPoolFilterOpts & {
    instId: string;
    ts: string;
    granularity?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_history_by_coin", {
    instId: opts.instId,
    ts: opts.ts,
    granularity: opts.granularity,
    limit: opts.limit,
    ...signalPoolFilterArgs(opts),
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

export async function cmdSmartmoneySignalHistoryByTraders(
  run: ToolRunner,
  opts: {
    instId: string;
    authorIds: string;
    ts: string;
    granularity?: string;
    limit?: string;
    lmtNum?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_history_by_traders", {
    instId: opts.instId,
    authorIds: opts.authorIds,
    ts: opts.ts,
    granularity: opts.granularity,
    limit: opts.limit,
    lmtNum: opts.lmtNum,
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
