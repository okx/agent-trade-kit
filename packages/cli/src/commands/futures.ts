import type { OkxRestClient } from "@agent-tradekit/core";
import { printJson, printKv, printTable } from "../formatter.js";

export async function cmdFuturesOrders(
  client: OkxRestClient,
  opts: { instId?: string; status: "open" | "history" | "archive"; json: boolean },
): Promise<void> {
  const path =
    opts.status === "archive"
      ? "/api/v5/trade/orders-history-archive"
      : opts.status === "history"
        ? "/api/v5/trade/orders-history"
        : "/api/v5/trade/orders-pending";
  const params: Record<string, unknown> = { instType: "FUTURES" };
  if (opts.instId) params["instId"] = opts.instId;
  const res = await client.privateGet(path, params);
  const orders = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(orders);
  printTable(
    (orders ?? []).map((o) => ({
      ordId: o["ordId"],
      instId: o["instId"],
      side: o["side"],
      posSide: o["posSide"],
      type: o["ordType"],
      price: o["px"],
      size: o["sz"],
      state: o["state"],
    })),
  );
}

export async function cmdFuturesPositions(
  client: OkxRestClient,
  instId: string | undefined,
  json: boolean,
): Promise<void> {
  const params: Record<string, unknown> = { instType: "FUTURES" };
  if (instId) params["instId"] = instId;
  const res = await client.privateGet("/api/v5/account/positions", params);
  const positions = res.data as Record<string, unknown>[];
  if (json) return printJson(positions);
  const open = (positions ?? []).filter((p) => Number(p["pos"]) !== 0);
  if (!open.length) { process.stdout.write("No open positions\n"); return; }
  printTable(
    open.map((p) => ({
      instId: p["instId"],
      side: p["posSide"],
      pos: p["pos"],
      avgPx: p["avgPx"],
      upl: p["upl"],
      lever: p["lever"],
    })),
  );
}

export async function cmdFuturesFills(
  client: OkxRestClient,
  opts: { instId?: string; ordId?: string; archive: boolean; json: boolean },
): Promise<void> {
  const path = opts.archive ? "/api/v5/trade/fills-history" : "/api/v5/trade/fills";
  const params: Record<string, unknown> = { instType: "FUTURES" };
  if (opts.instId) params["instId"] = opts.instId;
  if (opts.ordId) params["ordId"] = opts.ordId;
  const res = await client.privateGet(path, params);
  const fills = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(fills);
  printTable(
    (fills ?? []).map((f) => ({
      instId: f["instId"],
      side: f["side"],
      fillPx: f["fillPx"],
      fillSz: f["fillSz"],
      fee: f["fee"],
      ts: new Date(Number(f["ts"])).toLocaleString(),
    })),
  );
}

export async function cmdFuturesPlace(
  client: OkxRestClient,
  opts: {
    instId: string;
    side: string;
    ordType: string;
    sz: string;
    tdMode: string;
    posSide?: string;
    px?: string;
    reduceOnly?: boolean;
    json: boolean;
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    instId: opts.instId,
    tdMode: opts.tdMode,
    side: opts.side,
    ordType: opts.ordType,
    sz: opts.sz,
  };
  if (opts.posSide) body["posSide"] = opts.posSide;
  if (opts.px) body["px"] = opts.px;
  if (opts.reduceOnly !== undefined) body["reduceOnly"] = String(opts.reduceOnly);
  const res = await client.privatePost("/api/v5/trade/order", body);
  if (opts.json) return printJson(res.data);
  const order = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Order placed: ${order?.["ordId"]} (${order?.["sCode"] === "0" ? "OK" : order?.["sMsg"]})\n`);
}

export async function cmdFuturesCancel(
  client: OkxRestClient,
  instId: string,
  ordId: string,
  json: boolean,
): Promise<void> {
  const res = await client.privatePost("/api/v5/trade/cancel-order", { instId, ordId });
  if (json) return printJson(res.data);
  const r = (res.data as Record<string, unknown>[])[0];
  process.stdout.write(`Cancelled: ${r?.["ordId"]} (${r?.["sCode"] === "0" ? "OK" : r?.["sMsg"]})\n`);
}

export async function cmdFuturesGet(
  client: OkxRestClient,
  opts: { instId: string; ordId?: string; json: boolean },
): Promise<void> {
  const params: Record<string, unknown> = { instId: opts.instId };
  if (opts.ordId) params["ordId"] = opts.ordId;
  const res = await client.privateGet("/api/v5/trade/order", params);
  const data = res.data as Record<string, unknown>[];
  if (opts.json) return printJson(data);
  const o = data?.[0];
  if (!o) { process.stdout.write("No data\n"); return; }
  printKv({
    ordId: o["ordId"],
    instId: o["instId"],
    side: o["side"],
    posSide: o["posSide"],
    ordType: o["ordType"],
    px: o["px"],
    sz: o["sz"],
    fillSz: o["fillSz"],
    avgPx: o["avgPx"],
    state: o["state"],
    cTime: new Date(Number(o["cTime"])).toLocaleString(),
  });
}
