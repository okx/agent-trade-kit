# Scheduler Setup

## OpenClaw

### Cron Configuration

```bash
openclaw cron add --name "earn-hunter-hourly" --at "1h" \
  --tools exec,read,write \
  --no-deliver \
  --message "执行 earn-hunter 扫描。扫描完成后如有新机会，直接用 curl 调 TG Bot API 或 Lark Webhook 发送通知。"
```

**Key flags explained:**

| Flag | Why |
|---|---|
| `--tools exec,read,write` | Only inject these 3 tools into context. Without this, all 160+ okx MCP tools get injected, burning ~$20/week on OpenAI tokens |
| `--no-deliver` | Do NOT use announce delivery — isolated cron agents cannot reliably deliver to Telegram (known OpenClaw bug). Agent sends notifications directly via curl instead |

### Exec Approval Pre-configuration

OpenClaw's exec tool requires approval by default. In cron isolated sessions, there is no interactive approval — the exec call will be silently denied or timeout.

**Before setting up cron, configure exec auto-approval for okx commands:**

Add to `~/.openclaw/exec-approvals.json`:
```json
{
  "okx *": "always",
  "curl *": "always"
}
```

Or use on-miss mode (approve once, auto-approve afterward):
```json
{
  "okx *": "on-miss",
  "curl *": "on-miss"
}
```

Then manually run `okx earn flash-earn projects --json` once in an interactive session to trigger the first approval.

### Why NOT use --announce

OpenClaw's TG bot is paired to the main agent session. Cron isolated agents are separate sessions that do NOT have the TG bot pairing. Multiple issues confirm `--announce --channel telegram` silently fails:
- Cron reports `lastStatus: "ok"` and `lastDelivered: true` but TG never receives the message
- The workaround is `--no-deliver` + agent sends via curl directly

### Verification

After setting up the cron job, verify it is working:

1. `openclaw cron list` → confirm `earn-hunter` job exists in the list
2. Check `next_run_at` field to confirm the next scheduled trigger time
3. After the first run completes, check `~/.okx/earn-hunter/notify.log` for a log entry confirming the scan executed

### Management

```bash
openclaw cron list                                    # list all cron jobs
openclaw cron remove --name "earn-hunter-hourly"             # stop and remove
openclaw cron edit <id> --at "30m"                    # change frequency
openclaw cron edit <id> --tools exec,read,write,fetch # add tools
openclaw cron edit <id> --clear-tools                 # remove tool filter
```

## Claude Code — OS crontab

Claude Code `/loop` is **not recommended**: each tick spawns an LLM session (~$20+/week) and isolated sessions cannot reliably push TG/Lark notifications. Use OS crontab + `okx` CLI instead.

```bash
# Add to crontab (every hour)
(crontab -l 2>/dev/null; echo "0 * * * * ~/.okx/earn-hunter/scan.sh >> ~/.okx/earn-hunter/cron.log 2>&1") | crontab -
```

The `scan.sh` script is generated during activation (Step 5). It calls `okx` CLI directly and sends notifications via curl to TG/Lark.

To change frequency: `crontab -e` → modify the cron expression (e.g., `*/30 * * * *` for every 30 minutes).

**Do NOT use `/loop` or Routines.** `/loop` is expensive and cannot push external notifications. Routines lack persistent state, breaking dedup.

### Verification

1. `crontab -l` → confirm `earn-hunter` entry exists
2. After the first trigger, check `~/.okx/earn-hunter/cron.log` for scan output
3. Check `~/.okx/earn-hunter/notify.log` for a corresponding notification log entry

## Frequency Configuration

The `scheduler.interval` field in `platform.json` records the user's preferred frequency. When setting up the scheduler:

- Read `platform.json` → `.scheduler.interval` to determine the interval
- Default `"1h"` = every hour
- User can change via natural language: "把扫描频率改成 30 分钟" → update `platform.json` `.scheduler.interval` to `"30m"` + restart cron

## Testing Tips

- **Use a short interval for initial testing** (e.g. `5m`). Once you confirm the scheduler triggers correctly, change back to your preferred interval (default `1h`).
- **Temporarily enable `verboseLog`** during testing (`config.json` → `"verboseLog": true`). This ensures a notification is sent even when there are no new opportunities, making it easy to confirm the full pipeline works. Turn it off after testing.
