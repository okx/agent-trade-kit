import { ValidationError } from "../utils/errors.js";

/**
 * `params` contract for market_get_indicator.
 *
 * Two ways to call an indicator covered here:
 *   1. omit `params`  -> the default below is applied;
 *   2. pass `params`  -> it must be complete (see ParamSpec) and every value valid.
 *
 * Defaults and ranges follow the AIGC indicators backend contract
 * (paramList is `int32[]`; period slots are validated as integers in 2..365,
 * `bb` multiplier / `supertrend` factor as integers in 1..9). Indicators with no
 * entry here are passed through untouched.
 */

const PERIOD_MIN = 2;
const PERIOD_MAX = 365;
const FACTOR_MIN = 1;
const FACTOR_MAX = 9;

type SlotKind = "period" | "factor";

interface Slot {
  readonly name: string;
  readonly kind: SlotKind;
}

type ParamSpec =
  /** Exactly `slots.length` values, one per slot. */
  | { readonly kind: "fixed"; readonly slots: readonly Slot[]; readonly defaults: readonly number[] }
  /** One or more periods (e.g. ma 5,20,60). */
  | { readonly kind: "multi"; readonly defaults: readonly number[] };

const period = (name: string): Slot => ({ name, kind: "period" });
const factor = (name: string): Slot => ({ name, kind: "factor" });
const fixed = (slots: Slot[], defaults: number[]): ParamSpec => ({ kind: "fixed", slots, defaults });
const multi = (defaults: number[]): ParamSpec => ({ kind: "multi", defaults });
const single = (defaults: number): ParamSpec => fixed([period("period")], [defaults]);

/** Keyed by the lowercase indicator name (matching KNOWN_INDICATORS[].name). */
const PARAM_SPECS: Readonly<Record<string, ParamSpec>> = {
  // Multi-period
  ma: multi([5, 20, 60]),
  ema: multi([5, 20]),
  rsi: multi([14]),
  wr: multi([14]),
  wma: multi([14]),
  dema: multi([14]),
  tema: multi([14]),
  zlema: multi([14]),
  hma: multi([14]),
  kama: multi([14]),
  // Fixed length
  macd: fixed([period("fast"), period("slow"), period("signal")], [12, 26, 9]),
  kdj: fixed([period("n"), period("kSmooth"), period("dSmooth")], [9, 3, 3]),
  bb: fixed([period("period"), factor("multiplier")], [20, 2]),
  supertrend: fixed([factor("factor"), period("atrPeriod")], [3, 10]),
  "stoch-rsi": fixed([period("rsi"), period("stoch"), period("k"), period("d")], [14, 14, 3, 3]),
  stoch: fixed([period("kPeriod"), period("dPeriod")], [14, 3]),
  ppo: fixed([period("short"), period("long"), period("signal")], [12, 26, 9]),
  uo: fixed([period("fast"), period("medium"), period("slow")], [7, 14, 28]),
  bbwidth: fixed([period("period"), period("multiplier")], [20, 2]),
  bbpct: fixed([period("period"), period("multiplier")], [20, 2]),
  keltner: fixed([period("emaPeriod"), period("atrPeriod"), period("multiplierX10")], [20, 10, 20]),
  mvwap: fixed([period("vwapPeriod"), period("mvwapPeriod")], [14, 14]),
  // Single period
  adx: single(14),
  aroon: single(25),
  cci: single(20),
  dpo: single(20),
  roc: single(12),
  mom: single(10),
  trix: single(18),
  atr: single(14),
  mfi: single(14),
  cmf: single(20),
  donchian: single(20),
  hv: single(20),
  stddev: single(20),
};

/**
 * CLI aliases that share another indicator's contract. Keep in sync with the aliases in
 * INDICATOR_CODE_OVERRIDES (indicator.ts); a test asserts the alias resolves to a spec.
 */
const SPEC_ALIASES: Readonly<Record<string, string>> = { boll: "bb" };

function resolveSpecKey(name: string): string {
  const lower = name.toLowerCase();
  return SPEC_ALIASES[lower] ?? lower;
}

function lookup(name: string): ParamSpec | undefined {
  return PARAM_SPECS[resolveSpecKey(name)];
}

/** Default `paramList` per indicator, derived from the specs (single source of truth). */
export const INDICATOR_DEFAULT_PARAMS: Readonly<Record<string, readonly number[]>> = Object.freeze(
  Object.fromEntries(Object.entries(PARAM_SPECS).map(([name, spec]) => [name, spec.defaults])),
);

export function hasIndicatorParamSpec(name: string): boolean {
  return lookup(name) !== undefined;
}

/** Default params for an indicator with a spec (alias-aware), else undefined. */
export function getSpecDefaultParams(name: string): number[] | undefined {
  const spec = lookup(name);
  return spec ? [...spec.defaults] : undefined;
}

function plural(n: number): string {
  return n === 1 ? "1 param" : `${n} params`;
}

function rangeText(kind: SlotKind): string {
  return kind === "period" ? `${PERIOD_MIN}-${PERIOD_MAX}` : `${FACTOR_MIN}-${FACTOR_MAX}`;
}

/** Human-readable signature, default and example, appended to every validation error. */
export function formatIndicatorSignature(name: string): string {
  const key = resolveSpecKey(name);
  const spec = PARAM_SPECS[key];
  if (!spec) return key;
  const def = spec.defaults.join(",");
  const tail = `Default: ${def}. Example: params [${def}] (CLI: --params ${def})`;
  if (spec.kind === "multi") {
    return `${key} requires one or more periods (integers ${PERIOD_MIN}-${PERIOD_MAX}). ${tail}`;
  }
  return `${key} requires ${plural(spec.slots.length)} (${spec.slots.map((s) => s.name).join(",")}). ${tail}`;
}

/** Compact "name default" list for tool descriptions, grouping indicators that share a default. */
export function describeIndicatorDefaults(): string {
  const groups = new Map<string, string[]>();
  for (const [name, spec] of Object.entries(PARAM_SPECS)) {
    const key = spec.defaults.join(",");
    groups.set(key, [...(groups.get(key) ?? []), name]);
  }
  return [...groups.entries()].map(([def, names]) => `${names.join("/")} ${def}`).join("; ");
}

function checkSlot(key: string, slot: Slot, value: number, position: number): void {
  const min = slot.kind === "period" ? PERIOD_MIN : FACTOR_MIN;
  const max = slot.kind === "period" ? PERIOD_MAX : FACTOR_MAX;
  if (Number.isInteger(value) && value >= min && value <= max) return;
  throw new ValidationError(
    `${key} param #${position + 1} (${slot.name}) must be an integer in ${rangeText(slot.kind)}, got ${String(value)}. ${formatIndicatorSignature(key)}`,
  );
}

/**
 * Validate explicit `params` against the indicator's contract. No-op for empty
 * params and for indicators without a spec (they are passed through).
 */
export function validateIndicatorParams(name: string, params: readonly number[]): void {
  if (params.length === 0) return;
  const key = resolveSpecKey(name);
  const spec = PARAM_SPECS[key];
  if (!spec) return;

  if (spec.kind === "multi") {
    params.forEach((value, i) => checkSlot(key, period("period"), value, i));
    return;
  }
  if (params.length !== spec.slots.length) {
    throw new ValidationError(
      `${key} requires ${plural(spec.slots.length)} (${spec.slots.map((s) => s.name).join(",")}), got ${params.length}: [${params.join(",")}]. ` +
        `Default: ${spec.defaults.join(",")}. Example: params [${spec.defaults.join(",")}] (CLI: --params ${spec.defaults.join(",")})`,
    );
  }
  spec.slots.forEach((slot, i) => checkSlot(key, slot, params[i], i));
}
