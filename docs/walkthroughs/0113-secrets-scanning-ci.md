# Walkthrough: 0113 -- Secrets Scanning in CI (Gitleaks)

## Task Reference

- Task: `docs/tasks/0113-secrets-scanning-ci.md`
- Epic: EP17 -- Security & Stability v2
- Branch: `feat/EP17-security-stability-v2`

---

## Summary

Added gitleaks secrets scanning to the CI pipeline via a new `secrets-scan` job
in the quality-gate workflow. Created `.gitleaks.toml` with 6 custom rules
targeting project-specific credential patterns and an allow-list to prevent
false positives.

---

## Context

No secrets scanning existed in CI. The quality-gate workflow covered tests,
coverage, lint, complexity, and vulnerability policy — but no detection for
leaked API keys or tokens.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Separate `secrets-scan` job | Runs fast (~30s), doesn't need Node/pnpm setup, fails fast before expensive quality gate |
| Full repo scan (not diff-only) | Catches pre-existing leaks, not just new ones |
| gitleaks-action v2 | Official, maintained, supports custom config |
| Allow-list includes `actions-runner/` | Contains gitignored runner credential files that gitleaks would flag |
| Generic secret rule with mock exclusions | Catches assignments like `secret = "..."` but excludes test/mock/placeholder values |

---

## Implementation Notes

### Approach

Created `.gitleaks.toml` with 6 custom rules:
1. Telegram bot tokens (`\d{8,10}:[\w-]{35}`)
2. OpenAI API keys (`sk-...T3BlbkFJ...`)
3. Anthropic API keys (`sk-ant-...`)
4. Google AI API keys (`AIza...`)
5. OpenClaw API keys (`oc_...`)
6. Generic secret assignments with mock/test exclusions

Added `secrets-scan` job to `.github/workflows/quality-gate.yml` as a
prerequisite for the main `quality-gate` job. Uses `fetch-depth: 0` for
full history scanning.

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `.gitleaks.toml` | Created | Gitleaks config with 6 custom rules and allow-list |
| `.github/workflows/quality-gate.yml` | Modified | Added `secrets-scan` job before quality-gate |
| `docs/tasks/0113-secrets-scanning-ci.md` | Created | Task specification |
| `docs/walkthroughs/0113-secrets-scanning-ci.md` | Created | This walkthrough |

---

## Follow-ups

- Consider adding pre-commit hook for local scanning (out of scope)
- Monitor false positive rate after first few PRs and tune allow-list
