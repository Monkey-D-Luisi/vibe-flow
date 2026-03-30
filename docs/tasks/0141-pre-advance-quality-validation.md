# Task: 0141 -- Pre-Advance Quality Validation

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP21 -- Agent Excellence & Telegram Command Center |
| Priority | HIGH |
| Scope | MAJOR |
| Created | 2026-03-21 |
| Branch | `feat/EP21-agent-excellence-telegram-command-center` |

---

## Goal

Enforce stage-specific quality rules in `pipeline_advance` so agents cannot
advance without passing the required quality checks for each stage.

---

## Context

Agents could call `pipeline_advance` and move to the next stage without any
proof of quality. A backend dev could claim IMPLEMENTATION is done without tests
passing or coverage meeting thresholds. The transition guard system existed but
did not enforce quality metrics at the pipeline level.

---

## Scope

### In Scope

- Stage quality rules configuration (`stage-quality-rules.ts`)
- Quality validation in advance handler (`pipeline-advance.ts`)
- Per-stage metric thresholds (tests, coverage, lint, complexity)
- Max retry limits to prevent infinite loops

### Out of Scope

- Self-evaluation scoring (Task 0144)
- Review loop protocol (Task 0146)

---

## Requirements

1. Each stage must define required quality checks
2. Advance must fail with clear error when checks don't pass
3. Configuration must be overridable per-project
4. Max retries prevent infinite quality loops

---

## Acceptance Criteria

- [x] AC1: Stage quality rules define checks for IMPLEMENTATION, QA, REVIEW
- [x] AC2: `pipeline_advance` rejects advance when quality checks fail
- [x] AC3: Error messages clearly identify which checks failed
- [x] AC4: Max retry limit prevents infinite advance loops
- [x] AC5: Integration tests verify quality enforcement

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 80% major)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
