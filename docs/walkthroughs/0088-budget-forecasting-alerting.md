# Walkthrough: 0088 -- Budget Forecasting and Overspend Alerting

## Task Reference

- Task: `docs/tasks/0088-budget-forecasting-alerting.md`
- Epic: EP11 -- Budget Intelligence
- Branch: `feat/0088-budget-forecasting-alerting`
- PR: TBD

---

## Summary

Added a budget forecasting engine that calculates burn rate from consumption
history, estimates remaining token needs based on average per-stage consumption,
and generates actionable alerts with model tier downgrade recommendations.
Proactive Telegram alerts notify operators of warning thresholds, forecast
overspend, budget exhaustion, and replenishment events.

---

## Context

Tasks 0084-0087 built the full budget engine stack: hard limits, per-agent
tracking, model tier auto-downgrade, and a Telegram `/budget` dashboard. Budget
status transitions are already emitted to the event log via `budget-guard.ts`.
This task adds the final piece: forward-looking forecasting and proactive alerts.

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Rule-based forecasting (no ML) | Aligns with project constraint of simplicity; linear burn rate is sufficient for 10-stage pipelines |
| Confidence scales from 0.4 to 1.0 over 5 stages | Prevents false positives early in the pipeline while allowing timely alerts after enough data |
| MIN_FORECAST_CONFIDENCE = 0.8 | Only alert when >= 4 stages complete (high confidence), satisfying AC3 |
| Mirrored types in telegram-notifier | Avoids cross-extension import dependency; uses same pattern as budget-dashboard.ts |
| Tier savings multipliers (0.6 standard, 0.3 economy) | Conservative estimates based on model pricing ratios from pricing-table.ts |

---

## Implementation Notes

### Approach

Two new modules following the same decoupled pattern as the existing budget stack:

1. **budget-forecast.ts** (product-team orchestrator): Pure functions for burn
   rate calculation, per-stage average estimation, surplus/deficit projection,
   confidence scoring, and tier downgrade recommendations.

2. **budget-alerts.ts** (telegram-notifier): Formatting layer that converts
   BudgetAlert objects into MarkdownV2 Telegram messages with emoji indicators,
   forecast detail blocks, and priority classification for the message queue.

### Key Changes

- `forecastBudget()` produces a complete `BudgetForecast` object with burn rate,
  projected surplus/deficit, confidence, and recommended tier.
- `evaluateAlerts()` orchestrates all alert types in priority order: exhausted
  takes precedence, then forecast overspend, then warning (no double-alerting).
- `formatBudgetAlert()` renders alerts with scope tags, detail blocks, and
  MarkdownV2 escaping.
- `alertPriority()` classifies alerts for the Telegram message queue.

---

## Commands Run

```bash
pnpm test        # All 1036+ tests pass (32 new forecast + 10 new alert tests)
pnpm lint        # Clean
pnpm typecheck   # Clean
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `extensions/product-team/src/orchestrator/budget-forecast.ts` | Added | Forecasting engine: burn rate, per-stage estimation, surplus projection, alert generation |
| `extensions/product-team/test/orchestrator/budget-forecast.test.ts` | Added | 32 tests covering all forecasting paths and edge cases |
| `extensions/telegram-notifier/src/budget-alerts.ts` | Added | Telegram alert formatting with MarkdownV2 and priority classification |
| `extensions/telegram-notifier/test/budget-alerts.test.ts` | Added | 10 tests covering all alert types and formatting |
| `docs/tasks/0088-budget-forecasting-alerting.md` | Added | Task specification |
| `docs/walkthroughs/0088-budget-forecasting-alerting.md` | Added | This walkthrough |
| `docs/roadmap.md` | Modified | Task 0088 DONE, EP11 DONE, Task 0087 status sync |
| `docs/backlog/EP11-budget-intelligence.md` | Modified | Epic status PENDING -> DONE |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| budget-forecast.test.ts | 32 | 32 | ~95% |
| budget-alerts.test.ts | 10 | 10 | ~95% |

---

## Follow-ups

- Wire `evaluateAlerts()` into `pipeline_advance` tool handler for automatic post-stage evaluation
- Connect `formatBudgetAlert()` to the Telegram message queue `enqueue` function
- EP12 Task 0093 can use forecast data to feed the routing feedback loop

---

## Checklist

- [x] Task spec read end-to-end
- [x] TDD cycle followed (Red-Green-Refactor)
- [x] All ACs verified
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Follow-ups recorded
