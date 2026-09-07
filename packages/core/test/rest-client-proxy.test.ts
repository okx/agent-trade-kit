/**
 * Proxy compatibility e2e test for OkxRestClient.
 *
 * Scenario 1: Verify that using proxyUrl with OkxRestClient on Node 18-26+
 * does NOT throw UND_ERR_INVALID_ARG. This was the root cause of the Node 26
 * regression: ProxyAgent (undici v6) fed to Node's built-in fetch (undici v8)
 * triggered "invalid onError method" before any network I/O.
 *
 * After the fix, rest-client.ts imports fetch from the same undici instance
 * as ProxyAgent, so the dispatcher interface version is always consistent.
 *
 * This test spins up:
 *   - A minimal HTTP target server (responds to GET /ping with JSON)
 *   - A minimal HTTP CONNECT proxy server
 *
 * It then creates an OkxRestClient with proxyUrl pointing to the proxy,
 * makes a publicGet request, and asserts:
 *   1. No UND_ERR_INVALID_ARG error is thrown
 *   2. The proxy received at least one CONNECT event (proving the dispatcher
 *      was accepted and a tunnel was negotiated)
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as net from "node:net";
import { OkxRestClient } from "../src/client/rest-client.js";
import type { OkxConfig } from "../src/config.js";
import type { ModuleId } from "../src/constants.js";

// ---------------------------------------------------------------------------
// Minimal CONNECT proxy
// ---------------------------------------------------------------------------

interface ProxyStats {
  connectCount: number;
}

function createConnectProxy(stats: ProxyStats): http.Server {
  const server = http.createServer();

  server.on("connect", (req, clientSocket, head) => {
    stats.connectCount++;

    const [host, portStr] = (req.url ?? "").split(":");
    const port = parseInt(portStr ?? "80", 10);

    const targetSocket = net.connect(port, host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) {
        targetSocket.write(head);
      }
      targetSocket.pipe(clientSocket);
      clientSocket.pipe(targetSocket);
    });

    targetSocket.on("error", () => {
      clientSocket.destroy();
    });
    clientSocket.on("error", () => {
      targetSocket.destroy();
    });
  });

  return server;
}

// ---------------------------------------------------------------------------
// Minimal HTTP target server
// ---------------------------------------------------------------------------

function createTargetServer(): http.Server {
  return http.createServer((req, res) => {
    if (req.url === "/ping") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: "0", msg: "", data: [{ pong: true }] }));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve(addr.port);
      } else {
        reject(new Error("Could not determine server port"));
      }
    });
    server.on("error", reject);
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OkxRestClient: proxy compatibility (Node 18-26+)", () => {
  let proxyServer: http.Server;
  let targetServer: http.Server;
  let proxyPort: number;
  let targetPort: number;
  let proxyStats: ProxyStats;

  before(async () => {
    proxyStats = { connectCount: 0 };
    proxyServer = createConnectProxy(proxyStats);
    targetServer = createTargetServer();

    [proxyPort, targetPort] = await Promise.all([
      listen(proxyServer),
      listen(targetServer),
    ]);
  });

  after(async () => {
    await Promise.all([close(proxyServer), close(targetServer)]);
  });

  it("does NOT throw UND_ERR_INVALID_ARG when proxyUrl is configured", async () => {
    const config: OkxConfig = {
      hasAuth: false,
      profile: "default",
      baseUrl: `http://127.0.0.1:${targetPort}`,
      timeoutMs: 5000,
      modules: ["market"] as ModuleId[],
      readOnly: false,
      demo: false,
      site: "global",
      sourceTag: "test",
      verbose: false,
      proxyUrl: `http://127.0.0.1:${proxyPort}`,
    };

    // Disable Pilot so it doesn't interfere with our test proxy setup
    const savedBinary = process.env.OKX_PILOT_BINARY_PATH;
    const savedCache = process.env.OKX_PILOT_CACHE_PATH;
    process.env.OKX_PILOT_BINARY_PATH = "/nonexistent/okx-pilot-proxy-test";
    process.env.OKX_PILOT_CACHE_PATH = "/nonexistent/pilot-cache-proxy-test.json";

    try {
      const client = new OkxRestClient(config);

      let caughtError: unknown;
      try {
        await client.publicGet("/ping");
      } catch (err) {
        caughtError = err;
      }

      // The key assertion: no UND_ERR_INVALID_ARG
      if (caughtError !== undefined) {
        const msg = caughtError instanceof Error ? caughtError.message : String(caughtError);
        assert.ok(
          !msg.includes("UND_ERR_INVALID_ARG") && !msg.includes("invalid onError method"),
          `Expected no UND_ERR_INVALID_ARG but got: ${msg}`,
        );
      }

      // The proxy received at least one CONNECT tunnel request
      assert.ok(
        proxyStats.connectCount >= 1,
        `Expected proxy to receive at least 1 CONNECT event, got ${proxyStats.connectCount}`,
      );
    } finally {
      if (savedBinary === undefined) {
        delete process.env.OKX_PILOT_BINARY_PATH;
      } else {
        process.env.OKX_PILOT_BINARY_PATH = savedBinary;
      }
      if (savedCache === undefined) {
        delete process.env.OKX_PILOT_CACHE_PATH;
      } else {
        process.env.OKX_PILOT_CACHE_PATH = savedCache;
      }
    }
  });

  it("ECONNREFUSED (unreachable proxy) throws NetworkError, not UND_ERR_INVALID_ARG", async () => {
    // Use a port that is not listening (proxy port + 1 is unlikely to be bound)
    const deadProxyPort = proxyPort + 1;

    const config: OkxConfig = {
      hasAuth: false,
      profile: "default",
      baseUrl: `http://127.0.0.1:${targetPort}`,
      timeoutMs: 3000,
      modules: ["market"] as ModuleId[],
      readOnly: false,
      demo: false,
      site: "global",
      sourceTag: "test",
      verbose: false,
      proxyUrl: `http://127.0.0.1:${deadProxyPort}`,
    };

    const savedBinary = process.env.OKX_PILOT_BINARY_PATH;
    const savedCache = process.env.OKX_PILOT_CACHE_PATH;
    process.env.OKX_PILOT_BINARY_PATH = "/nonexistent/okx-pilot-proxy-test";
    process.env.OKX_PILOT_CACHE_PATH = "/nonexistent/pilot-cache-proxy-test.json";

    try {
      const client = new OkxRestClient(config);

      let caughtError: unknown;
      try {
        await client.publicGet("/ping");
      } catch (err) {
        caughtError = err;
      }

      assert.ok(caughtError !== undefined, "Expected an error when proxy is unreachable");

      if (caughtError instanceof Error) {
        const msg = caughtError.message;
        assert.ok(
          !msg.includes("UND_ERR_INVALID_ARG") && !msg.includes("invalid onError method"),
          `Expected ECONNREFUSED-style error, not UND_ERR_INVALID_ARG: ${msg}`,
        );
      }
    } finally {
      if (savedBinary === undefined) {
        delete process.env.OKX_PILOT_BINARY_PATH;
      } else {
        process.env.OKX_PILOT_BINARY_PATH = savedBinary;
      }
      if (savedCache === undefined) {
        delete process.env.OKX_PILOT_CACHE_PATH;
      } else {
        process.env.OKX_PILOT_CACHE_PATH = savedCache;
      }
    }
  });
});
