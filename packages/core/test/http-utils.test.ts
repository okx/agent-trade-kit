/**
 * Unit tests for the shared HTTP download utilities (packages/core/src/utils/http.ts).
 *
 * Uses node:http.createServer for a local fake HTTP server — no external mocking libraries.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { downloadText, download } from "../src/utils/http.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "http-utils-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ---------------------------------------------------------------------------
// downloadText
// ---------------------------------------------------------------------------

describe("downloadText", () => {
  it("resolves with response body on HTTP 200", async () => {
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello");
    });

    try {
      const text = await downloadText(`http://127.0.0.1:${port}/file.txt`, 5000);
      assert.equal(text, "hello");
    } finally {
      await stopServer(server);
    }
  });

  it("rejects with HTTP status message on non-200 response", async () => {
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(404);
      res.end("Not Found");
    });

    try {
      await assert.rejects(
        () => downloadText(`http://127.0.0.1:${port}/missing`, 5000),
        (err: Error) => {
          assert.ok(err.message.includes("404"), `expected message to contain '404', got: ${err.message}`);
          return true;
        },
      );
    } finally {
      await stopServer(server);
    }
  });

  it("follows a 301 redirect to the final URL", async () => {
    const { server, port } = await startServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === "/redirect-me") {
        res.writeHead(301, { Location: `http://127.0.0.1:${port}/final` });
        res.end();
        return;
      }
      if (req.url === "/final") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("redirected");
        return;
      }
      res.writeHead(404);
      res.end();
    });

    try {
      const text = await downloadText(`http://127.0.0.1:${port}/redirect-me`, 5000);
      assert.equal(text, "redirected");
    } finally {
      await stopServer(server);
    }
  });

  it("rejects when timeout fires before server responds", async () => {
    const { server, port } = await startServer((_req, _res) => {
      // deliberately never respond
    });

    try {
      await assert.rejects(
        () => downloadText(`http://127.0.0.1:${port}/hang`, 50),
        (err: Error) => {
          assert.ok(
            /timed out/i.test(err.message),
            `expected 'timed out' in message, got: ${err.message}`,
          );
          return true;
        },
      );
    } finally {
      await stopServer(server);
    }
  });
});

// ---------------------------------------------------------------------------
// download (to file)
// ---------------------------------------------------------------------------

describe("download", () => {
  it("writes response body to destPath", async () => {
    const content = Buffer.from("binary-payload-12345");
    const { server, port } = await startServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(content);
    });

    try {
      const destPath = join(tempDir, "output.bin");
      await download(`http://127.0.0.1:${port}/binary`, destPath, 5000);
      const written = readFileSync(destPath);
      assert.deepEqual(written, content);
    } finally {
      await stopServer(server);
    }
  });
});
