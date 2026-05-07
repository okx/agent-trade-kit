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

  # Map file → expected module/sub-module probe dir.
  # Per-tool granularity: missing probe = module probe dir is empty AND no
  # tier2-<basename>.live.test.ts shows up under the resolved module dir.
  case "$basename" in
    market*|market-filter*)              probe_path="market" ;;
    spot-trade*)                         probe_path="spot" ;;
    swap-trade*)                         probe_path="swap" ;;
    futures-trade*|algo-trade*)          probe_path="futures" ;;
    option-trade*|option-algo-trade*)    probe_path="option" ;;
    account*)                            probe_path="account" ;;
    event-trade*|event-helpers*)         probe_path="event" ;;
    news*|sentiment*)                    probe_path="news" ;;
    smartmoney*)                         probe_path="smartmoney" ;;
    skills*|skill-mp*)                   probe_path="skills" ;;
    bot-grid*|grid-trade*)               probe_path="bot/grid" ;;
    bot-dca*|dca-trade*)                 probe_path="bot/dca" ;;
    earn-savings*|savings*)              probe_path="earn/savings" ;;
    earn-onchain*|onchain-earn*)         probe_path="earn/onchain" ;;
    earn-dcd*|dcd*|dual-currency*)       probe_path="earn/dcd" ;;
    earn-flash*|flash-earn*)             probe_path="earn/flash" ;;
    earn-autoearn*|autoearn*)            probe_path="earn/autoearn" ;;
    indicator*)                          probe_path="" ;;  # read-only helper, no probe
    audit*)                              probe_path="" ;;  # safety-only
    *)                                   probe_path="UNMAPPED:$basename" ;;
  esac

  if [[ "$probe_path" == "UNMAPPED:"* ]]; then
    MISSING+=("? unmapped tool file '$file' — add a case to scripts/check-eval-probes.sh")
    continue
  fi
  [[ -z "$probe_path" ]] && continue

  probe_count=$(find "$PROBE_DIR/$probe_path" -name "*.live.test.ts" 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$probe_count" -eq 0 ]]; then
    MISSING+=("$probe_path (changed: $file)")
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
