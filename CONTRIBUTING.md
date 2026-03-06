[English](CONTRIBUTING.md) | [中文](CONTRIBUTING.zh-CN.md)

# Contributing to OKX Agent TradeKit

Thank you for your interest in contributing! This guide covers everything you need to get started.

---

## Development Environment

**Prerequisites:**

- Node.js >= 18
- pnpm >= 9

```bash
# Install pnpm (skip if already installed)
npm install -g pnpm

# Clone the repository
git clone https://github.com/okx/agent-tradekit.git
cd okx-trade-mcp

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type-check all packages
pnpm typecheck
```

---

## OKX Demo Account Setup

The integration tests (smoke tests and e2e tests) require real OKX API credentials. Use a **Demo Trading** account to avoid risking real funds.

1. Log in to [OKX](https://www.okx.com)
2. Go to **Trading → Demo Trading → API Management**
3. Create an API key with **trade** permissions
4. Copy the key, secret, and passphrase into `~/.okx/config.toml`:

```bash
mkdir -p ~/.okx && cp config.toml.example ~/.okx/config.toml
```

```toml
default_profile = "demo"

[profiles.demo]
api_key = "your-demo-api-key"
secret_key = "your-demo-secret-key"
passphrase = "your-demo-passphrase"
demo = true
```

> OKX Demo Trading signup: https://www.okx.com/demo-trading

---

## Running Tests

### Unit Tests (no credentials required)

```bash
# Run unit tests across all packages
pnpm test:unit
```

### Smoke Tests (requires Demo credentials)

```bash
bash test/smoke.sh
```

Expected output: `19/19 passed`

### MCP End-to-End Tests (requires Demo credentials)

```bash
node test/mcp-e2e.mjs
```

---

## Adding a New Tool

1. Open the relevant module file in `packages/core/src/tools/` (e.g. `spot-trade.ts`)
2. Add a new `ToolSpec` object to the exported array:

```typescript
{
  name: "spot_example",
  module: "spot",
  description: "What this tool does, written for AI understanding.",
  inputSchema: {
    type: "object",
    properties: {
      instId: { type: "string", description: "Instrument ID, e.g. BTC-USDT" },
    },
    required: ["instId"],
  },
  isWrite: false,   // true for POST/mutating operations
  handler: async (args, { client, config: _config }) => {
    const a = asRecord(args);
    const instId = requireString(a, "instId");
    return client.publicGet("/api/v5/some/endpoint", { instId });
  },
}
```

3. No changes needed to `server.ts` or `index.ts` — tools are auto-registered via `buildTools()`.
4. Add a unit test in `packages/core/test/` if the tool has non-trivial logic.

For a new **module**, see Section 10 of [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Pull Request Guidelines

### Branch Naming

```
feat/<short-description>     # new feature
fix/<short-description>      # bug fix
test/<short-description>     # tests only
docs/<short-description>     # documentation only
refactor/<short-description> # refactoring
```

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]
```

Examples:
```
feat(swap): add trailing stop order tool
fix(rate-limiter): handle zero refill rate edge case
test(core): add signature unit tests
docs: translate ARCHITECTURE.md to English
```

### Before Opening a PR

```bash
pnpm build      # must pass
pnpm typecheck  # must pass
pnpm test:unit  # must pass
```

### PR Description

Fill in the pull request template — describe what changed, how it was tested, and check the relevant boxes.

---

## Code Style

- **Language**: TypeScript, ESM modules (`"type": "module"`)
- **Build**: `tsup` (esbuild-based) — do not modify `tsconfig.json` without discussion
- **Formatting**: Prettier defaults (no config file — keep it simple)
- **No default exports** — use named exports
- **Error handling**: Throw from the `OkxMcpError` hierarchy; never throw raw strings
- **No `any`** — use `unknown` and narrow types explicitly

---

## Questions?

Open a [GitHub Discussion](https://github.com/okx/agent-tradekit/discussions) or file an issue with the `question` label.
