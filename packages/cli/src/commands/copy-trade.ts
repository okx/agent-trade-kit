import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printTable } from "../formatter.js";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
}

export async function cmdCopyTradeTraders(
  run: ToolRunner,
  opts: { instType?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("copytrading_public_lead_traders", {
    instType: opts.instType ?? "SWAP",
    limit: opts.limit,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((t) => ({
      uniqueCode: t["uniqueCode"],
      nickName: t["nickName"],
      pnl: t["pnl"],
      winRatio: t["winRatio"],
      copyTraderNum: t["copyTraderNum"],
      leadDays: t["leadDays"],
    })),
  );
}

export async function cmdCopyTradePositions(
  run: ToolRunner,
  opts: { instId?: string; instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_copy_positions", {
    instId: opts.instId,
    instType: opts.instType,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  if (!(data ?? []).length) { process.stdout.write("No open copy positions\n"); return; }
  printTable(
    (data ?? []).map((p) => ({
      instId: p["instId"],
      posSide: p["posSide"],
      subPos: p["subPos"],
      openAvgPx: p["openAvgPx"],
      upl: p["upl"],
      uniqueCode: p["uniqueCode"],
    })),
  );
}

export async function cmdCopyTradeFollow(
  run: ToolRunner,
  opts: {
    uniqueCode: string;
    copyTotalAmt: string;
    copyMgnMode?: string;
    copyInstIdType?: string;
    copyMode?: string;
    copyAmt?: string;
    copyRatio?: string;
    subPosCloseType?: string;
    instType?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("copytrading_follow_trader", {
    uniqueCode: opts.uniqueCode,
    copyTotalAmt: opts.copyTotalAmt,
    copyMgnMode: opts.copyMgnMode ?? "isolated",
    copyInstIdType: opts.copyInstIdType ?? "copy",
    copyMode: opts.copyMode ?? "fixed_amount",
    copyAmt: opts.copyAmt,
    copyRatio: opts.copyRatio,
    subPosCloseType: opts.subPosCloseType ?? "copy_close",
    instType: opts.instType ?? "SWAP",
  });
  const data = getData(result);
  if (opts.json) return printJson(data);
  process.stdout.write(`Following trader: ${opts.uniqueCode}\n`);
}

export async function cmdCopyTradeUnfollow(
  run: ToolRunner,
  opts: { uniqueCode: string; subPosCloseType?: string; instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_stop_copy_trader", {
    uniqueCode: opts.uniqueCode,
    subPosCloseType: opts.subPosCloseType ?? "manual_close",
    instType: opts.instType,
  });
  const data = getData(result);
  if (opts.json) return printJson(data);
  process.stdout.write(`Stopped copying: ${opts.uniqueCode}\n`);
}

export async function cmdCopyTradeUpdate(
  run: ToolRunner,
  opts: {
    uniqueCode: string;
    copyTotalAmt?: string;
    copyMgnMode?: string;
    copyInstIdType?: string;
    copyMode?: string;
    copyAmt?: string;
    copyRatio?: string;
    subPosCloseType?: string;
    instType?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("copytrading_amend_settings", {
    uniqueCode: opts.uniqueCode,
    copyTotalAmt: opts.copyTotalAmt,
    copyMgnMode: opts.copyMgnMode ?? "isolated",
    copyInstIdType: opts.copyInstIdType ?? "copy",
    copyMode: opts.copyMode,
    copyAmt: opts.copyAmt,
    copyRatio: opts.copyRatio,
    subPosCloseType: opts.subPosCloseType ?? "copy_close",
    instType: opts.instType,
  });
  const data = getData(result);
  if (opts.json) return printJson(data);
  process.stdout.write(`Updated settings for: ${opts.uniqueCode}\n`);
}

export async function cmdCopyTradePnl(
  run: ToolRunner,
  opts: { instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_current_lead_traders", {
    instType: opts.instType ?? "SWAP",
  });
  const raw = result as Record<string, unknown>;
  const data = (Array.isArray(raw.data) ? raw.data : []) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  if (!(data ?? []).length) { process.stdout.write("No active copy traders\n"); return; }
  process.stdout.write(
    ["uniqueCode        ", "nickName            ", "totalPnl          ", "todayPnl  ", "upl       ", "margin"].join("  ") + "\n"
  );
  process.stdout.write("-".repeat(120) + "\n");
  for (const t of data ?? []) {
    process.stdout.write(
      [
        String(t["uniqueCode"] ?? "").padEnd(16),
        String(t["nickName"] ?? "").padEnd(20),
        String(t["copyTotalPnl"] ?? "").padEnd(18),
        String(t["todayPnl"] ?? "").padEnd(10),
        String(t["upl"] ?? "").padEnd(10),
        String(t["margin"] ?? ""),
      ].join("  ") + "\n"
    );
  }
}

export async function cmdCopyTradeOrders(
  run: ToolRunner,
  opts: { instId?: string; instType?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("copytrading_history_positions", {
    instId: opts.instId,
    instType: opts.instType,
    limit: opts.limit,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  if (!(data ?? []).length) { process.stdout.write("No history positions\n"); return; }
  printTable(
    (data ?? []).map((o) => ({
      instId: o["instId"],
      posSide: o["posSide"],
      openAvgPx: o["openAvgPx"],
      closeAvgPx: o["closeAvgPx"],
      pnl: o["pnl"],
      uniqueCode: o["uniqueCode"],
    })),
  );
}

export async function cmdCopyTradeTraderPnl(
  run: ToolRunner,
  opts: { uniqueCode: string; lastDays?: string; instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_public_lead_trader_pnl", {
    uniqueCode: opts.uniqueCode,
    lastDays: opts.lastDays ?? "2",
    instType: opts.instType ?? "SWAP",
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  if (!(data ?? []).length) { process.stdout.write("No data\n"); return; }
  printTable((data ?? []).map((d) => ({
    date: new Date(Number(d["beginTs"])).toLocaleDateString(),
    pnl: d["pnl"],
    pnlRatio: d["pnlRatio"],
  })));
}

export async function cmdCopyTradeTraderWeeklyPnl(
  run: ToolRunner,
  opts: { uniqueCode: string; instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_public_weekly_pnl", {
    uniqueCode: opts.uniqueCode,
    instType: opts.instType ?? "SWAP",
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  if (!(data ?? []).length) { process.stdout.write("No data\n"); return; }
  printTable((data ?? []).map((d) => ({
    weekStart: new Date(Number(d["beginTs"])).toLocaleDateString(),
    pnl: d["pnl"],
    pnlRatio: d["pnlRatio"],
  })));
}

export async function cmdCopyTradeTraderStats(
  run: ToolRunner,
  opts: { uniqueCode: string; lastDays?: string; instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_public_stats", {
    uniqueCode: opts.uniqueCode,
    lastDays: opts.lastDays ?? "2",
    instType: opts.instType ?? "SWAP",
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const d = data?.[0];
  if (!d) { process.stdout.write("No data\n"); return; }
  process.stdout.write([
    `Win Rate:        ${d["winRatio"]}`,
    `Profit Days:     ${d["profitDays"]}`,
    `Loss Days:       ${d["lossDays"]}`,
    `Follower PnL:    ${d["curCopyTraderPnl"]} USDT`,
    `Avg Position:    ${d["avgSubPosNotional"]} USDT`,
    `Invested:        ${d["investAmt"]} USDT`,
  ].join("\n") + "\n");
}

export async function cmdCopyTradeTraderPreference(
  run: ToolRunner,
  opts: { uniqueCode: string; instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_public_preference_currency", {
    uniqueCode: opts.uniqueCode,
    instType: opts.instType ?? "SWAP",
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  if (!(data ?? []).length) { process.stdout.write("No data\n"); return; }
  printTable((data ?? []).map((d) => ({
    currency: d["ccy"],
    ratio: `${(Number(d["ratio"]) * 100).toFixed(1)}%`,
  })));
}

export async function cmdCopyTradeTraderPositions(
  run: ToolRunner,
  opts: { uniqueCode: string; instType?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("copytrading_public_current_positions", {
    uniqueCode: opts.uniqueCode,
    instType: opts.instType ?? "SWAP",
    limit: opts.limit,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  if (!(data ?? []).length) { process.stdout.write("No open positions\n"); return; }
  printTable((data ?? []).map((p) => ({
    instId: p["instId"],
    posSide: p["posSide"],
    subPos: p["subPos"],
    openAvgPx: p["openAvgPx"],
    upl: p["upl"],
    lever: p["lever"],
  })));
}

export async function cmdCopyTradeTraderHistory(
  run: ToolRunner,
  opts: { uniqueCode: string; instType?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("copytrading_public_history_positions", {
    uniqueCode: opts.uniqueCode,
    instType: opts.instType ?? "SWAP",
    limit: opts.limit,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  if (!(data ?? []).length) { process.stdout.write("No history\n"); return; }
  printTable((data ?? []).map((p) => ({
    instId: p["instId"],
    posSide: p["posSide"],
    openAvgPx: p["openAvgPx"],
    closeAvgPx: p["closeAvgPx"],
    pnl: p["pnl"],
    pnlRatio: p["pnlRatio"],
  })));
}

export async function cmdCopyTradePublicConfig(
  run: ToolRunner,
  opts: { instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_public_config", {
    instType: opts.instType ?? "SWAP",
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const d = data?.[0];
  if (!d) { process.stdout.write("No data\n"); return; }
  process.stdout.write([
    `Copy Amount:  min ${d["minCopyAmt"]} ~ max ${d["maxCopyAmt"]} USDT (per order)`,
    `Total Amount: max ${d["maxCopyTotalAmt"]} USDT`,
    `Copy Ratio:   min ${d["minCopyRatio"]} ~ max ${d["maxCopyRatio"]}`,
    `TP Ratio:     max ${d["maxTpRatio"]}`,
    `SL Ratio:     max ${d["maxSlRatio"]}`,
  ].join("\n") + "\n");
}
