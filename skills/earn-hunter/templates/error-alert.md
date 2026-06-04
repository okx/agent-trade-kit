# Error Alert Template

Displayed when Earn Hunter encounters operational errors that require user attention.

Render in **user's language**. Brand/token names are never translated.

## Scenario 1: Credential Expired

Trigger: OKX API returns authentication error (401, token expired, session invalid).

```
⚠ Earn Hunter · 凭证失效

OKX API 凭证已过期或失效，扫描已暂停。

🔑 重新登录：
   运行 `okx-cex-auth login` 重新认证
   或在 Claude Code 中说"登录 OKX"加载 okx-cex-auth skill
   认证完成后，Earn Hunter 将在下一轮自动恢复扫描

📋 影响：
   暂停期间的机会将不会被通知
```

## Scenario 2: Consecutive Scan Failures (3 rounds)

Trigger: scan has failed for 3 consecutive rounds (any error type: network, API, parse error, etc.).

```
🚨 Earn Hunter · 连续 3 轮扫描失败

最近 3 次扫描均未成功完成。

🔍 最后一次错误：
   {error_message}

🛠 排查建议：
   1. 检查网络连接
   2. 运行 `okx auth login` 确认凭证有效
   3. 运行 `okx earn flash-earn projects --json` 手动测试 API
   4. 如持续失败，检查 OKX 服务状态

📋 影响：
   扫描仍在重试中，恢复后将自动继续推送
```

### Data Fields

- `{error_message}` — last error message from the failed scan (truncated to 200 chars if needed)

### Empty Error Fallback

If `{error_message}` is an empty string, replace the error line with:

```
🔍 最后一次错误：
   （未捕获到错误信息）

💡 这通常是 cron 的 PATH 找不到 okx/node/jq 导致的。
   请检查 ~/.okx/earn-hunter/cron.log 获取详细信息。
   临时修复：在 crontab 行首添加 PATH=... 指向 node/okx/jq 所在目录。
```

**en:**
```
🔍 Last error:
   (no error message captured)

💡 This usually means cron's PATH cannot find okx/node/jq.
   Check ~/.okx/earn-hunter/cron.log for details.
   Quick fix: prepend PATH=... to the crontab entry pointing to node/okx/jq directories.
```

## Locked Terms (do not translate)

Earn Hunter, OKX — brand terms stay as-is. CLI commands stay as-is (e.g. `okx auth login`).

## Lark Card Format

- Credential expired: use `template: "orange"` for header
- Consecutive failures: use `template: "red"` for header
