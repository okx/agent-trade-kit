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

  describe("onchain-earn options", () => {
    it("--productId sets productId", () => {
      const { values } = parseCli(["onchain-earn", "purchase", "--productId", "prod123"]);
      assert.equal(values.productId, "prod123");
    });

    it("--protocolType sets protocolType", () => {
      const { values } = parseCli(["onchain-earn", "offers", "--protocolType", "staking"]);
      assert.equal(values.protocolType, "staking");
    });

    it("--term sets term", () => {
      const { values } = parseCli(["onchain-earn", "purchase", "--term", "30"]);
      assert.equal(values.term, "30");
    });

    it("--tag sets tag", () => {
      const { values } = parseCli(["onchain-earn", "purchase", "--tag", "myTag"]);
      assert.equal(values.tag, "myTag");
    });

    it("--allowEarlyRedeem sets allowEarlyRedeem to true", () => {
      const { values } = parseCli(["onchain-earn", "redeem", "--allowEarlyRedeem"]);
      assert.equal(values.allowEarlyRedeem, true);
    });

    it("--no-allowEarlyRedeem sets allowEarlyRedeem to false", () => {
      const { values } = parseCli(["onchain-earn", "redeem", "--no-allowEarlyRedeem"]);
      assert.equal(values.allowEarlyRedeem, false);
    });

    it("--state sets state", () => {
      const { values } = parseCli(["onchain-earn", "orders", "--state", "1"]);
      assert.equal(values.state, "1");
    });
  });
});

describe("earn --rate option", () => {
  it("parses --rate as string", () => {
    const { values } = parseCli(["earn", "purchase", "--ccy", "USDT", "--amt", "100", "--rate", "0.02"]);
    assert.equal(values.rate, "0.02");
  });

  it("rate is undefined when not provided", () => {
    const { values } = parseCli(["earn", "balance"]);
    assert.equal(values.rate, undefined);
  });
});
