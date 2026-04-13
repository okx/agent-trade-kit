---
name: okx-cex-auth
description: "Use this skill when the user wants to 'login', 'log in', 'sign in', 'authenticate', 'authorize', 'connect OKX account', 'set up OKX credentials', 'first time setup', 'configure okx', '登录', '授权', '认证', '连接账户', '配置登录', '首次配置', '初次设置'. Also use when any OKX CLI command fails with an authentication error such as: 'Run `okx auth login` first', 'Session expired', 'not authenticated', 'requires_auth', '401 Unauthorized', 'token expired', 'token not found', 'StorageNotFoundError', '会话过期', '未认证', '需要登录'. Also use when the user asks about login status, says 'I already logged in', or the login process was interrupted. Also use before using okx-cex-trade, okx-cex-portfolio, okx-cex-earn, or okx-cex-bot for the first time. Do NOT use for market data queries (use okx-cex-market)."
license: MIT
metadata:
  author: okx
  version: "1.1.0"
  homepage: "https://www.okx.com"
  agent:
    requires:
      bins: ["okx"]
    install:
      - id: npm
        kind: node
        package: "@okx_ai/okx-trade-cli"
        bins: ["okx"]
        label: "Install okx CLI (npm)"
---

# OKX CEX Authentication

OAuth 2.0 device flow authentication for OKX CLI. Guides first-time setup, re-authentication after session expiry, and logout.

## Prerequisites

Install `okx` CLI if not already installed:

```bash
npm install -g @okx_ai/okx-trade-cli
```

## First-Time Setup

Run the interactive setup wizard — handles site selection and OAuth login in one flow:

```bash
okx config init
```

> If you already have a config, the command will skip setup and suggest `okx auth login` to re-authenticate.

Wizard steps:

1. **Select site:**
   - `1` — Global (`www.okx.com`) — default, most users
   - `2` — EEA (`my.okx.com`) — European Economic Area
   - `3` — US (`app.okx.com`) — United States
2. **Login flow** — see [Login Flow](#login-flow) below

## Login Flow

`okx auth login` is a **blocking command** — it polls the server until the user authorizes in their browser.

Add `--site <global|eea|us>` to override the configured site for this login. Optional — if omitted, uses the site from config (set during `okx config init`).

| Site | Region | URL |
| -------- | ----------------------- | --------------- |
| `global` | Global (default)        | `www.okx.com`   |
| `eea`    | European Economic Area  | `my.okx.com`    |
| `us`     | United States           | `app.okx.com`   |

> **CRITICAL for AI agents:** You MUST use `okx auth login --manual` to avoid blocking. The `--manual` flag outputs a JSON payload with the verification URL and user code, then exits immediately — it does NOT block.

### Agent login procedure

1. Run `okx auth login --manual [--site <global|eea|us>]` — this prints a JSON object with `verification_uri` and `user_code`, then exits.
2. Present the verification URL and user code to the user. Tell them to open the URL in their browser and enter the code.
3. **Poll for completion** by running `okx auth status --json` periodically (every 5–10 seconds).
   - `"status": "pending"` → still waiting for user authorization, keep polling
   - `"status": "logged_in"` → success, proceed with the user's original request
   - `"status": "not_logged_in"` → the device code expired or was rejected, ask the user if they want to retry
4. **Do NOT run any other `okx` commands** while waiting for authorization.

### Interactive login (user runs directly in terminal)

1. **Tell the user BEFORE running** that they will need to authorize in their browser.
2. **Run `okx auth login [--site <global|eea|us>]`** — the command will block and poll until the user completes authorization.
3. **Do NOT assume the command is stuck.** The polling phase produces no output — this is normal.
4. **Check the result:**
   - `Logged in successfully!` — proceed with the user's original request.
   - Login failed — show the error and ask if they want to retry.

## Login Status Check

Run `okx auth status --json` to check login status. Parse the JSON output:

```json
{
  "profile": "oauth",
  "site": "global",
  "status": "logged_in",
  "expiresAt": "2026-04-11T20:30:00+00:00",
  "ttl": 3600,
  "scopes": ["live:read", "live:trade"]
}
```

| `status` value   | Meaning                        | Action                          |
| ----------------- | ------------------------------ | ------------------------------- |
| `logged_in`       | Valid session                  | Proceed                        |
| `pending`         | Login in progress              | Keep polling                   |
| `not_logged_in`   | No active session              | Run `okx auth login --manual`  |

## Re-authentication (Session Expired)

When any command fails with "Session expired" or "Run `okx auth login` first":

1. Run `okx auth login --manual [--site <global|eea|us>]` (agent) or `okx auth login [--site <global|eea|us>]` (interactive)
2. Follow the same [Login Flow](#login-flow) above

> Token expiry is managed automatically — you only need to re-authenticate when the refresh token itself expires (typically after an extended period of inactivity).

## Logout

```bash
okx auth logout
```

DCR client registration is retained after logout. The next `okx auth login` will be faster.

## Error Reference

| Error message                                 | Cause                                  | Action                                           |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `No config found. Run okx config init first.` | No config                              | Run `okx config init`                            |
| `Session expired — run okx auth login again`  | Refresh token expired                  | Run `okx auth login --manual`                    |
| `Authorization timed out`                     | User did not authorize in time         | Run `okx auth login --manual` again              |
| `Access denied`                               | User rejected authorization in browser | Run `okx auth login --manual` and ask to approve |
| `Region restriction` (51155, 51734)            | Instrument not available in configured site | Check `okx auth status --json` for current site; re-login with `--site` if needed |
| `Network error` during login                  | Network unavailable                    | Check network and retry                          |

## Skill Routing

| After authentication...                   | Next skill                          |
| ----------------------------------------- | ----------------------------------- |
| Place / cancel / amend orders             | `okx-cex-trade`                     |
| Check balance, positions, P&L             | `okx-cex-portfolio`                 |
| Simple Earn, On-chain Earn, DCD, AutoEarn | `okx-cex-earn`                      |
| Grid / DCA bots                           | `okx-cex-bot`                       |
| Market prices, candles, indicators        | `okx-cex-market` (no auth required) |
