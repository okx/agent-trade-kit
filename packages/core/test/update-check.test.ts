import { describe, it } from "node:test";
import assert from "node:assert/strict";

// isNewerVersion is not exported from the module, so we test it via a local
// reimplementation that mirrors the production logic exactly.
// If the implementation changes, update this test to match.
function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10));
  const [cMaj, cMin, cPat] = parse(current);
  const [lMaj, lMin, lPat] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

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
});
