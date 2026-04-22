import { errorLine } from "./formatter.js";

/**
 * Emit a signed "unknown subcommand" error and set a non-zero exit code.
 *
 * Called from each module's handle*Command function when `action` does not
 * match any registered subcommand. Without this, the handler silently returned
 * undefined and `main()` exited 0 — making every typo look like a no-op success
 * (issue #173, reported via customer Telegram 2026-04-21).
 *
 * Suggestions are heuristic:
 *   - `place-algo` → `algo place` (MCP tool names `<mod>_<action>_<object>` invert to CLI `<mod> <action> <object>` subcommand paths).
 *   - Fall back to listing all registered actions.
 */
export function unknownSubcommand(
  module: string,
  action: string | undefined,
  knownActions: readonly string[],
): void {
  const actionStr = action ?? "(missing)";
  errorLine(`Unknown command: okx ${module} ${actionStr}`);

  const hint = suggestSubcommand(action, knownActions);
  if (hint) {
    errorLine(`  Did you mean: okx ${module} ${hint} ?`);
  }

  if (knownActions.length > 0) {
    errorLine(`  Available subcommands: ${knownActions.join(", ")}`);
  }
  errorLine(`  Run 'okx ${module} --help' for full usage.`);
  process.exitCode = 1;
}

/**
 * Best-effort suggestion for common typos. Currently:
 *   - Converts `x-y` (MCP-ish hyphen form) to `y x` if both halves are plausible.
 *     E.g. `place-algo` → `algo place` (matches MCP tool `<mod>_place_algo_order`).
 *
 * Returns undefined when no confident suggestion is available.
 */
export function suggestSubcommand(
  action: string | undefined,
  knownActions: readonly string[],
): string | undefined {
  if (!action || !action.includes("-")) return undefined;
  const parts = action.split("-");
  if (parts.length !== 2) return undefined;
  const [a, b] = parts;
  // `x-y` → try `y x` form (MCP tool name inversion).
  if (knownActions.includes(b)) {
    return `${b} ${a}`;
  }
  return undefined;
}
