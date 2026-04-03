import type { ToolRunner } from "@agent-tradekit/core";
import { outputLine, printJson, printKv, printTable } from "../formatter.js";

function extractData(result: unknown): Record<string, unknown>[] {
  if (result && typeof result === "object") {
    const data = (result as Record<string, unknown>)["data"];
    if (Array.isArray(data)) return data as Record<string, unknown>[];
  }
  return [];
}

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

export async function cmdEarnSavingsBalance(
  run: ToolRunner,
  ccy: string | undefined,
  json: boolean,
): Promise<void> {
  const data = extractData(await run("earn_get_savings_balance", { ccy }));
  printDataList(data, json, "No savings balance", (r) => ({
    ccy: r["ccy"], amt: r["amt"], earnings: r["earnings"],
    rate: r["rate"], loanAmt: r["loanAmt"], pendingAmt: r["pendingAmt"],
  }));
}

export async function cmdEarnSavingsPurchase(
  run: ToolRunner,
  opts: { ccy: string; amt: string; rate?: string; json: boolean },
): Promise<void> {
  const data = extractData(await run("earn_savings_purchase", { ccy: opts.ccy, amt: opts.amt, rate: opts.rate }));
  if (opts.json) { printJson(data); return; }
  const r = data[0];
  if (!r) { outputLine("No response data"); return; }
  printKv({ ccy: r["ccy"], amt: r["amt"], side: r["side"], rate: r["rate"] });
}

export async function cmdEarnSavingsRedeem(
  run: ToolRunner,
  opts: { ccy: string; amt: string; json: boolean },
): Promise<void> {
  const data = extractData(await run("earn_savings_redeem", { ccy: opts.ccy, amt: opts.amt }));
  if (opts.json) { printJson(data); return; }
  const r = data[0];
  if (!r) { outputLine("No response data"); return; }
  printKv({ ccy: r["ccy"], amt: r["amt"], side: r["side"] });
}

export async function cmdEarnSetLendingRate(
  run: ToolRunner,
  opts: { ccy: string; rate: string; json: boolean },
): Promise<void> {
  const data = extractData(await run("earn_set_lending_rate", { ccy: opts.ccy, rate: opts.rate }));
  if (opts.json) { printJson(data); return; }
  const r = data[0];
  outputLine(`Lending rate set: ${r?.["ccy"]} → ${r?.["rate"]}`);
}

export async function cmdEarnLendingHistory(
  run: ToolRunner,
  opts: { ccy?: string; limit?: number; json: boolean },
): Promise<void> {
  const data = extractData(await run("earn_get_lending_history", { ccy: opts.ccy, limit: opts.limit }));
  printDataList(data, opts.json, "No lending history", (r) => ({
    ccy: r["ccy"], amt: r["amt"], earnings: r["earnings"],
    rate: r["rate"], ts: new Date(Number(r["ts"])).toLocaleString(),
  }));
}

export async function cmdEarnLendingRateHistory(
  run: ToolRunner,
  opts: { ccy?: string; limit?: number; json: boolean },
): Promise<void> {
  const data = extractData(await run("earn_get_lending_rate_history", { ccy: opts.ccy, limit: opts.limit }));
  printDataList(data, opts.json, "No rate history data", (r) => ({
    ccy: r["ccy"], lendingRate: r["lendingRate"],
    rate: r["rate"], ts: new Date(Number(r["ts"])).toLocaleString(),
  }));
}
