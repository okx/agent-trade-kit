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

export async function cmdEarnFixedOrderList(
  run: ToolRunner,
  opts: { ccy?: string; state?: string; json: boolean },
): Promise<void> {
  const data = extractData(await run("earn_get_fixed_order_list", {
    ccy: opts.ccy, state: opts.state,
  }));
  printDataList(data, opts.json, "No fixed earn orders", (r) => ({
    reqId: r["reqId"], ccy: r["ccy"], amt: r["amt"], rate: r["rate"],
    term: r["term"], state: r["state"],
    accruedInterest: r["accruedInterest"],
    cTime: new Date(Number(r["cTime"])).toLocaleString(),
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

function printFixedPurchasePreview(rec: Record<string, unknown>): void {
  const offer = rec["offer"] as Record<string, unknown> | null;
  outputLine("");
  outputLine("📋 Fixed Earn Purchase Preview");
  outputLine(`  Currency: ${rec["ccy"]}`);
  outputLine(`  Amount:   ${rec["amt"]}`);
  outputLine(`  Term:     ${rec["term"]}`);
  if (rec["currentFlexibleRate"]) {
    outputLine(`  Current flexible rate: ${rec["currentFlexibleRate"]}`);
  }
  if (offer) {
    printKv({
      rate: offer["rate"],
      minLend: offer["minLend"],
      remainingQuota: offer["lendQuota"],
      soldOut: offer["soldOut"] ? "Yes" : "No",
    });
  } else {
    outputLine("  ⚠️  No matching offer found for this term.");
  }
  outputLine("");
  outputLine((rec["warning"] as string) ?? "");
  outputLine("");
  outputLine("Re-run with --confirm to execute.");
}

export async function cmdEarnFixedPurchase(
  run: ToolRunner,
  opts: { ccy: string; amt: string; term: string; confirm: boolean; json: boolean },
): Promise<void> {
  const result = await run("earn_fixed_purchase", {
    ccy: opts.ccy, amt: opts.amt, term: opts.term, confirm: opts.confirm,
  });
  if (!result || typeof result !== "object") {
    outputLine("No response data");
    return;
  }
  const rec = result as unknown as Record<string, unknown>;

  if (rec["preview"]) {
    if (opts.json) { printJson(rec); return; }
    printFixedPurchasePreview(rec);
    return;
  }

  // Execute mode — show result
  const data = extractData(result);
  if (opts.json) { printJson(data); return; }
  const r = data[0];
  if (!r) { outputLine("No response data"); return; }
  printKv({ reqId: r["reqId"], ccy: r["ccy"], amt: r["amt"], term: r["term"] });
}

export async function cmdEarnFixedRedeem(
  run: ToolRunner,
  opts: { reqId: string; json: boolean },
): Promise<void> {
  const data = extractData(await run("earn_fixed_redeem", { reqId: opts.reqId }));
  if (opts.json) { printJson(data); return; }
  if (!data.length) { outputLine("No response data"); return; }
  printTable(data.map((r) => ({ reqId: r["reqId"] })));
}

export async function cmdEarnLendingRateHistory(
  run: ToolRunner,
  opts: { ccy?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("earn_get_lending_rate_history", { ccy: opts.ccy, limit: opts.limit });
  const data = extractData(result);
  const fixedOffers = extractFixedOffers(result);

  if (opts.json) { printJson({ data, fixedOffers }); return; }

  printDataList(data, false, "No rate history data", (r) => ({
    ccy: r["ccy"], lendingRate: r["lendingRate"],
    ts: new Date(Number(r["ts"])).toLocaleString(),
  }));

  if (fixedOffers.length > 0) {
    outputLine("");
    outputLine("Fixed-term offers:");
    printTable(fixedOffers.map((r) => ({
      ccy: r["ccy"], term: r["term"], rate: r["rate"],
      minLend: r["minLend"],
      remainingQuota: r["lendQuota"],
      soldOut: r["soldOut"] ? "Yes" : "No",
    })));
  }
}

function extractFixedOffers(result: unknown): Record<string, unknown>[] {
  if (result && typeof result === "object") {
    const offers = (result as Record<string, unknown>)["fixedOffers"];
    if (Array.isArray(offers)) return offers as Record<string, unknown>[];
  }
  return [];
}
