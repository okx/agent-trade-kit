#!/usr/bin/env bash
#
# earn-hunter scan.sh
#
# Pure shell + jq implementation of the earn-hunter Scan Cycle.
# Designed to run from OS crontab with ZERO LLM cost. Also invoked by the
# earn-hunter skill agent (which simply runs this script and relays its output).
#
# Implements references/scan-logic.md (8-step sequence) verbatim:
#   1. read config        2. call CLI (flash + fixed, with rate-history fallback)
#   3. filter             4. dedup (read state)
#   5. render + send      6. state cleanup (diff / TTL / failure counter)
#   7. verboseLog gate    8. error handling (consecutive failures, 401)
#
# SECURITY:
#   - NEVER hardcodes API key/secret/passphrase. Auth is fully delegated to the
#     okx CLI, which reads ~/.okx/config.toml itself.
#   - NEVER runs any command that prints credentials (no `okx config show`, no dump).
#   - Profile is injected via env var OKX_PROFILE (optional). When set the script
#     adds `--profile "$OKX_PROFILE"`; when empty it passes no profile flag.
#
# TEST HOOKS (do not affect production paths when unset):
#   EH_FLASH_FIXTURE   path to a JSON file used INSTEAD of the live flash CLI call
#   EH_FIXED_FIXTURE   path to a JSON file used INSTEAD of the live fixed CLI call
#   EH_DRY_RUN=1       send functions echo the payload instead of curl-ing it
#   EH_STATE_DIR       override state dir (default ~/.okx/earn-hunter), for tests
#   EH_FORCE_FAIL=1    simulate a scan failure (for failure-counter tests)
#   EH_NOW_ISO         override "now" ISO timestamp (for deterministic tests)
#   EH_TEST_NAMESPACE=1 prefix dedup keys with "test:" (Test Mode)
#
set -uo pipefail

# ---------------------------------------------------------------------------
# 0. Paths & globals
# ---------------------------------------------------------------------------
STATE_DIR="${EH_STATE_DIR:-$HOME/.okx/earn-hunter}"
CONFIG_FILE="$STATE_DIR/config.json"
PLATFORM_FILE="$STATE_DIR/platform.json"
STATE_FILE="$STATE_DIR/state.json"
NOTIFY_LOG="$STATE_DIR/notify.log"

STATE_INIT='{"flash":{},"fixed":{},"consecutive_failures":0,"last_error":""}'
TTL_DAYS=7

# Profile flag injection — empty OKX_PROFILE => no flag.
PROFILE_ARGS=()
if [[ -n "${OKX_PROFILE:-}" ]]; then
  PROFILE_ARGS=(--profile "$OKX_PROFILE")
fi

# Test namespace prefix for dedup keys (Test Mode immunity).
KEY_PREFIX=""
if [[ "${EH_TEST_NAMESPACE:-0}" == "1" ]]; then
  KEY_PREFIX="test:"
fi

now_iso() {
  if [[ -n "${EH_NOW_ISO:-}" ]]; then
    printf '%s' "$EH_NOW_ISO"
  else
    date +%Y-%m-%dT%H:%M:%S%z 2>/dev/null
  fi
}

now_hhmm() {
  date +%H:%M 2>/dev/null
}

log_notify() {
  # $1 channel  $2 OK|FAIL  $3 detail
  printf '[%s] [%s] [%s] %s\n' "$(now_iso)" "$1" "$2" "$3" >> "$NOTIFY_LOG" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# 1. Init state dir / files
# ---------------------------------------------------------------------------
init_storage() {
  mkdir -p "$STATE_DIR" 2>/dev/null || true

  if [[ ! -f "$STATE_FILE" ]]; then
    printf '%s\n' "$STATE_INIT" > "$STATE_FILE"
  fi
  # Validate / repair corrupted state.
  if ! jq -e . "$STATE_FILE" >/dev/null 2>&1; then
    printf '%s\n' "$STATE_INIT" > "$STATE_FILE"
  fi
  # Ensure required keys exist.
  local fixed
  fixed=$(jq -c '
    {
      flash: (.flash // {}),
      fixed: (.fixed // {}),
      consecutive_failures: (.consecutive_failures // 0),
      last_error: (.last_error // "")
    }' "$STATE_FILE" 2>/dev/null) || fixed="$STATE_INIT"
  printf '%s\n' "$fixed" > "$STATE_FILE"
}

# ---------------------------------------------------------------------------
# Config accessors (with safe defaults if config missing)
# ---------------------------------------------------------------------------
cfg() {
  # $1 jq filter, $2 default
  local val
  if [[ -f "$CONFIG_FILE" ]]; then
    val=$(jq -r "$1 // empty" "$CONFIG_FILE" 2>/dev/null)
  fi
  if [[ -z "${val:-}" ]]; then printf '%s' "$2"; else printf '%s' "$val"; fi
}

cfg_json() {
  # $1 jq filter, $2 default(json)
  local val
  if [[ -f "$CONFIG_FILE" ]]; then
    val=$(jq -c "$1" "$CONFIG_FILE" 2>/dev/null)
  fi
  if [[ -z "${val:-}" || "$val" == "null" ]]; then printf '%s' "$2"; else printf '%s' "$val"; fi
}

# ---------------------------------------------------------------------------
# i18n
# ---------------------------------------------------------------------------
LANG_SEL="zh-CN"
resolve_lang() {
  local l
  l=$(cfg '.notify.language' 'auto')
  if [[ "$l" == "auto" || -z "$l" ]]; then LANG_SEL="zh-CN"; else LANG_SEL="$l"; fi
}

t() {
  # $1 = key. Returns localized string.
  case "$1" in
    flash_title)      [[ "$LANG_SEL" == en ]] && echo "Flash Earn" || echo "Flash Earn" ;;
    badge_inprogress) [[ "$LANG_SEL" == en ]] && echo "in-progress" || echo "进行中" ;;
    badge_upcoming)   [[ "$LANG_SEL" == en ]] && echo "upcoming" || echo "预告" ;;
    flash_cta)        [[ "$LANG_SEL" == en ]] && echo "→ Subscribe now ( https://okx.com/ul/rhNe3q )" || echo "→ 立即申购（ https://okx.com/ul/rhNe3q ）" ;;
    fixed_filter)     [[ "$LANG_SEL" == en ]] && echo "Filter" || echo "筛选条件" ;;
    fixed_cta_push)   [[ "$LANG_SEL" == en ]] && echo "→ Open Claude Code and say \"subscribe %s fixed %s\"" || echo "→ 打开 Claude Code 说\"申购 %s 定期 %s\"" ;;
    new_opps)         [[ "$LANG_SEL" == en ]] && echo "new" || echo "个新机会" ;;
    verbose_status)   [[ "$LANG_SEL" == en ]] && echo "✅ Earn Hunter scan complete, no new opportunities. Flash: %s active, Fixed: %s subscribable." || echo "✅ Earn Hunter 扫描完成，暂无新机会。Flash: %s 个活跃, Fixed: %s 个可申购。" ;;
    *) echo "" ;;
  esac
}

# ---------------------------------------------------------------------------
# 2. CLI calls (fixture-aware)
# ---------------------------------------------------------------------------
fetch_flash() {
  if [[ -n "${EH_FLASH_FIXTURE:-}" ]]; then
    cat "$EH_FLASH_FIXTURE" 2>/dev/null
    return $?
  fi
  okx "${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}" earn flash-earn projects --status 0,100 --json 2>/dev/null
}

fetch_fixed() {
  if [[ -n "${EH_FIXED_FIXTURE:-}" ]]; then
    cat "$EH_FIXED_FIXTURE" 2>/dev/null
    return $?
  fi
  local out
  out=$(okx "${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}" earn savings fixed-products --json 2>/dev/null)
  local rc=$?
  # Fallback: fixed-products unavailable (CLI <1.3.3) → rate-history.fixedOffers
  if [[ $rc -ne 0 || -z "$out" ]] || ! echo "$out" | jq -e 'type=="array"' >/dev/null 2>&1; then
    local rh
    rh=$(okx "${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"}" earn savings rate-history --limit 1 --json 2>/dev/null)
    out=$(echo "$rh" | jq -c '.fixedOffers // []' 2>/dev/null)
    [[ -z "$out" ]] && out="[]"
  fi
  printf '%s' "$out"
}

# ---------------------------------------------------------------------------
# Auth-error detection (401 / session expired) — scan stdout/stderr text
# ---------------------------------------------------------------------------
is_auth_error() {
  # $1 = combined output text
  echo "$1" | grep -qiE '401|unauthorized|session expired|not authenticated|token expired|requires_auth' && return 0
  return 1
}

# ---------------------------------------------------------------------------
# Notification senders (channel routing). DRY_RUN => echo only.
# ---------------------------------------------------------------------------
detect_channel() {
  # Priority: explicit notify.channel override else auto (TG > Lark > session)
  local ch
  ch=$(jq -r '.notify.channel // "auto"' "$PLATFORM_FILE" 2>/dev/null)
  [[ -z "$ch" || "$ch" == "null" ]] && ch="auto"

  local tg_token_env tg_chat_env lark
  tg_token_env=$(jq -r '.notify.telegram.bot_token_env // "TELEGRAM_BOT_TOKEN"' "$PLATFORM_FILE" 2>/dev/null)
  tg_chat_env=$(jq -r '.notify.telegram.chat_id_env // "TELEGRAM_CHAT_ID"' "$PLATFORM_FILE" 2>/dev/null)
  lark=$(jq -r '.notify.lark_webhook // ""' "$PLATFORM_FILE" 2>/dev/null)

  local tg_token tg_chat
  tg_token=$(printenv "$tg_token_env" 2>/dev/null || true)
  tg_chat=$(printenv "$tg_chat_env" 2>/dev/null || true)

  local tg_ready=0 lark_ready=0
  [[ -n "$tg_token" && -n "$tg_chat" ]] && tg_ready=1
  if [[ "$lark" == https://* && "$lark" == *"/hook/"* ]]; then lark_ready=1; fi

  case "$ch" in
    telegram) [[ $tg_ready -eq 1 ]] && { echo telegram; return; } ;;
    lark)     [[ $lark_ready -eq 1 ]] && { echo lark; return; } ;;
    session)  echo session; return ;;
  esac
  # auto / fell through
  if [[ $tg_ready -eq 1 ]]; then echo telegram; return; fi
  if [[ $lark_ready -eq 1 ]]; then echo lark; return; fi
  echo session
}

send_telegram() {
  # $1 = plain text message, $2 = dedup detail for log
  local msg="$1" detail="$2"
  local tg_token_env tg_chat_env
  tg_token_env=$(jq -r '.notify.telegram.bot_token_env // "TELEGRAM_BOT_TOKEN"' "$PLATFORM_FILE" 2>/dev/null)
  tg_chat_env=$(jq -r '.notify.telegram.chat_id_env // "TELEGRAM_CHAT_ID"' "$PLATFORM_FILE" 2>/dev/null)
  local TOKEN CHAT_ID
  TOKEN=$(printenv "$tg_token_env" 2>/dev/null)
  CHAT_ID=$(printenv "$tg_chat_env" 2>/dev/null)

  if [[ "${EH_DRY_RUN:-0}" == "1" ]]; then
    echo "=== [DRY-RUN TG] chat=$CHAT_ID ==="
    printf '%s\n' "$msg"
    log_notify "TG" "OK" "$detail (dry-run)"
    return 0
  fi

  local resp
  resp=$(curl -s "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT_ID}" \
    --data-urlencode "text=${msg}" \
    -d "parse_mode=HTML" 2>/dev/null)
  if echo "$resp" | jq -e '.ok == true' >/dev/null 2>&1; then
    log_notify "TG" "OK" "$detail sent"
    return 0
  else
    log_notify "TG" "FAIL" "$detail $(echo "$resp" | head -c 150)"
    return 1
  fi
}

send_lark() {
  # $1 = title, $2 = markdown body, $3 = template color, $4 = detail
  local title="$1" body="$2" color="$3" detail="$4"
  local webhook
  webhook=$(jq -r '.notify.lark_webhook // ""' "$PLATFORM_FILE" 2>/dev/null)

  local payload
  payload=$(jq -n --arg t "$title" --arg b "$body" --arg c "$color" '{
    msg_type: "interactive",
    card: {
      schema: "2.0",
      header: { title: { content: $t, tag: "plain_text" }, template: $c },
      body: { elements: [ { tag: "markdown", content: $b } ] }
    }
  }')

  if [[ "${EH_DRY_RUN:-0}" == "1" ]]; then
    echo "=== [DRY-RUN LARK] $title ==="
    printf '%s\n' "$body"
    log_notify "LARK" "OK" "$detail (dry-run)"
    return 0
  fi

  local resp
  resp=$(curl -s -X POST "$webhook" -H "Content-Type: application/json" -d "$payload" 2>/dev/null)
  if echo "$resp" | jq -e '.StatusCode == 0 or .code == 0' >/dev/null 2>&1; then
    log_notify "LARK" "OK" "$detail sent"
    return 0
  else
    log_notify "LARK" "FAIL" "$detail $(echo "$resp" | head -c 150)"
    return 1
  fi
}

send_session() {
  # $1 = message, $2 = detail. Session = stdout (interactive relay).
  local msg="$1" detail="$2"
  printf '%s\n' "$msg"
  log_notify "SESSION" "OK" "$detail"
  return 0
}

# Unified dispatch. $1 title $2 plain-body $3 lark-color $4 detail
# Returns 0 if delivered (so caller may commit dedup keys), non-zero on failure.
dispatch() {
  local title="$1" body="$2" color="$3" detail="$4"
  local channel
  channel=$(detect_channel)
  local full
  full="$(printf '%s\n\n%s' "$title" "$body")"
  case "$channel" in
    telegram) send_telegram "$full" "$detail" ;;
    lark)     send_lark "$title" "$body" "$color" "$detail" ;;
    session)  send_session "$full" "$detail" ;;
    *)        log_notify "NONE" "FAIL" "$detail no channel available"; return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# Failure / auth / success state helpers (defined before MAIN uses them)
# ---------------------------------------------------------------------------
record_failure() {
  # $1 = error message. Increments counter, alerts at >=3.
  local emsg
  emsg=$(printf '%s' "$1" | head -c 200)
  local cur
  cur=$(jq -r '.consecutive_failures // 0' "$STATE_FILE" 2>/dev/null)
  [[ -z "$cur" ]] && cur=0
  cur=$((cur + 1))
  local tmp
  tmp=$(jq --argjson c "$cur" --arg e "$emsg" '.consecutive_failures=$c | .last_error=$e' "$STATE_FILE" 2>/dev/null)
  [[ -n "$tmp" ]] && printf '%s\n' "$tmp" > "$STATE_FILE"

  if [[ "$cur" -ge 3 ]]; then
    local title body
    if [[ "$LANG_SEL" == en ]]; then
      title="🚨 Earn Hunter · 3 consecutive scan failures"
      body=$(printf 'The last 3 scans all failed.\n\n🔍 Last error:\n   %s\n\n🛠 Try:\n   1. Check network\n   2. Run `okx auth login`\n   3. Run `okx earn flash-earn projects --json` manually' "$emsg")
    else
      title="🚨 Earn Hunter · 连续 3 轮扫描失败"
      body=$(printf '最近 3 次扫描均未成功完成。\n\n🔍 最后一次错误：\n   %s\n\n🛠 排查建议：\n   1. 检查网络连接\n   2. 运行 `okx auth login` 确认凭证有效\n   3. 运行 `okx earn flash-earn projects --json` 手动测试 API' "$emsg")
    fi
    dispatch "$title" "$body" "red" "error:consecutive_failures"
    # Reset after alerting.
    tmp=$(jq '.consecutive_failures=0' "$STATE_FILE" 2>/dev/null)
    [[ -n "$tmp" ]] && printf '%s\n' "$tmp" > "$STATE_FILE"
  fi
}

alert_auth() {
  local title body
  if [[ "$LANG_SEL" == en ]]; then
    title="⚠ Earn Hunter · Credential expired"
    body=$(printf 'OKX API credentials expired or invalid; scanning paused.\n\n🔑 Re-login:\n   Run `okx-cex-auth login` to re-authenticate.\n   Earn Hunter resumes on the next scan after auth.')
  else
    title="⚠ Earn Hunter · 凭证失效"
    body=$(printf 'OKX API 凭证已过期或失效，扫描已暂停。\n\n🔑 重新登录：\n   运行 `okx-cex-auth login` 重新认证\n   认证完成后，Earn Hunter 将在下一轮自动恢复扫描')
  fi
  dispatch "$title" "$body" "orange" "error:auth_expired"
}

mark_success() {
  local tmp
  tmp=$(jq '.consecutive_failures=0 | .last_error=""' "$STATE_FILE" 2>/dev/null)
  [[ -n "$tmp" ]] && printf '%s\n' "$tmp" > "$STATE_FILE"
}

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
init_storage
resolve_lang

# Forced-failure test hook
if [[ "${EH_FORCE_FAIL:-0}" == "1" ]]; then
  record_failure "forced failure (EH_FORCE_FAIL)"
  exit 0
fi

FLASH_ENABLED=$(cfg '.flash.enabled' 'true')
FIXED_ENABLED=$(cfg '.fixed.enabled' 'true')
VERBOSE=$(cfg '.verboseLog' 'false')
GLOBAL_MIN_APY=$(cfg '.fixed.globalMinApy' '0')
CCY_OVERRIDES=$(cfg_json '.fixed.currencyOverrides' '{}')
TERMS=$(cfg_json '.fixed.terms' '"all"')
CURRENCIES=$(cfg_json '.currencies' '"all"')

# ---- Step 2: fetch raw data ----
FLASH_RAW="[]"
FIXED_RAW="[]"
SCAN_ERR=""

if [[ "$FLASH_ENABLED" == "true" ]]; then
  FLASH_RAW=$(fetch_flash)
  if ! echo "$FLASH_RAW" | jq -e 'type=="array"' >/dev/null 2>&1; then
    if is_auth_error "$FLASH_RAW"; then
      alert_auth; exit 0
    fi
    SCAN_ERR="flash fetch failed: $(printf '%s' "$FLASH_RAW" | head -c 120)"
    FLASH_RAW="[]"
  fi
fi

if [[ "$FIXED_ENABLED" == "true" ]]; then
  FIXED_RAW=$(fetch_fixed)
  if ! echo "$FIXED_RAW" | jq -e 'type=="array"' >/dev/null 2>&1; then
    if is_auth_error "$FIXED_RAW"; then
      alert_auth; exit 0
    fi
    SCAN_ERR="${SCAN_ERR:+$SCAN_ERR; }fixed fetch failed: $(printf '%s' "$FIXED_RAW" | head -c 120)"
    FIXED_RAW="[]"
  fi
fi

# If both enabled feeds errored → count as scan failure.
if [[ -n "$SCAN_ERR" ]]; then
  record_failure "$SCAN_ERR"
  exit 0
fi

# ---- Step 3: filters (jq) ----
# Flash filter: status=100 & canPurchase=true (in-progress), OR status=0 (upcoming).
# Sort upcoming (0) before in-progress (100).
FLASH_FILTERED=$(echo "$FLASH_RAW" | jq -c '
  [ .[]
    | select(
        ((.status|tostring)=="0")
        or (((.status|tostring)=="100") and (.canPurchase==true))
      )
  ]
  | sort_by((.status|tostring)=="100")
' 2>/dev/null)
[[ -z "$FLASH_FILTERED" ]] && FLASH_FILTERED="[]"

# Fixed filter: drop soldOut, drop lendQuota<=0/empty, currency filter,
# two-layer APY threshold (override > global), terms filter.
FIXED_FILTERED=$(echo "$FIXED_RAW" | jq -c \
  --argjson gmin "$( [[ "$GLOBAL_MIN_APY" =~ ^-?[0-9.]+$ ]] && echo "$GLOBAL_MIN_APY" || echo 0 )" \
  --argjson overrides "$CCY_OVERRIDES" \
  --argjson terms "$TERMS" \
  --argjson currencies "$CURRENCIES" '
  def is_all($v): ($v=="all") or ($v|type=="array" and length==0);
  [ .[]
    | select(.soldOut != true)
    | select((.lendQuota // "") as $lq | ($lq|tostring) != "" and ($lq|tonumber? // 0) > 0)
    | select( is_all($currencies) or (($currencies|type=="array") and (.ccy as $c | $currencies | index($c))) )
    | . as $o
    | ( ($overrides[$o.ccy].minApy) // $gmin ) as $thr
    | select( ((.rate // "0")|tonumber? // 0) >= $thr )
    | select( is_all($terms) or (($terms|type=="array") and (.term as $tm | $terms | index($tm))) )
  ]
' 2>/dev/null)
[[ -z "$FIXED_FILTERED" ]] && FIXED_FILTERED="[]"

# ---- Step 4: dedup against state ----
FLASH_NEW=$(echo "$FLASH_FILTERED" | jq -c --slurpfile st "$STATE_FILE" --arg p "$KEY_PREFIX" '
  ($st[0].flash // {}) as $seen
  | [ .[] | . + {_key: ($p + ((.id|tostring)) + ":" + (.status|tostring))}
        | select(($seen[._key]) == null) ]
' 2>/dev/null)
[[ -z "$FLASH_NEW" ]] && FLASH_NEW="[]"

FIXED_NEW=$(echo "$FIXED_FILTERED" | jq -c --slurpfile st "$STATE_FILE" --arg p "$KEY_PREFIX" '
  ($st[0].fixed // {}) as $seen
  | [ .[] | . + {_key: ($p + .ccy + ":" + .term + ":" + (.rate|tostring))}
        | select(($seen[._key]) == null) ]
' 2>/dev/null)
[[ -z "$FIXED_NEW" ]] && FIXED_NEW="[]"

N_FLASH_NEW=$(echo "$FLASH_NEW" | jq 'length' 2>/dev/null); [[ -z "$N_FLASH_NEW" ]] && N_FLASH_NEW=0
N_FIXED_NEW=$(echo "$FIXED_NEW" | jq 'length' 2>/dev/null); [[ -z "$N_FIXED_NEW" ]] && N_FIXED_NEW=0
N_FLASH_FILT=$(echo "$FLASH_FILTERED" | jq 'length' 2>/dev/null); [[ -z "$N_FLASH_FILT" ]] && N_FLASH_FILT=0
N_FIXED_FILT=$(echo "$FIXED_FILTERED" | jq 'length' 2>/dev/null); [[ -z "$N_FIXED_FILT" ]] && N_FIXED_FILT=0

# ---- Rendering ----
render_flash_lines() {
  echo "$1" | jq -r --arg ip "$(t badge_inprogress)" --arg up "$(t badge_upcoming)" '
    .[] |
    ( (.name // .projectName // "") ) as $nm |
    ( if $nm=="" or $nm==null then "(unnamed)" else $nm end ) as $name |
    ( (.ccy // (.rewards[0].ccy) // "") ) as $c |
    ( if $c=="" or $c==null then "-" else $c end ) as $ccy |
    ( (.apy // .rate // "") ) as $a |
    ( if $a=="" or $a==null then "-" else ((((($a|tonumber?) // 0)*10000)|round)/100 | tostring) end ) as $apy |
    ( if (.status|tostring)=="100" then "🟢 " + $ip else "⏳ " + $up end ) as $badge |
    "• " + $name + " · " + $ccy + " · " + $apy + "% APY  [" + $badge + "]"
  ' 2>/dev/null
}

render_fixed_table() {
  # markdown table rows
  echo "$1" | jq -r '
    .[] |
    ( if (.rate==null or .rate=="") then "-" else (((((.rate|tonumber?)//0)*10000)|round)/100 | tostring) + "%" end ) as $rate |
    ( if (.minLend==null or .minLend=="") then "-" else (.minLend|tostring) end ) as $min |
    ( if (.lendQuota==null or .lendQuota=="") then "-" else (.lendQuota|tostring) end ) as $rem |
    "| " + (.ccy // "-") + " | " + (.term // "-") + " | " + $rate + " | " + $min + " | " + $rem + " |"
  ' 2>/dev/null
}

build_flash_body() {
  local lines; lines=$(render_flash_lines "$FLASH_NEW")
  printf '%s\n\n%s' "$lines" "$(t flash_cta)"
}

build_fixed_body() {
  local rows; rows=$(render_fixed_table "$FIXED_NEW")
  local hdr="| Currency | Term | APR | Min | Remaining |
|----------|------|-----|-----|-----------|"
  # CTA (push form, take first offer ccy/term as example)
  local ccy term cta
  ccy=$(echo "$FIXED_NEW" | jq -r '.[0].ccy // ""' 2>/dev/null)
  term=$(echo "$FIXED_NEW" | jq -r '.[0].term // ""' 2>/dev/null)
  # shellcheck disable=SC2059
  cta=$(printf "$(t fixed_cta_push)" "$ccy" "$term")
  printf '%s\n%s\n\n%s' "$hdr" "$rows" "$cta"
}

DELIVERED=0

if [[ "$N_FLASH_NEW" -gt 0 && "$N_FIXED_NEW" -gt 0 ]]; then
  # Mixed
  title="🎯 Earn Hunter · $(now_hhmm)"
  fbody=$(build_flash_body)
  xbody=$(build_fixed_body)
  body=$(printf '⚡ Flash Earn · %s %s\n\n%s\n\n---\n\n🏦 Fixed Earn · %s %s\n\n%s' \
    "$N_FLASH_NEW" "$(t new_opps)" "$fbody" "$N_FIXED_NEW" "$(t new_opps)" "$xbody")
  if dispatch "$title" "$body" "green" "mixed:${N_FLASH_NEW}+${N_FIXED_NEW}"; then DELIVERED=1; fi

elif [[ "$N_FLASH_NEW" -gt 0 ]]; then
  title="⚡ Flash Earn · ${N_FLASH_NEW} $(t new_opps) · $(now_hhmm)"
  body=$(build_flash_body)
  if dispatch "$title" "$body" "purple" "flash:${N_FLASH_NEW}"; then DELIVERED=1; fi

elif [[ "$N_FIXED_NEW" -gt 0 ]]; then
  title="🏦 Fixed Earn · ${N_FIXED_NEW} $(t new_opps) · $(now_hhmm)"
  body=$(build_fixed_body)
  if dispatch "$title" "$body" "blue" "fixed:${N_FIXED_NEW}"; then DELIVERED=1; fi
fi

# ---- Step 6: commit dedup keys (only for delivered notifications) ----
NOW="$(now_iso)"
if [[ "$DELIVERED" == "1" ]]; then
  if [[ "$N_FLASH_NEW" -gt 0 ]]; then
    tmp=$(jq --slurpfile new <(echo "$FLASH_NEW") --arg now "$NOW" '
      reduce $new[0][] as $o (.; .flash[$o._key] = {notifiedAt: $now})
    ' "$STATE_FILE" 2>/dev/null)
    [[ -n "$tmp" ]] && printf '%s\n' "$tmp" > "$STATE_FILE"
  fi
  if [[ "$N_FIXED_NEW" -gt 0 ]]; then
    tmp=$(jq --slurpfile new <(echo "$FIXED_NEW") --arg now "$NOW" '
      reduce $new[0][] as $o (.; .fixed[$o._key] = {notifiedAt: $now})
    ' "$STATE_FILE" 2>/dev/null)
    [[ -n "$tmp" ]] && printf '%s\n' "$tmp" > "$STATE_FILE"
  fi
fi

# ---- Step 6a/6b: diff cleanup (skip test: keys) ----
# Flash: ID-level. Keep keys whose id is still present in raw flash_results.
CURRENT_FLASH_IDS=$(echo "$FLASH_RAW" | jq -c '[ .[] | (.id|tostring) ]' 2>/dev/null); [[ -z "$CURRENT_FLASH_IDS" ]] && CURRENT_FLASH_IDS="[]"
tmp=$(jq --argjson ids "$CURRENT_FLASH_IDS" '
  .flash = ( .flash | with_entries(
    select(
      (.key|startswith("test:"))
      or ( ( .key | sub("^test:";"") | split(":")[0] ) as $id | ($ids | index($id)) )
    )
  ) )
' "$STATE_FILE" 2>/dev/null)
[[ -n "$tmp" ]] && printf '%s\n' "$tmp" > "$STATE_FILE"

# Fixed: key-level. current_fixed_keys = raw offers not soldOut and lendQuota>0.
CURRENT_FIXED_KEYS=$(echo "$FIXED_RAW" | jq -c '
  [ .[] | select(.soldOut != true) | select(((.lendQuota // "")|tostring) != "" and ((.lendQuota|tonumber?)//0) > 0)
    | (.ccy + ":" + .term + ":" + (.rate|tostring)) ]
' 2>/dev/null); [[ -z "$CURRENT_FIXED_KEYS" ]] && CURRENT_FIXED_KEYS="[]"
tmp=$(jq --argjson keys "$CURRENT_FIXED_KEYS" '
  .fixed = ( .fixed | with_entries(
    select(
      (.key|startswith("test:"))
      or ( ( .key | sub("^test:";"") ) as $k | ($keys | index($k)) )
    )
  ) )
' "$STATE_FILE" 2>/dev/null)
[[ -n "$tmp" ]] && printf '%s\n' "$tmp" > "$STATE_FILE"

# ---- Step 6c: TTL cleanup (7 days) ----
# Compute cutoff epoch. notifiedAt parsed via jq fromdateiso8601 best-effort.
NOW_EPOCH=$(date +%s 2>/dev/null)
CUTOFF=$(( NOW_EPOCH - TTL_DAYS * 86400 ))
tmp=$(jq --argjson cutoff "$CUTOFF" '
  def keep(e):
    ( e.notifiedAt // "" ) as $ts
    | if $ts=="" then true
      else ( ($ts | sub("\\+.*$";"Z") | sub("Z$";"Z") | try (fromdateiso8601) catch null) ) as $ep
           | if $ep==null then true else ($ep >= $cutoff) end
      end;
  .flash = (.flash | with_entries(select(keep(.value))))
  | .fixed = (.fixed | with_entries(select(keep(.value))))
' "$STATE_FILE" 2>/dev/null)
[[ -n "$tmp" ]] && printf '%s\n' "$tmp" > "$STATE_FILE"

# ---- Step 6d: success ----
mark_success

# ---- Step 7: verboseLog gate when no new opportunities ----
if [[ "$N_FLASH_NEW" -eq 0 && "$N_FIXED_NEW" -eq 0 ]]; then
  if [[ "$VERBOSE" == "true" ]]; then
    # shellcheck disable=SC2059
    msg=$(printf "$(t verbose_status)" "$N_FLASH_FILT" "$N_FIXED_FILT")
    dispatch "Earn Hunter" "$msg" "grey" "verbose:no_new"
  fi
  # else: SILENT. No output, exit 0.
  exit 0
fi

exit 0
