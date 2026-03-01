# Task 0054: P-001 + A-006 — Documentation Inventory and Algorithm Note (MEDIUM)

## Source Finding IDs
P-001, A-006

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Product (P-001), Architecture (A-006) |
| Severity | MEDIUM |
| Confidence | HIGH |
| Evidence | P-001: CLAUDE.md lists only 8 skills but 14 exist; lists deleted `packages/schemas`; `openclaw.plugin.json` only registers 6 of 14 skills; A-006: `qgate.complexity` uses a regex heuristic approach but tool description says nothing about the approximation — callers have no way to know it is not AST-based |
| Impact | P-001: agents and humans rely on CLAUDE.md as a registry; stale entries cause confusion and misdirected work; A-006: callers may rely on complexity counts as authoritative; misreporting can silently pass or fail quality gates |
| Recommendation | P-001: update CLAUDE.md skills list and openclaw.plugin.json to register all 14 skills; remove deleted packages ref; A-006: add ALGORITHM NOTE comment and update tool description to say "fast, approximate" |

## Objective
Synchronize CLAUDE.md and openclaw.plugin.json with the actual 14-skill inventory, and add an algorithm disclosure note to the qgate.complexity tool explaining the regex heuristic approximation.

## Acceptance Criteria
- [x] CLAUDE.md updated with complete Registered Tools section (31 product-team + 5 qgate tools)
- [x] CLAUDE.md skills list updated to all 14 skills
- [x] Reference to deleted `packages/schemas` removed from CLAUDE.md
- [x] `openclaw.plugin.json` registers all 14 skills (previously 6)
- [x] 8 newly registered skills: adr, backend-dev, devops, frontend-dev, patterns, product-owner, tech-lead, ui-designer
- [x] ALGORITHM NOTE added to qgate.complexity tool header (14 lines minimum)
- [x] qgate.complexity tool description updated to say "fast, approximate"
- [x] `pnpm typecheck` passes

## Status
DONE
