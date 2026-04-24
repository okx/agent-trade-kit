/** Local okx-auth binary status (synchronous, no network). */
export interface AuthLocalStatus {
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

// CdnChecksum, CdnSource, InstallResult, RemoveResult are reused from pilot/installer-types.
