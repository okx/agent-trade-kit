# Activation Confirmation Template

Displayed after user activates Earn Hunter successfully. Summarizes the configuration and first scan result.

Render in **user's language**. Brand/token names are never translated.

## Structure

```
🎯 Earn Hunter 已激活

📋 监控配置
   扫描时间：{scan_time}
   扫描品种：{scan_scope}
   定期 — 币种：{currencies}，阈值：{min_apy_display}，期限：{terms}
   活期 — 币种：{flex_currencies}，阈值：{flex_min_apy_display}
   模式：实盘

🔍 首次扫描结果
   {first_scan_result}

⏰ 扫描频次
   每小时 1 次（默认）
   如需修改，对我说"把扫描频率改成 30 分钟"，或编辑 platform.json 的 scheduler.interval 字段

📢 通知渠道
   {channel_display}
   {channel_hint}
```

## Data Fields

### Configuration

- `{scan_time}` — activation timestamp, ISO 8601 format (e.g. `2026-05-20T14:30:00+08:00`)
- `{scan_scope}` — combination of enabled types
  - all three → "Flash Earn + Fixed Earn + Flexible Earn"
  - only flash → "仅 Flash Earn"
  - only fixed → "仅 Fixed Earn"
  - only flexible → "仅 Flexible Earn"
  - any other combination → list enabled types with " + " separator
- `{currencies}` — comma-separated list of monitored currencies for Fixed Earn (e.g. `USDT, USDC, BTC`)
- `{flex_currencies}` — comma-separated list of monitored currencies for Flexible Earn (e.g. `USDT, USDC`)
- `{min_apy_display}` — Fixed Earn: when `globalMinApy = 0`, display "不限" (zh) or "No limit" (en); otherwise format as `APR ≥ X.XX%`
- `{flex_min_apy_display}` — Flexible Earn: format as `APY ≥ X.XX%` (default 8.00%)
- `{terms}` — term filter display (e.g. `7D, 14D, 30D` or `全部期限`)

### First Scan Result

- If opportunities found: `发现 {X} 个机会（详见下方通知）`
- If no opportunities: `暂无新机会，将在下一轮扫描时检查`

### Notification Channel

- `{channel_display}` — active channel name (e.g. `Lark 推送`, `Telegram`, `当前会话`)
- `{channel_hint}` — guidance when channel is "session" (current conversation):
  ```
  💡 当前通知仅在会话内显示。如需离线推送，配置 Lark 或 Telegram 渠道：
     编辑 platform.json 中的 notify.channel 字段
  ```
  When channel is Lark or Telegram, `{channel_hint}` is empty.

## Locked Terms (do not translate)

Earn Hunter, Flash Earn, Fixed Earn, Simple Earn, APR, APY, OKX — brand/financial terms stay as-is. Currency symbols stay as-is.

## Example (zh-CN)

```
🎯 Earn Hunter 已激活

📋 监控配置
   扫描时间：2026-05-20T14:30:00+08:00
   扫描品种：Flash Earn + Fixed Earn + Flexible Earn
   定期 — 币种：USDT, USDC，阈值：APR ≥ 3.00%，期限：7D, 14D, 30D
   活期 — 币种：USDT, USDC，阈值：APY ≥ 8.00%
   模式：实盘

🔍 首次扫描结果
   发现 3 个机会（详见下方通知）

⏰ 扫描频次
   每小时 1 次（默认）
   如需修改，对我说"把扫描频率改成 30 分钟"，或编辑 platform.json 的 scheduler.interval 字段

📢 通知渠道
   当前会话
   💡 当前通知仅在会话内显示。如需离线推送，配置 Lark 或 Telegram 渠道：
      编辑 platform.json 中的 notify.channel 字段
```
