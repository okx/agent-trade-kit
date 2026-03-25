import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ToolRunner } from "@agent-tradekit/core";
import {
  inferEarnType,
  cmdAutoEarnStatus,
  cmdAutoEarnOn,
  cmdAutoEarnOff,
} from "../src/commands/auto-earn.js";
import { setOutput, resetOutput } from "../src/formatter.js";

let out: string[] = [];
let err: string[] = [];

beforeEach(() => {
  out = []; err = [];
  setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
});
afterEach(() => resetOutput());

/* ------------------------------------------------------------------ */
/*  Test data                                                          */
/* ------------------------------------------------------------------ */

function balanceResult(details: Record<string, unknown>[]) {
  return {
    endpoint: "GET /api/v5/account/balance",
    requestTime: new Date().toISOString(),
    data: [{ details }],
  };
}

function setAutoEarnResult() {
  return {
    endpoint: "POST /api/v5/account/set-auto-earn",
    requestTime: new Date().toISOString(),
    data: {},
  };
}

/** Create a ToolRunner that routes balance and set-auto-earn calls. */
function createRunner(
  details: Record<string, unknown>[],
  onSetAutoEarn?: (args: Record<string, unknown>) => void,
): ToolRunner {
  return (async (toolName: string, args: Record<string, unknown>) => {
    if (toolName === "account_get_balance") return balanceResult(details);
    if (toolName === "earn_auto_set") {
      onSetAutoEarn?.(args);
      return setAutoEarnResult();
    }
    throw new Error(`Unexpected tool call: ${toolName}`);
  }) as ToolRunner;
}

const solDetail = {
  ccy: "SOL",
  autoLendStatus: "off",
  autoStakingStatus: "off",
  autoLendAmt: "0",
  autoLendMtAmt: "0",
  autoLendApr: "0.01",
};

const usdgDetail = {
  ccy: "USDG",
  autoLendStatus: "unsupported",
  autoStakingStatus: "unsupported",
  autoLendAmt: "0",
  autoLendMtAmt: "0",
  autoLendApr: "",
};

const btcDetail = {
  ccy: "BTC",
  autoLendStatus: "unsupported",
  autoStakingStatus: "unsupported",
  autoLendAmt: "0",
  autoLendMtAmt: "0",
  autoLendApr: "",
};

/* ------------------------------------------------------------------ */
/*  inferEarnType                                                      */
/* ------------------------------------------------------------------ */

describe("inferEarnType", () => {
  it("returns '1' for USDG-earn currency", () => {
    assert.equal(inferEarnType(usdgDetail), "1");
  });

  it("returns '0' when autoLendStatus is not unsupported", () => {
    assert.equal(inferEarnType(solDetail), "0");
  });

  it("returns '0' when autoStakingStatus is not unsupported", () => {
    const ethDetail = { ...btcDetail, ccy: "ETH", autoStakingStatus: "off" };
    assert.equal(inferEarnType(ethDetail), "0");
  });

  it("returns null when nothing is supported", () => {
    assert.equal(inferEarnType(btcDetail), null);
  });

  it("returns '0' for active status", () => {
    const detail = { ...btcDetail, autoLendStatus: "active" };
    assert.equal(inferEarnType(detail), "0");
  });
});

/* ------------------------------------------------------------------ */
/*  cmdAutoEarnStatus                                                  */
/* ------------------------------------------------------------------ */

describe("cmdAutoEarnStatus", () => {
  it("shows message when no currencies support auto-earn", async () => {
    const runner = createRunner([btcDetail]);
    await cmdAutoEarnStatus(runner, undefined, false);
    assert.ok(out.join("").includes("No currencies support auto-earn"));
  });

  it("shows message when specific ccy does not support", async () => {
    const runner = createRunner([btcDetail]);
    await cmdAutoEarnStatus(runner, "BTC", false);
    assert.ok(out.join("").includes("BTC does not support auto-earn"));
  });

  it("shows table for supported currencies", async () => {
    const runner = createRunner([solDetail, usdgDetail, btcDetail]);
    await cmdAutoEarnStatus(runner, undefined, false);
    const output = out.join("");
    assert.ok(output.includes("SOL"));
    assert.ok(output.includes("USDG"));
    assert.ok(!output.includes("BTC"));
  });

  it("outputs JSON when json=true", async () => {
    const runner = createRunner([solDetail]);
    await cmdAutoEarnStatus(runner, undefined, true);
    assert.doesNotThrow(() => JSON.parse(out.join("")));
  });
});

/* ------------------------------------------------------------------ */
/*  cmdAutoEarnOn                                                      */
/* ------------------------------------------------------------------ */

describe("cmdAutoEarnOn", () => {
  it("errors when currency not found in balance", async () => {
    const runner = createRunner([]);
    const savedExitCode = process.exitCode;
    await cmdAutoEarnOn(runner, "XYZ", false);
    assert.equal(process.exitCode, 1);
    assert.ok(err.join("").includes("XYZ not found"));
    process.exitCode = savedExitCode;
  });

  it("errors when currency does not support auto-earn", async () => {
    const runner = createRunner([btcDetail]);
    const savedExitCode = process.exitCode;
    await cmdAutoEarnOn(runner, "BTC", false);
    assert.equal(process.exitCode, 1);
    assert.ok(err.join("").includes("does not support auto-earn"));
    process.exitCode = savedExitCode;
  });

  it("enables auto-earn for lend+stake currency (earnType=0)", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner = createRunner([solDetail], (args) => { captured = args; });
    await cmdAutoEarnOn(runner, "SOL", false);
    assert.deepEqual(captured, { ccy: "SOL", action: "turn_on", earnType: "0" });
    assert.ok(out.join("").includes("enabled"));
    assert.ok(out.join("").includes("lend+stake"));
  });

  it("enables auto-earn for USDG currency (earnType=1)", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner = createRunner([usdgDetail], (args) => { captured = args; });
    await cmdAutoEarnOn(runner, "USDG", false);
    assert.deepEqual(captured, { ccy: "USDG", action: "turn_on", earnType: "1" });
    assert.ok(out.join("").includes("USDG earn"));
  });

  it("outputs JSON when json=true", async () => {
    const runner = createRunner([solDetail]);
    await cmdAutoEarnOn(runner, "SOL", true);
    assert.doesNotThrow(() => JSON.parse(out.join("")));
  });
});

/* ------------------------------------------------------------------ */
/*  cmdAutoEarnOff                                                     */
/* ------------------------------------------------------------------ */

describe("cmdAutoEarnOff", () => {
  it("errors when currency not found", async () => {
    const runner = createRunner([]);
    const savedExitCode = process.exitCode;
    await cmdAutoEarnOff(runner, "XYZ", false);
    assert.equal(process.exitCode, 1);
    assert.ok(err.join("").includes("XYZ not found"));
    process.exitCode = savedExitCode;
  });

  it("disables auto-earn with correct earnType", async () => {
    let captured: Record<string, unknown> | undefined;
    const runner = createRunner([solDetail], (args) => { captured = args; });
    await cmdAutoEarnOff(runner, "SOL", false);
    assert.deepEqual(captured, { ccy: "SOL", action: "turn_off", earnType: "0" });
    assert.ok(out.join("").includes("disabled"));
  });

  it("outputs JSON when json=true", async () => {
    const runner = createRunner([usdgDetail]);
    await cmdAutoEarnOff(runner, "USDG", true);
    assert.doesNotThrow(() => JSON.parse(out.join("")));
  });
});
