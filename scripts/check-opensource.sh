#!/usr/bin/env bash
# Open-source guard: block internal/private paths and secrets from reaching
# the public GitHub repo.
#
# Usage:
#   scripts/check-opensource.sh [BASE_REF]
#
# BASE_REF defaults to origin/master. The script inspects files ADDED or
# MODIFIED between BASE_REF and HEAD. Deleted files are ignored (removing a
# previously tracked internal file is exactly what we want to allow).
#
# Exit codes: 0 = pass, 1 = violations found, 2 = usage/environment error.

set -euo pipefail

BASE="${1:-origin/master}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DENY_FILE="$SCRIPT_DIR/opensource-denylist.txt"

if [ ! -f "$DENY_FILE" ]; then
  echo "error: denylist not found at $DENY_FILE" >&2
  exit 2
fi

# Determine scan mode: diff vs full-tree.
# Full-tree is used when the BASE ref is unknown or there is no merge-base
# with HEAD (orphan branch, force-push rewriting history, first push, etc.).
# In those cases we must scan everything in HEAD, otherwise an orphan commit
# containing internal files would be waved through.
SCAN_MODE="diff"
if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  echo "check-opensource: base ref '$BASE' not found — full-tree scan" >&2
  SCAN_MODE="full"
elif ! git merge-base "$BASE" HEAD >/dev/null 2>&1; then
  echo "check-opensource: no merge-base with $BASE — full-tree scan" >&2
  SCAN_MODE="full"
fi

if [ "$SCAN_MODE" = "full" ]; then
  CHANGED=$(git ls-files)
else
  CHANGED=$(git diff --name-only --diff-filter=ACMR "$BASE"...HEAD || true)
fi

if [ -z "$CHANGED" ]; then
  echo "check-opensource: no files to scan — skip"
  exit 0
fi

# Files that are allowed to contain denylist patterns (the guard itself).
SELF_SKIP=(
  "scripts/check-opensource.sh"
  "scripts/opensource-denylist.txt"
  ".github/workflows/opensource-guard.yml"
  ".githooks/pre-push"
)

is_self() {
  local f="$1"
  for s in "${SELF_SKIP[@]}"; do
    [ "$f" = "$s" ] && return 0
  done
  return 1
}

FAIL=0
VIOLATIONS=()

while IFS= read -r line; do
  # strip comments / blank lines
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  kind="${line%%:*}"
  value="${line#*:}"

  case "$kind" in
    path)
      hits=$(printf '%s\n' "$CHANGED" | grep -E -e "$value" || true)
      if [ -n "$hits" ]; then
        VIOLATIONS+=("❌ forbidden path pattern: $value")
        while IFS= read -r h; do VIOLATIONS+=("     $h"); done <<<"$hits"
        FAIL=1
      fi
      ;;
    regex)
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        is_self "$f" && continue
        [ -f "$f" ] || continue
        # skip binary files
        if file --mime-encoding "$f" 2>/dev/null | grep -q binary; then
          continue
        fi
        match=$(grep -nE -e "$value" -- "$f" 2>/dev/null | head -3 || true)
        if [ -n "$match" ]; then
          VIOLATIONS+=("❌ forbidden content in $f (pattern: $value)")
          while IFS= read -r m; do VIOLATIONS+=("     $m"); done <<<"$match"
          FAIL=1
        fi
      done <<<"$CHANGED"
      ;;
    *)
      echo "warn: unknown denylist kind '$kind' in line: $line" >&2
      ;;
  esac
done < "$DENY_FILE"

if [ "$FAIL" -eq 0 ]; then
  echo "✅ open-source guard passed ($(printf '%s\n' "$CHANGED" | wc -l | tr -d ' ') files checked)"
  exit 0
fi

echo ""
echo "Open-source guard found $(( ${#VIOLATIONS[@]} )) issue lines:"
printf '%s\n' "${VIOLATIONS[@]}"
echo ""
echo "Fix: remove the file/content, or update scripts/opensource-denylist.txt with reason."
exit 1
