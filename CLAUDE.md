# Development Rules

## General Rules

Always respond in Chinese (中文) unless explicitly asked otherwise. Never use Korean.

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for branch workflow, testing, commit conventions, and code style.

## Module Design (MANDATORY)
- 制定方案（plan）时，**必须考虑模块的颗粒度**
- 功能拆分要合理，避免单个文件/模块承担过多职责
- 新增功能应放在合适的模块中，而非全部堆在一个文件里
- **新增 MCP 模块/工具必须遵循 [MCP Design Guideline](docs/mcp-design-guideline.md)**
- **新模块必须在 [Module Registry](docs/module-registry.md) 中注册且 approved 才能合入**
- MCP tool 设计规范、token 预算、命名规则、reviewer checklist 见 guideline

## Multi-Site Support (MANDATORY)
- 方案设计时**必须考虑多站点（multiple site）支持**
- 不要硬编码单一站点的 URL、配置或逻辑，确保架构可适配不同站点

## Compatibility (MANDATORY)
- 制定方案（plan）时，**必须考虑向后兼容性**
- 修改公开 API、类型定义、配置格式时，确保不会破坏现有用户的使用
- 如果必须引入 breaking change，需要明确说明影响范围和迁移方案

## Documentation (MANDATORY)
- 所有面向用户的文档必须提供双语版本：`.md`（英文）+ `.zh-CN.md`（中文）
- 每个双语文档顶部加语言切换链接：`[English](./FILE.md) | [中文](./FILE.zh-CN.md)`
- 新增功能时**必须同步更新**相关文档（README、CHANGELOG 等）
- CHANGELOG 遵循 [Keep a Changelog](https://keepachangelog.com/) 格式
- `docs/` 目录下的技术设计文档为内部文档，不要求双语
- 文档间使用相对链接交叉引用，避免内容重复

## Git Branch Rules (MANDATORY)

- **所有新分支必须基于 `master` 创建**，不得基于其他 feature 分支
- 基于错误的分支会把无关的未合并提交带入，污染工作区和测试结果
- 创建分支前先确认：`git checkout master && git pull && git checkout -b feat/xxx`

## GitLab / Git Operations

When working with GitLab, use `$DACS` as the home path for glab config. Ensure glab CLI token is configured before attempting any GitLab operations (MR comments, issue viewing).

## Release Bot（发布机器人）

打完 tag 后，**必须**调用飞书（Lark）机器人发送发布通知，关键词为「发布」。

- **Webhook URL**: `https://open.larksuite.com/open-apis/bot/v2/hook/b9beca3e-ec61-40fa-9aed-e8927b9de08a`

消息示例（POST JSON，`msg_type: text`）：

```bash
curl -X POST 'https://open.larksuite.com/open-apis/bot/v2/hook/b9beca3e-ec61-40fa-9aed-e8927b9de08a' \
  -H 'Content-Type: application/json' \
  -d '{
    "msg_type": "text",
    "content": {
      "text": "发布 okx-trade-mcp v<版本号>\n时间：<发布时间>\n改动：\n<CHANGELOG 中对应版本的改动摘要>"
    }
  }'
```

消息必须包含：
1. **版本号**（与 tag 一致）
2. **发布时间**（ISO 8601 或可读格式）
3. **改动摘要**（从 CHANGELOG.md 中提取对应版本的 Added / Fixed / Changed 等条目）

## Pre-MR Checklist

- Update CHANGELOG.md (if user-facing change)
- Update README feature/module counts (if applicable)
- Run `pnpm test:unit` — all tests must pass
- Run `pnpm build && pnpm typecheck` — no errors

## Post-merge Verification

- Checkout master, pull latest
- Run full test suite, build, typecheck
- Report pass/fail summary

## CLI / MCP Feature Parity

- `packages/mcp` and `packages/cli` must expose the same trading capabilities. Any feature available via MCP tool must also be available as a CLI command, and vice versa.
- When adding or modifying an MCP tool, the corresponding CLI command must be created or updated in the same MR (and vice versa).
- Shared business logic should live in `packages/core` — avoid duplicating logic between packages.

## MCP Tool Design Principles

以下原则适用于新增模块/工具的设计阶段。完整规范和示例见 `docs/mcp-design-guideline.md`。

1. **MCP 优先** — AI agent 可能需要调用的功能必须有 MCP tool，CLI-only 仅限管理操作。
2. **Description 面向意图** — 回答"做什么、什么场景用"，不写 API 路径/参数约束/错误码。
3. **参数扁平化** — Tool 参数只用 string/number/boolean，嵌套 JSON 在 handler 内部组装。
4. **分层暴露** — 每模块 5-8 个 MCP tool，全量 token 预算 ≤ 25,000。
5. **新模块必须有 workflow 引导** — 在 agent-skills 仓库中有对应的 `workflows.md`。
6. **命名格式** — `{module}_{action}_{object?}`，全小写 snake_case。查询用 `get`。

## Reviewer MCP Checklist

Review MCP 相关 MR 时按以下顺序检查（完整版见 `docs/mcp-design-guideline.md` Section 6）：

1. **Registry**: 新模块已在 `docs/module-registry.md` 注册且 approved
2. **Naming**: tool name 符合 `{module}_{action}` 格式
3. **Description**: 面向意图，无 API 细节
4. **Params**: 全部扁平化，金额/价格用 string
5. **isWrite**: 资金变动 = true
6. **Token**: 报告变化前后的 tool 数量和 token 数量，确认未超 25,000 预算
7. **Parity**: MCP tool ↔ CLI command 同步
8. **Workflow**: agent-skills 中有 workflows.md
9. **Tests**: CLI 参数路由测试存在

## CLI Parameter Routing Tests

- CLI 路由层新增或修改命令时，必须有对应的参数传递测试。
- 测试用 spy ToolRunner 捕获实际传入参数，断言关键参数来自 `v.xxx`（named flag），而非 `rest[N]`（positional arg）。
- 原因：2026-03-06 重构时 instId 误用了 `rest[0]`，导致 `--instId` flag 不生效 11 天（issue #78）。

## CLI ↔ Skills Sync

- CLI 命令定义是 agent-hub Skills 的数据来源。新增或修改 CLI 命令后，必须在同一 MR 中同步更新 Skills 描述。

## Stable Release: Skill Version Sync (MANDATORY)

发布稳定版（non-prerelease，如 `1.2.8`）时，**必须**将所有 skill 的 `metadata.version` 同步更新为新的稳定版本号：

```
skills/okx-cex-trade/SKILL.md
skills/okx-cex-market/SKILL.md
skills/okx-cex-earn/SKILL.md
skills/okx-cex-bot/SKILL.md
skills/okx-cex-portfolio/SKILL.md
skills/okx-cex-skill-mp/SKILL.md
```

每个文件的 frontmatter 中均有 `metadata.version` 字段，在版本 bump commit 中一并更新。所有 skill 统一使用与发布包相同的版本号。

**Beta 版不更新** skill 版本号，仅稳定版发布时同步。

## Code Style

- pnpm monorepo: packages/core (SDK), packages/mcp (MCP server), packages/cli (CLI tool)
- tsup for bundling, node:test for testing, zod for validation
- Prefer explicit types over `any`
