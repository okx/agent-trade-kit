import { ValidationError } from "../../utils/errors.js";

/**
 * Exact decimal helpers for Smart Portfolio validation. Values are parsed from
 * the raw string and never pass through Number, so binary floating-point error
 * cannot change a user's input (e.g. 0.29 * 100 = 28.999...).
 *
 * A decimal is held as `neg` + `digits` (significant digits, no leading or
 * trailing zeros; zero is "0") + `exp` (value = digits * 10^exp). Comparison
 * works on the position of the most significant digit, so extreme exponents are
 * handled arithmetically and never expanded into huge integers.
 *
 * The limits below are implementation guards against pathological input, not
 * business rules.
 */

/** Longest accepted raw string (after trim). */
export const MAX_DECIMAL_INPUT_LENGTH = 1024;
/** Longest exponent literal accepted (keeps the exponent a safe integer). */
const MAX_EXPONENT_LITERAL_LENGTH = 15;
/** Max decimal places for values that are expanded or summed. */
export const MAX_SCALE = 100;
/** Max integer digits for values that are expanded or summed. */
export const MAX_INTEGER_DIGITS = 100;

export interface ParsedDecimal {
  neg: boolean;
  digits: string;
  exp: number;
}

// [sign] (int[.frac] | .frac) [e[sign]exp]; linear-time, no ambiguous groups.
const DECIMAL_RE = /^([+-]?)(\d+\.?\d*|\.\d+)(?:[eE]([+-]?\d+))?$/;

function stripLeadingZeros(s: string): string {
  let i = 0;
  while (i < s.length - 1 && s[i] === "0") i++;
  return s.slice(i);
}

/** Parse a decimal / scientific-notation string. Rejects hex, Infinity, NaN and anything else. */
export function parseDecimal(raw: unknown, label: string): ParsedDecimal {
  if (typeof raw !== "string") {
    throw new ValidationError(`${label} must be a decimal number string, got: ${String(raw)}`);
  }
  const text = raw.trim();
  if (text.length > MAX_DECIMAL_INPUT_LENGTH) {
    throw new ValidationError(
      `${label} is too long (${text.length} characters, max ${MAX_DECIMAL_INPUT_LENGTH})`,
    );
  }
  const m = DECIMAL_RE.exec(text);
  if (!m) {
    throw new ValidationError(`${label} must be a decimal number string, got: ${text.slice(0, 64)}`);
  }
  const [, sign, mantissa, expLiteral] = m as unknown as [string, string, string, string | undefined];
  const expDigits = expLiteral === undefined ? "" : expLiteral.replace(/^[+-]/, "");
  if (expDigits.length > MAX_EXPONENT_LITERAL_LENGTH) {
    throw new ValidationError(`${label} has an exponent that is too large`);
  }
  const dot = mantissa.indexOf(".");
  const fracLen = dot === -1 ? 0 : mantissa.length - dot - 1;
  let digits = stripLeadingZeros(mantissa.replace(".", ""));
  let exp = (expLiteral === undefined ? 0 : Number(expLiteral)) - fracLen;
  if (/^0+$/.test(digits)) {
    return { neg: false, digits: "0", exp: 0 };
  }
  const trimmed = digits.replace(/0+$/, "");
  exp += digits.length - trimmed.length;
  digits = trimmed;
  return { neg: sign === "-", digits, exp };
}

function isZero(d: ParsedDecimal): boolean {
  return d.digits === "0";
}

/** Position of the most significant digit: value is in [10^(adj-1), 10^adj). */
function magnitude(d: ParsedDecimal): number {
  return d.digits.length + d.exp;
}

function compareMagnitude(a: ParsedDecimal, b: ParsedDecimal): -1 | 0 | 1 {
  const ma = magnitude(a);
  const mb = magnitude(b);
  if (ma !== mb) return ma > mb ? 1 : -1;
  const len = Math.max(a.digits.length, b.digits.length);
  const da = a.digits.padEnd(len, "0");
  const db = b.digits.padEnd(len, "0");
  if (da === db) return 0;
  return da > db ? 1 : -1;
}

/** Exact three-way comparison. */
export function compareDecimal(a: ParsedDecimal, b: ParsedDecimal): -1 | 0 | 1 {
  const za = isZero(a);
  const zb = isZero(b);
  if (za && zb) return 0;
  if (za) return b.neg ? 1 : -1;
  if (zb) return a.neg ? -1 : 1;
  if (a.neg !== b.neg) return a.neg ? -1 : 1;
  const c = compareMagnitude(a, b);
  return (a.neg ? -c : c) as -1 | 0 | 1;
}

/** Guard for values that will be expanded or summed (bounded integer digits and scale). */
export function assertExpandable(d: ParsedDecimal, label = "value"): void {
  if (isZero(d)) return;
  if (magnitude(d) > MAX_INTEGER_DIGITS) {
    throw new ValidationError(`${label} is too large (more than ${MAX_INTEGER_DIGITS} integer digits)`);
  }
  if (-d.exp > MAX_SCALE) {
    throw new ValidationError(`${label} has too many decimal places (max ${MAX_SCALE})`);
  }
}

/** Plain (non-scientific) decimal string; only for values within the expansion guards. */
export function toPlainString(d: ParsedDecimal): string {
  assertExpandable(d);
  if (isZero(d)) return "0";
  const sign = d.neg ? "-" : "";
  if (d.exp >= 0) return sign + d.digits + "0".repeat(d.exp);
  const point = d.digits.length + d.exp;
  if (point > 0) return `${sign}${d.digits.slice(0, point)}.${d.digits.slice(point)}`;
  return `${sign}0.${"0".repeat(-point)}${d.digits}`;
}

/** Exact sum of decimals as a scaled BigInt: sum = value / 10^scale. */
export function sumDecimalsToScale(values: ParsedDecimal[]): { value: bigint; scale: number } {
  values.forEach((v) => assertExpandable(v));
  const scale = Math.max(0, ...values.map((v) => (isZero(v) ? 0 : Math.max(0, -v.exp))));
  let value = 0n;
  for (const v of values) {
    if (isZero(v)) continue;
    const term = BigInt(v.digits) * 10n ** BigInt(v.exp + scale);
    value += v.neg ? -term : term;
  }
  return { value, scale };
}

/** Format a scaled BigInt (value / 10^scale) as a plain decimal string. */
export function formatScaled(value: bigint, scale: number): string {
  const sign = value < 0n ? "-" : "";
  const abs = (value < 0n ? -value : value).toString().padStart(scale + 1, "0");
  if (scale === 0) return sign + abs;
  return `${sign}${abs.slice(0, abs.length - scale)}.${abs.slice(abs.length - scale)}`;
}
