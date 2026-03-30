# CR-0277: Code Review Fixes for PR #277

**PR:** #277 — feat/EP21-agent-excellence-telegram-command-center
**Type:** Code Review
**Status:** In Progress

## Findings

### MUST_FIX

1. **Double-escaped apostrophe in `/ask` response** (`telegram-notifier/src/index.ts:205-209`)
   - `couldn\\'t` renders a literal backslash in Telegram. Apostrophes don't need MarkdownV2 escaping.
   - Fix: remove backslash escape.

2. **Missing `standup.hourUtc` validation** (`telegram-notifier/src/index.ts:462`)
   - Accepts any number without range check. Values like 99, -1, NaN cause scheduler failures.
   - Fix: clamp to 0–23.

### SHOULD_FIX

3. **Hardcoded coverage threshold** (`telegram-notifier/src/formatting.ts:79`)
   - `checkIcon(pct >= 70)` ignores the actual gate result.
   - Fix: derive pass/fail from `violations` array (check for `COVERAGE_BELOW` code).

4. **`formatAgentError` context loss** (`telegram-notifier/src/index.ts:144`)
   - Constructs `{ agentId, error }` losing `sessionKey` and other event fields.
   - Fix: pass the full event record `rec`.

5. **Review round derivation stuck at 1** (`product-team/src/orchestrator/review-loop.ts:293`)
   - `meta['roundsReview']` never written; always falls back to 1.
   - Fix: derive from `reviewHistory.length`.

### ARCHITECTURAL

6. **Review loop backward transition dead code** (`product-team/src/tools/pipeline-advance.ts:94`)
   - `buildReviewContextForSpawn` checks `stage === 'IMPLEMENTATION'` but is always called with forward `targetStage` (SHIPPING from REVIEW).
   - Fix: add backward redirect REVIEW → IMPLEMENTATION when blocking violations exist and rounds not exhausted. Add `maxReviewRounds` to orchestrator config.
