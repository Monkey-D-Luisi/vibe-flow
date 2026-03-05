# Walkthrough 0078: SEC-001/A-001 + SEC-004 + SEC-005 + A-004 + D-008 — Blocked Infra Findings (MEDIUM-HIGH)

## Source Finding IDs
SEC-001, A-001, SEC-004, SEC-005, A-004, D-008

## Execution Journal

### SEC-001/A-001: Actions Runner in Repo Tree
Previously tracked as D-005 in task 0060 (BLOCKED). The `actions-runner/` directory remains in the repo root. Gitignore coverage confirmed. Requires infra team to:
1. Stop the runner service
2. Move installation to external path (e.g., `C:/actions-runner/`)
3. Re-register with GitHub
4. Remove directory from repo

**Blocker:** Infra coordination, service downtime window, registration credentials.

### SEC-004: shell:true on Windows
`packages/quality-contracts/src/exec/spawn.ts` line 147 uses `shell: true` on Windows with a regex-based metacharacter denylist (`SHELL_META`). The `shell: false` approach requires resolving `.cmd` / `.bat` wrappers for Node.js tools on Windows, which needs dedicated research and platform-specific testing.

**Blocker:** Research needed. No safe replacement identified without risking breakage on Windows CI runners.

### SEC-005: Transitive Dependency Vulnerabilities
22 vulnerabilities (18 high, 3 moderate, 1 low) all via `openclaw` in model-router. None are directly exploitable — model-router does not use `tar`, `glob`, or `hono` directly. All covered by 19 active ledger exceptions (S-001-01 through S-003-19) expiring 2026-05-28 to 2026-06-28. CI enforcement via `pnpm verify:vuln-policy` is in place.

**Blocker:** Requires patched openclaw upstream release.

### A-004: Vitest Major Version Skew
`quality-contracts` uses vitest `^4.0.18` while all 6 other workspaces use `^3.0.0`. Upgrading all to ^4 risks breaking test APIs, coverage reporter formats, and CI configuration. Downgrading quality-contracts to ^3 may lose features already in use.

**Blocker:** Major version upgrade risk. Requires careful migration plan with regression testing.

### D-008: Coverage/Complexity Non-Blocking in CI
In `.github/workflows/quality-gate.yml`, the "Gate verdict" step checks `TESTS_OUTCOME`, `LINT_OUTCOME`, and `VULN_EXIT` but coverage and complexity use `continue-on-error: true`. Making them blocking requires team agreement on acceptable thresholds and potential for flaky failures.

**Blocker:** Requires ops/team decision on whether to enforce or document as informational.

### No Action Taken
No changes made to the repository. All five findings tracked with blockers documented.

## Verification Evidence
- SEC-001/A-001: `actions-runner/` confirmed present; gitignore confirmed; previously tracked in task 0060
- SEC-004: `shell: true` usage confirmed at spawn.ts:147; no safe alternative identified
- SEC-005: 22 vulns confirmed via `pnpm audit`; all covered by active ledger exceptions
- A-004: vitest ^4 in quality-contracts vs ^3 everywhere else confirmed
- D-008: `continue-on-error: true` confirmed in quality-gate.yml coverage/complexity steps

## Closure Decision
**Status:** BLOCKED
**Residual risk:** SEC-001/A-001: credential exposure via gitignore bypass (LOW); SEC-004: shell injection on Windows (LOW, mitigated by denylist); SEC-005: transitive vulns (LOW exploitability, ledger-covered); A-004: test API/format drift (LOW); D-008: silent coverage regressions (MEDIUM)
**Date:** 2026-03-05
