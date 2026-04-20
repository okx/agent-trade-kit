---
name: okx-cex-skill-mp
description: "Use this skill when the user asks to: 'find a trading skill', 'search for skills', 'install a skill', 'add a skill', 'download a skill', 'browse skill marketplace', 'what skills are available', 'update a skill', 'check for skill updates', 'remove a skill', 'uninstall a skill', 'list installed skills', 'show my skills', 'skill categories', or any request to discover, install, update, or manage AI trading skills from the OKX Skills Marketplace. This skill covers searching, browsing categories, installing via CLI, downloading zip packages, checking for updates, and removing installed skills. Requires API credentials for marketplace API access. Do NOT use for placing orders (use okx-cex-trade), market data (use okx-cex-market), or bot management (use okx-cex-bot)."
license: MIT
metadata:
  author: okx
  version: "1.3.1"
  homepage: "https://www.okx.com"
  agent:
    requires:
      bins: ["okx"]
    install:
      - id: npm
        kind: node
        package: "@okx_ai/okx-trade-cli"
        bins: ["okx"]
        label: "Install okx CLI (npm)"
---

# OKX Skills Marketplace

Browse, search, install, and manage AI trading skills from the OKX Skills Marketplace. Skills are modular AI prompt packages that extend your trading assistant's capabilities — covering market analysis, trade execution, risk management, and portfolio optimization.

> **⚠️ Third-Party Content Notice**
> Skills available on the OKX Skills Marketplace are created and published by **independent third-party developers**, not by OKX. OKX does not author, review, endorse, or take responsibility for the content, accuracy, or behavior of any third-party skill. Always review a skill's SKILL.md before use, and only install skills from authors you trust.
> When a skill is installed via `okx skill add`, it is downloaded from the marketplace and saved locally to your agent's skill directory (e.g., `~/.agents/skills/<skill-name>/`). The skill runs entirely on your local machine with your agent's full permissions — treat it with the same caution as installing any third-party software.

**Skill routing**
- Skill marketplace → `okx-cex-skill-mp` (this skill)
- Market data / indicators → `okx-cex-market`
- Account balance / positions → `okx-cex-portfolio`
- Place / cancel orders → `okx-cex-trade`
- Grid / DCA bots → `okx-cex-bot`

## Prerequisites

1. Install `okx` CLI:
   ```bash
   npm install -g @okx_ai/okx-trade-cli
   ```
2. Configure API credentials (required for marketplace access):
   ```bash
   okx config init
   ```

---

## Installation Strategy

When the user wants to install a skill, follow this order strictly:

1. **Always try `okx skill add <name>` first** — this downloads the skill and installs it to all detected agents (Claude Code, OpenClaw, Cursor, Windsurf, etc.) in one step.
2. **Only if `add` fails**, fall back to manual download:
   - Tell the user why `add` failed (network error, npx unavailable, permission issue, etc.)
   - Offer `okx skill download <name> --dir <path>` as an alternative
   - Guide the user to manually unzip and place files in their agent's skill directory

Never skip `add` and go straight to `download` unless `add` has already failed.

---

## Command Reference

| # | Command | Description |
|---|---------|-------------|
| 1 | `okx skill search <keyword>` | Search marketplace by keyword |
| 2 | `okx skill search --categories <id>` | Filter skills by category |
| 3 | `okx skill categories` | List all available categories |
| 4 | `okx skill add <name>` | Download + install to all detected agents |
| 5 | `okx skill download <name> [--dir <path>] [--format zip\|skill]` | Download package (default format: zip) |
| 6 | `okx skill list` | List locally installed skills |
| 7 | `okx skill check <name>` | Check if a newer version is available |
| 8 | `okx skill remove <name>` | Uninstall a skill |

Add `--json` to any command for raw JSON output. Add `--env` to wrap the output as `{"env", "profile", "data"}`.

---

## Commands in Detail

### 1. Search Skills

```bash
okx skill search grid
```

Output:
```
  NAME              VERSION   DESCRIPTION
  grid-premium      1.2.0     Enhanced grid trading with technical analysis
  grid-dca          1.0.0     Grid strategy combined with DCA

2 skills found (page 1/1). Use `okx skill add <name>` to install.
```

Search with category filter:
```bash
okx skill search --categories trading-strategy
```

Pagination (response includes `totalPage` for total pages):
```bash
okx skill search grid --page 2 --limit 5
# Output: "3 skills found (page 2/4). Use `okx skill add <name>` to install."
```

### 2. Browse Categories

```bash
okx skill categories
```

Output:
```
  ID                  NAME
  trading-strategy    Trading Strategy
  risk-management     Risk Management
  analysis            Market Analysis
```

### 3. Install a Skill

```bash
okx skill add grid-premium
```

Output:
```
Downloading grid-premium...
Installing to detected agents...
✓ Skill "grid-premium" v1.2.0 installed
```

What happens under the hood:
1. Downloads skill zip from OKX marketplace API
2. Extracts and validates the package (checks SKILL.md exists, reads metadata)
3. Runs `npx skills add` to install to all locally detected agents
4. Records the installation in `~/.okx/skills/registry.json`

### 4. Download Only (No Install)

When `add` fails or the user wants the raw package:

```bash
okx skill download grid-premium --dir ~/Downloads/
```

Output:
```
✓ Downloaded grid-premium.zip
  Path: /Users/me/Downloads/grid-premium.zip
```

To download as `.skill` format (for agents that recognize the extension):
```bash
okx skill download grid-premium --dir ~/Downloads/ --format skill
```

The zip contains:
- `SKILL.md` — the skill's main instruction file
- `_meta.json` — metadata (name, version, title, description)
- `reference/` — optional supporting documents

### 5. List Installed Skills

```bash
okx skill list
```

Output:
```
  NAME              VERSION   INSTALLED AT
  grid-premium      1.2.0     2026-03-25 10:30:00
  dca-smart         2.1.0     2026-03-20 14:00:00

2 skills installed.
```

### 6. Check for Updates

```bash
okx skill check grid-premium
```

Output:
```
grid-premium: installed v1.0.0 → latest v1.2.0 (update available)
  Use `okx skill add grid-premium` to update.
```

To update, simply run `okx skill add <name>` again — it overwrites the previous version.

### 7. Remove a Skill

```bash
okx skill remove grid-premium
```

Output:
```
✓ Skill "grid-premium" removed
```

---

## MCP Tools (Alternative)

When the CLI is unavailable (e.g., Claude Desktop without terminal access), the same marketplace functionality is available via MCP tools:

| MCP Tool | Equivalent CLI | Description |
|----------|---------------|-------------|
| `skills_search` | `okx skill search` | Search by keyword/category. Response includes `totalPage` for pagination. |
| `skills_get_categories` | `okx skill categories` | List categories |
| `skills_download` | `okx skill download` | Download package to directory (default format: `.skill`; pass `format: "zip"` for zip) |

Note: MCP tools only support search and download. The full install flow (`add`) requires CLI access.

---

## Error Handling

| Error | Meaning | Action |
|-------|---------|--------|
| `70002 SKILL_DELETED` | Skill has been removed from marketplace | Choose a different skill |
| `70003 NO_APPROVED_VERSION` | No approved version available | Skill is pending review, try later |
| `70030 VERSION_NOT_APPROVED` | Version not yet approved for download | Wait for review or use an older version |
| `50111/50112/50113` | Authentication error | Run `okx config init` to set up credentials |
| `npx skills add` fails | npx not available or network issue | Use `okx skill download` instead, then manually install |
