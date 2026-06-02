# Prediction Markets — CLI-only Wrapper Design

**Status**: ✅ approved (CLI-only wrapper, no MCP tools)
**Date**: 2026-05-22
**Reference**: [okx-trade-mcp CLI 工具架构 + 预测市场对接方案 (Lark)](https://okg-block.sg.larksuite.com/docx/THw9dhbyzo9JBQxairkljrVBgAf)

## Why this design

OKX Outcomes (YES/NO event contracts, CTF-based) ship as an independent Rust workspace ([`outcomes`](https://github.com/okx/outcomes)) with its own SDK, CLI, and EIP-712 signing. Its capability surface is large (~30+ subcommands across `data`, `account`, `clob`, `ctf`), the team has its own release cadence, and the wider integration target is "let users do outcomes trading through the existing `okx` CLI / agent ecosystem **without re-implementing the business logic in TypeScript**".

The Lark doc above lays out two integration options:

- **Option A (TS deep integration)**: re-implement all tools as TypeScript `ToolSpec`s under `packages/core`, automatically get MCP exposure, OAuth / DoH / rate-limit reuse. Cost: requires TypeScript team to own every outcomes change, doubles the codebase, and worsens the already-over-budget MCP token cost.

- **Option B (Rust binary, independent distribution)**: keep outcomes logic in the Rust binary, distribute via the `install.sh` script at `github.com/okx/outcomes` (pulls prebuilt GitHub Release tarballs), reuse `okx-pilot` / `okx-auth` via process spawn. Cost: outcomes team must implement their own HTTP / rate-limit / multi-site logic in Rust (one-time work).

The team picked **Option B**. This document specifies what `okx-trade-mcp` (this repo) contributes to Option B.

## Scope of this MR

This repo provides **only**:

1. A thin TypeScript wrapper (`packages/cli/src/commands/outcomes.ts`) that spawns the external `okx-outcomes` binary and forwards all arguments verbatim. Models the same pattern used by `okx auth`.
2. A registry entry in `packages/cli/src/cli-registry.ts` so `okx --help` lists `outcomes` alongside other modules and `okx outcomes --help` lists its subcommands.
3. A `skills/okx-outcomes/` skill (SKILL.md + `references/*`) that guides agents through event browsing, account queries, and dry-run-gated trading on outcomes markets.
4. Documentation: this design doc, an entry in `docs/module-registry.md` (marked CLI-only), and CHANGELOG / README updates.

This repo explicitly does **not**:

- Re-implement HTTP, rate-limit, multi-site, DoH, or auth logic for outcomes — those live inside the Rust binary.
- Expose any outcomes MCP tools — all `toolName` fields in the registry entry are `null`. Reasoning: current MCP token budget is already over (~47k / 25k); adding ~15 outcomes tools would push it further. The outcomes team plans to ship its own MCP server (`okx-outcomes mcp`) in a follow-up release, which we will integrate then.
- Package or distribute the `okx-outcomes` binary itself. Distribution is owned by the outcomes team via the `install.sh` + GitHub Releases tarball pattern at `github.com/okx/outcomes` (see Lark doc §2 / Option B / GitHub distribution).

## Naming conventions

| Layer | Name |
|---|---|
| Distribution channel (outcomes team) | `github.com/okx/outcomes` (`install.sh` + prebuilt {darwin,linux} {x64,arm64} tarballs from GitHub Releases) |
| Executable binary | `okx-outcomes` |
| CLI subcommand (this repo) | `okx outcomes <action>` |
| Skill (this repo) | `okx-outcomes` |
| Environment override | `OKX_OUTCOMES_BIN` (path to a custom binary, useful for local dev) |

## Wrapper responsibilities (this repo)

- **PATH discovery**: search `$PATH` for `okx-outcomes`, with `OKX_OUTCOMES_BIN` env override.
- **Binary-not-found UX**: print a friendly install hint (`curl -fsSL https://raw.githubusercontent.com/okx/outcomes/master/install.sh | sh`) and exit `127`.
- **Argument forwarding**: spawn the binary with `stdio: "inherit"`, transparent argument pass-through. Interactive subcommands like `setup` (env wizard) and `shell` (REPL) work because of `inherit`.
- **Global flag normalization**: if the user invoked `okx --json outcomes <cmd>`, auto-append `--json` to the forwarded args (unless already present). This matches behavior for other modules.
- **`okx outcomes --help`**: print a wrapper-level help summary (curated, abridged); for command-specific help defer to `okx outcomes <cmd> --help` (the binary's own help).
- **Exit-code propagation**: set `process.exitCode = code` when the binary returns non-zero.

## Authentication paths (binary's responsibility, repeated here for clarity)

OKX Outcomes uses **three independent** auth paths, none of which intersect with the main `okx` CLI's OAuth / API-key flow:

| Class | Credential | Used by |
|---|---|---|
| Public | none | `data` / `search` / `clob price/book/midpoint/spread` |
| HMAC | `PREDICTIONS_API_KEY` / `_SECRET` / `_PASSPHRASE` | `account *` |
| EIP-712 | `PREDICTIONS_AGENT_PRIVATE_KEY` | `clob create-order` / `clob cancel*` / `ctf *` / `wallet show` |

This is documented prominently in `skills/okx-outcomes/SKILL.md` to prevent users from confusing the two systems.

## Test scope

- Unit test in `packages/cli/test/outcomes-routing.test.ts` covers: routing dispatch, argument forwarding, binary-not-found path, `--help` output.
- Drift test ignores `outcomes` module commands automatically because `toolName: null`.
- Skill `description` length is enforced by the existing `skill-description-length.test.ts` (≤ 1024 chars).
- LLM eval probes (`eval/probes/outcomes/`) are **not** included in this MR — owned by the ATK team in a follow-up. See Lark doc §4 "分工与责任边界 / ATK 团队" for the rationale.

## Future evolution (V2)

Once the outcomes team ships an `okx-outcomes mcp` subcommand exposing typed MCP tools, integrate them into `packages/mcp` via a new module entry in `module-registry.md`, register them through `buildTools()`, and re-evaluate the global token budget. At that point, `cli-registry.ts` entries can be upgraded from `toolName: null` to the real `outcomes_*` tool names without breaking existing wrapper behavior.

## References

- Lark design doc: https://okg-block.sg.larksuite.com/docx/THw9dhbyzo9JBQxairkljrVBgAf
- Existing precedent (external-binary wrapper pattern): `packages/cli/src/commands/auth.ts`
- Existing precedent (CLI-only registry entries): `auth`, `pilot`, `upgrade`, `setup` modules in `cli-registry.ts`
- Upstream binary docs: https://github.com/okx/outcomes/blob/master/docs/cli-reference.md
