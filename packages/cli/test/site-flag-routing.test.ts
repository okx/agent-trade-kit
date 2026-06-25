/**
 * Routing test for the `--site` CLI flag.
 *
 * Guards the regression fixed alongside the TR-site addition: the main
 * dispatch and `diagnose` paths used to call loadProfileConfig WITHOUT
 * `site: v.site`, so --site eea|us|tr was silently dropped and every request
 * hit www.okx.com (only OKX_SITE env var / config.toml worked).
 *
 * Same class as issue #78 (--instId routed from rest[0] instead of v.instId).
 * Per CLAUDE.md "CLI Parameter Routing Tests", a flag wiring fix must come with
 * a test asserting the value flows from the named flag (v.site).
 *
 * buildLoadProfileOptions is the single helper both call sites use to build the
 * loadProfileConfig argument, so asserting on it covers both paths. If someone
 * drops `site: v.site` again, these tests fail.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLoadProfileOptions } from "../src/index.js";
import type { CliValues } from "../src/index.js";

function vals(overrides: Partial<CliValues>): CliValues {
  return overrides as CliValues;
}

describe("buildLoadProfileOptions — --site flag routing", () => {
  it("forwards v.site to loadProfileConfig options (tr)", () => {
    const opts = buildLoadProfileOptions(vals({ site: "tr" }));
    assert.equal(opts.site, "tr");
  });

  it("forwards v.site for every supported site", () => {
    for (const site of ["global", "eea", "us", "tr"]) {
      assert.equal(buildLoadProfileOptions(vals({ site })).site, site);
    }
  });

  it("leaves site undefined when the flag is absent (falls back to env/toml/default downstream)", () => {
    const opts = buildLoadProfileOptions(vals({ profile: "main" }));
    assert.equal(opts.site, undefined);
  });

  it("does not confuse site with profile", () => {
    const opts = buildLoadProfileOptions(vals({ profile: "us-demo", site: "eea" }));
    assert.equal(opts.profile, "us-demo");
    assert.equal(opts.site, "eea");
  });

  it("forwards the other named flags too (profile/demo/live/verbose)", () => {
    const opts = buildLoadProfileOptions(
      vals({ profile: "p", site: "tr", demo: true, live: false, verbose: true }),
    );
    assert.equal(opts.profile, "p");
    assert.equal(opts.demo, true);
    assert.equal(opts.live, false);
    assert.equal(opts.verbose, true);
    assert.equal(opts.sourceTag, "CLI");
  });
});
