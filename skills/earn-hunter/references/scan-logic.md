# Scan Logic

> **⚙️ This logic is implemented by `scripts/scan.sh` (pure shell + jq).** The agent does **not** execute these steps manually — it runs `scripts/scan.sh` (installed to `~/.okx/earn-hunter/scan.sh`) and relays the output. This document is the **specification** the script implements, kept for reference and review. Do not hand-execute the steps below; if behavior needs to change, change the script and update this spec together.
>
> Key script behaviors that satisfy the two original bugs:
> - **No new opportunities + `verboseLog=false` → the script exits 0 silently with zero output and sends nothing.** (Fixes the "sends 'Scan complete' instead of staying silent" bug.)
> - **Triggered by OS crontab, not an LLM session** (Claude Code / Hermes / Generic). (Fixes the "Claude Code `/loop` expires" bug.)
>
> **OpenClaw exception:** the scan is triggered by an isolated, light-context cron agent turn (via the in-session `cron` tool). That turn runs this same script with `notify.channel = "session"` (output to stdout) and lets cron `announce` deliver the result to the conversation — it does **not** curl TG/Lark. Everything else (filter, dedup, state, silent-exit) is identical.
>
> Test hooks (env vars, used only for verification, inert in production): `EH_FLASH_FIXTURE`, `EH_FIXED_FIXTURE`, `EH_FLEXIBLE_FIXTURE`, `EH_DRY_RUN`, `EH_STATE_DIR`, `EH_FORCE_FAIL`, `EH_NOW_ISO`, `EH_TEST_NAMESPACE`. Profile is injected via `OKX_PROFILE` (empty → no `--profile` flag).

## CLI Version Compatibility

| Feature | v1.3.2 | v1.3.3+ |
|---|---|---|
| `earn flash-earn projects` | ✅ | ✅ |
| `earn savings rate-history` (includes `fixedOffers`) | ✅ | ✅ |
| `earn savings fixed-products` (dedicated command) | ❌ | ✅ |

For maximum compatibility, default to `rate-history` + `fixedOffers` extraction. Use `fixed-products` when available for cleaner output.

## Auth Mode Detection

Before scanning, determine auth mode (done once during Preflight, remembered for session):
- `okx config show --json` has `api_key` → API Key mode → all commands use `--profile live`
- No API key + `okx auth status --json` returns `logged_in` → OAuth mode → no `--profile` flag

Below, `[--profile live]` means: add the flag only in API Key mode.

## Scan Commands

### Flash Earn

```bash
okx [--profile live] earn flash-earn projects --status 0,100 --json
```

Output: array of projects with fields:
- `id` — project ID (part of dedupe key)
- `status` — `0`=upcoming, `100`=in-progress
- `canPurchase` — boolean, whether user can subscribe now
- `beginTime` / `endTime` — formatted timestamps
- `rewards` — array of `{amt, ccy}`

### Fixed Earn (定期) + Flexible Rate

**CLI v1.3.3+:**
```bash
okx [--profile live] earn savings fixed-products [--ccy <ccy>] --json
```

**CLI v1.3.2 (fallback):** `fixed-products` command does not exist. Use `rate-history` which returns both flexible rate and fixed offers in one call:
```bash
okx [--profile live] earn savings rate-history --ccy <ccy> --limit 1 --json
```

Output structure (v1.3.2):
```json
{
  "data": [{"ccy": "USDT", "lendingRate": "0.0138", "ts": "..."}],
  "fixedOffers": [{"ccy": "USDT", "term": "90D", "rate": "0.035", "lendQuota": "0", "minLend": "", "soldOut": true}]
}
```

- `data[].lendingRate` — current flexible APY (for comparison)
- `fixedOffers[]` — available fixed-term products with `ccy`, `term`, `rate`, `lendQuota`, `soldOut`

**Detection logic:** Try `earn savings fixed-products --json` first. If command not found, fall back to `earn savings rate-history --json` and extract `fixedOffers`.

### Flexible Earn (活期)

For each currency in `config.flexible.currencies` (default `["USDT", "USDC"]`):

```bash
okx [--profile live] earn savings rate-history --ccy <ccy> --limit 1 --json
```

Output structure:
```json
{
  "data": [{"ccy": "USDC", "lendingRate": "0.0841", "ts": "1717020000000"}],
  "fixedOffers": [...]
}
```

- `data[0].lendingRate` — current flexible APY (decimal, e.g. `"0.0841"` = 8.41%)
- The script iterates through configured currencies and collects `{ccy, lendingRate}` pairs into a JSON array

If `flexible.currencies` is `"all"` or empty, defaults to `["USDT", "USDC"]` (since the API requires a `ccy` parameter per call).

## Filter Rules

### Flash Earn

1. `status=100` (in-progress) AND `canPurchase=true` → notify with "🟢 Available now"
2. `status=0` (upcoming) → notify with "⏳ Upcoming" + countdown to `beginTime`. Do NOT mark as "available"
3. `status=100` AND `canPurchase=false` → skip (sold out)

**Sorting:** upcoming (status=0) projects sort **before** in-progress (status=100) projects in the notification list.

### Fixed Earn

1. `soldOut=true` → skip
2. `lendQuota` converts to zero or empty → skip. API returns string values; explicitly convert: `Number(lendQuota) === 0` OR `lendQuota === ""` OR `lendQuota` is null/undefined → skip
3. If `config.currencies` is non-empty array or `"all"` string → `"all"` and `[]` both mean all currencies; non-empty array → only include matching `ccy`
4. **APY 两层阈值过滤**（all values in decimal form, e.g. 0.08 = 8%）：
   - 先查 `config.currencyOverrides[ccy].minApy`，有值则用它作为该币种阈值
   - 没有 override → 使用 `config.globalMinApy` 作为兜底阈值
   - Compare `Number(rate)` directly with threshold (both in decimal). If `Number(rate) < threshold` → skip
   - Example: rate="0.092" (9.2%), minApy=0.08 (8%) → 0.092 >= 0.08 → pass
5. **期限筛选**：
   - 读取 `config.terms`（默认值 `"all"`）
   - 如果 `terms` 是 `"all"` → 不过滤期限
   - 如果 `terms` 是数组（如 `["7D", "30D", "90D"]`）→ 只保留 `term` 在列表中的 offer

### Flexible Earn

1. **APY 两层阈值过滤**（same pattern as Fixed, all values in decimal form）：
   - 先查 `config.flexible.currencyOverrides[ccy].minApy`，有值则用它作为该币种阈值
   - 没有 override → 使用 `config.flexible.globalMinApy` 作为兜底阈值（default `0.08` = 8%）
   - Compare `Number(lendingRate)` directly with threshold (both in decimal). If `Number(lendingRate) < threshold` → skip
   - Example: lendingRate="0.0841" (8.41%), minApy=0.08 (8%) → 0.0841 >= 0.08 → pass

## Dedup Rules

State uses a **hierarchical structure** with separate `flash`, `fixed`, and `flexible` namespaces:

```json
{
  "flash": {
    "<id>:<status>": { "notifiedAt": "<ISO 8601>" }
  },
  "fixed": {
    "<ccy>:<term>:<rate>": { "notifiedAt": "<ISO 8601>" }
  },
  "flexible": {
    "<ccy>": { "notifiedAt": "<ISO 8601>", "rate": "<lendingRate>" }
  },
  "consecutive_failures": 0,
  "last_error": ""
}
```

Before notifying, read `~/.okx/earn-hunter/state.json` and check if key exists in the corresponding namespace. If exists → skip.

Key format:
- Flash: `<id>:<status>` in `state.flash` (e.g. `state.flash["12345:0"]`, `state.flash["12345:100"]`)
  - 状态从 `0` 变为 `100` 时会生成新 key（`"12345:100"`），触发第二次通知
  - 效果：upcoming 通知一次，变为 in-progress 后再通知一次
- Fixed: `<ccy>:<term>:<rate>` in `state.fixed` (e.g. `state.fixed["USDT:7D:0.035"]`)
  - `rate` 使用 API 返回的全精度字符串（不做四舍五入）
  - APY 变化视为新 offer，生成新 key，触发新通知
- Flexible: `<ccy>` in `state.flexible` (e.g. `state.flexible["USDC"]`)
  - **阈值穿越模式**：key 只用币种名，当 rate >= threshold 时通知一次
  - rate 下降到 threshold 以下时，diff cleanup 移除 key
  - 下次 rate 重新超过 threshold 时，生成新通知
  - 效果：每个"高收益期"只通知一次，避免活期利率波动导致频繁通知
  - `rate` 字段存储通知时的利率（仅供参考，不参与去重判断）

TTL (safety net — diff cleanup is the primary removal mechanism):
- Flash keys expire after **7 days**
- Fixed keys expire after **7 days**
- Flexible keys expire after **7 days**

After notifying: add key to the corresponding namespace with ISO 8601 timestamp → `state.flash["<id>:<status>"] = {"notifiedAt": "<ISO 8601>"}` or `state.fixed["<ccy>:<term>:<rate>"] = {"notifiedAt": "<ISO 8601>"}` or `state.flexible["<ccy>"] = {"notifiedAt": "<ISO 8601>", "rate": "<lendingRate>"}`.

## State Cleanup

每次扫描结束后执行三步清理（AI 直接读写 `state.json`）：

### Step 1: Diff 清理（移除已下架 offer）

**Flash: 基于 project ID 维度清理**（不是 key 精确匹配）：
1. 收集本轮 `flash_results` 中所有 project id
2. 遍历 `state.flash` 中所有 key，提取 key 中的 id 部分（`<id>:<status>` 中的 `<id>`）
3. 如果 id 不在本轮 flash_results 中 → 删除该 key

效果：项目完全下架才清 state。状态从 `0` 变为 `100, canPurchase=false`（直接售罄）时，只要项目还在 API 返回中，state 中的 `"<id>:0"` key 不会被误删。

**Fixed: 基于 key 精确匹配清理**：
1. 收集本轮 `fixed_results` 中所有非 soldOut 产品的 key `<ccy>:<term>:<rate>`
2. 遍历 `state.fixed` 中所有 key
3. 如果 key 不在本轮 current_fixed_keys 中 → 删除

**Flexible: 基于阈值穿越清理**：
1. 收集本轮 `flex_filtered`（已过 APY 阈值过滤）中所有币种 key `<ccy>`
2. 遍历 `state.flexible` 中所有 key
3. 如果 key（去掉 `test:` 前缀后）不在本轮 current_flex_keys 中 → 删除（说明 rate 已低于阈值）
4. 效果：rate 低于阈值时移除 state，下次 rate 回升时可重新触发通知
5. **注意：flexible 的 `test:` key 也参与 diff 清理**（不同于 flash/fixed 的豁免），因为 flexible 的清理语义是"利率是否仍在阈值以上"，测试 fixture 的利率数据同样应参与此判断

**Test namespace immunity (flash/fixed only)**: flash 和 fixed 的 `test:` 前缀 key 不参与 diff 清理（Test Mode 写入的 key 只受 TTL 清理影响），因为测试 fixture 的 ID/offer 不在真实 API 返回中，会被误删。Flexible 不适用此规则。

### Step 2: TTL 清理（过期兜底）

遍历 `state.flash`、`state.fixed` 和 `state.flexible` 中所有 key，解析 `notifiedAt` 时间戳，删除超过 TTL 的条目：
- Flash keys: TTL = 7 天
- Fixed keys: TTL = 7 天
- Flexible keys: TTL = 7 天

### Step 3: 失败计数更新

- 扫描成功完成（无论是否有新机会）→ `state.consecutive_failures = 0`，`state.last_error = ""`
- 扫描失败（任何错误）→ `state.consecutive_failures += 1`，`state.last_error = "<error message truncated to 200 chars>"`
- `consecutive_failures >= 3` → 发送"连续失败"告警（见 `templates/error-alert.md`），然后重置为 0

## Complete Scan Sequence

```
1. Read config (AI reads ~/.okx/earn-hunter/config.json directly)
   flash_enabled = config.flash.enabled
   fixed_enabled = config.fixed.enabled
   flex_enabled = config.flexible.enabled
   currencies = config.currencies
   globalMinApy = config.fixed.globalMinApy
   currencyOverrides = config.fixed.currencyOverrides
   terms = config.fixed.terms
   flex_min_apy = config.flexible.globalMinApy    # default 0.08 (8%)
   flex_currencies = config.flexible.currencies    # default ["USDT","USDC"]
   flex_ccy_overrides = config.flexible.currencyOverrides
   verboseLog = config.verboseLog

2. Run scan commands (parallel where possible)
   If flash_enabled is true:
     flash_results = okx earn flash-earn projects --status 0,100 --json
   If fixed_enabled is true:
     fixed_results = okx earn savings fixed-products --json
     If command not found (CLI <1.3.3), fallback:
       fixed_results = okx earn savings rate-history --ccy <ccy> --limit 1 --json → extract fixedOffers
     For APR comparison: fetch flexible rate for relevant currencies
   If flex_enabled is true:
     flex_results = []
     For each ccy in flex_currencies:
       out = okx earn savings rate-history --ccy <ccy> --limit 1 --json
       Extract data[0].lendingRate → append {ccy, lendingRate} to flex_results

   NOTE: all numeric fields from API are strings. Always convert before comparison:
   Number(lendQuota), Number(rate), Number(lendingRate), etc.

3. Apply filters
   flash_filtered = apply Flash Earn filter rules
   fixed_filtered = apply Fixed Earn filter rules (两层 APY 阈值 + terms 筛选)
   flex_filtered = apply Flexible Earn filter rules (两层 APY 阈值: override > globalMinApy)

4. Apply dedup (read state.json hierarchical structure)
   flash_new = [p for p in flash_filtered if "<p.id>:<p.status>" not in state.flash]
   fixed_new = [p for p in fixed_filtered if "<p.ccy>:<p.term>:<p.rate>" not in state.fixed]
   flex_new = [p for p in flex_filtered if "<p.ccy>" not in state.flexible]

5. Notify (if any new opportunities)
   Count sections with new opportunities. If >= 2, use mixed template.

   If flash_new is non-empty:
     Render notification using templates/flash-earn.md
     Send via configured channel (see notify-channels.md)
     For each notified project:
       state.flash["<id>:<status>"] = {"notifiedAt": "<ISO 8601 now>"}

   If fixed_new is non-empty:
     Optionally fetch flexible rates for APR comparison
     Render notification using templates/fixed-earn.md
     Send via configured channel
     For each notified product:
       state.fixed["<ccy>:<term>:<rate>"] = {"notifiedAt": "<ISO 8601 now>"}

   If flex_new is non-empty:
     Render notification using templates/flexible-earn.md
     Send via configured channel
     For each notified currency:
       state.flexible["<ccy>"] = {"notifiedAt": "<ISO 8601 now>", "rate": "<lendingRate>"}

6. Update state.json (AI reads, modifies, writes back)

   # 6a. Flash diff cleanup: ID-level (not key-level)
   # Collect all project IDs from raw flash_results
   current_flash_ids = [p.id for each in flash_results]
   For each key in state.flash:
     Extract id from key (split by ":" → first element)
     If id not in current_flash_ids → delete state.flash[key]
   Skip any key starting with "test:" (Test Mode immunity)

   # 6b. Fixed diff cleanup: key-level
   # Use RAW scan results (before APY/currency/terms filter), only exclude soldOut
   current_fixed_keys = ["<ccy>:<term>:<rate>" for each in fixed_results where NOT soldOut AND Number(lendQuota) > 0]
   For each key in state.fixed:
     If key not in current_fixed_keys → delete state.fixed[key]
   Skip any key starting with "test:" (Test Mode immunity)

   # 6c. Flexible diff cleanup: threshold-crossing (key = ccy)
   # Use FILTERED results (after APY threshold filter) — only currencies still above threshold
   current_flex_keys = [p.ccy for each in flex_filtered]
   For each key in state.flexible:
     Strip "test:" prefix if present, then check against current_flex_keys
     If stripped key not in current_flex_keys → delete state.flexible[key]
   # NOTE: test: keys are NOT immune here (unlike flash/fixed) — see State Cleanup section

   # 6d. TTL cleanup: remove entries older than 7 days
   For each key in state.flash:
     Parse notifiedAt → if (now - notifiedAt) > 7 days → delete
   For each key in state.fixed:
     Parse notifiedAt → if (now - notifiedAt) > 7 days → delete
   For each key in state.flexible:
     Parse notifiedAt → if (now - notifiedAt) > 7 days → delete

   # 6e. Failure counter update
   state.consecutive_failures = 0
   state.last_error = ""

7. No new opportunities → verboseLog 控制行为
   If flash_new, fixed_new and flex_new are all empty:
     If verboseLog is true:
       Send brief status: "✅ Earn Hunter 扫描完成，暂无新机会。Flash: X 个活跃, Fixed: Y 个可申购, Flexible: Z 个达标。"
       (X = len(flash_filtered), Y = len(fixed_filtered), Z = len(flex_filtered))
     If verboseLog is false:
       Silent exit (no output)

8. On scan error (any step 2-6 throws):
   state.consecutive_failures += 1
   state.last_error = error_message[:200]
   If state.consecutive_failures >= 3:
     Send alert using templates/error-alert.md "连续失败" template
     state.consecutive_failures = 0  (reset after alerting)
   If error is 401 / "Session expired":
     Send alert using templates/error-alert.md "凭证失效" template
     Do NOT continue scanning — stop until re-authenticated
   Else (network/timeout):
     Retry once. If still fails, skip this cycle.
```
