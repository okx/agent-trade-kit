import type { ToolRunner } from "@agent-tradekit/core";
import { errorLine, extractData, outputLine, printJson, printTable } from "../formatter.js";


// Table-mode renderer. --json is handled at each command site (envelope passthrough)
// so AI agents see the same shape as MCP tools/call (endpoint / requestTime /
// updateTime / pagination preserved).
function printDataTable(
  data: Record<string, unknown>[],
  emptyMsg: string,
  mapper: (r: Record<string, unknown>) => Record<string, unknown>,
): void {
  if (!data.length) { outputLine(emptyMsg); return; }
  printTable(data.map(mapper));
}

// Split a comma-separated CLI flag value into a non-empty array of trimmed strings.
// MCP tool inputSchema expects arrays for authorIds / instCcyList — CLI keeps the
// ergonomic `--authorIds 1001,1002` flag form and converts at the boundary.
function csvToArray(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const arr = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  return arr.length > 0 ? arr : undefined;
}

// Surface cursor-pagination hint in table mode so interactive users know there
// are more pages. Goes to stderr to keep stdout pipes clean for downstream tools.
function printPaginationHint(result: unknown): void {
  if (!result || typeof result !== "object") return;
  const pagination = (result as Record<string, unknown>).pagination;
  if (!pagination || typeof pagination !== "object") return;
  const { hasMore, nextAfter } = pagination as Record<string, unknown>;
  if (hasMore !== true) return;
  const cursor = typeof nextAfter === "string" || typeof nextAfter === "number" ? String(nextAfter) : "";
  errorLine(cursor ? `more results — pass --after ${cursor} for next page` : "more results — pass --after <cursor> for next page");
}

/** Pool-filter fields for signal endpoints (overview / signal-history). Enum tiers. */
export interface SignalPoolFilterOpts {
  sortBy?: string;
  period?: string;
  pnlTier?: string;
  winRateTier?: string;
  maxDrawdownTier?: string;
  aumTier?: string;
}

/** Pool-filter fields for the leaderboard (`traders-by-filter`) endpoint. Numeric thresholds. */
export interface LeaderboardPoolFilterOpts {
  sortBy?: string;
  period?: string;
  minPnl?: string;
  minWinRate?: string;
  maxDrawdown?: string;
  minAum?: string;
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
  if (o.minPnl) result.minPnl = o.minPnl;
  if (o.minWinRate) result.minWinRate = o.minWinRate;
  if (o.maxDrawdown) result.maxDrawdown = o.maxDrawdown;
  if (o.minAum) result.minAum = o.minAum;
  return result;
}

/* ------------------------------------------------------------------ */
/*  Trader family (5)                                                  */
/* ------------------------------------------------------------------ */

export async function cmdSmartmoneyTradersByFilter(
  run: ToolRunner,
  opts: LeaderboardPoolFilterOpts & {
    updateTime?: string;
    after?: string;
    before?: string;
    limit?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_traders_by_filter", {
    updateTime: opts.updateTime,
    ...leaderboardPoolFilterArgs(opts),
    after: opts.after,
    before: opts.before,
    limit: opts.limit,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataTable(data, "No traders found", (r) => ({
    authorId: r["authorId"],
    nickName: r["nickName"],
    pnl: r["pnl"],
    pnlRatio: r["pnlRatio"],
    winRate: r["winRate"],
    maxDrawdown: r["maxDrawdown"],
    asset: r["asset"],
  }));
  printPaginationHint(result);
}

export async function cmdSmartmoneyPerformanceByTrader(
  run: ToolRunner,
  opts: {
    authorIds: string;
    sortBy?: string;
    period?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_performance_by_trader", {
    authorIds: csvToArray(opts.authorIds),
    sortBy: opts.sortBy,
    period: opts.period,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataTable(data, "No traders found", (r) => ({
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
  const result = await run("smartmoney_get_trader_positions", {
    authorId: opts.authorId,
    instId: opts.instId,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataTable(data, "No open positions", (r) => ({
    instId: r["instId"],
    direction: r["direction"] ?? r["posSide"],
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

export async function cmdSmartmoneyTraderPositionsHistory(
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
  printDataTable(data, "No closed positions", (r) => ({
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
  printPaginationHint(result);
}

export async function cmdSmartmoneyTraderOrdersHistory(
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
  printDataTable(data, "No order history", (r) => ({
    cTime: r["cTime"],
    instId: r["instId"],
    side: r["side"],
    posSide: r["posSide"],
    ordType: r["ordType"],
    avgPx: r["avgPx"],
    sz: r["sz"],
    value: r["value"],
  }));
  printPaginationHint(result);
}

export async function cmdSmartmoneySearchTrader(
  run: ToolRunner,
  opts: {
    keyword: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_search_trader", {
    keyword: opts.keyword,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataTable(data, "No matching top traders", (r) => ({
    authorId: r["authorId"],
    nickName: r["nickName"],
    followerCount: r["followerCount"],
  }));
}

/* ------------------------------------------------------------------ */
/*  Signal/Coin family (4)                                             */
/* ------------------------------------------------------------------ */

// Table columns are the "essence" subset for terminal width: pool size, headcount
// long/short, weighted long ratio, net notional, plus 1h/24h/7d trend deltas.
// Capability fields (avgLong/ShortWinRate) and weighted entry prices live only
// in --json output to keep the table readable.
const signalRowMapper = (r: Record<string, unknown>): Record<string, unknown> => {
  const lsr = (r["longShortRatio"] ?? {}) as Record<string, unknown>;
  const notional = (r["notional"] ?? {}) as Record<string, unknown>;
  return {
    ccy: r["ccy"],
    tradersWithPosition: r["tradersWithPosition"],
    longRatio: lsr["longRatio"],
    weightedLongRatio: lsr["weightedLongRatio"],
    longTraders: r["longTraders"],
    shortTraders: r["shortTraders"],
    netNotionalUsdt: notional["netNotionalUsdt"],
    longRatioVs1h: lsr["longRatioVs1h"],
    longRatioVs24h: lsr["longRatioVs24h"],
    longRatioVs7d: lsr["longRatioVs7d"],
  };
};

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
    instCcyList: csvToArray(opts.instCcyList),
    ...signalPoolFilterArgs(opts),
    lmtNum: opts.lmtNum,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataTable(data, "No signal data", signalRowMapper);
}

export async function cmdSmartmoneySignalOverviewByTrader(
  run: ToolRunner,
  opts: {
    authorIds: string;
    topInstruments?: string;
    instCcyList?: string;
    sortBy?: string;
    period?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_overview_by_trader", {
    authorIds: csvToArray(opts.authorIds),
    topInstruments: opts.topInstruments,
    instCcyList: csvToArray(opts.instCcyList),
    sortBy: opts.sortBy,
    period: opts.period,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataTable(data, "No signal data", signalRowMapper);
}

// Time-bucket essence: dataVersion (anchor), headcount + weighted ratios, pool size,
// and gross/net notional. No trend deltas — the time series itself is the trend.
const trendRowMapper = (r: Record<string, unknown>): Record<string, unknown> => ({
  dataVersion: r["dataVersion"],
  ccy: r["ccy"],
  longRatio: r["longRatio"],
  shortRatio: r["shortRatio"],
  weightedLongRatio: r["weightedLongRatio"],
  weightedShortRatio: r["weightedShortRatio"],
  longTraders: r["longTraders"],
  shortTraders: r["shortTraders"],
  tradersWithPosition: r["tradersWithPosition"],
  tradersQualified: r["tradersQualified"],
  netNotionalUsdt: r["netNotionalUsdt"],
  totalNotionalUsdt: r["totalNotionalUsdt"],
});

export async function cmdSmartmoneySignalTrendByFilter(
  run: ToolRunner,
  opts: SignalPoolFilterOpts & {
    instCcy: string;
    asOfTime?: string;
    granularity?: string;
    limit?: string;
    lmtNum?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_trend_by_filter", {
    instCcy: opts.instCcy,
    asOfTime: opts.asOfTime,
    granularity: opts.granularity,
    limit: opts.limit,
    ...signalPoolFilterArgs(opts),
    lmtNum: opts.lmtNum,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataTable(data, "No signal trend data", trendRowMapper);
}

export async function cmdSmartmoneySignalTrendByTrader(
  run: ToolRunner,
  opts: {
    authorIds: string;
    instCcy: string;
    asOfTime?: string;
    granularity?: string;
    limit?: string;
    sortBy?: string;
    period?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("smartmoney_get_signal_trend_by_trader", {
    authorIds: csvToArray(opts.authorIds),
    instCcy: opts.instCcy,
    asOfTime: opts.asOfTime,
    granularity: opts.granularity,
    limit: opts.limit,
    sortBy: opts.sortBy,
    period: opts.period,
  });
  if (opts.json) { printJson(result); return; }
  const data = extractData(result);
  printDataTable(data, "No signal trend data", trendRowMapper);
}
