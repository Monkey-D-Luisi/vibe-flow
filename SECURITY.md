# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | Yes                |
| < 0.1   | No                 |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, please use [GitHub Security Advisories](https://github.com/Monkey-D-Luisi/vibe-flow/security/advisories/new)
to report vulnerabilities privately. This allows us to assess and fix the issue
before it becomes public.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what an attacker could do)
- Affected component (extension, package, skill, CI workflow)

### Response timeline

- **Acknowledge**: within 48 hours
- **Initial assessment**: within 7 days
- **Fix or mitigation**: within 90 days (target)

### Scope

This policy covers:

- All extensions in `extensions/`
- Shared packages in `packages/`
- CI/CD workflows in `.github/workflows/`
- Configuration contracts (`openclaw.json`, `openclaw.plugin.json`)
- Scripts in `scripts/`

### Out of scope

- The OpenClaw gateway itself (report to [OpenClaw](https://openclaw.ai))
- Third-party dependencies (report upstream; we track transitive vulnerabilities
  in `docs/security-vulnerability-exception-ledger.md`)
- Model provider APIs (Anthropic, OpenAI, GitHub Copilot)

## Security Design

For details on the security model (tool allow-lists, transition guards,
sandboxing, prompt injection mitigations), see:

- [Tool Allow-List Rationale](docs/allowlist-rationale.md)
- [Transition Guard Evidence Reference](docs/transition-guard-evidence.md)
