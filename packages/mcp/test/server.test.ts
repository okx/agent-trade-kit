import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { OkxConfig } from "@agent-tradekit/core";
import { createServer, WRITE_ACTION_PATTERN, REMEDIATION_WARNING, applyRemediationWarning } from "../src/server.js";
import { SERVER_NAME, SERVER_VERSION } from "../src/constants.js";

function makeConfig(overrides: Partial<OkxConfig> = {}): OkxConfig {
  return {
    apiKey: "test-key",
    secretKey: "test-secret",
    passphrase: "test-pass",
    hasAuth: true,
    baseUrl: "https://www.okx.com",
    timeoutMs: 15000,
    modules: ["market", "spot"],
    readOnly: false,
    demo: true,
    site: "global",
    sourceTag: "test",
    verbose: false,
    ...overrides,
  };
}

async function createTestPair(config: OkxConfig) {
  const server = createServer(config);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

describe("createServer", () => {
  it("lists tools including system_get_capabilities", async () => {
    const config = makeConfig({ modules: ["market"] });
    const { client } = await createTestPair(config);
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    assert.ok(names.includes("system_get_capabilities"), "should include capabilities tool");
    assert.ok(names.some((n) => n.startsWith("market_")), "should include market tools");
  });

  it("system_get_capabilities returns server info and module status", async () => {
    const config = makeConfig({ modules: ["market", "spot"] });
    const { client } = await createTestPair(config);
    const result = await client.callTool({ name: "system_get_capabilities", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.server.name, SERVER_NAME);
    assert.equal(payload.data.server.version, SERVER_VERSION);
    assert.equal(payload.data.capabilities.demo, true);
    assert.equal(
      payload.data.capabilities.moduleAvailability.market.status,
      "enabled",
    );
    assert.equal(
      payload.data.capabilities.moduleAvailability.swap.status,
      "disabled",
    );
  });

  it("returns error for unknown tool", async () => {
    const config = makeConfig();
    const { client } = await createTestPair(config);
    const result = await client.callTool({ name: "nonexistent_tool", arguments: {} });
    assert.equal(result.isError, true);
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    assert.ok(payload.message.includes("not available"));
  });

  it("modules without auth show requires_auth status", async () => {
    const config = makeConfig({
      hasAuth: false,
      apiKey: undefined,
      secretKey: undefined,
      passphrase: undefined,
      modules: ["market", "spot"],
    });
    const { client } = await createTestPair(config);
    const result = await client.callTool({ name: "system_get_capabilities", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    assert.equal(
      payload.data.capabilities.moduleAvailability.market.status,
      "enabled",
      "market should be enabled without auth",
    );
    assert.equal(
      payload.data.capabilities.moduleAvailability.spot.status,
      "requires_auth",
      "spot should require auth",
    );
  });

  it("disabled modules show disabled status", async () => {
    const config = makeConfig({ modules: ["market"] });
    const { client } = await createTestPair(config);
    const result = await client.callTool({ name: "system_get_capabilities", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    assert.equal(
      payload.data.capabilities.moduleAvailability.spot.status,
      "disabled",
    );
    assert.equal(
      payload.data.capabilities.moduleAvailability.spot.reasonCode,
      "MODULE_FILTERED",
    );
  });

  it("readOnly flag is reflected in capabilities", async () => {
    const config = makeConfig({ readOnly: true });
    const { client } = await createTestPair(config);
    const result = await client.callTool({ name: "system_get_capabilities", arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);
    assert.equal(payload.data.capabilities.readOnly, true);
  });

  it("server returns instructions containing remediation safeguard", async () => {
    const config = makeConfig();
    const { client } = await createTestPair(config);
    const instructions = client.getInstructions();
    assert.ok(instructions, "instructions should be defined");
    assert.ok(instructions.includes("MUST NOT automatically execute"), "should contain safeguard rule");
    assert.ok(instructions.includes("read-only tools"), "should mention read-only diagnosis");
  });
});

describe("WRITE_ACTION_PATTERN", () => {
  const shouldMatch = [
    "Cancel cross-margin TP/SL, trailing, trigger, and chase orders or stop bots before adjusting your leverage.",
    "Please cancel all pending orders and close positions before switching",
    "Stop bots before changing margin mode",
    "Please close positions first",
    "Transfer funds before proceeding with order placement",
    "Please cancel all orders and close all positions",
  ];

  const shouldNotMatch = [
    "Rate limit exceeded",
    "Insufficient balance",
    "Invalid instrument ID",
    "Leverage set: 10x BTC-USDT-SWAP",
    "Order placed successfully",
  ];

  for (const msg of shouldMatch) {
    it(`matches: "${msg.slice(0, 60)}…"`, () => {
      assert.ok(WRITE_ACTION_PATTERN.test(msg), `should match: ${msg}`);
    });
  }

  for (const msg of shouldNotMatch) {
    it(`does not match: "${msg}"`, () => {
      assert.ok(!WRITE_ACTION_PATTERN.test(msg), `should not match: ${msg}`);
    });
  }

  it("REMEDIATION_WARNING is a non-empty string", () => {
    assert.ok(REMEDIATION_WARNING.length > 0);
    assert.ok(REMEDIATION_WARNING.includes("Do NOT execute"));
  });
});

describe("applyRemediationWarning", () => {
  it("returns warning when message matches and no existing suggestion", () => {
    const result = applyRemediationWarning(undefined, "Cancel orders before adjusting");
    assert.equal(result, REMEDIATION_WARNING);
  });

  it("appends warning to existing suggestion when message matches", () => {
    const result = applyRemediationWarning("Try again.", "Please stop bots first");
    assert.equal(result, `Try again. ${REMEDIATION_WARNING}`);
  });

  it("returns original suggestion unchanged when message does not match", () => {
    assert.equal(applyRemediationWarning("Try again.", "Rate limit exceeded"), "Try again.");
  });

  it("returns undefined when no match and no existing suggestion", () => {
    assert.equal(applyRemediationWarning(undefined, "Invalid instrument"), undefined);
  });
});
