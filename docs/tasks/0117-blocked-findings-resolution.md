# Task 0117 — Blocked Infrastructure Findings Resolution

**Epic:** EP17 — Security & Stability v2
**Status:** DONE
**Assignee:** agent

## Objective

Re-evaluate all blocked findings from Task 0078 and either resolve them
(if the blocker has been cleared) or formally defer them with a rationale
and specific re-evaluation date.

## Findings Resolution

### RESOLVED

| ID | Finding | Resolution | Resolved by |
|----|---------|------------|-------------|
| A-004 | Vitest version skew (^3 vs ^4) | All 8 workspaces pinned to exact `4.0.18` | Task 0115 |
| D-008 | Coverage/complexity not blocking CI | Coverage and complexity outcomes now contribute to CI verdict; `bypass-quality-gate` label escape hatch added | Task 0116 |

### FORMALLY DEFERRED

| ID | Finding | Blocker | Mitigation | Re-eval date |
|----|---------|---------|------------|--------------|
| SEC-001/A-001 | `actions-runner/` directory in repo tree | Moving runner requires service downtime and re-registration; requires infra coordination | Directory is gitignored (line 72); no credential files are tracked; `.gitleaks.toml` allowlists the directory | 2026-06-30 |
| SEC-004 | `shell: true` on Windows in `spawn.ts:147` | `shell: false` requires `cross-spawn` or explicit `.cmd` resolution; adds complexity for marginal benefit | `assertSafeCommand()` validates against metachar regex + command allowlist before every spawn; test coverage exists for injection attempts | 2026-06-30 |
| SEC-005 | Transitive vulnerabilities via `openclaw` | All vulns are in upstream `openclaw` dependency chain; no direct pin available | Active exception ledger covers all advisories (S-001-01 through S-003-21); CI enforces `pnpm verify:vuln-policy`; ledger entries expire 2026-05-28 to 2026-06-28 | 2026-06-30 |

## Acceptance Criteria

- [x] A-004 resolved (Task 0115)
- [x] D-008 resolved (Task 0116)
- [x] SEC-001/A-001 formally deferred with rationale and date
- [x] SEC-004 formally deferred with rationale and date
- [x] SEC-005 formally deferred with rationale and date
- [x] No finding left in "blocked, unknown timeline" state
