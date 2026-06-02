# Notification Channels

## Delivery Models

There are three distinct delivery models. Understanding which applies avoids confusion.

### 1. Interactive Session (user is in a live conversation)

The agent outputs markdown directly in the conversation. Works on all platforms (OpenClaw, Claude Code, Hermes, Generic). Full interactivity — user can reply to subscribe immediately.

### 2. OS Crontab (scheduled scan, no LLM session) — Claude Code / Hermes / Generic

Scheduled scans run via OS crontab (no LLM session). **Always use direct curl to TG Bot API or Lark Webhook** for notifications. `scripts/scan.sh` does the curl itself.

### 3. OpenClaw In-Session Cron (`announce` delivery)

On OpenClaw the scheduled scan runs as an **isolated cron agent turn** created via the in-session `cron` tool. Delivery is via the cron job's **`announce`** mode, which pushes the turn's output back to the conversation channel that created the job. `platform.json` `notify.channel` is `"session"` so `scripts/scan.sh` prints the notification to stdout for the turn to relay — **do not curl TG/Lark from this turn** (that would double-send). The user can still switch to a TG/Lark channel explicitly if they prefer curl push.

### 4. Direct Webhook (standalone push, no agent session)

External system calls TG Bot API or Lark Webhook directly via curl. Does not depend on any agent platform's delivery mechanism. Useful for custom integrations.

## Channel Summary

| Delivery Model | Platform | Method | Interactivity |
|------|---------|---------|---------|
| Interactive session | Any | Markdown in conversation | Full (can reply) |
| OS crontab (scheduled) | Claude Code / Hermes / Generic | curl TG/Lark | Push only |
| In-session cron (scheduled) | OpenClaw | cron `announce` → conversation channel | Push (into chat) |
| Direct webhook | N/A | curl TG Bot API / Lark Webhook | Push only |

## Channel Detection (auto mode)

### All Platforms

渠道探测优先级（TG > Lark > Session），含半配置处理：

1. **Telegram**
   - `$TELEGRAM_BOT_TOKEN` and `$TELEGRAM_CHAT_ID` both set → TG ready
   - `$TELEGRAM_BOT_TOKEN` set but `$TELEGRAM_CHAT_ID` missing → **incomplete**: warn "Telegram 配置不完整（缺少 TELEGRAM_CHAT_ID）"，skip TG, continue
   - Neither set → not available
2. **Lark webhook**
   - `platform.json` `.notify.lark_webhook` is non-empty, starts with `https://`, and contains `/hook/` → Lark ready
   - Value present but format invalid → **incomplete**: warn "Lark webhook 格式无效（需以 https:// 开头且包含 /hook/）"，skip Lark, continue
   - Not configured → not available
3. **Session** — fallback, only works when Claude Code is open interactively

## Sending Methods

### Telegram Bot

```bash
# Pseudocode: read env var names from platform.json → notify.telegram.bot_token_env / chat_id_env
# Then use printenv to get actual token values
TOKEN=$(printenv "${config.telegram.bot_token_env}")
CHAT_ID=$(printenv "${config.telegram.chat_id_env}")

curl -s "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -d "chat_id=${CHAT_ID}" \
  -d "text=${message}" \
  -d "parse_mode=HTML"
```

TG message formatting: use plain text + emoji. Avoid MarkdownV2 (escape hell).

#### TG 消息拆分

TG 单条消息上限 4096 字符。超长时拆分发送：

```
# 拆分规则
1. 按段落边界拆分，尽量不截断单个 offer
2. 首条消息带完整标题头
3. 后续条带 "(续 N/M)" 前缀
4. 每条不超过 4000 字符（留 96 字符 buffer）
```

#### TG 安全约束

TG 凭证（bot token、chat_id）**不通过自然语言修改**，必须直接改环境变量。

原因：避免凭证出现在对话日志 / LLM context 中。

引导话术：
> "TG 凭证需要直接修改环境变量，不能通过对话修改。请执行：`export TELEGRAM_BOT_TOKEN=xxx` 和 `export TELEGRAM_CHAT_ID=xxx`，并写入 shell profile 持久化。"

### Lark Webhook

```bash
curl -s -X POST "<webhook_url>" \
  -H "Content-Type: application/json" \
  -d '{
    "msg_type": "interactive",
    "card": {
      "schema": "2.0",
      "header": {
        "title": {"content": "<title>", "tag": "plain_text"},
        "template": "blue"
      },
      "body": {
        "elements": [
          {"tag": "markdown", "content": "<body>"}
        ]
      }
    }
  }'
```

If Lark MCP (`OKEngine-LARK-MCP`) is available and has messaging tools (e.g. `lark_send_message`), prefer using them over raw curl. Do NOT use `lark_drive_import_document` — it creates cloud documents, not instant messages.

### Session (fallback)

Output the notification directly as markdown in the conversation. Only works during interactive sessions — not available when triggered by cron/launchd.

## First-Time Channel Setup

When `notify_channel` is `"auto"` and no channel is configured, guide the user through setup.

### Telegram Setup

1. "Create a Telegram bot via @BotFather — send `/newbot` and follow the prompts"
2. "Copy the bot token and set it as an environment variable:"
   ```bash
   export TELEGRAM_BOT_TOKEN="your-bot-token"
   ```
3. "Send any message to your bot in Telegram, then get your chat ID:"
   ```bash
   curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | jq '.result[0].message.chat.id'
   ```
4. "Set the chat ID:"
   ```bash
   export TELEGRAM_CHAT_ID="your-chat-id"
   ```
5. Add both exports to your shell profile for persistence.

### Lark Webhook Setup

1. "Create a custom bot in a Lark group → get the webhook URL"
2. "Save it to config:"
   Read `~/.okx/earn-hunter/platform.json` → set `.notify.lark_webhook` to the webhook URL → write back.

## Smoke Test & Delivery Confirmation (PRD 3.2)

After setup, send a test message to confirm delivery:

```
📡 Earn Hunter — Notification Test

This is a test message from earn-hunter.
If you see this, notifications are working!

Timestamp: <current_time>
```

### 送达确认流程

发送测试消息后，**必须主动追问**：

1. 发送测试消息
2. 提示用户："已向 {channel} 发送测试消息，请确认是否收到？"
3. 用户确认收到 → 通过，完成 setup
4. 用户说没收到 → 进入排障流程（见下方）
5. 5 分钟无回复 → 主动 ping 一次："还没收到测试消息吗？需要帮你排查一下？"

### 排障流程 (PRD 3.2.1) — TG 渠道

当用户反馈未收到 TG 测试消息时，按以下步骤排查：

```bash
# Step 1: 验证 bot token 有效性
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
# 期望返回 ok: true + bot info

# Step 2: 验证 chat_id 有效性
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChat?chat_id=${TELEGRAM_CHAT_ID}"
# 期望返回 ok: true + chat info

# Step 3: 重发测试消息
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  -d "text=🔧 Earn Hunter 排障测试消息" \
  -d "parse_mode=HTML"

# Step 4: 检查 bot 是否被用户 block（从 sendMessage 返回判断）
# error_code 403 + "bot was blocked by the user" → 用户需要先 unblock bot
```

排障失败（所有步骤均未解决）：
- 写入 `config.notify.fallbackToSession = true`
- 降级到 session 模式
- 提示用户："TG 通知暂不可用，已降级到会话模式。后续排查好 TG 后可重新启用。"

### 排障流程 — Lark 渠道

1. 检查 webhook URL 格式（必须以 `https://` 开头，包含 `/hook/`）
2. 重发测试消息，检查返回 `{"StatusCode":0}`
3. 确认 bot 已被添加到目标 Lark 群组
4. 失败 → 同样降级到 session 模式

## notify.log

所有渠道发送结果写入 `~/.okx/earn-hunter/notify.log`，格式：

```
[ISO_TIMESTAMP] [CHANNEL] [OK|FAIL] [detail]
```

示例：

```
[2026-05-20T10:30:00+08:00] [TG] [OK] flash:12345:100 sent
[2026-05-20T10:30:01+08:00] [TG] [OK] fixed:USDT:7D:0.035 sent
[2026-05-20T10:30:02+08:00] [LARK] [FAIL] webhook returned StatusCode 9499
[2026-05-20T11:00:00+08:00] [SESSION] [OK] verbose log — no new opportunities
```

日志用途：
- 排查通知未送达问题
- 审计历史通知记录
- 监控渠道可用性
