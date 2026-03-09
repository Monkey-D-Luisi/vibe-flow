# Walkthrough: 0092 -- Dynamic Template Pre-Loading

## Task Reference

- Task: `docs/tasks/0092-dynamic-template-pre-loading.md`
- Epic: EP12 -- Agent Learning Loop
- Branch: `feat/EP12-agent-learning-loop`
- PR: (pending)

---

## Summary

Implemented a `TemplateDetector` that analyzes workflow step outputs, detects recurring structural patterns via skeleton extraction, and generates prompt prefixes for template pre-loading. Templates are versioned, expire after inactivity, and stored in SQLite.

---

## Context

Agents often produce outputs with similar structure across pipeline runs (e.g., PR descriptions, code review feedback). By detecting these patterns and pre-loading them as prompt context, we reduce token waste and improve output consistency.

## Key Decisions

1. **Skeleton extraction**: Pure function `extractSkeleton()` replaces concrete values with type placeholders (`<string>`, `<number>`, `<boolean>`, `<null>`, `<array[N]>`, `<object{keys}>`). This normalizes outputs for structural comparison.
2. **80% dominance threshold**: A skeleton must appear in ≥80% of recent outputs to qualify as a template. This avoids premature template lock-in.
3. **Expiry mechanism**: Templates expire after 20 unused pipeline runs, preventing stale templates from persisting.
4. **Version bumping**: When the dominant skeleton changes, the template version increments rather than replacing, preserving audit trail.

## Testing

- 22 unit tests covering skeleton extraction, template detection, versioning, expiry, prompt formatting, and edge cases
- All tests use in-memory SQLite
