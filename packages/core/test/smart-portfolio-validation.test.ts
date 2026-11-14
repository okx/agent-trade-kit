/**
 * Unit tests for Smart Portfolio validation: exact-decimal deltaRatio, exact
 * portfolio weights (no float tolerance), addInvest and tradeQuoteCcy handling.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAddInvest,
  normalizeDeltaRatio,
  normalizeTradeQuoteCcy,
  parsePortfolioListJson,
  validateAndNormalizePortfolioList,
} from "../src/tools/bot/smart-portfolio-validation.js";
import { ValidationError } from "../src/utils/errors.js";

const rejects = (fn: () => unknown, re?: RegExp) =>
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof ValidationError, `expected ValidationError, got ${String(err)}`);
    if (re) assert.match(err.message, re);
    return true;
  });

const list = (...pairs: Array<[string, string]>) => pairs.map(([ccy, ratio]) => ({ ccy, ratio }));

describe("normalizeDeltaRatio — decimal precision", () => {
  const cases: Array<[string, string]> = [
    ["0.29", "0.29"],
    ["0.58", "0.58"],
    ["0.57", "0.57"],
    ["0.07", "0.07"],
    ["0.019", "0.01"],
    ["0.999", "0.99"],
    ["0.05", "0.05"],
    ["0.1", "0.10"],
    [".5", "0.50"],
    ["5e-2", "0.05"],
    ["5E-2", "0.05"],
    [" 0.05 ", "0.05"],
    ["+0.05", "0.05"],
    ["0.0100000000000000000000001", "0.01"],
    ["0.99999999999999999999999999", "0.99"],
    ["99e-2", "0.99"],
    ["0.01", "0.01"],
  ];
  for (const [raw, expected] of cases) {
    it(`${JSON.stringify(raw)} -> ${expected}`, () => {
      assert.equal(normalizeDeltaRatio(raw), expected);
    });
  }

  it("rejects values that truncate below 0.01", () => {
    rejects(() => normalizeDeltaRatio("0.009"), /too small/);
    rejects(() => normalizeDeltaRatio("0"), /too small/);
    rejects(() => normalizeDeltaRatio("1e-400"), /too small/);
  });

  it("rejects values >= 1", () => {
    rejects(() => normalizeDeltaRatio("1.0"), /too large/);
    rejects(() => normalizeDeltaRatio("1"), /too large/);
    rejects(() => normalizeDeltaRatio("1e999999999"), /too large/);
  });

  it("rejects negatives instead of taking the absolute value", () => {
    rejects(() => normalizeDeltaRatio("-0.5"), /too small/);
    rejects(() => normalizeDeltaRatio("-0.05"), /too small/);
  });

  it("rejects non-decimal input", () => {
    for (const raw of ["abc", "", "NaN", "Infinity", "-Infinity", "0x10", "1e", "1_0"]) {
      rejects(() => normalizeDeltaRatio(raw), /deltaRatio must be a decimal number string/);
    }
  });

  it("applies the same size limits to plain decimals as to exponent notation", () => {
    rejects(() => normalizeAddInvest("1" + "0".repeat(101), "required"), /outside the supported size/);
    rejects(() => normalizeAddInvest("0." + "0".repeat(100) + "1", "optional"), /outside the supported size/);
    rejects(() => normalizeAddInvest("1e101", "required"), /outside the supported size/);
    assert.equal(normalizeAddInvest("1" + "0".repeat(99), "required"), "1" + "0".repeat(99));
  });

  it("is bounded for pathological input", () => {
    const start = Date.now();
    rejects(() => normalizeDeltaRatio("9".repeat(5000)), /too long/);
    rejects(() => normalizeDeltaRatio("1e" + "9".repeat(40)), /exponent/);
    assert.equal(normalizeDeltaRatio("0." + "5".repeat(900)), "0.55");
    assert.ok(Date.now() - start < 500);
  });
});

describe("validateAndNormalizePortfolioList — exact weights", () => {
  it("accepts 0.6 + 0.4 and upper-cases/trims ccy", () => {
    const out = validateAndNormalizePortfolioList(list([" btc ", "0.6"], ["eth", "0.4"]));
    assert.deepEqual(out, list(["BTC", "0.6"], ["ETH", "0.4"]));
  });

  it("accepts a high-precision exact total", () => {
    assert.equal(
      validateAndNormalizePortfolioList(list(["A", "0.3333"], ["B", "0.3333"], ["C", "0.3334"])).length,
      3,
    );
  });

  it("accepts ten 0.1 weights (float sum is 0.9999999999999999)", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ ccy: `C${i}`, ratio: "0.1" }));
    assert.equal(validateAndNormalizePortfolioList(items).length, 10);
  });

  it("accepts scientific-notation weights and keeps the sent value plain", () => {
    const out = validateAndNormalizePortfolioList(list(["BTC", "6e-1"], ["ETH", "0.4"]));
    assert.equal(out[0]!.ratio, "0.6");
    assert.equal(out[1]!.ratio, "0.4");
  });

  it("keeps the user's original ratio string for plain decimals", () => {
    const out = validateAndNormalizePortfolioList(list(["BTC", "0.60"], ["ETH", "0.40"]));
    assert.equal(out[0]!.ratio, "0.60");
  });

  it("accepts numeric JSON ratios for compatibility", () => {
    const out = validateAndNormalizePortfolioList([{ ccy: "BTC", ratio: 0.6 }, { ccy: "ETH", ratio: 0.4 }]);
    assert.deepEqual(out, list(["BTC", "0.6"], ["ETH", "0.4"]));
  });

  it("rejects sums that are not exactly 1 — no 0.0001 tolerance", () => {
    rejects(() => validateAndNormalizePortfolioList(list(["A", "0.6"], ["B", "0.40001"])), /sum to 1\.0/);
    rejects(() => validateAndNormalizePortfolioList(list(["A", "0.6"], ["B", "0.39999999"])), /sum to 1\.0/);
    rejects(() => validateAndNormalizePortfolioList(list(["A", "0.5"], ["B", "0.3"])), /sum to 1\.0/);
    rejects(() => validateAndNormalizePortfolioList(list(["A", "0.99999999"], ["B", "0.00000002"])), /sum to 1\.0/);
    rejects(() => validateAndNormalizePortfolioList(list(["A", "0.99999999"], ["B", "0.000000001"])), /sum to 1\.0/);
  });

  it("rejects weights that are zero, negative, non-numeric or non-finite", () => {
    for (const bad of ["0", "-0.1", "abc", "NaN", "Infinity", "0x1", "0.0"]) {
      rejects(() => validateAndNormalizePortfolioList(list(["A", bad], ["B", "1"])), /portfolioList ratio/);
    }
  });

  it("rejects a weight above 1 and one with absurd magnitude", () => {
    rejects(() => validateAndNormalizePortfolioList(list(["A", "1.5"], ["B", "-0.5"])), /portfolioList ratio/);
    rejects(() => validateAndNormalizePortfolioList(list(["A", "1e999999999"], ["B", "0.5"])), /portfolioList ratio/);
    rejects(() => validateAndNormalizePortfolioList(list(["A", "1e-400"], ["B", "0.5"])), /decimal places/);
  });

  it("enforces 2-10 items", () => {
    rejects(() => validateAndNormalizePortfolioList(list(["A", "1"])), /at least 2 items/);
    rejects(() => validateAndNormalizePortfolioList("nope"), /at least 2 items/);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ ccy: `C${i}`, ratio: "0.1" }));
    rejects(() => validateAndNormalizePortfolioList(eleven), /at most 10 items/);
  });

  it("rejects duplicate ccy after trim/upper-case", () => {
    rejects(() => validateAndNormalizePortfolioList(list(["btc", "0.5"], [" BTC ", "0.5"])), /Duplicate CCY/);
  });

  it("throws ValidationError (not TypeError) for null / non-object / missing fields", () => {
    rejects(() => validateAndNormalizePortfolioList([null, { ccy: "BTC", ratio: "1" }]), /must be an object/);
    rejects(() => validateAndNormalizePortfolioList(["BTC", "ETH"]), /must be an object/);
    rejects(() => validateAndNormalizePortfolioList([[], { ccy: "BTC", ratio: "1" }]), /must be an object/);
    rejects(() => validateAndNormalizePortfolioList([{ ratio: "0.5" }, { ccy: "ETH", ratio: "0.5" }]), /non-empty ccy/);
    rejects(() => validateAndNormalizePortfolioList([{ ccy: "BTC" }, { ccy: "ETH", ratio: "1" }]), /non-empty ratio/);
    rejects(() => validateAndNormalizePortfolioList([{ ccy: 5, ratio: "0.5" }, { ccy: "ETH", ratio: "0.5" }]), /ccy/);
    rejects(() => validateAndNormalizePortfolioList([{ ccy: "BTC", ratio: {} }, { ccy: "ETH", ratio: "1" }]), /ratio/);
  });

  it("does not mutate or normalise weights", () => {
    const input = list(["BTC", "0.5"], ["ETH", "0.3"]);
    rejects(() => validateAndNormalizePortfolioList(input));
    assert.deepEqual(input, list(["BTC", "0.5"], ["ETH", "0.3"]));
  });
});

describe("parsePortfolioListJson", () => {
  it("parses a JSON array string", () => {
    assert.deepEqual(parsePortfolioListJson('[{"ccy":"BTC","ratio":"1"}]'), [{ ccy: "BTC", ratio: "1" }]);
  });

  it("throws ValidationError for invalid JSON", () => {
    rejects(() => parsePortfolioListJson("not json"), /not valid JSON/);
  });

  it("keeps the original text of numeric ratios instead of rounding to a double", () => {
    const parsed = parsePortfolioListJson('[{"ccy":"BTC","ratio":0.50000000000000001},{"ccy":"ETH","ratio":5e-1}]');
    assert.deepEqual(parsed, [
      { ccy: "BTC", ratio: "0.50000000000000001" },
      { ccy: "ETH", ratio: "5e-1" },
    ]);
  });

  it("does not touch digits inside strings and still rejects malformed numbers", () => {
    assert.deepEqual(parsePortfolioListJson('[{"ccy":"B1\\"2","ratio":"0.5"}]'), [{ ccy: 'B1"2', ratio: "0.5" }]);
    rejects(() => parsePortfolioListJson('[{"ccy":"BTC","ratio":01}]'), /not valid JSON/);
  });

  it("only preserves ratio numbers: other numeric fields keep their type and are still rejected", () => {
    const parsed = parsePortfolioListJson('[{"ccy":123,"ratio":0.5},{"ccy":"ETH","ratio":0.5}]');
    assert.deepEqual(parsed, [{ ccy: 123, ratio: "0.5" }, { ccy: "ETH", ratio: "0.5" }]);
    rejects(() => validateAndNormalizePortfolioList(parsed), /ccy must be a string/);
  });

  it("rejects text that is not valid JSON as written instead of repairing it", () => {
    rejects(() => parsePortfolioListJson('[{123:1,"ratio":0.5},{"ccy":"ETH","ratio":0.5}]'), /not valid JSON/);
    rejects(() => parsePortfolioListJson('[{"ccy":"BTC","ratio":+1}]'), /not valid JSON/);
  });

  it("rejects numeric weights whose exact sum is not 1 (no silent double rounding)", () => {
    const raw = '[{"ccy":"BTC","ratio":0.50000000000000001},{"ccy":"ETH","ratio":0.5}]';
    rejects(() => validateAndNormalizePortfolioList(parsePortfolioListJson(raw)), /sum to 1\.0/);
    const ok = '[{"ccy":"BTC","ratio":0.6},{"ccy":"ETH","ratio":0.4}]';
    assert.deepEqual(validateAndNormalizePortfolioList(parsePortfolioListJson(ok)), list(["BTC", "0.6"], ["ETH", "0.4"]));
  });
});

describe("normalizeAddInvest", () => {
  it("required mode keeps a positive amount", () => {
    assert.equal(normalizeAddInvest("100", "required"), "100");
    assert.equal(normalizeAddInvest(" 12.50 ", "required"), "12.50");
    assert.equal(normalizeAddInvest("1e2", "required"), "100");
    assert.equal(normalizeAddInvest("0.000001", "required"), "0.000001");
  });

  it("required mode rejects missing, empty, zero, negative and invalid values", () => {
    for (const bad of [undefined, null, "", "   ", "0", "0.0", "-1", "abc", "1e400", "NaN", "Infinity", "0x10"]) {
      rejects(() => normalizeAddInvest(bad, "required"), /addInvest/);
    }
    rejects(() => normalizeAddInvest(5, "required"), /addInvest/);
  });

  it("optional mode treats missing / null / empty / blank / zero as 'no top-up'", () => {
    for (const none of [undefined, null, "", "   ", "0", "0.0", "0e5", "-0"]) {
      assert.equal(normalizeAddInvest(none, "optional"), undefined);
    }
  });

  it("optional mode keeps a positive amount and rejects invalid or negative ones", () => {
    assert.equal(normalizeAddInvest("50", "optional"), "50");
    rejects(() => normalizeAddInvest("-1", "optional"), /addInvest/);
    rejects(() => normalizeAddInvest("abc", "optional"), /addInvest/);
    rejects(() => normalizeAddInvest("1e400", "optional"), /addInvest/);
    rejects(() => normalizeAddInvest(50, "optional"), /addInvest/);
  });

  it("is bounded for pathological input", () => {
    const start = Date.now();
    rejects(() => normalizeAddInvest("9".repeat(5000), "required"), /too long/);
    rejects(() => normalizeAddInvest("1e999999999", "required"), /addInvest/);
    assert.ok(Date.now() - start < 500);
  });
});

describe("normalizeTradeQuoteCcy", () => {
  it("trims but preserves case", () => {
    assert.equal(normalizeTradeQuoteCcy("USDT"), "USDT");
    assert.equal(normalizeTradeQuoteCcy("usdt"), "usdt");
    assert.equal(normalizeTradeQuoteCcy("  USDT  "), "USDT");
  });

  it("returns undefined for missing / null / empty / blank", () => {
    for (const none of [undefined, null, "", "   ", "\t\n"]) {
      assert.equal(normalizeTradeQuoteCcy(none), undefined);
    }
  });

  it("rejects non-string values", () => {
    rejects(() => normalizeTradeQuoteCcy(5), /tradeQuoteCcy/);
    rejects(() => normalizeTradeQuoteCcy({}), /tradeQuoteCcy/);
    rejects(() => normalizeTradeQuoteCcy(true), /tradeQuoteCcy/);
  });
});
