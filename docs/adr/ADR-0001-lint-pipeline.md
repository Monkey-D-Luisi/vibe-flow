---
id: ADR-0001
title: Enable lint pipeline for ADRs
status: accepted
date: 2025-01-15
owners:
  - '@team/architecture'
area: governance
links:
  issues: ['#42']
  pr: ['#108']
  docs: ['docs/adr/README.md']
supersedes: []
superseded_by: null
---

# Enable lint pipeline for ADRs

## Context
The repository lacked a uniform process to validate Architecture Decision Records, leading to differences in format, status usage, and naming.

## Decision
Provide an official template, a linter, and a CI workflow that validates every ADR before publication.

## Considered Alternatives
- Keep manual validation -- fast to start, but highly prone to inconsistencies.
- Adopt external tooling -- richer features, yet steeper learning curve and maintenance overhead.

## Consequences
- Positive: consistent decisions, auditable documentation, and a foundation for future automation.
- Negative / Trade-offs: initial investment in tooling and team onboarding.
- Operations / Maintainability: linter rules must stay aligned with the template.

## Success Metrics (optional)
- 100% of PRs containing an ADR pass the `adr-lint` check.
- Zero ADRs rejected for formatting issues during review.

## Implementation Notes (optional)
- Document the `pnpm adr:new` command in `CONTRIBUTING.md`.

## Appendix (optional)
- Example linter output: `tooling/adr/fixtures/valid/docs/adr/ADR-0001-valid-decision.md`.
