# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Previous minor | ✅ security fixes only |
| Older versions | ❌ |

We recommend always running the latest published version.

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Report security issues privately via:

- **GitHub Private Advisory:** Use the [Report a vulnerability](../../security/advisories/new) button on the Security tab of this repository.
- **Email:** security@okx.com

Include as much detail as possible: description of the issue, steps to reproduce, potential impact, and any suggested mitigations.

## Priority Issues

The following vulnerability types are treated as **highest priority** due to their potential for financial harm:

- **API key / secret key leakage** — any path that could expose credentials
- **Fund safety** — issues that could cause unintended orders, transfers, or position changes
- **Authentication bypass** — bypassing signature verification or access controls

## Response Timeline

| Stage | Target |
|-------|--------|
| Initial acknowledgement | Within **48 hours** |
| Triage and severity assessment | Within **3 business days** |
| Remediation plan communicated | Within **7 days** |
| Fix released | Depends on severity; critical issues prioritized |

## Scope

This project is a thin API integration layer. The primary attack surfaces are:

1. **Credential handling** — API keys read from `~/.okx/config.toml`
2. **Network requests** — HTTPS calls to `https://www.okx.com`
3. **MCP tool input** — parameters passed by AI agents to trading tools
4. **Audit log** — written to `~/.okx/logs/`; API keys are automatically redacted before writing

Out of scope: vulnerabilities in OKX's own platform, third-party dependencies (report those upstream), or issues requiring physical access to the machine.

## Disclosure Policy

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure). Once a fix is released, we will credit the reporter (unless anonymity is requested) and publish a summary in the changelog.
