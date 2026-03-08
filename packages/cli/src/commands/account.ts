import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ToolRunner } from "@agent-tradekit/core";
import { printJson, printKv, printTable } from "../formatter.js";

function getData(result: unknown): unknown {
  return (result as Record<string, unknown>).data;
}

export async function cmdAccountBalance(
  run: ToolRunner,
  ccy: string | undefined,
  json: boolean,
): Promise<void> {
  const result = await run("account_get_balance", { ccy });
  const data = getData(result) as Record<string, unknown>[];
  if (json) return printJson(data);
  const details = (data?.[0]?.["details"] as Record<string, unknown>[]) ?? [];
  printTable(
    details
      .filter((d) => Number(d["eq"]) > 0)
      .map((d) => ({
        currency: d["ccy"],
        equity: d["eq"],
        available: d["availEq"],
        frozen: d["frozenBal"],
      })),
  );
}

export async function cmdAccountAssetBalance(
  run: ToolRunner,
  ccy: string | undefined,
  json: boolean,
): Promise<void> {
  const result = await run("account_get_asset_balance", { ccy });
  const data = getData(result) as Record<string, unknown>[];
  if (json) return printJson(data);
  printTable(
    (data ?? [])
      .filter((r) => Number(r["bal"]) > 0)
      .map((r) => ({
        ccy: r["ccy"],
        bal: r["bal"],
        availBal: r["availBal"],
        frozenBal: r["frozenBal"],
      })),
  );
}

export async function cmdAccountPositions(
  run: ToolRunner,
  opts: { instType?: string; instId?: string; json: boolean },
): Promise<void> {
  const result = await run("account_get_positions", { instType: opts.instType, instId: opts.instId });
  const positions = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(positions);
  const open = (positions ?? []).filter((p) => Number(p["pos"]) !== 0);
  if (!open.length) { process.stdout.write("No open positions\n"); return; }
  printTable(
    open.map((p) => ({
      instId: p["instId"],
      instType: p["instType"],
      side: p["posSide"],
      pos: p["pos"],
      avgPx: p["avgPx"],
      upl: p["upl"],
      lever: p["lever"],
    })),
  );
}

export async function cmdAccountBills(
  run: ToolRunner,
  opts: { archive: boolean; instType?: string; ccy?: string; limit?: number; json: boolean },
): Promise<void> {
  const toolName = opts.archive ? "account_get_bills_archive" : "account_get_bills";
  const result = await run(toolName, { instType: opts.instType, ccy: opts.ccy, limit: opts.limit });
  const bills = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(bills);
  printTable(
    (bills ?? []).map((b) => ({
      billId: b["billId"],
      instId: b["instId"],
      type: b["type"],
      ccy: b["ccy"],
      balChg: b["balChg"],
      bal: b["bal"],
      ts: new Date(Number(b["ts"])).toLocaleString(),
    })),
  );
}

export async function cmdAccountFees(
  run: ToolRunner,
  opts: { instType: string; instId?: string; json: boolean },
): Promise<void> {
  const result = await run("account_get_trade_fee", { instType: opts.instType, instId: opts.instId });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const fee = data?.[0];
  if (!fee) { process.stdout.write("No data\n"); return; }
  printKv({
    level: fee["level"],
    maker: fee["maker"],
    taker: fee["taker"],
    makerU: fee["makerU"],
    takerU: fee["takerU"],
    ts: new Date(Number(fee["ts"])).toLocaleString(),
  });
}

export async function cmdAccountConfig(
  run: ToolRunner,
  json: boolean,
): Promise<void> {
  const result = await run("account_get_config", {});
  const data = getData(result) as Record<string, unknown>[];
  if (json) return printJson(data);
  const cfg = data?.[0];
  if (!cfg) { process.stdout.write("No data\n"); return; }
  printKv({
    uid: cfg["uid"],
    acctLv: cfg["acctLv"],
    posMode: cfg["posMode"],
    autoLoan: cfg["autoLoan"],
    greeksType: cfg["greeksType"],
    level: cfg["level"],
    levelTmp: cfg["levelTmp"],
  });
}

export async function cmdAccountSetPositionMode(
  run: ToolRunner,
  posMode: string,
  json: boolean,
): Promise<void> {
  const result = await run("account_set_position_mode", { posMode });
  const data = getData(result) as Record<string, unknown>[];
  if (json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(`Position mode set: ${r?.["posMode"]}\n`);
}

export async function cmdAccountMaxSize(
  run: ToolRunner,
  opts: { instId: string; tdMode: string; px?: string; json: boolean },
): Promise<void> {
  const result = await run("account_get_max_size", { instId: opts.instId, tdMode: opts.tdMode, px: opts.px });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  if (!r) { process.stdout.write("No data\n"); return; }
  printKv({ instId: r["instId"], maxBuy: r["maxBuy"], maxSell: r["maxSell"] });
}

export async function cmdAccountMaxAvailSize(
  run: ToolRunner,
  opts: { instId: string; tdMode: string; json: boolean },
): Promise<void> {
  const result = await run("account_get_max_avail_size", { instId: opts.instId, tdMode: opts.tdMode });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  if (!r) { process.stdout.write("No data\n"); return; }
  printKv({ instId: r["instId"], availBuy: r["availBuy"], availSell: r["availSell"] });
}

export async function cmdAccountMaxWithdrawal(
  run: ToolRunner,
  ccy: string | undefined,
  json: boolean,
): Promise<void> {
  const result = await run("account_get_max_withdrawal", { ccy });
  const data = getData(result) as Record<string, unknown>[];
  if (json) return printJson(data);
  printTable(
    (data ?? []).map((r) => ({
      ccy: r["ccy"],
      maxWd: r["maxWd"],
      maxWdEx: r["maxWdEx"],
    })),
  );
}

export async function cmdAccountPositionsHistory(
  run: ToolRunner,
  opts: { instType?: string; instId?: string; limit?: number; json: boolean },
): Promise<void> {
  const result = await run("account_get_positions_history", { instType: opts.instType, instId: opts.instId, limit: opts.limit });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  printTable(
    (data ?? []).map((p) => ({
      instId: p["instId"],
      direction: p["direction"],
      openAvgPx: p["openAvgPx"],
      closeAvgPx: p["closeAvgPx"],
      realizedPnl: p["realizedPnl"],
      uTime: new Date(Number(p["uTime"])).toLocaleString(),
    })),
  );
}

export async function cmdAccountTransfer(
  run: ToolRunner,
  opts: {
    ccy: string;
    amt: string;
    from: string;
    to: string;
    transferType?: string;
    subAcct?: string;
    json: boolean;
  },
): Promise<void> {
  const result = await run("account_transfer", {
    ccy: opts.ccy,
    amt: opts.amt,
    from: opts.from,
    to: opts.to,
    type: opts.transferType,
    subAcct: opts.subAcct,
  });
  const data = getData(result) as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  process.stdout.write(`Transfer: ${r?.["transId"]} (${r?.["ccy"]} ${r?.["amt"]})\n`);
}

interface LogEntry {
  timestamp: string;
  tool: string;
  level: string;
  durationMs?: number;
  error?: boolean;
}

function readAuditLogs(logDir: string, days = 7): LogEntry[] {
  const entries: LogEntry[] = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const filePath = path.join(logDir, `trade-${yyyy}-${mm}-${dd}.log`);
    let content: string;
    try { content = fs.readFileSync(filePath, "utf8"); } catch { continue; }
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { entries.push(JSON.parse(trimmed) as LogEntry); } catch { /* skip */ }
    }
  }
  return entries;
}

export function cmdAccountAudit(
  opts: { limit?: string; tool?: string; since?: string; json: boolean },
): void {
  const logDir = path.join(os.homedir(), ".okx", "logs");
  const limit = Math.min(Number(opts.limit) || 20, 100);

  let entries = readAuditLogs(logDir);

  if (opts.tool) entries = entries.filter((e) => e.tool === opts.tool);
  if (opts.since) {
    const sinceTime = new Date(opts.since).getTime();
    entries = entries.filter((e) => new Date(e.timestamp).getTime() >= sinceTime);
  }

  entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  entries = entries.slice(0, limit);

  if (opts.json) return printJson(entries);
  if (!entries.length) { process.stdout.write("No audit log entries\n"); return; }
  printTable(
    entries.map((e) => ({
      timestamp: e.timestamp,
      tool: e.tool,
      level: e.level,
      duration: e.durationMs != null ? `${e.durationMs}ms` : "-",
      status: e.error ? "ERROR" : "OK",
    })),
  );
}
