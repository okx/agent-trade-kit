/**
 * Tests for undici global proxy dispatcher bootstrap.
 *
 * The bootstrap only registers EnvHttpProxyAgent as the global undici dispatcher
 * when a proxy env var is set (gating avoids Node's ExperimentalWarning on
 * proxy-less commands). These tests cover:
 *   0. The gating decision (`hasProxyEnv` / `installEnvProxyDispatcher`)
 *   1. No proxy vars -> bootstrap registers nothing; direct connection still works
 *   2. HTTP_PROXY set -> requests routed through proxy (CONNECT tunnel established)
 *   3. NO_PROXY set -> target host bypasses proxy (direct connection, no CONNECT)
 *   4. HTTPS_PROXY set, HTTP_PROXY unset -> HTTP traffic goes direct
 *
 * Scenarios 2, 3, and 4 each call setGlobalDispatcher() explicitly in their own
 * before() hooks, so they are self-contained and not sensitive to execution
 * order. The gating tests (scenario 0) inject deps and never touch global state.
 *
 * undici's ProxyAgent uses CONNECT tunneling for HTTP->HTTP proxy by default
 * (proxyTunnel=true). The mock proxy server handles CONNECT via the Node.js
 * 'connect' event (not the regular HTTP request handler).
 *
 * Hermeticity: a file-scope before/after pair neutralises any ambient
 * HTTP_PROXY/HTTPS_PROXY/NO_PROXY and captures/restores the global undici
 * dispatcher, so this file is safe to run on CI runners that carry a corporate
 * proxy environment.
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
import {
  hasProxyEnv,
  installEnvProxyDispatcher,
} from "../src/runtime/undici-proxy-bootstrap.js";

// ---------------------------------------------------------------------------
// File-scope hermeticity: neutralise ambient proxy env and capture the global
// dispatcher before any test runs; restore both after all tests complete.
// This ensures the file is safe regardless of what the CI runner exports.
// ---------------------------------------------------------------------------

let _fileScopeDispatcher: Dispatcher;
let _fileHttpProxy: string | undefined;
let _fileHttpsProxy: string | undefined;
let _fileNoProxy: string | undefined;
let _fileHttpProxyLc: string | undefined;
let _fileHttpsProxyLc: string | undefined;
let _fileNoProxyLc: string | undefined;

before(() => {
  _fileScopeDispatcher = getGlobalDispatcher();
  _fileHttpProxy = process.env.HTTP_PROXY;
  _fileHttpsProxy = process.env.HTTPS_PROXY;
  _fileNoProxy = process.env.NO_PROXY;
  _fileHttpProxyLc = process.env.http_proxy;
  _fileHttpsProxyLc = process.env.https_proxy;
  _fileNoProxyLc = process.env.no_proxy;
  // Clear all proxy env vars at file scope — per-describe before() hooks will
  // set the values they need.
  delete process.env.HTTP_PROXY;
  delete process.env.http_proxy;
  delete process.env.HTTPS_PROXY;
  delete process.env.https_proxy;
  delete process.env.NO_PROXY;
  delete process.env.no_proxy;
});

after(() => {
  setGlobalDispatcher(_fileScopeDispatcher);
  if (_fileHttpProxy !== undefined) {
    process.env.HTTP_PROXY = _fileHttpProxy;
  } else {
    delete process.env.HTTP_PROXY;
  }
  if (_fileHttpsProxy !== undefined) {
    process.env.HTTPS_PROXY = _fileHttpsProxy;
  } else {
    delete process.env.HTTPS_PROXY;
  }
  if (_fileNoProxy !== undefined) {
    process.env.NO_PROXY = _fileNoProxy;
  } else {
    delete process.env.NO_PROXY;
  }
  if (_fileHttpProxyLc !== undefined) {
    process.env.http_proxy = _fileHttpProxyLc;
  } else {
    delete process.env.http_proxy;
  }
  if (_fileHttpsProxyLc !== undefined) {
    process.env.https_proxy = _fileHttpsProxyLc;
  } else {
    delete process.env.https_proxy;
  }
  if (_fileNoProxyLc !== undefined) {
    process.env.no_proxy = _fileNoProxyLc;
  } else {
    delete process.env.no_proxy;
  }
});

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
// Scenario 0: gating decision -- hasProxyEnv / installEnvProxyDispatcher
//
// These are pure unit tests with injected deps. They never touch the global
// dispatcher or instantiate the experimental EnvHttpProxyAgent, so they assert
// the gating logic deterministically and in isolation.
// ---------------------------------------------------------------------------

describe("undici-proxy-bootstrap: scenario 0 - gating decision", () => {
  it("hasProxyEnv is false when no proxy var is set", () => {
    assert.equal(hasProxyEnv({}), false);
  });

  for (const key of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
    it(`hasProxyEnv is true when ${key} is set`, () => {
      assert.equal(hasProxyEnv({ [key]: "http://127.0.0.1:7890" }), true);
    });
  }

  it("installEnvProxyDispatcher does not register when no proxy var is set", () => {
    let registered = false;
    const result = installEnvProxyDispatcher({
      env: {},
      register: () => {
        registered = true;
      },
    });
    assert.equal(result, false);
    assert.equal(registered, false);
  });

  it("installEnvProxyDispatcher registers when a proxy var is set", () => {
    let registered = false;
    const result = installEnvProxyDispatcher({
      env: { HTTPS_PROXY: "http://127.0.0.1:7890" },
      register: () => {
        registered = true;
      },
    });
    assert.equal(result, true);
    assert.equal(registered, true);
  });
});

// ---------------------------------------------------------------------------
// Scenario 1: No proxy env -> bootstrap registers nothing; direct fetch works
// ---------------------------------------------------------------------------

describe("undici-proxy-bootstrap: scenario 1 - no proxy env", () => {
  let savedDispatcher: Dispatcher;
  let savedHttpsProxy: string | undefined;
  let savedHttpProxy: string | undefined;
  let savedNoProxy: string | undefined;

  before(() => {
    savedDispatcher = getGlobalDispatcher();
    savedHttpsProxy = process.env.HTTPS_PROXY;
    savedHttpProxy = process.env.HTTP_PROXY;
    savedNoProxy = process.env.NO_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.NO_PROXY;
  });

  after(() => {
    setGlobalDispatcher(savedDispatcher);
    if (savedHttpsProxy !== undefined) process.env.HTTPS_PROXY = savedHttpsProxy;
    if (savedHttpProxy !== undefined) process.env.HTTP_PROXY = savedHttpProxy;
    if (savedNoProxy !== undefined) process.env.NO_PROXY = savedNoProxy;
  });

  it("does not register a dispatcher when no proxy env vars are set", () => {
    setGlobalDispatcher(savedDispatcher);
    const before = getGlobalDispatcher();
    const registered = installEnvProxyDispatcher();
    assert.equal(registered, false);
    assert.equal(getGlobalDispatcher(), before);
  });

  it("direct fetch succeeds when no proxy env vars are set", async () => {
    const { server, port } = await startHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("direct-ok");
    });

    try {
      const res = await fetch(`http://127.0.0.1:${port}/test`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = await res.text();
      assert.equal(res.status, 200);
      assert.equal(body, "direct-ok");
    } finally {
      await stopServer(server);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: HTTP_PROXY set -> requests routed through proxy via CONNECT tunnel
//
// undici ProxyAgent uses CONNECT for all connections by default (proxyTunnel=true).
// The mock proxy handles CONNECT by opening a tunnel to the actual target and
// counting the number of CONNECT requests it receives.
// ---------------------------------------------------------------------------

describe("undici-proxy-bootstrap: scenario 2 - HTTP_PROXY routing via CONNECT", () => {
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

    // CONNECT-tunneling proxy -- tunnels to target and counts CONNECTs
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
    const res = await fetch(`http://127.0.0.1:${targetPort}/test`, {
      signal: AbortSignal.timeout(5000),
    });
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
// Scenario 3: NO_PROXY set -> target host bypasses proxy
//
// With NO_PROXY=127.0.0.1, requests to 127.0.0.1 skip the proxy entirely.
// The target responds directly (no CONNECT to the proxy server).
// ---------------------------------------------------------------------------

describe("undici-proxy-bootstrap: scenario 3 - NO_PROXY bypass", () => {
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

    // Fake target -- direct response
    const target = await startHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("direct-bypass");
    });
    targetServer = target.server;
    targetPort = target.port;

    // Proxy -- should NOT receive CONNECT when NO_PROXY matches
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
    const res = await fetch(`http://127.0.0.1:${targetPort}/test`, {
      signal: AbortSignal.timeout(5000),
    });
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
// Scenario 4: HTTPS_PROXY set, HTTP_PROXY unset -> HTTP traffic goes direct;
//             EnvHttpProxyAgent correctly differentiates the two vars.
//
// undici's EnvHttpProxyAgent routes http:// requests via HTTP_PROXY and
// https:// requests via HTTPS_PROXY. When only HTTPS_PROXY is set, plain-HTTP
// requests must reach the target directly (not through the HTTPS_PROXY).
// This guards against a common misconfiguration where HTTPS_PROXY is set but
// HTTP_PROXY is not -- HTTP traffic must still succeed via direct connection.
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

    // Direct target -- plain HTTP server
    const target = await startHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("direct-http-when-only-https-proxy-set");
    });
    targetServer = target.server;
    targetPort = target.port;

    // Proxy -- should NOT receive CONNECT for http:// requests when only HTTPS_PROXY is set
    const proxy = await startConnectProxy();
    proxyServer = proxy.server;
    connectCount = proxy.connectCount;

    // Set HTTPS_PROXY only -- HTTP_PROXY remains unset
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
    const res = await fetch(`http://127.0.0.1:${targetPort}/test`, {
      signal: AbortSignal.timeout(5000),
    });
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
