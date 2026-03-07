# Idea Agent v2

自动处理 GitLab `idea` issues：webhook 事件驱动，两个 human-in-the-loop checkpoint。

## 状态机

```
unevaluated
    ↓ triage()  [Sonnet — 判断信息是否充足]
    │
    ├── needs_clarification
    │       ↓ 贴 ❓ 问题到 issue，等人补充
    │       ↓ 人回复后 → unevaluated（重新 triage）
    │
    └── planning  [Opus — 制定实现方案]
            ↓ 贴 📋 方案到 issue
            ↓ ← checkpoint 1：人回复 ok/approve/同意…
        implementing  [Sonnet + --dangerously-skip-permissions]
            ↓ 创建 worktree → 实现 → push → 提 MR
            ↓ ← checkpoint 2：正常 code review / merge
        done  ← MR merge webhook → 清理 worktree & 本地分支
```

状态完全从 issue 评论派生，本地状态文件只存运行时信息（pid、worktree 路径）。

## 文件结构

```
scripts/idea-agent/
├── webhook.py   # HTTP server，接收 GitLab webhook 事件
├── agent.py     # 状态机逻辑，triage / process_issue
├── worker.py    # worktree 管理，run_planning / run_implementing
├── state.py     # 本地运行时状态（~/.okx/idea-agent-state.json）
├── gitlab.py    # glab CLI wrapper
└── README.md
```

## 依赖

- Python 3.11+
- `glab` CLI（`brew install glab`，`glab auth login --hostname gitlab.okg.com`）
- `claude` CLI（已登录，claude-opus-4-6 和 claude-sonnet-4-6 可用）

## 模型分配

| 阶段 | 模型 | 说明 |
|------|------|------|
| triage | claude-sonnet-4-6 | 判断信息是否充足，快速便宜 |
| planning | claude-opus-4-6 | 制定详细方案，最需要深度思考 |
| implementing | claude-sonnet-4-6 | 按 plan 执行，速度优先 |

## 启动 Webhook Server

```bash
# 基础启动
python3 scripts/idea-agent/webhook.py

# 指定端口
python3 scripts/idea-agent/webhook.py --port 9090

# 带 secret（推荐）
WEBHOOK_SECRET=mysecret python3 scripts/idea-agent/webhook.py
```

### GitLab 配置

项目 → Settings → Webhooks：
- URL: `http://<your-machine>:8080`
- Secret Token: 与 `WEBHOOK_SECRET` 一致
- Trigger: ✅ Comments，✅ Merge request events，✅ Issue events

## 手动触发

```bash
# 处理所有 open idea issues
python3 scripts/idea-agent/agent.py

# 只处理指定 issue
python3 scripts/idea-agent/agent.py --issue 8

# dry-run（不发评论，不改文件）
python3 scripts/idea-agent/agent.py --dry-run

# 强制指定阶段
python3 scripts/idea-agent/agent.py --issue 8 --mode unevaluated   # 重新 triage
python3 scripts/idea-agent/agent.py --issue 8 --mode approved       # 直接 implement

# 手动清理 merged branch
python3 scripts/idea-agent/agent.py --cleanup feat/my-feature
```

## 暂停 / 恢复

```bash
python3 scripts/idea-agent/agent.py --stop
python3 scripts/idea-agent/agent.py --start
```

## 限频

- **per-issue debounce**：同一 issue 在 30 秒内多次触发，只处理第一次
- **单 worker 限制**：implement 阶段同时只跑 1 个任务，busy 时跳过（不排队）
- **bot 自身评论**：webhook 自动忽略以 `💬 Claude` 开头的 note，避免循环触发

## 本地状态文件

| 文件 | 说明 |
|------|------|
| `~/.okx/idea-agent-state.json` | 运行时状态（worker pid / worktree） |
| `~/.okx/idea-agent.disabled` | 暂停标志 |
| `.worktrees/` | git worktrees（implement 结束后自动清理） |

## 多 Worker 扩展（预留）

当前为单 worker。扩展步骤：
1. `state.py`: `worker: WorkerTask | None` → `workers: list[WorkerTask]`
2. `agent.py`: `is_busy()` 改为检查 `len(workers) < MAX_WORKERS`
3. `worker.py`: `run_implementing()` 用 `threading.Thread` 并发启动
