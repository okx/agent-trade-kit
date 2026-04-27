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

/**
 * Shared inputSchema fragments for Phase 1 algo-flag fields (#178).
 * Spread into a tool's `properties` object to avoid duplicating the same
 * enum + description across every place / algo-place tool. Consolidated to
 * resolve Sonar `new_duplicated_lines_density` flag on MR !289.
 */
export const TP_ORD_KIND_SCHEMA = {
  type: "string",
  enum: ["condition", "limit"],
  description: "condition(default)=trigger-based TP; limit=immediate limit order (no trigger phase)",
} as const;

export const TP_TRIGGER_PX_TYPE_SCHEMA = {
  type: "string",
  enum: ["last", "index", "mark"],
  description: "TP trigger price source: last(default)|index|mark",
} as const;

export const SL_TRIGGER_PX_TYPE_SCHEMA = {
  type: "string",
  enum: ["last", "index", "mark"],
  description: "SL trigger price source: last(default)|index|mark",
} as const;

export const STP_MODE_SCHEMA = {
  type: "string",
  enum: ["cancel_maker", "cancel_taker", "cancel_both"],
  description: "Self-trade prevention: cancel_maker|cancel_taker|cancel_both",
} as const;

export const CXL_ON_CLOSE_POS_SCHEMA = {
  type: "boolean",
  description: "Auto-cancel TP/SL when associated position closes (algo only)",
} as const;

/**
 * Convenience grouping of all 5 Phase 1 algo flags applicable to PLACE-ORDER
 * tools (no cxlOnClosePos — that's algo-only).
 */
export const PHASE1_PLACE_FLAGS_SCHEMA = {
  tpOrdKind: TP_ORD_KIND_SCHEMA,
  tpTriggerPxType: TP_TRIGGER_PX_TYPE_SCHEMA,
  slTriggerPxType: SL_TRIGGER_PX_TYPE_SCHEMA,
  stpMode: STP_MODE_SCHEMA,
} as const;

/**
 * All 5 Phase 1 algo flags including cxlOnClosePos for ALGO-PLACE tools that
 * support it (swap, futures). Spot algo does not support cxlOnClosePos.
 */
export const PHASE1_ALGO_FLAGS_SCHEMA = {
  ...PHASE1_PLACE_FLAGS_SCHEMA,
  cxlOnClosePos: CXL_ON_CLOSE_POS_SCHEMA,
} as const;

export function buildAttachAlgoOrds(
  source: Record<string, unknown>,
): Record<string, unknown>[] | undefined {
  const tpTriggerPx = readString(source, "tpTriggerPx");
  const tpOrdPx = readString(source, "tpOrdPx");
  const slTriggerPx = readString(source, "slTriggerPx");
  const slOrdPx = readString(source, "slOrdPx");
  const tpOrdKind = readString(source, "tpOrdKind");
  const tpTriggerPxType = readString(source, "tpTriggerPxType");
  const slTriggerPxType = readString(source, "slTriggerPxType");
  const entry = compactObject({
    tpTriggerPx,
    tpOrdPx,
    slTriggerPx,
    slOrdPx,
    tpOrdKind,
    tpTriggerPxType,
    slTriggerPxType,
  });
  return Object.keys(entry).length > 0 ? [entry] : undefined;
}
