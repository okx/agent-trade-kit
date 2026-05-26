/**
 * Unit tests for the okx-auth binary installer.
 *
 * Mirrors the pilot-installer.test.ts pattern: filesystem operations are tested
 * via temp directories and HTTP operations via a mock server on port 0.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir, platform } from "node:os";
import { createHash } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
  getAuthBinaryName,
  getAuthStatus,
  fetchAuthCdnChecksum,
  installAuthBinary,
  removeAuthBinary,
  _resolveAuthPlatformFromNative,
  LINUX_ARM64_FALLBACK_DIR,
} from "../src/auth/installer.js";
import { getPlatformDir, hashFile } from "../src/pilot/installer.js";
import type { AuthLocalStatus } from "../src/auth/installer-types.js";
import type { InstallResult, RemoveResult } from "../src/pilot/installer-types.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "auth-installer-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getAuthBinaryName
// ---------------------------------------------------------------------------

describe("getAuthBinaryName", () => {
  it("returns a non-empty string", () => {
    const name = getAuthBinaryName();
    assert.ok(name.length > 0);
  });

  it("returns .exe on win32, plain name otherwise", () => {
    const name = getAuthBinaryName();
    if (platform() === "win32") {
      assert.ok(name.endsWith(".exe"), "should end with .exe on Windows");
    } else {
      assert.equal(name, "okx-auth");
    }
  });
});

// ---------------------------------------------------------------------------
// getAuthStatus
// ---------------------------------------------------------------------------

describe("getAuthStatus", () => {
  it("returns exists=false when binary is absent", () => {
    const binaryPath = join(tempDir, "nonexistent-binary");
    const status: AuthLocalStatus = getAuthStatus(binaryPath);
    assert.equal(status.binaryPath, binaryPath);
    assert.equal(status.exists, false);
    assert.equal(status.fileSize, undefined);
    assert.equal(status.sha256, undefined);
  });

  it("returns exists=true with size and sha256 when binary is present", () => {
    const binaryPath = join(tempDir, "okx-auth");
    writeFileSync(binaryPath, Buffer.from("fake-binary-content"));
    const status: AuthLocalStatus = getAuthStatus(binaryPath);
    assert.equal(status.exists, true);
    assert.equal(status.binaryPath, binaryPath);
    assert.ok(typeof status.fileSize === "number" && status.fileSize > 0);
    assert.ok(typeof status.sha256 === "string" && status.sha256.length === 64);
  });

  it("includes platform in the result", () => {
    const binaryPath = join(tempDir, "okx-auth");
    writeFileSync(binaryPath, Buffer.from("content"));
    const status: AuthLocalStatus = getAuthStatus(binaryPath);
    assert.ok(status.platform === null || typeof status.platform === "string");
  });

  it("returns exists=true but no fileSize/sha256 when skipHash is true", () => {
    const binaryPath = join(tempDir, "okx-auth");
    writeFileSync(binaryPath, Buffer.from("skip-hash-content"));
    const status: AuthLocalStatus = getAuthStatus(binaryPath, { skipHash: true });
    assert.equal(status.exists, true);
    assert.equal(status.binaryPath, binaryPath);
    assert.equal(status.fileSize, undefined, "fileSize should be undefined with skipHash");
    assert.equal(status.sha256, undefined, "sha256 should be undefined with skipHash");
  });

  it("returns sha256 when skipHash is false (explicit default)", () => {
    const binaryPath = join(tempDir, "okx-auth");
    writeFileSync(binaryPath, Buffer.from("explicit-no-skip"));
    const status: AuthLocalStatus = getAuthStatus(binaryPath, { skipHash: false });
    assert.equal(status.exists, true);
    assert.ok(typeof status.sha256 === "string" && status.sha256.length === 64);
    assert.ok(typeof status.fileSize === "number" && status.fileSize > 0);
  });

  it("returns exists=false with no hash when binary absent and skipHash is true", () => {
    const binaryPath = join(tempDir, "nonexistent");
    const status: AuthLocalStatus = getAuthStatus(binaryPath, { skipHash: true });
    assert.equal(status.exists, false);
    assert.equal(status.fileSize, undefined);
    assert.equal(status.sha256, undefined);
  });
});

// ---------------------------------------------------------------------------
// removeAuthBinary
// ---------------------------------------------------------------------------

describe("removeAuthBinary", () => {
  it("returns status=removed when binary exists", () => {
    const binaryPath = join(tempDir, "okx-auth");
    writeFileSync(binaryPath, Buffer.from("fake"));
    const result: RemoveResult = removeAuthBinary(binaryPath);
    assert.equal(result.status, "removed");
    assert.equal(existsSync(binaryPath), false);
  });

  it("returns status=not-found when binary does not exist", () => {
    const binaryPath = join(tempDir, "nonexistent");
    const result: RemoveResult = removeAuthBinary(binaryPath);
    assert.equal(result.status, "not-found");
  });
});

// ---------------------------------------------------------------------------
// installAuthBinary — edge cases
// ---------------------------------------------------------------------------

describe("installAuthBinary", () => {
  it("returns status=failed when no CDN sources provided (empty list)", async () => {
    const destPath = join(tempDir, "okx-auth");
    const result: InstallResult = await installAuthBinary(destPath, []);
    assert.equal(result.status, "failed");
    assert.ok(typeof result.error === "string");
  });

  it("returns up-to-date when OKX_AUTH_BIN env is set and no destPath provided", async () => {
    const savedEnv = process.env.OKX_AUTH_BIN;
    try {
      process.env.OKX_AUTH_BIN = "/some/custom/path";
      const result: InstallResult = await installAuthBinary(undefined, []);
      assert.equal(result.status, "up-to-date");
      assert.equal(result.source, "(env override)");
    } finally {
      if (savedEnv === undefined) {
        delete process.env.OKX_AUTH_BIN;
      } else {
        process.env.OKX_AUTH_BIN = savedEnv;
      }
    }
  });

  it("env override is bypassed when destPath is explicitly provided", async () => {
    const savedEnv = process.env.OKX_AUTH_BIN;
    try {
      process.env.OKX_AUTH_BIN = "/some/custom/path";
      const destPath = join(tempDir, "okx-auth");
      const result: InstallResult = await installAuthBinary(destPath, []);
      assert.equal(result.status, "failed");
    } finally {
      if (savedEnv === undefined) {
        delete process.env.OKX_AUTH_BIN;
      } else {
        process.env.OKX_AUTH_BIN = savedEnv;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// fetchAuthCdnChecksum — mock HTTP server
// ---------------------------------------------------------------------------

describe("fetchAuthCdnChecksum", () => {
  const platformDir = getPlatformDir();
  let server: Server;
  let serverPort: number;
  let checksumResponse: Record<string, unknown> | null = null;

  beforeEach(async () => {
    checksumResponse = {
      sha256: "abc123",
      size: 1024,
      target: platformDir,
    };

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? "";
      if (url.includes("checksum.json")) {
        if (checksumResponse) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(checksumResponse));
        } else {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("returns valid CdnChecksum from mock server", async () => {
    if (!platformDir) return;
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await fetchAuthCdnChecksum(sources, 5_000);
    assert.ok(result !== null);
    assert.equal(result!.sha256, "abc123");
    assert.equal(result!.size, 1024);
    assert.equal(result!.target, platformDir);
    assert.equal(result!.source, `127.0.0.1:${serverPort}`);
  });

  it("returns null when all CDN sources fail (500)", async () => {
    if (!platformDir) return;
    checksumResponse = null;
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await fetchAuthCdnChecksum(sources, 5_000);
    assert.equal(result, null);
  });

  it("returns null when checksum.json has missing fields", async () => {
    if (!platformDir) return;
    checksumResponse = { foo: "bar" };
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await fetchAuthCdnChecksum(sources, 5_000);
    assert.equal(result, null);
  });

  it("returns null for empty sources array", async () => {
    const result = await fetchAuthCdnChecksum([], 5_000);
    assert.equal(result, null);
  });

  it("falls through to next source on first failure", async () => {
    if (!platformDir) return;
    // First source is on a port no server listens on, second is our mock
    const badPort = serverPort + 10000 > 65535 ? serverPort - 1000 : serverPort + 10000;
    const sources = [
      { host: `127.0.0.1:${badPort}`, protocol: "http" as const },
      { host: `127.0.0.1:${serverPort}`, protocol: "http" as const },
    ];
    const result = await fetchAuthCdnChecksum(sources, 3_000);
    assert.ok(result !== null);
    assert.equal(result!.source, `127.0.0.1:${serverPort}`);
  });
});

// ---------------------------------------------------------------------------
// installAuthBinary — mock HTTP server tests
// ---------------------------------------------------------------------------

describe("installAuthBinary with mock CDN server", () => {
  let server: Server;
  let serverPort: number;
  const binaryContent = Buffer.from("fake-auth-binary-content-for-testing");
  const binaryHash = createHash("sha256").update(binaryContent).digest("hex");
  const binarySize = binaryContent.byteLength;
  const platformDir = getPlatformDir();

  let checksumResponse: Record<string, unknown> | null = null;
  let serveBinary = true;

  beforeEach(async () => {
    checksumResponse = {
      sha256: binaryHash,
      size: binarySize,
      target: platformDir,
    };
    serveBinary = true;

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? "";

      if (url.includes("checksum.json")) {
        if (checksumResponse) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(checksumResponse));
        } else {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
        return;
      }

      if (url.includes("okx-auth")) {
        if (serveBinary) {
          res.writeHead(200, { "Content-Type": "application/octet-stream" });
          res.end(binaryContent);
        } else {
          res.writeHead(500);
          res.end("Binary not available");
        }
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("fresh install - downloads and verifies binary", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-auth");
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const progress: string[] = [];

    const result = await installAuthBinary(destPath, sources, (msg) => progress.push(msg));

    assert.equal(result.status, "installed");
    assert.equal(result.source, `127.0.0.1:${serverPort}`);
    assert.ok(existsSync(destPath), "binary should exist after install");

    const installed = readFileSync(destPath);
    const installedHash = createHash("sha256").update(installed).digest("hex");
    assert.equal(installedHash, binaryHash);

    assert.ok(progress.length > 0, "should have emitted progress messages");
  });

  it("up-to-date - existing binary matches CDN checksum", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-auth");
    writeFileSync(destPath, binaryContent);

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installAuthBinary(destPath, sources);

    assert.equal(result.status, "up-to-date");
    assert.equal(result.source, `127.0.0.1:${serverPort}`);
  });

  it("checksum mismatch - returns failed when CDN serves wrong checksum", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-auth");

    checksumResponse = {
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      size: binarySize,
      target: platformDir,
    };

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installAuthBinary(destPath, sources);

    assert.equal(result.status, "failed");
    assert.ok(result.error?.includes("SHA-256 mismatch"), `expected SHA-256 mismatch error, got: ${result.error}`);
  });

  it("size mismatch - returns failed when CDN reports wrong size", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-auth");

    checksumResponse = {
      sha256: binaryHash,
      size: binarySize + 999,
      target: platformDir,
    };

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installAuthBinary(destPath, sources);

    assert.equal(result.status, "failed");
    assert.ok(result.error?.includes("Size mismatch"), `expected size mismatch error, got: ${result.error}`);
  });

  it("invalid checksum.json - missing fields", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-auth");

    checksumResponse = { foo: "bar" };

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installAuthBinary(destPath, sources);

    assert.equal(result.status, "failed");
  });

  it("CDN returns 500 for checksum - falls through to failure", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-auth");

    checksumResponse = null;

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installAuthBinary(destPath, sources);

    assert.equal(result.status, "failed");
    assert.ok(typeof result.error === "string");
  });

  it("binary download fails - returns failed", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-auth");

    serveBinary = false;

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installAuthBinary(destPath, sources);

    assert.equal(result.status, "failed");
  });

  it("target mismatch in checksum.json - returns failed", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-auth");

    checksumResponse = {
      sha256: binaryHash,
      size: binarySize,
      target: "unsupported-platform-xyz",
    };

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installAuthBinary(destPath, sources);

    assert.equal(result.status, "failed");
    assert.ok(result.error?.includes("Target mismatch") || result.error?.includes("mismatch"));
  });

  it("cleans up .tmp file on download failure", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-auth");
    const tmpPath = destPath + ".tmp";

    serveBinary = false;

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    await installAuthBinary(destPath, sources);

    assert.equal(existsSync(tmpPath), false, ".tmp file should be cleaned up");
  });
});

// ---------------------------------------------------------------------------
// _resolveAuthPlatformFromNative — linux-arm64 CDN probe logic
// ---------------------------------------------------------------------------

describe("_resolveAuthPlatformFromNative", () => {
  let server: Server;
  let serverPort: number;
  let arm64Behavior: "200" | "404" | "network-error";
  const warnMessages: string[] = [];
  const originalWarn = console.warn.bind(console);

  beforeEach(async () => {
    arm64Behavior = "200";
    warnMessages.length = 0;
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
    };

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? "";
      if (url.includes("linux-arm64")) {
        if (arm64Behavior === "200") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ sha256: "abc", size: 100, target: "linux-arm64" }));
        } else if (arm64Behavior === "404") {
          res.writeHead(404);
          res.end("Not Found");
        } else {
          // network-error: destroy the socket abruptly
          req.socket.destroy();
        }
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sha256: "abc", size: 100, target: "linux-x64" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    console.warn = originalWarn;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("scenario 1: linux-arm64 + CDN 404 → returns linux-x64, warns once about emulation", async () => {
    arm64Behavior = "404";
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await _resolveAuthPlatformFromNative("linux-arm64", sources, 5_000);
    assert.equal(result, LINUX_ARM64_FALLBACK_DIR);
    assert.equal(warnMessages.length, 1, "should warn exactly once");
    assert.ok(
      warnMessages[0].toLowerCase().includes("emulat"),
      `warn message should mention emulation, got: ${warnMessages[0]}`,
    );
  });

  it("scenario 2: linux-arm64 + CDN 200 → returns linux-arm64 (native binary exists)", async () => {
    arm64Behavior = "200";
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await _resolveAuthPlatformFromNative("linux-arm64", sources, 5_000);
    assert.equal(result, "linux-arm64");
    assert.equal(warnMessages.length, 0, "no warn when native binary exists");
  });

  it("scenario 3: linux-arm64 + all network errors → returns linux-arm64 (conservative)", async () => {
    arm64Behavior = "network-error";
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await _resolveAuthPlatformFromNative("linux-arm64", sources, 5_000);
    assert.equal(result, "linux-arm64");
    assert.equal(warnMessages.length, 0, "no warn when CDN is unreachable");
  });

  it("scenario 4: darwin-arm64 → returns native immediately, no probe", async () => {
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await _resolveAuthPlatformFromNative("darwin-arm64", sources, 5_000);
    assert.equal(result, "darwin-arm64");
    assert.equal(warnMessages.length, 0);
  });

  it("scenario 4: linux-x64 → returns native immediately, no probe", async () => {
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await _resolveAuthPlatformFromNative("linux-x64", sources, 5_000);
    assert.equal(result, "linux-x64");
    assert.equal(warnMessages.length, 0);
  });

  it("scenario 4: win32-x64 → returns native immediately, no probe", async () => {
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await _resolveAuthPlatformFromNative("win32-x64", sources, 5_000);
    assert.equal(result, "win32-x64");
    assert.equal(warnMessages.length, 0);
  });
});

// ---------------------------------------------------------------------------
// installAuthBinary — improved error messages
// ---------------------------------------------------------------------------

describe("installAuthBinary - improved error messages", () => {
  let server: Server;
  let serverPort: number;
  let responseMode: "all-404" | "all-network-error";

  beforeEach(async () => {
    responseMode = "all-404";

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (responseMode === "all-404") {
        res.writeHead(404);
        res.end("Not Found");
      } else {
        req.socket.destroy();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("scenario 6: all HTTP 404 → error message contains 'not available' or 'not supported'", async () => {
    const destPath = join(tempDir, "okx-auth");
    // Use a real platform dir to bypass the null-guard
    const platformDir = getPlatformDir();
    if (!platformDir) return;

    responseMode = "all-404";
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installAuthBinary(destPath, sources);

    assert.equal(result.status, "failed");
    const err = result.error?.toLowerCase() ?? "";
    assert.ok(
      err.includes("not available") || err.includes("not supported"),
      `expected 'not available' or 'not supported' in error, got: ${result.error}`,
    );
  });

  it("scenario 7: all network errors → error preserves 'All CDN sources failed' format", async () => {
    const destPath = join(tempDir, "okx-auth");
    const platformDir = getPlatformDir();
    if (!platformDir) return;

    responseMode = "all-network-error";
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installAuthBinary(destPath, sources);

    assert.equal(result.status, "failed");
    assert.ok(
      result.error?.includes("All CDN sources failed"),
      `expected 'All CDN sources failed', got: ${result.error}`,
    );
  });
});
