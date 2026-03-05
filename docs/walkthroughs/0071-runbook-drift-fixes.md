# Walkthrough 0071: P-001 + P-002 + P-003 + D-010 — Runbook Drift Fixes (MEDIUM)

## Source Finding IDs
P-001, P-002, P-003, D-010

## Execution Journal

### Confirm Finding Validity
Inspected `docs/runbook.md` and confirmed all four findings:
- Line 5: wrong package name `@openclaw/plugin-product-team`
- Lines 27-79: config example missing orchestrator, projects, delivery, decisions, telegramChatId
- Lines 129-144: EP06-EP09 tools not documented
- Line 129+: dot-notation tool names instead of underscore notation

### Fix P-001: Package Name
Replaced `@openclaw/plugin-product-team` with `@openclaw/product-team` throughout `docs/runbook.md`.

### Fix P-002: Config Example
Extended the config example section with all missing configuration blocks:
- `orchestrator` (maxRetriesPerStage, stageTimeouts, skipDesignForNonUITasks, autoEscalateAfterRetries, notifyTelegramOnStageChange)
- `projects` / `activeProject` (multi-project support)
- `delivery` (default.mode, default.broadcastKeywords, agents, agentAccounts)
- `decisions` (policies, timeoutMs, humanApprovalTimeout)
- `telegramChatId`

### Fix P-003: EP06-EP09 Tools
Added documentation sections for 17 missing tools: `team_message`, `team_inbox`, `team_reply`, `team_status`, `team_assign`, `decision_evaluate`, `decision_log`, `decision_outcome`, `pipeline_start`, `pipeline_status`, `pipeline_retry`, `pipeline_skip`, `pipeline_advance`, `pipeline_metrics`, `project_list`, `project_switch`, `project_register`.

### Fix D-010: Tool Name Notation
Updated all tool name references from dot-notation to underscore-notation throughout the runbook.

**Commands run:**
```
grep -c "\\." docs/runbook.md  # verify no dot-notation tool names remain
```

**Result:** All four issues resolved across two commits.

## Verification Evidence
- Package name corrected to `@openclaw/product-team`
- Config example now covers all runtime configuration sections
- 17 EP06-EP09 tools documented with descriptions and examples
- All tool names use underscore notation matching CLAUDE.md and runtime
- Commits a610ef2, d6df627 merged to main

## Closure Decision
**Status:** DONE
**Residual risk:** None — runbook now aligned with runtime state
**Date:** 2026-03-05
