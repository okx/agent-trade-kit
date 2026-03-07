"""Shared logging for idea-agent — prints timestamped lines to stdout."""

import sys
from datetime import datetime


def log(msg: str, *, file=None) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, file=file or sys.stdout, flush=True)


def log_err(msg: str) -> None:
    log(msg, file=sys.stderr)
