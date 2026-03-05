/**
 * Stateless (read-only) scenario tests.
 *
 * These scenarios make no writes and can run in CI without side effects.
 * Each scenario verifies that a chain of read tools returns consistent,
 * well-structured data.
 */

import {
  type ScenarioResult,
  type StepContext,
  type StepResult,
  assertField,
  runStep,
  sleep,
} from "./utils.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function scenario(
  name: string,
  steps: StepResult[],
  ms: number,
): ScenarioResult {
  const failed = steps.some((s) => s.status === "FAIL");
  return {
    name,
    type: "stateless",
    status: failed ? "FAIL" : "PASS",
    steps,
    ms,
  };
}

// ─── Scenario 1: Account balance structure ───────────────────────────────────

async function accountBalanceStructure(ctx: StepContext): Promise<ScenarioResult> {
  const t0 = Date.now();
  const steps: StepResult[] = [];

  // Step 1: get balance
  let step = await runStep(ctx, "account_get_balance", "account_get_balance", {});
  step = assertField(step, (d) => {
    const arr = (d as { data?: { totalEq?: string }[] })?.data;
    return Array.isArray(arr) && arr.length > 0 ? arr[0].totalEq : undefined;
  }, "data[0].totalEq");
  steps.push(step);
  await sleep(120);

  // Step 2: get positions (may be empty — that's fine)
  let posStep = await runStep(ctx, "account_get_positions", "account_get_positions", {});
  if (posStep.status === "PASS") {
    const arr = (posStep.data as { data?: unknown[] })?.data;
    if (Array.isArray(arr) && arr.length === 0) {
      posStep = { ...posStep, note: "no open positions (empty array is valid)" };
    }
  }
  steps.push(posStep);
  await sleep(120);

  // Step 3: get account config
  let cfgStep = await runStep(ctx, "account_get_config", "account_get_config", {});
  cfgStep = assertField(cfgStep, (d) => {
    const arr = (d as { data?: { posMode?: string }[] })?.data;
    return arr?.[0]?.posMode;
  }, "data[0].posMode");
  steps.push(cfgStep);

  return scenario("Account balance + positions + config structure", steps, Date.now() - t0);
}

// ─── Scenario 2: Market data consistency ─────────────────────────────────────

async function marketDataConsistency(ctx: StepContext): Promise<ScenarioResult> {
  const t0 = Date.now();
  const steps: StepResult[] = [];

  const SPOT = "BTC-USDT";
  const SWAP = "BTC-USDT-SWAP";

  // Step 1: get spot ticker
  let tickerStep = await runStep(ctx, "market_get_ticker (BTC-USDT)", "market_get_ticker", { instId: SPOT });
  tickerStep = assertField(tickerStep, (d) => {
    const arr = (d as { data?: { last?: string }[] })?.data;
    return arr?.[0]?.last;
  }, "data[0].last");
  steps.push(tickerStep);
  await sleep(120);

  // Step 2: get funding rate for SWAP — should reference same base asset
  let fundingStep = await runStep(ctx, "market_get_funding_rate (BTC-USDT-SWAP)", "market_get_funding_rate", { instId: SWAP });
  fundingStep = assertField(fundingStep, (d) => {
    const arr = (d as { data?: { fundingRate?: string; instId?: string }[] })?.data;
    return arr?.[0]?.fundingRate;
  }, "data[0].fundingRate");
  steps.push(fundingStep);
  await sleep(120);

  // Step 3: get orderbook
  let obStep = await runStep(ctx, "market_get_orderbook (BTC-USDT)", "market_get_orderbook", { instId: SPOT });
  obStep = assertField(obStep, (d) => {
    const arr = (d as { data?: { bids?: unknown[][] }[] })?.data;
    return arr?.[0]?.bids?.[0]?.[0];
  }, "data[0].bids[0][0] (best bid)");
  steps.push(obStep);

  return scenario("Market data consistency (ticker + funding + orderbook)", steps, Date.now() - t0);
}

// ─── Scenario 3: Swap leverage read ──────────────────────────────────────────

async function swapLeverageRead(ctx: StepContext): Promise<ScenarioResult> {
  const t0 = Date.now();
  const steps: StepResult[] = [];

  const SWAP = "BTC-USDT-SWAP";

  // Step 1: get leverage
  let levStep = await runStep(ctx, "swap_get_leverage (BTC-USDT-SWAP cross)", "swap_get_leverage", { instId: SWAP, mgnMode: "cross" });
  levStep = assertField(levStep, (d) => {
    const arr = (d as { data?: { lever?: string }[] })?.data;
    return arr?.[0]?.lever;
  }, "data[0].lever");
  steps.push(levStep);
  await sleep(120);

  // Step 2: get open swap orders
  let ordersStep = await runStep(ctx, "swap_get_orders (open)", "swap_get_orders", {});
  if (ordersStep.status === "PASS") {
    const arr = (ordersStep.data as { data?: unknown[] })?.data;
    if (Array.isArray(arr) && arr.length === 0) {
      ordersStep = { ...ordersStep, note: "no open orders (empty array is valid)" };
    }
  }
  steps.push(ordersStep);
  await sleep(120);

  // Step 3: get spot open orders
  let spotOrdersStep = await runStep(ctx, "spot_get_orders (open)", "spot_get_orders", {});
  if (spotOrdersStep.status === "PASS") {
    const arr = (spotOrdersStep.data as { data?: unknown[] })?.data;
    if (Array.isArray(arr) && arr.length === 0) {
      spotOrdersStep = { ...spotOrdersStep, note: "no open orders (empty array is valid)" };
    }
  }
  steps.push(spotOrdersStep);

  return scenario("Swap leverage + open orders read", steps, Date.now() - t0);
}

// ─── exports ──────────────────────────────────────────────────────────────────

export async function runStatelessScenarios(ctx: StepContext): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  results.push(await accountBalanceStructure(ctx));
  results.push(await marketDataConsistency(ctx));
  results.push(await swapLeverageRead(ctx));
  return results;
}
