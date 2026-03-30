# Task: 0123 -- ADR Backlog -- Key Architectural Decisions

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP19 -- Showcase & Documentation |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-30 |
| Branch | `feat/EP19-showcase-documentation` |

---

## Goal

Create ADRs for the most important architectural decisions made during phases 1-12,
providing a comprehensive decision record that helps newcomers understand why the
system is built the way it is.

---

## Context

The project has 5 ADRs (ADR-001 through ADR-005) covering migration to OpenClaw,
SQLite persistence, quality-gate separation, spawn utilities, and nudge engine.
Many significant architectural decisions from EP02-EP12 are undocumented: hexagonal
architecture, event log design, lease-based ownership, JSON Schema contracts, dual
complexity analysis, Docker deployment, multi-model routing, decision engine, pipeline
stages, Telegram integration, and rule-based learning.

---

## Scope

### In Scope

- 11 new ADRs (ADR-006 through ADR-016) covering key decisions from EP02-EP12
- Each ADR follows the existing template format in `docs/adr/_TEMPLATE.md`
- Alternatives considered with rationale for rejection
- Consequences (positive, negative, neutral)
- Cross-references to relevant epics and tasks

### Out of Scope

- Modifying existing ADRs (ADR-001 through ADR-005)
- ADRs for decisions not yet made (future phases)
- Implementation changes to support ADRs

---

## Requirements

1. Each ADR documents a real architectural decision made during implementation
2. Alternatives section includes at least 2 rejected options with reasons
3. Consequences include both positive and negative outcomes
4. ADRs reference the epic/phase where the decision was made
5. Consistent format matching existing ADR-001 through ADR-005

---

## Acceptance Criteria

- [x] AC1: >= 10 ADRs covering phases EP02 through EP12
- [x] AC2: Each ADR lists alternatives considered and rationale for rejection
- [x] AC3: Consequences include both positive and negative outcomes
- [x] AC4: ADRs cross-reference relevant tasks and epics
- [x] AC5: Consistent format matching ADR-001

---

## Implementation Steps

1. Create ADR-006 through ADR-016 using the template format
2. Research the codebase for context on each decision
3. Document alternatives that were considered and why they were rejected
4. Add positive/negative/neutral consequences
5. Cross-reference relevant epics and tasks

---

## Testing Plan

- Manual review: All ADRs follow the template format
- Manual review: Each ADR has at least 2 alternatives considered
- Manual review: Consequences are balanced (positive + negative)
- Lint: No markdown lint violations
