import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { OkxConfig } from "@agent-tradekit/core";
import { createServer } from "../src/server.js";
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
});
