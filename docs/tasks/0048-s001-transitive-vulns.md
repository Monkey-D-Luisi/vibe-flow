# Task 0048: S-001 — Transitive Dependency Vulnerabilities (HIGH)

## Source Finding IDs
S-001

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Security |
| Severity | HIGH |
| Confidence | HIGH |
| Evidence | 13 HIGH-severity transitive vulnerabilities in glob, tar, and minimatch packages introduced via the openclaw host dependency |
| Impact | Unpatched HIGH vulns in the dependency tree; exploitability is indirect but reportable in any security scan |
| Recommendation | Upgrade openclaw to a version that resolves these transitive vulns, or add time-bounded exception ledger entries pending upstream fix |

## Objective
Track and manage the 13 HIGH transitive vulnerabilities inherited from the openclaw host dependency until the upstream package releases a patched version. All findings are covered by active exception ledger entries expiring 2026-05-28.

## Acceptance Criteria
- [ ] Upstream openclaw releases a version that resolves glob, tar, and minimatch transitive vulnerabilities
- [ ] All active exception ledger entries (expiry 2026-05-28) are renewed or resolved before expiry
- [ ] `pnpm run verify:vuln-policy` passes with zero unexcepted HIGH findings
- [ ] Exception ledger entries are closed/removed after upstream fix is applied

## Status
BLOCKED — upstream openclaw must release fix; all 13 findings covered by active ledger exceptions expiring 2026-05-28
