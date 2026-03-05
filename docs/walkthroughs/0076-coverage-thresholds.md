# Walkthrough 0076: D-009 — Coverage Threshold Floors (MEDIUM)

## Source Finding IDs
D-009

## Execution Journal

Pending — task not yet started.

### Planned Approach
1. Run coverage across all workspaces to determine actual coverage levels
2. For telegram-notifier and stitch-bridge: add `coverage.thresholds` to their vitest configs
3. For quality-contracts: raise thresholds from 25% to match actual coverage minus a small buffer
4. Ensure no workspace has thresholds below the minimum floor (60/50/70/60 for stmts/branches/functions/lines)
5. Run full test suite to confirm all thresholds are met

### Commands to Run
```
pnpm --filter @openclaw/telegram-notifier test -- --coverage
pnpm --filter @openclaw/stitch-bridge test -- --coverage
pnpm --filter @openclaw/quality-contracts test -- --coverage
pnpm test
```

## Verification Evidence
Pending

## Closure Decision
**Status:** PLANNED
**Date:** 2026-03-05
