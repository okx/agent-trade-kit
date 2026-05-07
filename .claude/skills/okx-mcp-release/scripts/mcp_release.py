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


def normalize_remote_tool(tool: dict[str, Any]) -> dict[str, Any]:
    """Convert MCP tools/list shape to docs/tools.json tool shape (params normalized)."""
    schema = tool.get("inputSchema") or {}
    props = schema.get("properties") or {}
    required = set(schema.get("required") or [])

    params: dict[str, Any] = {}
    for pname, pdef in props.items():
        entry: dict[str, Any] = {
            "type": pdef.get("type", "string"),
            "required": pname in required,
        }
        if "description" in pdef:
            entry["description"] = pdef["description"]
        if "enum" in pdef:
            entry["enum"] = pdef["enum"]
        if "default" in pdef:
            entry["default"] = pdef["default"]
        params[pname] = entry

    return {
        "name": tool["name"],
        "description": tool.get("description", ""),
        "params": params,
    }


def _flatten_local(local: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Flatten docs/tools.json to {tool_name: tool_dict} for O(1) lookup."""
    out: dict[str, dict[str, Any]] = {}
    for mod, mod_def in (local.get("modules") or {}).items():
        for tool in mod_def.get("tools") or []:
            out[tool["name"]] = {**tool, "_module": mod}
    return out


def _diff_fields(local_tool: dict[str, Any], remote_norm: dict[str, Any]) -> list[str]:
    """Return list of field names that differ between local and normalized remote."""
    diffs: list[str] = []
    if local_tool.get("description", "") != remote_norm.get("description", ""):
        diffs.append("description")
    if local_tool.get("params", {}) != remote_norm.get("params", {}):
        diffs.append("params")
    return diffs


def compare(local: dict[str, Any], remote_tools: list[dict[str, Any]]) -> dict[str, list[Any]]:
    """Return delta = {add: [...], modify: [...], remove: [...]}.

    add:    in local, not in remote
    remove: in remote, not in local
    modify: in both, but description/params differ
    """
    local_map = _flatten_local(local)
    remote_norm_map = {t["name"]: normalize_remote_tool(t) for t in remote_tools}

    add = [
        local_map[name]
        for name in local_map
        if name not in remote_norm_map
    ]
    remove = [
        {"name": name}
        for name in remote_norm_map
        if name not in local_map
    ]
    modify = []
    for name in local_map:
        if name not in remote_norm_map:
            continue
        diffs = _diff_fields(local_map[name], remote_norm_map[name])
        if diffs:
            modify.append({"name": name, "fields": diffs})

    return {"add": add, "modify": modify, "remove": remove}


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

    # diff command
    with open(args.tools_json, "r", encoding="utf-8") as f:
        local = json.load(f)
    url_var = "MCP_PRE_URL" if args.env == "pre" else "MCP_PROD_URL"
    url = os.environ.get(url_var)
    if not url:
        print(f"missing env var {url_var}", file=sys.stderr)
        return 2

    try:
        remote = fetch_remote_tools(url)
    except RemoteFetchError as exc:
        # retry once
        try:
            remote = fetch_remote_tools(url)
        except RemoteFetchError as exc2:
            print(f"remote fetch failed twice: {exc2}", file=sys.stderr)
            return 4

    delta = compare(local, remote)
    print(json.dumps(delta, indent=2))
    if delta["add"] or delta["modify"] or delta["remove"]:
        return 1  # diff exists; non-zero so caller can branch
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
