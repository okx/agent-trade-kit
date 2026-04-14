批量修复 GitLab Issue。接收参数：issue 编号列表（如 `152 153 154 155`）。

对每个 issue，按以下流程逐个完成。每完成一个 issue 输出进度摘要后再开始下一个。

---

## Phase 0: 获取 Issue 详情

先从项目根目录 `.env` 文件读取 `GITLAB_PERSONAL_ACCESS_TOKEN`（格式为 `export GITLAB_PERSONAL_ACCESS_TOKEN="glpat-xxx"`）。

通过 GitLab API 获取 issue 内容：

```bash
# 从 .env 读取 token
GITLAB_TOKEN=$(grep GITLAB_PERSONAL_ACCESS_TOKEN .env | sed 's/.*="\(.*\)"/\1/')
curl -s --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "https://gitlab.okg.com/api/v4/projects/12947/issues/<IID>"
```

提取标题、描述、根因、修复建议。将所有 issue 信息汇总成一张表格展示给用户。

---

## Phase 1: 代码探索 & 方案设计

针对每个 issue：

1. **定位相关代码**：根据 issue 描述，用 Grep/Glob/Read 定位涉及的 ToolSpec、CLI 命令、handler、测试文件。
2. **理解现状**：读取当前实现，对比 issue 所述的问题，确认是否已修复或仍存在。
3. **设计修复方案**：列出具体要改的文件和改动内容，确保：
   - 符合 `docs/mcp-design-guideline.md` 规范
   - 考虑向后兼容性
   - MCP tool 和 CLI 命令同步更新（feature parity）
   - 有对应的测试覆盖

如果某个 issue 在当前代码中已修复，告知用户并在 issue 中评论说明，跳过该 issue。

---

## Phase 2: 逐个实施修复

对每个需要修复的 issue，严格按以下子步骤执行：

### 2a. 创建分支

```bash
cd <项目根目录>
git checkout master && git pull origin master
git checkout -b fix/issue-<IID>-<简短描述>
```

**必须从 master 创建**，不得基于其他 feature 分支。

### 2b. 实施代码修改

按方案修改代码。注意：
- 仅修改必要的文件，不做额外重构
- 如修改了 MCP tool，同步更新 CLI 命令和 skills 文档
- 如修改了 tool description，检查 token 预算影响
- 金额/价格用 string 类型，参数扁平化

### 2c. 构建验证

```bash
pnpm build && pnpm typecheck && pnpm test:unit
```

三项必须全部通过。如有失败，修复后重新验证。

### 2d. 深度 Review

运行 `git diff` 查看完整变更，逐项检查：
- [ ] 变更是否完整覆盖了 issue 描述的问题
- [ ] 是否引入了新 bug 或 regression
- [ ] 类型安全：无 `any`，使用 `unknown` + narrowing
- [ ] 错误处理：使用 `OkxMcpError` 层级
- [ ] MCP ↔ CLI 对称性
- [ ] 测试覆盖新增逻辑

如发现问题，修复后重新执行 2c + 2d。

### 2e. 提交

```bash
git add <具体文件>
git commit -m "$(cat <<'EOF'
fix(<scope>): <一句话描述> #<IID>

<详细说明修改内容和原因>

Closes #<IID>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 2f. 推送 & 创建 MR

```bash
git push -u origin fix/issue-<IID>-<描述>
```

通过 GitLab API 创建 MR（token 从 `.env` 读取）：

```bash
GITLAB_TOKEN=$(grep GITLAB_PERSONAL_ACCESS_TOKEN .env | sed 's/.*="\(.*\)"/\1/')
curl -s --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --header "Content-Type: application/json" \
  -X POST "https://gitlab.okg.com/api/v4/projects/12947/merge_requests" \
  -d '{ "source_branch": "...", "target_branch": "master", "title": "...", "description": "..." }'
```

MR description 格式：
```
## Summary
- <修改摘要，bullet points>

Closes #<IID>

## Test plan
- [x] pnpm build — 通过
- [x] pnpm typecheck — 通过
- [x] pnpm test:unit — N tests 通过
```

### 2g. 回写 Issue

通过 GitLab API 在 issue 中评论 MR 链接和修复摘要：

```bash
GITLAB_TOKEN=$(grep GITLAB_PERSONAL_ACCESS_TOKEN .env | sed 's/.*="\(.*\)"/\1/')
curl -s --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --header "Content-Type: application/json" \
  -X POST "https://gitlab.okg.com/api/v4/projects/12947/issues/<IID>/notes" \
  -d '{ "body": "MR 已创建: !<MR_IID> (<MR_URL>)\n\n修复内容:\n..." }'
```

---

## Phase 3: 完成报告

所有 issue 处理完毕后，输出汇总表格：

| Issue | 标题 | MR | 状态 |
|-------|------|-----|------|
| #xxx  | ...  | !yyy | 已提交 / 跳过 |

列出每个 MR 的关键修改点（1-2 行）。
