#!/bin/bash
# Start idea-agent polling loop. Re-running kills the previous instance.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.pid"
LOG_FILE="$SCRIPT_DIR/agent.log"
INTERVAL="${INTERVAL:-300}"  # seconds, default 5min

# Kill previous instance if running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID"
    echo "Killed previous instance (pid=$OLD_PID)."
  fi
  rm "$PID_FILE"
fi

# Start polling loop in background
(
  while true; do
    python3 "$SCRIPT_DIR/agent.py" >> "$LOG_FILE" 2>&1
    sleep "$INTERVAL"
  done
) &

echo $! > "$PID_FILE"
echo "Started (pid=$!, interval=${INTERVAL}s, log=$LOG_FILE)"
