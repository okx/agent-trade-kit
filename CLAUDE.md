# Development Rules

## General Rules

Always respond in Chinese (中文) unless explicitly asked otherwise. Never use Korean.

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for branch workflow, testing, commit conventions, and code style.

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

## Documentation (MANDATORY)
- 所有面向用户的文档必须提供双语版本：`.md`（英文）+ `.zh-CN.md`（中文）
- 每个双语文档顶部加语言切换链接：`[English](./FILE.md) | [中文](./FILE.zh-CN.md)`
- 新增功能时**必须同步更新**相关文档（README、CHANGELOG 等）
- CHANGELOG 遵循 [Keep a Changelog](https://keepachangelog.com/) 格式
- `docs/` 目录下的技术设计文档为内部文档，不要求双语
- 文档间使用相对链接交叉引用，避免内容重复

## Testing Standards (MANDATORY)

核心原则：**用用户的方式测，不用开发者的捷径测。**

### 三层测试要求

所有涉及用户可感知行为的变更，必须逐层验证：

| 层次 | 验证目标 | 必须 |
|------|---------|------|
| 单元测试 | 函数逻辑正确 | ✅ |
| 集成测试 | 组件协作正确 | ✅ |
| 端到端测试 | 用户实际体验与预期一致 | ✅ |

### 强制规则

1. **用户视角验证**：描述用户的操作路径，然后完全按该路径执行验证。禁止用开发者捷径（如 `node script.js`）代替用户操作（如 `npm install`、`npx`）。
2. **环境记录**：测试时必须记录关键运行时版本（node/npm 等），确保测试环境与用户目标环境一致。
3. **运行时行为查验**：使用 lifecycle hook、stdout/stderr、环境变量等运行时特性时，必须查证目标运行时版本的实际行为。
4. **MR Test Plan 格式**：
   ```
   ## Test plan
   ### 功能验证（开发视角）
   - [ ] 单元/集成测试项

   ### 用户体验验证（用户视角）
   - [ ] 用户操作路径 → 预期结果
   - [ ] 测试环境: node vX.Y.Z, npm vX.Y.Z
   ```
5. **失败回溯**：测试遗漏导致线上问题时，须在 MR 中记录根因分析并更新本规范。

### 典型反例（禁止）
- ❌ 用 `node scripts/postinstall.js` 验证 npm postinstall 效果（npm v7+ 默认静默 lifecycle 输出）
- ❌ 不记录运行时版本就声称"测试通过"
- ❌ Test Plan 只有开发视角，缺少用户视角验证项

## GitLab / Git Operations

When working with GitLab, use `$DACS` as the home path for glab config. Ensure glab CLI token is configured before attempting any GitLab operations (MR comments, issue viewing).
