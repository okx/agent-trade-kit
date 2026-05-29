import {createHash, createPublicKey, verify as cryptoVerify} from "node:crypto";
import {readFileSync} from "node:fs";
import {join, resolve, sep} from "node:path";
import type {SkillSigning, VerificationResult} from "./types.js";
import {computeFileHashes, listFilesRecursive} from "./file-hasher.js";
import type {ServerVerifyResult} from "./server-verify.js";

/**
 * ASN.1 SPKI prefix for raw 32-byte Ed25519 public keys.
 * Allows Node.js crypto to consume a raw key via DER/SPKI format.
 */
const ED25519_SPKI_HEADER = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Parse an OpenSSH wire-format Ed25519 public key (base64-encoded) and extract the raw 32-byte key.
 *
 * Wire format: uint32(algLen) | algName("ssh-ed25519") | uint32(keyLen=32) | rawKey
 * Example: AAAAC3NzaC1lZDI1NTE5AAAA... (68-char base64, 51 decoded bytes)
 *
 * Returns null if the input is not a valid SSH Ed25519 key.
 */
function parseSSHPublicKey(base64: string): Buffer | null {
  try {
    const buf = Buffer.from(base64, "base64");
    let offset = 0;
    if (buf.length < 4) return null;
    const algLen = buf.readUInt32BE(offset);
    offset += 4;
    if (offset + algLen + 4 > buf.length) return null;
    if (buf.subarray(offset, offset + algLen).toString("ascii") !== "ssh-ed25519") return null;
    offset += algLen;
    const keyLen = buf.readUInt32BE(offset);
    offset += 4;
    if (keyLen !== 32 || offset + keyLen > buf.length) return null;
    return buf.subarray(offset, offset + keyLen);
  } catch {
    return null;
  }
}

export interface VerifySkillOpts {
  /**
   * Fetch the Ed25519 public key for a given keyId.
   * Wire up as: (keyId) => getPublicKey(client, keyId)
   */
  fetchPublicKey?: (keyId: string) => Promise<string | null>;
  /**
   * Call the server-side fallback verification endpoint.
   * Wire up as: (name, version, files) => serverSideVerify(client, name, version, files)
   */
  serverSideVerify?: (
    name: string,
    version: string | undefined,
    files: Record<string, string>,
  ) => Promise<ServerVerifyResult | null>;
  skillName?: string;
  skillVersion?: string;
}

/**
 * Verify a skill's Ed25519 signature and file integrity.
 *
 * Verification order:
 *   1. No signing block  → server fallback
 *   2. Fetch public key  → server fallback if unavailable
 *   3. Ed25519 verify    → server fallback if invalid
 *   4. Per-file SHA-256  → server fallback if mismatch
 *   5. Extra file check  → warn via extraFiles (not a hard failure)
 *
 * Server fallback distinguishes "client data issue" from "real tamper".
 */
export async function verifySkillSignature(
  contentDir: string,
  signing: SkillSigning | undefined,
  opts?: VerifySkillOpts,
): Promise<VerificationResult> {
  if (!signing) {
    const fallback = await tryServerFallback(contentDir, opts);
    if (fallback?.status === "verified_by_server") return fallback;
    return {
      status: "failed",
      error: fallback?.error ?? "Skill is not signed",
      ...(fallback?.mismatched?.length && {mismatched: fallback.mismatched}),
    };
  }

  const publicKeyBase64 = opts?.fetchPublicKey
    ? ((await opts.fetchPublicKey(signing.public_key_id)) ?? "")
    : "";
  if (!publicKeyBase64) {
    return localFail(contentDir, opts,
      `Unknown signing key: ${signing.public_key_id}. Please update CLI.`,
      "Unknown signing key — consider updating CLI",
    );
  }

  const rawKey = parseSSHPublicKey(publicKeyBase64);
  if (!rawKey) {
    return localFail(contentDir, opts,
      `Malformed public key for key ID: ${signing.public_key_id}`,
      "Malformed public key from server — consider updating CLI",
      signing.public_key_id,
    );
  }

  if (!ed25519Verify(signing, rawKey)) {
    return localFail(contentDir, opts,
      "Invalid signature",
      "Signature mismatch — key may be outdated or file was modified",
      signing.public_key_id,
    );
  }

  const bindingError = checkNameVersionBinding(signing, opts);
  if (bindingError) {
    return {status: "failed", error: bindingError, publicKeyId: signing.public_key_id};
  }

  const integrityFailure = await checkFileIntegrity(signing, contentDir, opts);
  if (integrityFailure) return integrityFailure;

  const signedFiles = new Set(Object.keys(signing.files));
  const extraFiles = listFilesRecursive(contentDir).filter(
    (f) => f !== "_meta.json" && !signedFiles.has(f),
  );
  return {status: "verified", publicKeyId: signing.public_key_id, filesChecked: signedFiles.size, extraFiles};
}

/**
 * Unified "local check failed" helper.
 * Tries server fallback; on server success annotates with a hint, on failure returns the local error.
 */
async function localFail(
  contentDir: string,
  opts: VerifySkillOpts | undefined,
  localError: string,
  serverHint: string,
  keyId?: string,
): Promise<VerificationResult> {
  const fallback = await tryServerFallback(contentDir, opts);
  if (fallback?.status === "verified_by_server") {
    return {...fallback, error: serverHint};
  }
  return {
    status: "failed",
    error: localError,
    ...(keyId && {publicKeyId: keyId}),
    ...(fallback?.mismatched?.length && {mismatched: fallback.mismatched}),
  };
}

/** Build the canonical signing payload and verify the Ed25519 signature. */
function ed25519Verify(signing: SkillSigning, rawKey: Buffer): boolean {
  const payloadObj: Record<string, unknown> = {files: signing.files, public_key_id: signing.public_key_id};
  if (signing.name !== undefined) payloadObj.name = signing.name;
  if (signing.version !== undefined) payloadObj.version = signing.version;
  const message = Buffer.from(canonicalize(payloadObj), "utf-8");
  const sig = Buffer.from(signing.signature, "base64");
  const spkiKey = Buffer.concat([ED25519_SPKI_HEADER, rawKey]);
  const keyObj = createPublicKey({key: spkiKey, format: "der", type: "spki"});
  return cryptoVerify(null, message, keyObj, sig);
}

/**
 * Assert name/version binding (v2 payload) — prevents signing block transplant across skills.
 * Returns an error string on mismatch, null when the binding is valid.
 */
function checkNameVersionBinding(signing: SkillSigning, opts?: VerifySkillOpts): string | null {
  if (signing.name !== undefined && opts?.skillName !== undefined && signing.name !== opts.skillName) {
    return `Skill name mismatch: signature binds "${signing.name}" but installing as "${opts.skillName}"`;
  }
  if (signing.version !== undefined && opts?.skillVersion !== undefined && signing.version !== opts.skillVersion) {
    return `Skill version mismatch: signature binds "${signing.version}" but package declares "${opts.skillVersion}"`;
  }
  return null;
}

/**
 * Per-file SHA-256 integrity check with path-traversal guard.
 * Returns a VerificationResult on the first failure, null when all files pass.
 *
 * Note: stops at the first mismatch (fail-fast). Callers should not assume
 * all tampered files are reported — use the server fallback's `mismatched[]`
 * list for a complete account of which files diverged.
 */
async function checkFileIntegrity(
  signing: SkillSigning,
  contentDir: string,
  opts?: VerifySkillOpts,
): Promise<VerificationResult | null> {
  const resolvedContentDir = resolve(contentDir);
  for (const [filename, expectedHash] of Object.entries(signing.files)) {
    const resolvedPath = resolve(join(contentDir, filename));
    if (!resolvedPath.startsWith(resolvedContentDir + sep)) {
      return {status: "failed", error: `Path traversal detected in signing manifest: ${filename}`, publicKeyId: signing.public_key_id};
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(resolvedPath);
    } catch {
      return {status: "failed", error: `File missing: ${filename}`, publicKeyId: signing.public_key_id};
    }
    const actual = "sha256:" + createHash("sha256").update(bytes).digest("hex");
    if (actual !== expectedHash) {
      return localFail(contentDir, opts,
        `File integrity check failed: ${filename}`,
        "_meta.json may be corrupted",
        signing.public_key_id,
      );
    }
  }
  return null;
}

/**
 * Attempt server-side fallback verification.
 * Returns a VerificationResult on server success, null otherwise.
 */
async function tryServerFallback(
  contentDir: string,
  opts?: VerifySkillOpts,
): Promise<VerificationResult | null> {
  if (!opts?.serverSideVerify || !opts.skillName) return null;
  const fileHashes = computeFileHashes(contentDir);
  const result = await opts.serverSideVerify(
    opts.skillName,
    opts.skillVersion,
    fileHashes,
  );
  if (!result) return null;
  if (result.verified) {
    return {
      status: "verified_by_server",
      filesChecked: Object.keys(fileHashes).length,
      serverVersion: result.version,
    };
  }
  return {
    status: "failed",
    filesChecked: Object.keys(fileHashes).length,
    mismatched: result.mismatched,
    ...(result.message && {error: result.message}),
  };
}

/**
 * JSON canonicalization: recursively sort keys by Unicode code-point order + compact output.
 *
 * Sorting uses `a < b ? -1 : a > b ? 1 : 0` (JS string UTF-16 comparison), which is
 * identical to Java's String.compareTo() for the ASCII-only key set used in signing payloads
 * (fields: files, name, public_key_id, version; values: file paths, hex hashes).
 *
 * Cross-language reference vectors are in test/skill-verifier.test.ts — "canonicalize
 * cross-language vectors". Run the same inputs through the Java implementation to confirm.
 */
export function canonicalize(obj: unknown): string {
  return JSON.stringify(deepSortKeys(obj));
}

function compareKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function deepSortKeys(val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(val as Record<string, unknown>).sort(compareKeys)) {
    sorted[key] = deepSortKeys((val as Record<string, unknown>)[key]);
  }
  return sorted;
}
