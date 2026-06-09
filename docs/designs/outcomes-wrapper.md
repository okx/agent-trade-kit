# OKX Outcomes — CLI-only Wrapper Design

**Status**: ✅ approved (CLI-only wrapper, no MCP tools)
**Date**: 2026-05-22

## Why this design

OKX Outcomes (YES/NO event contracts, CTF-based) ships as an independent Rust workspace ([`okx/outcomes-cli`](https://github.com/okx/outcomes-cli)) with its own SDK, CLI, and EIP-712 signing. Its capability surface is large (~30+ subcommands across `data`, `account`, `clob`, `ctf`), the team has its own release cadence, and the integration target is "let users do outcomes trading through the existing `okx` CLI / agent ecosystem **without re-implementing the business logic in TypeScript**".

Two integration options were considered:

- **Option A (TS deep integration)**: re-implement all tools as TypeScript `ToolSpec`s under `packages/core`, automatically get MCP exposure, OAuth / DoH / rate-limit reuse. Cost: requires the TypeScript team to own every outcomes change, doubles the codebase, and worsens an already-constrained MCP token budget.

- **Option B (Rust binary, independent distribution)**: keep outcomes logic in the Rust binary, distribute via the `install.sh` script at `github.com/okx/outcomes-cli` (pulls prebuilt GitHub Release tarballs), reuse `okx-pilot` / `okx-auth` via process spawn. Cost: the outcomes team implements its own HTTP / rate-limit / multi-site logic in Rust (one-time work).

**Option B** was chosen. This document specifies what `okx-trade-mcp` (this repo) contributes.

## Scope

This repo provides **only**:

1. A thin TypeScript wrapper (`packages/cli/src/commands/outcomes.ts`) that spawns the external `okx-outcomes` binary and forwards all arguments verbatim. Models the same pattern used by `okx auth`.
2. A registry entry in `packages/cli/src/cli-registry.ts` so `okx --help` lists `outcomes` alongside other modules and `okx outcomes --help` lists its subcommands.
3. A `skills/okx-outcomes/` skill (SKILL.md + `references/*`) that guides agents through event browsing, account queries, and dry-run-gated trading.
4. Documentation: this design doc, an entry in `docs/module-registry.md` (marked CLI-only), CHANGELOG and README updates.

This repo explicitly does **not**:

- Re-implement HTTP, rate-limit, multi-site, DoH, or auth logic for outcomes — those live inside the Rust binary.
- Expose any outcomes MCP tools — all `toolName` fields in the registry entry are `null`. Reasoning: the global MCP token budget is constrained, and adding outcomes tools would push it over. A future `okx-outcomes mcp` subcommand from the outcomes team is the planned integration path.
- Package or distribute the `okx-outcomes` binary itself. Distribution is owned by the outcomes team via the `install.sh` + GitHub Releases tarball pattern at `github.com/okx/outcomes-cli`.

## Naming conventions

| Layer | Name |
|---|---|
| Distribution channel | `github.com/okx/outcomes-cli` (`install.sh` + prebuilt {darwin,linux} {x64,arm64} tarballs from GitHub Releases) |
| Executable binary | `okx-outcomes` |
| CLI subcommand (this repo) | `okx outcomes <action>` |
| Skill (this repo) | `okx-outcomes` |
| Environment override | `OKX_OUTCOMES_BIN` (path to a custom binary, useful for local dev) |

## Wrapper responsibilities

- **PATH discovery**: search `$PATH` for `okx-outcomes`, with `OKX_OUTCOMES_BIN` env override. If the override is set but points at a non-existent path, emit a warning and fall back to PATH search.
- **Binary-not-found UX**: print a friendly install hint (`curl -fsSL https://raw.githubusercontent.com/okx/outcomes-cli/main/install.sh | sh` for macOS/Linux; download `okx-outcomes.exe` from GitHub Releases for Windows) and exit `127`.
- **Argument forwarding**: spawn the binary with `stdio: "inherit"`, transparent argument pass-through. Interactive subcommands like `setup` (env wizard) and `shell` (REPL) work because of `inherit`.
- **Global flag normalization**: if the user invoked `okx --json outcomes <cmd>`, auto-append `--json` to the forwarded args (unless already present). This matches behavior for other modules.
- **`okx outcomes --help`**: print a wrapper-level help summary (curated, abridged); for command-specific help defer to `okx outcomes <cmd> --help` (the binary's own help).
- **Exit-code propagation**: set `process.exitCode = code` when the binary returns non-zero.

## Authentication paths

OKX Outcomes uses **independent** authentication paths, none of which intersect with the main `okx` CLI's OAuth / API-key flow (outcomes has its own `okx outcomes auth login`):

| Class | Credential | Used by |
|---|---|---|
| Public | none | `data` / `clob price/book/midpoint/spread` |
| OAuth | OAuth session via `okx outcomes auth login` (token in keyring) | `account *` / `search` / `status` |
| EIP-712 | signing key (keyring `agent_private_key`, or `PREDICTIONS_AGENT_PRIVATE_KEY` override) | `clob create-order` / `clob cancel*` / `ctf *` / `wallet show` |

> Config is stored in `~/.okx-outcomes/config.json` (non-secret) + OS keyring (secrets); there is no `.env` auto-loading. The `PREDICTIONS_*` env-var prefix is legacy from the product's previous name; it is preserved by upstream as an override path. (The binary may still honor HMAC `PREDICTIONS_API_*` env vars as a fallback, but the supported / documented flow is OAuth.)

This is documented prominently in `skills/okx-outcomes/SKILL.md` to prevent users from confusing the two systems.

> **Agent-driven onboarding**: `okx outcomes auth login --manual` runs a device-code flow — it prints a `{verificationUri, userCode, expiresIn}` envelope and exits immediately (no stdin, no blocking), so an agent can drive sign-in end-to-end (relay the URL+code, the user authorizes in a browser, then `auth refresh` verifies). Combined with the non-interactive `setup region` / `setup bind`, the entire setup completes from the agent with no terminal. The `setup`/`shell` interactive wizards remain TTY-only.

## Test scope

- Unit test in `packages/cli/test/outcomes-routing.test.ts` covers: routing dispatch, argument forwarding, binary-not-found path, PATH search edge cases, `--help` output.
- Drift test ignores `outcomes` module commands automatically because `toolName: null`.
- Skill `description` length is enforced by the existing `skill-description-length.test.ts` (≤ 1024 chars).
- LLM eval probes (`eval/probes/outcomes/`) are **not** included in this MR — they are maintained separately by the eval infrastructure team.

## Future evolution (V2)

Once an `okx-outcomes mcp` subcommand exposing typed MCP tools ships, integrate them into `packages/mcp` via a new module entry in `module-registry.md`, register them through `buildTools()`, and re-evaluate the global token budget. At that point, `cli-registry.ts` entries can be upgraded from `toolName: null` to the real `outcomes_*` tool names without breaking existing wrapper behavior.

## References

- Upstream repo: <https://github.com/okx/outcomes-cli>
- Upstream binary docs: <https://github.com/okx/outcomes-cli/blob/main/docs/cli-reference.md>
- Existing precedent (external-binary wrapper pattern): `packages/cli/src/commands/auth.ts`
- Existing precedent (CLI-only registry entries): `auth`, `pilot`, `upgrade`, `setup` modules in `cli-registry.ts`
