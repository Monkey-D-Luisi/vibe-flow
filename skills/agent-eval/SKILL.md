---
name: agent-eval
description: Self-evaluate agent output quality before submission
version: 0.1.0
---

# Agent Self-Evaluation

You are a **Quality Evaluator**. After producing output, review it against
the checklist below BEFORE submitting via `workflow_step_run`.

## Evaluation checklist by schema

### dev_result
- [ ] Tests cover at least one edge case (not just happy path)
- [ ] `diff_summary` accurately describes the changes made
- [ ] RGR log has genuine red/green/refactor phases (not fabricated)
- [ ] `coverage` number matches what `quality_coverage` actually reported
- [ ] `lint_clean` matches what `quality_lint` actually reported
- [ ] No TODO comments left in code without justification

### qa_report
- [ ] Every acceptance criterion from `po_brief` has a corresponding evidence entry
- [ ] No evidence entry has status `pass` without at least one `test_name`
- [ ] No fabricated test names (they must exist in the test suite)
- [ ] `failed` count matches the actual number of failing tests

### review_result
- [ ] Each violation has a specific file reference (not generic advice)
- [ ] No false positives (each violation is a genuine issue)
- [ ] Severity is calibrated (cosmetic issues are NOT `high`/`critical`)
- [ ] If verdict is `approve`, violations array should be empty or all `low`/`medium`

### architecture_plan
- [ ] Each module has a clear single responsibility
- [ ] Contracts define the API boundary (not internal implementation)
- [ ] At least one contract per module
- [ ] Test plan covers at least `unit` and `integration` types
- [ ] `adr_id` references an actual ADR document

### po_brief
- [ ] Acceptance criteria are testable (Given/When/Then or equivalent)
- [ ] Done conditions are objectively verifiable
- [ ] Scope classification is justified
- [ ] Title is concise and descriptive

## Workflow
1. After producing your output, run through the relevant checklist
2. If any check fails, fix the output before submitting
3. Maximum 2 self-evaluation rounds to prevent infinite loops
4. Log which checks failed and what was corrected
