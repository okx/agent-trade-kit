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

describe("dcd options", () => {
  it("--quoteId sets quoteId", () => {
    const { values } = parseCli(["earn", "dcd", "buy", "--quoteId", "qtbcDCD-QUOTE123"]);
    assert.equal(values.quoteId, "qtbcDCD-QUOTE123");
  });

  it("--notionalCcy sets notionalCcy", () => {
    const { values } = parseCli(["earn", "dcd", "quote", "--notionalCcy", "BTC"]);
    assert.equal(values.notionalCcy, "BTC");
  });

  it("--optType sets optType", () => {
    const { values } = parseCli(["earn", "dcd", "products", "--optType", "C"]);
    assert.equal(values.optType, "C");
  });

  it("--baseCcy sets baseCcy", () => {
    const { values } = parseCli(["earn", "dcd", "products", "--baseCcy", "BTC"]);
    assert.equal(values.baseCcy, "BTC");
  });

  it("--beginId sets beginId", () => {
    const { values } = parseCli(["earn", "dcd", "orders", "--beginId", "100"]);
    assert.equal(values.beginId, "100");
  });

  it("--endId sets endId", () => {
    const { values } = parseCli(["earn", "dcd", "orders", "--endId", "200"]);
    assert.equal(values.endId, "200");
  });

  it("--begin sets begin", () => {
    const { values } = parseCli(["earn", "dcd", "orders", "--begin", "1700000000000"]);
    assert.equal(values.begin, "1700000000000");
  });

  it("--end sets end", () => {
    const { values } = parseCli(["earn", "dcd", "orders", "--end", "1800000000000"]);
    assert.equal(values.end, "1800000000000");
  });

  it("--minYield sets minYield", () => {
    const { values } = parseCli(["earn", "dcd", "products", "--minYield", "0.05"]);
    assert.equal(values.minYield, "0.05");
  });

  it("--strikeNear sets strikeNear", () => {
    const { values } = parseCli(["earn", "dcd", "products", "--strikeNear", "72000"]);
    assert.equal(values.strikeNear, "72000");
  });

  it("--termDays sets termDays", () => {
    const { values } = parseCli(["earn", "dcd", "products", "--termDays", "7"]);
    assert.equal(values.termDays, "7");
  });

  it("--minTermDays sets minTermDays", () => {
    const { values } = parseCli(["earn", "dcd", "products", "--minTermDays", "3"]);
    assert.equal(values.minTermDays, "3");
  });

  it("--maxTermDays sets maxTermDays", () => {
    const { values } = parseCli(["earn", "dcd", "products", "--maxTermDays", "30"]);
    assert.equal(values.maxTermDays, "30");
  });

  it("--expDate sets expDate", () => {
    const { values } = parseCli(["earn", "dcd", "products", "--expDate", "2026-03-27"]);
    assert.equal(values.expDate, "2026-03-27");
  });
});

describe("grid extended options", () => {
  it("--algoClOrdId sets algoClOrdId", () => {
    const { values } = parseCli(["bot", "grid", "create", "--algoClOrdId", "abc123"]);
    assert.equal(values.algoClOrdId, "abc123");
  });

  it("--tpRatio sets tpRatio", () => {
    const { values } = parseCli(["bot", "grid", "create", "--tpRatio", "0.1"]);
    assert.equal(values.tpRatio, "0.1");
  });

  it("--slRatio sets slRatio", () => {
    const { values } = parseCli(["bot", "grid", "create", "--slRatio", "0.05"]);
    assert.equal(values.slRatio, "0.05");
  });

  it("--tradeQuoteCcy sets tradeQuoteCcy", () => {
    const { values } = parseCli(["bot", "grid", "create", "--tradeQuoteCcy", "USDT"]);
    assert.equal(values.tradeQuoteCcy, "USDT");
  });

  it("--mktClose sets mktClose to true", () => {
    const { values } = parseCli(["bot", "grid", "close-position", "--mktClose"]);
    assert.equal(values.mktClose, true);
  });

  it("--timeframe sets timeframe", () => {
    const { values } = parseCli(["bot", "grid", "rsi-back-testing", "--timeframe", "15m"]);
    assert.equal(values.timeframe, "15m");
  });

  it("--gridType sets gridType", () => {
    const { values } = parseCli(["bot", "grid", "margin-balance", "--gridType", "add"]);
    assert.equal(values.gridType, "add");
  });

  it("--thold sets thold", () => {
    const { values } = parseCli(["bot", "grid", "rsi-back-testing", "--thold", "30"]);
    assert.equal(values.thold, "30");
  });

  it("--timePeriod sets timePeriod", () => {
    const { values } = parseCli(["bot", "grid", "rsi-back-testing", "--timePeriod", "14"]);
    assert.equal(values.timePeriod, "14");
  });

  it("--investmentType sets investmentType", () => {
    const { values } = parseCli(["bot", "grid", "min-investment", "--investmentType", "2"]);
    assert.equal(values.investmentType, "2");
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
