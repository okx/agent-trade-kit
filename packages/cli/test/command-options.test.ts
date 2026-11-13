/**
 * Command-level option allow-lists for `bot recurring <action>` and
 * `bot smart-portfolio <action>` (command-options.ts + parseCli).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLI_REGISTRY } from "../src/cli-registry.js";
import {
  GLOBAL_OPTIONS,
  getStrictBusinessOptions,
  getStrictCommandOptions,
  strictCommandPaths,
} from "../src/command-options.js";
import { CLI_OPTIONS, parseCli } from "../src/parser.js";

const UNKNOWN = { code: "ERR_PARSE_ARGS_UNKNOWN_OPTION" };

describe("allow-list <-> registry sync", () => {
  const registryPaths: string[] = [];
  const botGroup = CLI_REGISTRY["bot"]!;
  for (const sub of ["recurring", "smart-portfolio"]) {
    for (const action of Object.keys(botGroup.subgroups![sub]!.commands)) registryPaths.push(`bot ${sub} ${action}`);
  }

  it("every registry action of both products has an allow-list, and vice versa", () => {
    assert.deepEqual([...strictCommandPaths()].sort(), [...registryPaths].sort());
  });

  it("every --flag in a usage string is allowed for that action", () => {
    for (const path of registryPaths) {
      const [, sub, action] = path.split(" ");
      const usage = botGroup.subgroups![sub!]!.commands[action!]!.usage;
      const allowed = getStrictCommandOptions(path)!;
      const flags = [...usage.matchAll(/--(?:no-)?([A-Za-z][A-Za-z0-9-]*)/g)].map((m) => m[1]!);
      for (const flag of flags) {
        assert.ok(allowed.has(flag), `${path}: usage mentions --${flag} but it is not in the allow-list`);
      }
    }
  });

  it("every allow-listed business option is a real parser option (or the strict-only addInvest)", () => {
    for (const path of strictCommandPaths()) {
      for (const name of getStrictBusinessOptions(path)!) {
        assert.ok(name in CLI_OPTIONS || name === "addInvest", `${path}: ${name} is not parseable`);
      }
    }
  });

  it("global options are all real parser options", () => {
    for (const name of GLOBAL_OPTIONS) assert.ok(name in CLI_OPTIONS, name);
  });

  it("non-strict commands have no allow-list", () => {
    assert.equal(getStrictCommandOptions("market ticker"), undefined);
    assert.equal(getStrictCommandOptions("bot grid create"), undefined);
    assert.equal(getStrictCommandOptions("bot recurring"), undefined);
    assert.equal(getStrictCommandOptions("bot recurring unknown-action"), undefined);
    assert.equal(getStrictCommandOptions("toString"), undefined);
    assert.equal(getStrictCommandOptions("__proto__"), undefined);
  });
});

describe("smart-portfolio new actions — accepted options", () => {
  it("manual-pause / manual-resume take algoId", () => {
    for (const action of ["manual-pause", "manual-resume"]) {
      const { values, positionals } = parseCli(["bot", "smart-portfolio", action, "--algoId", "123"]);
      assert.equal(values.algoId, "123");
      assert.deepEqual(positionals, ["bot", "smart-portfolio", action]);
    }
  });

  it("add-investment takes algoId, addInvest, tradeQuoteCcy", () => {
    const { values } = parseCli(["bot", "smart-portfolio", "add-investment", "--algoId", "1", "--addInvest", "10.5", "--tradeQuoteCcy", "USDT"]);
    assert.equal(values.addInvest, "10.5");
    assert.equal(values.tradeQuoteCcy, "USDT");
  });

  it("edit-portfolio takes algoId, portfolioList, addInvest, tradeQuoteCcy", () => {
    const pl = '[{"ccy":"BTC","ratio":"0.5"},{"ccy":"ETH","ratio":"0.5"}]';
    const { values } = parseCli(["bot", "smart-portfolio", "edit-portfolio", "--algoId", "1", "--portfolioList", pl, "--addInvest", "5", "--tradeQuoteCcy=usdt"]);
    assert.equal(values.portfolioList, pl);
    assert.equal(values.addInvest, "5");
    assert.equal(values.tradeQuoteCcy, "usdt");
  });

  it("negative amounts reach validation instead of failing as 'argument missing'", () => {
    assert.equal(parseCli(["bot", "smart-portfolio", "add-investment", "--algoId", "1", "--addInvest", "-5"]).values.addInvest, "-5");
    assert.equal(parseCli(["bot", "smart-portfolio", "add-investment", "--algoId", "1", "--addInvest=-5"]).values.addInvest, "-5");
    assert.equal(parseCli(["bot", "smart-portfolio", "amend-rebalance", "--algoId", "1", "--deltaRatio", "-0.1", "--interval", "5"]).values.deltaRatio, "-0.1");
  });
});

describe("smart-portfolio / recurring — unrelated options are rejected before any request", () => {
  const rejected: string[][] = [
    ["bot", "smart-portfolio", "manual-pause", "--algoId", "1", "--addInvest", "1"],
    ["bot", "smart-portfolio", "manual-resume", "--algoId", "1", "--portfolioList", "[]"],
    ["bot", "smart-portfolio", "add-investment", "--algoId", "1", "--addInvest", "1", "--portfolioList", "[]"],
    ["bot", "smart-portfolio", "edit-portfolio", "--algoId", "1", "--portfolioList", "[]", "--deltaRatio", "0.1"],
    ["bot", "smart-portfolio", "details", "--algoId", "1", "--stopType", "1"],
    ["bot", "smart-portfolio", "stop", "--algoId", "1", "--stopType", "1", "--addInvest", "1"],
    ["bot", "smart-portfolio", "amend-rebalance", "--algoId", "1", "--tradeQuoteCcy", "USDT"],
    ["bot", "smart-portfolio", "instant-rebalance", "--algoId", "1", "--interval", "5"],
    ["bot", "smart-portfolio", "zones-backtest", "--recommendId", "1", "--algoId", "1"],
    ["bot", "smart-portfolio", "orders", "--recurringDay", "1"],
    ["bot", "smart-portfolio", "manual-pause", "--algoId", "1", "--aiBuilderCode", "X"],
    ["bot", "smart-portfolio", "stop", "--algoId", "1", "--stopType", "1", "--aiBuilderCode", "X"],
    ["bot", "recurring", "pause", "--algoId", "1", "--amt", "10", "--recurringDay", "1"],
    ["bot", "recurring", "pause", "--algoId", "1", "--no-history"],
    ["bot", "recurring", "details", "--algoId", "1", "--history"],
    ["bot", "recurring", "stop", "--algoId", "1", "--stgyName", "x"],
    ["bot", "recurring", "amend-name", "--algoId", "1", "--stgyName", "x", "--amt", "1"],
    ["bot", "recurring", "create", "--stgyName", "x", "--amount", "5"],
    ["bot", "recurring", "orders", "--aiBuilderCode", "X"],
  ];
  for (const argv of rejected) {
    it(`rejects: ${argv.slice(1).join(" ")}`, () => {
      assert.throws(() => parseCli(argv), UNKNOWN);
    });
  }

  it("error message is the standard Unknown option text", () => {
    assert.throws(() => parseCli(["bot", "smart-portfolio", "manual-pause", "--addInvest", "1"]), /Unknown option '--addInvest'/);
  });

  it("an unrelated --no-<flag> is an unknown option, not silently honoured", () => {
    assert.throws(() => parseCli(["bot", "smart-portfolio", "details", "--algoId", "1", "--no-history"]), /Unknown option '--no-history'/);
    assert.throws(() => parseCli(["bot", "smart-portfolio", "manual-pause", "--algoId", "1", "--no-basePos"]), UNKNOWN);
  });
});

describe("smart-portfolio / recurring — every legitimate invocation keeps working", () => {
  it("global options in any position, =value form, --no-demo, negative time zone", () => {
    const a = parseCli(["--profile", "p", "--demo", "bot", "smart-portfolio", "details", "--algoId", "1", "--json", "--verbose", "--site", "global"]);
    assert.equal(a.values.profile, "p");
    assert.equal(a.values.demo, true);
    assert.equal(a.values.json, true);
    assert.equal(a.values.site, "global");
    const b = parseCli(["bot", "smart-portfolio", "details", "--algoId=1", "--live", "--env"]);
    assert.equal(b.values.algoId, "1");
    assert.equal(b.values.live, true);
    assert.equal(b.values.env, true);
    assert.equal(parseCli(["bot", "recurring", "pause", "--algoId", "1", "--no-demo"]).values.demo, false);
    assert.equal(parseCli(["bot", "recurring", "amend-time", "--algoId", "1", "--timeZone", "-5", "--period", "daily", "--recurringTimeType", "1"]).values.timeZone, "-5");
    assert.equal(parseCli(["bot", "recurring", "amend-time", "--algoId", "1", "--timeZone=-3.5"]).values.timeZone, "-3.5");
  });

  it("--help / --version still parse on strict commands", () => {
    assert.equal(parseCli(["bot", "smart-portfolio", "manual-pause", "--help"]).values.help, true);
    assert.equal(parseCli(["bot", "recurring", "pause", "-v"]).values.version, true);
  });

  it("--no-history negates a boolean the action really has", () => {
    assert.equal(parseCli(["bot", "recurring", "orders", "--no-history"]).values.history, false);
    assert.equal(parseCli(["bot", "smart-portfolio", "orders", "--history"]).values.history, true);
  });

  it("recurring aliases stay on the actions that read them", () => {
    assert.equal(parseCli(["bot", "recurring", "amend-amount", "--algoId", "1", "--amount", "5"]).values.amount, "5");
    assert.equal(parseCli(["bot", "recurring", "amend-amount", "--algoId", "1", "--amt", "5"]).values.amt, "5");
    assert.equal(parseCli(["bot", "recurring", "add-investment", "--algoId", "1", "--amt", "5"]).values.amt, "5");
    assert.equal(parseCli(["bot", "recurring", "create", "--amt", "5", "--aiBuilderCode", "X"]).values.aiBuilderCode, "X");
  });

  it("existing smart-portfolio actions accept their documented options", () => {
    const argvs: string[][] = [
      ["orders", "--history", "--algoId", "1", "--instId", "BTC-USDT", "--state", "stopped", "--instType", "SPOT", "--after", "1", "--before", "2", "--limit", "5"],
      ["create", "--stgyName", "n", "--investmentCcy", "USDT", "--initCapital", "100", "--portfolioList", "[]", "--interval", "5", "--deltaRatio", "0.05", "--tradeQuoteCcy", "USDT", "--investType", "simple", "--algoClOrdId", "a", "--aiBuilderCode", "X"],
      ["stop", "--algoId", "1", "--stopType", "2"],
      ["amend-rebalance", "--algoId", "1", "--deltaRatio", "0.05", "--interval", "5"],
      ["recommend-zones", "--recommendId", "1", "--assetType", "Crypto"],
      ["zones-backtest", "--recommendId", "1", "--period", "7D"],
    ];
    for (const argv of argvs) {
      assert.doesNotThrow(() => parseCli(["bot", "smart-portfolio", ...argv]), argv.join(" "));
    }
  });

  it("existing recurring actions accept their documented options", () => {
    const argvs: string[][] = [
      ["create", "--stgyName", "n", "--recurringList", "[]", "--period", "monthly", "--recurringDay", "1", "--recurringHour", "4", "--recurringTime", "0", "--timeZone", "8", "--amt", "5", "--investmentCcy", "USDT", "--tdMode", "cash", "--algoClOrdId", "a", "--tradeQuoteCcy", "USDT", "--source", "1", "--recurringTimeType", "1", "--aiBuilderCode", "X"],
      ["orders", "--history", "--algoId", "1", "--after", "1", "--before", "2", "--limit", "5"],
      ["sub-orders", "--algoId", "1", "--ordId", "2", "--after", "1", "--before", "2", "--limit", "5"],
      ["restart", "--algoId", "1"],
      ["amend-price-range", "--algoId", "1", "--recurringList", "[]"],
      ["amend-time", "--algoId", "1", "--recurringTimeType", "1", "--period", "weekly", "--timeZone", "8", "--recurringDay", "1", "--recurringHour", "1", "--recurringTime", "2"],
    ];
    for (const argv of argvs) {
      assert.doesNotThrow(() => parseCli(["bot", "recurring", ...argv]), argv.join(" "));
    }
  });
});

describe("other commands keep their current parsing", () => {
  it("market ticker still accepts unrelated shared options (scoped fix only)", () => {
    const { values } = parseCli(["market", "ticker", "BTC-USDT", "--params", "x", "--recurringDay", "1"]);
    assert.equal(values.recurringDay, "1");
  });

  it("--addInvest is not newly accepted outside the strict commands", () => {
    assert.throws(() => parseCli(["market", "ticker", "BTC-USDT", "--addInvest", "1"]), UNKNOWN);
    assert.throws(() => parseCli(["bot", "recurring", "add-investment", "--algoId", "1", "--addInvest", "1"]), UNKNOWN);
  });

  it("market trades --type special case is preserved", () => {
    assert.equal(parseCli(["market", "trades", "BTC-USDT", "--history", "--type", "2"]).values.type, "2");
    assert.throws(() => parseCli(["market", "ticker", "BTC-USDT", "--type", "1"]), UNKNOWN);
  });

  it("grid / dca commands still accept their own options and shared negation", () => {
    assert.equal(parseCli(["bot", "grid", "create", "--instId", "BTC-USDT", "--no-basePos"]).values.basePos, false);
    assert.equal(parseCli(["bot", "dca", "orders", "--algoOrdType", "spot_dca", "--history"]).values.history, true);
  });

  it("unknown recurring / smart-portfolio actions fall back to the shared table", () => {
    const { positionals } = parseCli(["bot", "smart-portfolio", "no-such-action", "--algoId", "1", "--stopType", "1"]);
    assert.deepEqual(positionals, ["bot", "smart-portfolio", "no-such-action"]);
    assert.doesNotThrow(() => parseCli(["bot", "recurring", "--help"]));
  });

  it("market indicator keeps its --params handling", () => {
    assert.equal(parseCli(["market", "indicator", "rsi", "BTC-USDT", "--params", "-9,3,3"]).values.params, "-9,3,3");
  });
});
