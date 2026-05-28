---
name: earn-hunter
description: "Automatically monitors OKX Flash Earn and Fixed Earn opportunities, sends push notifications, and guides subscription. 自动监控 OKX 闪赚和定期赚币机会，推送通知并引导申购。Use when user says: 有闪赚通知我, 监控赚币, monitor earn, notify me about earn, 定时检查理财, 执行 earn-hunter 扫描, earn-hunter scan."
license: MIT
metadata:
  author: okx
  agent:
    requires:
      bins: ["okx"]
    install:
      - id: okx-cli
        kind: node
        package: "@okx_ai/okx-trade-cli"
        bins: ["okx"]
        label: "Install okx CLI (npm)"
---

# Earn Hunter

Automated monitor for OKX Flash Earn and Fixed Earn opportunities.

**`{baseDir}`** = the directory containing this SKILL.md file. All relative paths (references/, templates/, config/) are resolved from here.

## Preflight

1. Verify `okx` CLI installed: `which okx`. If missing, install via `npm install -g @okx_ai/okx-trade-cli`.
   On OpenClaw, also verify `openclaw` CLI is available.
2. On OpenClaw: verify exec-approvals are configured for `okx` and `curl` commands (required for cron to work without interactive approval). Check `~/.openclaw/exec-approvals.json` — if `okx *` and `curl *` are not whitelisted, guide user to add them. See `{baseDir}/references/scheduler-setup.md` for details.
3. Check optional dependent skills:
   ```bash
   okx skill list --json
   ```
   Optional skills (not required for scanning/notifications):
   - `okx-cex-earn` — needed for purchase guide (subscription execution)
   - `okx-cex-auth` — needed for authentication recovery

   If either is missing, attempt to install but **do not block** if installation fails:
   ```bash
   okx skill add okx-cex-earn
   okx skill add okx-cex-auth
   ```
   - Install succeeds → continue
   - Install fails (network error, marketplace unavailable, etc.) → **warn and continue**:
     "⚠ `{skill_name}` 安装失败，扫描和通知功能不受影响。申购引导和认证恢复需要该 skill，后续可手动安装。"
   - Preflight continues regardless of skill installation result
4. Auth mode detection — run **both**, first match wins:
   - `okx config show --json` → has non-empty `api_key` field → **API Key mode**. Add `--profile live` to all commands.
   - No API key + `okx auth status --json` → `"status":"logged_in"` → **OAuth mode**. No `--profile` flag needed.
   - Neither → **stop**. Load `okx-cex-auth` skill and follow login steps.
5. Init config and state:
   - If `~/.okx/earn-hunter/` directory does not exist → `mkdir -p ~/.okx/earn-hunter`
   - If `~/.okx/earn-hunter/config.json` does not exist → copy `{baseDir}/config/default.json` to it
   - If `~/.okx/earn-hunter/state.json` does not exist → write `{"flash":{},"fixed":{},"consecutive_failures":0,"last_error":""}`
   - If `~/.okx/earn-hunter/platform.json` does not exist → run [Platform Detection](#platform-detection-active-probe--user-confirmation)

   All JSON read/write operations are performed directly by the AI agent (Read file → parse → modify → Write file). No external tools (jq, etc.) are needed.

## Platform & Channel Detection

Three independent dimensions: **platform** (where the agent runs), **scheduler** (what triggers scans), **notification channel** (where alerts go).

### Platform Detection (active probe + user confirmation)

**First run (no `platform.json` exists):**

1. Probe environment clues:
   - `OPENCLAW_HOME` env var exists? → hint: OpenClaw
   - Agent tool list contains `cron` / `delivery` tools? → hint: OpenClaw
   - `HERMES_HOME` env var exists or `which hermes` succeeds? → hint: Hermes Agent
   - Running inside Claude Code session? → hint: Claude Code
   - None of the above matched → hint: Generic
2. Present detection result and **ask user to confirm**:
   - "检测到你正在使用 **{detected_platform}**，是否正确？"
   - User confirms → proceed
   - User says no → ask: "你使用的是哪个平台？1) OpenClaw  2) Claude Code  3) Hermes Agent  4) 其他"
3. Initialize platform config:
   - OpenClaw / Claude Code → copy `{baseDir}/config/<confirmed_platform>.default.json` to `~/.okx/earn-hunter/platform.json`
   - Hermes Agent → copy `{baseDir}/config/claude-code.default.json` as base, set `.platform` to `"hermes"`, `.scheduler.type` to `"hermes-cronjob"`
   - Generic → copy `{baseDir}/config/claude-code.default.json` as base, set `.platform` to `"generic"`, `.scheduler.type` to `"manual"`
4. Result written to `~/.okx/earn-hunter/platform.json`, subsequent runs skip detection.

**Subsequent runs (platform.json exists):**
Read `~/.okx/earn-hunter/platform.json` and extract the `.platform` field (returns `"openclaw"`, `"claude-code"`, `"hermes"`, or `"generic"`).

**No scheduler available on detected platform** (only applies to platforms that should have one but don't) → error: "当前客户端不支持定时任务，请升级到最新版本。"
**Generic platform** → no automatic scheduler. Inform: "当前平台不支持自动调度，你可以手动说'执行 earn-hunter 扫描'来触发。"

### Configuration Files

| File | Scope | Content |
|---|---|---|
| `config.json` | Shared | Scan scope, currencies, APY thresholds, terms, language, verboseLog |
| `platform.json` | Platform-specific | Scheduler type/interval, notification channel, TG/Lark credentials |
| `state.json` | Shared | Dedup state |

Core config (`config.json`) is identical across platforms. Platform config (`platform.json`) differs:

**OpenClaw (`openclaw.default.json`):**
- scheduler.type = `"cron"`, delivery via native `--announce --channel`

**Claude Code (`claude-code.default.json`):**
- scheduler.type = `"loop"`, notification via TG / Lark / session

### Notification Channels (independent of platform)

Detect in priority order (PRD requirement: TG first):
1. **Telegram** — `$TELEGRAM_BOT_TOKEN` and `$TELEGRAM_CHAT_ID` both set → TG ready
2. **Lark** — `platform.notify.lark_webhook` non-empty → Lark ready
3. **Session** — fallback, only works in interactive mode

OpenClaw additionally supports native `delivery` routing via `--announce --channel`.

TG and Lark are **standalone push channels** — they work regardless of whether the agent client is open.

---

## Skill Routing

| User intent | Route |
|---|---|
| "有闪赚通知我" / "monitor earn" / "帮我监控赚币" | → [Activation Flow](#activation-flow) |
| "改 APY 阈值" / "只看 USDT" / "change config" | → [Config Management](#config-management) |
| "申购 USDT 定期 7D" / "subscribe" / "我要买" | → [Purchase Guide](#purchase-guide) |
| "执行 earn-hunter 扫描" (from cron/loop) | → [Scan Cycle](#scan-cycle) |
| "停止监控" / "暂停" / "stop" | → [Pause/Resume](#pauseresume) |
| "卸载 earn-hunter" / "uninstall" | → [Uninstall](#uninstall) |
| "测试 earn-hunter" / "smoke test" / "测试定时任务" | → [Test Mode](#test-mode) |

---

## Activation Flow

First-time setup. Only confirm platform — everything else uses smart defaults.

### Step 1 — Platform Detection & Confirmation

See [Platform Detection](#platform-detection-active-probe--user-confirmation). Probe environment → ask user to confirm → write `platform.json`.

### Step 2 — Detect Notification Channel & Confirm

**Must actively check available channels before proceeding.** Do NOT silently fall back to session.

**OpenClaw:**
OpenClaw cron uses `--no-deliver` + direct curl to TG/Lark (see scheduler-setup.md for why). Detect available channels same as Claude Code (TG env vars → Lark webhook → session), then write the confirmed channel to `platform.json` `notify.channel` (e.g. `"telegram"`, `"lark"`, `"session"`). Do NOT write `"delivery"` — OpenClaw's announce delivery is unreliable in isolated cron sessions.

**Claude Code / Hermes / Generic:**
Detection order (check each, report status for all):
1. Check `$TELEGRAM_BOT_TOKEN` and `$TELEGRAM_CHAT_ID` env vars:
   - Both set → TG ready
   - Token set but chat_id missing → warn: "Telegram 配置不完整（缺少 TELEGRAM_CHAT_ID），跳过 TG" → continue to next channel
   - Neither set → TG not available
2. Check `platform.notify.lark_webhook` or Lark MCP tools:
   - Webhook set and valid (starts with `https://` and contains `/hook/`) → Lark ready
   - Webhook set but format invalid (does not start with `https://` or missing `/hook/`) → warn: "Lark webhook 格式无效，跳过 Lark" → continue to next channel
   - Not configured and no Lark MCP → Lark not available

**If one or more external channels detected**, ask user:

"检测到以下推送渠道可用：
- {list of detected channels, e.g. Telegram / Lark}

使用哪个渠道推送通知？"

**If no external channel detected**, inform and offer setup:

"当前未检测到推送渠道（Telegram / Lark），通知将在会话内显示。
如需离线推送，对我说'配置 Telegram 通知'。"

Write confirmed channel to `platform.json` `notify.channel`.

### Step 3 — Confirm Scan Config (3-step with defaults)

Present default config and ask user to confirm or customize. Each step offers a default — user can press enter to accept.

**Step 1/3 — 扫描范围：**
"扫描范围：[1] Flash Earn + Fixed Earn（默认）  [2] 仅 Flash Earn  [3] 仅 Fixed Earn"
- Default: both enabled
- If user picks [2] → set `config.fixed.enabled = false`; skip Step 2/3 and 3/3 (Flash has no currency/APY filters)
- If user picks [3] → set `config.flash.enabled = false`; skip Step 2/3 and 3/3

**Step 2/3 — 监控币种：**
"监控币种：全部（默认，按回车）或输入指定币种（如 USDT, SOL）"
- Default: `"all"` (all currencies)
- If user specifies → set `config.currencies` to array (e.g. `["USDT", "SOL"]`)

**Step 3/3 — APY 阈值：**
"最低 APY 阈值：不限（默认，按回车）或输入百分比（如 8）"
- Default: `0` (no limit)
- If user specifies → set `config.fixed.globalMinApy` to `value / 100` (e.g. 8 → `0.08`)

Auto-detect language from conversation and write to `config.json` `notify.language`.

Write config to `~/.okx/earn-hunter/config.json`.

Display summary using `{baseDir}/templates/activation.md` template (in user's language).

### Step 4 — Smoke Test & Delivery Confirmation

**Smoke test always sends a notification, regardless of `verboseLog` setting.**

1. Run one scan cycle immediately
2. **If new opportunities found** → send normal notification (rendered from templates)
3. **If no opportunities found** → send activation confirmation message:
   "Earn Hunter 已激活，当前暂无新机会，将在下一轮自动扫描。"
   (Use `{baseDir}/templates/activation.md` as base, append the no-opportunity note)
4. TG or Lark channel → **ask:** "已向 {channel} 发送测试消息，请确认是否收到？"
5. User confirms → proceed to Step 5
6. Not received → troubleshoot (see `notify-channels.md`)
7. 5 min no response → ping once
8. Session channel → skip confirmation

**Note:** The smoke test ignores `verboseLog` setting — it always produces output to verify the full pipeline works end-to-end.

### Step 5 — Set Up Scheduler

**OpenClaw:**
```bash
openclaw cron add --name "earn-hunter-hourly" --at "1h" \
  --tools exec,read,write \
  --no-deliver \
  --message "执行 earn-hunter 扫描。扫描完成后如有新机会，直接用 curl 调 TG Bot API 或 Lark Webhook 发送通知。"
```
Note: `--tools` limits context to 3 tools (saves tokens); `--no-deliver` because isolated cron agents cannot reliably deliver to TG via announce — agent sends notifications directly via curl. Regardless of `platform.notify.channel` value, OpenClaw cron always uses curl for delivery.

**Claude Code:**
```
/loop 1h 执行 earn-hunter 扫描
```

**IMPORTANT: Do NOT use Routines (cloud scheduled tasks) for Claude Code.** Routines run in an isolated cloud sandbox with no persistent state across runs, so dedup will not work — every scan would re-notify all existing products. Always use `/loop` (local session mode) instead. If the system prompts whether to use Routines, choose "仅本次会话" (current session only).

**Hermes Agent:**
Ask user for their Hermes version's cronjob setup command. Do NOT guess — different Hermes versions have different CLI syntax. Once user provides the command format, create a job named `earn-hunter-hourly` with 1h interval and message "执行 earn-hunter 扫描".

**Generic (no auto-scheduler):**
Skip scheduler setup. Inform user:
"当前平台不支持自动调度。你可以随时手动说'执行 earn-hunter 扫描'来触发扫描。如果你有外部 cron 能力（如系统 crontab），可自行配置定时触发。"

---

## Scan Cycle

Executed by cron/loop triggers. Read `{baseDir}/references/scan-logic.md` for the complete flow.

Summary:

1. Read `~/.okx/earn-hunter/config.json` to load scan configuration
2. Run scan commands (parallel, based on `flash.enabled` / `fixed.enabled`):
   - Flash: `okx [--profile live] earn flash-earn projects --status 0,100 --json`
   - Fixed: `okx [--profile live] earn savings fixed-products --json` (fallback: `rate-history` on CLI <1.3.3)
3. Filter (two-layer APY threshold, terms filter, currency filter)
4. Dedup: read `~/.okx/earn-hunter/state.json` (hierarchical structure), check keys:
   - Flash: `state.flash["<id>:<status>"]`
   - Fixed: `state.fixed["<ccy>:<term>:<rate>"]`
5. If new opportunities:
   - Flash only → render `{baseDir}/templates/flash-earn.md`
   - Fixed only → render `{baseDir}/templates/fixed-earn.md`
   - Both → render `{baseDir}/templates/mixed-notify.md`
   - Send via configured channel, log result to `notify.log`
6. Update state in `~/.okx/earn-hunter/state.json`:
   - Write new keys with ISO 8601 timestamp to `state.flash` / `state.fixed`
   - Flash diff cleanup by project ID; Fixed diff cleanup by key
   - TTL cleanup: remove entries older than 7 days
   - Update `consecutive_failures` counter (reset on success, increment on failure)
7. If no new opportunities:
   - `config.verboseLog = true` → send brief status: "✅ Earn Hunter 扫描完成，暂无新机会"
   - `config.verboseLog = false` → **silent exit, no output**

---

## Purchase Guide

When user wants to subscribe to a Fixed Earn product after receiving a notification.

Read `{baseDir}/references/purchase-guide.md` for the complete flow.

Summary:

1. Parallel balance check (funding + trading + flexible earn)
2. Compare fixed APR vs flexible lendingRate
3. Calculate recommended amount: `min(idle + movable_simple_earn, lendQuota)`
4. Present recommendation with comparison hint
5. User confirms → **re-check offer availability** (soldOut guard) → hand off to `okx-cex-earn`

Edge cases covered in purchase-guide.md:
- Balance < minLend → show deficit
- Amount > lendQuota → auto-cap with notice
- Redeem succeeded but subscribe failed → warn user, funds are in funding account
- Offer sold out between notification and subscription → inform user

**Important:** earn-hunter does NOT execute write operations directly. It transfers control to `okx-cex-earn`.

---

## Config Management

Read `{baseDir}/references/config-reference.md` for field definitions and natural language examples.

When user wants to change settings:
1. Parse intent → map to config field (see `config-reference.md` for field mapping)
2. Read the target JSON file (`config.json` or `platform.json`) → modify the field → write back
3. Read the updated file → confirm the change to user

**Exception:** TG credentials cannot be changed via natural language. Tell user to set environment variables directly.

---

## Pause/Resume

**Pause:** Stop the scheduler.
- OpenClaw: `openclaw cron remove --name "earn-hunter-hourly"`
- Claude Code: tell user to stop the `/loop`

**Resume:** Restart the scheduler (same commands as Activation Step 5).

Config and state are preserved — resuming picks up where it left off.

---

## Uninstall

When user says "卸载" / "uninstall":
1. Stop the scheduler (same as Pause)
2. Ask: "是否保留配置和历史数据？"
   - Yes → only remove scheduler
   - No → also remove `~/.okx/earn-hunter/` directory

---

## Test Mode

Trigger phrases: "测试 earn-hunter" / "earn-hunter smoke test" / "测试定时任务触发"

Behavior:

1. **Execute a full Scan Cycle** — same as a normal scan, but does not modify production config
2. **Force-send notification** — ignores `verboseLog` setting; always sends output regardless of whether opportunities are found
3. **Dedup writes to test namespace** — dedup keys are prefixed with `test:` (e.g. `test:flash:12345:100`), so test runs do not pollute production state
4. **Output diagnostics** after scan completes:
   - okx auth status (logged in / expired / not configured)
   - Scan command results (flash project count + fixed product count)
   - Post-filter results (how many passed filters)
   - Notification channel status (which channel is configured, send result)
   - Scheduler status (cron job exists? /loop running? hermes cronjob active?)
   - Last 5 lines of `~/.okx/earn-hunter/notify.log`
5. **Completion message:** "测试完成。test: 前缀的 state 不影响正式去重，正式扫描不受影响。"

---

## Error Handling

Read `{baseDir}/templates/error-alert.md` for exact alert message templates.

| Error | Action |
|---|---|
| `okx` 401 / "Session expired" | Stop scan. Send alert (凭证失效 template). Load `okx-cex-auth` if interactive. |
| Network error / timeout | Retry once silently. If still fails, skip this cycle. |
| 3 consecutive scan failures | Send alert (连续失败 template). Counter stored in `state.consecutive_failures`, reset after alert. |
| `state.json` corrupted | Reset by writing `{"flash":{},"fixed":{},"consecutive_failures":0,"last_error":""}`. May cause one round of duplicate notifications. |
| Notification send fails | Log to `notify.log`, continue scan. Dedup key NOT added (next cycle retries). |
| `config.json` missing at runtime | Send alert: "earn-hunter 未配置，请运行首次激活流程。" |
| Dual-client suspected (user mentions both platforms) | Warn: "建议仅在一个客户端运行 earn-hunter，避免重复通知。" |
| `verboseLog = true` + no hits | Send brief status (not silent). |

---

## i18n

- **All notifications rendered in user's language** (detected at activation, stored in `config.notify.language`)
- **Locked terms (never translate):** Flash Earn, Fixed Earn, Simple Earn, DCD, APY, APR, OKX, earn-hunter, Telegram, project names, currency codes (USDT, BTC, etc.)
- **Fallback:** If LLM rendering fails, send Chinese template + append `(translation unavailable, sent in zh-CN)`

---

## Global Notes

- **Security:** Never accept credentials in chat. TG token only via env vars. Guide users to `okx config init` for OKX auth.
- **Output:** Use `--json` for all okx commands. Render results as markdown tables.
- **Logging:** All notification send results logged to `~/.okx/earn-hunter/notify.log`.
- **Scope:** v1 covers Flash Earn and Simple Earn Fixed only. DCD, on-chain, auto-earn are out of scope.
- **Mode:** Live trading only. `config.simulatedTrading` is always `false`.
