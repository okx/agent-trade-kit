# Security Policy

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Report security issues privately via:

- **Email**: [your-security-email@example.com] *(replace with actual contact)*
- **Direct message**: [@your-handle] *(replace with actual handle)*

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

1. **Credential handling** — API keys read from environment variables or `~/.okx/config.toml`
2. **Network requests** — HTTPS calls to `https://www.okx.com`
3. **MCP tool input** — parameters passed by AI agents to trading tools

Out of scope: vulnerabilities in OKX's own platform, third-party dependencies (report those upstream), or issues requiring physical access to the machine.

## Disclosure Policy

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure). Once a fix is released, we will credit the reporter (unless anonymity is requested) and publish a summary in the changelog.
