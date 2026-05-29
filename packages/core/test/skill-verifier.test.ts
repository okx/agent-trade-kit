/**
 * Unit tests for verifySkillSignature and canonicalize.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign as cryptoSign,
  createHash,
  randomUUID,
} from "node:crypto";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { verifySkillSignature, canonicalize } from "../src/skills/verifier.js";
import type { SkillSigning } from "../src/skills/types.js";
import type { ServerVerifyResult } from "../src/skills/server-verify.js";

// ---------------------------------------------------------------------------
// Ed25519 test key + signing helpers
// ---------------------------------------------------------------------------

/** Generate a fresh Ed25519 keypair for tests. */
function makeTestKeypair() {
  return generateKeyPairSync("ed25519");
}

/**
 * Export public key as OpenSSH wire-format base64 (matches the actual server API format).
 * Format: uint32(11) | "ssh-ed25519" | uint32(32) | rawKey  → base64 → 68-char string
 */
function exportPublicKeySSH(pubKey: ReturnType<typeof makeTestKeypair>["publicKey"]): string {
  const spkiDer = pubKey.export({ format: "der", type: "spki" }) as Buffer;
  const raw = spkiDer.subarray(spkiDer.length - 32); // last 32 bytes = raw Ed25519 key
  const alg = Buffer.from("ssh-ed25519");
  const out = Buffer.allocUnsafe(4 + alg.length + 4 + raw.length);
  let o = 0;
  out.writeUInt32BE(alg.length, o); o += 4;
  alg.copy(out, o); o += alg.length;
  out.writeUInt32BE(raw.length, o); o += 4;
  raw.copy(out, o);
  return out.toString("base64");
}

/** Sign the canonicalized signingContent with a private key, return Base64 signature. */
function signContent(
  privKey: ReturnType<typeof makeTestKeypair>["privateKey"],
  signingContent: { files: Record<string, string>; public_key_id: string; name?: string; version?: string },
): string {
  return cryptoSign(null, Buffer.from(canonicalize(signingContent)), privKey).toString("base64");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;

// Test keypair
const { publicKey, privateKey } = makeTestKeypair();
const PUBLIC_KEY_SSH = exportPublicKeySSH(publicKey);
const KEY_ID = "test-key-2026";

function makeFileHash(content: string): string {
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

/** Build a skill directory with given files and return the signing block. */
function setupContentDir(files: Record<string, string>): {
  dir: string;
  signing: SkillSigning;
} {
  const dir = join(tmpDir, randomUUID());
  mkdirSync(dir, { recursive: true });

  const fileHashes: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    const fullPath = join(dir, name);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
    fileHashes[name] = makeFileHash(content);
  }

  const signing: SkillSigning = {
    files: fileHashes,
    public_key_id: KEY_ID,
    signature: signContent(privateKey, { files: fileHashes, public_key_id: KEY_ID }),
  };
  return { dir, signing };
}

// ---------------------------------------------------------------------------
// Server-side mock helpers
// ---------------------------------------------------------------------------

function serverPass(version = "1.0.0"): () => Promise<ServerVerifyResult | null> {
  return async () => ({ verified: true, version, mismatched: [] });
}

function serverFail(mismatched = ["SKILL.md"]): () => Promise<ServerVerifyResult | null> {
  return async () => ({ verified: false, version: "1.0.0", mismatched });
}

function serverUnavailable(): () => Promise<null> {
  return async () => null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("verifySkillSignature", () => {
  before(() => {
    tmpDir = join(tmpdir(), `skill-verifier-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- Case 1: No signing block ----

  it("signing=undefined, server passes → verified_by_server", async () => {
    const { dir } = setupContentDir({ "SKILL.md": "# skill" });
    const result = await verifySkillSignature(dir, undefined, {
      serverSideVerify: serverPass("1.2.0"),
      skillName: "my-skill",
    });
    assert.equal(result.status, "verified_by_server");
    assert.equal(result.serverVersion, "1.2.0");
  });

  it("signing=undefined, server fails → failed with error and mismatched", async () => {
    const { dir } = setupContentDir({ "SKILL.md": "# skill" });
    const result = await verifySkillSignature(dir, undefined, {
      serverSideVerify: serverFail(["SKILL.md"]),
      skillName: "my-skill",
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /not signed/);
    assert.deepEqual(result.mismatched, ["SKILL.md"]);
  });

  it("signing=undefined, no serverSideVerify → failed", async () => {
    const { dir } = setupContentDir({ "SKILL.md": "# skill" });
    const result = await verifySkillSignature(dir, undefined);
    assert.equal(result.status, "failed");
    assert.match(result.error!, /not signed/);
  });

  it("signing=undefined, server unavailable (returns null) → failed", async () => {
    const { dir } = setupContentDir({ "SKILL.md": "# skill" });
    const result = await verifySkillSignature(dir, undefined, {
      serverSideVerify: serverUnavailable(),
      skillName: "my-skill",
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /not signed/);
    assert.equal(result.mismatched, undefined);
  });

  // ---- Case 2: Unknown public key ----

  it("public key unknown, server passes → verified_by_server + error hint", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => null,
      serverSideVerify: serverPass(),
      skillName: "my-skill",
    });
    assert.equal(result.status, "verified_by_server");
    assert.ok(result.error?.includes("Unknown signing key"));
  });

  it("public key unknown, server also fails → failed", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => null,
      serverSideVerify: serverFail(["SKILL.md"]),
      skillName: "my-skill",
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /Unknown signing key/);
    assert.deepEqual(result.mismatched, ["SKILL.md"]);
  });

  // ---- Case 3 + 4 + 5: Full local verification ----

  it("valid signature + matching hashes + no extra files → verified", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill", "src/index.ts": "export {}" });
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      skillName: "my-skill",
    });
    assert.equal(result.status, "verified");
    assert.equal(result.publicKeyId, KEY_ID);
    assert.equal(result.filesChecked, 2);
    assert.deepEqual(result.extraFiles, []);
  });

  it("valid signature + extra unsigned file → verified with extraFiles", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    // Add an extra file not in signing.files
    writeFileSync(join(dir, "README.md"), "extra");
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      skillName: "my-skill",
    });
    assert.equal(result.status, "verified");
    assert.ok(result.extraFiles!.includes("README.md"));
  });

  it("_meta.json is excluded from extraFiles check", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    writeFileSync(join(dir, "_meta.json"), "{}");
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      skillName: "my-skill",
    });
    assert.equal(result.status, "verified");
    assert.ok(!result.extraFiles!.includes("_meta.json"));
  });

  // ---- Case 3: Malformed public key (not valid SSH wire format) ----

  it("malformed public key, server passes → verified_by_server + error", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    // "dGVzdA==" decodes to "test" (4 bytes) — not SSH wire format, parseSSHPublicKey returns null
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => "dGVzdA==",
      serverSideVerify: serverPass(),
      skillName: "my-skill",
    });
    assert.equal(result.status, "verified_by_server");
    assert.match(result.error!, /Malformed public key/);
  });

  it("malformed public key, server also fails → failed", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => "dGVzdA==",
      serverSideVerify: serverFail(["SKILL.md"]),
      skillName: "my-skill",
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /Malformed public key/);
    assert.deepEqual(result.mismatched, ["SKILL.md"]);
  });

  // ---- Case 4 (invalid sig): Invalid signature ----

  it("invalid signature, server passes → verified_by_server + error", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    const badSigning: SkillSigning = { ...signing, signature: Buffer.alloc(64).toString("base64") };
    const result = await verifySkillSignature(dir, badSigning, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      serverSideVerify: serverPass(),
      skillName: "my-skill",
    });
    assert.equal(result.status, "verified_by_server");
    assert.equal(result.error, "Signature mismatch — key may be outdated or file was modified");
  });

  it("invalid signature, server also fails → failed", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    const badSigning: SkillSigning = { ...signing, signature: Buffer.alloc(64).toString("base64") };
    const result = await verifySkillSignature(dir, badSigning, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      serverSideVerify: serverFail(["SKILL.md"]),
      skillName: "my-skill",
    });
    assert.equal(result.status, "failed");
    assert.equal(result.error, "Invalid signature");
    assert.deepEqual(result.mismatched, ["SKILL.md"]);
  });

  // ---- Case 4: File hash mismatch ----

  it("file hash mismatch, server passes → verified_by_server + error", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    // Tamper SKILL.md after signing
    writeFileSync(join(dir, "SKILL.md"), "# tampered");
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      serverSideVerify: serverPass(),
      skillName: "my-skill",
    });
    assert.equal(result.status, "verified_by_server");
    assert.equal(result.error, "_meta.json may be corrupted");
  });

  it("file hash mismatch, server also fails → failed with filename", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    writeFileSync(join(dir, "SKILL.md"), "# tampered");
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      serverSideVerify: serverFail(["SKILL.md"]),
      skillName: "my-skill",
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /SKILL\.md/);
    assert.deepEqual(result.mismatched, ["SKILL.md"]);
  });

  it("missing signed file → failed with filename", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    // Remove the file that was signed
    rmSync(join(dir, "SKILL.md"));
    const result = await verifySkillSignature(dir, signing, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      skillName: "my-skill",
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /SKILL\.md/);
  });

  // ---- fetchPublicKey injection ----

  it("fetchPublicKey receives the correct keyId from signing block", async () => {
    const { dir, signing } = setupContentDir({ "SKILL.md": "# skill" });
    let capturedKeyId: string | undefined;
    await verifySkillSignature(dir, signing, {
      fetchPublicKey: async (keyId) => { capturedKeyId = keyId; return PUBLIC_KEY_SSH; },
      skillName: "my-skill",
    });
    assert.equal(capturedKeyId, KEY_ID);
  });

  // ---- AC #6: path traversal negative-path ----
  // The signing manifest lists a file with a path that escapes contentDir.
  // The signature is cryptographically valid (so the check reaches checkFileIntegrity),
  // but the path-traversal guard must reject it before any filesystem read.

  it("path traversal in signing manifest is rejected (AC #6)", async () => {
    const { dir } = setupContentDir({ "SKILL.md": "# skill" });
    const maliciousFiles = { "../../etc/passwd": "sha256:deadbeef" };
    const maliciousSigning: SkillSigning = {
      files: maliciousFiles,
      public_key_id: KEY_ID,
      signature: signContent(privateKey, { files: maliciousFiles, public_key_id: KEY_ID }),
    };
    const result = await verifySkillSignature(dir, maliciousSigning, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /Path traversal/);
  });

  // ---- AC #10: v2 payload name/version binding guard ----
  // A signing block that binds a different skill name or version must be rejected,
  // even when the Ed25519 signature and file hashes are otherwise valid.
  // This prevents transplanting a valid signing block from one skill into another.

  it("v2 name mismatch is rejected — cross-skill transplant guard (AC #10)", async () => {
    const fileHashes = { "SKILL.md": makeFileHash("# skill") };
    const dir = join(tmpDir, randomUUID());
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "# skill");
    const v2Signing: SkillSigning = {
      files: fileHashes,
      public_key_id: KEY_ID,
      name: "original-skill",
      version: "1.0.0",
      signature: signContent(privateKey, {
        files: fileHashes,
        public_key_id: KEY_ID,
        name: "original-skill",
        version: "1.0.0",
      }),
    };
    const result = await verifySkillSignature(dir, v2Signing, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      skillName: "different-skill",   // mismatch — installing as a different skill
      skillVersion: "1.0.0",
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /name mismatch/i);
    assert.match(result.error!, /original-skill/);
    assert.match(result.error!, /different-skill/);
  });

  it("v2 version mismatch is rejected — version binding guard (AC #10)", async () => {
    const fileHashes = { "SKILL.md": makeFileHash("# skill") };
    const dir = join(tmpDir, randomUUID());
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "# skill");
    const v2Signing: SkillSigning = {
      files: fileHashes,
      public_key_id: KEY_ID,
      name: "my-skill",
      version: "1.0.0",
      signature: signContent(privateKey, {
        files: fileHashes,
        public_key_id: KEY_ID,
        name: "my-skill",
        version: "1.0.0",
      }),
    };
    const result = await verifySkillSignature(dir, v2Signing, {
      fetchPublicKey: async () => PUBLIC_KEY_SSH,
      skillName: "my-skill",
      skillVersion: "2.0.0",   // mismatch — package declares a different version
    });
    assert.equal(result.status, "failed");
    assert.match(result.error!, /version mismatch/i);
    assert.match(result.error!, /1\.0\.0/);
    assert.match(result.error!, /2\.0\.0/);
  });
});

// ---------------------------------------------------------------------------
// canonicalize
// ---------------------------------------------------------------------------

describe("canonicalize", () => {
  it("sorts keys alphabetically at top level", () => {
    const result = canonicalize({ b: 2, a: 1 });
    assert.equal(result, '{"a":1,"b":2}');
  });

  it("sorts keys recursively in nested objects", () => {
    const result = canonicalize({ z: { y: 1, x: 2 }, a: 0 });
    assert.equal(result, '{"a":0,"z":{"x":2,"y":1}}');
  });

  it("preserves array order (does not sort arrays)", () => {
    const result = canonicalize({ files: ["b", "a", "c"] });
    assert.equal(result, '{"files":["b","a","c"]}');
  });

  it("handles null values", () => {
    assert.equal(canonicalize(null), "null");
    assert.equal(canonicalize({ a: null }), '{"a":null}');
  });

  it("produces compact output (no spaces)", () => {
    const result = canonicalize({ a: 1, b: { c: 2 } });
    assert.ok(!result.includes(" "));
  });
});

// ---------------------------------------------------------------------------
// Cross-language reference vectors
//
// These are the authoritative test vectors for the canonicalize() function.
// The same inputs MUST produce byte-identical output from the server-side Java
// ObjectMapper with ORDER_MAP_ENTRIES_BY_KEYS.
//
// How to validate on the Java side:
//   ObjectMapper mapper = new ObjectMapper();
//   mapper.configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
//   mapper.configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);
//   String result = mapper.writeValueAsString(input);
//   assert result.equals(expected);
// ---------------------------------------------------------------------------

describe("canonicalize cross-language vectors", () => {
  // V1: real signing payload (v1 — no name/version)
  it("V1: v1 signing payload", () => {
    const input = {
      files: {
        "SKILL.md": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "src/index.ts": "sha256:a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
      },
      public_key_id: "okx-skill-signing-key-2026",
    };
    assert.equal(
      canonicalize(input),
      '{"files":{"SKILL.md":"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","src/index.ts":"sha256:a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"},"public_key_id":"okx-skill-signing-key-2026"}',
    );
  });

  // V2: real signing payload (v2 — includes name + version)
  it("V2: v2 signing payload with name and version", () => {
    const input = {
      files: {
        "SKILL.md": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
      name: "grid-premium",
      public_key_id: "okx-skill-signing-key-2026",
      version: "1.2.0",
    };
    assert.equal(
      canonicalize(input),
      '{"files":{"SKILL.md":"sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"},"name":"grid-premium","public_key_id":"okx-skill-signing-key-2026","version":"1.2.0"}',
    );
  });

  // V3: key ordering — uppercase sorts before lowercase in Unicode code-point order
  // 'A'=65, 'Z'=90, 'a'=97 → uppercase always precedes lowercase
  it("V3: uppercase keys sort before lowercase (Unicode code-point order)", () => {
    assert.equal(canonicalize({ b: 2, A: 1 }), '{"A":1,"b":2}');
  });

  // V4: numeric values — integers encode without decimal point
  it("V4: integer encoding (no trailing .0)", () => {
    assert.equal(canonicalize({ count: 42, ratio: 1.5 }), '{"count":42,"ratio":1.5}');
  });

  // V5: nested files map (typical real-world structure)
  it("V5: nested files map with directory paths", () => {
    const input = {
      files: {
        "reference/guide.md": "sha256:aaaa",
        "SKILL.md": "sha256:bbbb",
        "src/utils.ts": "sha256:cccc",
      },
      public_key_id: "key-id",
    };
    // files keys are sorted: "SKILL.md" < "reference/guide.md" < "src/utils.ts"
    // ('S'=83, 'r'=114, 's'=115)
    assert.equal(
      canonicalize(input),
      '{"files":{"SKILL.md":"sha256:bbbb","reference/guide.md":"sha256:aaaa","src/utils.ts":"sha256:cccc"},"public_key_id":"key-id"}',
    );
  });

  // V6: empty objects and arrays
  it("V6: empty objects and arrays", () => {
    assert.equal(canonicalize({}), "{}");
    assert.equal(canonicalize([]), "[]");
    assert.equal(canonicalize({ files: {}, public_key_id: "" }), '{"files":{},"public_key_id":""}');
  });

  // V7: boolean values
  it("V7: boolean values", () => {
    assert.equal(canonicalize({ z: false, a: true }), '{"a":true,"z":false}');
  });
});
