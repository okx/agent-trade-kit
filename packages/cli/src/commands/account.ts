import type { OkxRestClient } from "@agent-tradekit/core";
import { printJson, printKv, printTable } from "../formatter.js";

export async function cmdAccountBalance(
  client: OkxRestClient,
  ccy: string | undefined,
  json: boolean,
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (ccy) params["ccy"] = ccy;
  const res = await client.privateGet("/api/v5/account/balance", params);
  const data = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  ccy: string | undefined,
  json: boolean,
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (ccy) params["ccy"] = ccy;
  const res = await client.privateGet("/api/v5/asset/balances", params);
  const data = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  opts: { instType?: string; instId?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.instType) params["instType"] = opts.instType;
  if (opts.instId) params["instId"] = opts.instId;
  const res = await client.privateGet("/api/v5/account/positions", params);
  const positions = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  opts: { archive: boolean; instType?: string; ccy?: string; limit?: number; json: boolean },
): Promise<void> {
  const endpoint = opts.archive ? "/api/v5/account/bills-archive" : "/api/v5/account/bills";
  const params: Record<string, unknown> = {};
  if (opts.instType) params["instType"] = opts.instType;
  if (opts.ccy) params["ccy"] = opts.ccy;
  if (opts.limit) params["limit"] = String(opts.limit);
  const res = await client.privateGet(endpoint, params);
  const bills = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  opts: { instType: string; instId?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instType: opts.instType };
  if (opts.instId) params["instId"] = opts.instId;
  const res = await client.privateGet("/api/v5/account/trade-fee", params);
  const data = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  json: boolean,
): Promise<void> {
  const res = await client.privateGet("/api/v5/account/config", {});
  const data = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  posMode: string,
  json: boolean,
): Promise<void> {
  const res = await client.privatePost("/api/v5/account/set-position-mode", { posMode });
  if (json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Position mode set: ${r?.["posMode"]}\n`);
}

export async function cmdAccountMaxSize(
  client: OkxRestClient,
  opts: { instId: string; tdMode: string; px?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instId: opts.instId, tdMode: opts.tdMode };
  if (opts.px) params["px"] = opts.px;
  const res = await client.privateGet("/api/v5/account/max-size", params);
  const data = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  if (!r) { process.stdout.write("No data\n"); return; }
  printKv({ instId: r["instId"], maxBuy: r["maxBuy"], maxSell: r["maxSell"] });
}

export async function cmdAccountMaxAvailSize(
  client: OkxRestClient,
  opts: { instId: string; tdMode: string; json: boolean },
): Promise<void> {
  const res = await client.privateGet("/api/v5/account/max-avail-size", {
    instId: opts.instId,
    tdMode: opts.tdMode,
  });
  const data = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const r = data?.[0];
  if (!r) { process.stdout.write("No data\n"); return; }
  printKv({ instId: r["instId"], availBuy: r["availBuy"], availSell: r["availSell"] });
}

export async function cmdAccountMaxWithdrawal(
  client: OkxRestClient,
  ccy: string | undefined,
  json: boolean,
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (ccy) params["ccy"] = ccy;
  const res = await client.privateGet("/api/v5/account/max-withdrawal", params);
  const data = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
  opts: { instType?: string; instId?: string; limit?: number; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = {};
  if (opts.instType) params["instType"] = opts.instType;
  if (opts.instId) params["instId"] = opts.instId;
  if (opts.limit) params["limit"] = String(opts.limit);
  const res = await client.privateGet("/api/v5/account/positions-history", params);
  const data = res.data as Record<string, unknown>[];
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
  client: OkxRestClient,
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
  const body: Record<string, unknown> = {
    ccy: opts.ccy,
    amt: opts.amt,
    from: opts.from,
    to: opts.to,
  };
  if (opts.transferType) body["type"] = opts.transferType;
  if (opts.subAcct) body["subAcct"] = opts.subAcct;
  const res = await client.privatePost("/api/v5/asset/transfer", body);
  if (opts.json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Transfer: ${r?.["transId"]} (${r?.["ccy"]} ${r?.["amt"]})\n`);
}
