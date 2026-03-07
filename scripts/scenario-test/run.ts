#!/usr/bin/env node
/**
 * Scenario test runner — multi-step trading flow integration tests.
 *
 * Runs two tiers of scenarios:
 *   1. Stateless (read-only) — safe for CI; no writes, no side effects
 *   2. Stateful (read+write) — requires OKX_DEMO=1; place/cancel orders
 *
 * Prerequisites:
 *   OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE  → a demo account key
 *   OKX_DEMO=1                                      → required for stateful scenarios
 *
 * Usage:
 *   node --import tsx/esm scripts/scenario-test/run.ts [options]
 *
 * Options:
 *   --read-only   Run stateless scenarios only (skip all write flows)
 *
 * Exit code:
 *   0  — all scenarios passed (or were skipped)
 *   1  — at least one scenario failed
 */

import process from "node:process";

import {
  OkxRestClient,
  buildTools,
  loadConfig,
} from "../../packages/core/src/index.js";

import { runStatelessScenarios } from "./stateless.js";
import { runSpotFlow } from "./spot-flow.js";
import { runSwapFlow } from "./swap-flow.js";
import { type ScenarioResult, printScenario, summarize } from "./utils.js";

// ─── CLI args ──────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  return { readOnly: argv.includes("--read-only") };
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  const { readOnly } = parseArgs();

  const config = loadConfig({
    readOnly: false,
    demo: true,
    modules: "all",
    userAgent: "okx-scenario-test/1.0",
  });

  if (!config.hasAuth) {
    console.error("❌  No API credentials. Set OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE.");
    process.exit(1);
  }

  const client = new OkxRestClient(config);
  const tools = buildTools(config);
  const ctx = { client, config, tools };

  const label = readOnly ? "stateless only" : "stateless + stateful";
  console.log(`\n🧪  OKX Scenario Tests — ${label}${config.demo ? " [demo]" : " [live]"}`);
  console.log("─".repeat(60));

  const results: ScenarioResult[] = [];

  // ── Round 1: stateless (always run) ──────────────────────────────────────
  console.log("\n📖  Stateless scenarios (read-only)");
  const statelessResults = await runStatelessScenarios(ctx);
  for (const r of statelessResults) {
    printScenario(r);
    results.push(r);
  }

  // ── Round 2: stateful (skip if --read-only or not demo) ──────────────────
  if (readOnly) {
    console.log("\n⏭️   Stateful scenarios skipped (--read-only)");
  } else {
    console.log("\n✏️   Stateful scenarios (write)");

    if (!config.demo) {
      console.log("⏭️   Stateful scenarios skipped — not in demo mode (set OKX_DEMO=1)");
    } else {
      const spotResult = await runSpotFlow(ctx);
      printScenario(spotResult);
      results.push(spotResult);

      const swapResult = await runSwapFlow(ctx);
      printScenario(swapResult);
      results.push(swapResult);
    }
  }

  summarize(results);

  const anyFailed = results.some((r) => r.status === "FAIL");
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
