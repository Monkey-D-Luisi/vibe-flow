# Task 0076: D-009 — Coverage Threshold Floors (MEDIUM)

## Source Finding IDs
D-009

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Development |
| Severity | MEDIUM |
| Confidence | CONFIRMED |
| Evidence | Vitest configs across 7 workspaces have inconsistent coverage thresholds: product-team 85/75/90/85, model-router 80/65/85/80, create-extension 80/75/80/80, quality-gate 50/75/60/50, quality-contracts 25/25/25/25, telegram-notifier none, stitch-bridge none |
| Impact | Two workspaces (telegram-notifier, stitch-bridge) have no coverage enforcement at all; quality-contracts at 25% is highly permissive; coverage regressions go undetected in these packages |
| Recommendation | Set minimum threshold floor (e.g., 60% statements/lines, 50% branches, 70% functions) across all workspaces; raise quality-contracts thresholds to reflect actual coverage |

### Current Thresholds

| Workspace | Stmts | Branches | Functions | Lines |
|-----------|-------|----------|-----------|-------|
| product-team | 85 | 75 | 90 | 85 |
| model-router | 80 | 65 | 85 | 80 |
| create-extension | 80 | 75 | 80 | 80 |
| quality-gate | 50 | 75 | 60 | 50 |
| quality-contracts | 25 | 25 | 25 | 25 |
| telegram-notifier | — | — | — | — |
| stitch-bridge | — | — | — | — |

## Objective
Establish minimum coverage threshold floors across all workspaces to prevent silent coverage regression.

## Acceptance Criteria
- [ ] `telegram-notifier` vitest config has coverage thresholds set
- [ ] `stitch-bridge` vitest config has coverage thresholds set
- [ ] `quality-contracts` thresholds raised to reflect actual coverage (currently well above 25%)
- [ ] Minimum floor of 60% statements/lines, 50% branches, 70% functions applied where missing
- [ ] All workspaces pass their coverage thresholds
- [ ] `pnpm test` passes with no threshold violations

## Status
PLANNED

## Traceability
| Field | Value |
|-------|-------|
| Audit | 2026-03-05-full-audit.md |
| Finding | D-009 |
