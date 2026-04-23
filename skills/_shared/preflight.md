# OKX CLI Preflight

Execute these steps **once per session**, before running any OKX skill command.

## Step 1 — CLI auto-upgrade (12 h throttle)

```bash
okx upgrade
```

This command:
- Silently skips if the last check was fewer than 12 hours ago
- Queries `dist-tags.latest` from the npm registry if the cache has expired
- Installs `@okx_ai/okx-trade-mcp` and `@okx_ai/okx-trade-cli` if a newer stable version is found
- Updates `~/.okx/last_check` after a successful check

## Optional: capability discovery

If you are unsure which CLI commands are available for a given module, run:

```bash
okx list-tools --json
```

This outputs a machine-readable JSON listing of all CLI modules, commands, tool names, and parameters. Use it to enumerate capabilities without parsing `--help` text.

## Step 2 — Detect auth method (once per session)

Run **both** commands — they report different things and must be combined:

```bash
okx config show --json      # reveals API-key profiles (TOML config)
okx auth status --json      # reveals OAuth session state (auth-binary state)
```

> ⚠ **DO NOT** rely on the `apiKey` field from `okx auth status --json` to detect API-key mode. That field reports the auth-binary's internal state and is `false` regardless of whether `~/.okx/config.toml` has an API-key profile. The only authoritative source of truth for "has API key credentials" is `okx config show --json`.

Decision table (applied **in this order** — first match wins):

| Condition | Auth method | Action |
|---|---|---|
| `config show --json` has any profile with a non-empty `api_key` field | **API Key** | Use it. The REST client prefers API key over OAuth and never falls back. Use `--profile <name>` to select profile for demo/live switching. DO NOT run `okx auth login` — the CLI will refuse with `{"status":"skipped","reason":"api_key_configured",...}` anyway. |
| No API-key profile **AND** `auth status --json` returns `"status":"logged_in"` | **OAuth** | Use it. `--demo` flag controls trading mode. |
| No API-key profile **AND** `auth status --json` returns `"status":"pending"` | OAuth login in progress | Wait / poll; do not start a new login. |
| No API-key profile **AND** `auth status --json` returns `"status":"not_logged_in"` | **No auth** | Stop — load `okx-cex-auth` skill to login. |

**Remember the outcome for the entire session.** Auth-method branching drives demo/live switching for every subsequent command.

**API Key users** have one or more profiles in `~/.okx/config.toml`, each carrying its own `demo` flag and `site`. Use `--profile <name>` to select the correct profile; do **not** use `--demo` alone because it won't pick a profile.

**OAuth users** have a single implicit `oauth` profile without a `demo` field. Use `--demo` to enable simulated trading, or omit for live (default). Do **not** use `--profile` to switch modes — OAuth profiles don't carry demo/live.

## Step 3 — Skill version drift check

```bash
okx --version
```

1. If the output contains a prerelease suffix (e.g. `-beta`, `-alpha`, `-rc`), **skip this step entirely** — the stable release has not yet shipped, so no drift exists.
2. Otherwise (pure stable version, e.g. `1.2.8`), compare against this skill's `metadata.version` (from the calling SKILL.md frontmatter).
3. If CLI stable version **>** skill `metadata.version`, show the following warning **once per session**:

   > ⚠️ CLI version is ahead of this skill. Some new commands may not be documented here. Consider refreshing your skill.

4. If already warned this session, skip.
