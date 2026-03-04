#!/usr/bin/env bash
# test/smoke.sh — 冒烟测试：公开行情（无需 Key）+ 私有只读（有 Key 时自动运行）
#
# 用法:
#   ./test/smoke.sh
#   ./test/smoke.sh --profile demo
#   OKX_API_KEY=xxx OKX_SECRET_KEY=xxx OKX_PASSPHRASE=xxx ./test/smoke.sh
#
# Write 操作及新工具（swap_get_leverage / account_get_max_size 等）在 mcp-e2e.mjs 中覆盖。

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

# ── 解析 --profile 参数 ───────────────────────────────────────────────────────
PROFILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# CLI 调用包装：统一附加 --profile（如有）
cli() {
  local base=("node" "$SCRIPT_DIR/../packages/cli/dist/index.js")
  [[ -n "$PROFILE" ]] && base+=("--profile" "$PROFILE")
  "${base[@]}" "$@"
}

# ── 测试执行器 ────────────────────────────────────────────────────────────────
run_test() {
  local desc="$1"; shift
  if output=$("$@" 2>&1); then
    echo "  ✅  $desc"
    PASS=$((PASS + 1))
  else
    echo "  ❌  $desc"
    echo "      $output"
    FAIL=$((FAIL + 1))
  fi
}

# ── 凭证检测 ──────────────────────────────────────────────────────────────────
has_credentials() {
  if [[ -n "$OKX_API_KEY" && -n "$OKX_SECRET_KEY" && -n "$OKX_PASSPHRASE" ]]; then
    return 0
  fi
  local cfg="$HOME/.okx/config.toml"
  if [[ -f "$cfg" ]] && grep -q 'api_key' "$cfg" 2>/dev/null; then
    return 0
  fi
  return 1
}

# ═════════════════════════════════════════════════════════════════════════════
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  agent-tradekit smoke tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Public: market ────────────────────────────────────────────────────────────
echo ""
echo "▶ market (public)"
run_test "ticker BTC-USDT"         cli market ticker BTC-USDT
run_test "ticker ETH-USDT"         cli market ticker ETH-USDT
run_test "ticker BTC-USDT-SWAP"    cli market ticker BTC-USDT-SWAP
run_test "tickers SPOT"            cli market tickers SPOT
run_test "tickers SWAP"            cli market tickers SWAP
run_test "orderbook BTC-USDT"      cli market orderbook BTC-USDT
run_test "candles BTC-USDT 1H"     cli market candles BTC-USDT --bar 1H --limit 3

# ── Private: 有 Key 才跑 ──────────────────────────────────────────────────────
if has_credentials; then

  echo ""
  echo "▶ account (private read)"
  run_test "balance"                 cli account balance
  run_test "balance USDT"            cli account balance USDT

  echo ""
  echo "▶ spot (private read)"
  run_test "orders open"             cli spot orders
  run_test "orders history"          cli spot orders --history
  run_test "fills"                   cli spot fills
  run_test "algo orders pending"     cli spot algo orders

  echo ""
  echo "▶ swap (private read)"
  run_test "positions"               cli swap positions
  run_test "positions BTC-USDT-SWAP" cli swap positions BTC-USDT-SWAP
  run_test "orders open"             cli swap orders
  run_test "orders history"          cli swap orders --history
  run_test "algo orders pending"     cli swap algo orders

  echo ""
  echo "▶ config"
  run_test "config show"             cli config show

else
  echo ""
  echo "  ⚠️  未检测到凭证，跳过 private 测试。"
  echo "     设置 OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE"
  echo "     或配置 ~/.okx/config.toml 后可运行全部用例。"
fi

# ── 汇总 ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  passed: $PASS  failed: $FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ "$FAIL" -eq 0 ]]
