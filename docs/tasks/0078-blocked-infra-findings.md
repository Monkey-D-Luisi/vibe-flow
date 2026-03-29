# Task 0078: SEC-001/A-001 + SEC-004 + SEC-005 + A-004 + D-008 — Blocked Infra Findings (MEDIUM-HIGH)

## Source Finding IDs
SEC-001, A-001, SEC-004, SEC-005, A-004, D-008

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Security (SEC-001, SEC-004, SEC-005), Architecture (A-001, A-004), Development (D-008) |
| Severity | HIGH (SEC-001/A-001), MEDIUM (SEC-004, SEC-005, A-004, D-008) |
| Confidence | CONFIRMED |
| Evidence | SEC-001/A-001: `actions-runner/` directory in repo root contains `.credentials` and `.credentials_rsaparams` (RSA key material); gitignored but hygiene risk; SEC-004: `packages/quality-contracts/src/exec/spawn.ts:147` uses `shell: true` on Windows with regex denylist; SEC-005: 22 transitive vulns (18 high, 3 moderate, 1 low) via openclaw in model-router — all covered by active ledger exceptions; A-004: `packages/quality-contracts/package.json` uses vitest ^4 while all others use ^3 — major version skew; D-008: `.github/workflows/quality-gate.yml:203-230` — coverage/complexity non-blocking in quality gate workflow |
| Impact | SEC-001/A-001: accidental credential exposure if gitignore misconfigured; SEC-004: less robust command injection prevention on Windows; SEC-005: known vulns in dependency tree (low exploitability); A-004: incompatible test APIs and coverage format differences; D-008: coverage and complexity regressions not caught in CI |
| Recommendation | SEC-001/A-001: move runner outside repo (requires infra); SEC-004: investigate shell:false with .cmd resolution (requires research); SEC-005: upgrade openclaw when patched upstream; A-004: align vitest versions (major version upgrade risk); D-008: make coverage/complexity blocking or document decision (requires ops decision) |

### Per-Finding Detail

| ID | Blocker | Required Resolution |
|----|---------|-------------------|
| SEC-001/A-001 | Infra coordination | Move actions-runner outside repo tree; requires service downtime and re-registration |
| SEC-004 | Research needed | Investigate `shell: false` with .cmd resolution on Windows; requires Windows-specific testing |
| SEC-005 | Upstream dependency | Upgrade openclaw package when patched release available; all 22 vulns covered by ledger exceptions expiring 2026-05-28 to 2026-06-28 |
| A-004 | Major version risk | Align vitest ^3 vs ^4 across workspaces; major upgrade may break test APIs and coverage formats |
| D-008 | Ops decision | Make coverage/complexity blocking in quality-gate workflow; requires team agreement on policy |

## Objective
Track five blocked findings that require infrastructure changes, upstream releases, research, or operational decisions before they can be resolved.

## Acceptance Criteria
- [ ] SEC-001/A-001: `actions-runner/` moved outside repository tree; runner re-registered
- [ ] SEC-004: `shell: false` with .cmd resolution implemented and tested on Windows
- [ ] SEC-005: openclaw upgraded to version with patched transitive dependencies
- [ ] A-004: vitest version aligned across all 7 workspaces
- [ ] D-008: Coverage/complexity either made blocking in CI or documented as intentionally informational

## Status
RESOLVED — all findings resolved or formally deferred in Task 0117 (EP17)

### Resolution Summary
| ID | Resolution |
|----|-----------|
| A-004 | RESOLVED by Task 0115 (vitest pinned to exact 4.0.18) |
| D-008 | RESOLVED by Task 0116 (coverage/complexity blocking in CI) |
| SEC-001/A-001 | DEFERRED to 2026-06-30 (gitignored, gitleaks allowlisted) |
| SEC-004 | DEFERRED to 2026-06-30 (assertSafeCommand mitigation robust) |
| SEC-005 | DEFERRED to 2026-06-30 (exception ledger active, waiting upstream) |

## Traceability
| Field | Value |
|-------|-------|
| Audit | 2026-03-05-full-audit.md |
| Findings | SEC-001, A-001, SEC-004, SEC-005, A-004, D-008 |
| Prior tasks | 0060 (SEC-001/A-001 previously tracked as D-005) |
