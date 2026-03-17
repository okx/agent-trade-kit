/**
 * Extended DCA (Martingale) CLI commands.
 *
 * These commands call OkxRestClient directly (no ToolSpec).
 * They cover 5 DCA OpenAPIs not exposed as MCP tools:
 *   - margin/add, margin/reduce
 *   - settings/take-profit, settings/reinvestment
 *   - orders/manual-buy
 */
import type { OkxRestClient } from "@agent-tradekit/core";
import { privateRateLimit, compactObject } from "@agent-tradekit/core";
import { printJson } from "../formatter.js";

const BASE = "/api/v5/tradingBot/dca";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDataArray(result: { data: unknown }): Record<string, unknown>[] {
  return (result.data as Record<string, unknown>[]) ?? [];
}

function printWriteResult(
  data: Record<string, unknown>[],
  successMsg: string,
): void {
  const r = data[0];
  if (!r) {
    process.stdout.write("No response data\n");
    return;
  }
  const sCode = r["sCode"];
  if (sCode !== undefined && sCode !== "0") {
    process.stdout.write(`Error: [${sCode}] ${r["sMsg"] ?? "Operation failed"}\n`);
    return;
  }
  process.stdout.write(`${successMsg}\n`);
}

// ---------------------------------------------------------------------------
// #1  Add Margin
// POST /api/v5/tradingBot/dca/margin/add
// ---------------------------------------------------------------------------

export async function cmdDcaMarginAdd(
  client: OkxRestClient,
  opts: { algoId: string; amt: string; json: boolean },
): Promise<void> {
  const response = await client.privatePost(
    `${BASE}/margin/add`,
    { algoId: opts.algoId, amt: opts.amt },
    privateRateLimit("dca_margin_add", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `DCA margin added: ${opts.amt} (algoId: ${opts.algoId})`);
}

// ---------------------------------------------------------------------------
// #2  Reduce Margin
// POST /api/v5/tradingBot/dca/margin/reduce
// ---------------------------------------------------------------------------

export async function cmdDcaMarginReduce(
  client: OkxRestClient,
  opts: { algoId: string; amt: string; json: boolean },
): Promise<void> {
  const response = await client.privatePost(
    `${BASE}/margin/reduce`,
    { algoId: opts.algoId, amt: opts.amt },
    privateRateLimit("dca_margin_reduce", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `DCA margin reduced: ${opts.amt} (algoId: ${opts.algoId})`);
}

// ---------------------------------------------------------------------------
// #3  Set Take-Profit
// POST /api/v5/tradingBot/dca/settings/take-profit
// ---------------------------------------------------------------------------

export async function cmdDcaSetTakeProfit(
  client: OkxRestClient,
  opts: { algoId: string; tpPrice: string; json: boolean },
): Promise<void> {
  const response = await client.privatePost(
    `${BASE}/settings/take-profit`,
    { algoId: opts.algoId, algoOrdType: "contract_dca", tpPrice: opts.tpPrice },
    privateRateLimit("dca_set_take_profit", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `DCA take-profit updated: ${opts.tpPrice} (algoId: ${opts.algoId})`);
}

// ---------------------------------------------------------------------------
// #4  Set Reinvestment
// POST /api/v5/tradingBot/dca/settings/reinvestment
// ---------------------------------------------------------------------------

export async function cmdDcaSetReinvestment(
  client: OkxRestClient,
  opts: { algoId: string; allowReinvest: string; json: boolean },
): Promise<void> {
  const response = await client.privatePost(
    `${BASE}/settings/reinvestment`,
    { algoId: opts.algoId, algoOrdType: "contract_dca", allowReinvest: opts.allowReinvest },
    privateRateLimit("dca_set_reinvestment", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  const label = opts.allowReinvest === "true" ? "enabled" : "disabled";
  printWriteResult(data, `DCA reinvestment ${label} (algoId: ${opts.algoId})`);
}

// ---------------------------------------------------------------------------
// #5  Manual Buy
// POST /api/v5/tradingBot/dca/orders/manual-buy
// ---------------------------------------------------------------------------

export async function cmdDcaManualBuy(
  client: OkxRestClient,
  opts: { algoId: string; amt: string; px: string; json: boolean },
): Promise<void> {
  const response = await client.privatePost(
    `${BASE}/orders/manual-buy`,
    {
      algoId: opts.algoId,
      algoOrdType: "contract_dca",
      amt: opts.amt,
      price: opts.px,
    },
    privateRateLimit("dca_manual_buy", 20),
  );
  const data = getDataArray(response);
  if (opts.json) return printJson(data);
  printWriteResult(data, `DCA manual buy: ${opts.amt} (algoId: ${opts.algoId})`);
}
