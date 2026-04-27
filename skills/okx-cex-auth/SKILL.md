---
name: okx-cex-auth
description: "Use this skill when the user wants to 'login/log in/sign in', 'authenticate', 'authorize', 'connect OKX account', 'set up credentials', 'first time setup', 'configure okx', '登录', '授权', '认证', '连接账户', '首次配置'. Also when any OKX CLI command fails with an auth error: 'Run okx auth login first', 'Session expired', 'not authenticated', 'requires_auth', '401 Unauthorized', 'token expired/not found', 'StorageNotFoundError', '会话过期', '未认证', '需要登录'. Also when the user asks about login status or the login was interrupted. Also when the user wants to install/update/check/remove the okx-auth binary — 'install/update/remove auth', 'download okx-auth', '安装/更新/卸载认证', 'auth binary status', 'Failed to spawn okx-auth'. Also use before using okx-cex-trade/portfolio/earn/bot for the first time. Do NOT use for market data queries (use okx-cex-market)."
license: MIT
metadata:
  author: okx
  version: "1.3.2"
  homepage: "https://www.okx.com"
  agent:
    requires:
      bins: ["okx"]
    install:
      - id: npm
        kind: node
        package: "@okx_ai/okx-trade-cli@1.3.2"
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

**Unconditional rule — do NOT skip Step 0 under any circumstances.** Even if a prior skill (preflight, okx-cex-portfolio, etc.) already ran `auth status` and passed you a conclusion like "user is not_logged_in, go log in" — **you MUST re-run the two commands below yourself and walk Steps 0.1 → 0.2 → 0.3 in order**. Upstream tool output does not substitute for your own pre-flight. The single most common failure mode for this skill is an agent that reads an upstream "not authenticated" signal, skips Step 0.1 site selection, and calls `okx auth login` with a silently-defaulted site.

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
| `logged_in`     | **STOP.** Reply using the success template from [Agent login procedure](#agent-login-procedure) Step 3 `logged_in` branch (site + scopes only; see its negative-list rules), then proceed. |
| `pending`       | Previous login in progress — follow [Login Flow](#login-flow) wait-for-signal procedure. Do NOT start a new login, do NOT auto-poll. |
| `not_logged_in` | Proceed to [Login Flow](#login-flow) with the site chosen in Step 0.1. |

## Pre-login Gate (MANDATORY — do not run `okx auth login` without this)

Before invoking `okx auth login` (with or without `--manual`), you MUST verify all **three** of the following are true right now:

1. You posted the exact Chinese site menu from Step 0.1 to the user earlier in this conversation (or immediately before this login call).
2. The user's most recent message was a site choice (`1` / `2` / `3` / `global` / `eea` / `us`).
3. You are about to pass **that exact choice** as `--site <...>`.

If **any** of the three is false — even if a prior skill's output, `auth status --json` output, or `config show --json` output seems to imply a site — you MUST first post the Step 0.1 menu, wait for the user's reply, then re-check this gate. The `site` field in `auth status --json` when `status` is `not_logged_in` is a placeholder (typically `"global"`) and **does not** satisfy condition 1.

Worked counter-example (anti-pattern):
> Upstream portfolio skill runs `auth status --json`, gets `{"status":"not_logged_in","site":"global"}`, tells you "user is not_logged_in, load okx-cex-auth and log in".
> ❌ **Wrong:** you read that context, run `okx auth login --manual --site global`, immediately return the OAuth URL and code.
> ✅ **Right:** you ignore the upstream site value, post the Step 0.1 menu yourself, wait for user's reply, then run `okx auth login --manual --site <user's choice>`.

## Login Flow

> **Prerequisite:** Step 0 completed **and** the Pre-login Gate above passes. You have a site the user just chose in chat, and you confirmed no `api_key` profile exists.

`okx auth login` without `--manual` is a **blocking command** — it polls until the user authorizes in their browser.

> **CRITICAL for AI agents:** You MUST use `okx auth login --manual` to avoid blocking. The `--manual` flag outputs a JSON payload with the verification URL and user code, then exits immediately — it does NOT block.

### Agent login procedure

1. Run `okx auth login --manual --site <global|eea|us>` with the site chosen in Step 0.1.
   - If the CLI returns `{"status":"skipped","reason":"api_key_configured",...}`, your Step 0.2 check was stale — re-read `config show --json` and stop. Do not retry.
   - Otherwise the CLI prints a single line of JSON: `{"verificationUri":"...","userCode":"XXXX-XXXX","expiresIn":600}`.

2. **Surface the verification URL and user code in your assistant reply — NOT only inside a tool-output block.**

   > ⚠ **CRITICAL.** The tool-output panel in many UIs (openclaw-control-ui, Claude Desktop, IDE chat panels) is collapsible and users may run with it hidden by default. If the URL and code appear ONLY in tool stdout, users cannot authorize. You MUST echo the parsed fields in your own natural-language response so they render as plain chat text.

   Parse the JSON returned by the previous step and reply using **exactly one** of the templates below (verbatim except for field substitution). The wording is normative — do not abbreviate, reword, reorder, or translate.

   **Chinese template** (use when the user is conversing in Chinese):

   ```
   请在浏览器中打开下面的链接并输入验证码完成授权：

   站点：<site>
   链接：<verificationUri>
   验证码：<userCode>
   （有效期 <expiresIn>/60 分钟）

   通过链接完成授权，然后告诉我。
   ```

   **English template** (use when the user is conversing in English):

   ```
   Please open the link below in your browser and enter the verification code to authorize:

   Site: <site>
   URL: <verificationUri>
   Code: <userCode>
   (Valid for <expiresIn/60> minutes)

   Please authorise current session with access to your account, tell me when you are done.
   ```

   All four fields — `site`, `verificationUri`, `userCode`, `expiresIn` — must appear as plain text in the assistant message.

3. **Wait for the user to signal completion** (e.g. "done", "ok", "好了", "完成了"). Do NOT auto-poll. Upon receiving the signal, run `okx auth status --json` **once** to verify, then branch:
   - `"status": "logged_in"` → success. Reply using **exactly one** of the templates below (verbatim except for field substitution), then proceed with the user's original request in the same turn.

     **Chinese template**:

     ```
     登录成功。
     站点：<site>
     权限：<scopes>
     ```

     **English template**:

     ```
     Login successful.
     Site: <site>
     Scopes: <scopes>
     ```

     **DO NOT include any other field from `auth status --json` in this reply.** Specifically:
     - `expiresAt` / `ttl` refer to the short-lived access token, not the OAuth session. The CLI auto-refreshes tokens transparently; surfacing these values will mislead users into thinking their login expires soon.
     - `profile` is an internal routing field with no user value.
     - Only `site` and `scopes` are user-relevant.
     - If asked about session longevity, say "Session stays active as long as you use the CLI periodically." Do not quote a number.

   - `"status": "pending"` → authorization not yet complete; tell the user it's not done yet and wait for another signal. Do NOT auto-poll.
   - `"status": "not_logged_in"` → device code expired or was rejected; ask the user whether to retry.

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
| `pending`         | Login in progress              | Wait for user to signal completion; do NOT auto-poll |
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
