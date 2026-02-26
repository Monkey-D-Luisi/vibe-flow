# Task: 0020 -- Gate Auto-Tuning from Historical Metrics

## Metadata

| Field | Value |
|-------|-------|
| Status | IN_PROGRESS |
| Epic | EP05 follow-up (quality optimization) |
| Priority | MEDIUM |
| Scope | MAJOR |
| Created | 2026-02-26 |
| Branch | feat/0020-gate-auto-tuning-historical-metrics |
| Source Issue | #154 |

---

## Goal

Enable quality gate threshold auto-tuning from historical quality metrics with explicit safeguards so policy changes remain bounded and auditable.

---

## Context

Current gate thresholds are static (`DEFAULT_POLICIES`) and can be manually overridden per execution. Issue #154 requests dynamic adaptation based on historical quality behavior to reduce noisy failures while preventing unsafe policy drift.

---

## Scope

### In Scope

- Add shared policy auto-tuning logic driven by historical metrics.
- Integrate optional auto-tuning into product-team `quality.gate` and quality-gate `quality.gate_enforce`.
- Add schema/input support, tests, and docs for safeguards and tuning evidence.

### Out of Scope

- Alerting/notification workflows for threshold drift (covered by issue #155).
- CI comment upsert/reporting workflow changes (covered by issue #158).

---

## Requirements

1. Auto-tuning must be opt-in and preserve current behavior by default.
2. Tuned thresholds must be constrained by explicit safeguards (sample minimum, per-metric max delta, absolute bounds).
3. Tuning decisions must be observable in tool outputs/event payloads for traceability.

---

## Acceptance Criteria

- [ ] AC1: Shared auto-tuning function computes bounded tuned policy from historical metrics and returns adjustment evidence.
- [ ] AC2: `quality.gate` supports auto-tuning against historical gate metrics with configurable safeguards.
- [ ] AC3: `quality.gate_enforce` supports auto-tuning with caller-provided history while keeping backward compatibility.
- [ ] AC4: Tests cover tuned-policy behavior, safeguard clamping, and non-regression default behavior.
- [ ] AC5: Repository quality gates remain green (`pnpm test`, `pnpm lint`, `pnpm typecheck`).

---

## Constraints

- Keep existing gate policy defaults and semantics when auto-tuning is disabled.
- Do not introduce non-deterministic tuning behavior (same inputs must produce same outputs).
- Maintain policy parity expectations between product-team and quality-gate.

---

## Implementation Steps

1. Add shared gate auto-tuning types/logic in `packages/quality-contracts`.
2. Extend schema/contracts for auto-tuning inputs and integrate in both gate tools.
3. Expand tests across shared logic and tool-level behavior, then run full quality checks.

---

## Testing Plan

- pnpm --filter @openclaw/plugin-product-team test
- pnpm --filter @openclaw/quality-gate test
- pnpm test
- pnpm lint
- pnpm typecheck

---

## Definition of Done

- [ ] Acceptance criteria validated with command-backed evidence
- [ ] Implementation completed with no scope drift
- [ ] Tests added or updated and passing
- [ ] Lint passes with zero errors
- [ ] TypeScript compiles without errors
- [ ] Walkthrough updated with execution journal and closure decision

---

## Agent References

- [Roadmap](../roadmap.md)
- [Open Issues Intake](../backlog/open-issues-intake.md)
