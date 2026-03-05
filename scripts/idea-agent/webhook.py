#!/usr/bin/env python3
"""
Webhook server for idea-agent v2.

Listens for GitLab webhook events and triggers the agent.

Supported events:
  - Issue note (comment)  → process_issue() for the relevant issue
  - MR merge              → cleanup_after_merge() for the source branch

Rate limiting:
  - Per-issue debounce: ignore duplicate triggers within DEBOUNCE_SECONDS
  - Global: if worker is busy, new implement triggers are skipped (logged)

Setup (GitLab project → Settings → Webhooks):
  URL:     http://<your-machine>:<PORT>
  Secret:  set WEBHOOK_SECRET env var (recommended)
  Trigger: ✅ Comments, ✅ Merge request events, ✅ Issue events

Usage:
  python3 scripts/idea-agent/webhook.py
  python3 scripts/idea-agent/webhook.py --port 9090
  WEBHOOK_SECRET=mysecret python3 scripts/idea-agent/webhook.py
"""

import argparse
import hashlib
import hmac
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from agent import process_issue
from gitlab import get_notes, list_open_ideas
from state import reconcile
from worker import cleanup_after_merge

# ─── config ───────────────────────────────────────────────────────────────────

DEFAULT_PORT = 8080
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
DEBOUNCE_SECONDS = 30  # ignore re-triggers for same issue within this window

# ─── debounce ─────────────────────────────────────────────────────────────────

_last_trigger: dict[int, float] = {}  # iid → timestamp
_debounce_lock = threading.Lock()


def _is_debounced(iid: int) -> bool:
    """Return True if this issue was triggered too recently."""
    with _debounce_lock:
        last = _last_trigger.get(iid, 0)
        now = time.monotonic()
        if now - last < DEBOUNCE_SECONDS:
            return True
        _last_trigger[iid] = now
        return False


# ─── handler ──────────────────────────────────────────────────────────────────


class WebhookHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # silence default access log
        pass

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length)

    def _verify_secret(self, body: bytes) -> bool:
        if not WEBHOOK_SECRET:
            return True  # no secret configured → accept all
        token = self.headers.get("X-Gitlab-Token", "")
        return hmac.compare_digest(token, WEBHOOK_SECRET)

    def do_POST(self):
        body = self._read_body()

        if not self._verify_secret(body):
            self._respond(403, "Forbidden")
            return

        try:
            event = json.loads(body)
        except json.JSONDecodeError:
            self._respond(400, "Bad JSON")
            return

        self._respond(200, "OK")

        # Dispatch in background thread so we return 200 quickly
        t = threading.Thread(target=self._dispatch, args=(event,), daemon=True)
        t.start()

    def _respond(self, code: int, msg: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(msg.encode())

    def _dispatch(self, event: dict) -> None:
        kind = event.get("object_kind")

        if kind == "note":
            self._handle_note(event)
        elif kind == "merge_request":
            self._handle_mr(event)
        elif kind == "issue":
            self._handle_issue(event)
        else:
            print(f"[webhook] Unhandled event kind: {kind}")

    def _handle_note(self, event: dict) -> None:
        """A comment was posted on an issue."""
        issue_data = event.get("issue")
        if not issue_data:
            return  # note on MR, not issue

        iid = issue_data.get("iid")
        if not iid:
            return

        # Skip notes posted by the bot itself to avoid loops
        author = event.get("user", {}).get("username", "")
        note_body = event.get("object_attributes", {}).get("note", "")
        if note_body.startswith("💬 Claude"):
            print(f"[webhook] Ignoring bot's own note on #{iid}")
            return

        if _is_debounced(iid):
            print(f"[webhook] Debounced note event for #{iid}")
            return

        print(f"[webhook] Note event for issue #{iid}, triggering agent")
        _trigger_issue(iid)

    def _handle_issue(self, event: dict) -> None:
        """Issue was created or updated."""
        attrs = event.get("object_attributes", {})
        iid = attrs.get("iid")
        action = attrs.get("action")

        if action not in ("open", "reopen"):
            return
        if not iid:
            return

        labels = [l.get("title") for l in event.get("labels", [])]
        if "idea" not in labels:
            return

        if _is_debounced(iid):
            print(f"[webhook] Debounced issue event for #{iid}")
            return

        print(f"[webhook] Issue event (action={action}) for #{iid}, triggering agent")
        _trigger_issue(iid)

    def _handle_mr(self, event: dict) -> None:
        """MR was merged — clean up worktree and local branch."""
        attrs = event.get("object_attributes", {})
        state = attrs.get("state")
        action = attrs.get("action")

        if action != "merge" and state != "merged":
            return

        source_branch = attrs.get("source_branch", "")
        if not source_branch.startswith("feat/"):
            return

        print(f"[webhook] MR merged, cleaning up branch '{source_branch}'")
        cleanup_after_merge(source_branch)


# ─── issue trigger ────────────────────────────────────────────────────────────


def _trigger_issue(iid: int) -> None:
    """Fetch issue details and run the agent for it."""
    try:
        ideas = list_open_ideas()
        issue = next((i for i in ideas if i["iid"] == iid), None)
        if not issue:
            print(f"[webhook] Issue #{iid} not found in open ideas (maybe closed or no 'idea' label)")
            return
        process_issue(issue)
    except Exception as e:
        print(f"[webhook] Error processing issue #{iid}: {e}")


# ─── server ───────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Idea Agent Webhook Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    # Reconcile state on startup
    reconcile()

    server = HTTPServer(("0.0.0.0", args.port), WebhookHandler)
    secret_status = "with secret" if WEBHOOK_SECRET else "WITHOUT secret (set WEBHOOK_SECRET env var)"
    print(f"[webhook] Listening on port {args.port} ({secret_status})")
    print(f"[webhook] Register in GitLab: Settings → Webhooks → http://<host>:{args.port}")
    print(f"[webhook] Triggers: Comments, Merge request events, Issue events")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[webhook] Shutting down")


if __name__ == "__main__":
    main()
