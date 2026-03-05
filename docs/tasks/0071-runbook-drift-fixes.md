# Task 0071: P-001 + P-002 + P-003 + D-010 — Runbook Drift Fixes (MEDIUM)

## Source Finding IDs
P-001, P-002, P-003, D-010

## Finding Snapshot
| Field | Value |
|-------|-------|
| Axis | Product (P-001, P-002, P-003), Development (D-010) |
| Severity | MEDIUM |
| Confidence | CONFIRMED |
| Evidence | P-001: `docs/runbook.md:5` references `@openclaw/plugin-product-team` but actual name is `@openclaw/product-team`; P-002: `docs/runbook.md:27-79` config example missing `orchestrator`, `projects`, `delivery`, `decisions`, `telegramChatId` sections; P-003: `docs/runbook.md:129-144` omits 17 EP06-EP09 tools; D-010: `docs/runbook.md:129` uses dot-notation tool names but runtime uses underscore-notation |
| Impact | Incorrect package name causes `pnpm --filter` failures; missing config sections leave operators without setup guidance for EP06-EP09 features; dot-notation tool names do not match runtime registration |
| Recommendation | Fix package name; extend config documentation with all missing sections; add EP06-EP09 tool sections; update tool names to underscore notation |

## Objective
Correct all runbook drift identified in the audit: wrong package name, incomplete config documentation, missing tool sections, and notation mismatch.

## Acceptance Criteria
- [x] Package name corrected from `@openclaw/plugin-product-team` to `@openclaw/product-team`
- [x] Config example extended with `orchestrator`, `projects`, `delivery`, `decisions`, `telegramChatId`
- [x] EP06-EP09 tools documented (team, decision, pipeline, project — 17 tools)
- [x] All tool names updated to underscore notation matching runtime registration
- [x] No broken markdown links or formatting issues

## Status
DONE — commits a610ef2, d6df627

## Traceability
| Field | Value |
|-------|-------|
| Audit | 2026-03-05-full-audit.md |
| Findings | P-001, P-002, P-003, D-010 |
| Commits | a610ef2, d6df627 |
