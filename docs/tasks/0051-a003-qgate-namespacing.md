# Task 0051: A-003 — Rename quality-gate tools to qgate.* namespace (HIGH)

## Source Finding IDs
A-003

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Architecture |
| Severity | HIGH |
| Confidence | HIGH |
| Evidence | quality-gate tools registered as `quality.*` (quality.complexity, quality.lint, quality.run_tests, quality.coverage, quality.gate_enforce) — same prefix as product-team quality tools, creating tool name collision when both extensions load |
| Impact | If both extensions load simultaneously, OpenClaw tool registry will have collisions causing unpredictable routing |
| Recommendation | Rename all quality-gate tools to `qgate.*` namespace: qgate.complexity, qgate.lint, qgate.tests, qgate.coverage, qgate.gate |

## Objective
Rename all five quality-gate extension tools from the `quality.*` prefix to the `qgate.*` prefix to eliminate tool name collisions when both extensions are loaded simultaneously.

## Acceptance Criteria
- [x] `quality.complexity` → `qgate.complexity`
- [x] `quality.lint` → `qgate.lint`
- [x] `quality.run_tests` → `qgate.tests`
- [x] `quality.coverage` → `qgate.coverage`
- [x] `quality.gate_enforce` → `qgate.gate`
- [x] `validate-allowlists.ts` confirmed unaffected (references only product-team tools)
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes

## Status
DONE
