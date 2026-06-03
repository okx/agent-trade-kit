# Scheduler Setup

Two scheduling models, selected by `platform.json` `.scheduler.type`:

- **`openclaw-cron`** (OpenClaw) — scheduled via the in-session **`cron` agent tool**, isolated + light-context, delivered back to the conversation via `announce`. See [OpenClaw](#openclaw-in-session-cron-tool).
- **`cron`** (Claude Code / Hermes / Generic) — scheduled via **OS crontab + `okx` CLI + curl notifications**. No LLM sessions spawned — zero token cost. See [OS Crontab](#os-crontab-configuration).

For OS-crontab platforms, agent-platform `/loop` and cloud Routines are **not recommended**: each tick spawns an LLM session and isolated sessions cannot reliably push TG/Lark notifications. (OpenClaw is the deliberate exception — its in-session cron + `announce` delivery is the supported path.)

## OpenClaw (in-session cron tool)

OpenClaw does **not** use OS crontab or the `openclaw` CLI (the CLI cron path has permission issues here). Scheduling is created **inside the conversation** by calling the in-session **`cron` agent tool**, so the job inherits the current session's channel and can deliver scan results straight back to the chat.

Encourage the user to set it up directly in the conversation, then call the tool — **never print a shell or `openclaw cron` command**.

### Create the job

Call the `cron` tool, `action: "add"`, with a `job`:

| Field | Value | Why |
|---|---|---|
| `name` | `"earn-hunter-hourly"` | stable identifier for list/update/remove |
| `schedule` | `{ "kind": "every", "everyMs": <ms> }` | from `platform.json` `.scheduler.interval` (`1h`→3600000, `30m`→1800000, `2h`→7200000) |
| `sessionTarget` | `"isolated"` | run isolated, don't disturb the main session |
| `payload` | `{ "kind": "agentTurn", "message": "执行 earn-hunter 扫描", "lightContext": true }` | the prompt routes to the Scan Cycle; `lightContext` keeps tokens low |
| `delivery` | `{ "mode": "announce" }` | push the turn's output to the conversation channel |

**Tool budget (the token guardrail):** OpenClaw cron jobs have **no per-job tool-whitelist field** — the old `--tools exec,read,write` flag no longer exists, and `lightContext` only trims bootstrap workspace files (it does not change which tools load). The scan stays cheap because it invokes the `okx` CLI via `exec` and does **not depend on** the 160+ okx MCP tools; provided the isolated cron agent isn't configured to attach the okx MCP server, only the regular tools (exec/read/write) are present. Tool loading is governed by the agent config, not the cron job.

### Verification

1. `cron` tool `action: "list"` → confirm the `earn-hunter-hourly` job exists with the expected next-run time
2. After the first trigger, confirm the scan result was announced into the conversation
3. Check `~/.okx/earn-hunter/notify.log` for a corresponding log entry

### Management

- **List:** `cron` `action: "list"`
- **Pause:** `cron` `action: "update"`, patch `{ "enabled": false }` (or `action: "remove"`)
- **Resume:** `cron` `action: "update"`, patch `{ "enabled": true }`
- **Change frequency:** `cron` `action: "update"`, patch `schedule.everyMs` (and update `platform.json` `.scheduler.interval`)

## OS Crontab Configuration

`scan.sh` is shipped with the skill at `{baseDir}/scripts/scan.sh`. During activation it is **copied** (not generated) to `~/.okx/earn-hunter/scan.sh`:

```bash
mkdir -p ~/.okx/earn-hunter
cp {baseDir}/scripts/scan.sh ~/.okx/earn-hunter/scan.sh
chmod +x ~/.okx/earn-hunter/scan.sh
```

The script (pure shell + jq) calls the `okx` CLI directly, filters/dedups, and sends notifications via curl to TG/Lark — with **zero LLM cost**. It exits silently (no output, nothing sent) when there are no new opportunities and `verboseLog=false`.

```bash
# Add to crontab (every hour). Set OKX_PROFILE only in API Key mode; omit for OAuth.
(crontab -l 2>/dev/null; echo "0 * * * * OKX_PROFILE=live ~/.okx/earn-hunter/scan.sh >> ~/.okx/earn-hunter/cron.log 2>&1") | crontab -
```

To change frequency: `crontab -e` → modify the cron expression (e.g., `*/30 * * * *` for every 30 minutes).

### Prerequisites

- `jq` must be installed (the script uses it for all JSON processing): `which jq` → if missing, `brew install jq` (macOS) or `apt-get install jq` (Linux).
- `okx` CLI installed and authenticated (`~/.okx/config.toml`). The script never reads or prints credentials; auth is fully delegated to the CLI.

## Verification

1. `crontab -l` → confirm `earn-hunter` entry exists
2. After the first trigger, check `~/.okx/earn-hunter/cron.log` for scan output
3. Check `~/.okx/earn-hunter/notify.log` for a corresponding notification log entry

## Management

```bash
crontab -l                                           # list all cron jobs
crontab -l | grep -v 'earn-hunter' | crontab -       # pause (remove entry)
# Re-add to resume (same command as initial setup)
```

## Frequency Configuration

The `scheduler.interval` field in `platform.json` records the user's preferred frequency. When setting up the scheduler:

- Read `platform.json` → `.scheduler.interval` to determine the interval
- Default `"1h"` = every hour
- User can change via natural language: "把扫描频率改成 30 分钟" → update `platform.json` `.scheduler.interval` to `"30m"` + update crontab expression

Common mappings:
- "每小时" / "1h" → `0 * * * *`
- "30 分钟" / "30m" → `*/30 * * * *`
- "2 小时" / "2h" → `0 */2 * * *`
- "15 分钟" / "15m" → `*/15 * * * *`

## Testing Tips

- **Use a short interval for initial testing** (e.g. `5m`). Once you confirm the scheduler triggers correctly, change back to your preferred interval (default `1h`).
- **Temporarily enable `verboseLog`** during testing (`config.json` → `"verboseLog": true`). This ensures a notification is sent even when there are no new opportunities, making it easy to confirm the full pipeline works. Turn it off after testing.
