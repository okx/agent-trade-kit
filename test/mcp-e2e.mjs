#!/usr/bin/env node
// test/mcp-e2e.mjs — Full E2E tests via MCP stdio JSON-RPC (demo mode)
//
// Covers all 51 tools (account_transfer skipped — moves real funds).
//
// Usage:
//   OKX_API_KEY=xxx OKX_SECRET_KEY=xxx OKX_PASSPHRASE=xxx node test/mcp-e2e.mjs
//   node test/mcp-e2e.mjs   # reads ~/.okx/config.toml; skips private if no creds

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "../packages/mcp/dist/index.js");

// ─── Credentials ─────────────────────────────────────────────────────────────

function getCredentials() {
  if (process.env.OKX_API_KEY && process.env.OKX_SECRET_KEY && process.env.OKX_PASSPHRASE) {
    return {
      apiKey: process.env.OKX_API_KEY,
      secretKey: process.env.OKX_SECRET_KEY,
      passphrase: process.env.OKX_PASSPHRASE,
    };
  }
  const configPath = join(process.env.HOME ?? "~", ".okx", "config.toml");
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const apiKey = content.match(/api_key\s*=\s*"([^"]+)"/)?.[1];
      const secretKey = content.match(/secret_key\s*=\s*"([^"]+)"/)?.[1];
      const passphrase = content.match(/passphrase\s*=\s*"([^"]+)"/)?.[1];
      if (apiKey && secretKey && passphrase) return { apiKey, secretKey, passphrase };
    } catch {}
  }
  return null;
}

// ─── MCP Client ──────────────────────────────────────────────────────────────

class McpClient {
  constructor(proc) {
    this.proc = proc;
    this.pending = new Map();
    this.nextId = 1;
    this.rl = createInterface({ input: proc.stdout });
    this.rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch {}
    });
  }

  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout 15s: "${method}"`));
        }
      }, 15000);
    });
  }

  async initialize() {
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mcp-e2e-test", version: "1.0.0" },
    });
    this.proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
  }

  async callTool(name, args) {
    return this.send("tools/call", { name, arguments: args ?? {} });
  }

  close() {
    this.proc.stdin.end();
  }
}

// ─── Assertions ───────────────────────────────────────────────────────────────

function parseResult(result) {
  if (!result) throw new Error("No result returned");
  const text = result.content?.[0]?.text;
  if (!text) throw new Error("No text content");
  return JSON.parse(text);
}

function assertOk(result) {
  const parsed = parseResult(result);
  if (parsed.ok === false || parsed.isError) {
    throw new Error(`Tool error: ${JSON.stringify(parsed.error ?? parsed.data)}`);
  }
  return parsed;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function section(name) {
  console.log(`\n▶ ${name}`);
}

async function test(desc, fn) {
  try {
    await fn();
    console.log(`  ✅  ${desc}`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${desc}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function lastPrice(instId) {
  const result = await client.callTool("market_get_ticker", { instId });
  const parsed = assertOk(result);
  return Number(parsed.data?.data?.[0]?.last ?? "50000");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const creds = getCredentials();
const env = { ...process.env };
if (creds) {
  env.OKX_API_KEY = creds.apiKey;
  env.OKX_SECRET_KEY = creds.secretKey;
  env.OKX_PASSPHRASE = creds.passphrase;
}

const proc = spawn("node", [SERVER_PATH, "--modules", "all", "--demo"], {
  env,
  stdio: ["pipe", "pipe", "inherit"],
});
proc.on("error", (err) => { console.error("Failed to start server:", err.message); process.exit(1); });

const client = new McpClient(proc);

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  okx-trade-mcp E2E tests (demo)");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

try {
  await client.initialize();

  // ── Phase 1: Public (4 tools) ─────────────────────────────────────────────
  section("public");

  await test("market_get_ticker BTC-USDT", async () => {
    const parsed = assertOk(await client.callTool("market_get_ticker", { instId: "BTC-USDT" }));
    const last = parsed.data?.data?.[0]?.last;
    if (!last || isNaN(Number(last))) throw new Error(`Expected numeric last, got: ${last}`);
  });

  await test("market_get_tickers SWAP", async () => {
    const parsed = assertOk(await client.callTool("market_get_tickers", { instType: "SWAP" }));
    if (!Array.isArray(parsed.data?.data) || parsed.data.data.length === 0)
      throw new Error("Expected non-empty tickers array");
  });

  await test("market_get_orderbook BTC-USDT", async () => {
    const parsed = assertOk(await client.callTool("market_get_orderbook", { instId: "BTC-USDT", sz: 5 }));
    const d = parsed.data?.data?.[0];
    if (!d?.bids || !d?.asks) throw new Error("Expected bids and asks");
  });

  await test("market_get_candles BTC-USDT 1H", async () => {
    const parsed = assertOk(await client.callTool("market_get_candles", { instId: "BTC-USDT", bar: "1H", limit: 3 }));
    if (!Array.isArray(parsed.data?.data) || parsed.data.data.length === 0)
      throw new Error("Expected non-empty candles array");
  });

  await test("market_get_candles history BTC-USDT 1H", async () => {
    const parsed = assertOk(await client.callTool("market_get_candles", { instId: "BTC-USDT", bar: "1H", limit: 3, history: true }));
    if (!Array.isArray(parsed.data?.data) || parsed.data.data.length === 0)
      throw new Error("Expected non-empty historical candles array");
  });

  await test("market_get_instruments SWAP", async () => {
    const parsed = assertOk(await client.callTool("market_get_instruments", { instType: "SWAP" }));
    if (!Array.isArray(parsed.data?.data) || parsed.data.data.length === 0)
      throw new Error("Expected non-empty instruments array");
  });

  await test("market_get_funding_rate BTC-USDT-SWAP", async () => {
    const parsed = assertOk(await client.callTool("market_get_funding_rate", { instId: "BTC-USDT-SWAP" }));
    const rate = parsed.data?.data?.[0]?.fundingRate;
    if (rate === undefined) throw new Error("Expected fundingRate field");
  });

  await test("market_get_funding_rate history BTC-USDT-SWAP", async () => {
    const parsed = assertOk(await client.callTool("market_get_funding_rate", { instId: "BTC-USDT-SWAP", history: true, limit: 3 }));
    if (!Array.isArray(parsed.data?.data) || parsed.data.data.length === 0)
      throw new Error("Expected non-empty funding rate history");
  });

  await test("market_get_mark_price BTC-USDT-SWAP", async () => {
    const parsed = assertOk(await client.callTool("market_get_mark_price", { instType: "SWAP", instId: "BTC-USDT-SWAP" }));
    const mp = parsed.data?.data?.[0]?.markPx;
    if (!mp || isNaN(Number(mp))) throw new Error(`Expected numeric markPx, got: ${mp}`);
  });

  await test("market_get_trades BTC-USDT", async () => {
    const parsed = assertOk(await client.callTool("market_get_trades", { instId: "BTC-USDT", limit: 5 }));
    if (!Array.isArray(parsed.data?.data) || parsed.data.data.length === 0)
      throw new Error("Expected non-empty trades array");
  });

  await test("market_get_open_interest SWAP", async () => {
    const parsed = assertOk(await client.callTool("market_get_open_interest", { instType: "SWAP", instId: "BTC-USDT-SWAP" }));
    const oi = parsed.data?.data?.[0]?.oi;
    if (oi === undefined) throw new Error("Expected oi field");
  });

  await test("market_get_index_ticker BTC-USD", async () => {
    assertOk(await client.callTool("market_get_index_ticker", { instId: "BTC-USD" }));
  });

  await test("market_get_index_ticker all (no filter)", async () => {
    assertOk(await client.callTool("market_get_index_ticker", {}));
  });

  await test("market_get_index_candles BTC-USD", async () => {
    assertOk(await client.callTool("market_get_index_candles", { instId: "BTC-USD", bar: "1H", limit: 5 }));
  });

  await test("market_get_price_limit BTC-USDT-SWAP", async () => {
    assertOk(await client.callTool("market_get_price_limit", { instId: "BTC-USDT-SWAP" }));
  });

  // ── Private phases ────────────────────────────────────────────────────────
  if (!creds) {
    console.log("\n⚠️  No credentials — skipping private tests.");
    console.log("   Set OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE, or add ~/.okx/config.toml");
  } else {
    // ── Phase 2: Private read (12 tools) ─────────────────────────────────
    section("private read");

    await test("account_get_balance", async () => {
      assertOk(await client.callTool("account_get_balance", {}));
    });

    await test("account_get_asset_balance", async () => {
      assertOk(await client.callTool("account_get_asset_balance", {}));
    });

    await test("account_get_max_size BTC-USDT-SWAP cross", async () => {
      const parsed = assertOk(await client.callTool("account_get_max_size", {
        instId: "BTC-USDT-SWAP",
        tdMode: "cross",
      }));
      const d = parsed.data?.data?.[0];
      if (!d?.maxBuy && !d?.maxSell) throw new Error(`Expected maxBuy/maxSell, got: ${JSON.stringify(d)}`);
    });

    await test("spot_get_orders open", async () => {
      assertOk(await client.callTool("spot_get_orders", { status: "open" }));
    });

    await test("spot_get_orders history", async () => {
      assertOk(await client.callTool("spot_get_orders", { status: "history", limit: 5 }));
    });

    await test("spot_get_orders archive", async () => {
      assertOk(await client.callTool("spot_get_orders", { status: "archive", limit: 5 }));
    });

    await test("spot_get_fills", async () => {
      assertOk(await client.callTool("spot_get_fills", { limit: 5 }));
    });

    await test("spot_get_algo_orders pending", async () => {
      assertOk(await client.callTool("spot_get_algo_orders", { status: "pending" }));
    });

    await test("swap_get_orders open", async () => {
      assertOk(await client.callTool("swap_get_orders", { status: "open" }));
    });

    await test("swap_get_orders archive", async () => {
      assertOk(await client.callTool("swap_get_orders", { status: "archive", limit: 5 }));
    });

    await test("swap_get_positions", async () => {
      assertOk(await client.callTool("swap_get_positions", {}));
    });

    await test("swap_get_fills", async () => {
      assertOk(await client.callTool("swap_get_fills", { limit: 5 }));
    });

    await test("swap_get_leverage BTC-USDT-SWAP cross", async () => {
      const parsed = assertOk(await client.callTool("swap_get_leverage", {
        instId: "BTC-USDT-SWAP",
        mgnMode: "cross",
      }));
      if (!parsed.data?.data?.[0]?.lever) throw new Error("Expected lever field");
    });

    await test("swap_get_algo_orders pending", async () => {
      assertOk(await client.callTool("swap_get_algo_orders", { status: "pending" }));
    });

    await test("account_get_bills", async () => {
      assertOk(await client.callTool("account_get_bills", { limit: 5 }));
    });

    await test("account_get_bills_archive", async () => {
      assertOk(await client.callTool("account_get_bills_archive", { limit: 5 }));
    });

    await test("account_get_positions (all types)", async () => {
      assertOk(await client.callTool("account_get_positions", {}));
    });

    await test("account_get_positions (SWAP only)", async () => {
      assertOk(await client.callTool("account_get_positions", { instType: "SWAP" }));
    });

    await test("account_get_positions_history", async () => {
      assertOk(await client.callTool("account_get_positions_history", { limit: 5 }));
    });

    await test("account_get_max_withdrawal", async () => {
      assertOk(await client.callTool("account_get_max_withdrawal", {}));
    });

    await test("account_get_max_avail_size SWAP cross", async () => {
      assertOk(await client.callTool("account_get_max_avail_size", {
        instId: "BTC-USDT-SWAP",
        tdMode: "cross",
      }));
    });

    await test("account_get_trade_fee SWAP", async () => {
      const parsed = assertOk(await client.callTool("account_get_trade_fee", { instType: "SWAP" }));
      if (!parsed.data?.data?.[0]?.taker) throw new Error("Expected taker fee field");
    });

    await test("account_get_config", async () => {
      const parsed = assertOk(await client.callTool("account_get_config", {}));
      if (!parsed.data?.data?.[0]?.posMode) throw new Error("Expected posMode field");
    });

    await test("spot_get_fills archive", async () => {
      assertOk(await client.callTool("spot_get_fills", { archive: true, limit: 5 }));
    });

    await test("swap_get_fills archive", async () => {
      assertOk(await client.callTool("swap_get_fills", { archive: true, limit: 5 }));
    });

    // ── Phase 3: Spot write (demo) (6 tools) ─────────────────────────────
    section("spot write (demo)");

    const spotLast = await lastPrice("BTC-USDT");
    const spotFarBuy  = String(Math.floor(spotLast * 0.5));  // 50% below — won't fill
    const spotFarStop = String(Math.floor(spotLast * 2.0));  // 100% above — won't trigger

    let spotOrdId = null;
    let spotAlgoId = null;

    await test("spot_place_order limit buy (50% below market)", async () => {
      const parsed = assertOk(await client.callTool("spot_place_order", {
        instId: "BTC-USDT",
        tdMode: "cash",
        side: "buy",
        ordType: "limit",
        sz: "0.001",
        px: spotFarBuy,
      }));
      spotOrdId = parsed.data?.data?.[0]?.ordId;
      if (!spotOrdId) throw new Error(`Expected ordId, got: ${JSON.stringify(parsed.data?.data)}`);
      console.log(`      ordId: ${spotOrdId}`);
    });

    if (spotOrdId) {
      await test("spot_get_order by ordId", async () => {
        const parsed = assertOk(await client.callTool("spot_get_order", {
          instId: "BTC-USDT",
          ordId: spotOrdId,
        }));
        if (parsed.data?.data?.[0]?.ordId !== spotOrdId)
          throw new Error(`Expected ordId ${spotOrdId}, got: ${parsed.data?.data?.[0]?.ordId}`);
      });

      await test("spot_amend_order change price", async () => {
        const parsed = assertOk(await client.callTool("spot_amend_order", {
          instId: "BTC-USDT",
          ordId: spotOrdId,
          newPx: String(Math.floor(spotLast * 0.49)),
        }));
        if (!parsed.data?.data?.[0]?.ordId) throw new Error("Expected ordId in response");
      });

      await test("spot_cancel_order", async () => {
        assertOk(await client.callTool("spot_cancel_order", {
          instId: "BTC-USDT",
          ordId: spotOrdId,
        }));
      });
    }

    // spot_place_algo_order: conditional buy-stop far above market (won't trigger)
    // needs USDT which demo account has; no BTC required for a buy-stop trigger order
    await test("spot_place_algo_order conditional buy-stop (2x market, won't trigger)", async () => {
      const parsed = assertOk(await client.callTool("spot_place_algo_order", {
        instId: "BTC-USDT",
        side: "buy",
        ordType: "conditional",
        sz: "0.001",
        slTriggerPx: spotFarStop,
        slOrdPx: "-1",
      }));
      spotAlgoId = parsed.data?.data?.[0]?.algoId;
      if (!spotAlgoId) {
        // Some demo accounts don't support this order type; skip amend/cancel but don't fail
        console.log(`      ⚠️  no algoId returned (demo limitation), skipping amend/cancel`);
      } else {
        console.log(`      algoId: ${spotAlgoId}`);
      }
    });

    if (spotAlgoId) {
      await test("spot_amend_algo_order change trigger price", async () => {
        assertOk(await client.callTool("spot_amend_algo_order", {
          instId: "BTC-USDT",
          algoId: spotAlgoId,
          newSlTriggerPx: String(Math.floor(spotLast * 2.1)),
        }));
      });

      await test("spot_cancel_algo_order", async () => {
        assertOk(await client.callTool("spot_cancel_algo_order", {
          instId: "BTC-USDT",
          algoId: spotAlgoId,
        }));
      });
    }

    // ── Phase 4: Swap regular write (demo) (6 tools) ─────────────────────
    section("swap write (demo)");

    const swapLast = await lastPrice("BTC-USDT-SWAP");
    const swapFarPrice = String(Math.floor(swapLast * 0.5)); // 50% below market

    await test("swap_set_leverage 5x cross", async () => {
      assertOk(await client.callTool("swap_set_leverage", {
        instId: "BTC-USDT-SWAP",
        lever: "5",
        mgnMode: "cross",
      }));
    });

    let swapLimitOrdId = null;

    await test("swap_place_order limit buy (50% below, won't fill)", async () => {
      const parsed = assertOk(await client.callTool("swap_place_order", {
        instId: "BTC-USDT-SWAP",
        tdMode: "cross",
        side: "buy",
        ordType: "limit",
        sz: "1",
        px: swapFarPrice,
      }));
      swapLimitOrdId = parsed.data?.data?.[0]?.ordId;
      if (!swapLimitOrdId) throw new Error(`Expected ordId, got: ${JSON.stringify(parsed.data?.data)}`);
      console.log(`      ordId: ${swapLimitOrdId}`);
    });

    if (swapLimitOrdId) {
      await test("swap_get_order by ordId", async () => {
        const parsed = assertOk(await client.callTool("swap_get_order", {
          instId: "BTC-USDT-SWAP",
          ordId: swapLimitOrdId,
        }));
        if (parsed.data?.data?.[0]?.ordId !== swapLimitOrdId)
          throw new Error(`Expected ordId ${swapLimitOrdId}, got: ${parsed.data?.data?.[0]?.ordId}`);
      });

      await test("swap_cancel_order", async () => {
        assertOk(await client.callTool("swap_cancel_order", {
          instId: "BTC-USDT-SWAP",
          ordId: swapLimitOrdId,
        }));
      });
    }

    await test("swap_place_order market buy sz=1 (open position)", async () => {
      assertOk(await client.callTool("swap_place_order", {
        instId: "BTC-USDT-SWAP",
        tdMode: "cross",
        side: "buy",
        ordType: "market",
        sz: "1",
      }));
    });

    await delay(2000);

    await test("swap_get_positions BTC-USDT-SWAP", async () => {
      const parsed = assertOk(await client.callTool("swap_get_positions", { instId: "BTC-USDT-SWAP" }));
      const n = (parsed.data?.data ?? []).length;
      console.log(`      ${n} position(s)`);
    });

    await test("swap_close_position cross", async () => {
      const parsed = assertOk(await client.callTool("swap_close_position", {
        instId: "BTC-USDT-SWAP",
        mgnMode: "cross",
      }));
      const d = parsed.data?.data?.[0];
      // clOrdId may be empty string when not set; instId presence confirms success
      if (!d?.instId)
        throw new Error(`Expected instId in response, got: ${JSON.stringify(d)}`);
    });

    // ── Phase 5: Swap batch (demo) (1 tool, 3 actions) ────────────────────
    section("swap batch (demo)");

    let batchIdA = null;
    let batchIdB = null;

    await test("swap_batch_orders place (2 limit orders)", async () => {
      const parsed = assertOk(await client.callTool("swap_batch_orders", {
        action: "place",
        orders: [
          { instId: "BTC-USDT-SWAP", tdMode: "cross", side: "buy", ordType: "limit", sz: "1", px: swapFarPrice },
          { instId: "BTC-USDT-SWAP", tdMode: "cross", side: "buy", ordType: "limit", sz: "1", px: swapFarPrice },
        ],
      }));
      const data = parsed.data?.data;
      if (!Array.isArray(data) || data.length !== 2)
        throw new Error(`Expected 2 results, got: ${JSON.stringify(data)}`);
      if (data[0].sCode !== "0") throw new Error(`Order 0: sCode=${data[0].sCode} ${data[0].sMsg}`);
      if (data[1].sCode !== "0") throw new Error(`Order 1: sCode=${data[1].sCode} ${data[1].sMsg}`);
      batchIdA = data[0].ordId;
      batchIdB = data[1].ordId;
      console.log(`      ordIdA: ${batchIdA}, ordIdB: ${batchIdB}`);
    });

    if (batchIdA) {
      await test("swap_batch_orders amend ordIdA sz→2", async () => {
        const parsed = assertOk(await client.callTool("swap_batch_orders", {
          action: "amend",
          orders: [{ instId: "BTC-USDT-SWAP", ordId: batchIdA, newSz: "2" }],
        }));
        if (parsed.data?.data?.[0]?.sCode !== "0")
          throw new Error(`Amend failed: ${JSON.stringify(parsed.data?.data?.[0])}`);
      });
    }

    if (batchIdA || batchIdB) {
      await test("swap_batch_orders cancel both", async () => {
        const orders = [];
        if (batchIdA) orders.push({ instId: "BTC-USDT-SWAP", ordId: batchIdA });
        if (batchIdB) orders.push({ instId: "BTC-USDT-SWAP", ordId: batchIdB });
        const parsed = assertOk(await client.callTool("swap_batch_orders", { action: "cancel", orders }));
        for (const item of (parsed.data?.data ?? [])) {
          if (item.sCode !== "0") throw new Error(`Cancel failed: ${item.sCode} ${item.sMsg}`);
        }
      });
    }

    // ── Phase 6: Swap algo (demo) (4 tools) ──────────────────────────────
    section("swap algo (demo)");

    let swapAlgoId = null;

    await test("swap_place_order market buy sz=1 (for algo test)", async () => {
      assertOk(await client.callTool("swap_place_order", {
        instId: "BTC-USDT-SWAP",
        tdMode: "cross",
        side: "buy",
        ordType: "market",
        sz: "1",
      }));
    });

    await delay(2000);

    await test("swap_place_algo_order oco (TP+SL)", async () => {
      const p = await lastPrice("BTC-USDT-SWAP");
      const parsed = assertOk(await client.callTool("swap_place_algo_order", {
        instId: "BTC-USDT-SWAP",
        tdMode: "cross",
        side: "sell",
        ordType: "oco",
        sz: "1",
        tpTriggerPx: String(Math.floor(p * 1.1)),
        tpOrdPx: "-1",
        slTriggerPx: String(Math.floor(p * 0.9)),
        slOrdPx: "-1",
      }));
      swapAlgoId = parsed.data?.data?.[0]?.algoId;
      if (!swapAlgoId) throw new Error(`Expected algoId, got: ${JSON.stringify(parsed.data?.data)}`);
      console.log(`      algoId: ${swapAlgoId}`);
    });

    if (swapAlgoId) {
      await test("swap_amend_algo_order change SL price", async () => {
        const p = await lastPrice("BTC-USDT-SWAP");
        assertOk(await client.callTool("swap_amend_algo_order", {
          instId: "BTC-USDT-SWAP",
          algoId: swapAlgoId,
          newSlTriggerPx: String(Math.floor(p * 0.88)),
          newSlOrdPx: "-1",
        }));
      });

      await test("swap_cancel_algo_orders", async () => {
        const parsed = assertOk(await client.callTool("swap_cancel_algo_orders", {
          orders: [{ algoId: swapAlgoId, instId: "BTC-USDT-SWAP" }],
        }));
        if (parsed.data?.data?.[0]?.sCode !== "0")
          throw new Error(`Cancel failed: ${JSON.stringify(parsed.data?.data?.[0])}`);
      });
    }

    // ── Trailing stop ─────────────────────────────────────────────────────
    let trailAlgoId = null;

    await test("swap_place_move_stop_order 1% trailing stop", async () => {
      const parsed = assertOk(await client.callTool("swap_place_move_stop_order", {
        instId: "BTC-USDT-SWAP",
        tdMode: "cross",
        side: "sell",
        sz: "1",
        callbackRatio: "0.01",
        reduceOnly: true,
      }));
      trailAlgoId = parsed.data?.data?.[0]?.algoId;
      if (!trailAlgoId) throw new Error(`Expected algoId, got: ${JSON.stringify(parsed.data?.data)}`);
      console.log(`      algoId: ${trailAlgoId}`);
    });

    if (trailAlgoId) {
      await test("swap_cancel_algo_orders (trailing stop)", async () => {
        const parsed = assertOk(await client.callTool("swap_cancel_algo_orders", {
          orders: [{ algoId: trailAlgoId, instId: "BTC-USDT-SWAP" }],
        }));
        if (parsed.data?.data?.[0]?.sCode !== "0")
          throw new Error(`Cancel failed: ${JSON.stringify(parsed.data?.data?.[0])}`);
      });
    }

    await test("swap_close_position (cleanup)", async () => {
      assertOk(await client.callTool("swap_close_position", {
        instId: "BTC-USDT-SWAP",
        mgnMode: "cross",
      }));
    });

    await test("account_set_position_mode net_mode (idempotent)", async () => {
      assertOk(await client.callTool("account_set_position_mode", { posMode: "net_mode" }));
    });

    // ── Phase 7: DCA bot read (demo) ──────────────────────────────────────
    section("DCA bot read (demo)");

    await test("dca_get_orders spot active", async () => {
      assertOk(await client.callTool("dca_get_orders", { type: "spot", status: "active" }));
    });

    await test("dca_get_orders contract history", async () => {
      assertOk(await client.callTool("dca_get_orders", { type: "contract", status: "history" }));
    });
  }
} finally {
  client.close();
  proc.kill();
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`  passed: ${passed}  failed: ${failed}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

if (failed > 0) process.exit(1);
