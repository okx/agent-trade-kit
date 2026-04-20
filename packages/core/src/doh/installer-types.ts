/** Local DoH binary status (synchronous, no network). */
export interface DohLocalStatus {
  /** Absolute path to the binary file. */
  binaryPath: string;
  /** Whether the binary file exists on disk. */
  exists: boolean;
  /** Platform identifier (e.g. "darwin-arm64"), or null on unsupported platforms. */
  platform: string | null;
  /** File size in bytes (only set when exists=true). */
  fileSize?: number;
  /** SHA-256 hex digest (only set when exists=true). */
  sha256?: string;
}

/** Checksum metadata fetched from CDN. */
export interface CdnChecksum {
  /** SHA-256 hex digest of the binary. */
  sha256: string;
  /** Expected file size in bytes. */
  size: number;
  /** Platform target string (e.g. "darwin-arm64"). */
  target: string;
  /** Which CDN host served this checksum. */
  source: string;
}

/** Result of a DoH binary installation attempt. */
export interface InstallResult {
  status: "installed" | "up-to-date" | "failed";
  /** CDN host that served the binary (only when status=installed). */
  source?: string;
  /** Error description (only when status=failed). */
  error?: string;
}

/** Result of a DoH binary removal attempt. */
export interface RemoveResult {
  status: "removed" | "not-found";
}

/** A CDN source entry for downloading the binary. */
export interface CdnSource {
  host: string;
  protocol: "https" | "http";
}
