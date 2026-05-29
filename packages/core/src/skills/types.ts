/** Shape of the `signing` block injected into _meta.json by the server at packaging time. */
export interface SkillSigning {
  files: Record<string, string>;  // filename → "sha256:<hex>"
  public_key_id: string;          // ID of the Ed25519 key used to sign
  signature: string;              // Base64-encoded Ed25519 signature
  /** Skill name bound into the payload at signing time (v2 payload — prevents cross-skill transplant). */
  name?: string;
  /** Skill version bound into the payload at signing time (v2 payload). */
  version?: string;
}

/** Outcome of a skill signature verification attempt. */
export type VerificationStatus = "verified" | "verified_by_server" | "failed" | "bypassed";

/** Full result returned by verifySkillSignature(). */
export interface VerificationResult {
  status: VerificationStatus;
  publicKeyId?: string;
  filesChecked?: number;
  extraFiles?: string[];       // local files present but absent from signing.files
  mismatched?: string[];       // files whose hash did not match the server DB
  serverVersion?: string;      // version the server matched against during fallback verification
  error?: string;
}

/** Shape of _meta.json inside a skill zip, injected by the server at packaging time. */
export interface SkillMeta {
  name: string;
  version: string;
  title: string;
  description: string;
  signing?: SkillSigning;      // absent in skills packaged before signing was introduced
}

/** Per-skill record stored in registry.json. */
export interface SkillRecord {
  name: string;
  version: string;
  description: string;
  installedAt: string;
  updatedAt: string;
  source: "marketplace";
  verification?: VerificationStatus;  // verification status at install time
}

/** Top-level structure of registry.json. */
export interface SkillRegistry {
  version: number;
  skills: Record<string, SkillRecord>;
}

/** Skill entry returned by the Search API. */
export interface SkillSearchItem {
  title: string;
  name: string;
  description: string;
  categories: string[];
  latestVersion: string;
  downloadCount: string;
  cTime: string;
  uTime: string;
  skillURL: string;
}

/** Category entry returned by the Categories API. */
export interface SkillCategory {
  categoryId: string;
  name: string;
}
