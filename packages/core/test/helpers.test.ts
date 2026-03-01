import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  asRecord,
  readString,
  readNumber,
  readBoolean,
  readStringArray,
  requireString,
  assertEnum,
  compactObject,
} from "../src/tools/helpers.js";
import { ValidationError } from "../src/utils/errors.js";

describe("asRecord", () => {
  it("returns the object when given a plain object", () => {
    const input = { a: 1, b: "x" };
    assert.deepEqual(asRecord(input), input);
  });

  it("returns empty object for null", () => {
    assert.deepEqual(asRecord(null), {});
  });

  it("returns empty object for undefined", () => {
    assert.deepEqual(asRecord(undefined), {});
  });

  it("returns empty object for an array", () => {
    assert.deepEqual(asRecord([1, 2, 3]), {});
  });

  it("returns empty object for a string", () => {
    assert.deepEqual(asRecord("hello"), {});
  });
});

describe("readString", () => {
  it("returns the string value", () => {
    assert.equal(readString({ key: "hello" }, "key"), "hello");
  });

  it("returns undefined for missing key", () => {
    assert.equal(readString({}, "key"), undefined);
  });

  it("returns undefined for null value", () => {
    assert.equal(readString({ key: null }, "key"), undefined);
  });

  it("throws ValidationError for non-string value", () => {
    assert.throws(
      () => readString({ key: 42 }, "key"),
      (err: unknown) => {
        assert.ok(err instanceof ValidationError);
        return true;
      },
    );
  });
});

describe("readNumber", () => {
  it("returns the number value", () => {
    assert.equal(readNumber({ n: 3.14 }, "n"), 3.14);
  });

  it("returns undefined for missing key", () => {
    assert.equal(readNumber({}, "n"), undefined);
  });

  it("throws for NaN", () => {
    assert.throws(() => readNumber({ n: NaN }, "n"), ValidationError);
  });

  it("throws for string that looks like a number", () => {
    assert.throws(() => readNumber({ n: "42" }, "n"), ValidationError);
  });
});

describe("readBoolean", () => {
  it("returns true", () => {
    assert.equal(readBoolean({ f: true }, "f"), true);
  });

  it("returns false", () => {
    assert.equal(readBoolean({ f: false }, "f"), false);
  });

  it("returns undefined for missing key", () => {
    assert.equal(readBoolean({}, "f"), undefined);
  });

  it("throws for non-boolean", () => {
    assert.throws(() => readBoolean({ f: 1 }, "f"), ValidationError);
  });
});

describe("readStringArray", () => {
  it("returns the array", () => {
    assert.deepEqual(readStringArray({ arr: ["a", "b"] }, "arr"), ["a", "b"]);
  });

  it("returns undefined for missing key", () => {
    assert.equal(readStringArray({}, "arr"), undefined);
  });

  it("throws for non-array", () => {
    assert.throws(() => readStringArray({ arr: "not-an-array" }, "arr"), ValidationError);
  });

  it("throws for array containing non-strings", () => {
    assert.throws(() => readStringArray({ arr: [1, 2] }, "arr"), ValidationError);
  });
});

describe("requireString", () => {
  it("returns the value when present", () => {
    assert.equal(requireString({ key: "value" }, "key"), "value");
  });

  it("throws for missing key", () => {
    assert.throws(() => requireString({}, "key"), ValidationError);
  });

  it("throws for empty string", () => {
    assert.throws(() => requireString({ key: "" }, "key"), ValidationError);
  });
});

describe("assertEnum", () => {
  it("does not throw for valid value", () => {
    assert.doesNotThrow(() => assertEnum("buy", "side", ["buy", "sell"] as const));
  });

  it("throws for invalid value", () => {
    assert.throws(() => assertEnum("hold", "side", ["buy", "sell"] as const), ValidationError);
  });

  it("does not throw for undefined (optional field)", () => {
    assert.doesNotThrow(() => assertEnum(undefined, "side", ["buy", "sell"] as const));
  });
});

describe("compactObject", () => {
  it("removes undefined values", () => {
    const result = compactObject({ a: 1, b: undefined, c: "x" });
    assert.deepEqual(result, { a: 1, c: "x" });
  });

  it("removes null values", () => {
    const result = compactObject({ a: null, b: 2 });
    assert.deepEqual(result, { b: 2 });
  });

  it("keeps falsy-but-defined values (0, false, empty string)", () => {
    const result = compactObject({ a: 0, b: false, c: "" });
    assert.deepEqual(result, { a: 0, b: false, c: "" });
  });

  it("returns empty object when all values are null/undefined", () => {
    assert.deepEqual(compactObject({ a: undefined, b: null }), {});
  });
});
