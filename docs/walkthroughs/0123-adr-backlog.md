# Walkthrough: 0123 -- ADR Backlog -- Key Architectural Decisions

## Task Reference

- Task: `docs/tasks/0123-adr-backlog.md`
- Epic: EP19 -- Showcase & Documentation
- Branch: `feat/EP19-showcase-documentation`

---

## Summary

Created 11 new ADRs (ADR-006 through ADR-016) documenting the most significant
architectural decisions from phases EP02 through EP12. Each ADR follows the
existing template format, lists alternatives considered, and documents positive
and negative consequences.

---

## Context

The project had 5 existing ADRs (001-005). The EP19 backlog called for >= 10
new ADRs. Since ADR-002 already covered SQLite persistence (one of the originally
planned topics), the numbering starts at ADR-006 to avoid conflicts. All ADRs
were written based on actual implementation details found in the codebase.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Start numbering at ADR-006 | ADR-001 through ADR-005 already exist |
| 11 ADRs (exceeds >= 10 requirement) | Complete coverage of major decisions from EP02-EP12 |
| Include EP12 rule-based learning | Important architectural choice that shaped the learning loop |

---

## Implementation Notes

### Approach

Each ADR was written by examining the relevant extension source code, task
specs, and walkthroughs to understand the decision context, alternatives that
were evaluated, and the actual consequences observed.

### Key Changes

11 new ADR files created in `docs/adr/`, covering:

| ADR | Topic | Phase |
|-----|-------|-------|
| ADR-006 | Hexagonal architecture for product-team | EP02 |
| ADR-007 | Append-only event log for audit trail | EP02 |
| ADR-008 | Lease-based task ownership | EP02 |
| ADR-009 | JSON Schema contracts for role outputs | EP03 |
| ADR-010 | Dual complexity analysis (AST + regex) | EP05 |
| ADR-011 | Docker deployment isolated from WSL | EP08 |
| ADR-012 | Multi-model provider architecture | EP08 |
| ADR-013 | Decision engine with auto/escalate/pause | EP08 |
| ADR-014 | 10-stage pipeline over simpler models | EP08 |
| ADR-015 | Telegram as primary human interface | EP08 |
| ADR-016 | Rule-based learning over ML | EP12 |

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `docs/adr/ADR-006-hexagonal-architecture.md` | Created | Hexagonal architecture ADR |
| `docs/adr/ADR-007-append-only-event-log.md` | Created | Event log ADR |
| `docs/adr/ADR-008-lease-based-task-ownership.md` | Created | Lease ownership ADR |
| `docs/adr/ADR-009-json-schema-role-contracts.md` | Created | Role contracts ADR |
| `docs/adr/ADR-010-dual-complexity-analysis.md` | Created | Dual complexity ADR |
| `docs/adr/ADR-011-docker-deployment-strategy.md` | Created | Docker deployment ADR |
| `docs/adr/ADR-012-multi-model-provider-architecture.md` | Created | Model routing ADR |
| `docs/adr/ADR-013-decision-engine-policies.md` | Created | Decision engine ADR |
| `docs/adr/ADR-014-ten-stage-pipeline.md` | Created | Pipeline stages ADR |
| `docs/adr/ADR-015-telegram-human-interface.md` | Created | Telegram interface ADR |
| `docs/adr/ADR-016-rule-based-learning.md` | Created | Learning loop ADR |
| `docs/tasks/0123-adr-backlog.md` | Created | Task specification |
| `docs/walkthroughs/0123-adr-backlog.md` | Created | This walkthrough |

---

## Follow-ups

- Future ADRs for phase 13+ decisions (SDK contracts, plugin DX)
- Consider adding an ADR index/registry document
