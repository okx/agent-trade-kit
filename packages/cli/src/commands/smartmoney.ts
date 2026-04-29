import type { ToolRunner } from "@agent-tradekit/core";
import { extractData, outputLine, printJson, printTable } from "../formatter.js";


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
  const data = extractData(await run("smartmoney_get_traders_by_filter", {
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
  const data = extractData(await run("smartmoney_get_traders_by_id", {
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
    instId?: string;
    json: boolean;
  },
): Promise<void> {
  const data = extractData(await run("smartmoney_get_trader_positions", {
    authorId: opts.authorId,
    instId: opts.instId,
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
    instId?: string;
    after?: string;
    before?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_trader_positions_history", {
    authorId: opts.authorId,
    instId: opts.instId,
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
    instId?: string;
    after?: string;
    before?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_trader_orders_history", {
    authorId: opts.authorId,
    instId: opts.instId,
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
  opts: {
    topInstruments?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_top_coin_signals", {
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

const signalRowMapper = (r: Record<string, unknown>): Record<string, unknown> => ({
  instId: r["instId"],
  tradersWithPosition: r["tradersWithPosition"],
  longRatio: r["longRatio"],
  weightedLongRatio: r["weightedLongRatio"],
  longTraders: r["longTraders"],
  shortTraders: r["shortTraders"],
  netNotionalUsdt: r["netNotionalUsdt"],
  vs1h: r["vs1h"],
  vs24h: r["vs24h"],
  vs7d: r["vs7d"],
});

export async function cmdSmartmoneySignalOverviewByFilter(
  run: ToolRunner,
  opts: SignalPoolFilterOpts & {
    topInstruments?: string;
    instCcyList?: string;
    lmtNum?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_overview_by_filter", {
    topInstruments: opts.topInstruments,
    instCcyList: opts.instCcyList,
    ...signalPoolFilterArgs(opts),
    lmtNum: opts.lmtNum,
  });
  const data = extractData(result);
  printDataList(data, opts.json, "No signal data", signalRowMapper);
}

export async function cmdSmartmoneySignalOverviewByTrader(
  run: ToolRunner,
  opts: {
    authorIds: string;
    topInstruments?: string;
    instCcyList?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_overview_by_trader", {
    authorIds: opts.authorIds,
    topInstruments: opts.topInstruments,
    instCcyList: opts.instCcyList,
  });
  const data = extractData(result);
  printDataList(data, opts.json, "No signal data", signalRowMapper);
}

const trendRowMapper = (r: Record<string, unknown>): Record<string, unknown> => ({
  ts: r["ts"],
  longRatio: r["longRatio"],
  weightedLongRatio: r["weightedLongRatio"],
  tradersWithPosition: r["tradersWithPosition"],
  netNotionalUsdt: r["netNotionalUsdt"],
  totalNotionalUsdt: r["totalNotionalUsdt"],
  tradersQualified: r["tradersQualified"],
});

export async function cmdSmartmoneySignalTrendByFilter(
  run: ToolRunner,
  opts: SignalPoolFilterOpts & {
    instId: string;
    startTime: string;
    endTime: string;
    granularity?: string;
    limit?: string;
    lmtNum?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_trend_by_filter", {
    instId: opts.instId,
    startTime: opts.startTime,
    endTime: opts.endTime,
    granularity: opts.granularity,
    limit: opts.limit,
    ...signalPoolFilterArgs(opts),
    lmtNum: opts.lmtNum,
  });
  const data = extractData(result);
  printDataList(data, opts.json, "No signal trend data", trendRowMapper);
}

export async function cmdSmartmoneySignalTrendByTrader(
  run: ToolRunner,
  opts: {
    instId: string;
    authorIds: string;
    startTime: string;
    endTime: string;
    granularity?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_trend_by_trader", {
    instId: opts.instId,
    authorIds: opts.authorIds,
    startTime: opts.startTime,
    endTime: opts.endTime,
    granularity: opts.granularity,
    limit: opts.limit,
  });
  const data = extractData(result);
  printDataList(data, opts.json, "No signal trend data", trendRowMapper);
}
