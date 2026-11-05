/**
 * Unit tests for indicator --params validation (indicator-params.ts).
 * Rules follow skills/okx-cex-market/references/indicator-commands.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateIndicatorParams,
  isDocumentedIndicator,
  formatIndicatorSignature,
} from "../src/tools/indicator-params.js";
import { ValidationError } from "../src/utils/errors.js";

function rejects(name: string, params: number[], pattern: RegExp): void {
  assert.throws(
    () => validateIndicatorParams(name, params),
    (err) => err instanceof ValidationError && pattern.test((err as Error).message),
  );
}

describe("validateIndicatorParams - fixed-arity indicators", () => {
  it("macd needs 3 params and reports the signature + example", () => {
    rejects("macd", [12], /macd requires 3 params \(fast,slow,signal\), got 1: \[12\].*12,26,9/s);
    assert.doesNotThrow(() => validateIndicatorParams("macd", [12, 26, 9]));
  });

  it("macd rejects too many, zero, negative, fractional and NaN values", () => {
    rejects("macd", [12, 26, 9, 1], /requires 3 params/);
    rejects("macd", [0, 26, 9], /fast/);
    rejects("macd", [-9, 3, 3], /fast/);
    rejects("macd", [12.5, 26, 9], /fast/);
    rejects("macd", [Number.NaN, 26, 9], /fast/);
  });

  it("kdj requires 3 positive ints", () => {
    assert.doesNotThrow(() => validateIndicatorParams("kdj", [9, 3, 3]));
    rejects("kdj", [9, 3], /kdj requires 3 params/);
  });

  it("bb / boll require period (int) + stddev multiplier (positive number)", () => {
    assert.doesNotThrow(() => validateIndicatorParams("bb", [20, 2]));
    assert.doesNotThrow(() => validateIndicatorParams("bb", [20, 2.5]));
    rejects("bb", [20], /bb requires 2 params \(period,stddev\)/);
    rejects("bb", [20.5, 2], /period/);
    rejects("bb", [20, -1], /stddev/);
    rejects("boll", [20], /bb requires 2 params/); // alias resolves to bb
  });

  it("supertrend / envelope require period (int) + multiplier/deviation (positive number)", () => {
    assert.doesNotThrow(() => validateIndicatorParams("supertrend", [10, 3]));
    assert.doesNotThrow(() => validateIndicatorParams("envelope", [20, 0.1]));
    rejects("supertrend", [10], /supertrend requires 2 params \(period,multiplier\)/);
    rejects("envelope", [20], /envelope requires 2 params \(period,deviation\)/);
    rejects("envelope", [20, 0], /deviation/);
  });

  it("rsi / stoch-rsi require exactly 1 positive int period", () => {
    assert.doesNotThrow(() => validateIndicatorParams("rsi", [14]));
    assert.doesNotThrow(() => validateIndicatorParams("stoch-rsi", [14]));
    rejects("rsi", [14, 2], /rsi requires 1 param \(period\)/);
    rejects("rsi", [0], /period/);
  });

  it("is case-insensitive", () => {
    rejects("MACD", [12], /macd requires 3 params/);
  });
});

describe("validateIndicatorParams - variadic ma / ema", () => {
  it("accepts one or more positive int periods", () => {
    assert.doesNotThrow(() => validateIndicatorParams("ma", [5, 20, 60]));
    assert.doesNotThrow(() => validateIndicatorParams("ema", [14]));
  });
  it("rejects non-positive / fractional periods", () => {
    rejects("ma", [5, 0], /period/);
    rejects("ema", [5, 2.5], /period/);
  });
});

describe("validateIndicatorParams - no-param indicators", () => {
  for (const name of ["alphatrend", "halftrend", "pmax"]) {
    it(`${name} rejects any params`, () => {
      rejects(name, [14], new RegExp(`${name} takes no params`));
      assert.doesNotThrow(() => validateIndicatorParams(name, []));
    });
  }
});

describe("validateIndicatorParams - pass-through", () => {
  it("indicators without documented usage are not validated", () => {
    for (const name of ["atr", "cci", "obv", "vwap", "sar", "ad", "wma", "adx"]) {
      assert.doesNotThrow(() => validateIndicatorParams(name, [14, 99, -1]), name);
    }
  });
  it("unknown indicators are not validated", () => {
    assert.doesNotThrow(() => validateIndicatorParams("foo-bar", [1, 2]));
  });
  it("empty params never throw", () => {
    assert.doesNotThrow(() => validateIndicatorParams("macd", []));
  });
});

describe("helpers", () => {
  it("isDocumentedIndicator reflects the spec table", () => {
    assert.equal(isDocumentedIndicator("macd"), true);
    assert.equal(isDocumentedIndicator("boll"), true);
    assert.equal(isDocumentedIndicator("atr"), false);
  });
  it("formatIndicatorSignature", () => {
    assert.equal(formatIndicatorSignature("macd"), "macd requires 3 params (fast,slow,signal). Example: params [12,26,9] (CLI: --params 12,26,9)");
  });
});
