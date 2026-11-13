/**
 * Unit tests for the exact decimal helpers used by Smart Portfolio validation.
 * Values are parsed from the raw string — never through Number.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DECIMAL_INPUT_LENGTH,
  MAX_INTEGER_DIGITS,
  MAX_SCALE,
  compareDecimal,
  parseDecimal,
  sumDecimalsToScale,
  toPlainString,
} from "../src/tools/bot/smart-portfolio-decimal.js";
import { ValidationError } from "../src/utils/errors.js";

const p = (s: string) => parseDecimal(s, "x");

describe("parseDecimal — accepted formats", () => {
  const accepted: Array<[string, string, number, boolean]> = [
    // raw, digits, exp, neg
    ["0.05", "5", -2, false],
    ["5e-2", "5", -2, false],
    ["5E-2", "5", -2, false],
    [" 0.05 ", "5", -2, false],
    ["+0.05", "5", -2, false],
    [".5", "5", -1, false],
    ["5.", "5", 0, false],
    ["100", "1", 2, false],
    ["1.50", "15", -1, false],
    ["-0.5", "5", -1, true],
    ["0", "0", 0, false],
    ["-0", "0", 0, false],
    ["0.000", "0", 0, false],
    ["00012", "12", 0, false],
    ["1e+3", "1", 3, false],
  ];
  for (const [raw, digits, exp, neg] of accepted) {
    it(`parses ${JSON.stringify(raw)}`, () => {
      assert.deepEqual(p(raw), { neg, digits, exp });
    });
  }
});

describe("parseDecimal — rejected formats", () => {
  const rejected = [
    "", "   ", "abc", "NaN", "Infinity", "-Infinity", "0x10", "1e", "e5", "1_0", "1,5",
    "--1", "+-1", "1.2.3", ".", "+", "1e5.5", "1 0", "0b11", "1e+", "١٢٣",
  ];
  for (const raw of rejected) {
    it(`rejects ${JSON.stringify(raw)}`, () => {
      assert.throws(() => p(raw), ValidationError);
    });
  }

  it("rejects non-string input", () => {
    assert.throws(() => parseDecimal(5 as unknown as string, "x"), ValidationError);
    assert.throws(() => parseDecimal(null as unknown as string, "x"), ValidationError);
  });

  it("names the field in the error", () => {
    assert.throws(() => p("abc"), /x must be a decimal number string/);
  });
});

describe("parseDecimal — extreme inputs are bounded", () => {
  it("rejects over-long input without parsing it", () => {
    const start = Date.now();
    assert.throws(() => p("1".repeat(MAX_DECIMAL_INPUT_LENGTH + 1)), /too long/);
    assert.ok(Date.now() - start < 200);
  });

  it("accepts input exactly at the length limit", () => {
    const raw = "0." + "0".repeat(MAX_DECIMAL_INPUT_LENGTH - 3) + "1";
    assert.equal(raw.length, MAX_DECIMAL_INPUT_LENGTH);
    assert.equal(p(raw).digits, "1");
  });

  it("handles extreme exponents arithmetically without materialising them", () => {
    const start = Date.now();
    const big = p("1e999999999");
    const tiny = p("1e-999999999");
    assert.equal(compareDecimal(big, p("1")), 1);
    assert.equal(compareDecimal(tiny, p("0.01")), -1);
    assert.ok(Date.now() - start < 200);
  });

  it("rejects exponent literals longer than 15 digits", () => {
    assert.throws(() => p("1e" + "9".repeat(16)), ValidationError);
  });

  it("exposes implementation guard constants", () => {
    assert.ok(MAX_SCALE > 0 && MAX_INTEGER_DIGITS > 0);
  });
});

describe("compareDecimal", () => {
  const cases: Array<[string, string, -1 | 0 | 1]> = [
    ["0.29", "0.3", -1],
    ["0.30", "0.3", 0],
    ["1", "0.999999999", 1],
    ["0", "0.01", -1],
    ["0", "0", 0],
    ["-1", "0", -1],
    ["-1", "-2", 1],
    ["-0.5", "0.5", -1],
    ["1e2", "100", 0],
    ["12", "9", 1],
    ["0.0001", "0.001", -1],
  ];
  for (const [a, b, expected] of cases) {
    it(`${a} vs ${b} = ${expected}`, () => {
      assert.equal(compareDecimal(p(a), p(b)), expected);
      assert.equal(compareDecimal(p(b), p(a)), (0 - expected) as -1 | 0 | 1);
    });
  }
});

describe("toPlainString", () => {
  it("expands scientific notation", () => {
    assert.equal(toPlainString(p("5e-2")), "0.05");
    assert.equal(toPlainString(p("1.5e3")), "1500");
    assert.equal(toPlainString(p("-2.5e-1")), "-0.25");
    assert.equal(toPlainString(p("0e5")), "0");
  });

  it("throws for values beyond the supported size", () => {
    assert.throws(() => toPlainString(p("1e400")), ValidationError);
    assert.throws(() => toPlainString(p("1e-400")), ValidationError);
  });
});

describe("sumDecimalsToScale", () => {
  it("sums exactly, where binary floating point cannot", () => {
    const tenth = p("0.1");
    const ten = Array.from({ length: 10 }, () => tenth);
    assert.equal(ten.reduce((a, d) => a + Number(toPlainString(d)), 0) === 1, false); // float sum is 0.9999999999999999
    const { value, scale } = sumDecimalsToScale(ten);
    assert.equal(value, 10n);
    assert.equal(scale, 1);
  });

  it("uses the largest scale among the inputs", () => {
    const { value, scale } = sumDecimalsToScale([p("0.3333"), p("0.3333"), p("0.3334")]);
    assert.equal(scale, 4);
    assert.equal(value, 10000n);
  });

  it("rejects operands whose scale exceeds the guard", () => {
    assert.throws(() => sumDecimalsToScale([p("1e-" + (MAX_SCALE + 1))]), ValidationError);
  });
});
