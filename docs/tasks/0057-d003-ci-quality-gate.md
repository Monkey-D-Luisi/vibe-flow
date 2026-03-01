# Task 0057: D-003 — CI Quality Gate Enforcement Job (MEDIUM)

## Source Finding IDs
D-003

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Development |
| Severity | MEDIUM |
| Confidence | HIGH |
| Evidence | `.github/workflows/ci.yml` runs tests and lint but has no job that executes `pnpm q:gate`; the quality gate CLI exists but is never invoked in CI, so gate enforcement is manual-only |
| Impact | Quality regressions (complexity spikes, coverage drops, lint score degradation) are invisible to CI; PRs can merge without gate checks |
| Recommendation | Add a dedicated `quality-gate` job to `ci.yml` that generates coverage artifacts and runs `pnpm q:gate --source artifacts --scope minor`; add `quality-contracts` to coverage policy |

## Objective
Add a `quality-gate` CI job to the GitHub Actions workflow that enforces quality gate checks on every PR, and ensure `quality-contracts` is included in coverage policy tracking.

## Acceptance Criteria
- [x] `quality-contracts` filter added to coverage policy step in `ci.yml`
- [x] New `quality-gate` job added (depends on `test-lint-build`)
- [x] Job includes: checkout, pnpm setup, install, native module rebuild, generate coverage artifacts
- [x] Job runs `pnpm q:gate --source artifacts --scope minor`
- [x] CI YAML is valid
- [ ] Branch protection configured to require `quality-gate` job as a required check (infra — GitHub repo settings)

## Status
DONE
