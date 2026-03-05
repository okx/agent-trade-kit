/**
 * Stateful Spot scenario: place → query → cancel
 *
 * Uses a limit order at a very low price (px=1) so it won't fill immediately.
 * Verifies cross-step data consistency: the ordId returned by place_order
 * is successfully retrieved by get_order and cancelled by cancel_order.
 */

import {
  type ScenarioResult,
  type StepContext,
  type StepResult,
  assert,
  assertField,
  runStep,
  sleep,
} from "./utils.js";

const SPOT = "BTC-USDT";

export async function runSpotFlow(ctx: StepContext): Promise<ScenarioResult> {
  const t0 = Date.now();
  const steps: StepResult[] = [];

  // ── Pre-check: verify demo mode ─────────────────────────────────────────
  if (!ctx.config.demo) {
    return {
      name: "Spot: place → query → cancel",
      type: "stateful",
      status: "SKIP",
      steps: [{ name: "pre-check: demo mode", status: "SKIP", note: "OKX_DEMO=1 required for write scenarios", ms: 0 }],
      ms: Date.now() - t0,
    };
  }

  // ── Pre-check: balance ───────────────────────────────────────────────────
  let balStep = await runStep(ctx, "pre-check: account_get_balance", "account_get_balance", {});
  steps.push(balStep);
  await sleep(120);

  if (balStep.status === "FAIL") {
    return { name: "Spot: place → query → cancel", type: "stateful", status: "FAIL", steps, ms: Date.now() - t0 };
  }

  // Check USDT balance — need at least some amount to place even a $0.00001 order.
  const balData = balStep.data as { data?: { details?: { ccy: string; availBal: string }[] }[] } | undefined;
  const usdtBal = balData?.data?.[0]?.details?.find((d) => d.ccy === "USDT")?.availBal;
  if (usdtBal !== undefined && parseFloat(usdtBal) < 0.01) {
    return {
      name: "Spot: place → query → cancel",
      type: "stateful",
      status: "SKIP",
      steps: [...steps, { name: "pre-check: USDT balance", status: "SKIP", note: `USDT balance too low (${usdtBal}), skipping write scenario`, ms: 0 }],
      ms: Date.now() - t0,
    };
  }

  // ── Step 1: place limit order at very low price ──────────────────────────
  let placeStep = await runStep(ctx, "spot_place_order (limit, px=1)", "spot_place_order", {
    instId: SPOT,
    tdMode: "cash",
    side: "buy",
    ordType: "limit",
    sz: "0.00001",
    px: "1",
  });
  placeStep = assertField(placeStep, (d) => {
    const arr = (d as { data?: { ordId?: string }[] })?.data;
    return arr?.[0]?.ordId;
  }, "data[0].ordId");
  steps.push(placeStep);
  await sleep(200);

  if (placeStep.status === "FAIL") {
    return { name: "Spot: place → query → cancel", type: "stateful", status: "FAIL", steps, ms: Date.now() - t0 };
  }

  const ordId = ((placeStep.data as { data?: { ordId?: string }[] })?.data?.[0]?.ordId) ?? "";

  // ── Step 2: query order by ordId ─────────────────────────────────────────
  let getStep = await runStep(ctx, "spot_get_order (by ordId)", "spot_get_order", { instId: SPOT, ordId });
  // Verify ordId matches what we placed
  getStep = assertField(getStep, (d) => {
    const arr = (d as { data?: { ordId?: string; state?: string }[] })?.data;
    return arr?.[0]?.ordId;
  }, "data[0].ordId");
  getStep = assert(getStep, (() => {
    const arr = (getStep.data as { data?: { ordId?: string }[] })?.data;
    return arr?.[0]?.ordId === ordId;
  })(), `ordId mismatch: expected ${ordId}`);
  steps.push(getStep);
  await sleep(200);

  // ── Step 3: cancel order ──────────────────────────────────────────────────
  let cancelStep = await runStep(ctx, "spot_cancel_order", "spot_cancel_order", { instId: SPOT, ordId });
  cancelStep = assertField(cancelStep, (d) => {
    const arr = (d as { data?: { ordId?: string }[] })?.data;
    return arr?.[0]?.ordId;
  }, "data[0].ordId");
  cancelStep = assert(cancelStep, (() => {
    const arr = (cancelStep.data as { data?: { ordId?: string }[] })?.data;
    return arr?.[0]?.ordId === ordId;
  })(), `cancel ordId mismatch: expected ${ordId}`);
  steps.push(cancelStep);

  const failed = steps.some((s) => s.status === "FAIL");
  return {
    name: "Spot: place → query → cancel",
    type: "stateful",
    status: failed ? "FAIL" : "PASS",
    steps,
    ms: Date.now() - t0,
  };
}
