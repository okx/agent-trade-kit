# Development Rules

## Branch Workflow (MANDATORY)
1. **开始任何功能前**，先拉取最新 master：
   - `git checkout master && git pull origin master`
2. **从最新 master 创建分支**，分支命名：`feat/<描述>` 或 `fix/<描述>`
3. **提交 MR 前**，必须 rebase master：
   - `git fetch origin master && git rebase origin/master`
   - 解决冲突后再推送

## Testing (MANDATORY)
- 每个新功能或 bug 修复**必须包含对应的测试用例**
- 提交前运行 `pnpm test` 确保所有测试通过
- 不允许跳过测试或提交未通过测试的代码

## Module Design (MANDATORY)
- 制定方案（plan）时，**必须考虑模块的颗粒度**
- 功能拆分要合理，避免单个文件/模块承担过多职责
- 新增功能应放在合适的模块中，而非全部堆在一个文件里

## Multi-Site Support (MANDATORY)
- 方案设计时**必须考虑多站点（multiple site）支持**
- 不要硬编码单一站点的 URL、配置或逻辑，确保架构可适配不同站点

## Compatibility (MANDATORY)
- 制定方案（plan）时，**必须考虑向后兼容性**
- 修改公开 API、类型定义、配置格式时，确保不会破坏现有用户的使用
- 如果必须引入 breaking change，需要明确说明影响范围和迁移方案

## Code Quality
- 提交前运行 `pnpm lint` 确保无 lint 错误
- commit message 遵循 conventional commits 格式
