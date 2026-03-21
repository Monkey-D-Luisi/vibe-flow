# FT-0174: Close Agent Tooling Gaps for Polished Task Delivery

**Type:** Fast Track — Process Improvement
**Status:** PLANNED
**Scope:** major
**Branch:** `feat/ft-0174-agent-tooling-gaps`

## Problem Statement

The agent team has a solid pipeline core (10-stage, transition guards, quality gate) but critical gaps prevent delivering polished work end-to-end:

1. **Design iteration is shallow** — no variant generation, deprecated model, iteration cap is prompt-only
2. **Visual verification is zero** — no agent can see what it implements in a browser
3. **QA has no browser tools** — tests are metrics-only (coverage, lint), never visual
4. **SHIPPING has no CI gate** — tasks can ship without checking CI status
5. **No accessibility or security checks** in the quality gate

## Tasks

### Task A — `stitch-bridge`: Design variant generation + model update
**Files:** `extensions/stitch-bridge/src/index.ts`, `skills/ui-designer/SKILL.md`, `extensions/stitch-bridge/test/tools/design-variant.test.ts`

1. Register `design_variant` tool in stitch-bridge calling Stitch MCP `generate_variants`
   - Parameters: `projectId`, `screenId[]`, `prompt`, `variantCount` (1-5, default 3), `creativeRange` (REFINE|EXPLORE|REIMAGINE, default EXPLORE), `aspects[]` (LAYOUT, COLOR_SCHEME, etc.)
   - Returns array of variant HTML files saved to `.stitch-html/<screenName>-variant-<N>.html`
2. Update `defaultModel` from `GEMINI_3_PRO` (deprecated) to `GEMINI_3_1_PRO`
   - Update config default in `getConfig()`
   - Update `design_generate` parameter description
   - Update `SKILL.md` instruction from `GEMINI_3_PRO` to `GEMINI_3_1_PRO`
   - Update `skill-rules.json` designer instruction
3. Tests for `design_variant` tool (mock MCP, verify file writes, variants naming)

### Task B — `frontend-dev` skill: Playwright visual verification loop
**Files:** `skills/frontend-dev/SKILL.md`, `extensions/product-team/src/skills/skill-rules.json`

1. Add Playwright-based visual verification steps to `frontend-dev` SKILL.md:
   - After implementing a component, the front agent must:
     a. Serve the component (e.g., `npx vite preview` or Storybook)
     b. Use Playwright MCP `browser_navigate` to open it
     c. Use `browser_snapshot` to capture the DOM accessibility tree
     d. Use `browser_take_screenshot` to capture a visual screenshot
     e. Compare against the Stitch HTML reference (loaded via `design_get`)
     f. If discrepancies found, iterate on the implementation (max 3 visual iterations)
2. Add `browser_navigate`, `browser_snapshot`, `browser_take_screenshot` to the Tools table in the skill
3. Update `skill-rules.json` `implementation-triggers-frontend` instruction to include visual verification step

### Task C — `qa-testing` skill: Browser-based smoke testing
**Files:** `skills/qa-testing/SKILL.md`, `extensions/product-team/src/skills/skill-rules.json`

1. Add browser smoke testing section to `qa-testing` SKILL.md:
   - For tasks with UI components, the QA agent must:
     a. Start the dev server
     b. Navigate to each affected page using Playwright MCP
     c. Take a snapshot (`browser_snapshot`) and verify key elements are present
     d. Take a screenshot for evidence
     e. Test basic interactions (click buttons, fill forms, navigate)
     f. Include browser evidence in the `qa_report.evidence[]` with `type: "visual"`
2. Add Playwright tools to the Tools table
3. Update `skill-rules.json` `qa-triggers-qa` instruction to mention browser smoke tests for UI tasks
4. Extend `qa_report` evidence schema to include optional `screenshots[]` field

### Task D — SHIPPING transition guard: CI status check
**Files:** `extensions/product-team/src/orchestrator/transition-guards.ts`, relevant test file

1. Add new transition guard: `qa -> done` already exists, now add `shipping -> done`:
   - Actually, reviewing the pipeline: stages are IDEA→ROADMAP→REFINEMENT→DECOMPOSITION→DESIGN→IMPLEMENTATION→QA→REVIEW→SHIPPING→DONE
   - But task statuses and pipeline stages are separate. The transition guards operate on task statuses, not pipeline stages.
   - The right approach: add a guard in `pipeline-advance.ts` that, when advancing **from SHIPPING to DONE**, requires `shipping_result.ci_status === 'success'`
2. Add `shipping_result` metadata schema:
   ```json
   { "pr_url": "string", "ci_status": "success|failure|pending", "pr_number": "number" }
   ```
3. Update `skill-rules.json` `shipping-triggers-devops` instruction to require CI status check before advancing
4. Tests for the new guard

### Task E — Quality gate: accessibility check (axe-core)
**Files:** `packages/quality-contracts/src/gate/types.ts`, `packages/quality-contracts/src/gate/policy.ts`, `extensions/quality-gate/src/index.ts` or new tool

1. Add `accessibilityMaxViolations` field to `GatePolicy` type
   - Default: 0 for major, 0 for minor, 5 for patch
2. Add `accessibilityViolations` field to `GateMetrics`
3. Add `checkAccessibility()` function to `policy.ts`
4. Wire into `evaluateGate()` checker array
5. Add `qgate_accessibility` tool to quality-gate extension:
   - Takes a URL or HTML file path
   - Runs axe-core (via `@axe-core/playwright` or `axe-core` + jsdom)
   - Returns violation count + details
6. Tests for the new check

### Task F — Quality gate: dependency audit check
**Files:** `packages/quality-contracts/src/gate/types.ts`, `packages/quality-contracts/src/gate/policy.ts`, `extensions/quality-gate/src/index.ts` or new tool

1. Add `auditMaxCritical` and `auditMaxHigh` fields to `GatePolicy`
   - Default: 0 critical, 5 high for all scopes
2. Add `auditCritical`, `auditHigh` fields to `GateMetrics`
3. Add `checkAudit()` function to `policy.ts`
4. Wire into `evaluateGate()` checker array
5. Add `qgate_audit` tool to quality-gate extension:
   - Runs `npm audit --json` or `pnpm audit --json`
   - Parses output, counts by severity
   - Returns structured result
6. Tests for the new check

## Implementation Order

```
A (stitch variant + model) → B (front visual loop) → C (QA browser) → D (shipping guard) → E (a11y) → F (audit)
```

Tasks A-C form the **design → implementation → QA visual chain** (highest priority).
Tasks D-F are **pipeline hardening** (important but independent).

A and D-F can be parallelized. B depends on A (model update). C depends on B (same pattern).

## Acceptance Criteria

- [ ] `design_variant` tool registered, tested, and callable
- [ ] Stitch model updated to `GEMINI_3_1_PRO` everywhere
- [ ] Frontend skill includes Playwright visual verification loop
- [ ] QA skill includes browser smoke testing for UI tasks
- [ ] SHIPPING→DONE transition requires CI status check
- [ ] `qgate_accessibility` tool works with axe-core
- [ ] `qgate_audit` tool runs dependency audit
- [ ] All new code has tests with ≥80% coverage
- [ ] All existing tests still pass
