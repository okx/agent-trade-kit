import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printTable } from "../formatter.js";

function asRaw(result: unknown): Record<string, unknown> {
  return result as Record<string, unknown>;
}

export async function cmdCopyTradeTraders(
  run: ToolRunner,
  opts: { instType?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("copytrading_get_lead_traders", {
    instType: opts.instType ?? "SWAP",
    limit: opts.limit,
  });
  const raw = asRaw(result);
  const data = (raw["data"] ?? []) as Record<string, unknown>[];
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

export async function cmdCopyTradeMyStatus(
  run: ToolRunner,
  opts: { instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_get_my_details", { instType: opts.instType });
  const raw = result as unknown as Record<string, unknown>;
  const traders = (raw.data ?? []) as Record<string, unknown>[];
  if (opts.json) return printJson(raw);

  if (!traders.length) {
    process.stdout.write("No active copy traders\n");
    return;
  }
  printTable(
    traders.map((t) => ({
      uniqueCode: t["uniqueCode"],
      nickName: t["nickName"],
      copyTotalPnl: t["copyTotalPnl"],
      todayPnl: t["todayPnl"],
      upl: t["upl"],
      margin: t["margin"],
    })),
  );
}

export async function cmdCopyTradeFollow(
  run: ToolRunner,
  opts: {
    uniqueCode: string;
    copyTotalAmt?: string;
    copyMgnMode?: string;
    copyInstIdType?: string;
    instId?: string;
    copyMode?: string;
    copyAmt?: string;
    copyRatio?: string;
    initialAmount?: string;
    replicationRequired?: string;
    subPosCloseType?: string;
    instType?: string;
    tpRatio?: string;
    slRatio?: string;
    slTotalAmt?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("copytrading_set_copytrading", {
    uniqueCode: opts.uniqueCode,
    copyTotalAmt: opts.copyTotalAmt,
    copyMgnMode: opts.copyMgnMode,
    copyInstIdType: opts.copyInstIdType,
    instId: opts.instId,
    copyMode: opts.copyMode,
    copyAmt: opts.copyAmt,
    copyRatio: opts.copyRatio,
    initialAmount: opts.initialAmount,
    replicationRequired: opts.replicationRequired,
    subPosCloseType: opts.subPosCloseType,
    instType: opts.instType,
    tpRatio: opts.tpRatio,
    slRatio: opts.slRatio,
    slTotalAmt: opts.slTotalAmt,
  });
  const data = asRaw(result)["data"];
  if (opts.json) return printJson(data);
  process.stdout.write(`Following trader: ${opts.uniqueCode}\n`);
}

export async function cmdCopyTradeUnfollow(
  run: ToolRunner,
  opts: { uniqueCode: string; subPosCloseType?: string; instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_stop_copy_trader", {
    uniqueCode: opts.uniqueCode,
    subPosCloseType: opts.subPosCloseType ?? "copy_close",
    instType: opts.instType,
  });
  const data = asRaw(result)["data"];
  if (opts.json) return printJson(data);
  process.stdout.write(`Stopped copying: ${opts.uniqueCode}\n`);
}

export async function cmdCopyTradeTraderDetail(
  run: ToolRunner,
  opts: { uniqueCode: string; lastDays?: string; instType?: string; json: boolean },
): Promise<void> {
  const result = await run("copytrading_get_trader_details", {
    uniqueCode: opts.uniqueCode,
    lastDays: opts.lastDays ?? "2",
    instType: opts.instType ?? "SWAP",
  });
  const raw = result as unknown as Record<string, unknown>;
  if (opts.json) return printJson(raw);

  const stats = ((raw.stats as Record<string, unknown>[]) ?? [])[0];
  if (stats) {
    process.stdout.write([
      `Win Rate:        ${stats["winRatio"]}`,
      `Profit Days:     ${stats["profitDays"]}`,
      `Loss Days:       ${stats["lossDays"]}`,
      `Follower PnL:    ${stats["curCopyTraderPnl"]} USDT`,
      `Avg Position:    ${stats["avgSubPosNotional"]} USDT`,
      `Invested:        ${stats["investAmt"]} USDT`,
    ].join("\n") + "\n\n");
  }

  const pnl = (raw.pnl as Record<string, unknown>[]) ?? [];
  if (pnl.length) {
    process.stdout.write("Daily P&L:\n");
    printTable(pnl.map((d) => ({
      date: new Date(Number(d["beginTs"])).toLocaleDateString(),
      pnl: d["pnl"],
      pnlRatio: d["pnlRatio"],
    })));
    process.stdout.write("\n");
  }

  const preference = (raw.preference as Record<string, unknown>[]) ?? [];
  if (preference.length) {
    process.stdout.write("Currency Preference:\n");
    printTable(preference.map((d) => ({
      currency: d["ccy"],
      ratio: `${(Number(d["ratio"]) * 100).toFixed(1)}%`,
    })));
  }
}
