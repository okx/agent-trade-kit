#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "Not running (no pid file)."
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  rm "$PID_FILE"
  echo "Stopped (pid=$PID)."
else
  rm "$PID_FILE"
  echo "Process $PID was already gone, cleaned up."
fi
