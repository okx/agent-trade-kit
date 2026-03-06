# Development Rules

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
