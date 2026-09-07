import { OkxApiError } from "../utils/errors.js";

const AIGC_CODE_BEHAVIORS: Record<string, { suggestion: string }> = {
  "41001": { suggestion: "Pair Spread: invalid instrument ID. Check that instIdA and instIdB are valid SWAP instruments available on this site." },
  "41020": { suggestion: "Pair Spread: instIdA and instIdB must be different. Specify two distinct instrument IDs." },
  "41030": { suggestion: "Pair Spread: unsupported bar for this endpoint. Only '5m' and '15m' are accepted." },
  "50029": { suggestion: "Invalid parameter value (server-side validation error). Check all parameters are within valid ranges and in the correct format." },
  "51000": { suggestion: "Invalid parameter value or format. Check instId, bar, limit, and other parameters for the affected endpoint." },
};

export async function withAigcErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof OkxApiError && error.code) {
      const behavior = AIGC_CODE_BEHAVIORS[error.code];
      if (behavior) {
        throw new OkxApiError(error.message, {
          code: error.code,
          suggestion: behavior.suggestion,
          endpoint: error.endpoint,
          traceId: error.traceId,
        });
      }
    }
    throw error;
  }
}
