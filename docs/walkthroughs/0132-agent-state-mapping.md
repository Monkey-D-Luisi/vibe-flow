# Walkthrough 0132 -- Agent State Mapping

## Task Reference

- Task: `docs/tasks/0132-agent-state-mapping.md`
- Epic: EP20 -- Virtual Office
- Branch: `feat/EP20-virtual-office`

---

## Summary

Connected server-side pipeline data to frontend visualization by mapping pipeline stages to office locations and tool activity to FSM animation states.

---

## Approach

### Stage Location Map (`src/shared/stage-location-map.ts`)

Duplicates `PIPELINE_STAGES` and `STAGE_OWNERS` from product-team (cross-extension imports not possible at runtime). Maps each stage to an office location:
- Planning stages (IDEA, ROADMAP, REFINEMENT, DECOMPOSITION) → meeting room
- DESIGN → near designer desk area
- IMPLEMENTATION, QA, REVIEW, DONE → own desk
- SHIPPING → server rack area

### Tool Action Map (`src/shared/tool-action-map.ts`)

Maps tool name prefixes to FSM states using first-match pattern matching:
- `quality_*` / `qgate_*` → typing (running tests)
- `task_search` / `task_get` → reading
- `team_message` / `team_reply` → meeting
- `pipeline_advance` → walking
- Unknown tools → typing (default coding assumption)

### State Mapper (`src/public/agents/state-mapper.ts`)

Reads `_serverState` from entities (set by state-sync.ts) and applies:
1. Target position from pipeline stage location
2. FSM animation from tool activity (when at target) or stage activity

### Pathfinder (`src/public/agents/pathfinder.ts`)

Simple horizontal-then-vertical tile movement with wall avoidance fallbacks.

---

## Files

| File | LOC | Purpose |
|------|-----|---------|
| `src/shared/stage-location-map.ts` | ~85 | Pipeline stage → office position |
| `src/shared/tool-action-map.ts` | ~65 | Tool name → FSM animation |
| `src/public/agents/state-mapper.ts` | ~65 | Server state → entity behavior |
| `src/public/agents/pathfinder.ts` | ~70 | Tile-by-tile movement |
| `test/stage-location-map.test.ts` | ~60 | 7 tests |
| `test/tool-action-map.test.ts` | ~45 | 8 tests |

---

## Test Results

- 15 new tests (7 stage-location + 8 tool-action)
- Total: 72 tests passing across 9 test files

---

## Checklist

- [x] Task spec read end-to-end
- [x] All ACs verified
- [x] Quality gates passed
