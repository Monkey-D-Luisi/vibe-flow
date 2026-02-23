# PR Review: <PR Title>

## PR Info

| Field | Value |
|-------|-------|
| PR | #<number> |
| Author | <username> |
| Branch | `<branch-name>` |
| Target | `main` |
| Task | `docs/tasks/NNNN-<description>.md` |
| Date | YYYY-MM-DD |

---

## Summary

<1-3 sentences describing what the PR does and why.>

---

## Review Checklist

### Code Quality

- [ ] No `any` types
- [ ] No `@ts-ignore` without justification
- [ ] Files under 500 LOC
- [ ] Functions have single responsibilities
- [ ] Error handling: no bare catch blocks
- [ ] ESM imports use `.js` extensions
- [ ] Naming follows conventions

### Architecture

- [ ] Hexagonal layer boundaries respected
- [ ] Domain has no external dependencies
- [ ] Tools use TypeBox schemas
- [ ] Dependencies flow inward only
- [ ] No circular dependencies

### Security

- [ ] No secrets in code
- [ ] SQL uses parameterized statements
- [ ] Input validation present
- [ ] No path traversal risks

### Testing

- [ ] New code has tests
- [ ] Tests follow describe/it convention
- [ ] No skipped tests without justification
- [ ] Coverage meets threshold
- [ ] Tests are deterministic

### Documentation

- [ ] Public APIs have JSDoc
- [ ] Walkthrough updated
- [ ] ADR created if needed

---

## Findings

### MUST_FIX

| # | File | Line | Description |
|---|------|------|-------------|
| 1 | | | |

### SHOULD_FIX

| # | File | Line | Description |
|---|------|------|-------------|
| 1 | | | |

### SUGGESTION

| # | File | Line | Description |
|---|------|------|-------------|
| 1 | | | |

### OUT_OF_SCOPE

| # | Description |
|---|-------------|
| 1 | |

---

## Verdict

<APPROVE | REQUEST_CHANGES | COMMENT>

<Summary of the review decision and key action items.>
