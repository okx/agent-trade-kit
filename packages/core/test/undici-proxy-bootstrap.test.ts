/**
 * Tests for undici global proxy dispatcher bootstrap.
 *
 * Verifies that EnvHttpProxyAgent is registered as the global undici
 * dispatcher when the bootstrap module is imported, and that all three
 * proxy-routing scenarios work correctly:
 *   1. No proxy vars -> direct connection (EnvHttpProxyAgent falls through)
 *   2. HTTP_PROXY set -> requests routed through proxy (CONNECT tunnel established)
 *   3. NO_PROXY set -> target host bypasses proxy (direct connection, no CONNECT)
 *   4. HTTPS_PROXY set, HTTP_PROXY unset -> HTTP traffic goes direct
 *
 * Test-ordering note: node:test runs describe() blocks in declaration order.
 * Scenario 1's EnvHttpProxyAgent assertion relies on the bootstrap side-effect
 * firing first (see the before() comment in scenario 1). Scenarios 2, 3, and 4
 * each call setGlobalDispatcher() explicitly in their own before() hooks, so
 * they are self-contained and not sensitive to execution order relative to each
 * other or scenario 1.
 *
 * undici's ProxyAgent uses CONNECT tunneling for HTTP->HTTP proxy by default
 * (proxyTunnel=true). The mock proxy server handles CONNECT via the Node.js
 * 'connect' event (not the regular HTTP request handler).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { connect as netConnect } from "node:net";
import {
  EnvHttpProxyAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  type Dispatcher,
} from "undici";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startHttpServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

/**
 * Creates a proxy server that handles CONNECT tunneling.
 * undici ProxyAgent (proxyTunnel=true, the default) sends CONNECT for all
 * requests, including plain HTTP targets.
 */
function startConnectProxy(): Promise<{ server: Server; port: number; connectCount: () => number }> {
  return new Promise((resolve) => {
    let connects = 0;
    const server = createServer(); // no regular-HTTP handler needed for CONNECT-only

    server.on("connect", (req: IncomingMessage, clientSocket: import("node:net").Socket, head: Buffer) => {
      connects++;
      const parts = (req.url ?? "").split(":");
      const hostname = parts[0];
      const targetPort = parseInt(parts[1] ?? "80", 10);

      const targetSocket = netConnect(targetPort, hostname, () => {
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length > 0) targetSocket.write(head);
        targetSocket.pipe(clientSocket);
        clientSocket.pipe(targetSocket);
      });
      targetSocket.on("error", () => clientSocket.destroy());
      clientSocket.on("error", () => targetSocket.destroy());
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      resolve({ server, port, connectCount: () => connects });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

// ---------------------------------------------------------------------------
// Scenario 1: No proxy env → direct connection
// ---------------------------------------------------------------------------

describe("undici-proxy-bootstrap: scenario 1 — no proxy env", () => {
  let savedDispatcher: Dispatcher;
  let savedHttpsProxy: string | undefined;
  let savedHttpProxy: string | undefined;
  let savedNoProxy: string | undefined;

  before(async () => {
    savedDispatcher = getGlobalDispatcher();
    savedHttpsProxy = process.env.HTTPS_PROXY;
    savedHttpProxy = process.env.HTTP_PROXY;
    savedNoProxy = process.env.NO_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.NO_PROXY;

    // Import bootstrap — sets global dispatcher to EnvHttpProxyAgent.
    // Note: Node.js module caching makes this import idempotent after the first
    // load. Scenario 1 must run before scenarios 2/3 for the bootstrap side-effect
    // to fire here; if test order shifts, the dispatcher will already be set from
    // a prior scenario's explicit setGlobalDispatcher() call.
    await import("../src/runtime/undici-proxy-bootstrap.js");
  });

  after(() => {
    setGlobalDispatcher(savedDispatcher);
    if (savedHttpsProxy !== undefined) process.env.HTTPS_PROXY = savedHttpsProxy;
    if (savedHttpProxy !== undefined) process.env.HTTP_PROXY = savedHttpProxy;
    if (savedNoProxy !== undefined) process.env.NO_PROXY = savedNoProxy;
  });

  it("global dispatcher is an EnvHttpProxyAgent after bootstrap", () => {
    const dispatcher = getGlobalDispatcher();
    assert.ok(
      dispatcher instanceof EnvHttpProxyAgent,
      `Expected EnvHttpProxyAgent, got: ${dispatcher?.constructor?.name ?? typeof dispatcher}`,
    );
  });

  it("direct fetch succeeds when no proxy env vars are set", async () => {
    const { server, port } = await startHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("direct-ok");
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/test`);
      const body = await res.text();
      assert.equal(res.status, 200);
      assert.equal(body, "direct-ok");
    } finally {
      await stopServer(server);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: HTTP_PROXY set → requests routed through proxy via CONNECT tunnel
//
// undici ProxyAgent uses CONNECT for all connections by default (proxyTunnel=true).
// The mock proxy handles CONNECT by opening a tunnel to the actual target and
// counting the number of CONNECT requests it receives.
// ---------------------------------------------------------------------------

describe("undici-proxy-bootstrap: scenario 2 — HTTP_PROXY routing via CONNECT", () => {
  let savedDispatcher: Dispatcher;
  let savedHttpProxy: string | undefined;
  let savedNoProxy: string | undefined;
  let proxyServer: Server;
  let connectCount: () => number;
  let targetServer: Server;
  let targetPort: number;

  before(async () => {
    savedDispatcher = getGlobalDispatcher();
    savedHttpProxy = process.env.HTTP_PROXY;
    savedNoProxy = process.env.NO_PROXY;

    // Fake target server
    const target = await startHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("via-target");
    });
    targetServer = target.server;
    targetPort = target.port;

    // CONNECT-tunneling proxy — tunnels to target and counts CONNECTs
    const proxy = await startConnectProxy();
    proxyServer = proxy.server;
    connectCount = proxy.connectCount;

    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
    delete process.env.HTTPS_PROXY;
    delete process.env.NO_PROXY;

    // Re-register dispatcher with new env vars (reads proxy at construction)
    setGlobalDispatcher(new EnvHttpProxyAgent());
  });

  after(async () => {
    setGlobalDispatcher(savedDispatcher);
    if (savedHttpProxy !== undefined) {
      process.env.HTTP_PROXY = savedHttpProxy;
    } else {
      delete process.env.HTTP_PROXY;
    }
    if (savedNoProxy !== undefined) {
      process.env.NO_PROXY = savedNoProxy;
    } else {
      delete process.env.NO_PROXY;
    }
    await stopServer(proxyServer);
    await stopServer(targetServer);
  });

  it("proxy receives CONNECT and tunnels request to target when HTTP_PROXY is set", async () => {
    const countBefore = connectCount();
    const res = await fetch(`http://127.0.0.1:${targetPort}/test`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal(body, "via-target");
    assert.ok(
      connectCount() > countBefore,
      `Expected proxy to receive CONNECT request, got ${connectCount() - countBefore} CONNECTs`,
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: NO_PROXY set → target host bypasses proxy
//
// With NO_PROXY=127.0.0.1, requests to 127.0.0.1 skip the proxy entirely.
// The target responds directly (no CONNECT to the proxy server).
// ---------------------------------------------------------------------------

describe("undici-proxy-bootstrap: scenario 3 — NO_PROXY bypass", () => {
  let savedDispatcher: Dispatcher;
  let savedHttpProxy: string | undefined;
  let savedNoProxy: string | undefined;
  let proxyServer: Server;
  let connectCount: () => number;
  let targetServer: Server;
  let targetPort: number;

  before(async () => {
    savedDispatcher = getGlobalDispatcher();
    savedHttpProxy = process.env.HTTP_PROXY;
    savedNoProxy = process.env.NO_PROXY;

    // Fake target — direct response
    const target = await startHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("direct-bypass");
    });
    targetServer = target.server;
    targetPort = target.port;

    // Proxy — should NOT receive CONNECT when NO_PROXY matches
    const proxy = await startConnectProxy();
    proxyServer = proxy.server;
    connectCount = proxy.connectCount;

    process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
    delete process.env.HTTPS_PROXY;
    process.env.NO_PROXY = "127.0.0.1";

    setGlobalDispatcher(new EnvHttpProxyAgent());
  });

  after(async () => {
    setGlobalDispatcher(savedDispatcher);
    if (savedHttpProxy !== undefined) {
      process.env.HTTP_PROXY = savedHttpProxy;
    } else {
      delete process.env.HTTP_PROXY;
    }
    if (savedNoProxy !== undefined) {
      process.env.NO_PROXY = savedNoProxy;
    } else {
      delete process.env.NO_PROXY;
    }
    await stopServer(proxyServer);
    await stopServer(targetServer);
  });

  it("request bypasses proxy and reaches target directly when NO_PROXY matches", async () => {
    const countBefore = connectCount();
    const res = await fetch(`http://127.0.0.1:${targetPort}/test`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal(body, "direct-bypass");
    assert.equal(
      connectCount(),
      countBefore,
      `Expected proxy to receive 0 CONNECTs (NO_PROXY bypass), received: ${connectCount() - countBefore}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: HTTPS_PROXY set, HTTP_PROXY unset → HTTP traffic goes direct;
//             EnvHttpProxyAgent correctly differentiates the two vars.
//
// undici's EnvHttpProxyAgent routes http:// requests via HTTP_PROXY and
// https:// requests via HTTPS_PROXY. When only HTTPS_PROXY is set, plain-HTTP
// requests must reach the target directly (not through the HTTPS_PROXY).
// This guards against a common misconfiguration where HTTPS_PROXY is set but
// HTTP_PROXY is not — HTTP traffic must still succeed via direct connection.
// ---------------------------------------------------------------------------

describe("undici-proxy-bootstrap: scenario 4 - HTTPS_PROXY set, HTTP_PROXY unset", () => {
  let savedDispatcher: Dispatcher;
  let savedHttpsProxy: string | undefined;
  let savedHttpProxy: string | undefined;
  let savedNoProxy: string | undefined;
  let proxyServer: Server;
  let connectCount: () => number;
  let targetServer: Server;
  let targetPort: number;

  before(async () => {
    savedDispatcher = getGlobalDispatcher();
    savedHttpsProxy = process.env.HTTPS_PROXY;
    savedHttpProxy = process.env.HTTP_PROXY;
    savedNoProxy = process.env.NO_PROXY;

    // Direct target — plain HTTP server
    const target = await startHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("direct-http-when-only-https-proxy-set");
    });
    targetServer = target.server;
    targetPort = target.port;

    // Proxy — should NOT receive CONNECT for http:// requests when only HTTPS_PROXY is set
    const proxy = await startConnectProxy();
    proxyServer = proxy.server;
    connectCount = proxy.connectCount;

    // Set HTTPS_PROXY only — HTTP_PROXY remains unset
    process.env.HTTPS_PROXY = `http://127.0.0.1:${proxy.port}`;
    delete process.env.HTTP_PROXY;
    delete process.env.NO_PROXY;

    // Re-register dispatcher with new env vars (reads proxy at construction)
    setGlobalDispatcher(new EnvHttpProxyAgent());
  });

  after(async () => {
    setGlobalDispatcher(savedDispatcher);
    if (savedHttpsProxy !== undefined) {
      process.env.HTTPS_PROXY = savedHttpsProxy;
    } else {
      delete process.env.HTTPS_PROXY;
    }
    if (savedHttpProxy !== undefined) {
      process.env.HTTP_PROXY = savedHttpProxy;
    } else {
      delete process.env.HTTP_PROXY;
    }
    if (savedNoProxy !== undefined) {
      process.env.NO_PROXY = savedNoProxy;
    } else {
      delete process.env.NO_PROXY;
    }
    await stopServer(proxyServer);
    await stopServer(targetServer);
  });

  it("HTTP requests go direct when only HTTPS_PROXY is set (EnvHttpProxyAgent differentiates vars)", async () => {
    const countBefore = connectCount();
    const res = await fetch(`http://127.0.0.1:${targetPort}/test`);
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.equal(body, "direct-http-when-only-https-proxy-set");
    assert.equal(
      connectCount(),
      countBefore,
      `Expected 0 CONNECTs to the proxy (http:// requests must go direct when only HTTPS_PROXY is set), got ${connectCount() - countBefore}`,
    );
  });
});
