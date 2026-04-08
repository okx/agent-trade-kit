# agent-trade-kit — DoH 代理 v2（缓存优先 + 懒加载）

> 内部技术文档，不同步到外部仓库。
> 飞书原文：https://okg-block.sg.larksuite.com/wiki/ZLoawXBovix1TPk2P3BlPuHigOg

## 目标

- 境内用户 npm install 后，REST API 请求自动通过代理节点路由，无需额外配置
- 不泄露 DoH 解密密钥等安全资产（RSA 私钥不进入开源仓库）
- 不影响海外用户的正常使用（海外直连，无感知，零开销）
- 与现有 proxy_url 手动配置兼容（用户配了代理优先用用户的）
- v2 新增：不拖累任何用户的首次请求速度 —— 缓存优先 + 懒加载二进制，仅在直连失败时才调用

## v1 → v2 改了什么

v1 方案每次请求都调 DoH 二进制（即使二进制内部有缓存，仍需 execFile 开销 ~10ms）。v2 在 TypeScript 层增加文件缓存，实现「缓存优先 + 懒加载」：

**v1（旧方案）**：每次请求 → execFile 调用二进制 → 二进制内部读自己的缓存 → 返回节点 → 发起请求。即使缓存命中也要经过进程启动开销。

**v2（新方案）**：首次请求 → 读 TS 层文件缓存 → 缓存命中直接用（零开销）；缓存未命中 → 先试直连 → 直连成功则缓存 direct；直连失败才调二进制。海外用户终身不触发二进制。

**关键改进点：**

1. 双层缓存：TS 文件缓存（~/.okx/doh-node-cache.json）+ 二进制内部缓存，大多数请求零开销命中缓存
2. 直连验证：无缓存时先试直连，成功则缓存 mode=direct，海外用户永远不触发二进制
3. 懒加载二进制：仅在直连失败时才调用 DoH 二进制，不拖累正常用户
4. 链式 failover：节点 A 失败 → --exclude A → 节点 B → 失败 → --exclude A,B → 直连兜底
5. POST 不自动重试：DoH 切换期间 POST/写请求不自动重发，避免资金变动重复提交

## 三级路由优先级

请求路由的优先级从高到低：

1. 用户手动配置 proxy_url → 使用用户代理（现有逻辑不变，DoH 完全不介入）
2. TS 层缓存命中 mode=proxy → 直接用缓存的代理节点（零开销）
3. TS 层缓存命中 mode=direct → 直连 www.okx.com（零开销）
4. 无缓存 → 先试直连，成功则缓存 direct；失败则调用 DoH 二进制获取代理节点
5. DoH 二进制不可用/失败 → 直连 www.okx.com（降级兜底）

## 核心流程详解

### 首次请求（无缓存，境内用户）

ensureDoh() → 无缓存 → directUnverified=true → 发请求 → 网络失败 → handleDohNetworkFailure() → 调用二进制 → 获得代理节点 → applyDohNode() → 重试请求（仅 GET）

### 首次请求（无缓存，海外用户）

ensureDoh() → 无缓存 → directUnverified=true → 发请求 → 成功 → 缓存 mode=direct → 后续请求零开销

### 缓存命中（所有后续请求）

ensureDoh() 读到缓存后直接返回，不触发任何 I/O。无论 mode=proxy 还是 mode=direct，都是同步读文件 → 命中 → 立即返回。

### 节点故障 → 链式 failover

proxy 节点网络失败 → handleDohNetworkFailure() → 将失败 IP 加入 failedNodes → reResolveDoh(--exclude) → 获得新节点 → 重试（仅 GET）

### POST 安全约束

DoH 切换期间的自动重试仅限 GET 请求。POST/写请求（下单、转账等）不自动重发，原因：

- DoH re-resolution 耗时数秒，价格可能已变动
- 资金变动类操作重复提交可能造成损失
- POST 失败后 DoH 状态仍会刷新，后续请求自动用新节点

## 模块设计

DoH 相关代码位于 `packages/core/src/doh/` 目录，共 4 个文件：

**`types.ts`** — 类型定义。DohNode、DohCacheEntry（mode/node/failedNodes）、DohCacheFile（域名为 key）、FailedNode。

**`binary.ts`** — 二进制调用封装。getDohBinaryPath()（支持 OKX_DOH_BINARY_PATH 环境变量）；execDohBinary(domain, exclude, userAgent) 通过 execFile 调用，30s 超时，异常返回 null。

**`cache.ts`** — 文件缓存。读写 ~/.okx/doh-node-cache.json，原子写入（tmp + rename），lockfile 防并发竞写，10s 过期自动清理 stale lock。

**`resolver.ts`** — 核心路由逻辑。resolveDoh()（同步，读缓存）、reResolveDoh()（异步，调二进制 + 管理 failedNodes）。

**`rest-client.ts`** — 集成层。ensureDoh()、handleDohNetworkFailure()、applyDohNode()。

## 缓存策略

### 缓存文件格式

```json
// ~/.okx/doh-node-cache.json
{
  "www.okx.com": {
    "mode": "proxy",
    "node": {
      "ip": "47.242.161.22",
      "host": "okexweb.qqhrss.com",
      "ttl": 300
    },
    "failedNodes": [
      { "ip": "1.2.3.4", "failedAt": 1712000000000 }
    ],
    "updatedAt": 1712000100000
  }
}
```

### failedNodes 设计

- 每次 proxy 节点失败，该 IP 加入 failedNodes（去重）
- reResolveDoh 通过 --exclude 排除这些节点
- TTL = 1 小时，超时自动清理
- 所有节点耗尽（binary 返回 null）时不写缓存，避免死循环

### 并发安全

- 原子写入：tmp + rename
- lockfile：O_EXCL 创建 .lock 文件
- stale lock：超 10s 自动清理
- best-effort：获取不到锁仍写入，缓存丢失不影响正确性

## 请求改写逻辑

代理节点生效时对 HTTP 请求做三个改写：

1. **URL 改写**：baseUrl 改为 `https://{node.host}`
2. **TLS SNI**：自动为 node.host，证书验证正确
3. **User-Agent**：改为 `OKX/@okx_ai/{packageName}/{version}`

签名不受影响：OKX API 签名格式为 `timestamp + METHOD + requestPath + body`，不含 hostname。

## 安全与兼容

- RSA 私钥封装在 Rust 编译的二进制内，不进入开源仓库
- 二进制通过 CDN 下载（HTTPS），不内嵌在 npm 包中
- 二进制不存在时静默降级为直连
- 支持平台：macOS (arm64 + x64)、Linux (x64)、Windows (x64)

## postinstall 二进制下载

npm install 时通过 postinstall 脚本下载到 ~/.okx/bin/：

- CDN 多源兜底：static.okx.com → pcdoh.qcxex.com → static.coinall.ltd
- 超时 30s，最多 5 次重定向
- 下载失败不阻塞 npm install
- 已设置 OKX_DOH_BINARY_PATH 时跳过下载

## 二进制接口规范

```bash
okx-doh-resolver --domain www.okx.com [--exclude 1.1.1.1,2.2.2.2] [--user-agent OKX/@okx_ai/...]
```

```json
// 成功
{ "code": 0, "data": { "ip": "47.242.161.22", "host": "okexweb.qqhrss.com", "ttl": 300 }, "cached": false }

// 失败
{ "code": 1, "data": { "ip": "", "host": "", "ttl": 0 }, "msg": "no available nodes" }
```

## 测试覆盖

3 个测试文件，21 个用例：

- **doh.test.ts** — 二进制路径解析
- **doh-cache.test.ts** — 缓存读写、多域名合并、目录创建
- **doh-resolver.test.ts** — 缓存命中/未命中、failover 链、failedNodes 管理（13 用例）

## 相关链接

- 旧方案文档（v1）：https://okg-block.sg.larksuite.com/wiki/IYG9wr2u2iXmrxkUdiFlbFZHgze
- 代码：`packages/core/src/doh/`
- 测试：`packages/core/test/doh*.test.ts`
- 集成：`packages/core/src/client/rest-client.ts`
- MR：!225
- Issue：#97
