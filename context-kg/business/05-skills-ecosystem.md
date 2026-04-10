<!-- triggers: skill, skills, marketplace, install, download, SKILL.md, agent-hub, workflow, preflight, version sync, metadata, pack -->
# Skills Ecosystem

## What Are Skills?

Skills are structured knowledge packs that teach an AI agent *how* to use the OKX trading tools. They live in the `skills/` directory of this repo and are published to the agent-hub marketplace. When a user installs a skill, the agent gains:

- **Workflows**: step-by-step guides for common operations (e.g., "how to open a futures position")
- **Preflight checks**: safety checks before write operations (e.g., verify leverage before placing a leveraged order)
- **Edge cases**: known failure modes and how to handle them (e.g., leverage gap when starting a bot)

Skills are installed via the `skills` MCP module (`packages/core/src/tools/skills.ts`) or the `okx skill` CLI command.

## Six Skill Packs

| Pack | Path | Purpose |
|------|------|---------|
| `okx-cex-trade` | `skills/okx-cex-trade/` | Spot/swap/futures/options trading operations |
| `okx-cex-market` | `skills/okx-cex-market/` | Market data and technical analysis queries |
| `okx-cex-earn` | `skills/okx-cex-earn/` | Earn product subscription and management |
| `okx-cex-bot` | `skills/okx-cex-bot/` | Grid/DCA bot lifecycle management |
| `okx-cex-portfolio` | `skills/okx-cex-portfolio/` | Portfolio overview and position monitoring |
| `okx-cex-skill-mp` | `skills/okx-cex-skill-mp/` | Skill marketplace: search, install, manage skills |

## SKILL.md Format

Each skill pack has a `SKILL.md` file with YAML frontmatter:

```yaml
---
metadata:
  name: okx-cex-trade
  version: 1.2.8          # Must match stable release version
  description: "..."
commands:                  # Maps to CLI subcommands
  - name: spot place-order
    description: "..."
---
```

The body of `SKILL.md` contains:
- Command index with descriptions
- Workflow sections (step-by-step operation guides)
- Edge cases and known failure modes
- Output format documentation

## Version Sync Rule

On every **stable release** (non-prerelease, e.g., `1.2.8`), the `metadata.version` in all six `SKILL.md` files must be updated to match the release version. Beta/RC versions do NOT trigger a skills version update.

This sync is done in the version bump commit, alongside updating `package.json` versions and `CHANGELOG.md`.

## Skills Module (`packages/core/src/tools/skills.ts`)

The `skills` MCP module allows agents to interact with the marketplace at runtime. Three tools are exposed:

- `skills_get_categories` — list available skill categories; returns `categoryId` values to use in search filtering
- `skills_search` — search available skill packs by keyword or `categoryId`; returns skill names for use with download
- `skills_download` — download a skill pack by name into the agent's context; always call `skills_search` first to confirm the name exists

The downloader (`packages/core/src/skills/downloader.ts`) fetches skill packs from the configured registry URL. The extractor (`packages/core/src/skills/extractor.ts`) unpacks and validates the skill content. The parser (`packages/core/src/skills/parser.ts`) reads `SKILL.md` frontmatter into structured data.

## CLI ↔ Skills Sync

Any change to CLI command signatures or output format must be reflected in the corresponding `SKILL.md`. The skills documentation is what the agent reads to understand how to use the CLI — stale skills lead to incorrect agent behavior.

When adding a new CLI flag or changing `--json` output format, always check the matching skill pack's command documentation and update it in the same MR.
