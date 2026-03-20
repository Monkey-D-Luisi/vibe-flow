# Task 0129 -- Canvas Engine Core

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP20 -- Virtual Office |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-20 |
| Branch | `feat/EP20-virtual-office` |

---

## Goal

Replace the placeholder Canvas 2D rendering in `office.ts` with a modular game engine: game loop, tile map, camera, renderer, character FSM, and agent entities.

---

## Context

Task 0128 created `src/public/office.ts` with a static placeholder rendering colored squares for 8 agents on a 20x12 tile grid. This task replaces that with a real engine capable of animation, state transitions, and entity management.

---

## Scope

### In Scope

- Game loop with fixed timestep (60fps logic) and variable render
- Camera system (centered viewport, responsive resize)
- Tile map (20x12 grid with wall, floor, desk, meeting, coffee, server-rack zones)
- Zone definitions for agent positions and semantic areas
- Character FSM (idle, walking, typing, reading, meeting states)
- Agent entity class with position, FSM state, movement target
- Renderer drawing tilemap and entities
- Shared pure-logic modules for testability (fsm-types, tile-data)

### Out of Scope

- Pixel art sprites (task 0130)
- Network connectivity (task 0131)
- State mapping from pipeline data (task 0132)
- Interactivity (task 0133)

---

## Acceptance Criteria

- [ ] AC1: `pnpm typecheck` passes with new shared modules
- [ ] AC2: Game loop runs at stable 60fps with no dropped frames
- [ ] AC3: 20x12 tile grid renders with distinct zone coloring
- [ ] AC4: 8 agent entities display at their desk positions with labels
- [ ] AC5: Character FSM transitions between states correctly
- [ ] AC6: Idle animation (subtle bob effect) visible on all agents
- [ ] AC7: Window resize maintains centered layout
- [ ] AC8: All tests pass (FSM + tile data)

---

## Definition of Done

- [ ] All Acceptance Criteria met
- [ ] Tests written and passing
- [ ] Coverage meets threshold (>= 50%)
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated
