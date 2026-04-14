import { ValidationError } from "../utils/errors.js";

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function readString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ValidationError(`Parameter "${key}" must be a string.`);
  }
  return value;
}

export function readNumber(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  // Coerce numeric strings (LLMs may pass "2" instead of 2)
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value);
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ValidationError(`Parameter "${key}" must be a number.`);
  }
  return value;
}

export function readBoolean(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ValidationError(`Parameter "${key}" must be a boolean.`);
  }
  return value;
}

export function readStringArray(
  args: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError(`Parameter "${key}" must be an array of strings.`);
  }
  return value;
}

export function requireString(
  args: Record<string, unknown>,
  key: string,
): string {
  const value = readString(args, key);
  if (!value || value.length === 0) {
    throw new ValidationError(`Missing required parameter "${key}".`);
  }
  return value;
}

export function assertEnum(
  value: string | undefined,
  key: string,
  values: readonly string[],
): void {
  if (value === undefined) {
    return;
  }
  if (!values.includes(value)) {
    throw new ValidationError(
      `Parameter "${key}" must be one of: ${values.join(", ")}.`,
    );
  }
}

export function compactObject(
  object: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (value !== undefined && value !== null) {
      next[key] = value;
    }
  }
  return next;
}

export function normalizeResponse(response: {
  endpoint: string;
  requestTime: string;
  data: unknown;
}): Record<string, unknown> {
  return {
    endpoint: response.endpoint,
    requestTime: response.requestTime,
    data: response.data,
  };
}

/**
 * Validate that instId looks like a perpetual swap (ends with -SWAP).
 * Throws ValidationError with a helpful message when a spot ID is passed.
 */
export function validateSwapInstId(instId: string): void {
  if (!instId.toUpperCase().endsWith("-SWAP")) {
    throw new ValidationError(
      `instId "${instId}" is not a SWAP instrument. ` +
      `Funding rate is only available for perpetual swaps. ` +
      `Use the SWAP format, e.g. "${instId}-SWAP".`,
    );
  }
}

export function buildAttachAlgoOrds(
  source: Record<string, unknown>,
): Record<string, unknown>[] | undefined {
  const tpTriggerPx = readString(source, "tpTriggerPx");
  const tpOrdPx = readString(source, "tpOrdPx");
  const slTriggerPx = readString(source, "slTriggerPx");
  const slOrdPx = readString(source, "slOrdPx");
  const entry = compactObject({ tpTriggerPx, tpOrdPx, slTriggerPx, slOrdPx });
  return Object.keys(entry).length > 0 ? [entry] : undefined;
}
