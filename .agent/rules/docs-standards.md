# Documentation Standards

## Language

All documentation in this repository MUST be in **English**. This includes
code comments, commit messages, task specs, walkthroughs, ADRs, and README
files.

---

## Task and Walkthrough Pairing

Every unit of work produces two paired documents:

| Document | Location | Purpose |
|----------|----------|---------|
| Task specification | `docs/tasks/NNNN-kebab-case.md` | Immutable requirements |
| Walkthrough | `docs/walkthroughs/NNNN-kebab-case.md` | Implementation journal |

- The task number `NNNN` is a zero-padded sequential integer.
- The same number links a task to its walkthrough.
- Variant prefixes: `ft-NNNN-*.md` (fast-track), `cr-NNNN-*.md` (code review).

---

## File Naming

- Use `NNNN-kebab-case.md` for all task and walkthrough files.
- Use `NNNN-kebab-case.md` for ADR files.
- All lowercase, hyphens as separators, no spaces or underscores.

---

## Markdown Formatting

- **ATX headers** (`#`, `##`, `###`) -- not Setext (underline) style.
- **Fenced code blocks** with language identifier:
  ````markdown
  ```typescript
  const x = 1;
  ```
  ````
- **No trailing whitespace** on any line.
- **One blank line** before and after headings, code blocks, and lists.
- **No HTML** in Markdown files unless absolutely necessary.
- Lists: use `-` for unordered, `1.` for ordered.
- Tables: use pipes and dashes with alignment.

---

## ADR Format

Architecture Decision Records follow this structure:

```markdown
# ADR-NNNN: <Title>

## Status
<Proposed | Accepted | Deprecated | Superseded by ADR-XXXX>

## Date
YYYY-MM-DD

## Context
<What is the issue or situation that motivates this decision?>

## Decision
<What is the change being proposed or decided?>

## Alternatives Considered
<What other options were evaluated?>

## Consequences
<What are the positive and negative results of this decision?>
```

ADR files live in `docs/adr/` and are numbered sequentially.

---

## Code Comments

- Use JSDoc for public API documentation (`@param`, `@returns`, `@throws`).
- Use inline comments sparingly -- explain "why", not "what".
- Do not leave TODO comments without a linked issue or task number.
- Do not use emojis in comments.
