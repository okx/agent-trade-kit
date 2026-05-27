# Prediction Markets — CLI-only Wrapper Design

**Status**: ✅ approved (CLI-only wrapper, no MCP tools)
**Date**: 2026-05-22
**Reference**: [okx-trade-mcp CLI 工具架构 + 预测市场对接方案 (Lark)](https://okg-block.sg.larksuite.com/docx/THw9dhbyzo9JBQxairkljrVBgAf)

## Why this design

OKX Prediction Markets (YES/NO event contracts, CTF-based) ship as an independent Rust workspace ([`okxpredictions`](https://github.com/okx/okxpredictions)) with its own SDK, CLI, and EIP-712 signing. Its capability surface is large (~30+ subcommands across `data`, `account`, `clob`, `ctf`), the team has its own release cadence, and the wider integration target is "let users do prediction-market trading through the existing `okx` CLI / agent ecosystem **without re-implementing the business logic in TypeScript**".

The Lark doc above lays out two integration options:

- **Option A (TS deep integration)**: re-implement all tools as TypeScript `ToolSpec`s under `packages/core`, automatically get MCP exposure, OAuth / DoH / rate-limit reuse. Cost: requires TypeScript team to own every prediction-market change, doubles the codebase, and worsens the already-over-budget MCP token cost.

- **Option B (Rust binary, independent distribution)**: keep prediction logic in the Rust binary, distribute via npm platform-specific subpackages (`@okx/predict-market-cli`), reuse `okx-pilot` / `okx-auth` via process spawn. Cost: prediction team must implement their own HTTP / rate-limit / multi-site logic in Rust (one-time work).

The team picked **Option B**. This document specifies what `okx-trade-mcp` (this repo) contributes to Option B.

## Scope of this MR

This repo provides **only**:

1. A thin TypeScript wrapper (`packages/cli/src/commands/prediction.ts`) that spawns the external `okx-predict` binary and forwards all arguments verbatim. Models the same pattern used by `okx auth`.
2. A registry entry in `packages/cli/src/cli-registry.ts` so `okx --help` lists `prediction` alongside other modules and `okx prediction --help` lists its subcommands.
3. A `skills/okx-prediction/` skill (SKILL.md + `references/*`) that guides agents through event browsing, account queries, and dry-run-gated trading on prediction markets.
4. Documentation: this design doc, an entry in `docs/module-registry.md` (marked CLI-only), and CHANGELOG / README updates.

This repo explicitly does **not**:

- Re-implement HTTP, rate-limit, multi-site, DoH, or auth logic for prediction markets — those live inside the Rust binary.
- Expose any prediction-market MCP tools — all `toolName` fields in the registry entry are `null`. Reasoning: current MCP token budget is already over (~47k / 25k); adding ~15 prediction tools would push it further. The prediction-markets team plans to ship its own MCP server (`okx-predict mcp`) in a follow-up release, which we will integrate then.
- Package or distribute the `@okx/predict-market-cli` binary. That work is owned by the prediction-markets team and follows the standard npm `optionalDependencies` platform-subpackage pattern (see Lark doc §2 / Option B / npm distribution).

## Naming conventions

| Layer | Name |
|---|---|
| npm main package (prediction team) | `@okx/predict-market-cli` |
| Platform subpackages (prediction team) | `@okx/predict-market-cli-{darwin-arm64,darwin-x64,linux-x64,linux-arm64,win32-x64}` |
| Executable binary | `okx-predict` |
| CLI subcommand (this repo) | `okx prediction <action>` |
| Skill (this repo) | `okx-prediction` |
| Environment override | `OKX_PREDICT_BIN` (path to a custom binary, useful for local dev) |

## Wrapper responsibilities (this repo)

- **PATH discovery**: search `$PATH` for `okx-predict`, with `OKX_PREDICT_BIN` env override.
- **Binary-not-found UX**: print a friendly install hint (`npm install -g @okx/predict-market-cli`) and exit `127`.
- **Argument forwarding**: spawn the binary with `stdio: "inherit"`, transparent argument pass-through. Interactive subcommands like `setup` (env wizard) and `shell` (REPL) work because of `inherit`.
- **Global flag normalization**: if the user invoked `okx --json prediction <cmd>`, auto-append `--json` to the forwarded args (unless already present). This matches behavior for other modules.
- **`okx prediction --help`**: print a wrapper-level help summary (curated, abridged); for command-specific help defer to `okx prediction <cmd> --help` (the binary's own help).
- **Exit-code propagation**: set `process.exitCode = code` when the binary returns non-zero.

## Authentication paths (binary's responsibility, repeated here for clarity)

Prediction markets use **three independent** auth paths, none of which intersect with the main `okx` CLI's OAuth / API-key flow:

| Class | Credential | Used by |
|---|---|---|
| Public | none | `data` / `search` / `clob price/book/midpoint/spread` |
| HMAC | `PREDICTIONS_API_KEY` / `_SECRET` / `_PASSPHRASE` | `account *` |
| EIP-712 | `PREDICTIONS_AGENT_PRIVATE_KEY` | `clob create-order` / `clob cancel*` / `ctf *` / `wallet show` |

This is documented prominently in `skills/okx-prediction/SKILL.md` to prevent users from confusing the two systems.

## Test scope

- Unit test in `packages/cli/test/prediction-routing.test.ts` covers: routing dispatch, argument forwarding, binary-not-found path, `--help` output.
- Drift test ignores `prediction` module commands automatically because `toolName: null`.
- Skill `description` length is enforced by the existing `skill-description-length.test.ts` (≤ 1024 chars).
- LLM eval probes (`eval/probes/prediction/`) are **not** included in this MR — owned by the ATK team in a follow-up. See Lark doc §4 "分工与责任边界 / ATK 团队" for the rationale.

## Future evolution (V2)

Once the prediction-markets team ships an `okx-predict mcp` subcommand exposing typed MCP tools, integrate them into `packages/mcp` via a new module entry in `module-registry.md`, register them through `buildTools()`, and re-evaluate the global token budget. At that point, `cli-registry.ts` entries can be upgraded from `toolName: null` to the real `prediction_*` tool names without breaking existing wrapper behavior.

## References

- Lark design doc: https://okg-block.sg.larksuite.com/docx/THw9dhbyzo9JBQxairkljrVBgAf
- Existing precedent (external-binary wrapper pattern): `packages/cli/src/commands/auth.ts`
- Existing precedent (CLI-only registry entries): `auth`, `pilot`, `upgrade`, `setup` modules in `cli-registry.ts`
- Upstream binary docs: `/Users/oker/meili/.../okxpredictions/docs/cli-reference.md`
