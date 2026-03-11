在提 MR 之前，按顺序完成以下 checklist。每完成一项告知用户。

## 1. CHANGELOG

打开 `CHANGELOG.md`，在 `[Unreleased]` 区块下补充本次改动：
- 新增工具 → `### Added`
- 修改已有行为 → `### Changed`
- Bug 修复 → `### Fixed`

格式参考已有条目，工具名用 backtick，附一句话说明用途。

## 2. README

检查以下内容是否需要更新：
- 工具总数（Features 表格里的数字）
- 各模块工具数（Modules 表格）
- 模块说明文字（新工具的功能描述）

如果数字或描述对不上，直接更新。

## 3. 跑测试

```bash
pnpm test:unit
```

确认全部通过，0 fail。把结果摘要告诉用户（pass 数、fail 数）。

## 4. Build + Typecheck

```bash
pnpm build && pnpm typecheck
```

确认无报错。

完成后输出一行总结，例如：
> Changelog ✓ README ✓ Tests 162/162 ✓ Build ✓ — 可以提 MR 了
