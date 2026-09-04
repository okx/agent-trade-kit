/**
 * CLI routing tests for --aiBuilderCode flag.
 * Verifies that aiBuilderCode is correctly passed from --aiBuilderCode CLI
 * flag to the underlying ToolRunner for all order-placement paths.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allToolSpecs, type OkxConfig, type OkxRestClient, type ToolRunner } from "@agent-tradekit/core";
import {
  handleSpotCommand,
  handleSpotAlgoCommand,
  handleSwapCommand,
  handleSwapAlgoCommand,
  handleFuturesCommand,
  handleFuturesAlgoCommand,
  handleOptionCommand,
  handleOptionAlgoCommand,
  handleBotGridCommand,
  handleBotDcaCommand,
  handleEventCommand,
  createCliToolRunner,
  resolveCliAiBuilderCode,
  validateCliAiBuilderCodeUsage,
} from "../src/index.js";
import type { CliValues } from "../src/index.js";
import { setOutput, resetOutput } from "../src/formatter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "../dist/index.js");

beforeEach(() => setOutput({ out: () => {}, err: () => {} }));
afterEach(() => {
  resetOutput();
  process.exitCode = 0;
});

const fakePlaceResult = {
  endpoint: "POST /api/v5/trade/order",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "789", sCode: "0", sMsg: "" }],
};

const fakeAlgoResult = {
  endpoint: "POST /api/v5/trade/order-algo",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "456", sCode: "0", sMsg: "" }],
};

const fakeBotResult = {
  endpoint: "POST /api/v5/tradingBot/grid/order-algo",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "999", sCode: "0", sMsg: "" }],
};

const fakeBatchResult = {
  endpoint: "POST /api/v5/trade/batch-orders",
  requestTime: new Date().toISOString(),
  data: [{ ordId: "111", sCode: "0", sMsg: "" }],
};

const fakeCloseResult = {
  endpoint: "POST /api/v5/trade/close-position",
  requestTime: new Date().toISOString(),
  data: [{ instId: "BTC-USDT-SWAP", posSide: "long" }],
};

const fakeDcaResult = {
  endpoint: "POST /api/v5/tradingBot/signal/create-signal-bot",
  requestTime: new Date().toISOString(),
  data: [{ algoId: "777", sCode: "0", sMsg: "" }],
};

function makeSpy(): { spy: ToolRunner; captured: { tool: string; args: Record<string, unknown> } } {
  const captured = { tool: "", args: {} as Record<string, unknown> };
  const spy: ToolRunner = async (tool, args) => {
    captured.tool = tool as string;
    captured.args = args as Record<string, unknown>;
    if ((tool as string).includes("algo")) return fakeAlgoResult;
    if ((tool as string).includes("grid")) return fakeBotResult;
    if ((tool as string).includes("batch")) return fakeBatchResult;
    if ((tool as string).includes("close")) return fakeCloseResult;
    if ((tool as string).includes("dca")) return fakeDcaResult;
    return fakePlaceResult;
  };
  return { spy, captured };
}

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

function makeCliRunnerRecorder(): {
  run: ToolRunner;
  calls: Array<{ endpoint: string; body: unknown }>;
} {
  const calls: Array<{ endpoint: string; body: unknown }> = [];
  const client = {
    privatePost: async (endpoint: string, body: unknown) => {
      calls.push({ endpoint, body });
      return {
        endpoint,
        requestTime: "2026-08-07T00:00:00.000Z",
        data: [{ sCode: "0", sMsg: "" }],
      };
    },
  } as unknown as OkxRestClient;
  const config: OkxConfig = {
    hasAuth: true,
    profile: "default",
    baseUrl: "https://www.okx.com",
    timeoutMs: 30000,
    modules: ["spot", "swap", "futures", "option", "event", "bot.grid", "bot.dca"],
    readOnly: false,
    demo: true,
    site: "global",
    sourceTag: "CLI",
    verbose: false,
  };

  return { run: createCliToolRunner(client, config), calls };
}

describe("resolveCliAiBuilderCode", () => {
  it("uses aiBuilderCode as the source tag and strips it before tool dispatch", () => {
    const result = resolveCliAiBuilderCode({ instId: "BTC-USDT", aiBuilderCode: "MYBOT" }, "CLI");

    assert.equal(result.sourceTag, "MYBOT");
    assert.deepEqual(result.args, { instId: "BTC-USDT" });
  });

  it("keeps the default source tag when aiBuilderCode is not provided", () => {
    const result = resolveCliAiBuilderCode({ instId: "BTC-USDT" }, "CLI");

    assert.equal(result.sourceTag, "CLI");
    assert.deepEqual(result.args, { instId: "BTC-USDT" });
  });

  it("rejects invalid aiBuilderCode values", () => {
    assert.throws(
      () => resolveCliAiBuilderCode({ aiBuilderCode: "bad-code!" }, "CLI"),
      /aiBuilderCode "bad-code!" is invalid/,
    );
  });

  it("rejects empty aiBuilderCode values", () => {
    assert.throws(
      () => resolveCliAiBuilderCode({ aiBuilderCode: "" }, "CLI"),
      /aiBuilderCode "" is invalid/,
    );
  });
});

describe("validateCliAiBuilderCodeUsage", () => {
  it("allows commands that advertise aiBuilderCode", () => {
    assert.doesNotThrow(() => validateCliAiBuilderCodeUsage("spot", "place", [], vals({ aiBuilderCode: "MYBOT" })));
    assert.doesNotThrow(() => validateCliAiBuilderCodeUsage("swap", "algo", ["trail"], vals({ aiBuilderCode: "MYBOT" })));
    assert.doesNotThrow(() => validateCliAiBuilderCodeUsage("bot", "dca", ["create"], vals({ aiBuilderCode: "MYBOT" })));
  });

  it("allows batch commands only for --action place", () => {
    assert.doesNotThrow(() => validateCliAiBuilderCodeUsage("spot", "batch", [], vals({ action: "place", aiBuilderCode: "MYBOT" })));
    assert.throws(
      () => validateCliAiBuilderCodeUsage("spot", "batch", [], vals({ action: "amend", aiBuilderCode: "MYBOT" })),
      /--aiBuilderCode is only supported for okx spot batch when --action place/,
    );
    assert.throws(
      () => validateCliAiBuilderCodeUsage("swap", "batch", [], vals({ action: "cancel", aiBuilderCode: "MYBOT" })),
      /--aiBuilderCode is only supported for okx swap batch when --action place/,
    );
    assert.throws(
      () => validateCliAiBuilderCodeUsage("futures", "batch", [], vals({ action: "amend", aiBuilderCode: "MYBOT" })),
      /--aiBuilderCode is only supported for okx futures batch when --action place/,
    );
  });

  it("rejects commands that do not advertise aiBuilderCode", () => {
    assert.throws(
      () => validateCliAiBuilderCodeUsage("spot", "cancel", ["BTC-USDT"], vals({ aiBuilderCode: "bad!" })),
      /--aiBuilderCode is not supported for okx spot cancel/,
    );
    assert.throws(
      () => validateCliAiBuilderCodeUsage("list-tools", undefined, [], vals({ aiBuilderCode: "MYBOT" })),
      /--aiBuilderCode is not supported for okx list-tools/,
    );
    assert.throws(
      () => validateCliAiBuilderCodeUsage("setup", "extra", [], vals({ aiBuilderCode: "MYBOT" })),
      /--aiBuilderCode is not supported for okx setup/,
    );
    assert.throws(
      () => validateCliAiBuilderCodeUsage("market", "indicator", ["rsi", "BTC-USDT"], vals({ aiBuilderCode: "MYBOT" })),
      /--aiBuilderCode is not supported for okx market indicator <indicator> <instId>/,
    );
    assert.throws(
      () => validateCliAiBuilderCodeUsage("spot", "not-a-command", [], vals({ aiBuilderCode: "MYBOT" })),
      /--aiBuilderCode is not supported for okx spot not-a-command/,
    );
    assert.throws(
      () => validateCliAiBuilderCodeUsage("not-a-module", undefined, [], vals({ aiBuilderCode: "MYBOT" })),
      /--aiBuilderCode is not supported for okx not-a-module/,
    );
  });
});

describe("CLI main - aiBuilderCode usage validation", () => {
  it("rejects unsupported non-batch commands before config load", () => {
    if (!existsSync(dist)) return;

    assert.throws(
      () => execFileSync("node", [dist, "spot", "cancel", "BTC-USDT", "--ordId", "1", "--aiBuilderCode", "MYBOT"], {
        timeout: 10_000,
        encoding: "utf-8",
      }),
      (error: unknown) => {
        const err = error as { status?: number; stdout?: string; stderr?: string };
        const output = (err.stdout ?? "") + (err.stderr ?? "");
        assert.equal(err.status, 1);
        assert.match(output, /Error: --aiBuilderCode is not supported for okx spot cancel/);
        return true;
      },
    );
  });

  it("rejects batch --aiBuilderCode unless --action place", () => {
    if (!existsSync(dist)) return;

    const cases = [
      ["spot", "amend", '[{"instId":"BTC-USDT","ordId":"1","newSz":"0.02"}]', /okx spot batch/],
      ["spot", "cancel", '[{"instId":"BTC-USDT","ordId":"1"}]', /okx spot batch/],
      ["swap", "amend", '[{"instId":"BTC-USDT-SWAP","ordId":"1","newSz":"2"}]', /okx swap batch/],
      ["swap", "cancel", '[{"instId":"BTC-USDT-SWAP","ordId":"1"}]', /okx swap batch/],
      ["futures", "amend", '[{"instId":"BTC-USDT-240329","ordId":"1","newSz":"2"}]', /okx futures batch/],
      ["futures", "cancel", '[{"instId":"BTC-USDT-240329","ordId":"1"}]', /okx futures batch/],
    ] as const;

    for (const [moduleName, action, orders, pathPattern] of cases) {
      assert.throws(
        () => execFileSync(
          "node",
          [dist, moduleName, "batch", "--action", action, "--orders", orders, "--aiBuilderCode", "MYBOT"],
          {
            timeout: 10_000,
            encoding: "utf-8",
          },
        ),
        (error: unknown) => {
          const err = error as { status?: number; stdout?: string; stderr?: string };
          const output = (err.stdout ?? "") + (err.stderr ?? "");
          assert.equal(err.status, 1);
          assert.match(output, /--aiBuilderCode is only supported for/);
          assert.match(output, pathPattern);
          assert.match(output, /when --action place/);
          return true;
        },
      );
    }
  });
});

describe("createCliToolRunner", () => {
  it("applies aiBuilderCode as the order tag and strips the CLI-only arg", async () => {
    const { run, calls } = makeCliRunnerRecorder();

    await run("spot_place_order", {
      instId: "BTC-USDT",
      tdMode: "cash",
      side: "buy",
      ordType: "market",
      sz: "0.01",
      aiBuilderCode: "MYBOT",
    });

    assert.equal((calls[0]!.body as Record<string, unknown>)["tag"], "MYBOT");
    assert.equal((calls[0]!.body as Record<string, unknown>)["aiBuilderCode"], undefined);
  });

  it("applies aiBuilderCode to swap move-stop trail requests", async () => {
    const { run, calls } = makeCliRunnerRecorder();

    await run("swap_place_move_stop_order", {
      instId: "BTC-USDT-SWAP",
      tdMode: "cross",
      side: "sell",
      sz: "1",
      callbackRatio: "0.05",
      aiBuilderCode: "MYBOT",
    });

    assert.equal((calls[0]!.body as Record<string, unknown>)["tag"], "MYBOT");
    assert.equal((calls[0]!.body as Record<string, unknown>)["ordType"], "move_order_stop");
    assert.equal((calls[0]!.body as Record<string, unknown>)["aiBuilderCode"], undefined);
  });

  it("applies aiBuilderCode to futures move-stop trail requests", async () => {
    const { run, calls } = makeCliRunnerRecorder();

    await run("futures_place_move_stop_order", {
      instId: "BTC-USDT-240329",
      tdMode: "cross",
      side: "sell",
      sz: "1",
      callbackRatio: "0.05",
      aiBuilderCode: "MYBOT",
    });

    assert.equal((calls[0]!.body as Record<string, unknown>)["tag"], "MYBOT");
    assert.equal((calls[0]!.body as Record<string, unknown>)["ordType"], "move_order_stop");
    assert.equal((calls[0]!.body as Record<string, unknown>)["aiBuilderCode"], undefined);
  });
});

describe("core ToolSpec schemas", () => {
  it("do not expose aiBuilderCode as a core tool parameter", () => {
    const changedTools = [
      "spot_place_order",
      "spot_place_algo_order",
      "spot_batch_orders",
      "swap_place_order",
      "swap_batch_orders",
      "swap_place_algo_order",
      "swap_place_move_stop_order",
      "swap_close_position",
      "futures_place_order",
      "futures_batch_orders",
      "futures_place_algo_order",
      "futures_place_move_stop_order",
      "futures_close_position",
      "option_place_order",
      "option_place_algo_order",
      "event_place_order",
      "grid_create_order",
      "dca_create_order",
    ];
    const specs = new Map(allToolSpecs().map((spec) => [spec.name, spec]));

    for (const toolName of changedTools) {
      const schema = specs.get(toolName)?.inputSchema as { properties?: Record<string, unknown> } | undefined;
      assert.ok(schema, `${toolName} should exist`);
      assert.ok(!schema.properties?.["aiBuilderCode"], `${toolName} should not expose aiBuilderCode`);
    }
  });
});

// ===========================================================================
// spot place-order
// ===========================================================================

describe("handleSpotCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when --aiBuilderCode provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USDT", side: "buy", ordType: "market", sz: "0.01", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("place: aiBuilderCode is undefined when flag not provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USDT", side: "buy", ordType: "market", sz: "0.01" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], undefined);
  });
});

// ===========================================================================
// spot algo place-order
// ===========================================================================

describe("handleSpotAlgoCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotAlgoCommand(
      spy,
      "place",
      vals({ instId: "BTC-USDT", side: "sell", ordType: "conditional", sz: "0.01", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// swap place-order
// ===========================================================================

describe("handleSwapCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when --aiBuilderCode provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USDT-SWAP", side: "buy", ordType: "market", sz: "1", tdMode: "cross", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// swap algo place-order
// ===========================================================================

describe("handleSwapAlgoCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapAlgoCommand(
      spy,
      "place",
      vals({
        instId: "BTC-USDT-SWAP",
        side: "sell",
        ordType: "conditional",
        sz: "1",
        tdMode: "cross",
        aiBuilderCode: "MYBOT",
      }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// futures place-order
// ===========================================================================

describe("handleFuturesCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USDT-240329", side: "buy", ordType: "market", sz: "1", tdMode: "cross", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// futures algo place-order
// ===========================================================================

describe("handleFuturesAlgoCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesAlgoCommand(
      spy,
      "place",
      vals({
        instId: "BTC-USDT-240329",
        side: "sell",
        ordType: "conditional",
        sz: "1",
        tdMode: "cross",
        aiBuilderCode: "MYBOT",
      }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// option place-order
// ===========================================================================

describe("handleOptionCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleOptionCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USD-240329-50000-C", side: "buy", ordType: "limit", sz: "1", px: "500", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// option algo place-order
// ===========================================================================

describe("handleOptionAlgoCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleOptionAlgoCommand(
      spy,
      "place",
      vals({
        instId: "BTC-USD-240329-50000-C",
        side: "buy",
        ordType: "conditional",
        sz: "1",
        aiBuilderCode: "MYBOT",
      }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// bot grid create
// ===========================================================================

describe("handleBotGridCommand - aiBuilderCode routing", () => {
  it("create: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleBotGridCommand(
      spy,
      vals({
        instId: "BTC-USDT",
        algoOrdType: "grid",
        maxPx: "70000",
        minPx: "60000",
        gridNum: "10",
        quoteSz: "1000",
        aiBuilderCode: "MYBOT",
      }),
      ["create"],
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// spot batch place
// ===========================================================================

describe("handleSpotCommand batch - aiBuilderCode routing", () => {
  it("batch place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotCommand(
      spy,
      "batch",
      [],
      vals({ action: "place", orders: '[{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"0.01"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("batch amend: aiBuilderCode is not forwarded", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotCommand(
      spy,
      "batch",
      [],
      vals({ action: "amend", orders: '[{"instId":"BTC-USDT","ordId":"123","newSz":"0.02"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], undefined);
  });

  it("batch cancel: aiBuilderCode is not forwarded", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotCommand(
      spy,
      "batch",
      [],
      vals({ action: "cancel", orders: '[{"instId":"BTC-USDT","ordId":"123"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], undefined);
  });
});

// ===========================================================================
// swap batch place
// ===========================================================================

describe("handleSwapCommand batch - aiBuilderCode routing", () => {
  it("batch place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapCommand(
      spy,
      "batch",
      [],
      vals({ action: "place", orders: '[{"instId":"BTC-USDT-SWAP","side":"buy","ordType":"market","sz":"1","tdMode":"cross"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("batch amend: aiBuilderCode is not forwarded", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapCommand(
      spy,
      "batch",
      [],
      vals({ action: "amend", orders: '[{"instId":"BTC-USDT-SWAP","ordId":"123","newSz":"2"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], undefined);
  });

  it("batch cancel: aiBuilderCode is not forwarded", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapCommand(
      spy,
      "batch",
      [],
      vals({ action: "cancel", orders: '[{"instId":"BTC-USDT-SWAP","ordId":"123"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], undefined);
  });
});

// ===========================================================================
// futures batch place
// ===========================================================================

describe("handleFuturesCommand batch - aiBuilderCode routing", () => {
  it("batch place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesCommand(
      spy,
      "batch",
      [],
      vals({ action: "place", orders: '[{"instId":"BTC-USDT-240329","side":"buy","ordType":"market","sz":"1","tdMode":"cross"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("batch amend: aiBuilderCode is not forwarded", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesCommand(
      spy,
      "batch",
      [],
      vals({ action: "amend", orders: '[{"instId":"BTC-USDT-240329","ordId":"123","newSz":"2"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], undefined);
  });

  it("batch cancel: aiBuilderCode is not forwarded", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesCommand(
      spy,
      "batch",
      [],
      vals({ action: "cancel", orders: '[{"instId":"BTC-USDT-240329","ordId":"123"}]', aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], undefined);
  });
});

// ===========================================================================
// spot algo trail
// ===========================================================================

describe("handleSpotAlgoCommand trail - aiBuilderCode routing", () => {
  it("trail: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSpotAlgoCommand(
      spy,
      "trail",
      vals({ instId: "BTC-USDT", side: "sell", sz: "0.01", callbackRatio: "0.05", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// swap algo trail
// ===========================================================================

describe("handleSwapAlgoCommand trail - aiBuilderCode routing", () => {
  it("trail: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapAlgoCommand(
      spy,
      "trail",
      vals({ instId: "BTC-USDT-SWAP", side: "sell", sz: "1", tdMode: "cross", callbackRatio: "0.05", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// futures algo trail
// ===========================================================================

describe("handleFuturesAlgoCommand trail - aiBuilderCode routing", () => {
  it("trail: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesAlgoCommand(
      spy,
      "trail",
      vals({ instId: "BTC-USDT-240329", side: "sell", sz: "1", tdMode: "cross", callbackRatio: "0.05", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// bot dca create
// ===========================================================================

describe("handleBotDcaCommand create - aiBuilderCode routing", () => {
  it("create: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleBotDcaCommand(
      spy,
      "create",
      vals({
        instId: "BTC-USDT",
        algoOrdType: "dca",
        direction: "long",
        initOrdAmt: "100",
        maxSafetyOrds: "5",
        tpPct: "0.05",
        aiBuilderCode: "MYBOT",
      }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// swap close
// ===========================================================================

describe("handleSwapCommand close - aiBuilderCode routing", () => {
  it("close: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleSwapCommand(
      spy,
      "close",
      [],
      vals({ instId: "BTC-USDT-SWAP", mgnMode: "cross", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

// ===========================================================================
// futures close
// ===========================================================================

describe("handleFuturesCommand close - aiBuilderCode routing", () => {
  it("close: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleFuturesCommand(
      spy,
      "close",
      [],
      vals({ instId: "BTC-USDT-240329", mgnMode: "cross", aiBuilderCode: "MYBOT" }),
      false,
    );
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });
});

describe("handleEventCommand - aiBuilderCode routing", () => {
  it("place: aiBuilderCode is forwarded when provided", async () => {
    const { spy, captured } = makeSpy();
    await handleEventCommand(
      spy,
      "place",
      [],
      vals({ instId: "BTC-USDT-20260101-50000-C", side: "buy", outcome: "yes", sz: "1", aiBuilderCode: "MYBOT" }),
      true,
    );

    assert.equal(captured.tool, "event_place_order");
    assert.equal(captured.args["aiBuilderCode"], "MYBOT");
  });

  it("place: sets process.exitCode=1 when the runner rejects invalid aiBuilderCode", async () => {
    let callCount = 0;
    const throwingRunner: ToolRunner = async () => {
      callCount += 1;
      throw new Error('aiBuilderCode "bad!" is invalid');
    };

    await handleEventCommand(
      throwingRunner,
      "place",
      [],
      vals({ instId: "BTC-ABOVE-DAILY-200101-1600-70000", side: "buy", outcome: "yes", sz: "1", aiBuilderCode: "bad!" }),
      true,
    );

    assert.equal(process.exitCode, 1);
    assert.equal(callCount, 1);
  });
});
