# Task 0074: P-005 + A-002 — Documentation and Architecture Notes (LOW-MEDIUM)

## Source Finding IDs
P-005, A-002

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Product (P-005), Architecture (A-002) |
| Severity | LOW (P-005), MEDIUM (A-002) |
| Confidence | CONFIRMED |
| Evidence | P-005: CLAUDE.md tool descriptions do not explain that `quality_complexity` (AST-based, task-lifecycle-aware) and `qgate_complexity` (regex heuristic, stateless) produce different numbers; A-002: `pnpm-workspace.yaml` includes `packages/*`, `extensions/*`, `tools/*` but not `skills/*` — skills are Markdown-only prompt libraries but this exclusion is undocumented |
| Impact | P-005: agents may be confused by differing complexity numbers without understanding the methodological difference; A-002: contributors may incorrectly assume skills should have package.json files or be buildable |
| Recommendation | P-005: add comparison note to CLAUDE.md explaining the difference; A-002: document skills workspace status in CLAUDE.md or architecture docs |

## Objective
Add documentation clarifying complexity tool differences and skills workspace status.

## Acceptance Criteria
- [x] CLAUDE.md updated with note explaining `quality_complexity` vs `qgate_complexity` methodological difference
- [x] Skills workspace status documented (Markdown-only, intentionally excluded from pnpm workspace)
- [x] No formatting or link issues in updated docs

## Status
DONE — commit ebe346e

## Traceability
| Field | Value |
|-------|-------|
| Audit | 2026-03-05-full-audit.md |
| Findings | P-005, A-002 |
| Commit | ebe346e |
