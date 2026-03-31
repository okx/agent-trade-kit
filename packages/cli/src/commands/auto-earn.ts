import type { ToolRunner } from "@agent-tradekit/core";
import { outputLine, errorLine, printJson, printTable } from "../formatter.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BalanceDetail {
  ccy: string;
  eq?: string;              // equity — used as invested amount for USDG earn currencies
  autoLendStatus: string;   // "unsupported" | "off" | "pending" | "active"
  autoStakingStatus: string; // "unsupported" | "off" | "pending" | "active"
  autoLendAmt: string;
  autoLendMtAmt: string;
  autoLendApr: string;
  [key: string]: unknown;
}

type EarnType = "0" | "1";

/**
 * Known currencies that use earnType="1" (USDG earn).
 * Source: OKX API docs for POST /api/v5/account/set-auto-earn.
 * Update this list when OKX adds new USDG earn currencies.
 */
const USDG_EARN_CURRENCIES = new Set(["USDG", "BUIDL"]);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isSupported(status: string | undefined): boolean {
  return !!status && status !== "unsupported";
}

/**
 * Infer earnType from balance detail.
 *
 * - autoLendStatus or autoStakingStatus != "unsupported" → earnType "0" (lend+stake)
 * - Known USDG-earn currencies (USDG, BUIDL) → earnType "1"
 * - Otherwise → null (not supported)
 */
export function inferEarnType(detail: BalanceDetail): EarnType | null {
  if (isSupported(detail.autoLendStatus) || isSupported(detail.autoStakingStatus)) return "0";
  if (USDG_EARN_CURRENCIES.has(detail.ccy)) return "1";
  return null;
}

async function getBalanceDetails(
  run: ToolRunner,
  ccy?: string,
): Promise<BalanceDetail[]> {
  const result = await run("account_get_balance", ccy ? { ccy } : {});
  const data = result.data as Record<string, unknown>[] | undefined;
  const first = data?.[0];
  return (first?.details as BalanceDetail[]) ?? [];
}

function earnTypeLabel(et: EarnType): string {
  return et === "1" ? "USDG earn" : "lend+stake";
}

/* ------------------------------------------------------------------ */
/*  Commands                                                           */
/* ------------------------------------------------------------------ */

export async function cmdAutoEarnStatus(
  run: ToolRunner,
  ccy: string | undefined,
  json: boolean,
): Promise<void> {
  const details = await getBalanceDetails(run, ccy);

  const relevant = details.filter((d) => inferEarnType(d) !== null);

  if (json) { printJson(relevant); return; }

  if (!relevant.length) {
    outputLine(ccy ? `${ccy} does not support auto-earn` : "No currencies support auto-earn");
    return;
  }

  printTable(relevant.map((d) => {
    const et = inferEarnType(d)!;
    return {
      ccy: d.ccy,
      earnType: earnTypeLabel(et),
      autoLend: d.autoLendStatus,
      autoStaking: d.autoStakingStatus,
      invested: et === "1" ? (d.eq || "-") : (d.autoLendAmt || "-"),
      matched: d.autoLendMtAmt || "-",
      apr: d.autoLendApr ? `${(Number(d.autoLendApr) * 100).toFixed(2)}%` : "-",
    };
  }));
}

export async function cmdAutoEarnOn(
  run: ToolRunner,
  ccy: string,
  json: boolean,
): Promise<void> {
  const details = await getBalanceDetails(run, ccy);
  const detail = details.find((d) => d.ccy === ccy);
  if (!detail) {
    errorLine(`Currency ${ccy} not found in account balance`);
    process.exitCode = 1;
    return;
  }

  const earnType = inferEarnType(detail);
  if (earnType === null) {
    errorLine(`${ccy} does not support auto-earn`);
    process.exitCode = 1;
    return;
  }

  const result = await run("earn_auto_set", { ccy, action: "turn_on", earnType });

  if (json) { printJson(result.data); return; }
  outputLine(`Auto-earn enabled for ${ccy} (${earnTypeLabel(earnType)})`);
}

export async function cmdAutoEarnOff(
  run: ToolRunner,
  ccy: string,
  json: boolean,
): Promise<void> {
  const details = await getBalanceDetails(run, ccy);
  const detail = details.find((d) => d.ccy === ccy);
  if (!detail) {
    errorLine(`Currency ${ccy} not found in account balance`);
    process.exitCode = 1;
    return;
  }

  const earnType = inferEarnType(detail);
  if (earnType === null) {
    errorLine(`${ccy} does not support auto-earn`);
    process.exitCode = 1;
    return;
  }

  const result = await run("earn_auto_set", { ccy, action: "turn_off", earnType });

  if (json) { printJson(result.data); return; }
  outputLine(`Auto-earn disabled for ${ccy} (${earnTypeLabel(earnType)})`);
}
