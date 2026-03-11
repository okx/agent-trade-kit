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

## 4. 用户视角验证

如果本次改动涉及**用户可感知的行为**（安装输出、CLI 交互、错误提示等），必须：

1. 描述用户的实际操作路径（如 `npm install -g`、`npx okx`）
2. 按该路径执行端到端验证，**禁止用开发者捷径替代**
3. 记录测试环境版本：`node -v && npm -v`
4. 将验证结果写入 MR Test Plan 的「用户体验验证」部分

如果不涉及用户可感知行为，跳过此步并说明原因。

## 5. Build + Typecheck

```bash
pnpm build && pnpm typecheck
```

确认无报错。

完成后输出一行总结，例如：
> Changelog ✓ README ✓ Tests 162/162 ✓ E2E ✓ Build ✓ — 可以提 MR 了
