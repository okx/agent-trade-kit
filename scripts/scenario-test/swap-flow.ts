/**
 * Stateful Swap scenario: set leverage → place → query → cancel
 *
 * Sets leverage to 5x, places a limit order at a very low price (px=1)
 * so it won't fill immediately, verifies cross-step data consistency,
 * then cancels the order.
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

const SWAP = "BTC-USDT-SWAP";
const TARGET_LEVER = "5";

export async function runSwapFlow(ctx: StepContext): Promise<ScenarioResult> {
  const t0 = Date.now();
  const steps: StepResult[] = [];

  // ── Pre-check: verify demo mode ─────────────────────────────────────────
  if (!ctx.config.demo) {
    return {
      name: "Swap: set leverage → place → query → cancel",
      type: "stateful",
      status: "SKIP",
      steps: [{ name: "pre-check: demo mode", status: "SKIP", note: "OKX_DEMO=1 required for write scenarios", ms: 0 }],
      ms: Date.now() - t0,
    };
  }

  // ── Step 1: set leverage ─────────────────────────────────────────────────
  let levSetStep = await runStep(ctx, `swap_set_leverage (${TARGET_LEVER}x cross)`, "swap_set_leverage", {
    instId: SWAP,
    lever: TARGET_LEVER,
    mgnMode: "cross",
  });
  levSetStep = assertField(levSetStep, (d) => {
    const arr = (d as { data?: { lever?: string }[] })?.data;
    return arr?.[0]?.lever;
  }, "data[0].lever");
  steps.push(levSetStep);
  await sleep(120);

  if (levSetStep.status === "FAIL") {
    return { name: "Swap: set leverage → place → query → cancel", type: "stateful", status: "FAIL", steps, ms: Date.now() - t0 };
  }

  // ── Step 2: verify leverage was applied ──────────────────────────────────
  let levGetStep = await runStep(ctx, "swap_get_leverage (verify 5x)", "swap_get_leverage", {
    instId: SWAP,
    mgnMode: "cross",
  });
  levGetStep = assertField(levGetStep, (d) => {
    const arr = (d as { data?: { lever?: string }[] })?.data;
    return arr?.[0]?.lever;
  }, "data[0].lever");
  levGetStep = assert(levGetStep, (() => {
    const arr = (levGetStep.data as { data?: { lever?: string }[] })?.data;
    return arr?.[0]?.lever === TARGET_LEVER;
  })(), `leverage mismatch: expected ${TARGET_LEVER}`);
  steps.push(levGetStep);
  await sleep(120);

  // ── Step 3: place limit order at very low price ──────────────────────────
  let placeStep = await runStep(ctx, "swap_place_order (limit, px=1)", "swap_place_order", {
    instId: SWAP,
    tdMode: "cross",
    side: "buy",
    ordType: "limit",
    sz: "1",
    px: "1",
    posSide: "net",
  });
  placeStep = assertField(placeStep, (d) => {
    const arr = (d as { data?: { ordId?: string }[] })?.data;
    return arr?.[0]?.ordId;
  }, "data[0].ordId");
  steps.push(placeStep);
  await sleep(200);

  if (placeStep.status === "FAIL") {
    return { name: "Swap: set leverage → place → query → cancel", type: "stateful", status: "FAIL", steps, ms: Date.now() - t0 };
  }

  const ordId = ((placeStep.data as { data?: { ordId?: string }[] })?.data?.[0]?.ordId) ?? "";

  // ── Step 4: query order by ordId ──────────────────────────────────────────
  let getStep = await runStep(ctx, "swap_get_order (by ordId)", "swap_get_order", { instId: SWAP, ordId });
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

  // ── Step 5: cancel order ──────────────────────────────────────────────────
  let cancelStep = await runStep(ctx, "swap_cancel_order", "swap_cancel_order", { instId: SWAP, ordId });
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
    name: "Swap: set leverage → place → query → cancel",
    type: "stateful",
    status: failed ? "FAIL" : "PASS",
    steps,
    ms: Date.now() - t0,
  };
}
