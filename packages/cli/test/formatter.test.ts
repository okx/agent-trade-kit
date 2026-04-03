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
} from "../src/formatter.js";

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
