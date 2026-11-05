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
    for (const name of ["obv", "vwap", "sar", "ad", "foo"]) {
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

describe("envelope / alphatrend / halftrend / pmax", () => {
  it("envelope: [period, percent] both integers 2..365 (percent is an integer, 2 = 2%)", () => {
    assert.doesNotThrow(() => validateIndicatorParams("envelope", [20, 2]));
    rejects("envelope", [20], /envelope requires 2 params \(period,percent\)/);
    rejects("envelope", [20, 2, 1], /envelope requires 2 params/);
    rejects("envelope", [20, 0.1], /param #2 \(percent\) must be an integer in 2-365, got 0.1/);
    rejects("envelope", [1, 2], /param #1 \(period\)/);
    assert.deepEqual(getSpecDefaultParams("envelope"), [20, 2]);
  });

  it("alphatrend / halftrend: two integers, no range check (the backend applies none)", () => {
    assert.doesNotThrow(() => validateIndicatorParams("alphatrend", [14, 100]));
    assert.doesNotThrow(() => validateIndicatorParams("alphatrend", [14, 500]));
    assert.doesNotThrow(() => validateIndicatorParams("halftrend", [2, 20]));
    assert.doesNotThrow(() => validateIndicatorParams("halftrend", [1, 35]));
    rejects("alphatrend", [14], /alphatrend requires 2 params \(period,coefficientX100\)/);
    rejects("halftrend", [2, 20, 1], /halftrend requires 2 params \(amplitude,channelDeviationX10\)/);
    rejects("alphatrend", [14, 1.5], /param #2 \(coefficientX100\) must be an int32 integer, got 1.5/);
    rejects("halftrend", [2, 2147483648], /must be an int32 integer/);
    assert.deepEqual(getSpecDefaultParams("alphatrend"), [14, 100]);
    assert.deepEqual(getSpecDefaultParams("halftrend"), [2, 20]);
  });

  it("pmax: [atrPeriod, multiplier x10, emaPeriod] all integers 2..365", () => {
    assert.doesNotThrow(() => validateIndicatorParams("pmax", [10, 30, 10]));
    rejects("pmax", [10, 30], /pmax requires 3 params \(atrPeriod,multiplierX10,emaPeriod\)/);
    rejects("pmax", [1, 30, 10], /param #1 \(atrPeriod\) must be an integer in 2-365/);
    rejects("pmax", [10, 30, 400], /param #3 \(emaPeriod\)/);
    assert.deepEqual(getSpecDefaultParams("pmax"), [10, 30, 10]);
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
    for (const name of ["obv", "sar", "ad", "foo-bar"]) {
      assert.doesNotThrow(() => validateIndicatorParams(name, [0.5, -1, 999]), name);
    }
  });
});

describe("alias consistency with indicator.ts", () => {
  it("every KNOWN indicator that resolves to a spec'd API code has a spec itself", async () => {
    const { KNOWN_INDICATORS, resolveIndicatorCode } = await import("../src/tools/indicator.js");
    for (const { name } of KNOWN_INDICATORS) {
      const specCodes = Object.keys(INDICATOR_DEFAULT_PARAMS).map((n) => n.toUpperCase().replace(/-/g, "_"));
      const resolvesToSpec = specCodes.includes(resolveIndicatorCode(name));
      // a name that resolves to a spec'd API code must itself be covered (alias or direct)
      if (resolvesToSpec) assert.equal(hasIndicatorParamSpec(name), true, name);
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
