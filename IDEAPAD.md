[English](IDEAPAD.md) | [中文](IDEAPAD.zh-CN.md)

# Ideapad — 想法收集与处理流程

## 什么是 Ideapad？

Ideapad 是团队的轻量 backlog 系统，基于 GitLab Issues 实现。任何人都可以随手记录一个想法（一行即可），由 Claude 评估可行性并推进实现。

---

## 如何提交一个 Idea

1. 在本 repo 创建一个新 Issue
2. 打上 `idea` label
3. 标题写清楚想法，描述可以很简短

**示例标题：**
- `支持查询资金费率历史`
- `CLI 增加 --json 输出格式`
- `批量撤单支持过滤 instType`

描述里可以补充背景、参考 API、预期行为等，信息越多 Claude 越容易直接开始做。

---

## 处理流程

```
提交 Issue (label: idea)
       ↓
Claude 每半天扫描 open issues，评估可行性
       ↓
    ┌──────────────────────────────┐
    │ ✅ 够做                      │ ❌ 需要补充
    │ comment: 可以开始 + 实现路径  │ comment: 列出缺失信息
    └──────────────────────────────┘
       ↓ 确认后开始
Claude 开始实现
  → comment: 🔵 开始实现，分支：feat/xxx
       ↓
MR 创建 & 合并
  → comment: ✅ 完成，MR: [链接]
  → Issue 关闭
```

---

## Claude 的评估标准

| 状态 | 条件 |
|------|------|
| ✅ 可以开始 | 有明确 OKX API 端点，或能从现有代码推断实现路径 |
| ❌ 需要补充 | 缺少必要信息：instType 范围、参数结构、行为边界等 |

每次会话 Claude 最多评估 1 个新 issue，避免刷屏。

---

## Comment 格式

**可以开始：**
```
💬 Claude (YYYY-MM-DD): [评估结论]
✅ 可以开始 — [简要说明实现路径]
```

**需要补充：**
```
💬 Claude (YYYY-MM-DD): [评估结论]
❌ 需要补充: [缺失信息列表]
```

---

## 触发实现

Claude 每半天自动扫描所有 open idea issues，对评估为 ✅ 的 issue 会在 comment 里说明可以开始。

确认实现可以直接说：
- `"做这个"`
- `"做 #3"`
- `"先做评估过的那个"`

---

## 已知不做的范围

以下方向不在 ideapad 收录范围内：
- Asset 充提币（链上操作风险高）
- Convert 一键兑换
