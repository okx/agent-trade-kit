#!/usr/bin/env python3
"""
Idea Agent — auto-evaluate and implement GitLab idea issues.

State machine (per issue):
  unevaluated → evaluate() → waiting
  waiting + human approval → implement()
  implement() → MR created → issue closed

State is derived entirely from issue comments (no external state file).
"""

import argparse
import os
import re
import subprocess
import sys
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

# ─── constants ────────────────────────────────────────────────────────────────

CLAUDE_PREFIX = "💬 Claude"
APPROVAL_KEYWORDS = ["同意", "执行", "go", "ok", "yes", "approve", "开始", "lgtm", "行", "好"]
REPO_PATH = Path(__file__).parent.parent.parent  # repo root
LOCK_FILE = Path("~/.okx/idea-agent.lock").expanduser()
DISABLE_FILE = Path("~/.okx/idea-agent.disabled").expanduser()
WORK_LOG = Path(__file__).parent / "work-log.md"

today = date.today().isoformat()


# ─── state helpers ────────────────────────────────────────────────────────────

def is_claude_note(note: dict) -> bool:
    body = note.get("body", "")
    return body.startswith(CLAUDE_PREFIX)


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
    Returns one of:
      'unevaluated'  — no Claude comment yet
      'waiting'      — last Claude comment is a plan; no human approval after it
      'approved'     — human replied with approval keyword after last Claude comment
      'in_progress'  — Claude's last comment contains 🔵
    """
    last_claude_idx = None
    for i, note in enumerate(notes):
        if is_claude_note(note):
            last_claude_idx = i

    if last_claude_idx is None:
        return "unevaluated"

    last_claude = notes[last_claude_idx]
    if "🔵" in last_claude.get("body", ""):
        return "in_progress"

    # look for human approval after last Claude comment
    for note in notes[last_claude_idx + 1:]:
        if not is_claude_note(note) and is_approval(note.get("body", "")):
            return "approved"

    return "waiting"


def slug(title: str) -> str:
    """Convert issue title to branch-safe slug."""
    s = title.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:50]


# ─── work log ─────────────────────────────────────────────────────────────────

def log(message: str) -> None:
    print(message)
    with open(WORK_LOG, "a", encoding="utf-8") as f:
        f.write(message + "\n")


def log_header() -> None:
    from datetime import datetime
    header = f"\n## {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    print(header)
    with open(WORK_LOG, "a", encoding="utf-8") as f:
        f.write(header + "\n")


# ─── actions ──────────────────────────────────────────────────────────────────

def evaluate(issue: dict, dry_run: bool = False) -> None:
    iid = issue["iid"]
    title = issue["title"]
    body = issue.get("description") or issue.get("body") or ""

    prompt = f"""分析以下 GitLab issue，判断是否可实现：

Title: {title}
Body:
{body}

项目：okx-trade-mcp（OKX MCP server，TypeScript monorepo，packages/core + packages/mcp + packages/cli）

若可实现，输出：
{CLAUDE_PREFIX} ({today}):
✅ 可以开始

## 实现方案
（详细实现步骤，含文件路径和关键代码结构）

若信息不足，输出：
{CLAUDE_PREFIX} ({today}):
❌ 需要补充

（缺失信息列表）

只输出评论内容，不要其他解释。"""

    result = subprocess.run(
        ["claude", "-p", prompt],
        capture_output=True,
        text=True,
        cwd=REPO_PATH,
    )
    comment = result.stdout.strip()
    if not comment:
        comment = f"{CLAUDE_PREFIX} ({today}):\n❌ 无法生成评估（claude 输出为空）"

    post_note(iid, comment, dry_run=dry_run)
    log(f"- ✅ Evaluated #{iid} 「{title}」→ 已贴计划")


def implement(issue: dict, plan_text: str, dry_run: bool = False) -> None:
    iid = issue["iid"]
    title = issue["title"]
    branch = f"feat/{slug(title)}"

    post_note(iid, f"{CLAUDE_PREFIX} ({today}): 🔵 开始实现，分支：{branch}", dry_run=dry_run)
    log(f"- 🔵 Implementing #{iid} 「{title}」→ branch: {branch}")

    if dry_run:
        log(f"  [dry-run] Would run claude --dangerously-skip-permissions for #{iid}")
        return

    prompt = f"""实现以下 GitLab issue，按已批准计划执行：

Issue #{iid}: {title}
{issue.get('description') or issue.get('body') or ''}

已批准计划：
{plan_text}

要求：
1. 创建分支 {branch}（git checkout -b {branch}）
2. 实现功能，遵循项目规范（TypeScript, pnpm monorepo）
3. 跑测试：pnpm test:unit
4. 执行 /ship checklist（CHANGELOG, README, build）
5. 用 glab 提 MR，关联 issue #{iid}：
   glab mr create --title "feat: {title}" --description "Closes #{iid}" --repo {REPO}
6. MR 提出后，在 issue 评论：
   {CLAUDE_PREFIX} ({today}): ✅ 完成，MR: [链接]
   然后关闭 issue：glab issue close {iid} --repo {REPO}

工作目录：{REPO_PATH}
GitLab repo: {REPO}
"""

    subprocess.run(
        ["claude", "--dangerously-skip-permissions", "-p", prompt],
        cwd=REPO_PATH,
        env={**os.environ, "GLAB_CONFIG_DIR": GLAB_CONFIG_DIR},
    )


# ─── main ─────────────────────────────────────────────────────────────────────

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


def main() -> None:
    parser = argparse.ArgumentParser(description="Idea Agent")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without executing")
    parser.add_argument("--issue", type=int, help="Process only this issue IID")
    parser.add_argument("--mode", choices=["evaluate", "implement"], help="Force a specific mode")
    parser.add_argument("--stop", action="store_true", help="Pause the agent")
    parser.add_argument("--start", action="store_true", help="Resume the agent")
    args = parser.parse_args()

    if args.stop:
        cmd_stop()
        return
    if args.start:
        cmd_start()
        return

    # check disable file
    if DISABLE_FILE.exists():
        print(f"Agent is paused ({DISABLE_FILE} exists). Run with --start to resume.")
        sys.exit(0)

    # prevent concurrent runs
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    if LOCK_FILE.exists():
        print("Another instance is running (lock file exists). Exiting.")
        sys.exit(0)
    LOCK_FILE.touch()

    try:
        log_header()
        issues = list_open_ideas()

        if args.issue:
            issues = [i for i in issues if i["iid"] == args.issue]
            if not issues:
                print(f"Issue #{args.issue} not found in open idea issues.")
                return

        processed_new = False
        for issue in issues:
            iid = issue["iid"]
            title = issue["title"]
            notes = get_notes(iid)
            state = get_issue_state(notes)

            # force mode override
            if args.mode == "evaluate":
                state = "unevaluated"
            elif args.mode == "implement":
                state = "approved"

            if state == "unevaluated":
                if processed_new:
                    log(f"- ⏭️ Skipped #{iid} 「{title}」（每次只评估 1 个新 issue）")
                    continue
                evaluate(issue, dry_run=args.dry_run)
                processed_new = True

            elif state == "approved":
                plan_note = get_last_claude_note(notes)
                plan_text = plan_note["body"] if plan_note else ""
                implement(issue, plan_text, dry_run=args.dry_run)

            elif state == "in_progress":
                log(f"- ⏳ #{iid} 「{title}」实现中（跳过）")

            else:  # waiting
                log(f"- ⏭️ Skipped #{iid} 「{title}」（等待人类回复）")

    finally:
        if LOCK_FILE.exists():
            LOCK_FILE.unlink()


if __name__ == "__main__":
    main()
