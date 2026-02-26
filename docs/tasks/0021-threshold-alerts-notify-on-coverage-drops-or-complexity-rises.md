# Task: 0021 -- Threshold Alerts for Coverage Drops or Complexity Rises

## Metadata

| Field | Value |
|-------|-------|
| Status | DONE |
| Epic | EP05 follow-up (quality alerting) |
| Priority | MEDIUM |
| Scope | MAJOR |
| Created | 2026-02-26 |
| Branch | feat/0021-threshold-alerts-notify-on-coverage-drops-or-complexity-rises |
| Source Issue | #155 |

---

## Goal

Add explicit quality-regression alerting so coverage drops and complexity rises
are surfaced as actionable notifications instead of remaining implicit in raw
gate outputs.

---

## Context

Issue #155 requests notification behavior for quality regressions. Current
quality tooling evaluates thresholds and returns pass/fail details, but it does
not provide dedicated alert artifacts or a policy for regression deltas and
noise control.

Task `0020` introduced bounded auto-tuning, but alerting behavior was explicitly
left out of scope and remains pending in open-issues intake.

---

## Scope

### In Scope

- Define a regression alert policy for coverage decreases and complexity
  increases relative to baseline inputs.
- Implement alert generation in quality-gate tool surfaces with structured
  output payloads and traceable metadata.
- Add configuration support for alert thresholds and anti-noise controls
  (for example dedupe or cool-down semantics).
- Add tests and operator documentation for alert behavior.

### Out of Scope

- Auto-tuning algorithm changes already covered by task `0020`.
- New external notification providers beyond repository-defined channels/events.
- CI PR comment upsert workflow changes tracked under issue #158.

---

## Requirements

1. Alerting must be opt-in and preserve current behavior when disabled.
2. Alerts must be policy-driven and trigger only when configured regression
   deltas are exceeded.
3. Alert outputs must include enough metadata for auditability
   (metric, baseline, observed value, threshold, and decision reason).
4. Alerting controls must reduce noise from repeated identical signals.

---

## Acceptance Criteria

- [ ] AC1: Quality gate tools support an alert configuration contract for
      coverage-drop and complexity-rise detection.
- [ ] AC2: Executions that exceed configured regression deltas return structured
      alert entries with traceable decision metadata.
- [ ] AC3: Repeated identical regressions respect configured anti-noise policy.
- [ ] AC4: Tests cover trigger, non-trigger, and anti-noise scenarios across
      relevant tool surfaces.
- [ ] AC5: Documentation describes alert policy configuration and operational
      interpretation.
- [ ] AC6: Repository quality gates remain green (`pnpm test`, `pnpm lint`,
      `pnpm typecheck`).

---

## Constraints

- Preserve backward compatibility for existing callers that do not configure
  alerting.
- Keep alerting deterministic for identical inputs and policy configuration.
- Keep policy semantics aligned between `product-team` and `quality-gate`.

---

## Implementation Steps

1. Define alert policy and payload contracts in shared quality contract surfaces.
2. Integrate alert evaluation and anti-noise behavior in the relevant tools.
3. Add targeted tests plus workspace quality-gate verification.
4. Update runbook/API documentation and walkthrough evidence.

---

## Testing Plan

- pnpm --filter @openclaw/plugin-product-team test
- pnpm --filter @openclaw/quality-gate test
- pnpm test
- pnpm lint
- pnpm typecheck

---

## Definition of Done

- [x] Acceptance criteria validated with command-backed evidence
- [x] Implementation completed with no scope drift
- [x] Tests added or updated and passing
- [x] Lint passes with zero errors
- [x] TypeScript compiles without errors
- [x] Walkthrough updated with execution journal and closure decision

---

## Agent References

- [Roadmap](../roadmap.md)
- [Open Issues Intake](../backlog/open-issues-intake.md)
