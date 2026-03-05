# Task 0075: D-002 through D-007 — Coverage Gap Tests (MEDIUM)

## Source Finding IDs
D-002, D-003, D-004, D-005, D-006, D-007

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Development |
| Severity | MEDIUM |
| Confidence | CONFIRMED |
| Evidence | Six product-team files with branch coverage below 60%: `graceful-shutdown.ts` (33% branches), `ci-feedback-metadata.ts` (30% branches), `ci-feedback-transition.ts` (54% lines), `quality-complexity.ts` (42% branches), `quality-coverage.ts` (42% branches), `ci-feedback-utils.ts` (59% branches) |
| Impact | Error paths, edge cases, and fallback logic in these files are untested; regressions in shutdown handling, CI feedback processing, and quality tool error paths go undetected |
| Recommendation | Add targeted unit tests for each file focusing on untested branches: error handlers, catch blocks, edge-case inputs, and fallback logic |

### Per-File Detail

| ID | File | Lines | Branches | Gap |
|----|------|-------|----------|-----|
| D-002 | `graceful-shutdown.ts` | 69% | 33% | Shutdown error paths (catch branches) untested |
| D-003 | `ci-feedback-metadata.ts` | — | 30% | 9 of 13 branches in metadata extraction untested |
| D-004 | `ci-feedback-transition.ts` | 54% | 61% | Auto-transition edge cases under-tested |
| D-005 | `quality-complexity.ts` | — | 42% | Complexity tool error/fallback branches untested |
| D-006 | `quality-coverage.ts` | 73% | 42% | Coverage reporting edge cases untested |
| D-007 | `ci-feedback-utils.ts` | — | 59% | 29 untested branches in CI utility functions |

## Objective
Close the coverage gap cluster by adding targeted tests for all six files, raising branch coverage above 70% for each.

## Acceptance Criteria
- [ ] `graceful-shutdown.ts` branch coverage raised above 70% with error path tests
- [ ] `ci-feedback-metadata.ts` branch coverage raised above 70% with metadata extraction tests
- [ ] `ci-feedback-transition.ts` line and branch coverage raised above 70% with edge case tests
- [ ] `quality-complexity.ts` branch coverage raised above 70% with error/fallback tests
- [ ] `quality-coverage.ts` branch coverage raised above 70% with edge case tests
- [ ] `ci-feedback-utils.ts` branch coverage raised above 70% with targeted branch tests
- [ ] All existing tests continue to pass
- [ ] Overall product-team branch coverage improved

## Status
PLANNED

## Traceability
| Field | Value |
|-------|-------|
| Audit | 2026-03-05-full-audit.md |
| Findings | D-002, D-003, D-004, D-005, D-006, D-007 |
