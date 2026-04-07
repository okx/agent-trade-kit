import {afterEach, beforeEach, describe, it} from "node:test";
import assert from "node:assert/strict";
import { EOL } from "node:os";
import {
  markFailedIfSCodeError,
  output,
  outputLine,
  errorLine,
  errorOutput,
  setOutput,
  resetOutput,
  printJson,
  printTable,
  printKv,
  setEnvContext,
  resetEnvContext,
  setJsonEnvEnabled,
  resetJsonEnvEnabled,
} from "../src/formatter.js";

// ---------------------------------------------------------------------------
// envContext state management
// ---------------------------------------------------------------------------
describe("envContext state management", () => {
  let out: string[] = [];

  beforeEach(() => {
    out = [];
    setOutput({ out: (m) => out.push(m), err: () => {} });
  });
  afterEach(() => {
    resetOutput();
    resetEnvContext();
  });

  it("printTable has no Environment header when envContext is null (AC-6 backward compat)", () => {
    printTable([{ instId: "BTC-USDT" }]);
    assert.ok(!out.join("").includes("Environment:"), "Should not include Environment: when context is null");
  });

  it("printTable includes Environment: after setEnvContext (demo=true)", () => {
    setEnvContext({ demo: true, profile: "hk-demo" });
    printTable([{ instId: "BTC-USDT" }]);
    assert.ok(out.join("").includes("Environment:"), "Should include Environment: after setEnvContext");
  });

  it("printTable has no Environment header after resetEnvContext", () => {
    setEnvContext({ demo: true, profile: "hk-demo" });
    resetEnvContext();
    printTable([{ instId: "BTC-USDT" }]);
    assert.ok(!out.join("").includes("Environment:"), "Should not include Environment: after resetEnvContext");
  });
});

// ---------------------------------------------------------------------------
// printTable with envContext
// ---------------------------------------------------------------------------
describe("printTable with envContext", () => {
  let out: string[] = [];

  beforeEach(() => {
    out = [];
    setOutput({ out: (m) => out.push(m), err: () => {} });
  });
  afterEach(() => {
    resetOutput();
    resetEnvContext();
  });

  it("AC-1: first line is 'Environment: demo (simulated trading)' when demo=true", () => {
    setEnvContext({ demo: true, profile: "hk-demo" });
    printTable([{ instId: "BTC-USDT-SWAP", instType: "SWAP", last: "67085.1" }]);
    const combined = out.join("");
    const lines = combined.split("\n");
    assert.equal(lines[0], "Environment: demo (simulated trading)");
    assert.equal(lines[1], ""); // blank line
  });

  it("AC-2: first line is 'Environment: live' when demo=false", () => {
    setEnvContext({ demo: false, profile: "main" });
    printTable([{ instId: "BTC-USDT-SWAP" }]);
    const lines = out.join("").split("\n");
    assert.equal(lines[0], "Environment: live");
    assert.equal(lines[1], ""); // blank line
  });

  it("AC-3: env header shown even with empty rows", () => {
    setEnvContext({ demo: true, profile: "hk-demo" });
    printTable([]);
    const combined = out.join("");
    assert.ok(combined.includes("Environment: demo (simulated trading)"), "Should show env header");
    assert.ok(combined.includes("(no data)"), "Should show (no data)");
  });
});

// ---------------------------------------------------------------------------
// printJson with envContext
// ---------------------------------------------------------------------------
describe("printJson with envContext", () => {
  let out: string[] = [];

  beforeEach(() => {
    out = [];
    setOutput({ out: (m) => out.push(m), err: () => {} });
  });
  afterEach(() => {
    resetOutput();
    resetEnvContext();
    resetJsonEnvEnabled();
  });

  it("AC-4: wraps data with env metadata when --env is enabled and demo=true", () => {
    setEnvContext({ demo: true, profile: "hk-demo" });
    setJsonEnvEnabled(true);
    printJson([{ instId: "BTC-USDT" }]);
    const parsed = JSON.parse(out.join(""));
    assert.equal(parsed.env, "demo");
    assert.equal(parsed.profile, "hk-demo");
    assert.deepEqual(parsed.data, [{ instId: "BTC-USDT" }]);
  });

  it("AC-5: wraps data with env=live when --env is enabled and demo=false", () => {
    setEnvContext({ demo: false, profile: "default" });
    setJsonEnvEnabled(true);
    printJson({ key: "value" });
    const parsed = JSON.parse(out.join(""));
    assert.equal(parsed.env, "live");
    assert.equal(parsed.profile, "default");
    assert.deepEqual(parsed.data, { key: "value" });
  });

  it("AC-7: outputs data directly (no wrapper) when envContext is null (backward compat)", () => {
    printJson([{ instId: "BTC-USDT" }]);
    const parsed = JSON.parse(out.join(""));
    assert.ok(!("env" in parsed), "Should not have env key at top level");
    assert.deepEqual(parsed, [{ instId: "BTC-USDT" }]);
  });

  it("outputs raw data when envContext is set but --env is NOT enabled (backward compat)", () => {
    setEnvContext({ demo: true, profile: "hk-demo" });
    // jsonEnvEnabled defaults to false — simulates --json without --env
    printJson([{ instId: "BTC-USDT" }]);
    const parsed = JSON.parse(out.join(""));
    assert.ok(!("env" in parsed), "Should not have env key when --env is not passed");
    assert.deepEqual(parsed, [{ instId: "BTC-USDT" }]);
  });

  it("wraps data only when both envContext is set AND --env is enabled", () => {
    // Without envContext, even --env=true should not wrap
    setJsonEnvEnabled(true);
    printJson({ key: "value" });
    const parsed = JSON.parse(out.join(""));
    assert.ok(!("env" in parsed), "Should not wrap when envContext is null");
    assert.deepEqual(parsed, { key: "value" });
  });
});

// ---------------------------------------------------------------------------
// output / outputLine / setOutput / resetOutput
// ---------------------------------------------------------------------------
describe("outputLine", () => {
  let out: string[] = [];
  let err: string[] = [];

  beforeEach(() => {
    out = []; err = [];
    setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
  });
  afterEach(() => resetOutput());

  it("appends EOL to the message and routes to out", () => {
    outputLine("hello");
    assert.equal(out.join(""), "hello" + EOL);
    assert.equal(err.join(""), "");
  });

  it("routes to err when isError=true", () => {
    errorLine("bad news");
    assert.equal(out.join(""), "");
    assert.ok(err.join("").includes("bad news"));
  });
});

describe("output", () => {
  let out: string[] = [];
  let err: string[] = [];

  beforeEach(() => {
    out = []; err = [];
    setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
  });
  afterEach(() => resetOutput());

  it("emits the message without appending EOL", () => {
    output("raw");
    assert.equal(out.join(""), "raw");
  });

  it("routes to err when isError=true", () => {
    errorOutput("raw error");
    assert.equal(out.join(""), "");
    assert.ok(err.join("").includes("raw error"));
  });
});

describe("setOutput / resetOutput", () => {
  let out: string[] = [];

  afterEach(() => resetOutput());

  it("captures output after setOutput", () => {
    setOutput({ out: (m) => out.push(m), err: () => {} });
    outputLine("captured");
    assert.equal(out.length, 1);
  });

  it("printJson routes to out, not err", () => {
    const err: string[] = [];
    setOutput({ out: (m) => out.push(m), err: (m) => err.push(m) });
    printJson({ key: "value" });
    assert.ok(out.join("").includes("value"));
    assert.equal(err.join(""), "");
    resetJsonEnvEnabled();
  });
});

// ---------------------------------------------------------------------------
// printTable
// ---------------------------------------------------------------------------
describe("printTable", () => {
  let out: string[] = [];

  beforeEach(() => {
    out = [];
    setOutput({ out: (m) => out.push(m), err: () => {} });
  });
  afterEach(() => resetOutput());

  it("outputs '(no data)' when rows array is empty", () => {
    printTable([]);
    assert.ok(out.join("").includes("(no data)"));
  });

  it("outputs a header row and divider for non-empty rows", () => {
    printTable([{ instId: "BTC-USDT", last: "50000" }]);
    const combined = out.join("");
    assert.ok(combined.includes("instId"));
    assert.ok(combined.includes("last"));
    assert.ok(combined.includes("---"));
  });

  it("outputs each row's values", () => {
    printTable([
      { ccy: "BTC", bal: "1.5" },
      { ccy: "ETH", bal: "10.0" },
    ]);
    const combined = out.join("");
    assert.ok(combined.includes("BTC"));
    assert.ok(combined.includes("ETH"));
    assert.ok(combined.includes("10.0"));
  });

  it("pads columns to the width of the widest value", () => {
    printTable([
      { name: "short", value: "x" },
      { name: "a-much-longer-name", value: "y" },
    ]);
    const lines = out.join("").split(EOL).filter(Boolean);
    // header and both data rows should all be the same width
    assert.equal(lines[0]!.length, lines[2]!.length);
  });
});

// ---------------------------------------------------------------------------
// printKv
// ---------------------------------------------------------------------------
describe("printKv", () => {
  let out: string[] = [];

  beforeEach(() => {
    out = [];
    setOutput({ out: (m) => out.push(m), err: () => {} });
  });
  afterEach(() => resetOutput());

  it("outputs key-value pairs for a flat object", () => {
    printKv({ instId: "BTC-USDT", last: "50000" });
    const combined = out.join("");
    assert.ok(combined.includes("instId"));
    assert.ok(combined.includes("BTC-USDT"));
    assert.ok(combined.includes("last"));
    assert.ok(combined.includes("50000"));
  });

  it("recursively indents nested objects", () => {
    printKv({ fees: { maker: "-0.001", taker: "0.001" } });
    const combined = out.join("");
    assert.ok(combined.includes("fees:"));
    assert.ok(combined.includes("maker"));
    assert.ok(combined.includes("-0.001"));
  });

  it("does not treat arrays as nested objects", () => {
    printKv({ tags: ["a", "b"] });
    const combined = out.join("");
    assert.ok(combined.includes("tags"));
    assert.ok(combined.includes("a,b"));
  });
});

// ---------------------------------------------------------------------------
// markFailedIfSCodeError
// ---------------------------------------------------------------------------
describe("markFailedIfSCodeError", () => {
    let originalExitCode: number | undefined;

    beforeEach(() => {
        originalExitCode = process.exitCode as number | undefined;
        process.exitCode = 0;
    });

    afterEach(() => {
        process.exitCode = originalExitCode;
    });

    describe("when data is not an array", () => {
        it("does nothing for null", () => {
            markFailedIfSCodeError(null);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for undefined", () => {
            markFailedIfSCodeError(undefined);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for a plain object", () => {
            markFailedIfSCodeError({sCode: "51008"});
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for a string", () => {
            markFailedIfSCodeError("51008");
            assert.equal(process.exitCode, 0);
        });
    });

    describe("when data is an array without sCode (read-only endpoints)", () => {
        it("does nothing for an empty array", () => {
            markFailedIfSCodeError([]);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing when items have no sCode field", () => {
            markFailedIfSCodeError([
                {instId: "BTC-USDT", last: "50000"},
                {instId: "ETH-USDT", last: "3000"},
            ]);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for an array of primitives", () => {
            markFailedIfSCodeError([1, 2, 3]);
            assert.equal(process.exitCode, 0);
        });
    });

    describe("when all items succeeded (sCode = '0')", () => {
        it("does nothing for a single successful item", () => {
            markFailedIfSCodeError([{ordId: "123", sCode: "0", sMsg: ""}]);
            assert.equal(process.exitCode, 0);
        });

        it("does nothing for multiple successful items", () => {
            markFailedIfSCodeError([
                {ordId: "123", sCode: "0", sMsg: ""},
                {ordId: "456", sCode: "0", sMsg: ""},
            ]);
            assert.equal(process.exitCode, 0);
        });

        it("treats numeric 0 as success", () => {
            markFailedIfSCodeError([{ordId: "123", sCode: 0}]);
            assert.equal(process.exitCode, 0);
        });
    });

    describe("when a business failure is present (sCode != '0')", () => {
        it("sets exit code 1 for insufficient balance (51008)", () => {
            markFailedIfSCodeError([{ordId: "", sCode: "51008", sMsg: "Insufficient balance"}]);
            assert.equal(process.exitCode, 1);
        });

        it("sets exit code 1 for any non-zero sCode string", () => {
            markFailedIfSCodeError([{ordId: "", sCode: "50000", sMsg: "Some error"}]);
            assert.equal(process.exitCode, 1);
        });

        it("sets exit code 1 when one item fails in a batch", () => {
            markFailedIfSCodeError([
                {ordId: "123", sCode: "0", sMsg: ""},
                {ordId: "", sCode: "51008", sMsg: "Insufficient balance"},
            ]);
            assert.equal(process.exitCode, 1);
        });

        it("sets exit code 1 when the first item fails in a batch", () => {
            markFailedIfSCodeError([
                {ordId: "", sCode: "51008", sMsg: "Insufficient balance"},
                {ordId: "123", sCode: "0", sMsg: ""},
            ]);
            assert.equal(process.exitCode, 1);
        });
    });
});
