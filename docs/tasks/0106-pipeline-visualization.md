# Task: 0106 -- /pipeline Visualization

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP15 -- Telegram Control Plane v2 |
| Priority | HIGH |
| Scope | MINOR |
| Created | 2026-03-21 |
| Branch | `feat/EP15-telegram-control-plane-v2` |

---

## Goal

Add /pipeline command showing active pipeline execution with 10-stage visualization, status icons, agent assignment, and duration.

---

## Context

The pipeline is the core workflow engine with 10 stages (IDEA through DONE). Operators need visibility into active pipelines via Telegram. This command renders a visual stage progression with completion indicators.

---

## Scope

### In Scope

- pipeline-view.ts command module
- 10-stage STAGE_ORDER constant
- OK/>>/ icons for completed/active/pending stages
- Single and multi-task rendering
- /pipeline <taskId> support

### Out of Scope

- Cost per stage
- Interactive stage transitions

---

## Requirements

1. 10-stage pipeline with ordered stages
2. OK for completed, >> for active, blank for pending
3. Single and multi-task views
4. Duration formatting
5. DataSource injection

---

## Acceptance Criteria

- [x] AC1: /pipeline renders 10-stage view
- [x] AC2: Shows active stage with >>
- [x] AC3: /pipeline <taskId> works
- [x] AC4: 9 tests pass

---

## Constraints

- Stage order must match the canonical 10-stage pipeline: IDEA, ROADMAP, STORIES, DECOMPOSITION, DESIGN, IMPLEMENTATION, QA, CODE_REVIEW, PR, DONE
- No breaking changes to existing Telegram bot registration

---

## Implementation Steps

1. Define STAGE_ORDER constant with 10 stages
2. Create DataSource interface for pipeline data retrieval
3. Implement pipeline-view.ts with stage rendering logic
4. Add single-task detail view with /pipeline <taskId>
5. Register command in index.ts
6. Write 9 unit tests with mock DataSource

---

## Testing Plan

- Unit tests: 9 tests covering multi-task view, single-task view, stage icons, duration formatting, edge cases
- Integration tests: N/A (DataSource abstraction decouples from real data)
- Contract tests: N/A

---

## Definition of Done

- [x] All Acceptance Criteria met
- [x] Tests written and passing
- [x] Coverage meets threshold (>= 70% minor)
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated
- [x] Code reviewed (if applicable)
- [x] PR created and linked

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/telegram-notifier/src/commands/pipeline-view.ts` | Created | Pipeline visualization with 10-stage rendering |
| `extensions/telegram-notifier/test/commands/pipeline-view.test.ts` | Created | 9 unit tests for pipeline visualization |
| `extensions/telegram-notifier/src/index.ts` | Modified | Register /pipeline command |

---

## Agent References

- [Architecture Standards](../../.agent/rules/architecture-standards.md) -- hexagonal layers, dependency rules
- [Coding Standards](../../.agent/rules/coding-standards.md) -- TypeScript, naming, error handling
- [Testing Standards](../../.agent/rules/testing-standards.md) -- Vitest, TDD, coverage, helpers
- [Transition Guard Evidence](../transition-guard-evidence.md) -- required metadata per transition
- [Error Recovery Patterns](../error-recovery.md) -- how to handle failures
- [Extension Integration](../extension-integration.md) -- how extensions interact
