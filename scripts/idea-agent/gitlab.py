"""glab CLI wrapper for okx-trade-mcp idea-agent."""

import json
import os
import subprocess
import sys
from pathlib import Path
from log import log, log_err

REPO = "retail-ai/okx-trade-mcp"
GLAB_CONFIG_DIR = str(Path.home() / "meili/jay.fan_dacs_at_okg.com/113/.config/glab-cli")

# Issues with any of these labels will be picked up by the agent
IDEA_LABELS = ["idea", "bug", "enhancement"]

GLAB_ENV = {
    "GLAB_CONFIG_DIR": GLAB_CONFIG_DIR,
    **os.environ,
}


def _run(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
        env=GLAB_ENV,
        check=False,
    )
    if result.returncode != 0 and check:
        log_err(f"[gitlab] CMD: {args}")
        log_err(f"[gitlab] STDERR: {result.stderr.strip()}")
        log_err(f"[gitlab] STDOUT: {result.stdout.strip()}")
        raise subprocess.CalledProcessError(result.returncode, args, result.stdout, result.stderr)
    return result


def list_open_ideas() -> list[dict]:
    """Return open issues with any of IDEA_LABELS, deduped by iid."""
    seen_iids: set[int] = set()
    issues: list[dict] = []
    for label in IDEA_LABELS:
        result = _run([
            "glab", "issue", "list",
            "--label", label,
            "-O", "json",
            "--repo", REPO,
        ])
        for issue in json.loads(result.stdout):
            if issue["iid"] not in seen_iids:
                seen_iids.add(issue["iid"])
                issues.append(issue)
    return issues


def get_notes(iid: int) -> list[dict]:
    """Return all notes (comments) for an issue, oldest first."""
    project = REPO.replace("/", "%2F")
    result = _run([
        "glab", "api",
        f"projects/{project}/issues/{iid}/notes?order_by=created_at&sort=asc&per_page=100",
    ])
    return json.loads(result.stdout)


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


def get_mr_for_branch(branch: str) -> dict | None:
    """Return the MR dict for the given source branch, or None if not found."""
    project = REPO.replace("/", "%2F")
    result = _run([
        "glab", "api",
        f"projects/{project}/merge_requests?source_branch={branch}&per_page=5",
    ], check=False)
    if result.returncode != 0:
        return None
    mrs = json.loads(result.stdout)
    return mrs[0] if mrs else None
