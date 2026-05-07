/**
 * Integration test for the errorResult write-action warning injection path.
 *
 * Covers: tool throws OkxApiError with write-action message
 *   → errorResult() → toToolErrorPayload() → applyRemediationWarning()
 *   → suggestion field in MCP response contains REMEDIATION_WARNING.
 *
 * Guards against shape-change regressions in toToolErrorPayload (e.g.,
 * renaming the `message` field would silently break warning injection;
 * this test catches that while the unit tests for applyRemediationWarning
 * would not).
 *
 * NOTE: This file intentionally does NOT statically import server.js.
 * node:test mock.module() only affects modules loaded AFTER the mock is
 * registered. server.test.ts has a static import of server.js which caches
 * it before any test body runs — making mock.module() ineffective there.
 * Here, `await import("../src/server.js")` is called AFTER mock.module(),
 * so server.js is loaded fresh with the mocked buildTools in effect.
 */
import { describe, it, mock, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { OkxApiError, type OkxConfig } from "@agent-tradekit/core";

function makeConfig(overrides: Partial<OkxConfig> = {}): OkxConfig {
  return {
    apiKey: "test-key",
    secretKey: "test-secret",
    passphrase: "test-pass",
    hasAuth: true,
    profile: "default",
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

describe("errorResult integration", () => {
  after(() => mock.restoreAll());

  it("injects REMEDIATION_WARNING into suggestion when OkxApiError matches write-action pattern", async () => {
    const TRIGGER_MSG = "Cancel cross-margin TP/SL orders before adjusting leverage";
    const MOCK_TOOL_NAME = "mock_write_action_tool";

    // Preserve all original @agent-tradekit/core exports so server.ts can still
    // import OkxRestClient, MODULES, toToolErrorPayload, toMcpTool, etc.
    // Only buildTools is replaced with our stub.
    const originalCore = await import("@agent-tradekit/core");
    await mock.module("@agent-tradekit/core", {
      namedExports: {
        ...originalCore,
        buildTools: () => [
          {
            name: MOCK_TOOL_NAME,
            module: "spot",
            description: "Mock tool that throws OkxApiError with write-action message",
            isWrite: false,
            inputSchema: { type: "object", additionalProperties: false },
            handler: async () => {
              throw new OkxApiError(TRIGGER_MSG);
            },
          },
        ],
      },
    });

    // Dynamic import AFTER mock.module() so server.js is loaded fresh and its
    // buildTools binding resolves to the mock above (not the real buildTools).
    const { createServer, REMEDIATION_WARNING } = await import("../src/server.js");
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await createServer(makeConfig()).connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({ name: MOCK_TOOL_NAME, arguments: {} });
    const content = result.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);

    assert.equal(result.isError, true);
    assert.ok(
      typeof payload.suggestion === "string" && payload.suggestion.includes(REMEDIATION_WARNING),
      `Expected payload.suggestion to contain REMEDIATION_WARNING, got: ${payload.suggestion}`,
    );
    assert.ok(
      payload.message.includes(TRIGGER_MSG),
      `Expected payload.message to contain trigger message, got: ${payload.message}`,
    );
  });
});
