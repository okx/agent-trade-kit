# Configuration Reference

## File Layout

```
~/.okx/earn-hunter/
├── config.json          # Shared core config (scan, thresholds, language)
├── platform.json        # Platform-specific (scheduler, notification channel)
└── state.json           # Dedup state
```

- `config.json` — initialized by copying `{baseDir}/config/default.json` to `~/.okx/earn-hunter/config.json`
- `platform.json` — initialized by copying `{baseDir}/config/<platform>.default.json` to `~/.okx/earn-hunter/platform.json` during platform detection

## Shared Config (`config.json`)

### Scan Scope

| Field | Type | Default | Description |
|---|---|---|---|
| `flash.enabled` | boolean | `true` | 是否扫描 Flash Earn（闪赚） |
| `fixed.enabled` | boolean | `true` | 是否扫描 Fixed Earn（定期赚币） |
| `fixed.globalMinApy` | number | `0` | 全局最低 APY 阈值（小数形式，如 `0.05` = 5%）。`0` = 不过滤 |
| `fixed.currencyOverrides` | object | `{}` | 分币种阈值覆盖。格式 `{"USDT": {"minApy": 0.08}}`（= 8%），优先于 globalMinApy |
| `fixed.terms` | string \| string[] | `"all"` | 期限筛选。`"all"` = 全部；`["7D", "30D"]` = 仅指定期限 |
| `flexible.enabled` | boolean | `true` | 是否扫描 Flexible Earn（活期赚币） |
| `flexible.globalMinApy` | number | `0.08` | 活期全局最低 APY 阈值（小数形式，`0.08` = 8%） |
| `flexible.currencies` | string[] \| `"all"` | `["USDT","USDC"]` | 活期监控币种列表。需逐币种调用 API，建议精简。`"all"` 或 `[]` 回退为默认列表 `["USDT","USDC"]` |
| `flexible.currencyOverrides` | object | `{}` | 活期分币种阈值覆盖。格式 `{"USDC": {"minApy": 0.06}}`（= 6%），优先于 globalMinApy |

### Monitor Scope

| Field | Type | Default | Description |
|---|---|---|---|
| `currencies` | string \| string[] | `[]` | 监控币种。`[]` 或 `"all"` = 全部；`["USDT", "BTC"]` = 仅指定币种 |

### Notification (shared)

| Field | Type | Default | Description |
|---|---|---|---|
| `notify.language` | string | `"auto"` | 通知语言。首激时自动检测写入，或手动设为 `"zh-CN"` / `"en"` |
| `notify.fallbackToSession` | boolean | `false` | 排障失败降级标记。true 时跳过外部渠道直接用 session |

### Schedule

| Field | Type | Default | Description |
|---|---|---|---|
| `schedule.cron` | string | `"0 * * * *"` | Cron expression for scan frequency. Standard 5-field cron syntax |
| `schedule.interval` | string | `"1h"` | Human-readable interval (for display). Must stay in sync with `schedule.cron` |

When user changes frequency (e.g. "把扫描频率改成 30 分钟"):
1. Convert to cron expression: "30 分钟" → `"*/30 * * * *"`
2. Update both `schedule.cron` and `schedule.interval` in config.json
3. Update the actual scheduler (restart cron with new interval)

Common mappings:
- "每小时" / "1h" → `"0 * * * *"`
- "30 分钟" / "30m" → `"*/30 * * * *"`
- "2 小时" / "2h" → `"0 */2 * * *"`
- "15 分钟" / "15m" → `"*/15 * * * *"`

### Misc

| Field | Type | Default | Description |
|---|---|---|---|
| `simulatedTrading` | boolean | `false` | 固定实盘，预留字段 |
| `verboseLog` | boolean | `false` | `true` 时无命中也推送简讯 |

## Platform Config (`platform.json`)

Initialized from `{baseDir}/config/<platform>.default.json` during platform detection. `scheduler.type` is `"openclaw-cron"` on OpenClaw (in-session `cron` tool + `announce` delivery), `"cron"` on Claude Code / Hermes (OS crontab), `"launchagent"` on macOS when cron daemon is not running (fallback to LaunchAgent), and `"manual"` on Generic (no automatic scheduler — user triggers scans by hand).

### Common Fields (all platforms)

| Field | Type | Default | Description |
|---|---|---|---|
| `platform` | string | varies | 平台标识（`"openclaw"` / `"claude-code"` / `"hermes"` / `"generic"`） |
| `scheduler.type` | string | varies | 调度方式：`"openclaw-cron"`（OpenClaw 会话内 cron 工具 + announce）/ `"cron"`（OS crontab）/ `"launchagent"`（macOS LaunchAgent，cron daemon 不可用时自动 fallback）/ `"manual"`（Generic） |
| `scheduler.interval` | string | `"1h"` | 扫描间隔 |
| `notify.channel` | string | varies | 通知渠道：`"auto"` / `"telegram"` / `"lark"` / `"session"`（OpenClaw 默认 `"session"`，经 announce 投递回会话） |

### Claude Code additional fields

| Field | Type | Default | Description |
|---|---|---|---|
| `notify.fallbackToSession` | boolean | `false` | 排障失败降级标记 |
| `notify.telegram.bot_token_env` | string | `"TELEGRAM_BOT_TOKEN"` | TG Bot Token 环境变量名 |
| `notify.telegram.chat_id_env` | string | `"TELEGRAM_CHAT_ID"` | TG Chat ID 环境变量名 |
| `notify.lark_webhook` | string | `""` | 飞书 Webhook URL |

## Natural Language Config Examples

| User input | Action | Target file |
|---|---|---|
| "只监控 USDT 和 USDC" | Set `.currencies` to `["USDT","USDC"]` | config.json |
| "APY 低于 3% 不通知" | Set `.fixed.globalMinApy` to `0.03` | config.json |
| "USDT 要 5% 以上才通知" | Set `.fixed.currencyOverrides` to `{"USDT":{"minApy":0.05}}` | config.json |
| "只看闪赚" | Set `.fixed.enabled` and `.flexible.enabled` to `false` | config.json |
| "只看活期" | Set `.flash.enabled` and `.fixed.enabled` to `false` | config.json |
| "只看 7 天和 30 天" | Set `.fixed.terms` to `["7D","30D"]` | config.json |
| "活期加上 BTC" | Append `"BTC"` to `.flexible.currencies` array | config.json |
| "活期 APY 改成 10%" | Set `.flexible.globalMinApy` to `0.10` | config.json |
| "USDC 活期 6% 就通知" | Set `.flexible.currencyOverrides` to `{"USDC":{"minApy":0.06}}` | config.json |
| "没命中也告诉我" | Set `.verboseLog` to `true` | config.json |
| "用飞书通知我" | Set `.notify.channel` to `"lark"` + ask webhook URL | platform.json |
| "用 Telegram 通知" | Set `.notify.channel` to `"telegram"` | platform.json |
| "把扫描频率改成 30 分钟" | Set `.schedule.cron` to `"*/30 * * * *"` and `.schedule.interval` to `"30m"` + restart scheduler | config.json |
| "重置配置" | Re-copy `default.json` → `config.json` + re-copy platform default → `platform.json` | both |

## Config Operations

All config read/write is performed directly by the AI agent — no external tools (jq, shell scripts) needed.

```
# Read config
Read ~/.okx/earn-hunter/config.json → parse JSON → extract field

# Modify config
Read → parse → modify field → Write back

# Init config (if file missing)
Copy {baseDir}/config/default.json → ~/.okx/earn-hunter/config.json

# Init platform (if file missing)
Copy {baseDir}/config/claude-code.default.json → ~/.okx/earn-hunter/platform.json
```

## State File (`state.json`)

Hierarchical structure with separate namespaces for Flash, Fixed, and Flexible:

```json
{
  "flash": {
    "<id>:<status>": { "notifiedAt": "<ISO 8601 timestamp>" }
  },
  "fixed": {
    "<ccy>:<term>:<rate>": { "notifiedAt": "<ISO 8601 timestamp>" }
  },
  "flexible": {
    "<ccy>": { "notifiedAt": "<ISO 8601 timestamp>", "rate": "<lendingRate>" }
  },
  "consecutive_failures": 0,
  "last_error": ""
}
```

| Field | Type | Description |
|---|---|---|
| `flash` | object | Flash Earn dedup entries. Key format: `<project_id>:<status>` |
| `fixed` | object | Fixed Earn dedup entries. Key format: `<ccy>:<term>:<rate>` |
| `flexible` | object | Flexible Earn dedup entries. Key format: `<ccy>`. Threshold-crossing model: key removed when rate drops below threshold |
| `consecutive_failures` | number | Consecutive scan failure count. Reset to 0 on success. Alert at 3 |
| `last_error` | string | Last error message (truncated to 200 chars) |

Each dedup entry contains `notifiedAt` with ISO 8601 timestamp (e.g. `"2026-05-25T15:00:00+08:00"`). Flexible entries additionally store the `rate` at notification time (informational, not used for dedup).
