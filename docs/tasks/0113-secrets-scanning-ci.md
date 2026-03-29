# Task: 0113 -- Secrets Scanning in CI (Gitleaks)

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP17 -- Security & Stability v2 |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-29 |
| Branch | `feat/EP17-security-stability-v2` |

---

## Goal

Add automated secrets scanning to the CI pipeline using gitleaks to prevent
accidentally committed secrets, API keys, tokens, and credentials from reaching
the repository.

---

## Context

No secrets scanning exists in CI. The quality-gate workflow runs tests, coverage,
lint, complexity, and vulnerability policy checks — but nothing scans for leaked
credentials. With multiple API provider integrations (OpenAI, Anthropic, Google AI,
Telegram), the risk of accidental secret exposure is non-trivial.

---

## Scope

### In Scope

- `.gitleaks.toml` configuration with project-specific rules
- Gitleaks GitHub Action job in quality-gate workflow
- Allow-list for false positives (test fixtures, docs, actions-runner)
- Custom rules for Telegram bot tokens, OpenAI/Anthropic/Google AI/OpenClaw keys

### Out of Scope

- Pre-commit hooks (local-only, not enforced)
- Secret rotation automation
- Vault or secret manager integration

---

## Requirements

1. Gitleaks runs on every PR targeting main
2. Custom rules detect project-specific credential patterns
3. Allow-list prevents false positives in test fixtures and documentation
4. Findings block merge (required status check)
5. Job completes in < 60 seconds

---

## Acceptance Criteria

- [x] AC1: `.gitleaks.toml` exists with custom rules for Telegram, OpenAI, Anthropic, Google AI, OpenClaw
- [x] AC2: `secrets-scan` job added to quality-gate workflow using gitleaks-action v2
- [x] AC3: Secrets scan runs before quality-gate job (dependency chain)
- [x] AC4: Allow-list covers test fixtures, snapshots, docs, actions-runner, lockfile
- [x] AC5: Generic secret detection with exclusions for test/mock values

---

## Definition of Done

- [x] `.gitleaks.toml` created with project-specific rules and allow-list
- [x] CI workflow updated with `secrets-scan` job
- [x] Scan blocks merge on findings
- [x] Walkthrough updated
