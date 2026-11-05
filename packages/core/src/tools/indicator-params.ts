import { ValidationError } from "../utils/errors.js";

/**
 * Per-indicator `params` validation for market_get_indicator.
 *
 * Source of truth: skills/okx-cex-market/references/indicator-commands.md.
 * Only indicators whose usage is spelled out there are validated; everything
 * else (rows documented as "—", unknown names) is passed through to the
 * backend untouched so working calls are never rejected locally.
 */

type FieldKind = "int" | "number";

interface ParamField {
  readonly name: string;
  readonly kind: FieldKind;
}

type ParamSpec =
  | { readonly kind: "fixed"; readonly fields: readonly ParamField[]; readonly example: readonly number[] }
  | { readonly kind: "variadic"; readonly field: ParamField; readonly example: readonly number[] }
  | { readonly kind: "none" };

const period: ParamField = { name: "period", kind: "int" };

const PARAM_SPECS: Readonly<Record<string, ParamSpec>> = {
  macd: {
    kind: "fixed",
    fields: [{ name: "fast", kind: "int" }, { name: "slow", kind: "int" }, { name: "signal", kind: "int" }],
    example: [12, 26, 9],
  },
  kdj: {
    kind: "fixed",
    fields: [{ name: "k", kind: "int" }, { name: "d", kind: "int" }, { name: "j", kind: "int" }],
    example: [9, 3, 3],
  },
  bb: { kind: "fixed", fields: [period, { name: "stddev", kind: "number" }], example: [20, 2] },
  supertrend: { kind: "fixed", fields: [period, { name: "multiplier", kind: "number" }], example: [10, 3] },
  envelope: { kind: "fixed", fields: [period, { name: "deviation", kind: "number" }], example: [20, 0.1] },
  rsi: { kind: "fixed", fields: [period], example: [14] },
  "stoch-rsi": { kind: "fixed", fields: [period], example: [14] },
  ma: { kind: "variadic", field: period, example: [5, 20, 60] },
  ema: { kind: "variadic", field: period, example: [5, 20] },
  // Documented as "No params needed".
  alphatrend: { kind: "none" },
  halftrend: { kind: "none" },
  pmax: { kind: "none" },
};

/** CLI aliases that map to a spec key (mirrors INDICATOR_CODE_OVERRIDES in indicator.ts). */
const SPEC_ALIASES: Readonly<Record<string, string>> = { boll: "bb" };

function resolveSpecKey(name: string): string {
  const lower = name.toLowerCase();
  return SPEC_ALIASES[lower] ?? lower;
}

export function isDocumentedIndicator(name: string): boolean {
  return resolveSpecKey(name) in PARAM_SPECS;
}

function plural(n: number): string {
  return n === 1 ? "1 param" : `${n} params`;
}

/** Human-readable signature + example, appended to every validation error. */
export function formatIndicatorSignature(name: string): string {
  const key = resolveSpecKey(name);
  const spec = PARAM_SPECS[key];
  if (!spec) return key;
  if (spec.kind === "none") return `${key} takes no params`;
  const example = spec.example.join(",");
  const tail = `Example: params [${example}] (CLI: --params ${example})`;
  if (spec.kind === "variadic") {
    return `${key} requires one or more ${spec.field.name} values. ${tail}`;
  }
  return `${key} requires ${plural(spec.fields.length)} (${spec.fields.map((f) => f.name).join(",")}). ${tail}`;
}

function checkValue(key: string, field: ParamField, value: number, position: number): void {
  const valid = Number.isFinite(value) && value > 0 && (field.kind === "number" || Number.isInteger(value));
  if (valid) return;
  const expected = field.kind === "int" ? "a positive integer" : "a positive number";
  throw new ValidationError(
    `${key} param #${position + 1} (${field.name}) must be ${expected}, got ${String(value)}. ${formatIndicatorSignature(key)}`,
  );
}

/**
 * Validate explicit `params` for a documented indicator. No-op for empty
 * params, undocumented indicators and unknown names.
 */
export function validateIndicatorParams(name: string, params: readonly number[]): void {
  if (params.length === 0) return;
  const key = resolveSpecKey(name);
  const spec = PARAM_SPECS[key];
  if (!spec) return;

  if (spec.kind === "none") {
    throw new ValidationError(`${formatIndicatorSignature(key)}, got ${params.length}: [${params.join(",")}].`);
  }
  if (spec.kind === "variadic") {
    params.forEach((value, i) => checkValue(key, spec.field, value, i));
    return;
  }
  if (params.length !== spec.fields.length) {
    throw new ValidationError(
      `${key} requires ${plural(spec.fields.length)} (${spec.fields.map((f) => f.name).join(",")}), got ${params.length}: [${params.join(",")}]. ` +
        `Example: params [${spec.example.join(",")}] (CLI: --params ${spec.example.join(",")})`,
    );
  }
  spec.fields.forEach((field, i) => checkValue(key, field, params[i]!, i));
}
