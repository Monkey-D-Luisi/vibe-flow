# Walkthrough: FT-0174 — Close Agent Tooling Gaps

## Context

Audit of agent capabilities revealed that the pipeline has strong code-quality tooling but zero visual verification capabilities. Agents design, implement, and ship UI without ever seeing the result in a browser. Additionally, the SHIPPING stage has no CI gate, and the quality gate lacks accessibility and security checks.

## Changes Overview

| Task | Area | Impact |
|------|------|--------|
| A | stitch-bridge | New `design_variant` tool + model update to GEMINI_3_1_PRO |
| B | frontend-dev skill | Playwright visual verification loop in IMPLEMENTATION |
| C | qa-testing skill | Browser smoke tests in QA stage |
| D | transition-guards | CI status guard for SHIPPING→DONE |
| E | quality-gate | axe-core accessibility check |
| F | quality-gate | npm/pnpm dependency audit check |

## Task A — Design Variants + Model Update

### design_variant tool
- Calls Stitch MCP `generate_variants` with configurable `variantCount`, `creativeRange`, `aspects`
- Saves variant HTML files as `<screenName>-variant-1.html`, `<screenName>-variant-2.html`, etc.
- Designer agent can compare variants and select the best one before moving to IMPLEMENTATION

### Model update
- `GEMINI_3_PRO` → `GEMINI_3_1_PRO` (3_PRO is deprecated per Stitch API)
- Changed in: config default, tool parameter description, SKILL.md, skill-rules.json

## Task B — Frontend Visual Verification

### New workflow step added to frontend-dev SKILL.md
After implementing a component from a Stitch design, the front agent:
1. Serves the component locally
2. Opens it with Playwright `browser_navigate`
3. Captures DOM tree with `browser_snapshot`
4. Takes visual screenshot with `browser_take_screenshot`
5. Compares against the Stitch HTML reference
6. Iterates if discrepancies found (max 3 rounds)

> **Note:** `browser_navigate`, `browser_snapshot`, and `browser_take_screenshot` are
> provided by the Playwright MCP server at runtime. They are not registered in this repo
> but are available to agents through the OpenClaw gateway's MCP tool routing.

This closes the biggest gap: front agents can now **see** what they build.

## Task C — QA Browser Testing

### New section in qa-testing SKILL.md
For UI tasks, the QA agent:
1. Starts the dev server
2. Navigates to affected pages
3. Verifies key elements are present via snapshot
4. Tests basic interactions (click, fill, navigate)
5. Captures screenshots as evidence in `qa_report`

### Evidence schema extension
```json
{
  "criterion": "Dashboard renders correctly",
  "status": "pass",
  "type": "visual",
  "screenshots": ["qa-evidence/dashboard-loaded.png"],
  "test_names": ["visual-smoke"]
}
```

## Task D — SHIPPING CI Gate

### Pipeline advance guard
When advancing from SHIPPING to DONE, `pipeline-advance.ts` now checks:
- `shipping_result.ci_status === 'success'` must be present in task metadata
- If CI hasn't passed, the advance is blocked with an actionable message

### devops skill update
The `shipping-triggers-devops` instruction now requires the devops agent to check GitHub CI status and record it in `shipping_result` metadata before calling `pipeline_advance`.

## Task E — Accessibility Check

### New gate check: accessibility
- `GatePolicy.accessibilityMaxViolations` — max allowed violations (heuristic scan)
- `GateMetrics.accessibilityViolations` — actual count from scan
- `qgate_accessibility` tool: regex/heuristic scanner for HTML accessibility violations (missing alt, lang, labels)

### Integration
Added to `evaluateGate()` checker array alongside coverage, lint, complexity, tests, RGR.

## Task F — Dependency Audit

### New gate check: audit
- `GatePolicy.auditMaxCritical` / `auditMaxHigh` — max allowed vulnerabilities by severity
- `GateMetrics.auditCritical` / `auditHigh` — actual counts
- `qgate_audit` tool: runs `pnpm audit --json`, parses output

### Integration
Added to `evaluateGate()` checker array. Default policy: 0 critical, 5 high for all scopes.

## Testing

Each task includes its own test suite:
- Task A: stitch-client mock, variant file naming, config defaults
- Task B: skill content validation (manual review)
- Task C: skill content validation (manual review), evidence schema test
- Task D: pipeline-advance guard test with/without ci_status
- Task E: accessibility heuristic scanner unit tests, gate integration test
- Task F: audit parser unit tests, gate integration test
