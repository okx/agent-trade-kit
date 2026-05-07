# `/okx_mcp_release` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 `/okx_mcp_release [pre|prod]` 命令，覆盖 CLI / Local MCP / Remote MCP 三方工具集对齐与 ai-mcp-server 自动发布闭环。

**Architecture:** Slash command 薄壳调用项目级 Skill；Skill 内部用 17 个并行 subagent 扫描 CLI 和 Local MCP 的工具集（按 module-registry 分组），严格比对后产出 `docs/tools.json` snapshot；Python 脚本通过 MCP `tools/list` 实时拉 Remote 并比对；不一致时自动在 ai-mcp-server 仓库走完代码生成 + draft MR 流程。

**Tech Stack:** Markdown（命令/skill）、Python 3（Remote 拉取 + diff 引擎，stdlib only：`urllib`/`json`/`argparse`）、pytest（Python 单测）、Bash（编排 glue）、glab CLI（draft MR）。

**Spec:** `docs/superpowers/specs/2026-05-07-okx-mcp-release-design.md`

---

## File Structure

要新增 / 修改的文件：

| 路径 | 状态 | 职责 |
|------|------|------|
| `.gitignore` | modify | 给 `.claude/skills/` 加 `okx-mcp-release` 例外；新增 `.tmp/` |
| `.claude/commands/okx_mcp_release.md` | create | Slash command 薄壳 |
| `.claude/skills/okx-mcp-release/SKILL.md` | create | Skill 编排主体 |
| `.claude/skills/okx-mcp-release/subagent-prompt.md` | create | CLI / Local 模块扫描 prompt 模板 |
| `.claude/skills/okx-mcp-release/scripts/mcp_release.py` | create | Remote 拉取 + diff 引擎（CLI 入口） |
| `.claude/skills/okx-mcp-release/scripts/test_mcp_release.py` | create | Python 单测 |
| `.claude/skills/okx-mcp-release/references/ai-mcp-server-workflow.md` | create | ai-mcp-server 提交流程本地化引用 |
| `~/.claude/commands/mcp_diff.md` | delete | 替换为 `/okx_mcp_release` |
| `../ai-mcp-server/scripts/mcp_diff.py` | delete | 替换为新脚本 |

最终命令交付物：`/okx_mcp_release [pre|prod]`。

`docs/tools.json` 不在初次实现中创建（首次成功 Phase 3 后由命令本身写出）。

---

## Task 1: Cleanup 与 gitignore 调整

**Files:**
- Modify: `.gitignore`
- Delete: `~/.claude/commands/mcp_diff.md`
- Delete: `../ai-mcp-server/scripts/mcp_diff.py`

- [ ] **Step 1: 修改 .gitignore，允许 `.claude/skills/okx-mcp-release` 入库 + 加 `.tmp/`**

修改 `.gitignore` —— 把 `.claude/skills/` 一行替换为带例外的写法，并在末尾追加 `.tmp/`：

```
.claude/skills/
!.claude/skills/okx-mcp-release/
```

末尾追加：

```
.tmp/
```

- [ ] **Step 2: 验证 gitignore 改动生效**

```bash
mkdir -p .claude/skills/okx-mcp-release
touch .claude/skills/okx-mcp-release/.gitkeep
git check-ignore -v .claude/skills/okx-mcp-release/.gitkeep
```

Expected: 命令退出码 1（即不被 ignore），无输出。

```bash
mkdir -p .tmp/test
touch .tmp/test/x
git check-ignore -v .tmp/test/x
```

Expected: 输出 `.gitignore:N:.tmp/  .tmp/test/x`（被 ignore）。清理：`rm -rf .tmp/test`。

- [ ] **Step 3: 删除旧 /mcp_diff 命令文件与脚本**

```bash
rm ~/.claude/commands/mcp_diff.md
rm ../ai-mcp-server/scripts/mcp_diff.py
```

注：`~/.claude/commands/mcp_diff.md` 不在本仓库内，删除属于本地清理；`../ai-mcp-server/scripts/mcp_diff.py` 在另一个仓库，删除后**单独在 ai-mcp-server 仓库提 commit**（不在本 plan 的 commit 里）。

- [ ] **Step 4: 在 ai-mcp-server 仓库提交脚本删除**

```bash
cd ../ai-mcp-server
git checkout master && git pull
git checkout -b chore/remove-mcp-diff-script
git rm scripts/mcp_diff.py
git commit -m "chore: remove mcp_diff.py (replaced by /okx_mcp_release in okx-trade-mcp)"
git push -u origin chore/remove-mcp-diff-script
glab mr create --draft --title "chore: remove mcp_diff.py" --description "Replaced by /okx_mcp_release skill in okx-trade-mcp."
cd -
```

如果不希望立刻提 ai-mcp-server MR，可跳过 Step 4，留作后续清理。

- [ ] **Step 5: Commit okx-trade-mcp 的 gitignore 改动**

```bash
git add .gitignore
git commit -m "chore: allow .claude/skills/okx-mcp-release in repo, ignore .tmp/"
```

---

## Task 2: 搭建 Skill 目录骨架

**Files:**
- Create: `.claude/skills/okx-mcp-release/SKILL.md` (空骨架)
- Create: `.claude/skills/okx-mcp-release/subagent-prompt.md` (空骨架)
- Create: `.claude/skills/okx-mcp-release/scripts/.gitkeep`
- Create: `.claude/skills/okx-mcp-release/references/.gitkeep`

- [ ] **Step 1: 创建目录与占位文件**

```bash
mkdir -p .claude/skills/okx-mcp-release/scripts
mkdir -p .claude/skills/okx-mcp-release/references
touch .claude/skills/okx-mcp-release/scripts/.gitkeep
touch .claude/skills/okx-mcp-release/references/.gitkeep
```

- [ ] **Step 2: 写 SKILL.md 占位（含正确 frontmatter）**

写入 `.claude/skills/okx-mcp-release/SKILL.md`：

```markdown
---
name: okx-mcp-release
description: 构建 CLI / Local MCP / Remote MCP 三方工具集对齐与 ai-mcp-server 发布闭环。当用户运行 `/okx_mcp_release pre` 或 `/okx_mcp_release prod`，或说"同步 mcp 到 pre/prod"、"发布 mcp 工具"时触发。
---

# okx-mcp-release Skill

TBD: implementation in subsequent tasks.
```

注：此处 `TBD` 仅为占位，**Task 7 会替换为完整内容**，本任务只是让目录结构进 git。

- [ ] **Step 3: 写 subagent-prompt.md 占位**

写入 `.claude/skills/okx-mcp-release/subagent-prompt.md`：

```markdown
# Subagent Scan Prompts

TBD: implemented in Task 6.
```

- [ ] **Step 4: Commit 骨架**

```bash
git add .claude/skills/okx-mcp-release/
git commit -m "scaffold(mcp-release): skill directory structure"
```

---

## Task 3: Python 脚本 — Remote `tools/list` 拉取（TDD）

**Files:**
- Create: `.claude/skills/okx-mcp-release/scripts/mcp_release.py`
- Create: `.claude/skills/okx-mcp-release/scripts/test_mcp_release.py`

仅 stdlib（`urllib.request`、`json`），便于无依赖运行。

- [ ] **Step 1: 写 fetch 失败测试**

写入 `.claude/skills/okx-mcp-release/scripts/test_mcp_release.py`：

```python
"""Tests for mcp_release.py — uses stdlib unittest, no external deps."""

import json
import unittest
from unittest.mock import MagicMock, patch

import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))

from mcp_release import fetch_remote_tools, RemoteFetchError


class TestFetchRemote(unittest.TestCase):
    def test_fetch_success(self):
        fake_response = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "tools": [
                    {
                        "name": "spot_place_order",
                        "description": "Place a spot order.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "instId": {"type": "string", "description": "Instrument ID"}
                            },
                            "required": ["instId"]
                        }
                    }
                ]
            }
        }).encode()

        mock_resp = MagicMock()
        mock_resp.read.return_value = fake_response
        mock_resp.__enter__.return_value = mock_resp

        with patch("urllib.request.urlopen", return_value=mock_resp):
            tools = fetch_remote_tools("http://fake/mcp")

        self.assertEqual(len(tools), 1)
        self.assertEqual(tools[0]["name"], "spot_place_order")

    def test_fetch_http_error_raises(self):
        with patch("urllib.request.urlopen", side_effect=OSError("conn refused")):
            with self.assertRaises(RemoteFetchError):
                fetch_remote_tools("http://fake/mcp")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
python3 .claude/skills/okx-mcp-release/scripts/test_mcp_release.py
```

Expected: `ModuleNotFoundError: No module named 'mcp_release'` 或类似。

- [ ] **Step 3: 实现 fetch_remote_tools**

写入 `.claude/skills/okx-mcp-release/scripts/mcp_release.py`：

```python
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
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
python3 .claude/skills/okx-mcp-release/scripts/test_mcp_release.py
```

Expected: `Ran 2 tests in ... OK`。

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/okx-mcp-release/scripts/
git commit -m "feat(mcp-release): implement Remote MCP tools/list fetch"
```

---

## Task 4: Python 脚本 — Diff 引擎（TDD）

**Files:**
- Modify: `.claude/skills/okx-mcp-release/scripts/mcp_release.py`
- Modify: `.claude/skills/okx-mcp-release/scripts/test_mcp_release.py`

实现 `compare_local_vs_remote(local_tools_json, remote_tools_list)` —— 全字段比对，输出 `{add, modify, remove}` 三类 delta。

- [ ] **Step 1: 写 diff 测试（一致情形）**

追加到 `test_mcp_release.py`（在 `class TestFetchRemote` 后新增）：

```python
from mcp_release import compare, normalize_remote_tool


class TestCompare(unittest.TestCase):
    def _local_doc(self, tools_per_module):
        """Build a minimal docs/tools.json structure."""
        return {
            "generatedAt": "2026-05-07T00:00:00Z",
            "gitCommit": "abc",
            "modules": {
                mod: {"tools": tools}
                for mod, tools in tools_per_module.items()
            },
        }

    def test_identical_no_delta(self):
        local = self._local_doc({
            "spot": [{
                "name": "spot_place_order",
                "description": "Place a spot order.",
                "params": {
                    "instId": {"type": "string", "required": True}
                },
                "isWrite": True,
                "source": ["cli", "mcp"],
            }],
        })
        remote = [{
            "name": "spot_place_order",
            "description": "Place a spot order.",
            "inputSchema": {
                "type": "object",
                "properties": {"instId": {"type": "string"}},
                "required": ["instId"],
            },
        }]
        delta = compare(local, remote)
        self.assertEqual(delta["add"], [])
        self.assertEqual(delta["modify"], [])
        self.assertEqual(delta["remove"], [])

    def test_remote_missing_tool_goes_to_add(self):
        local = self._local_doc({
            "spot": [{
                "name": "spot_place_order",
                "description": "x",
                "params": {"instId": {"type": "string", "required": True}},
                "isWrite": True,
                "source": ["cli", "mcp"],
            }],
        })
        delta = compare(local, [])
        self.assertEqual(len(delta["add"]), 1)
        self.assertEqual(delta["add"][0]["name"], "spot_place_order")

    def test_remote_extra_tool_goes_to_remove(self):
        local = self._local_doc({"spot": []})
        remote = [{
            "name": "stale_tool",
            "description": "x",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        }]
        delta = compare(local, remote)
        self.assertEqual(len(delta["remove"]), 1)
        self.assertEqual(delta["remove"][0]["name"], "stale_tool")

    def test_description_diff_goes_to_modify(self):
        local = self._local_doc({
            "spot": [{
                "name": "spot_place_order",
                "description": "NEW description",
                "params": {"instId": {"type": "string", "required": True}},
                "isWrite": True,
                "source": ["cli", "mcp"],
            }],
        })
        remote = [{
            "name": "spot_place_order",
            "description": "OLD description",
            "inputSchema": {
                "type": "object",
                "properties": {"instId": {"type": "string"}},
                "required": ["instId"],
            },
        }]
        delta = compare(local, remote)
        self.assertEqual(len(delta["modify"]), 1)
        self.assertEqual(delta["modify"][0]["name"], "spot_place_order")
        self.assertIn("description", delta["modify"][0]["fields"])
```

- [ ] **Step 2: 运行测试确认失败**

```bash
python3 .claude/skills/okx-mcp-release/scripts/test_mcp_release.py
```

Expected: `ImportError: cannot import name 'compare'`。

- [ ] **Step 3: 实现 normalize + compare**

在 `mcp_release.py` 中 `RemoteFetchError` 之后、`fetch_remote_tools` 之前插入：

```python
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
```

并把 `main` 中 `diff` 分支替换为：

```python
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
python3 .claude/skills/okx-mcp-release/scripts/test_mcp_release.py
```

Expected: 6 tests OK。

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/okx-mcp-release/scripts/
git commit -m "feat(mcp-release): implement three-way diff engine"
```

---

## Task 5: subagent-prompt.md — 模块扫描模板

**Files:**
- Modify: `.claude/skills/okx-mcp-release/subagent-prompt.md`

把占位换成完整模板，含两个版本（CLI 扫描、Local MCP 扫描），共用一份 schema 说明。

- [ ] **Step 1: 写 subagent-prompt.md 完整内容**

替换 `.claude/skills/okx-mcp-release/subagent-prompt.md` 全部内容为：

````markdown
# Subagent Scan Prompts

This file holds the prompt templates the orchestrator (`SKILL.md`) injects into each
scanning subagent. There are two templates: one for CLI scanning, one for Local MCP
scanning. They share an output schema.

The orchestrator substitutes `{{MODULE_ID}}`, `{{RUN_ID}}`, and `{{REPO_ROOT}}` before
dispatching.

---

## Output schema (both templates)

Each subagent writes a single JSON file matching this structure:

```json
{
  "module": "<module-id>",
  "tools": [
    {
      "name": "spot_place_order",
      "description": "...",
      "params": {
        "instId": { "type": "string", "required": true, "description": "..." }
      },
      "isWrite": true
    }
  ]
}
```

`params` rules:
- `type`: one of `string`, `number`, `integer`, `boolean`, `array`, `object`
- `required`: bool
- include `enum`, `description`, `default` if present in the source zod schema
- nested objects flattened into dot.path keys when the runtime serializer would (matches
  how MCP `tools/list` exposes them); when in doubt, copy the shape produced by zod's
  `.describe()` output

`isWrite`:
- `true` if the tool mutates funds / opens / closes / transfers / cancels / amends
- `false` for queries

---

## Template A — CLI scan

````
You are scanning the OKX trade-kit CLI to extract the tool surface for module `{{MODULE_ID}}`.

**Inputs to read:**
1. `{{REPO_ROOT}}/packages/cli/src/cli-registry.ts` — find the entry for module `{{MODULE_ID}}`. List every command (and nested subgroup) and its `toolName`. Also collect any `alternateTools` referenced.
2. For every `toolName` (including alternates) collected above, read its ToolSpec definition under `{{REPO_ROOT}}/packages/core/src/tools/`. Files are organized by topic, not always by module name (e.g. `spot-trade.ts`, `algo-trade.ts`, `bot/grid.ts`). Use grep to find the `name: "<toolName>"` literal.
3. For each ToolSpec: record `name`, `description`, and walk its zod input schema to fill `params`.

**Output:**
Write the result to `{{REPO_ROOT}}/.tmp/okx-mcp-release/{{RUN_ID}}/cli/{{MODULE_ID}}.json`.

The JSON must match the schema above exactly. Sort tools by name ascending.

**Quality bar:**
- Do not invent fields. If a description is empty in source, leave it empty.
- If you cannot resolve a `toolName` (orphaned reference), include it in a `_unresolved` top-level array and continue with what you have.
- Stop and report if you cannot find the module entry in `cli-registry.ts` at all.

Return only the file path you wrote and a one-line summary (tool count). No prose.
````

---

## Template B — Local MCP scan

````
You are scanning the OKX trade-kit Local MCP server (stdio MCP) to extract the tool
surface for module `{{MODULE_ID}}`.

**Inputs to read:**
1. `{{REPO_ROOT}}/packages/mcp/src/index.ts` and `{{REPO_ROOT}}/packages/mcp/src/server.ts` — find every tool registered for module `{{MODULE_ID}}`. The MCP package may compose / fan-out / re-wrap tools; capture the **final** registered shape (the schema actually advertised to MCP clients).
2. Walk into helper files under `{{REPO_ROOT}}/packages/mcp/src/` and shared definitions under `{{REPO_ROOT}}/packages/core/src/tools/` as needed to resolve descriptions and zod schemas.

**Output:**
Write the result to `{{REPO_ROOT}}/.tmp/okx-mcp-release/{{RUN_ID}}/mcp/{{MODULE_ID}}.json`.

Same schema as the CLI scan. Sort tools by name ascending.

**Quality bar:**
- The "final registered shape" matters — if a tool is wrapped to add/remove a parameter
  vs the underlying ToolSpec in core, record the wrapped shape, not the inner spec.
- If a module has no tools registered in Local MCP (which is legitimate for some
  optional modules), output `{"module":"{{MODULE_ID}}","tools":[]}`.

Return only the file path you wrote and a one-line summary. No prose.
````
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/okx-mcp-release/subagent-prompt.md
git commit -m "feat(mcp-release): add CLI and Local MCP scan prompt templates"
```

---

## Task 6: SKILL.md — 完整编排逻辑

**Files:**
- Modify: `.claude/skills/okx-mcp-release/SKILL.md`

把占位换成完整 6 phase 编排说明（Phase 0-5）。

- [ ] **Step 1: 写 SKILL.md 完整内容**

完全覆写 `.claude/skills/okx-mcp-release/SKILL.md` 为：

````markdown
---
name: okx-mcp-release
description: 构建 CLI / Local MCP / Remote MCP 三方工具集对齐与 ai-mcp-server 发布闭环。当用户运行 `/okx_mcp_release pre` 或 `/okx_mcp_release prod`，或说"同步 mcp 到 pre/prod"、"发布 mcp 工具"时触发。
---

# okx-mcp-release Skill

Orchestrates a six-phase release pipeline that aligns the OKX trade-kit CLI, Local MCP,
and Remote MCP tool surfaces, then opens a draft MR on `ai-mcp-server` if Remote drifts.

**Trigger:** `/okx_mcp_release pre` or `/okx_mcp_release prod`. The slash command is a
thin shell that hands off here.

**Spec:** `docs/superpowers/specs/2026-05-07-okx-mcp-release-design.md`

---

## Inputs

- `$ARGUMENTS`: must contain `pre` or `prod`. If neither, ask the user before proceeding.
- env vars `MCP_PRE_URL` / `MCP_PROD_URL` for Remote endpoints.
- Sibling repo `../ai-mcp-server` checked out (used in Phase 5).

---

## Module list (canonical, 17 modules)

Read from `docs/module-registry.md` table — only rows with status `✅ approved`.
At time of writing: `market, futures, swap, option, spot, account, news, event,
earn.savings, smartmoney, bot.grid, bot.dca, earn.dcd, earn.onchain, skills,
earn.autoearn, earn.flash`.

Re-parse the table at runtime in case the list changes.

---

## Phase 0 — Prep

Steps:
1. Verify CWD is the okx-trade-mcp repo root (`pwd` ends in `/okx-trade-mcp`; `package.json` has `name: "okx-trade-kit"` workspace marker, or `git config remote.origin.url` matches).
2. `git fetch origin master`.
3. Compute `RUN_ID = $(date -u +%Y%m%dT%H%M%SZ)` and create `.tmp/okx-mcp-release/$RUN_ID/{cli,mcp}/`.
4. Capture `git rev-parse origin/master` into a variable for later snapshot metadata.
5. Parse the approved module list from `docs/module-registry.md` (use `grep -E '^\| [a-z][a-z0-9.]+ +\| ✅' docs/module-registry.md | awk '{print $2}'`).

If any step fails, abort with a clear error. Do not proceed.

---

## Phase 1 — CLI scan (17 parallel subagents)

For every approved module ID, dispatch one subagent with the **CLI scan template** from
`subagent-prompt.md`, substituting `{{MODULE_ID}}`, `{{RUN_ID}}`, `{{REPO_ROOT}}`.

Use `Agent` tool with `subagent_type: general-purpose`. **Send all 17 dispatches in a
single message** (parallel execution).

After all return:
- Verify each `.tmp/okx-mcp-release/$RUN_ID/cli/<module>.json` exists and parses as JSON.
- For any missing or invalid file: re-dispatch that single subagent **once**.
- Still failing → abort with stdout listing the failed modules.

---

## Phase 2 — Local MCP scan (17 parallel subagents)

Same as Phase 1 but uses **Local MCP scan template** and writes to
`.tmp/okx-mcp-release/$RUN_ID/mcp/<module>.json`.

Same retry-once-then-abort policy.

---

## Phase 3 — CLI ≡ Local strict compare

For each module:
1. Load `cli/<module>.json` and `mcp/<module>.json`.
2. Build a name-keyed dict from each tool list.
3. For every name in either side:
   - If only in CLI → diff entry `cli_only`.
   - If only in MCP → diff entry `mcp_only`.
   - If in both: deep-compare `description`, `params`, `isWrite`. Any mismatch → diff
     entry `mismatch` with the differing field names.

If any diff entries exist:
- Write `.tmp/okx-mcp-release/$RUN_ID/report-<RUN_ID>.md` with a `## Phase 3` section
  listing every mismatch (per-module table; show original values side-by-side).
- Print a stdout summary: count of cli_only / mcp_only / mismatches.
- **Abort.** Do not proceed to Phase 4.

If no diffs:
- Merge all 17 `cli/<module>.json` (CLI is the source of truth) into `docs/tools.json`
  with shape:
  ```json
  {
    "generatedAt": "<RUN_ID ISO8601>",
    "gitCommit": "<origin/master HEAD>",
    "modules": {
      "<module>": { "tools": [ { "name": "...", ..., "source": ["cli","mcp"] } ] }
    }
  }
  ```
- Each tool gets `source: ["cli","mcp"]` since both produced identical shape.
- Sort modules alphabetically by ID; sort tools within a module by name.
- Print "Phase 3 ✓ CLI ≡ Local across N modules / M tools".

---

## Phase 4 — Remote fetch + diff

Run:
```bash
python3 .claude/skills/okx-mcp-release/scripts/mcp_release.py diff docs/tools.json $ENV
```

The script handles retry-once internally and exits:
- `0` if no delta (Remote already matches Local). Print "Phase 4 ✓ Remote in sync, nothing to release", **exit pipeline**.
- `1` if delta exists. Capture stdout JSON delta into a variable.
- `2` if env var missing — print which one and abort.
- `4` if Remote unreachable after retry — abort.

If delta exists:
- Append `## Phase 4` section to `report-<RUN_ID>.md` with the JSON delta plus a human
  table (add / modify / remove counts and names).
- Stdout summary.
- Proceed to Phase 5.

---

## Phase 5 — ai-mcp-server auto develop + draft MR

⚠️ This phase modifies a sibling repo. Always work on a fresh branch off master, never
on master itself.

```bash
cd ../ai-mcp-server
git checkout master && git pull
BRANCH="feat/sync-tools-${ENV}-$(date +%Y%m%d)"
git checkout -B "$BRANCH"
```

Read `../ai-mcp-server/CLAUDE.md` and follow it strictly. For each delta entry:

**add (new tool):**
1. Classify `gateway` (pure HTTP proxy) vs `custom` (server-side logic) vs
   `pending_custom` (CLI-only — skip).
2. Update `docs/trading_oauth_tools.json` with the new entry.
3. If `gateway`:
   - Run `python3 scripts/gen_manual_sql.py`.
   - Create Flyway migration `V$(date +%Y.%m.%d.%H%M)__sync_<tool>.sql` with the
     INSERT/UPSERT for `mcp_tool_config` per region/env (the helper script generates
     the SQL files; the migration just sources them).
4. If `custom`: scaffold a `@McpTool` Java handler skeleton + a unit test file with
   `// TODO` markers; do not invent business logic.
5. Add `mcp_workspace_tool` migration (INSERT IGNORE).

**modify:** update `docs/trading_oauth_tools.json` and append an `ON DUPLICATE KEY
UPDATE` migration for the affected tools.

**remove:** add a migration that DELETEs the row from `mcp_tool_config` and
`mcp_workspace_tool` for that tool name.

After all delta entries processed:

```bash
mvn clean package -DskipTests
mvn test
```

If anything fails — stop, do **not** delete the branch, print failing step + log tail
to stdout, and ask the user to take over.

If all green:

```bash
git add -A
git commit -m "sync: align Remote MCP with okx-trade-mcp tools.json (RUN_ID=$RUN_ID)"
git push -u origin "$BRANCH"
```

Build the MR description by inserting the entire `report-<RUN_ID>.md` (Phase 3 + Phase
4 sections) plus a top "Auto-generated by /okx_mcp_release" notice:

```bash
glab mr create --draft \
  --title "sync: align Remote MCP with okx-trade-mcp ($ENV)" \
  --description "$(cat <path-to-report-md>)"
```

Print the resulting MR URL.

`cd -` back to okx-trade-mcp.

---

## Failure & retry policy summary

| Failure | Policy |
|--------|--------|
| Phase 1/2 single subagent | Retry once. Still fails → abort listing failed modules. |
| Phase 3 mismatch | Abort, write report. |
| Phase 4 Remote fetch | Retry once (in script). Still fails → abort. |
| Phase 4 delta exists | Proceed to Phase 5 with report. |
| Phase 5 mvn / git step | Stop in place, leave branch, ask user. |

---

## Cleanup

`.tmp/okx-mcp-release/$RUN_ID/` is **kept** after run for audit. `gitignore`d so it
won't pollute repo. Old runs older than 7 days may be pruned at the start of the next
run (best-effort: `find .tmp/okx-mcp-release -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +`).

---

## Out of scope (for now)

- Composite/fan-out whitelist: spec assumes strict 1:1 between CLI and Local MCP.
  If real divergence emerges, extend `tools.json` to support `mcpOnly`/`cliOnly`
  fields and update Phase 3 logic. Today: any divergence is a bug.
- Reverse sync (deleting tools from Remote that no longer exist in Local) is included
  via `delta.remove`, but the auto-generated DELETE migrations should be reviewed
  carefully on the draft MR — destructive ops.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/okx-mcp-release/SKILL.md
git commit -m "feat(mcp-release): implement skill orchestration (6 phases)"
```

---

## Task 7: ai-mcp-server-workflow 引用文档

**Files:**
- Modify: `.claude/skills/okx-mcp-release/references/ai-mcp-server-workflow.md`
- Delete: `.claude/skills/okx-mcp-release/references/.gitkeep`

把 ai-mcp-server CLAUDE.md 中**与本 skill Phase 5 直接相关**的内容摘抄并加上调用上下文，避免 skill 执行时还要去读跨仓库文件。

- [ ] **Step 1: 写引用文档**

写入 `.claude/skills/okx-mcp-release/references/ai-mcp-server-workflow.md`：

````markdown
# ai-mcp-server Phase 5 Workflow Reference

This document is a **local digest** of `../ai-mcp-server/CLAUDE.md` covering only what
the `okx-mcp-release` skill needs in Phase 5. **The sibling repo's CLAUDE.md remains
authoritative.** When in doubt or when this digest disagrees with the source, follow
the source.

Source of truth: `../ai-mcp-server/CLAUDE.md`

---

## Tool Classification

Every tool maps to one of three types in `docs/trading_oauth_tools.json`:

| Type | Criteria |
|------|----------|
| `gateway` | Pure HTTP proxy to OKX API. Uses `mcp_tool_config` DB row + `HttpToolExecutor`. Default for read-only public-data tools. |
| `custom` | Requires server-side logic (composite call, filtering, auth assembly). Java `@McpTool` handler class needed. |
| `pending_custom` | CLI-only (local filesystem, session state). **Skip in Phase 5** — not applicable to server MCP. |

Defaulting heuristic for new tools (when uncertain):
- `isWrite=false` and matches a single OKX REST endpoint → `gateway`.
- `isWrite=true` or composes multiple OKX endpoints / does pre-filtering → `custom`.
- Tool name starts with `skills_` and reads local FS → `pending_custom`.

---

## Region × Env matrix (gateway tools only)

Every gateway tool needs **6** `mcp_tool_config` rows:

| Region | PROD URL prefix | PRE URL prefix |
|--------|-----------------|-----------------|
| HK | `https://www.okx.com` | `https://beta.okex.org` |
| US | `https://app.okx.com` | `https://usbeta.okex.org` |
| EU | `https://my.okx.com` | `https://eubeta.okex.org` |

PRE rows use the tool name with a `pre-` prefix (e.g. `pre-account_get_balance`).

URL must be **fully qualified** (`https://...`), not relative — `HttpToolExecutor`
calls `fromHttpUrl()` and rejects relative paths at runtime.

---

## simulator_header_enabled

| Value | When |
|-------|------|
| `1` | User-scoped data (account, positions, orders, fills, leverage, personal earn history). |
| `0` | Public data (market, news, smartmoney, skill catalog, product lists). |

When `1`, the tool's `input_schema` must include:

```json
"simulatedTrading": {
  "type": "boolean",
  "description": "Set true for simulated (demo) trading. Default: false (live)."
}
```

---

## Flyway migration rules

- Never modify a pushed migration. New change = new file.
- Naming: `V{YYYY}.{MM}.{DD}.{HHMM}__{description}.sql`
- `mcp_workspace_tool`: use `INSERT IGNORE` (idempotent).
- `mcp_tool_config`: use `ON DUPLICATE KEY UPDATE` (corrections re-runnable).

---

## Pre-MR checklist (apply before pushing)

- [ ] `docs/trading_oauth_tools.json` updated for every change.
- [ ] Flyway migration present for every DB change.
- [ ] `mcp_workspace_tool` rows added (INSERT IGNORE).
- [ ] `simulator_header_enabled` correct per the rule above.
- [ ] Gateway URLs are fully qualified.
- [ ] All 6 region×env SQL files generated for every new gateway tool (run `python3
      scripts/gen_manual_sql.py`).
- [ ] Unit tests for any new/modified custom handler (skeleton ok; mark `// TODO`).
- [ ] `mvn clean package -DskipTests` passes.
- [ ] `mvn test` passes.

---

## Skeleton scaffolds (use only when CLAUDE.md doesn't have a more recent template)

### Custom handler skeleton

```java
// Path: ai-tool-rest/src/main/java/.../tools/<Tool>Handler.java
@McpTool(name = "<tool_name>")
public class <Tool>Handler {
    // TODO: inject required services
    // TODO: implement business logic — see okx-trade-mcp packages/core/src/tools for the canonical behavior.
}
```

### Unit test skeleton

```java
// Path: ai-tool-rest/src/test/java/.../tools/<Tool>HandlerTest.java
class <Tool>HandlerTest {
    @Test
    void todo_implement() {
        // TODO: replicate okx-trade-mcp test cases for <tool_name>.
    }
}
```

The skeletons are intentionally minimal. The draft MR is the handoff point — the human
reviewer fills in business logic. Do not invent behavior.
````

- [ ] **Step 2: 删除 .gitkeep（被实际文件替换）**

```bash
rm .claude/skills/okx-mcp-release/references/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/okx-mcp-release/references/
git commit -m "docs(mcp-release): add ai-mcp-server workflow reference for Phase 5"
```

---

## Task 8: Slash command 入口

**Files:**
- Create: `.claude/commands/okx_mcp_release.md`

- [ ] **Step 1: 写 slash command 薄壳**

写入 `.claude/commands/okx_mcp_release.md`：

````markdown
---
description: "三方工具集对齐发布：CLI ≡ Local MCP → snapshot tools.json → diff Remote MCP → 自动开 ai-mcp-server draft MR"
---

参数：`$ARGUMENTS`

支持格式：
- `/okx_mcp_release pre` — 比对并发布到 pre 环境
- `/okx_mcp_release prod` — 比对并发布到 prod 环境
- `/okx_mcp_release` — 无参数时询问用户选择 pre / prod

请调用 `okx-mcp-release` skill 完成 6 phase 流水线（详见 `.claude/skills/okx-mcp-release/SKILL.md`）。

把解析出的 env (`pre` 或 `prod`) 作为输入传给 skill。
````

- [ ] **Step 2: 验证命令可被识别**

重启 Claude Code 或 `/help` 应该能看到 `/okx_mcp_release`。手动验证步骤（实际触发命令属于 Task 9）。

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/okx_mcp_release.md
git commit -m "feat(mcp-release): add /okx_mcp_release slash command entry"
```

---

## Task 9: 手工 smoke test

**Files:** none

- [ ] **Step 1: Phase 0-3 happy path**

确认本地 `origin/master` 是干净对齐版本（CLI ≡ Local），运行：

```
/okx_mcp_release prod
```

观察：
- Phase 0 创建 `.tmp/okx-mcp-release/<run-id>/`
- Phase 1/2 17 个 subagent 并行扫描完成
- Phase 3 ✓ → 写 `docs/tools.json`
- Phase 4 拉 prod Remote
- 若 Remote 已对齐 → "已同步，无需发布"，结束

记录任何 subagent 输出格式偏差、归一化问题。

- [ ] **Step 2: Phase 3 失败路径（人为构造）**

在 `packages/mcp/src/` 中临时改一个 tool 描述（不要 commit），再次运行 `/okx_mcp_release prod`。Phase 3 应失败，stdout 列出 mismatch，`.tmp/okx-mcp-release/<run-id>/report-<ts>.md` 包含 diff 表。

```bash
git checkout packages/mcp/src/  # 还原
```

- [ ] **Step 3: Phase 4 失败路径（人为构造）**

```bash
unset MCP_PROD_URL
/okx_mcp_release prod
```

应在 Phase 4 输出 "missing env var MCP_PROD_URL" 并 exit code != 0。

```bash
export MCP_PROD_URL=http://localhost:9999/nonexistent
/okx_mcp_release prod
```

应重试一次后输出 "remote fetch failed twice" 并终止。

- [ ] **Step 4: Phase 5 dry-run（按需）**

如果 Remote 真存在 delta 且要观察 Phase 5 行为，先确认 `../ai-mcp-server` 干净、`MCP_PROD_URL` 指向真实服务，再运行。任何怀疑都在执行前停下。

- [ ] **Step 5: 记录 smoke test 结果**

如发现 bug，回到对应 Task 修复并重跑。无需 commit smoke test 结果（只是验证步骤）。

---

## Task 10: 收尾 — push 到 origin

**Files:** none (git operation only)

- [ ] **Step 1: 检查 commit 序列**

```bash
git log --oneline origin/master..HEAD
```

预期看到约 7-8 个 commit（每个 Task 一个）。

- [ ] **Step 2: 跑 pre-MR checks（按 CONTRIBUTING）**

```bash
pnpm test:unit
pnpm build && pnpm typecheck
```

注：本 plan 不修改 TS 源码，应全部 pass。如失败说明意外触动了源码，回查。

- [ ] **Step 3: push**

```bash
git push origin HEAD:feat/okx-mcp-release
```

(本地分支当前是 master + 7 commits ahead；push 到一个新远端 feature 分支以走正常 review。)

- [ ] **Step 4: 开 MR**

```bash
glab mr create --title "feat: /okx_mcp_release — three-way tool alignment + ai-mcp-server release" \
  --description "$(cat docs/superpowers/specs/2026-05-07-okx-mcp-release-design.md)"
```

review 流程交给团队。

---

## Self-Review

✅ Spec coverage:
- 6-phase pipeline → Tasks 3-8 (script) + Task 6 (SKILL.md)
- File layout → Tasks 1, 2, 8
- gitignore handling → Task 1
- Cleanup of /mcp_diff → Task 1
- subagent prompts → Task 5
- ai-mcp-server reference → Task 7
- Smoke test scenarios → Task 9 (mirrors spec's 测试策略 section)

✅ No placeholders left in plan body (only Task 2's intentional `TBD` placeholder which Task 6 explicitly replaces).

✅ Type consistency: `compare(local, remote_tools)` signature consistent across Tasks 3-4 and SKILL.md Phase 4 invocation; `delta = {add, modify, remove}` shape consistent.

⚠️ Known limitation: `_diff_fields` in Task 4 compares `params` with `==`. Field-level granularity (e.g., "instId.description differs") is not extracted — only "params" as a whole is reported. If finer diffs are needed later, extend `_diff_fields` recursively.
