/** Exit codes from the okx-auth binary (mirrors src/error.rs). */
export const EXIT_CODES = {
  SUCCESS: 0,
  UNAUTHORIZED_CALLER: 1,
  NOT_LOGGED_IN: 2,
  REFRESH_FAILED: 3,
} as const;

/** JSON output of `okx-auth status --json`. */
export interface AuthStatusResult {
  profile: string;
  site: string;
  status: "logged_in" | "pending" | "not_logged_in";
  expiresAt?: string;
  ttl?: number;
  scopes?: string[];
  apiKey?: boolean;
}
