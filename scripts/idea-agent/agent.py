#!/usr/bin/env python3
"""
Idea Agent v2 — event-driven via webhook or manual trigger.

State machine (derived from GitLab issue comments):

  unevaluated
      ↓ triage()            [Sonnet]
      ├── needs_clarification  ← posts questions, waits for human
      │       ↓ human replies → unevaluated (re-triage)
      └── planning             ← posts plan, waits for human ok
              ↓ human replies ok
          implementing         ← claude --dangerously-skip-permissions [Sonnet]
              ↓ MR merged webhook
          done                 ← worktree / branch cleaned up

Human-in-the-loop checkpoints:
  1. After planning: human reviews and approves plan
  2. After MR created: normal code review / merge

State is derived entirely from issue comments (resilient across restarts).
Local state file (~/.okx/idea-agent-state.json) only stores runtime info
(pid, worktree path) that cannot be recovered from GitLab.
"""

import argparse
import re
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

from gitlab import (
    GLAB_CONFIG_DIR,
    REPO,
    close_issue,
    get_notes,
    list_open_ideas,
    post_note,
)
from state import get_seen, is_busy, mark_seen, reconcile
from worker import (
    MODEL_TRIAGE,
    REPO_PATH,
    cleanup_after_merge,
    run_implementing,
    run_planning,
    slug,
)
from log import log, log_err
import re as _re

# ─── constants ────────────────────────────────────────────────────────────────

CLAUDE_PREFIX = "💬 Claude"
APPROVAL_KEYWORDS = ["同意", "执行", "go", "ok", "yes", "approve", "开始", "lgtm", "行", "好", "proceed"]
DISABLE_FILE = Path(__file__).parent / ".disabled"

today = date.today().isoformat()


# ─── state helpers ────────────────────────────────────────────────────────────


def is_claude_note(note: dict) -> bool:
    return note.get("body", "").startswith(CLAUDE_PREFIX)


def is_approval(text: str) -> bool:
    lower = text.lower()
    return any(kw in lower for kw in APPROVAL_KEYWORDS)


def get_last_claude_note(notes: list[dict]) -> dict | None:
    for note in reversed(notes):
        if is_claude_note(note):
            return note
    return None


def get_issue_state(notes: list[dict]) -> str:
    """
    Derive issue state from comment history.

    Returns one of:
      'unevaluated'          — no Claude comment yet (or human replied after clarification request)
      'needs_clarification'  — Claude asked questions, human hasn't replied yet
      'planning'             — Claude posted a plan (📋), human hasn't approved yet
      'implementing'         — Claude's last comment contains 🔵 (in progress)
      'approved'             — human replied with approval after a plan comment
    """
    last_claude_idx = None
    for i, note in enumerate(notes):
        if is_claude_note(note):
            last_claude_idx = i

    if last_claude_idx is None:
        return "unevaluated"

    last_claude = notes[last_claude_idx]
    body = last_claude.get("body", "")

    if "🔵" in body:
        return "implementing"

    # Check for human replies after last Claude comment
    human_replies_after = [
        n for n in notes[last_claude_idx + 1:]
        if not is_claude_note(n)
    ]

    if "❓" in body or "需要补充" in body:
        # Clarification request
        if human_replies_after:
            return "unevaluated"  # human replied → re-triage
        return "needs_clarification"

    if "📋" in body:
        # Plan posted
        for reply in human_replies_after:
            if is_approval(reply.get("body", "")):
                return "approved"
        return "planning"

    # Fallback: legacy evaluate() comment format (✅/❌)
    if human_replies_after:
        for reply in human_replies_after:
            if is_approval(reply.get("body", "")):
                return "approved"
    return "planning"


# ─── triage ───────────────────────────────────────────────────────────────────


def triage(issue: dict, notes: list[dict], dry_run: bool = False) -> None:
    """
    Step 1: determine if the issue has enough info to plan.
    If not, post clarifying questions (❓).
    If yes, move straight to planning.
    Uses Sonnet (cheap, fast).
    """
    iid = issue["iid"]
    title = issue["title"]
    body = issue.get("description") or issue.get("body") or ""

    # Include human comments so multi-round clarification is taken into account
    human_notes = [n for n in notes if not is_claude_note(n)]
    comments_text = ""
    if human_notes:
        comments_text = "\n\n### 补充评论\n" + "\n".join(
            f"- {n.get('body', '').strip()}" for n in human_notes
        )

    prompt = f"""分析以下 GitLab issue，判断信息是否充足以制定实现方案。

项目：okx-trade-mcp（OKX MCP server，TypeScript monorepo，packages/core + packages/mcp + packages/cli）

Issue #{iid}: {title}
{body}{comments_text}

判断标准：
- 有明确的功能目标
- 能推断出需要修改哪些模块或 API 端点
- 没有关键歧义

若信息充足，输出：
SUFFICIENT

若信息不足，输出（只输出以下格式，不要其他内容）：
{CLAUDE_PREFIX} ({today}): ❓ 需要补充信息

请补充以下信息才能开始设计：
- （具体问题1，说明为什么需要）
- （具体问题2，说明为什么需要）
...

问题要具体，帮助作者知道该怎么补充。"""

    if dry_run:
        print(f"[dry-run] Would run triage for #{iid} with {MODEL_TRIAGE}")
        return

    result = subprocess.run(
        ["claude", "--model", MODEL_TRIAGE, "-p", prompt],
        capture_output=True,
        text=True,
        cwd=REPO_PATH,
    )
    output = result.stdout.strip()

    if output.startswith("SUFFICIENT"):
        # Enough info — proceed to planning immediately
        log(f"[agent] #{iid} triage passed, starting planning")
        run_planning(issue, dry_run=dry_run)
    else:
        # Post clarification request
        comment = output if output.startswith(CLAUDE_PREFIX) else (
            f"{CLAUDE_PREFIX} ({today}): ❓ 需要补充信息\n\n{output}"
        )
        post_note(iid, comment)
        log(f"[agent] #{iid} needs clarification, posted questions")


# ─── main processing ──────────────────────────────────────────────────────────


def process_issue(issue: dict, dry_run: bool = False, force_mode: str | None = None) -> None:
    iid = issue["iid"]
    title = issue["title"]
    notes = get_notes(iid)

    state = get_issue_state(notes)
    if force_mode:
        state = force_mode

    log(f"[agent] #{iid} 「{title}」state={state}")

    if state == "unevaluated":
        triage(issue, notes, dry_run=dry_run)

    elif state == "approved":
        if is_busy():
            log(f"[agent] Worker busy, skipping #{iid} (consider queuing)")
            return
        plan_note = get_last_claude_note(notes)
        plan_text = plan_note["body"] if plan_note else ""
        run_implementing(issue, plan_text, dry_run=dry_run)

    elif state == "implementing":
        # Check if MR is merged → trigger post-merge
        last_claude = get_last_claude_note(notes)
        branch = None
        if last_claude:
            m = _re.search(r"分支[：:]\s*(\S+)", last_claude.get("body", ""))
            if m:
                branch = m.group(1)
        if branch:
            from gitlab import get_mr_for_branch
            from worker import run_post_merge
            mr = get_mr_for_branch(branch)
            if mr and mr.get("state") == "merged":
                log(f"[agent] #{iid} MR merged, running post-merge for branch '{branch}'")
                if not dry_run:
                    run_post_merge(branch, iid)
                return
        log(f"[agent] #{iid} implementing in progress, skip")

    elif state == "needs_clarification":
        log(f"[agent] #{iid} waiting for clarification")

    elif state == "planning":
        log(f"[agent] #{iid} waiting for plan approval")


# ─── CLI ──────────────────────────────────────────────────────────────────────


def cmd_stop() -> None:
    DISABLE_FILE.parent.mkdir(parents=True, exist_ok=True)
    DISABLE_FILE.touch()
    print(f"Agent paused. Remove {DISABLE_FILE} to resume.")


def cmd_start() -> None:
    if DISABLE_FILE.exists():
        DISABLE_FILE.unlink()
        print("Agent resumed.")
    else:
        print("Agent was not paused.")


def run_once(dry_run: bool = False, issue_filter: int | None = None, force_mode: str | None = None) -> None:
    """Process all open idea issues once."""
    if DISABLE_FILE.exists():
        print(f"Agent paused ({DISABLE_FILE}). Run --start to resume.")
        return

    reconcile()

    try:
        issues = list_open_ideas()
    except Exception as e:
        log(f"[agent] Failed to list issues (network?): {e}")
        return

    if issue_filter:
        issues = [i for i in issues if i["iid"] == issue_filter]
        if not issues:
            print(f"Issue #{issue_filter} not found.")
            return

    seen = get_seen()
    for issue in issues:
        iid = issue["iid"]
        updated_at = issue.get("updated_at", "")
        if not force_mode and seen.get(str(iid)) == updated_at:
            continue  # no changes since last poll
        try:
            process_issue(issue, dry_run=dry_run, force_mode=force_mode)
        except Exception as e:
            log(f"[agent] Error processing #{iid}: {e}")
            continue
        if not dry_run:
            mark_seen(iid, updated_at)


def cmd_status() -> None:
    """Print current agent status: running worker and polling loop."""
    import json
    from state import load, is_process_alive

    # Polling loop
    pid_file = Path(__file__).parent / ".pid"
    if pid_file.exists():
        pid = int(pid_file.read_text().strip())
        alive = is_process_alive(pid)
        print(f"Polling loop: {'🟢 running' if alive else '🔴 dead'} (pid={pid})")
    else:
        print("Polling loop: ⚪ not started")

    # Worker
    state = load()
    worker = state.get("worker")
    if worker:
        pid = worker.get("pid", -1)
        alive = is_process_alive(pid)
        print(f"Worker:       {'🟢 running' if alive else '🔴 dead'} (pid={pid})")
        print(f"  Issue:      #{worker.get('iid')} — phase={worker.get('phase')}")
        print(f"  Branch:     {worker.get('branch')}")
        print(f"  Worktree:   {worker.get('worktree')}")
    else:
        print("Worker:       ⚪ idle")


def main() -> None:
    parser = argparse.ArgumentParser(description="Idea Agent v2")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--issue", type=int, help="Process only this issue IID")
    parser.add_argument(
        "--mode",
        choices=["unevaluated", "approved", "planning"],
        help="Force a specific state",
    )
    parser.add_argument("--stop", action="store_true")
    parser.add_argument("--start", action="store_true")
    parser.add_argument("--cleanup", metavar="BRANCH", help="Cleanup worktree for merged branch")
    parser.add_argument("--status", action="store_true", help="Show current agent status")
    parser.add_argument(
        "--daemon",
        action="store_true",
        help="Run as daemon, polling continuously",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=300,
        metavar="SECONDS",
        help="Polling interval in daemon mode (default: 300)",
    )
    args = parser.parse_args()

    if args.status:
        cmd_status()
        return
    if args.stop:
        cmd_stop()
        return
    if args.start:
        cmd_start()
        return
    if args.cleanup:
        cleanup_after_merge(args.cleanup)
        return

    if args.daemon:
        log(f"[agent] Daemon mode, polling every {args.interval}s (Ctrl-C to stop)")
        while True:
            run_once(dry_run=args.dry_run, issue_filter=args.issue, force_mode=args.mode)
            time.sleep(args.interval)
    else:
        # Single run — suitable for cron
        run_once(dry_run=args.dry_run, issue_filter=args.issue, force_mode=args.mode)


if __name__ == "__main__":
    main()
