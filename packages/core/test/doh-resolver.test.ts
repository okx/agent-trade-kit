import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveDoh } from "../src/doh/resolver.js";

describe("resolveDoh (mock)", () => {
  it("returns a valid DohNode for any domain", async () => {
    const node = await resolveDoh("www.okx.com");
    assert.ok(node, "should return a node");
    assert.equal(typeof node.ip, "string");
    assert.equal(typeof node.host, "string");
    assert.equal(typeof node.ttl, "number");
    assert.ok(node.ttl > 0, "ttl should be positive");
  });

  it("returns mock data with expected values", async () => {
    const node = await resolveDoh("www.okx.com");
    assert.ok(node);
    assert.equal(node.ip, "47.242.161.22");
    assert.equal(node.host, "okexweb.qqhrss.com");
    assert.equal(node.ttl, 120);
  });

  it("returns a result regardless of input domain", async () => {
    const node = await resolveDoh("eea.okx.com");
    assert.ok(node, "mock should return data for any domain");
  });
});
