/**
 * Unit tests for the market_get_indicator params contract (indicator-params.ts):
 * defaults when omitted, completeness + value ranges when given.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  INDICATOR_DEFAULT_PARAMS,
  validateIndicatorParams,
  hasIndicatorParamSpec,
  getSpecDefaultParams,
  formatIndicatorSignature,
  describeIndicatorDefaults,
} from "../src/tools/indicator-params.js";
import { ValidationError } from "../src/utils/errors.js";

function rejects(name: string, params: number[], pattern: RegExp): void {
  assert.throws(
    () => validateIndicatorParams(name, params),
    (err) => err instanceof ValidationError && pattern.test((err as Error).message),
  );
}

describe("defaults", () => {
  it("every default is accepted by its own validator", () => {
    for (const [name, defaults] of Object.entries(INDICATOR_DEFAULT_PARAMS)) {
      assert.doesNotThrow(() => validateIndicatorParams(name, [...defaults]), name);
    }
  });

  it("returns a copy so callers cannot mutate the table", () => {
    const a = getSpecDefaultParams("macd")!;
    a.push(99);
    assert.deepEqual(getSpecDefaultParams("macd"), [12, 26, 9]);
  });

  it("alias boll shares bb's contract", () => {
    assert.deepEqual(getSpecDefaultParams("boll"), [20, 2]);
    assert.equal(hasIndicatorParamSpec("BOLL"), true);
  });

  it("indicators outside the contract have no spec", () => {
    for (const name of ["obv", "vwap", "sar", "ad", "envelope", "alphatrend", "halftrend", "pmax", "foo"]) {
      assert.equal(hasIndicatorParamSpec(name), false, name);
      assert.equal(getSpecDefaultParams(name), undefined, name);
    }
  });
});

describe("fixed-length indicators must be complete", () => {
  const cases: Array<[string, number[], RegExp]> = [
    ["macd", [12, 26], /macd requires 3 params \(fast,slow,signal\), got 2: \[12,26\]\. Default: 12,26,9/],
    ["kdj", [9], /kdj requires 3 params/],
    ["bb", [20], /bb requires 2 params \(period,multiplier\)/],
    ["supertrend", [3], /supertrend requires 2 params \(factor,atrPeriod\)/],
    ["stoch-rsi", [14, 14, 3], /stoch-rsi requires 4 params \(rsi,stoch,k,d\)/],
    ["stoch", [14], /stoch requires 2 params/],
    ["ppo", [12, 26], /ppo requires 3 params/],
    ["uo", [7, 14], /uo requires 3 params/],
    ["bbwidth", [20], /bbwidth requires 2 params/],
    ["keltner", [20, 10], /keltner requires 3 params/],
    ["mvwap", [14], /mvwap requires 2 params/],
    ["adx", [14, 2], /adx requires 1 param \(period\)/],
  ];
  for (const [name, params, pattern] of cases) {
    it(`${name} rejects ${JSON.stringify(params)}`, () => rejects(name, params, pattern));
  }

  it("boll reports the bb signature", () => {
    rejects("boll", [20], /bb requires 2 params/);
  });

  it("is case-insensitive", () => {
    rejects("MACD", [12], /macd requires 3 params/);
  });

  it("error carries default and CLI example", () => {
    rejects("macd", [12], /Example: params \[12,26,9\] \(CLI: --params 12,26,9\)/);
  });
});

describe("value ranges", () => {
  it("periods must be integers in 2..365", () => {
    for (const bad of [1, 0, -9, 366, 2.5, Number.NaN]) {
      rejects("macd", [bad, 26, 9], /macd param #1 \(fast\) must be an integer in 2-365/);
    }
    assert.doesNotThrow(() => validateIndicatorParams("macd", [2, 365, 9]));
  });

  it("reports the offending position", () => {
    rejects("macd", [12, 26, 400], /param #3 \(signal\)/);
  });

  it("bb multiplier and supertrend factor are integers in 1..9", () => {
    assert.doesNotThrow(() => validateIndicatorParams("bb", [20, 1]));
    assert.doesNotThrow(() => validateIndicatorParams("bb", [20, 9]));
    for (const bad of [0, 10, 2.5]) rejects("bb", [20, bad], /multiplier\) must be an integer in 1-9/);
    for (const bad of [0, 10, 2.5]) rejects("supertrend", [bad, 10], /factor\) must be an integer in 1-9/);
  });

  it("bbwidth multiplier is a plain period slot (2..365), unlike bb", () => {
    assert.doesNotThrow(() => validateIndicatorParams("bbwidth", [20, 100]));
    rejects("bbwidth", [20, 1], /multiplier\) must be an integer in 2-365/);
  });

  it("supertrend order is [factor, atrPeriod]: the old [10, 3] is rejected", () => {
    rejects("supertrend", [10, 3], /factor\) must be an integer in 1-9, got 10/);
    assert.doesNotThrow(() => validateIndicatorParams("supertrend", [3, 10]));
  });
});

describe("multi-period indicators", () => {
  it("accept one or more periods", () => {
    for (const name of ["ma", "ema", "rsi", "wr", "wma", "dema", "tema", "zlema", "hma", "kama"]) {
      assert.doesNotThrow(() => validateIndicatorParams(name, [14]), name);
      assert.doesNotThrow(() => validateIndicatorParams(name, [5, 20, 60, 120]), name);
    }
  });
  it("check every period", () => {
    rejects("rsi", [14, 1], /param #2 \(period\) must be an integer in 2-365/);
    rejects("ma", [5, 2.5], /param #2/);
  });
});

describe("pass-through", () => {
  it("empty params never throw", () => {
    assert.doesNotThrow(() => validateIndicatorParams("macd", []));
  });
  it("indicators without a spec are not validated", () => {
    for (const name of ["obv", "sar", "envelope", "alphatrend", "pmax", "foo-bar"]) {
      assert.doesNotThrow(() => validateIndicatorParams(name, [0.5, -1, 999]), name);
    }
  });
});

describe("helpers", () => {
  it("formatIndicatorSignature", () => {
    assert.equal(
      formatIndicatorSignature("macd"),
      "macd requires 3 params (fast,slow,signal). Default: 12,26,9. Example: params [12,26,9] (CLI: --params 12,26,9)",
    );
    assert.match(formatIndicatorSignature("ma"), /ma requires one or more periods.*Default: 5,20,60/);
  });
  it("describeIndicatorDefaults groups indicators sharing a default", () => {
    const text = describeIndicatorDefaults();
    assert.match(text, /ma 5,20,60/);
    assert.match(text, /supertrend 3,10/);
    assert.match(text, /rsi\/wr\/wma[^;]* 14/);
  });
});
