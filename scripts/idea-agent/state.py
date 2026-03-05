"""
Local runtime state for idea-agent.

Tracks the currently running worker task (pid, worktree, etc.).
Business state (triage / planning / implementing) is always derived
from GitLab issue comments — this file only stores what cannot be
recovered from GitLab (OS-level process info).

Multi-worker extension: change `worker` field to a list `workers`.
"""

import json
import os
from pathlib import Path
from typing import TypedDict

STATE_FILE = Path(__file__).parent / "agent-state.json"


class WorkerTask(TypedDict):
    iid: int
    branch: str
    worktree: str  # absolute path
    pid: int
    phase: str  # "planning" | "implementing"


class AgentState(TypedDict):
    # Single worker slot.  Change to list[WorkerTask] for multi-worker.
    worker: WorkerTask | None
    # Cache of iid (str) → last seen updated_at timestamp.
    # Used to skip issues that haven't changed since last poll.
    seen: dict[str, str]


def _default() -> AgentState:
    return {"worker": None, "seen": {}}


def load() -> AgentState:
    if not STATE_FILE.exists():
        return _default()
    try:
        return json.loads(STATE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return _default()


def save(state: AgentState) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, indent=2))


def is_process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def reconcile() -> AgentState:
    """
    On startup: verify that the recorded worker process is still alive.
    If not, clear the slot so a new task can be picked up.
    Returns the reconciled state.
    """
    state = load()
    if "seen" not in state:
        state["seen"] = {}
    worker = state.get("worker")
    if worker and not is_process_alive(worker["pid"]):
        print(f"[state] Worker pid {worker['pid']} (issue #{worker['iid']}) is gone — clearing slot")
        state["worker"] = None
        save(state)
    return state


def get_seen() -> dict[str, str]:
    return load().get("seen", {})


def mark_seen(iid: int, updated_at: str) -> None:
    state = load()
    state.setdefault("seen", {})[str(iid)] = updated_at
    save(state)


def set_worker(task: WorkerTask) -> None:
    state = load()
    state["worker"] = task
    save(state)


def clear_worker() -> None:
    state = load()
    state["worker"] = None
    save(state)


def get_worker() -> WorkerTask | None:
    return load().get("worker")


def is_busy() -> bool:
    """True if the single worker slot is occupied by a live process."""
    worker = get_worker()
    if not worker:
        return False
    if not is_process_alive(worker["pid"]):
        clear_worker()
        return False
    return True
