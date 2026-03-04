"""glab CLI wrapper for agent-tradekit idea-agent."""

import json
import os
import subprocess
import sys
from pathlib import Path

REPO = "retail-ai/agent-tradekit"
GLAB_CONFIG_DIR = str(Path.home() / "meili/jay.fan_dacs_at_okg.com/113/.config/glab-cli")

GLAB_ENV = {
    "GLAB_CONFIG_DIR": GLAB_CONFIG_DIR,
    **os.environ,
}


def _run(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        env=GLAB_ENV,
        check=check,
    )


def list_open_ideas() -> list[dict]:
    """Return open issues with label 'idea'."""
    result = _run([
        "glab", "issue", "list",
        "--label", "idea",
        "--state", "opened",
        "--output", "json",
        "--repo", REPO,
    ])
    return json.loads(result.stdout)


def get_notes(iid: int) -> list[dict]:
    """Return all notes (comments) for an issue, oldest first."""
    result = _run([
        "glab", "issue", "note", "list", str(iid),
        "--output", "json",
        "--repo", REPO,
    ])
    notes = json.loads(result.stdout)
    # glab returns newest-first; reverse to get chronological order
    return list(reversed(notes))


def post_note(iid: int, message: str, dry_run: bool = False) -> None:
    """Post a comment on an issue."""
    if dry_run:
        print(f"[dry-run] Would post to #{iid}:\n{message}\n", file=sys.stderr)
        return
    _run([
        "glab", "issue", "note", str(iid),
        "--message", message,
        "--repo", REPO,
    ])


def close_issue(iid: int, dry_run: bool = False) -> None:
    """Close an issue."""
    if dry_run:
        print(f"[dry-run] Would close #{iid}", file=sys.stderr)
        return
    _run([
        "glab", "issue", "close", str(iid),
        "--repo", REPO,
    ])
