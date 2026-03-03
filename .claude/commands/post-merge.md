MR 合并后，在 master 上执行以下验证步骤。

## 1. 切到 master 并拉取最新代码

```bash
git checkout master && git pull
```

确认已切到 master，本地代码与远端一致。

## 2. 跑单元测试

```bash
pnpm test:unit
```

确认全部通过，0 fail。把结果摘要告诉用户（pass 数、suite 数）。

## 3. Build + Typecheck

```bash
pnpm build && pnpm typecheck
```

确认无报错。

## 4. 检查结果

- 如果全部通过：输出一行总结，例如：
  > master ✓ Tests 162/162 ✓ Build ✓ — 一切正常

- 如果有失败：立即报告失败的测试名称和错误信息，不要继续后续步骤。
