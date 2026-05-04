#!/usr/bin/env bash
# scripts/check-eval-probes.sh
# Static check: every new/modified MCP tool file must have a corresponding probe.
# Run in CI on merge_request_event. Exits non-zero if any probes are missing.
set -euo pipefail

BASE="${CI_MERGE_REQUEST_DIFF_BASE_SHA:-origin/master}"
PROBE_DIR="eval/probes"
MISSING=()

# Find all tool source files changed in this MR
changed_tool_files=$(git diff --name-only "$BASE"...HEAD -- 'packages/core/src/tools/**/*.ts' 2>/dev/null || \
                     git diff --name-only "$BASE" HEAD -- 'packages/core/src/tools/**/*.ts' 2>/dev/null || true)

if [[ -z "$changed_tool_files" ]]; then
  echo "No tool files changed — probe check skipped."
  exit 0
fi

echo "Changed tool files:"
echo "$changed_tool_files"
echo ""

for file in $changed_tool_files; do
  # Skip index files and type files
  basename=$(basename "$file" .ts)
  [[ "$basename" == "index" || "$basename" == "types" || "$basename" == "helpers" || "$basename" == "common" ]] && continue

  # Map file → expected module probe dir
  case "$basename" in
    market*|market-filter*)   module="market" ;;
    spot-trade*)              module="spot" ;;
    swap-trade*)              module="swap" ;;
    futures-trade*|algo-trade*) module="futures" ;;
    option-trade*|option-algo-trade*) module="option" ;;
    account*)                 module="account" ;;
    event-trade*)             module="event" ;;
    news*)                    module="news" ;;
    smartmoney*)              module="smartmoney" ;;
    indicator*)               module="" ;;  # indicators have no probes
    skills*)                  module="skills" ;;
    audit*)                   module="" ;;  # audit/read-only, no probe needed
    *)                        module="" ;;
  esac

  [[ -z "$module" ]] && continue

  probe_count=$(find "$PROBE_DIR/$module" -name "*.live.test.ts" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$probe_count" -eq 0 ]]; then
    MISSING+=("$module (changed: $file)")
  fi
done

if [[ ${#MISSING[@]} -eq 0 ]]; then
  echo "✓ All changed modules have probes."
  exit 0
else
  echo "✗ Missing probes for the following modules:"
  for m in "${MISSING[@]}"; do
    echo "  - $m"
  done
  echo ""
  echo "Add a probe file at eval/probes/<module>/tier2-<tool_name>.live.test.ts"
  echo "See eval/README.md for the probe skeleton."
  exit 1
fi
