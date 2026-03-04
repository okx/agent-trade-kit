# Idea Agent

自动处理 GitLab `idea` issues：评估 → 等待批准 → 自主实现 → 提 MR。

## 状态机

```
open + 无 Claude 评论
        ↓ evaluate()
open + 最新评论是 💬 Claude（计划）
        ↓ 等人回复（同意 / go / ok / lgtm / approve / 开始 / 执行…）
open + Claude 评论之后有人类回复含批准关键词
        ↓ implement()
MR 提出 → issue 关闭
```

状态完全依赖 issue 评论本身，无外部状态文件。

## 依赖

- Python 3.11+
- `glab` CLI（`brew install glab`，`glab auth login --hostname gitlab.okg.com`）
- `claude` CLI（已登录）

## 手动运行

```bash
# 正常跑一次（处理所有 idea issues）
python3 scripts/idea-agent/agent.py

# dry-run：只打印，不真正发评论
python3 scripts/idea-agent/agent.py --dry-run

# 只处理指定 issue（评估模式）
python3 scripts/idea-agent/agent.py --issue 8 --mode evaluate

# 只处理指定 issue（实现模式）
python3 scripts/idea-agent/agent.py --issue 8 --mode implement

# 查看运行日志
tail -f ~/.okx/idea-agent.log
```

## 暂停 / 恢复

```bash
# 暂停
python3 scripts/idea-agent/agent.py --stop
# 或
touch ~/.okx/idea-agent.disabled

# 恢复
python3 scripts/idea-agent/agent.py --start
# 或
rm ~/.okx/idea-agent.disabled
```

## cron 配置

工作时间（周一至周五 9:00–18:00）每小时运行一次：

```cron
0 9-18 * * 1-5 GLAB_CONFIG_DIR=/Users/fanqi/meili/jay.fan_dacs_at_okg.com/113/.config/glab-cli /usr/bin/python3 /Users/fanqi/meili/jay.fan_dacs_at_okg.com/113/Documents/MyApp/agent-tradekit/scripts/idea-agent/agent.py >> ~/.okx/idea-agent.log 2>&1
```

添加到 crontab：

```bash
crontab -e
```

确保 `~/.okx/` 目录存在：

```bash
mkdir -p ~/.okx
```

## 输出文件

| 文件 | 说明 |
|------|------|
| `~/.okx/idea-agent.log` | cron 运行日志（stdout + stderr） |
| `scripts/idea-agent/work-log.md` | 运行摘要（gitignored） |
| `~/.okx/idea-agent.lock` | 并发锁（运行结束自动删除） |
| `~/.okx/idea-agent.disabled` | 暂停标志（手动管理） |

## 工作原理

### evaluate()

调用 `claude -p <prompt>` 分析 issue，生成带 `💬 Claude` 前缀的评论，贴到 issue 上。
每次运行最多评估 1 个新 issue，避免刷屏。

### implement()

检测到人类在 Claude 计划评论之后回复了批准关键词，自动：

1. 贴评论 `🔵 开始实现，分支：feat/xxx`
2. 调用 `claude --dangerously-skip-permissions -p <prompt>` 自主完成：
   - 创建分支
   - 实现功能
   - 跑测试（`pnpm test:unit`）
   - 执行 `/ship` checklist
   - 用 `glab mr create` 提 MR
   - 关闭 issue
