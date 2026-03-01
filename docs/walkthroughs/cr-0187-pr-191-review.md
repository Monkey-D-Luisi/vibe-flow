# CR-0187 Walkthrough: PR #191 Review — Refactor Large GitHub Module Files

## Summary

Code review of PR #191 (`feat/0029-refactor-large-github-module-files`). Three fixes applied; four Gemini/independent findings documented as out-of-scope with rationale.

---

## Findings resolved

### F-01: Duplicate `asString` + split imports in `pr-bot-core.ts`

`pr-bot-core.ts` defined a private `asString` that was identical to the exported `asString` in `pr-bot-labels.ts`. The file also had two separate `import` statements from the same module. Both issues fixed in one edit:

- Merged the two `import … from './pr-bot-labels.js'` into a single statement that also includes `asString`
- Removed the private `asString` function

### F-02: Magic number `19` in `ci-feedback-metadata.ts`

`existingHistory.slice(-19)` was replaced with `existingHistory.slice(-(MAX_CI_HISTORY_ENTRIES - 1))`, where the new top-level constant `MAX_CI_HISTORY_ENTRIES = 20` makes the 20-entry cap explicit.

### F-03: Nested ternary in `pr-bot-core.ts:toPrCreateResult`

The dense chained ternary for parsing `prNumber` was replaced with an explicit `if/else if/else` block.

---

## Out-of-scope findings (with rationale)

| Finding | Decision |
|---------|----------|
| Gemini: Webhook signature verification | Pre-existing behaviour. Verification belongs at the HTTP-adapter layer where the raw body buffer is available. Tracked as a future security-hardening task. |
| Gemini: Markdown injection via `taskUrl`/`task.title` | Pre-existing. GitHub sanitises `javascript:` URIs. Newline injection in title is a real follow-up item. |
| `asRecord` private copy in `ci-feedback-metadata.ts` | Importing from `pr-bot-labels.js` would couple the `ci-feedback-*` family to `pr-bot-*`. A shared `github-utils.ts` extraction is needed — separate refactoring task. |
| Duplicate `Logger`/`PrBotLogger` interfaces | Consolidation touches both module families and is a separate refactoring. |
| No unit tests for new pure functions | Valid gap, tracked as a separate task. |
| `toLabelInput` implicit default | FALSE_POSITIVE — function is only called with labels produced by `extractMetadataLabels`, which exclusively emits `scope:*`, `epic:*`, `area:*` prefixes. |

---

## Commands run

```bash
pnpm --filter product-team typecheck   # 0 errors
pnpm --filter product-team test        # 394 passed, 0 failed
pnpm --filter product-team lint        # 0 errors
```

---

## Files changed

| File | Change |
|------|--------|
| `extensions/product-team/src/github/pr-bot-core.ts` | Merged imports, removed duplicate `asString`, refactored nested ternary |
| `extensions/product-team/src/github/ci-feedback-metadata.ts` | Added `MAX_CI_HISTORY_ENTRIES` constant; replaced magic number |
| `docs/tasks/cr-0187-pr-191-review.md` | Created |
| `docs/walkthroughs/cr-0187-pr-191-review.md` | Created |

---

## Verification

- TypeScript: 0 errors
- Tests: 394 passed
- Lint: 0 errors
