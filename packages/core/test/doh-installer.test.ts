import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  chmodSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir, platform } from "node:os";
import { createHash } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
  getDohStatus,
  hashFile,
  removeDohBinary,
  installDohBinary,
  getPlatformDir,
  getBinaryName,
} from "../src/doh/installer.js";
import type { DohLocalStatus, InstallResult, RemoveResult } from "../src/doh/installer-types.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "doh-installer-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// hashFile
// ---------------------------------------------------------------------------

describe("hashFile", () => {
  it("computes correct size and sha256 for a known buffer", () => {
    const filePath = join(tempDir, "test.bin");
    // Write 4 zero bytes
    writeFileSync(filePath, Buffer.alloc(4));
    const { size, sha256 } = hashFile(filePath);
    assert.equal(size, 4);
    // SHA-256 of 4 zero bytes (hex)
    assert.equal(sha256, "df3f619804a92fdb4057192dc43dd748ea778adc52bc498ce80524c014b81119");
  });

  it("returns consistent results on repeated calls", () => {
    const filePath = join(tempDir, "test2.bin");
    writeFileSync(filePath, Buffer.from("hello world"));
    const r1 = hashFile(filePath);
    const r2 = hashFile(filePath);
    assert.equal(r1.sha256, r2.sha256);
    assert.equal(r1.size, r2.size);
  });
});

// ---------------------------------------------------------------------------
// getPlatformDir
// ---------------------------------------------------------------------------

describe("getPlatformDir", () => {
  it("returns a string on supported platforms (darwin/linux/win32)", () => {
    const dir = getPlatformDir();
    // On CI / local machines this should be non-null (darwin-arm64, linux-x64, etc.)
    if (dir !== null) {
      assert.ok(dir.includes("-"), "platform dir should contain a dash, e.g. darwin-arm64");
    }
  });

  it("result is consistent across calls", () => {
    const a = getPlatformDir();
    const b = getPlatformDir();
    assert.equal(a, b);
  });
});

// ---------------------------------------------------------------------------
// getBinaryName
// ---------------------------------------------------------------------------

describe("getBinaryName", () => {
  it("returns a non-empty string", () => {
    const name = getBinaryName();
    assert.ok(name.length > 0);
  });

  it("returns .exe on win32, plain name otherwise", () => {
    const name = getBinaryName();
    if (platform() === "win32") {
      assert.ok(name.endsWith(".exe"), "should end with .exe on Windows");
    } else {
      assert.equal(name, "okx-pilot");
    }
  });
});

// ---------------------------------------------------------------------------
// getDohStatus
// ---------------------------------------------------------------------------

describe("getDohStatus", () => {
  it("returns exists=false when binary is absent", () => {
    const binaryPath = join(tempDir, "nonexistent-binary");
    const status: DohLocalStatus = getDohStatus(binaryPath);
    assert.equal(status.binaryPath, binaryPath);
    assert.equal(status.exists, false);
    assert.equal(status.fileSize, undefined);
    assert.equal(status.sha256, undefined);
  });

  it("returns exists=true with size and sha256 when binary is present", () => {
    const binaryPath = join(tempDir, "okx-pilot");
    writeFileSync(binaryPath, Buffer.from("fake-binary-content"));
    const status: DohLocalStatus = getDohStatus(binaryPath);
    assert.equal(status.exists, true);
    assert.equal(status.binaryPath, binaryPath);
    assert.ok(typeof status.fileSize === "number" && status.fileSize > 0);
    assert.ok(typeof status.sha256 === "string" && status.sha256.length === 64);
  });

  it("includes platform in the result", () => {
    const binaryPath = join(tempDir, "okx-pilot");
    writeFileSync(binaryPath, Buffer.from("content"));
    const status: DohLocalStatus = getDohStatus(binaryPath);
    // platform can be null on unsupported systems, otherwise a string
    assert.ok(status.platform === null || typeof status.platform === "string");
  });

  it("returns exists=true but no fileSize/sha256 when skipHash is true", () => {
    const binaryPath = join(tempDir, "okx-pilot");
    writeFileSync(binaryPath, Buffer.from("skip-hash-content"));
    const status: DohLocalStatus = getDohStatus(binaryPath, { skipHash: true });
    assert.equal(status.exists, true);
    assert.equal(status.binaryPath, binaryPath);
    assert.equal(status.fileSize, undefined, "fileSize should be undefined with skipHash");
    assert.equal(status.sha256, undefined, "sha256 should be undefined with skipHash");
    assert.ok(status.platform === null || typeof status.platform === "string");
  });

  it("returns sha256 when skipHash is false (explicit default)", () => {
    const binaryPath = join(tempDir, "okx-pilot");
    writeFileSync(binaryPath, Buffer.from("explicit-no-skip"));
    const status: DohLocalStatus = getDohStatus(binaryPath, { skipHash: false });
    assert.equal(status.exists, true);
    assert.ok(typeof status.sha256 === "string" && status.sha256.length === 64);
    assert.ok(typeof status.fileSize === "number" && status.fileSize > 0);
  });

  it("returns exists=false with no hash when binary absent and skipHash is true", () => {
    const binaryPath = join(tempDir, "nonexistent");
    const status: DohLocalStatus = getDohStatus(binaryPath, { skipHash: true });
    assert.equal(status.exists, false);
    assert.equal(status.fileSize, undefined);
    assert.equal(status.sha256, undefined);
  });
});

// ---------------------------------------------------------------------------
// removeDohBinary
// ---------------------------------------------------------------------------

describe("removeDohBinary", () => {
  it("returns status=removed when binary exists", () => {
    const binaryPath = join(tempDir, "okx-pilot");
    writeFileSync(binaryPath, Buffer.from("fake"));
    const result: RemoveResult = removeDohBinary(binaryPath);
    assert.equal(result.status, "removed");
    assert.equal(existsSync(binaryPath), false);
  });

  it("returns status=not-found when binary does not exist", () => {
    const binaryPath = join(tempDir, "nonexistent");
    const result: RemoveResult = removeDohBinary(binaryPath);
    assert.equal(result.status, "not-found");
  });
});

// ---------------------------------------------------------------------------
// installDohBinary — edge cases
// ---------------------------------------------------------------------------

describe("installDohBinary", () => {
  it("returns status=failed when no CDN sources provided (empty list)", async () => {
    const destPath = join(tempDir, "okx-pilot");
    // Pass an empty CDN list to simulate all CDN sources unavailable
    const result: InstallResult = await installDohBinary(destPath, []);
    assert.equal(result.status, "failed");
    assert.ok(typeof result.error === "string");
  });

  it("returns up-to-date when OKX_DOH_BINARY_PATH env is set and no destPath provided", async () => {
    const savedEnv = process.env.OKX_DOH_BINARY_PATH;
    try {
      process.env.OKX_DOH_BINARY_PATH = "/some/custom/path";
      // Pass undefined destPath so installPreChecks sees the env override
      const result: InstallResult = await installDohBinary(undefined, []);
      assert.equal(result.status, "up-to-date");
      assert.equal(result.source, "(env override)");
    } finally {
      if (savedEnv === undefined) {
        delete process.env.OKX_DOH_BINARY_PATH;
      } else {
        process.env.OKX_DOH_BINARY_PATH = savedEnv;
      }
    }
  });

  it("env override is bypassed when destPath is explicitly provided", async () => {
    const savedEnv = process.env.OKX_DOH_BINARY_PATH;
    try {
      process.env.OKX_DOH_BINARY_PATH = "/some/custom/path";
      const destPath = join(tempDir, "okx-pilot");
      // With destPath provided, env override should be ignored; empty sources -> failed
      const result: InstallResult = await installDohBinary(destPath, []);
      assert.equal(result.status, "failed");
    } finally {
      if (savedEnv === undefined) {
        delete process.env.OKX_DOH_BINARY_PATH;
      } else {
        process.env.OKX_DOH_BINARY_PATH = savedEnv;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// installDohBinary — mock HTTP server tests
// ---------------------------------------------------------------------------

describe("installDohBinary with mock CDN server", () => {
  let server: Server;
  let serverPort: number;
  // Content for the fake binary
  const binaryContent = Buffer.from("fake-doh-binary-content-for-testing");
  const binaryHash = createHash("sha256").update(binaryContent).digest("hex");
  const binarySize = binaryContent.byteLength;
  const platformDir = getPlatformDir();

  // Serve configurable responses
  let checksumResponse: Record<string, unknown> | null = null;
  let serveBinary = true;

  beforeEach(async () => {
    // Reset defaults
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

      if (url.includes("okx-pilot")) {
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

  // Skip all server tests if platform is unsupported (platformDir is null)
  it("fresh install — downloads and verifies binary", async () => {
    if (!platformDir) return; // skip on unsupported platform
    const destPath = join(tempDir, "okx-pilot");
    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const progress: string[] = [];

    const result = await installDohBinary(destPath, sources, (msg) => progress.push(msg));

    assert.equal(result.status, "installed");
    assert.equal(result.source, `127.0.0.1:${serverPort}`);
    assert.ok(existsSync(destPath), "binary should exist after install");

    // Verify file content
    const installed = readFileSync(destPath);
    const installedHash = createHash("sha256").update(installed).digest("hex");
    assert.equal(installedHash, binaryHash);

    // Verify progress messages were emitted
    assert.ok(progress.length > 0, "should have emitted progress messages");
  });

  it("up-to-date — existing binary matches CDN checksum", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-pilot");
    // Pre-write the correct binary content
    writeFileSync(destPath, binaryContent);

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installDohBinary(destPath, sources);

    assert.equal(result.status, "up-to-date");
    assert.equal(result.source, `127.0.0.1:${serverPort}`);
  });

  it("checksum mismatch — returns failed when CDN serves wrong checksum", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-pilot");

    // Set checksum to a wrong value so the downloaded binary won't match
    checksumResponse = {
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
      size: binarySize,
      target: platformDir,
    };

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installDohBinary(destPath, sources);

    assert.equal(result.status, "failed");
    assert.ok(result.error?.includes("SHA-256 mismatch"), `expected SHA-256 mismatch error, got: ${result.error}`);
  });

  it("size mismatch — returns failed when CDN reports wrong size", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-pilot");

    checksumResponse = {
      sha256: binaryHash,
      size: binarySize + 999, // wrong size
      target: platformDir,
    };

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installDohBinary(destPath, sources);

    assert.equal(result.status, "failed");
    assert.ok(result.error?.includes("Size mismatch"), `expected size mismatch error, got: ${result.error}`);
  });

  it("invalid checksum.json — missing fields", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-pilot");

    // Missing required fields
    checksumResponse = { foo: "bar" };

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installDohBinary(destPath, sources);

    assert.equal(result.status, "failed");
  });

  it("CDN returns 500 for checksum — falls through to failure", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-pilot");

    checksumResponse = null; // will cause 500 response

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installDohBinary(destPath, sources);

    assert.equal(result.status, "failed");
    assert.ok(typeof result.error === "string");
  });

  it("binary download fails — returns failed", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-pilot");

    serveBinary = false; // server returns 500 for binary

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installDohBinary(destPath, sources);

    assert.equal(result.status, "failed");
  });

  it("target mismatch in checksum.json — returns failed", async () => {
    if (!platformDir) return;
    const destPath = join(tempDir, "okx-pilot");

    checksumResponse = {
      sha256: binaryHash,
      size: binarySize,
      target: "unsupported-platform-xyz",
    };

    const sources = [{ host: `127.0.0.1:${serverPort}`, protocol: "http" as const }];
    const result = await installDohBinary(destPath, sources);

    assert.equal(result.status, "failed");
    assert.ok(result.error?.includes("Target mismatch") || result.error?.includes("mismatch"));
  });
});
