[English](./skills.md) | [中文](./skills.zh-CN.md)

# Skills Marketplace Module

The `skills` module provides tools for browsing, searching, and downloading AI trading skills from the OKX Skills Marketplace.

> **Third-Party Content Notice:** Skills on the OKX Skills Marketplace are created by independent third-party developers. OKX does not review or endorse their content. Always review a skill's SKILL.md before installation.

## Module ID

`skills` — enabled by default.

## MCP Tools

| Tool | Description | Read/Write |
|------|-------------|------------|
| `skills_get_categories` | List all available skill categories | Read |
| `skills_search` | Search skills by keyword or category. Returns `totalPage` for pagination. | Read |
| `skills_download` | Download a skill package to a local directory. Supports `format` param: `"skill"` (default) or `"zip"`. | Write |

## CLI Commands

```bash
okx skill search <keyword>          # Search marketplace
okx skill categories                # List categories
okx skill add <name>                # Download + install via npx skills add
okx skill download <name> [--dir] [--format zip|skill]  # Download only (default: zip)
okx skill remove <name>             # Uninstall a skill
okx skill check <name>              # Check for updates
okx skill list                      # List installed skills
```

## Authentication

All skills API endpoints require OKX standard authentication (OK-ACCESS-KEY / SIGN / TIMESTAMP / PASSPHRASE).

## How `okx skill add` Works

1. Downloads the skill zip from the marketplace API
2. Extracts to a temporary directory
3. Reads `_meta.json` (injected by backend) for name, version, title, description
4. Validates `SKILL.md` exists
5. Runs `npx skills add <dir> -y` to install to all detected agents
6. Updates local registry at `~/.okx/skills/registry.json`
7. Cleans up the temporary directory

## Local Registry

Installed skills are tracked in `~/.okx/skills/registry.json`. This file only records version metadata — actual installation paths are managed by `npx skills add`.
