"""
Worker — executes planning and implementing phases in an isolated git worktree.

Single-worker design: only one task runs at a time.
Multi-worker extension: wrap run_task() in a thread pool and update
state.py to use a list of WorkerTask.
"""

import re
import subprocess
from datetime import date
from pathlib import Path

from gitlab import GLAB_CONFIG_DIR, REPO, post_note
from state import WorkerTask, clear_worker, set_worker
from log import log, log_err

REPO_PATH = Path(__file__).parent.parent.parent
WORKTREES_DIR = REPO_PATH / ".worktrees"

# Models
MODEL_TRIAGE = "claude-sonnet-4-6"
MODEL_PLANNING = "claude-opus-4-6"
MODEL_IMPLEMENTING = "claude-sonnet-4-6"

today = date.today().isoformat()


# ─── worktree helpers ─────────────────────────────────────────────────────────


def slug(title: str) -> str:
    s = title.lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:50]


def worktree_path(branch: str) -> Path:
    return WORKTREES_DIR / branch.replace("/", "-")


def create_worktree(branch: str) -> Path:
    path = worktree_path(branch)
    WORKTREES_DIR.mkdir(exist_ok=True)

    # Clean up stale worktree directory if it exists
    if path.exists():
        import shutil
        shutil.rmtree(path)
        subprocess.run(["git", "worktree", "prune"], cwd=REPO_PATH)

    # Check if branch already exists
    result = subprocess.run(
        ["git", "branch", "--list", branch],
        capture_output=True, text=True, cwd=REPO_PATH,
    )
    if result.stdout.strip():
        subprocess.run(
            ["git", "worktree", "add", str(path), branch],
            cwd=REPO_PATH, check=True,
        )
    else:
        subprocess.run(
            ["git", "worktree", "add", str(path), "-b", branch],
            cwd=REPO_PATH, check=True,
        )
    return path


def remove_worktree(branch: str) -> None:
    path = worktree_path(branch)
    subprocess.run(
        ["git", "worktree", "remove", "--force", str(path)],
        cwd=REPO_PATH,
        check=False,
    )
    # also delete the local branch if it still exists
    subprocess.run(
        ["git", "branch", "-D", branch],
        cwd=REPO_PATH,
        check=False,
    )


# ─── planning ─────────────────────────────────────────────────────────────────


def run_planning(issue: dict, dry_run: bool = False) -> None:
    """
    Run claude in plan mode (Opus) and post the resulting plan to the issue.
    No files are modified — plan mode is read-only.
    """
    iid = issue["iid"]
    title = issue["title"]
    body = issue.get("description") or issue.get("body") or ""

    prompt = f"""你是 okx-trade-mcp 项目的资深架构师。
项目：TypeScript monorepo，packages/core + packages/mcp + packages/cli。

请为以下 GitLab issue 制定详细实现方案：

Issue #{iid}: {title}
{body}

输出格式（直接输出 issue 评论内容，不要其他解释）：

💬 Claude ({today}): 📋 实现方案

## 目标
（一句话描述）

## 涉及文件
（列出需要新建或修改的文件）

## 实现步骤
（分步骤，含关键代码结构）

## 测试方案
（如何验证功能正确）

## 注意事项
（edge case、风险点）"""

    log(f"[worker] Planning #{iid} with {MODEL_PLANNING} ...")

    if dry_run:
        print(f"[dry-run] Would run claude --plan -p <prompt> --model {MODEL_PLANNING}")
        post_note(iid, f"💬 Claude ({today}): 📋 [dry-run] 实现方案（略）", dry_run=True)
        return

    import io
    buf = io.StringIO()

    with subprocess.Popen(
        ["claude", "--model", MODEL_PLANNING, "-p", prompt],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=REPO_PATH,
    ) as proc:
        for line in proc.stdout:
            print(line, end="", flush=True)  # stream to log
            buf.write(line)

    plan_text = buf.getvalue().strip()
    if not plan_text:
        plan_text = f"💬 Claude ({today}): ❌ 规划失败（输出为空）"
    elif not plan_text.startswith("💬 Claude"):
        plan_text = f"💬 Claude ({today}): 📋 实现方案\n\n{plan_text}"

    post_note(iid, plan_text)
    log(f"[worker] Plan posted for #{iid}")


# ─── implementing ─────────────────────────────────────────────────────────────



def _make_branch(iid: int, title: str) -> str:
    """Generate a short English branch name using Sonnet."""
    import subprocess as _sp
    result = _sp.run(
        ["claude", "--model", MODEL_TRIAGE, "-p",
         f"Convert this issue title to a short English git branch slug (max 30 chars, lowercase, hyphens only, no special chars). Output ONLY the slug, nothing else.\n\nTitle: {title}"],
        capture_output=True, text=True, cwd=REPO_PATH,
    )
    raw = result.stdout.strip().lower()
    raw = re.sub(r"[^a-z0-9-]", "-", raw)
    raw = re.sub(r"-+", "-", raw).strip("-")[:30]
    if not raw:
        raw = f"issue-{iid}"
    return f"feat/{raw}"


def run_implementing(issue: dict, plan_text: str, dry_run: bool = False) -> None:
    """
    Create a worktree, run claude --dangerously-skip-permissions (Sonnet)
    to implement the approved plan, then push and create MR.
    """
    iid = issue["iid"]
    title = issue["title"]
    branch = _make_branch(iid, title)
    wt_path = create_worktree(branch)

    task: WorkerTask = {
        "iid": iid,
        "branch": branch,
        "worktree": str(wt_path),
        "pid": -1,  # updated after Popen
        "phase": "implementing",
    }

    post_note(iid, f"💬 Claude ({today}): 🔵 开始实现，分支：{branch}")
    log(f"[worker] Implementing #{iid} in {wt_path} ...")

    if dry_run:
        print(f"[dry-run] Would run claude --dangerously-skip-permissions in {wt_path}")
        remove_worktree(branch)
        return

    prompt = f"""实现以下 GitLab issue，按已批准计划执行：

Issue #{iid}: {title}
{issue.get('description') or issue.get('body') or ''}

已批准计划：
{plan_text}

要求：
1. 当前目录已是 worktree（分支 {branch}），直接实现，不要再 checkout
2. 实现功能，遵循项目规范（TypeScript, pnpm monorepo）
3. 跑测试：pnpm test:unit（在 repo 根目录）
4. 执行 /ship checklist（CHANGELOG, README, build）
5. git push origin {branch}
6. 用 glab 提 MR（关联 issue #{iid}）：
   glab mr create --title "feat: {title}" --description "Closes #{iid}" --repo {REPO}
7. MR 提出后，在 issue 贴评论：
   💬 Claude ({today}): ✅ 完成，MR: [链接]

GitLab repo: {REPO}
"""

    proc = subprocess.Popen(
        ["claude", "--dangerously-skip-permissions", "--model", MODEL_IMPLEMENTING, "-p", prompt],
        cwd=str(wt_path),
        env={"PATH": __import__("os").environ["PATH"],
             "HOME": __import__("os").environ["HOME"],
             "GLAB_CONFIG_DIR": GLAB_CONFIG_DIR,
             **__import__("os").environ},
    )
    task["pid"] = proc.pid
    set_worker(task)

    log(f"[worker] claude pid={proc.pid}, waiting for completion ...")
    proc.wait()
    log(f"[worker] claude finished (exit={proc.returncode}) for #{iid}")

    clear_worker()
    # worktree cleanup happens on MR merge via webhook (see webhook.py)
    # but if something went wrong, we leave the worktree for inspection


# ─── post-merge cleanup ───────────────────────────────────────────────────────


def cleanup_after_merge(branch: str) -> None:
    """Called when a MR for the given branch is merged."""
    log(f"[worker] Cleaning up branch '{branch}' after merge")
    remove_worktree(branch)


# ─── post-merge ───────────────────────────────────────────────────────────────


def run_post_merge(branch: str, issue_iid: int) -> None:
    """
    After MR is merged: open a temp worktree on master, run checks,
    then clean up branch + worktree and close the issue.
    """
    from gitlab import post_note, close_issue
    from datetime import date
    today = date.today().isoformat()

    pm_path = WORKTREES_DIR / "post-merge"

    # Clean up any stale post-merge worktree
    if pm_path.exists():
        import shutil
        shutil.rmtree(pm_path)
        subprocess.run(["git", "worktree", "prune"], cwd=REPO_PATH)

    log(f"[worker] Post-merge: opening master worktree at {pm_path}")
    subprocess.run(
        ["git", "worktree", "add", str(pm_path), "master"],
        cwd=REPO_PATH, check=True,
    )

    try:
        # Pull latest master
        subprocess.run(["git", "pull", "origin", "master"],
                       cwd=pm_path, check=True)

        # pnpm install (relink workspace packages)
        subprocess.run(["pnpm", "install"], cwd=REPO_PATH, check=False)

        # Run checks
        checks = [
            (["pnpm", "build"], "Build"),
            (["pnpm", "typecheck"], "Typecheck"),
            (["pnpm", "test:unit"], "Tests"),
        ]
        results = []
        all_pass = True
        for cmd, name in checks:
            r = subprocess.run(cmd, cwd=REPO_PATH, capture_output=True, text=True)
            status = "✅" if r.returncode == 0 else "❌"
            results.append(f"{status} {name}")
            if r.returncode != 0:
                all_pass = False
                log(f"[worker] {name} FAILED:\n{r.stdout[-500:]}\n{r.stderr[-500:]}")

        summary = " · ".join(results)
        if all_pass:
            comment = f"💬 Claude ({today}): ✅ MR merged, post-merge checks passed\n\n{summary}"
        else:
            comment = f"💬 Claude ({today}): ⚠️ MR merged, some checks failed\n\n{summary}\n\n请手动检查。"

        post_note(issue_iid, comment)
        if all_pass:
            close_issue(issue_iid)
            log(f"[worker] Issue #{issue_iid} closed")

    finally:
        # Cleanup worktree and branch
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(pm_path)],
            cwd=REPO_PATH, check=False,
        )
        subprocess.run(["git", "branch", "-D", branch], cwd=REPO_PATH, check=False)
        log(f"[worker] Cleaned up worktree and branch '{branch}'")
