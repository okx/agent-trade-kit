/**
 * Test-only entry point for @agent-tradekit/core.
 *
 * Exposes internal hooks used by cross-package tests (e.g. the CLI upgrade
 * tests) to override the update-check fetch implementation. These are
 * deliberately kept OUT of the public "." barrel (src/index.ts) so production
 * consumers of the package cannot reach them and mutate the global fetch impl
 * at runtime. Import from "@agent-tradekit/core/testing" in tests only.
 *
 * See ALGO-45373 (#211) review: the `_` prefix communicates intent but does
 * not enforce the boundary — this subpath does.
 */
export { _setFetchImpl, _resetFetchImpl } from "./utils/update-check.js";
