# Walkthrough 0074: P-005 + A-002 — Documentation and Architecture Notes (LOW-MEDIUM)

## Source Finding IDs
P-005, A-002

## Execution Journal

### Confirm P-005: Missing Complexity Comparison Note
Reviewed CLAUDE.md tool tables. Confirmed `quality_complexity` and `qgate_complexity` are listed with brief descriptions but no note explaining they use different algorithms (AST-based vs regex heuristic) and produce different numbers.

### Confirm A-002: Undocumented Skills Workspace Exclusion
Reviewed `pnpm-workspace.yaml` and confirmed `skills/*` is not listed. Inspected `skills/` directory — all 14 subdirectories contain only `SKILL.md` files (Markdown prompt libraries, no code, no package.json). The exclusion is architecturally correct but undocumented.

### Apply Fixes
1. Added a comparison note to the CLAUDE.md Registered Tools section explaining that `quality_complexity` uses AST-based analysis (via ts-morph/escomplex) while `qgate_complexity` uses regex heuristics, and that the two tools intentionally produce different numbers
2. Added a note in CLAUDE.md Project Overview documenting that `skills/` contains Markdown-only prompt libraries intentionally excluded from the pnpm workspace

**Commands run:**
```
# Verify markdown formatting
cat CLAUDE.md | head -100
```

**Result:** Both documentation gaps addressed.

## Verification Evidence
- CLAUDE.md now explains complexity tool methodological differences
- Skills workspace exclusion documented with rationale
- No formatting issues
- Commit ebe346e merged to main

## Closure Decision
**Status:** DONE
**Residual risk:** None — documentation now accurate
**Date:** 2026-03-05
