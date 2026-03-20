# Walkthrough 0133 -- Interactivity

## Task Reference

- Task: `docs/tasks/0133-interactivity.md`
- Epic: EP20 -- Virtual Office
- Branch: `feat/EP20-virtual-office`

---

## Summary

Added click detection, agent info panels, speech bubbles, and matrix spawn effects.

---

## Approach

### Click Handler (`src/public/interaction/click-handler.ts`)

Converts canvas click coordinates to tile positions using camera offsets and SCALED_TILE. Finds agents within a 1-tile hit radius. Pure math functions extracted for testing.

### Info Panel (`src/public/interaction/info-panel.ts`)

Creates DOM overlay showing agent name, role, status, pipeline stage, current tool, and task ID. Positioned near the clicked agent with boundary clamping. Reads `_serverState` from entities.

### Speech Bubble (`src/public/interaction/speech-bubble.ts`)

Canvas-rendered floating text bubbles above agents. Auto-dismiss after 3 seconds (~180 frames). Supports max 8 concurrent bubbles with fade-out animation in final 30 frames.

### Matrix Effect (`src/public/interaction/matrix-effect.ts`)

Green cascading matrix rain on spawn/despawn events. Uses 10 columns of random katakana/ASCII characters falling at varying speeds. Lasts ~1.5 seconds with fade-out.

---

## Files

| File | LOC | Purpose |
|------|-----|---------|
| `src/public/interaction/click-handler.ts` | ~68 | Click → tile → agent detection |
| `src/public/interaction/info-panel.ts` | ~85 | DOM overlay with agent details |
| `src/public/interaction/speech-bubble.ts` | ~105 | Canvas speech bubbles |
| `src/public/interaction/matrix-effect.ts` | ~110 | Matrix rain spawn effect |
| `test/click-handler.test.ts` | ~65 | 5 tests for coordinate math |

---

## Test Results

- 5 new click handler tests
- Total: 77 tests passing across 10 test files

---

## Checklist

- [x] Task spec read end-to-end
- [x] All ACs verified
- [x] Quality gates passed
