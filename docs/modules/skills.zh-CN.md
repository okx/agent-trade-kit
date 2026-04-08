[English](./skills.md) | [中文](./skills.zh-CN.md)

# Skills Marketplace 模块

`skills` 模块提供从 OKX Skills Marketplace 浏览、搜索和下载 AI 交易技能的工具。

> **第三方内容声明：** OKX Skills Marketplace 上的技能由独立第三方开发者创建，OKX 不对其内容进行审核或背书。安装前请务必查看技能的 SKILL.md。

## 模块 ID

`skills` — 默认启用。

## MCP Tools

| Tool | 说明 | 读/写 |
|------|------|-------|
| `skills_get_categories` | 获取所有可用的技能分类 | 读 |
| `skills_search` | 按关键词或分类搜索技能，返回 `totalPage` 用于分页 | 读 |
| `skills_download` | 下载技能包到本地目录。支持 `format` 参数：`"skill"`（默认）或 `"zip"`。 | 写 |

## CLI 命令

```bash
okx skill search <keyword>          # 搜索技能市场
okx skill categories                # 列出分类
okx skill add <name>                # 下载 + 通过 npx skills add 安装
okx skill download <name> [--dir] [--format zip|skill]  # 仅下载（默认：zip）
okx skill remove <name>             # 卸载技能
okx skill check <name>              # 检查更新
okx skill list                      # 列出已安装技能
```

## 认证

所有 skills API 端点需要 OKX 标准鉴权（OK-ACCESS-KEY / SIGN / TIMESTAMP / PASSPHRASE）。

## `okx skill add` 工作流程

1. 从 marketplace API 下载技能 zip
2. 解压到临时目录
3. 读取 `_meta.json`（后端注入）获取 name、version、title、description
4. 校验 `SKILL.md` 存在
5. 执行 `npx skills add <dir> -y` 安装到所有检测到的 agent
6. 更新本地 registry（`~/.okx/skills/registry.json`）
7. 清理临时目录

## 本地 Registry

已安装技能记录在 `~/.okx/skills/registry.json`。该文件仅记录版本元数据 — 实际安装路径由 `npx skills add` 管理。
