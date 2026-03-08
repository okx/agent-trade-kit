import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCli } from "../src/parser.js";

// ---------------------------------------------------------------------------
// parseCli — --no-<flag> boolean negation
// ---------------------------------------------------------------------------
describe("parseCli", () => {
  describe("--no-<flag> boolean negation", () => {
    it("--no-basePos sets basePos to false", () => {
      const { values } = parseCli(["bot", "grid", "create", "--no-basePos"]);
      assert.equal(values.basePos, false);
    });

    it("basePos defaults to true when --basePos is absent", () => {
      const { values } = parseCli(["bot", "grid", "create"]);
      assert.equal(values.basePos, true);
    });

    it("--basePos sets basePos to true explicitly", () => {
      const { values } = parseCli(["bot", "grid", "create", "--basePos"]);
      assert.equal(values.basePos, true);
    });

    it("--no-demo sets demo to false", () => {
      const { values } = parseCli(["--no-demo", "market", "tickers"]);
      assert.equal(values.demo, false);
    });

    it("--no-reduceOnly sets reduceOnly to false", () => {
      const { values } = parseCli(["swap", "place", "--no-reduceOnly"]);
      assert.equal(values.reduceOnly, false);
    });

    it("ignores --no- prefix for non-boolean options", () => {
      // --no-instId should NOT be stripped (instId is a string option)
      assert.throws(
        () => parseCli(["--no-instId"]),
        { code: "ERR_PARSE_ARGS_UNKNOWN_OPTION" },
      );
    });
  });

  describe("positionals", () => {
    it("captures positional arguments", () => {
      const { positionals } = parseCli(["market", "tickers", "--instType", "SPOT"]);
      assert.deepEqual(positionals, ["market", "tickers"]);
    });
  });
});
