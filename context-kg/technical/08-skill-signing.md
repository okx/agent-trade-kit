<!-- triggers: skill signing, Ed25519, signature verification, VerificationStatus, verified, verified_by_server, bypassed, signing block, _meta.json, skill verify, --force, server fallback, SHA-256, path traversal, v2 payload, name binding, version binding, signing key, public key, UNDICI-EHPA -->
# Skill Signing & Verification

## Overview

Every skill package downloaded from the marketplace includes a `_meta.json` file with an optional `signing` block. `okx skill add` verifies the Ed25519 signature and SHA-256 file integrity before installation. `okx skill verify <name>` re-runs verification on an already-installed skill on demand.

## _meta.json Signing Block

```jsonc
{
  "name": "grid-premium",
  "version": "1.2.0",
  "title": "...",
  "description": "...",
  "signing": {
    "public_key_id": "okx-skill-signing-key-2026",  // key ID to fetch from /api/v5/skill/signing-key
    "files": {                                        // filename → "sha256:<hex>"
      "SKILL.md": "sha256:abc123...",
      "src/index.ts": "sha256:def456..."
    },
    "signature": "<base64 Ed25519 signature>",
    // v2 payload fields (server includes these when signing; optional for backward compat):
    "name": "grid-premium",      // prevents cross-skill signing block transplant
    "version": "1.2.0"
  }
}
```

`signing` is absent in pre-signing skills (old packages). The verifier handles this via server fallback.

## Verification State Machine

```
verifySkillSignature()
│
├─ signing absent?
│   └─ tryServerFallback() → verified_by_server | failed("Skill is not signed")
│
├─ fetchPublicKey(public_key_id) → null?
│   └─ tryServerFallback() → verified_by_server + hint | failed("Unknown signing key")
│
├─ parseSSHPublicKey(base64) → null?          // SSH wire-format, not PEM
│   └─ tryServerFallback() → verified_by_server + hint | failed("Malformed public key")
│
├─ Ed25519 verify(canonicalize(payload), sig) → false?
│   └─ tryServerFallback() → verified_by_server + hint | failed("Invalid signature")
│
├─ name/version binding check (v2 payload only)
│   └─ mismatch → failed("Skill name/version mismatch") — no server fallback
│
├─ per-file SHA-256 + path-traversal guard (for each file in signing.files)
│   ├─ path escapes contentDir → failed("Path traversal detected")
│   ├─ file missing → failed("File missing: <name>")
│   └─ hash mismatch → tryServerFallback() → verified_by_server + hint | failed("File integrity check failed")
│
└─ detect extra unsigned files (not in signing.files, not _meta.json)
    └─ → verified  (extraFiles[] populated, not a hard failure)
```

## VerificationStatus Values

| Status | Meaning | Registry entry |
|--------|---------|----------------|
| `"verified"` | Local Ed25519 + SHA-256 passed | `verified` |
| `"verified_by_server"` | Local check could not proceed; server confirmed hashes match its DB | `verified_by_server` |
| `"failed"` | Both local and server verification failed, or hard binding/traversal error | `"failed"` (install blocked unless `--force`) |
| `"bypassed"` | User passed `--force` past a `"failed"` result | `"bypassed"` |

A downstream consumer reading `registry.json` can distinguish a consciously-bypassed install (`bypassed`) from an infra failure or genuinely tampered skill (`failed`).

## Signing Payload Canonicalization

The signed message is the **canonicalized JSON** of:

```jsonc
{
  "files": { ... },           // always present
  "public_key_id": "...",     // always present
  "name": "...",              // present in v2+ payload
  "version": "..."            // present in v2+ payload
}
```

Canonicalization (`canonicalize()` in `verifier.ts`): keys sorted by Unicode code-point order (JS `<`/`>` string comparison, equivalent to Java `String.compareTo()` for the ASCII-only key set used in signing payloads) at every nesting level, no whitespace. Must match the server-side Java `ORDER_MAP_ENTRIES_BY_KEYS` behaviour — coordinate cross-language test vectors with the server team before changing the algorithm.

## Public Key Format

Keys are fetched from `GET /api/v5/skill/signing-key?keyId=<id>`. The API returns:

```jsonc
{ "publicKey": "<base64>", "algorithm": "ed25519", "status": "active" | "revoked", "createdAt": 1234567890 }
```

- `status` must equal `"active"` — `getPublicKey()` returns `null` for revoked keys, triggering server fallback.
- `publicKey` is **OpenSSH wire-format** base64 (not PEM): `uint32(11) | "ssh-ed25519" | uint32(32) | rawKey`. The verifier parses it with `parseSSHPublicKey()`, prepends the ASN.1 SPKI header, and passes it to Node.js `crypto.createPublicKey()`.

## Server-Side Fallback

When local verification cannot complete (missing key, parse error, signature mismatch, hash mismatch), the verifier calls `POST /api/v5/skill/verify` with the client-computed file hashes:

```jsonc
{ "skillName": "grid-premium", "version": "1.2.0", "files": { "SKILL.md": "sha256:..." } }
```

Response:

```jsonc
{ "verified": true | false, "version": "1.2.0", "mismatched": ["SKILL.md"], "message": "..." }
```

- `verified: true` → return `status: "verified_by_server"`. This covers "client has stale key / old CLI" without blocking the user.
- `verified: false` → return `status: "failed"` with `mismatched[]` populated so the caller can report which files differ.
- Server unavailable (null response) → return `status: "failed"` with the local error.

The server fallback does NOT apply to name/version binding mismatches or path-traversal errors — those are hard failures regardless.

## --force Bypass Policy

```
okx skill add <name> --force
```

- Allowed only when `verifyResult.status === "failed"`.
- Bypass warning is always written to **stderr** regardless of `--json` mode, so scripted consumers can detect it.
- Registry records `verification: "bypassed"` (not `"failed"`), making the bypass auditable.

## Key Files

| File | Role |
|------|------|
| `packages/core/src/skills/verifier.ts` | Main verification engine: `verifySkillSignature`, `localFail`, `ed25519Verify`, `checkNameVersionBinding`, `checkFileIntegrity`, `canonicalize` |
| `packages/core/src/skills/signing-keys.ts` | `getPublicKey(client, keyId)` — fetches + validates active Ed25519 key |
| `packages/core/src/skills/server-verify.ts` | `serverSideVerify(client, name, version, files)` — server fallback endpoint |
| `packages/core/src/skills/types.ts` | `SkillSigning`, `VerificationStatus`, `VerificationResult` types |
| `packages/cli/src/commands/skill.ts` | `cmdSkillAdd` (install + verify), `cmdSkillVerify` (on-demand re-verify) |
| `packages/core/test/skill-verifier.test.ts` | 22 unit tests covering all verification branches |
