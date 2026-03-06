/**
 * Unit tests for cmdConfigInit helper functions.
 *
 * Tests the pure-logic helpers extracted from the interactive wizard:
 * - parseSiteKey: maps raw user input to site key
 * - buildApiUrl: constructs the targeted API creation URL
 * - buildProfileEntry: builds the profile object saved to config
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSiteKey, buildApiUrl, buildProfileEntry } from "../src/commands/config.js";
import { OKX_SITES as SITES } from "@agent-tradekit/core";

describe("parseSiteKey", () => {
  it('returns "global" for empty input', () => {
    assert.equal(parseSiteKey(""), "global");
  });

  it('returns "global" for input "1"', () => {
    assert.equal(parseSiteKey("1"), "global");
  });

  it('returns "eea" for input "2"', () => {
    assert.equal(parseSiteKey("2"), "eea");
  });

  it('returns "us" for input "3"', () => {
    assert.equal(parseSiteKey("3"), "us");
  });

  it('returns "global" for unrecognised input', () => {
    assert.equal(parseSiteKey("99"), "global");
  });
});

describe("buildApiUrl", () => {
  it("builds demo URL for global site", () => {
    const url = buildApiUrl("global", true);
    assert.equal(url, "https://www.okx.com/account/my-api?go-demo-trading=1");
  });

  it("builds live URL for global site", () => {
    const url = buildApiUrl("global", false);
    assert.equal(url, "https://www.okx.com/account/my-api?go-live-trading=1");
  });

  it("builds demo URL for EEA site", () => {
    const url = buildApiUrl("eea", true);
    assert.equal(url, "https://my.okx.com/account/my-api?go-demo-trading=1");
  });

  it("builds live URL for US site", () => {
    const url = buildApiUrl("us", false);
    assert.equal(url, "https://app.okx.com/account/my-api?go-live-trading=1");
  });

  it("URL base matches SITES constant for each key", () => {
    for (const key of Object.keys(SITES) as Array<keyof typeof SITES>) {
      const url = buildApiUrl(key, true);
      assert.ok(url.startsWith(SITES[key].webUrl), `${key}: URL should start with ${SITES[key].webUrl}`);
    }
  });
});

describe("buildProfileEntry", () => {
  it("omits base_url for global site", () => {
    const entry = buildProfileEntry("global", "ak", "sk", "pp", false);
    assert.equal(entry.api_key, "ak");
    assert.equal(entry.secret_key, "sk");
    assert.equal(entry.passphrase, "pp");
    assert.equal(entry.demo, false);
    assert.equal(entry.base_url, undefined);
  });

  it("sets base_url to EEA webUrl for eea site", () => {
    const entry = buildProfileEntry("eea", "ak", "sk", "pp", true);
    assert.equal(entry.base_url, SITES.eea.webUrl);
    assert.equal(entry.demo, true);
  });

  it("sets base_url to US webUrl for us site", () => {
    const entry = buildProfileEntry("us", "ak", "sk", "pp", false);
    assert.equal(entry.base_url, SITES.us.webUrl);
  });

  it("demo flag is preserved correctly", () => {
    const live = buildProfileEntry("global", "a", "b", "c", false);
    const demo = buildProfileEntry("global", "a", "b", "c", true);
    assert.equal(live.demo, false);
    assert.equal(demo.demo, true);
  });
});
