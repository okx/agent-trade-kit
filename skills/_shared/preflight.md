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

## Step 2 — Skill version drift check

```bash
okx --version
```

1. Strip any prerelease suffix from the output (e.g. `1.2.9-beta.1` → `1.2.9`).
2. Compare the stable part against this skill's `metadata.version` (from the calling SKILL.md frontmatter).
3. If CLI stable version **>** skill `metadata.version`, show the following warning **once per session**:

   > ⚠️ CLI version is ahead of this skill. Some new commands may not be documented here. Consider refreshing your skill.

4. If already warned this session, skip.
