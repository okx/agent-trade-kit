# Scheduler Setup

All platforms use **OS crontab + `okx` CLI + curl notifications**. No LLM sessions are spawned — zero token cost.

Agent-platform scheduling (OpenClaw cron, Claude Code `/loop`, Hermes cronjob, Routines) is **not recommended**: each tick spawns an LLM session (~$20+/week), and isolated sessions cannot reliably push TG/Lark notifications.

## Crontab Configuration

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
