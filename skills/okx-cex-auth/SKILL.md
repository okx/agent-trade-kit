---
name: okx-cex-auth
description: "Use this skill when the user wants to 'login', 'log in', 'sign in', 'authenticate', 'authorize', 'connect OKX account', 'set up OKX credentials', 'first time setup', 'configure okx', '登录', '授权', '认证', '连接账户', '配置登录', '首次配置', '初次设置'. Also use when any OKX CLI command fails with an authentication error such as: 'Run `okx auth login` first', 'Session expired', 'not authenticated', 'requires_auth', '401 Unauthorized', 'token expired', 'token not found', 'StorageNotFoundError', '会话过期', '未认证', '需要登录'. Also use when the user asks about login status, says 'I already logged in', or the login process was interrupted. Also use when the user wants to install, update, check, or remove the okx-auth binary — phrases like 'install auth', 'download okx-auth', 'update auth binary', 'check auth binary', 'remove auth', 'uninstall auth', '安装认证', '更新认证', '卸载认证', 'auth binary status', 'is okx-auth installed', 'Failed to spawn okx-auth'. Also use before using okx-cex-trade, okx-cex-portfolio, okx-cex-earn, or okx-cex-bot for the first time. Do NOT use for market data queries (use okx-cex-market)."
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
        package: "@okx_ai/okx-trade-cli@1.3.1-beta.17"
        bins: ["okx"]
        label: "Install okx CLI (npm)"
---

# OKX CEX Authentication

OAuth 2.0 device flow authentication for OKX CLI. Guides first-time setup, re-authentication after session expiry, and logout.

## Supported Sites

| Site | Region | URL |
| -------- | ----------------------- | --------------- |
| `global` | Global | `www.okx.com` |
| `eea`    | EEA    | `my.okx.com`  |
| `us`     | US     | `app.okx.com` |

Site is a separate dimension from auth method. Both API-key and OAuth paths require a site. Once selected, a site is persisted:
- **API-key users**: `profile.site` in `~/.okx/config.toml` (written by `okx config init`).
- **OAuth users**: saved inside the `okx-auth` binary state the first time `okx auth login --site <X>` succeeds, and returned by `okx auth status --json` as the `site` field.

There is **no `okx config set-site` command** — site cannot be persisted independently of an auth attempt. For OAuth flows, the agent must remember the user's choice within the conversation and pass `--site <X>` on `okx auth login`.

## Prerequisites

Install `okx` CLI if not already installed:

```bash
npm install -g @okx_ai/okx-trade-cli
```

## Step 0: Pre-flight Check (MANDATORY)

Run both in parallel:

```bash
okx config show --json
okx auth status --json
```

Then apply the following three checks **in strict order** — each step short-circuits the rest.

### Step 0.1 — Site check (independent of auth mode)

A site is considered already selected if **either** is true:
- `config show --json` has any profile with a non-empty `site` field, OR
- `auth status --json` returns a non-empty `site` field **AND** `status` is `logged_in` or `pending`.

> ⚠ When `status` is `not_logged_in`, the `site` field from `auth status --json` is a **default placeholder** (typically `"global"`) that the auth binary emits regardless of user choice — it does NOT mean the user ever picked a site. Treat it as absent.

If **neither** condition above holds, site has never been chosen. You MUST ask the user to pick one before any login attempt by echoing the following menu verbatim (Chinese), and wait for their reply:

> 您需要选择要连接的 OKX 站点：
> 1) Global (www.okx.com)
> 2) EEA (my.okx.com)
> 3) US (app.okx.com)

Map the reply (`1`/`2`/`3` or `global`/`eea`/`us`) to the corresponding site id and remember it for the rest of this flow. Do NOT default to `global` silently — that hides the regional choice from the user.

### Step 0.2 — API-key check

Parse `config show --json`: does any profile have a non-empty `api_key` field?

If yes → **STOP.** Tell the user "已配置 API key (profile: <name>)" and proceed with their original request directly. DO NOT run `okx auth login` or `okx config init`.

> The CLI's REST client always prefers API key over OAuth and never falls back (see `rest-client.ts applyAuth`). Starting an OAuth login in this state is wasted effort — any OAuth token obtained would not be used, because the broken API key is still picked first.
>
> Belt-and-suspenders: as of CLI `1.3.1-beta.17`, `okx auth login` itself refuses to start OAuth when any profile has `api_key` — in `--manual` mode it emits `{"status":"skipped","reason":"api_key_configured","profile":"<name>"}`. Treat that output as success.

#### Step 0.2.a — Handling an invalid API key (401 / signature error)

If Step 0.2 detected an `api_key` profile and the subsequent API call returns an authentication error (`401 Unauthorized`, `Invalid Sign`, `Invalid API-KEY`, OKX error code `50111`/`50113`), **the API key is bad — OAuth login is NOT a valid remediation**. Per `rest-client.ts applyAuth`, any OAuth token obtained afterwards would still not be used because the broken API key is still picked first.

Present the user with exactly these two options, neutrally (do NOT label OAuth as "recommended"):

1. **Replace the API key** — the user generates a new key on the OKX web console (`https://<site>/account/my-api`) and either provides `AK/SK/PP` to you or re-runs `okx config init` themselves.
2. **Switch entirely to OAuth** — first remove the broken API-key profile (`okx config use <other-profile>` or delete the profile block in `~/.okx/config.toml`), THEN run the OAuth login flow from Step 0.3.

Option 2 requires removing the profile first. If you attempt `okx auth login` while the API key profile still exists, the CLI guard will skip OAuth with `{"status":"skipped","reason":"api_key_configured",...}` and nothing will change.

Wait for the user's choice. Do not pick for them.

### Step 0.3 — OAuth check

Use `auth status --json`:

| `status` value  | Action |
| --------------- | ------ |
| `logged_in`     | **STOP.** Tell the user "你已通过 OAuth 登录，站点: <site>, 权限: <scopes>" and proceed. |
| `pending`       | Previous login in progress — follow [Login Flow](#login-flow) polling. Do NOT start a new login. |
| `not_logged_in` | Proceed to [Login Flow](#login-flow) with the site chosen in Step 0.1. |

## Login Flow

> **Prerequisite:** Step 0 completed. You have a site (from config, auth state, or user selection) and you confirmed no `api_key` profile exists.

`okx auth login` without `--manual` is a **blocking command** — it polls until the user authorizes in their browser.

> **CRITICAL for AI agents:** You MUST use `okx auth login --manual` to avoid blocking. The `--manual` flag outputs a JSON payload with the verification URL and user code, then exits immediately — it does NOT block.

### Agent login procedure

1. Run `okx auth login --manual --site <global|eea|us>` with the site chosen in Step 0.1.
   - If the CLI returns `{"status":"skipped","reason":"api_key_configured",...}`, your Step 0.2 check was stale — re-read `config show --json` and stop. Do not retry.
   - Otherwise the CLI prints a single line of JSON: `{"verificationUri":"...","userCode":"XXXX-XXXX","expiresIn":600}`.

2. **Surface the verification URL and user code in your assistant reply — NOT only inside a tool-output block.**

   > ⚠ **CRITICAL.** The tool-output panel in many UIs (openclaw-control-ui, Claude Desktop, IDE chat panels) is collapsible and users may run with it hidden by default. If the URL and code appear ONLY in tool stdout, users cannot authorize. You MUST echo the parsed fields in your own natural-language response so they render as plain chat text.

   Parse the JSON returned by the previous step and include **all three** fields below in your reply. Do not abbreviate with "the link above" or "the code from the output" — repeat the full URL and the full code inline. Example reply format (Chinese):

   ```
   请在浏览器中打开下面的链接并输入验证码完成授权：

   链接：<verificationUri>
   验证码：<userCode>
   （有效期 <expiresIn>/60 分钟）

   我会每隔几秒检查一次你的授权状态，等你在浏览器上完成即可。
   ```

   English equivalent is fine when the user is conversing in English. Either way, the URL and code must appear as plain text in the assistant message.

3. **Poll for completion** by running `okx auth status --json` periodically (every 5–10 seconds).
   - `"status": "pending"` → still waiting for user authorization, keep polling
   - `"status": "logged_in"` → success. Tell the user "你已通过 OAuth 登录，站点: <site>, 权限: <scopes>" and proceed with the user's original request.
   - `"status": "not_logged_in"` → the device code expired or was rejected, ask the user if they want to retry

4. **Do NOT run any other `okx` commands** while waiting for authorization.

### Interactive login (user runs directly in terminal)

1. **Tell the user BEFORE running** that they will need to authorize in their browser.
2. **Run `okx auth login --site <global|eea|us>`** — the command will block and poll until the user completes authorization.
3. **Do NOT assume the command is stuck.** The polling phase produces no output — this is normal.
4. **Check the result:**
   - `Logged in successfully!` — proceed with the user's original request.
   - `API key already configured ...` — Step 0.2 check was stale, use the existing API key.
   - Login failed — show the error and ask if they want to retry.

## First-Time Setup (API-key users only)

> `okx config init` is an **API-key** wizard. It prompts for site, then demo/live, then asks for `AK/SK/PP` credentials. It does NOT perform OAuth. Use it only when the user explicitly wants to configure an API key.

```bash
okx config init
```

Wizard steps:

1. **Select site:**
   - `1` — Global (`www.okx.com`)
   - `2` — EEA (`my.okx.com`) — European Economic Area
   - `3` — US (`app.okx.com`) — United States
2. **Demo / live**: whether this profile should target simulated trading.
3. **AK / SK / Passphrase**: credentials created on the OKX web console.

After `okx config init` completes, re-run the Step 0 pre-flight check — `api_key` will now be present and Step 0.2 will short-circuit any further login.

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

## Binary Management

The `okx auth` commands (`login`, `logout`, `status`) depend on the `okx-auth` binary. It is normally installed automatically during `npm install`, but can also be managed manually.

> **IMPORTANT for AI agents:** Do NOT manually check platform, CDN availability, or binary paths. Always use the CLI commands below — they handle platform detection and download internally.

### Install / Update

```bash
okx auth install
```

Downloads or updates the `okx-auth` binary. Reports "up to date" if already current. Use `--json` for machine-readable output.

### Check Installation

```bash
okx auth install-status
```

Shows whether the binary is installed and up to date. Use `--json` for machine-readable output.

### Remove

```bash
okx auth remove          # interactive confirmation
okx auth remove --force  # skip confirmation
```

### Troubleshooting: "Failed to spawn okx-auth"

If any `okx auth` command (`login`, `logout`, `status`) fails with "Failed to spawn okx-auth", the binary is missing or corrupted:

1. Run `okx auth install` to download it
2. Verify with `okx auth install-status`
3. Retry the original command

## Error Reference

| Error message                                 | Cause                                  | Action                                           |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `No config found. Run okx config init first.` | No config                              | Run `okx config init`                            |
| `Session expired — run okx auth login again`  | Refresh token expired                  | Run `okx auth login --manual`                    |
| `Authorization timed out`                     | User did not authorize in time         | Run `okx auth login --manual` again              |
| `Access denied`                               | User rejected authorization in browser | Run `okx auth login --manual` and ask to approve |
| `Region restriction` (51155, 51734)            | Instrument not available in configured site | Check `okx auth status --json` for current site; re-login with `--site` if needed |
| `Network error` during login                  | Network unavailable                    | Check network and retry                          |
| `Failed to spawn okx-auth`                    | Binary not installed or corrupted      | Run `okx auth install`                           |
| `Installation failed: All CDN sources failed` | Network issue during binary download   | Check network and retry `okx auth install`       |

## Skill Routing

| After authentication...                   | Next skill                          |
| ----------------------------------------- | ----------------------------------- |
| Place / cancel / amend orders             | `okx-cex-trade`                     |
| Check balance, positions, P&L             | `okx-cex-portfolio`                 |
| Simple Earn, On-chain Earn, DCD, AutoEarn | `okx-cex-earn`                      |
| Grid / DCA bots                           | `okx-cex-bot`                       |
| Market prices, candles, indicators        | `okx-cex-market` (no auth required) |
