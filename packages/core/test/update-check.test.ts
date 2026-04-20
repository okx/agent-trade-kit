import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isNewerVersion } from "../src/utils/update-check.js";

describe("isNewerVersion", () => {
  it("returns true when major is bumped", () => {
    assert.equal(isNewerVersion("1.0.0", "2.0.0"), true);
  });

  it("returns false when latest major is lower", () => {
    assert.equal(isNewerVersion("2.0.0", "1.9.9"), false);
  });

  it("returns true when minor is bumped (same major)", () => {
    assert.equal(isNewerVersion("1.0.0", "1.1.0"), true);
  });

  it("returns false when latest minor is lower", () => {
    assert.equal(isNewerVersion("1.5.0", "1.4.9"), false);
  });

  it("returns true when patch is bumped (same major.minor)", () => {
    assert.equal(isNewerVersion("1.0.0", "1.0.1"), true);
  });

  it("returns false when versions are equal", () => {
    assert.equal(isNewerVersion("1.0.1", "1.0.1"), false);
  });

  it("returns false when current is newer", () => {
    assert.equal(isNewerVersion("1.0.2", "1.0.1"), false);
  });

  it("handles v-prefix in version strings", () => {
    assert.equal(isNewerVersion("v1.0.0", "v1.0.1"), true);
    assert.equal(isNewerVersion("v1.2.3", "v1.2.3"), false);
  });

  it("handles double-digit versions correctly", () => {
    assert.equal(isNewerVersion("1.9.0", "1.10.0"), true);
    assert.equal(isNewerVersion("1.10.0", "1.9.99"), false);
  });

  // Prerelease suffix behaviour (parseInt strips "-beta.x" naturally)
  it("treats prerelease as equal to same numeric stable (beta suffix stripped by parseInt)", () => {
    // "1.2.8-beta.2" → parsed patch = parseInt("8-beta") = 8; same as "1.2.8"
    assert.equal(isNewerVersion("1.2.8-beta.2", "1.2.8"), false);
    assert.equal(isNewerVersion("1.2.8", "1.2.8-beta.2"), false);
  });

  it("detects upgrade from stable to next minor even if current is prerelease", () => {
    assert.equal(isNewerVersion("1.2.8-beta.2", "1.2.9"), true);
  });

  it("detects upgrade from older stable to prerelease of newer minor (--beta path)", () => {
    assert.equal(isNewerVersion("1.2.7", "1.2.8-beta.2"), true);
  });
});
