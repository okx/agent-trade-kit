# `/okx_mcp_release` Design

**Date:** 2026-05-07
**Owner:** @gong.chen
**Status:** Draft

## 背景

现有 `/mcp_diff` 命令（`~/.claude/commands/mcp_diff.md` + `ai-mcp-server/scripts/mcp_diff.py`）用于比对 CLI / Local MCP / Remote MCP 三方工具集差异，但脚本累积较多 bug，且不覆盖发布闭环。

需要重建为 `/okx_mcp_release`，覆盖：扫描 → 三方对齐 → 自动开发提交 → MR draft，整条链路。

## 目标

1. 严格守护 source of truth：CLI（`packages/cli` + `packages/core/tools`）≡ Local MCP（`packages/mcp`）。任何不一致直接阻塞流程
2. 用 Local MCP 作 baseline 同步 Remote MCP，自动产出 ai-mcp-server MR（draft 状态供人审）
3. 每次成功对齐后留 `docs/tools.json` snapshot 作审计基线

## 非目标

- 不替代 CLI / Local MCP 的开发与 review 流程
- 不接管 ai-mcp-server 的 MR merge 决策（运维团队仍走人工 review）
- 不做运行时正确性测试（功能/集成测试由各自仓库 CI 负责）

## 用法

```
/okx_mcp_release pre    # 比对并发布到 pre
/okx_mcp_release prod   # 比对并发布到 prod
```

无参数时提示用户选择 `pre` 或 `prod`。

## 文件布局

```
okx-trade-mcp/
├── .claude/
│   ├── commands/
│   │   └── okx_mcp_release.md            # slash command 薄壳，内部调用 skill
│   └── skills/
│       └── okx-mcp-release/
│           ├── SKILL.md                  # 编排主体
│           ├── subagent-prompt.md        # 模块扫描 prompt 模板（CLI / Local 两版）
│           ├── scripts/
│           │   └── mcp_release.py        # Remote tools/list 拉取 + 比对引擎
│           └── references/
│               └── ai-mcp-server-workflow.md  # ai-mcp-server CLAUDE.md 的本地化引用
└── docs/
    └── tools.json                        # snapshot 产物，commit 进 git
```

**清理：** 删除 `~/.claude/commands/mcp_diff.md` 与 `ai-mcp-server/scripts/mcp_diff.py`。

## 核心数据结构

### `docs/tools.json`

每次 Phase 3 通过后由脚本覆写，commit 进 git。**snapshot，无白名单字段。**

```json
{
  "generatedAt": "2026-05-07T10:00:00Z",
  "gitCommit": "abc123def...",
  "modules": {
    "spot": {
      "tools": [
        {
          "name": "spot_place_order",
          "description": "Place a spot order on OKX...",
          "params": {
            "instId":   { "type": "string", "required": true,  "description": "..." },
            "tdMode":   { "type": "string", "required": true,  "enum": ["cash","cross","isolated"] },
            "side":     { "type": "string", "required": true,  "enum": ["buy","sell"] },
            "ordType":  { "type": "string", "required": true,  "enum": ["market","limit","..."] },
            "sz":       { "type": "string", "required": true }
          },
          "isWrite": true,
          "source": ["cli", "mcp"]
        }
      ]
    },
    "swap": { "tools": [...] }
  }
}
```

字段说明：
- `generatedAt`: ISO 8601 时间戳
- `gitCommit`: 当前 `origin/master` HEAD commit hash（诊断用）
- `modules.<id>.tools[]`: 该模块的工具列表
  - `name`: 工具名（snake_case，与 MCP tool 注册名一致）
  - `description`: 工具描述（与 ToolSpec.description 一致）
  - `params`: 摊平的参数 schema（zod schema 归一化为 `{ type, required, enum?, description?, default? }`）
  - `isWrite`: 资金变动操作 = `true`
  - `source`: `["cli","mcp"]` 表示 CLI 与 Local MCP 都暴露；Phase 4 后会出现 `["cli","mcp","remote"]`（仅在 stdout/报告中临时使用，不写回 tools.json）

### diff 报告 `.tmp/okx-mcp-release/<run-id>/report-<ts>.md`

按 phase 分章节，含：
- 不一致工具列表
- 字段级 diff（描述/参数差异原文对照）
- 推荐处理动作（add / modify / remove）

## 流水线

### Phase 0 — 准备

- 校验当前在 `okx-trade-mcp` repo 根目录
- `git fetch origin master`
- 在 `.tmp/okx-mcp-release/<run-id>/` 创建工作目录（`<run-id>` = ISO 时间戳）
- `.tmp/` 加入 `.gitignore`（若未有）

### Phase 1 — CLI 扫描（17 模块并行）

按 `docs/module-registry.md` 列出的 17 个 approved 模块，每个派一个 subagent：

输入：
- `packages/cli/src/cli-registry.ts` 中该模块的 `CliModuleEntry`
- `packages/core/src/tools/<module>.ts`（及其 zod schema 文件）

输出：
- `.tmp/okx-mcp-release/<run-id>/cli/<module>.json`，符合 tools.json `modules.<id>` 子结构

subagent prompt 模板见 `subagent-prompt.md`。失败重试一次，仍失败则终止流水线。

### Phase 2 — Local MCP 扫描（17 模块并行）

输入：
- `packages/mcp/src/` 中该模块注册的 tool（含 composite/fan-out 改写）

输出：
- `.tmp/okx-mcp-release/<run-id>/mcp/<module>.json`

失败重试一次。

### Phase 3 — CLI ≡ Local 严格比对

逐工具、逐字段（name + description + params + isWrite）严格相等比对。

**原则上 1:1 对齐**，不设白名单。如发现合理的 composite/fan-out 差异，本设计先不接纳——属于代码层面要修正的问题（在 CLI 侧补对应命令）或后续扩展（增加白名单字段）。

- 一致 → 合并 17 个 `cli/<module>.json` 为 `docs/tools.json`，附 `generatedAt` + `gitCommit`
- 不一致 → 写报告 + stdout 摘要，**终止**

### Phase 4 — Remote MCP 拉取 + 比对

由 `mcp_release.py` 执行：
- 根据 `pre` / `prod` 选择 endpoint（环境变量 `MCP_PRE_URL` / `MCP_PROD_URL`，缺失则提示用户）
- 通过 MCP `tools/list` JSON-RPC 实时拉取（不读缓存）
- 与 `docs/tools.json` 全字段比对

输出：
- 一致 → "已同步，无需发布"，结束
- 不一致 → delta 报告（`add` / `modify` / `remove` 三类），写文件 + stdout 摘要，进 Phase 5
- 拉取失败重试一次，仍失败则终止

### Phase 5 — ai-mcp-server 端到端开发（auto，draft MR）

切到 `../ai-mcp-server`，严格按其 `CLAUDE.md` 执行：

1. `git checkout master && git pull && git checkout -b feat/sync-tools-<env>-<YYYYMMDD>`
2. 按 delta 逐 tool 处理：
   - 分类：`gateway` / `custom` / `pending_custom`
   - 更新 `docs/trading_oauth_tools.json`（同 commit）
   - **gateway**：跑 `python3 scripts/gen_manual_sql.py` 生成 6 个 region×env SQL；新建 Flyway migration（版本格式 `V{YYYY}.{MM}.{DD}.{HHMM}__sync_<tool>.sql`）
   - **custom**：生成 Java `@McpTool` handler 骨架 + unit test 占位（标 `// TODO` 让人补完）
   - 添加 `mcp_workspace_tool` migration（INSERT IGNORE）
3. `mvn clean package -DskipTests`
4. `mvn test`
5. `git commit`（按 ai-mcp-server 提交规范）
6. `glab mr create --draft`，MR description **内嵌 Phase 4 完整 diff 报告**

任一步骤失败 → 不删分支、不强制清理，stdout 报错位置，提示用户介入。

## 编排：subagent + Python 各司其职

| 阶段 | 谁执行 | 为何 |
|------|--------|------|
| Phase 1/2 扫描 | Claude subagent | TS + zod schema 用 AST 静态解析复杂；subagent 直读源码归一化更鲁棒 |
| Phase 3 比对 | Claude（orchestrator） | 纯 JSON 比对，主流程逻辑直接做 |
| Phase 4 Remote 拉取 + 比对 | Python 脚本 | MCP `tools/list` JSON-RPC 调用 + 跨平台执行，脚本独立可调试 |
| Phase 5 ai-mcp-server 提交 | Claude（按 ai-mcp-server CLAUDE.md） | 涉及代码生成、SQL 生成、Java handler 骨架，LLM 主导更合适 |

## 失败与重试策略

- 单个 subagent / Remote 拉取失败 → **重试一次**后再终止（避免偶发抖动；不无限重试）
- Phase 3/4 不一致 → 直接终止，输出报告，由人决策
- Phase 5 失败 → 不回滚、不删分支，停在错误位

## 报告产物

- `.tmp/okx-mcp-release/<run-id>/report-<ts>.md`：完整 diff（保留审计）
- stdout：摘要（变更工具数量 + 关键差异 highlights）
- ai-mcp-server MR description：内嵌完整报告

## 测试策略

skill 自身的测试场景（人工跑通即可，不写自动化测试）：
1. **happy path**：CLI/Local/Remote 三方一致 → 输出"已同步" + 不写 tools.json（可选：仅时间戳变化时不重写）
2. **CLI vs Local 差异**：人为在 `packages/mcp` 改一个工具描述 → 应在 Phase 3 终止，报告指出差异
3. **Local vs Remote 差异**：CLI/Local 一致但 Remote 落后 → 应进入 Phase 5，draft MR 创建
4. **Remote 不可达**：手动给错 `MCP_PRE_URL` → Phase 4 重试一次后终止

## 已知局限

- composite/fan-out 差异目前**不允许**（强制 CLI ≡ Local）。若后续真出现合理需求，扩展为 `tools.json` 加 `mcpOnly` / `cliOnly` 白名单字段
- Phase 5 自动生成的 Java handler 仅骨架，需人工补业务逻辑（draft MR 让人接手）
- 不处理 ai-mcp-server 端「废弃 tool 删除」的反向同步（删工具走人工流程更安全）

## 依赖

- `glab` CLI 已配置（`$DACS` 作为 home，token 就绪）
- `MCP_PRE_URL` / `MCP_PROD_URL` 环境变量（缺失时提示用户）
- `python3` 可用
- ai-mcp-server 仓库与 okx-trade-mcp 在同一 workspace 父目录下（`../ai-mcp-server`）
