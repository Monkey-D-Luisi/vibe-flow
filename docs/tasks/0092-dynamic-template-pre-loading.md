# Task: 0092 -- Dynamic Template Pre-Loading

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP12 -- Agent Learning Loop |
| Priority | MEDIUM |
| Scope | MINOR |
| Created | 2026-03-09 |
| Branch | `feat/EP12-agent-learning-loop` |

---

## Goal

Detect recurring output patterns from workflow steps and pre-load them as prompt prefixes, reducing token usage and improving consistency for repetitive agent tasks.

---

## Acceptance Criteria

1. `TemplateDetector` class analyzes workflow step outputs
2. `extractSkeleton()` replaces values with type placeholders (`<string>`, `<number>`, etc.)
3. `findDominantSkeleton()` with 80% match threshold for template recognition
4. Template versioning (increments when skeleton changes)
5. Expiry after 20 unused pipeline runs
6. `formatAsPromptPrefix()` generates ready-to-inject prompt text
7. Templates persisted in `output_templates` SQLite table

---

## Files Changed

- `extensions/product-team/src/orchestrator/template-detector.ts` (new)
- `extensions/product-team/test/orchestrator/template-detector.test.ts` (new)
