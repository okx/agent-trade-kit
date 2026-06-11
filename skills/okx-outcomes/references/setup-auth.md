# Setup & Authentication

First-time onboarding and the auth model for `okx outcomes`. Outcomes uses OKX
**OAuth sign-in** for authenticated reads and an **EIP-712 signing key** for on-chain
writes. There is no HMAC API-key flow in the supported path, and **no `.env`
auto-loading** — configuration lives in `~/.okx-outcomes/config.json` (non-secret) and
the OS keyring (secrets; encrypted `~/.okx-outcomes/keyring.enc` fallback).

> This OAuth is **independent** from the main `okx` CLI's OAuth / API key. Do **not**
> call `okx auth login` for outcomes — outcomes has its own `okx outcomes auth login`.

**Fully agent-driven**: every setup command below is non-interactive and agent-runnable.
The agent runs all of them; the user only acts in a **browser** (open a device-code URL +
enter a code) and by opening the **bind short link** (tap on phone → OKX app, or paste into
a browser; if it won't open, copy the wallet address and bind manually). No terminal, no `!` prefix.

---

## The three setup pieces (dependency order)

Region must be set first; OAuth sign-in and wallet binding both depend on it.

1. **Region** — Global or US. Picks REST host, WS host, and the clientOrderId region tag.
2. **OAuth sign-in** — device-code flow brokered by `okx-auth`; the agent prints a URL +
   code, the user authorizes in a browser, the token is stored in the keyring (never displayed).
3. **EOA wallet binding** — generates the signing wallet and binds its address to the OKX
   account by opening a bind **short link** (tap on phone → OKX app, or paste into any
   browser); if the link won't open, copy the wallet address and bind manually in the app.

Detect progress at any time:

```bash
okx outcomes setup status --json
```

```json
{
  "region":      { "done": true,  "value": "us" },
  "oauth":       { "done": false },
  "eoa_binding": { "done": false, "address": "0x…" },
  "next_step":   "oauth",
  "complete":    false
}
```

Advance the `next_step`, re-running `setup status --json` after each step, until
`complete: true`, then `okx outcomes status`.

---

## Commands

### setup status

```bash
okx outcomes setup status --json
```

Read-only state detection (region / oauth / eoa_binding / next_step / complete). Safe to
run from an agent.

### setup region

```bash
okx outcomes setup region global
okx outcomes setup region us
```

Non-interactive; writes the choice to `config.json`. Safe to run from an agent.

### auth login (device-code — for agents)

```bash
okx outcomes auth login --manual --json
okx outcomes auth login --manual --json --site us   # --site follows the chosen region
```

The `--manual` device-code flow prints a single-line JSON envelope and **exits immediately**
— it does not block and does not read stdin, so an agent can run it directly:

```json
{ "verificationUri": "https://...", "userCode": "ABCD-1234", "expiresIn": 600 }
```

The agent relays this to the user: *"Open `<verificationUri>` on any device and enter code
`<userCode>` (valid ~`expiresIn/60` min)."* The user authorizes in a browser (out-of-band).
The token is brokered by `okx-auth` and stored in the keyring — never printed.

> Plain `okx outcomes auth login` (without `--manual`) is the interactive/browser-foreground
> variant for a **user at a real terminal** — it inherits stdio and is not for agents.

### auth refresh (verification) / auth status

```bash
okx outcomes auth refresh --json   # verify + refresh; writes the session marker on success
okx outcomes auth status --json    # report session presence (no secret values)
```

After the user authorizes the device code, `auth refresh` is the **verification step**: it
fetches a token (which now succeeds) and writes the OAuth session marker, so `auth status` /
`setup status` then report signed-in. Poll `auth refresh` a few times with backoff, or run it
once after the user confirms they've authorized. Both are agent-runnable and expose no secrets.

### setup bind

```bash
okx outcomes setup bind --json          # generate a fresh signing wallet, then bind
okx outcomes setup bind --keep --json   # reuse the existing wallet (idempotent re-display)
```

Prints the `address` and a **short link** (the `deeplink` field of the JSON output) of the form
`https://okx.com/ul/3OauBX?eoa=<eoa>&uid=<uid>` (the `eoa` is the new wallet's public
address; `uid` is the signed-in account id — both filled in by the CLI). The private key
never leaves the keyring. The agent **relays the short link verbatim** (do not shorten or
wrap it) and tells the user:

1. Tap the link on their phone → it launches the OKX app to approve the binding.
2. Or copy it into any browser (opens a web fallback).
3. If the link won't open, copy the wallet `address` shown above and bind it manually in the
   OKX app: **Outcomes → Profile → Settings → API Bind Wallet**.

The `address` is public — safe to show.

> **Regenerates by default**: plain `setup bind` creates a **new** wallet every run
> (`wallet: "created" | "regenerated"`). To re-display the binding without rotating the
> address, pass `--keep` (`wallet: "kept"`). An agent re-running bind for any reason must use
> `--keep`, or it will orphan the previously bound address.

> `eoa_binding.done == true` means the wallet is configured locally. If an order is later
> rejected for binding, have the user re-open the link (re-run `setup bind --keep` to
> re-show the short link).

### setup (full wizard) / shell

```bash
okx outcomes setup     # interactive region → OAuth → bind, all-in-one
okx outcomes shell     # interactive REPL
```

Interactive, raw-terminal programs (crossterm raw-mode + `read_line`). Only for a user at a
real terminal — **agents must never spawn these**; use the per-step subcommands instead.

---

## Non-TTY / agent environments

The `okx outcomes` wrapper spawns the binary with inherited stdio, so the agent's captured
stdout receives each command's output. The whole setup runs from the agent:

| Step | Agent-runnable? | Notes |
|---|---|---|
| `setup status` | ✅ yes | read-only |
| `setup region <global\|us>` | ✅ yes | non-interactive write |
| `auth login --manual --json` | ✅ yes | prints device-code JSON + exits; agent relays URL+code |
| `auth refresh` / `auth status` | ✅ yes | verify session; no stdin, no secrets |
| `setup bind [--keep] --json` | ✅ yes | prints address + a short link (`deeplink` field); user opens it on phone/browser (or copies the address to bind manually) |
| plain `auth login` (no `--manual`) | 🚫 needs TTY | interactive/browser-foreground; user-at-terminal only |
| `setup` (full wizard) / `shell` | 🚫 never spawn | raw-terminal; will hang / EOF-error |

The only human actions are in the **browser** (authorize the device-code URL) and opening the
**bind short link** (tap on phone → OKX app, or paste into a browser; if it won't open, copy
the wallet address and bind manually in the OKX app). No terminal and no `!` prefix are required.

---

## Environment variables (optional overrides)

Env vars, if set, override the stored config / keyring value. Still use the legacy
`PREDICTIONS_*` prefix (upstream naming).

| Var | Used for | Notes |
|---|---|---|
| `PREDICTIONS_AGENT_PRIVATE_KEY` | On-chain writes | secp256k1 hex. Normally generated by setup and stored in the keyring; this env var only **overrides** it. NEVER share or print. |
| `PREDICTIONS_API_BASE` | REST host override | defaults to the region picked during setup |
| `PREDICTIONS_WS_HOST` | WebSocket host override | optional |
| `OKX_OUTCOMES_BIN` | Binary path override | useful for local dev builds |
| `OKX_THEME` | Color theme | `auto` (default) / `light` / `dark` |

---

## Security rules

- **Never** accept a signing private key in chat. The wallet is created by `setup` /
  `setup bind` and stored in the keyring. If a user pastes a key, refuse and tell them to
  revoke / rotate it.
- **Never** echo `PREDICTIONS_AGENT_PRIVATE_KEY` (or any `0x` followed by 64 hex chars).
  Mask as `0x****`. Wallet addresses (40 hex) and tx hashes are public — fine to show.
- When reporting credential state, show only `set` / `unset` / `signed in` — never values.
