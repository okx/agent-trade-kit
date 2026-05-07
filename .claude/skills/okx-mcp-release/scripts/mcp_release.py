"""mcp_release.py — Remote MCP tools/list fetcher and three-way comparator.

Usage:
    python3 mcp_release.py fetch <env>   # env = pre | prod
    python3 mcp_release.py diff <tools.json> <env>

Reads MCP_PRE_URL / MCP_PROD_URL from env. Fails fast if missing.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from typing import Any


class RemoteFetchError(Exception):
    """Raised when MCP tools/list fetch fails after retry."""


def fetch_remote_tools(url: str, timeout: float = 30.0) -> list[dict[str, Any]]:
    """POST tools/list JSON-RPC to MCP endpoint, return tools list.

    Raises RemoteFetchError on transport failure or non-result response.
    """
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list",
        "params": {},
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
    except OSError as exc:
        raise RemoteFetchError(f"transport error: {exc}") from exc

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RemoteFetchError(f"invalid JSON response: {exc}") from exc

    if "result" not in parsed or "tools" not in parsed.get("result", {}):
        raise RemoteFetchError(f"unexpected response shape: {parsed}")

    return parsed["result"]["tools"]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("fetch").add_argument("env", choices=["pre", "prod"])
    diff = sub.add_parser("diff")
    diff.add_argument("tools_json")
    diff.add_argument("env", choices=["pre", "prod"])

    args = parser.parse_args(argv)

    if args.cmd == "fetch":
        url_var = "MCP_PRE_URL" if args.env == "pre" else "MCP_PROD_URL"
        url = os.environ.get(url_var)
        if not url:
            print(f"missing env var {url_var}", file=sys.stderr)
            return 2
        tools = fetch_remote_tools(url)
        print(json.dumps(tools, indent=2))
        return 0

    # diff command stub — implemented in Task 4
    print("diff command not yet implemented", file=sys.stderr)
    return 3


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
