#!/usr/bin/env node
/**
 * Smoke test — fires every OKX tool against the real **demo** API and reports
 * which endpoints work, which return business errors, and which are unsupported.
 *
 * Prerequisites:
 *   OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE  → a demo account key
 *   OKX_DEMO=1                                      → must be set
 *
 * Usage:
 *   node --import tsx/esm scripts/smoke-test/run.ts [options]
 *
 * Options:
 *   --read-only          Skip all write (isWrite=true) tools
 *   --module <name>      Only run tools from this module (repeatable)
 *   --futures-inst <id>  Instrument ID for futures tests, e.g. BTC-USDT-250627
 *
 * Exit code:
 *   0  — no ❌ FAIL results
 *   1  — at least one ❌ FAIL
 *
 * Status legend:
 *   ✅ PASS   HTTP 200 + OKX code 0 (success)
 *   🔵 PROBE  Endpoint reachable; intentional biz error (fake/invalid args used to probe)
 *   ⚠️  WARN   HTTP 200 + OKX business error due to account state (unexpected)
 *   ⛔ DEMO   assertNotDemo threw — endpoint not supported in simulated trading
 *   🔑 AUTH   AuthenticationError — credentials problem
 *   ❌ FAIL   HTTP 404 / NetworkError / unexpected throw
 *   ⏭️  SKIP   Skipped (write in read-only mode, or manual skip)
 */

import { writeFileSync } from "node:fs";
import process from "node:process";

import {
  OkxRestClient,
  buildTools,
  loadConfig,
} from "../../packages/core/src/index.js";
import {
  AuthenticationError,
  ConfigError,
  NetworkError,
  OkxApiError,
} from "../../packages/core/src/utils/errors.js";

// ─── instrument IDs ──────────────────────────────────────────────────────────

const SPOT = "BTC-USDT";
const SWAP = "BTC-USDT-SWAP";
const FAKE = "999999999999"; // guaranteed "not found" for cancel/amend cases

// ─── probe helper ────────────────────────────────────────────────────────────
// Marks a test case as intentional: args are fake/invalid on purpose.
// A biz error from OKX is expected and shown as 🔵 PROBE (endpoint reachable).

interface ProbeCase {
  readonly _probe: true;
  readonly args: Record<string, unknown>;
}

function probe(args: Record<string, unknown>): ProbeCase {
  return { _probe: true, args };
}

// ─── test cases ──────────────────────────────────────────────────────────────
// Each entry is one of:
//   Record<string, unknown>  → real args; success = PASS, biz error = WARN
//   probe({...})             → fake/invalid args; biz error expected = PROBE
//   "SKIP"                   → always skipped

type TestCase = Record<string, unknown> | ProbeCase | "SKIP";

const BASE_CASES: Record<string, TestCase> = {
  // ── market (public) ───────────────────────────────────────────────────────
  market_get_ticker:        { instId: SPOT },
  market_get_tickers:       { instType: "SPOT" },
  market_get_orderbook:     { instId: SPOT },
  market_get_candles:       { instId: SPOT },
  market_get_instruments:   { instType: "SPOT" },
  market_get_funding_rate:  { instId: SWAP },
  market_get_mark_price:    { instType: "SWAP", instId: SWAP },
  market_get_trades:        { instId: SPOT },
  market_get_index_ticker:  { instId: SPOT },
  market_get_index_candles: { instId: SPOT },
  market_get_price_limit:   { instId: SWAP },
  market_get_open_interest: { instType: "SWAP", instId: SWAP },

  // ── account (private, read) ───────────────────────────────────────────────
  account_get_balance:           {},
  account_get_asset_balance:     {},
  account_get_bills:             {},
  account_get_bills_archive:     {},
  account_get_positions:         {},
  account_get_positions_history: {},
  account_get_trade_fee:         { instType: "SPOT" },
  account_get_config:            {},
  account_get_max_withdrawal:    {},
  account_get_max_size:          { instId: SWAP, tdMode: "cross" },
  account_get_max_avail_size:    { instId: SWAP, tdMode: "cross" },

  // ── account (private, write) ──────────────────────────────────────────────
  account_transfer:          "SKIP", // moves real funds — always skip
  account_set_position_mode: { posMode: "net_mode" }, // idempotent

  // ── audit (local, no API call) ────────────────────────────────────────────
  trade_get_history: {},

  // ── spot (private, read) ──────────────────────────────────────────────────
  spot_get_orders:      {},
  spot_get_order:       { instId: SPOT, ordId: FAKE },
  spot_get_fills:       {},
  spot_get_algo_orders: {},

  // ── spot (private, write) ─────────────────────────────────────────────────
  spot_place_order:       { instId: SPOT, tdMode: "cash", side: "buy", ordType: "limit", sz: "0.00001", px: "1" },
  spot_cancel_order:      probe({ instId: SPOT, ordId: FAKE }),
  spot_amend_order:       probe({ instId: SPOT, ordId: FAKE, newSz: "0.001" }),
  spot_place_algo_order:  { instId: SPOT, tdMode: "cash", side: "sell", ordType: "conditional", sz: "0.001", tpTriggerPx: "999999", tpOrdPx: "-1" },
  spot_amend_algo_order:  probe({ algoId: FAKE, instId: SPOT, newSz: "0.001" }),
  spot_cancel_algo_order: probe({ algoId: FAKE, instId: SPOT }),
  spot_batch_orders:      probe({ action: "cancel", orders: [{ instId: SPOT, ordId: FAKE }] }),
  spot_batch_amend:       probe({ orders: [{ instId: SPOT, ordId: FAKE, newSz: "0.001" }] }),
  spot_batch_cancel:      probe({ orders: [{ instId: SPOT, ordId: FAKE }] }),

  // ── swap (private, read) ──────────────────────────────────────────────────
  swap_get_orders:    {},
  swap_get_order:     { instId: SWAP, ordId: FAKE },
  swap_get_fills:     {},
  swap_get_positions: {},
  swap_get_leverage:  { instId: SWAP, mgnMode: "cross" },
  swap_get_algo_orders: {},

  // ── swap (private, write) ─────────────────────────────────────────────────
  swap_place_order:           { instId: SWAP, tdMode: "cross", side: "buy", ordType: "limit", sz: "1", px: "1", posSide: "net" },
  swap_cancel_order:          probe({ instId: SWAP, ordId: FAKE }),
  swap_set_leverage:          { instId: SWAP, lever: "5", mgnMode: "cross" },
  swap_close_position:        { instId: SWAP, mgnMode: "cross" }, // no position → biz error
  swap_amend_algo_order:      probe({ algoId: FAKE, instId: SWAP, newSz: "1" }),
  swap_place_algo_order:      { instId: SWAP, tdMode: "cross", side: "sell", ordType: "conditional", sz: "1", tpTriggerPx: "999999", tpOrdPx: "-1" },
  swap_place_move_stop_order: { instId: SWAP, tdMode: "cross", side: "sell", sz: "1", callbackRatio: "0.01" },
  swap_cancel_algo_orders:    probe({ orders: [{ algoId: FAKE, instId: SWAP }] }),
  swap_batch_orders:          probe({ action: "cancel", orders: [{ instId: SWAP, ordId: FAKE }] }),
  swap_batch_amend:           probe({ orders: [{ instId: SWAP, ordId: FAKE, newSz: "1" }] }),
  swap_batch_cancel:          probe({ orders: [{ instId: SWAP, ordId: FAKE }] }),

  // ── futures (private) ─────────────────────────────────────────────────────
  // Write tools and get_order need a valid expiry-dated instId.
  // Pass --futures-inst BTC-USDT-250627 (or similar) to enable them.
  futures_place_order:  "SKIP",
  futures_cancel_order: "SKIP",
  futures_get_order:    "SKIP",
  futures_get_orders:   {},
  futures_get_positions:{},
  futures_get_fills:    {},

  // ── bot (private) ─────────────────────────────────────────────────────────
  grid_get_orders:        { algoOrdType: "grid" },
  grid_get_order_details: { algoOrdType: "grid", algoId: FAKE },
  grid_get_sub_orders:    { algoOrdType: "grid", algoId: FAKE },
  grid_create_order:      probe({ instId: SPOT, algoOrdType: "grid", maxPx: "100000", minPx: "1", gridNum: "2", tdMode: "cash", quoteSz: "1" }),
  grid_stop_order:        probe({ algoId: FAKE, algoOrdType: "grid", instId: SPOT }),
};

// ─── status ───────────────────────────────────────────────────────────────────

const STATUS = {
  PASS:  "✅ PASS ",
  PROBE: "🔵 PROBE",
  WARN:  "⚠️  WARN ",
  DEMO:  "⛔ DEMO ",
  AUTH:  "🔑 AUTH ",
  FAIL:  "❌ FAIL ",
  SKIP:  "⏭️  SKIP ",
} as const;

type Status = (typeof STATUS)[keyof typeof STATUS];

interface Result {
  name: string;
  module: string;
  isWrite: boolean;
  status: Status;
  note: string;
  ms: number;
}

function classify(err: unknown, isProbe = false): [Status, string] {
  if (err instanceof ConfigError && err.message.includes("simulated trading")) {
    return [STATUS.DEMO, err.message.slice(0, 80)];
  }
  if (err instanceof AuthenticationError) {
    return [STATUS.AUTH, err.message.slice(0, 80)];
  }
  if (err instanceof OkxApiError) {
    if (err.code === "404") return [STATUS.FAIL, `HTTP 404`];
    if (isProbe) return [STATUS.PROBE, `code=${err.code ?? "?"}: ${err.message.slice(0, 60)}`];
    return [STATUS.WARN, `code=${err.code ?? "?"}: ${err.message.slice(0, 60)}`];
  }
  if (err instanceof NetworkError) {
    return [STATUS.FAIL, `NetworkError: ${err.message.slice(0, 60)}`];
  }
  return [STATUS.FAIL, String(err).slice(0, 80)];
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const readOnly = argv.includes("--read-only");
  const live = argv.includes("--live");
  const moduleFilter: string[] = [];
  let futuresInst: string | undefined;
  let profile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--module" && argv[i + 1]) {
      moduleFilter.push(argv[++i]);
    }
    if (argv[i] === "--futures-inst" && argv[i + 1]) {
      futuresInst = argv[++i];
    }
    if (argv[i] === "--profile" && argv[i + 1]) {
      profile = argv[++i];
    }
  }

  return { readOnly, live, moduleFilter, futuresInst, profile };
}

// ─── report ───────────────────────────────────────────────────────────────────

function writeReport(results: Result[], path: string): void {
  const counts = tally(results);
  const now = new Date().toISOString();
  const lines = [
    `# OKX Demo Smoke Test — ${now}`,
    "",
    `| | Count |`,
    `|---|---|`,
    `| ✅ PASS | ${counts.pass} |`,
    `| 🔵 PROBE (endpoint reachable, expected biz error) | ${counts.probe} |`,
    `| ⚠️ WARN (endpoint OK, unexpected biz error) | ${counts.warn} |`,
    `| ⛔ DEMO (not supported in demo) | ${counts.demo} |`,
    `| 🔑 AUTH | ${counts.auth} |`,
    `| ❌ FAIL | ${counts.fail} |`,
    `| ⏭️ SKIP | ${counts.skip} |`,
    "",
    "## Details",
    "",
    "| Tool | Module | Write | Status | Note | ms |",
    "|------|--------|:-----:|--------|------|----|",
    ...results.map(
      (r) =>
        `| \`${r.name}\` | ${r.module} | ${r.isWrite ? "✓" : ""} | ${r.status} | ${r.note} | ${r.ms} |`,
    ),
  ];
  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
}

function tally(results: Result[]) {
  return {
    pass:  results.filter((r) => r.status === STATUS.PASS).length,
    probe: results.filter((r) => r.status === STATUS.PROBE).length,
    warn:  results.filter((r) => r.status === STATUS.WARN).length,
    demo:  results.filter((r) => r.status === STATUS.DEMO).length,
    auth:  results.filter((r) => r.status === STATUS.AUTH).length,
    fail:  results.filter((r) => r.status === STATUS.FAIL).length,
    skip:  results.filter((r) => r.status === STATUS.SKIP).length,
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { readOnly, live, moduleFilter, futuresInst, profile } = parseArgs();

  const config = loadConfig({
    readOnly: false,
    demo: !live,
    modules: moduleFilter.length > 0 ? moduleFilter.join(",") : "all",
    profile,
    userAgent: "okx-smoke-test/1.0",
  });

  if (!config.demo && !live) {
    console.error("⚠️  Not in demo mode. Set OKX_DEMO=1 or pass --live to confirm live API. Refusing to run.");
    process.exit(1);
  }
  if (!config.hasAuth) {
    console.error("❌  No API credentials found. Set OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE.");
    process.exit(1);
  }

  // Inject live futures instId if provided
  const cases: Record<string, TestCase> = { ...BASE_CASES };
  if (futuresInst) {
    cases.futures_place_order  = probe({ instId: futuresInst, tdMode: "cross", side: "buy", ordType: "limit", sz: "1", px: "1", posSide: "net" });
    cases.futures_cancel_order = probe({ instId: futuresInst, ordId: FAKE });
    cases.futures_get_order    = { instId: futuresInst, ordId: FAKE };
  }

  const client = new OkxRestClient(config);
  const tools = buildTools(config);

  const label = readOnly ? "read-only" : "all tools";
  const profileLabel = profile ? ` | profile: ${profile}` : "";
  console.log(`\n🧪  OKX Demo Smoke Test — ${tools.length} tools | ${label} | site: ${config.site}${profileLabel}${futuresInst ? ` | futures: ${futuresInst}` : ""}\n`);
  console.log("─".repeat(76));

  const results: Result[] = [];

  for (const tool of tools) {
    const testCase = cases[tool.name];
    const pad = tool.name.padEnd(38);

    // Skip write tools in read-only mode
    if (readOnly && tool.isWrite) {
      results.push({ name: tool.name, module: tool.module, isWrite: true, status: STATUS.SKIP, note: "read-only mode", ms: 0 });
      console.log(`${STATUS.SKIP}  ${pad}`);
      continue;
    }

    // No test case defined for this tool
    if (testCase === undefined) {
      results.push({ name: tool.name, module: tool.module, isWrite: tool.isWrite, status: STATUS.SKIP, note: "no test case defined", ms: 0 });
      console.log(`${STATUS.SKIP}  ${pad} (no test case)`);
      continue;
    }

    // Explicitly skipped
    if (testCase === "SKIP") {
      results.push({ name: tool.name, module: tool.module, isWrite: tool.isWrite, status: STATUS.SKIP, note: "manual skip", ms: 0 });
      console.log(`${STATUS.SKIP}  ${pad}`);
      continue;
    }

    const isProbe = "_probe" in testCase && testCase._probe === true;
    const args = isProbe ? (testCase as ProbeCase).args : (testCase as Record<string, unknown>);

    // Run
    const t0 = Date.now();
    try {
      await tool.handler(args, { client, config });
      const ms = Date.now() - t0;
      results.push({ name: tool.name, module: tool.module, isWrite: tool.isWrite, status: STATUS.PASS, note: "", ms });
      console.log(`${STATUS.PASS}  ${pad} ${ms}ms`);
    } catch (err) {
      const ms = Date.now() - t0;
      const [status, note] = classify(err, isProbe);
      results.push({ name: tool.name, module: tool.module, isWrite: tool.isWrite, status, note, ms });
      console.log(`${status}  ${pad} ${note}`);
    }

    // Brief pause between calls to respect rate limits
    await new Promise((r) => setTimeout(r, 120));
  }

  // Summary
  const counts = tally(results);
  console.log("\n" + "─".repeat(76));
  console.log(
    `Summary:  ✅ ${counts.pass}  🔵 ${counts.probe}  ⚠️  ${counts.warn}  ⛔ ${counts.demo}  🔑 ${counts.auth}  ❌ ${counts.fail}  ⏭️  ${counts.skip}`,
  );

  // Write markdown report
  const reportPath = new URL("./report.md", import.meta.url).pathname;
  writeReport(results, reportPath);
  console.log(`\nReport → ${reportPath}`);

  process.exit(counts.fail > 0 || counts.auth > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
