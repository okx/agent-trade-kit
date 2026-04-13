<!-- triggers: quality, compliance, testing, coverage, test infrastructure, node:test -->
# Quality & Compliance

This directory is reserved for quality assurance and compliance documentation. Content will be added as the project matures.

## Current Test Infrastructure

Tests use Node.js built-in `node:test` runner (no Jest/Vitest). Run with: `pnpm test:unit`.

For current test file counts and CI pipeline details, see `context-kg/technical/01-architecture.md#test-structure`.

## CI Pipeline

The CI pipeline (`.gitlab-ci.yml` and `.github/workflows/ci.yml`) runs on every push:
1. `pnpm install` — dependency installation
2. `pnpm build` — TypeScript compilation via tsup
3. `pnpm typecheck` — tsc type checking (no emit)
4. `pnpm test:unit` — unit tests

A separate smoke test workflow (`.github/workflows/smoke-test.yml`) runs against the live OKX API periodically.

## Planned Quality Improvements

- Add MCP server-level tests (tracked in known structure issues)
- Increase code coverage reporting via `sonar-project.properties`
- Add integration tests for multi-site scenarios

## Compliance Notes

- The project handles API credentials (HMAC signing). Credentials must never be logged or included in error messages.
- Write-operation tools (`isWrite: true`) require explicit user confirmation before execution.
- The `readOnly` mode provides a safe analysis-only surface for read-only API key holders.
