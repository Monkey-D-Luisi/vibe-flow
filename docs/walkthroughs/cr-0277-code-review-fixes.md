# Walkthrough: CR-0277 Code Review Fixes

## Overview

Fixes 6 issues identified during code review of PR #277 (EP21 Agent Excellence).

## Changes

### Fix #1: Double-escaped apostrophe in `/ask` (MUST_FIX)
- **File:** `extensions/telegram-notifier/src/index.ts`
- **Before:** `couldn\\'t` rendered `\'` in Telegram (literal backslash + apostrophe)
- **After:** `couldn't` — clean apostrophe, no escaping needed in MarkdownV2

### Fix #2: `standup.hourUtc` range validation (MUST_FIX)
- **File:** `extensions/telegram-notifier/src/index.ts`
- **Before:** Any number accepted (99, -1, NaN)
- **After:** Clamped to 0–23 via `Math.max(0, Math.min(23, Math.floor(rawHour)))` with NaN guard

### Fix #3: Coverage threshold from gate violations (SHOULD_FIX)
- **File:** `extensions/telegram-notifier/src/formatting.ts`
- **Before:** Hardcoded `pct >= 70` check for coverage pass/fail icon
- **After:** Uses `violations.some(v => v.code === 'COVERAGE_BELOW')` to derive pass/fail from actual gate result

### Fix #4: `formatAgentError` context preservation (SHOULD_FIX)
- **File:** `extensions/telegram-notifier/src/index.ts`
- **Before:** `formatAgentError({ agentId, error })` — lost `sessionKey` and other event fields
- **After:** `formatAgentError(rec)` — passes full event record, `sessionKey` now included in error messages

### Fix #5: Review round derivation (SHOULD_FIX)
- **File:** `extensions/product-team/src/orchestrator/review-loop.ts`
- **Before:** `meta['roundsReview']` never written → always fell back to 1
- **After:** `Math.max(1, history.length)` — derives round from pre-accumulated `reviewHistory`

### Fix #6: Review loop backward transition (ARCHITECTURAL)
- **Files:** `pipeline-advance.ts`, `plugin-config.ts`, `tools/index.ts`
- **Problem:** `buildReviewContextForSpawn` checked `stage === 'IMPLEMENTATION'` but `targetStage` from REVIEW was always SHIPPING (forward-only). Repair briefs never fired.
- **Solution:**
  1. After accumulating review round history, check for blocking violations (critical/high)
  2. If blocking violations exist AND rounds < `maxReviewRounds` (default 3) → redirect `targetStage` to `IMPLEMENTATION`
  3. Moved `pipeline.stage.entered` event emission to after the redirect decision
  4. Added `maxReviewRounds` to `OrchestratorConfig`
  5. Emits `pipeline.stage.review_loop_back` event for observability

## Test Coverage

- 5 new integration tests for REVIEW → IMPLEMENTATION backward transition
- Updated 2 existing `buildStageSpawnMessage` tests to use `reviewHistory` metadata
- All 355 tests pass across both extensions
