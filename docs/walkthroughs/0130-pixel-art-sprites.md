# Walkthrough 0130 -- Pixel Art Sprite Generation

## Task Reference

- Task: `docs/tasks/0130-pixel-art-sprites.md`
- Epic: EP20 -- Virtual Office
- Branch: `feat/EP20-virtual-office`

---

## Summary

Created procedural 16x16 pixel-art sprites for all 8 agents with animation frames for idle, walk, type, read, and meeting states.

---

## Approach

### Sprite Data (`src/public/agents/sprite-data.ts`)

Each sprite is a `Uint8Array(256)` with 6-slot palette indices:
- 0 = transparent, 1 = skin, 2 = hair, 3 = shirt, 4 = pants, 5 = accent

Base humanoid template provides 10 frames covering all FSM states:
- **Idle**: 2 frames (breathing effect -- torso 1px shift)
- **Walking**: 4 frames (2 base + 2 horizontally flipped for leg alternation)
- **Typing**: 2 frames (arms extended at desk level, slight alternation)
- **Reading**: 2 frames (head tilted, holding paper with accent-colored document)
- **Meeting**: 2 frames (reuses idle -- standing near table)

### Per-agent Differentiation

Each agent gets:
1. **Unique color palette** (shirt color matches existing agent brand colors)
2. **Distinguishing feature** via pixel overlay:
   - PM: tie, Tech Lead: glasses, PO: earring, Designer: beret
   - Back-1: hoodie hood, Front-1: headphones, QA: badge, DevOps: cap

### Sprite Renderer (`src/public/agents/sprite-renderer.ts`)

`drawSprite()` iterates the 16x16 grid, resolves palette indices to hex colors, and calls `ctx.fillRect()` per non-transparent pixel at the given scale. Simple, no atlas needed.

---

## Files

| File | LOC | Purpose |
|------|-----|---------|
| `src/public/agents/sprite-data.ts` | ~295 | All base frames, palettes, features, generation |
| `src/public/agents/sprite-renderer.ts` | ~52 | Pixel-by-pixel canvas rendering |
| `test/sprite-data.test.ts` | ~73 | 7 tests: counts, dimensions, bounds, uniqueness |

---

## Test Results

- 7 tests: agent count, FSM state coverage, frame dimensions (256 bytes), frame counts per state, palette index bounds (0-5), palette-to-colors mapping, unique shirt colors
- All 57 tests passing across 7 test files

---

## Checklist

- [x] Task spec read end-to-end
- [x] All ACs verified
- [x] Quality gates passed
