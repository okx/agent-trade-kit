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
 * tools (no cxlOnClosePos - that's algo-only).
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

/**
 * Phase 2 schema constants for new ordType values (#181).
 * Spread into algo-place tool inputSchema to avoid Sonar duplication.
 */

/** trigger ordType - pending order activated when triggerPx is hit */
export const TRIGGER_FLAGS_SCHEMA = {
  triggerPx: {
    type: "string",
    description: "Activation price; order submits when market hits this level (trigger only)",
  },
  orderPx: {
    type: "string",
    description: "Order price submitted when trigger fires; -1=market (trigger only)",
  },
  advanceOrdType: {
    type: "string",
    enum: ["fok", "ioc"],
    description: "Execution qualifier for triggered order: fok=fill-or-kill, ioc=immediate-or-cancel (trigger only)",
  },
  triggerPxType: {
    type: "string",
    enum: ["last", "index", "mark"],
    description: "Price type used to evaluate trigger: last(default)|index|mark (trigger only)",
  },
} as const;

/** chase ordType - smart-follow best bid/ask */
export const CHASE_FLAGS_SCHEMA = {
  chaseType: {
    type: "string",
    enum: ["distance", "ratio"],
    description: "Chase unit: distance=price ticks, ratio=proportion of price (chase only, default distance)",
  },
  chaseVal: {
    type: "string",
    description: "Chase amount matching chaseType (e.g. 0.5 ticks for distance, 0.001 for ratio) (chase only)",
  },
  maxChaseType: {
    type: "string",
    enum: ["distance", "ratio"],
    description: "Upper-bound unit for chase (chase only)",
  },
  maxChaseVal: {
    type: "string",
    description: "Upper-bound value for chase (chase only)",
  },
} as const;

/** iceberg + twap ordTypes - large-order split / time-weighted average price */
export const ICEBERG_TWAP_FLAGS_SCHEMA = {
  pxVar: {
    type: "string",
    description: "Price variance % [0.0001, 0.01]; provide pxVar OR pxSpread (iceberg/twap only)",
  },
  pxSpread: {
    type: "string",
    description: "Price variance constant >= 0; provide pxVar OR pxSpread (iceberg/twap only)",
  },
  szLimit: {
    type: "string",
    description: "Average per-child-order size (iceberg/twap only)",
  },
  pxLimit: {
    type: "string",
    description: "Order price ceiling >= 0 (iceberg/twap only)",
  },
  timeInterval: {
    type: "string",
    description: "Seconds between child orders (iceberg/twap only)",
  },
} as const;

/**
 * Phase 2 ordType-specific body builders. Each takes the raw tool args and
 * returns the subset of fields applicable to one ordType - to be merged into
 * the algo-place request body via Object.assign.
 *
 * Extracted to eliminate duplication across swap/futures/spot algo handlers
 * (Sonar `new_duplicated_lines_density` would otherwise flag identical switch
 * blocks). Per-ordType field lists must match OKX docs (see context-kg/business
 * for the canonical reference).
 */
export function buildTriggerOrdTypeBody(args: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    triggerPx: readString(args, "triggerPx"),
    orderPx: readString(args, "orderPx"),
    advanceOrdType: readString(args, "advanceOrdType"),
    triggerPxType: readString(args, "triggerPxType"),
    attachAlgoOrds: buildAttachAlgoOrds(args),
  });
}

export function buildChaseOrdTypeBody(args: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    chaseType: readString(args, "chaseType"),
    chaseVal: readString(args, "chaseVal"),
    maxChaseType: readString(args, "maxChaseType"),
    maxChaseVal: readString(args, "maxChaseVal"),
  });
}

export function buildIcebergTwapOrdTypeBody(args: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    pxVar: readString(args, "pxVar"),
    pxSpread: readString(args, "pxSpread"),
    szLimit: readString(args, "szLimit"),
    pxLimit: readString(args, "pxLimit"),
    timeInterval: readString(args, "timeInterval"),
  });
}

/**
 * Common conditional/oco/move_order_stop default-branch fields shared by
 * swap/futures/spot algo handlers. Excludes the callback fields (`callBackRatio`
 * / `callBackSpread` vs `callbackRatio` / `callbackSpread`) due to casing
 * differences between modules; callers add those inline. Extracted to fix
 * Sonar `new_duplicated_lines_density` flagging the identical 10-line block
 * across all three algo tool handlers.
 */
export function buildAlgoConditionalCommonFields(args: Record<string, unknown>): Record<string, unknown> {
  return {
    tpTriggerPx: readString(args, "tpTriggerPx"),
    tpOrdPx: readString(args, "tpOrdPx"),
    tpOrdKind: readString(args, "tpOrdKind"),
    tpTriggerPxType: readString(args, "tpTriggerPxType"),
    tpTriggerRatio: readString(args, "tpTriggerRatio"),
    slTriggerPx: readString(args, "slTriggerPx"),
    slOrdPx: readString(args, "slOrdPx"),
    slTriggerPxType: readString(args, "slTriggerPxType"),
    slTriggerRatio: readString(args, "slTriggerRatio"),
    closeFraction: readString(args, "closeFraction"),
    activePx: readString(args, "activePx"),
  };
}

export function buildAttachAlgoOrds(
  source: Record<string, unknown>,
): Record<string, unknown>[] | undefined {
  // Phase 3b (issue #183): multi-entry path - CLI passes tpLevels as an array of level objects.
  // Each level is compacted and returned as a separate attachAlgoOrds entry.
  // This path takes priority over the single-entry path when tpLevels is a non-empty array.
  const tpLevels = source["tpLevels"];
  if (Array.isArray(tpLevels) && tpLevels.length > 0) {
    return (tpLevels as Record<string, unknown>[]).map((level) =>
      compactObject(level as Record<string, unknown>),
    );
  }

  // Backward-compat single-entry path (Phase 1 + Phase 2 + Phase 3a+c behaviour unchanged).
  const tpTriggerPx = readString(source, "tpTriggerPx");
  const tpOrdPx = readString(source, "tpOrdPx");
  const slTriggerPx = readString(source, "slTriggerPx");
  const slOrdPx = readString(source, "slOrdPx");
  const tpOrdKind = readString(source, "tpOrdKind");
  const tpTriggerPxType = readString(source, "tpTriggerPxType");
  const slTriggerPxType = readString(source, "slTriggerPxType");
  // Phase 3a+c CLI power-user flags - ratio-based triggers (issue #182, CLI-only)
  const tpTriggerRatio = readString(source, "tpTriggerRatio");
  const slTriggerRatio = readString(source, "slTriggerRatio");
  const entry = compactObject({
    tpTriggerPx,
    tpOrdPx,
    slTriggerPx,
    slOrdPx,
    tpOrdKind,
    tpTriggerPxType,
    slTriggerPxType,
    tpTriggerRatio,
    slTriggerRatio,
  });
  return Object.keys(entry).length > 0 ? [entry] : undefined;
}
