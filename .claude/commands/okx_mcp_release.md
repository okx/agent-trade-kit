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
