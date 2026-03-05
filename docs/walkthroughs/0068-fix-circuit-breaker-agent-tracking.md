# Walkthrough: EP09 -- Pipeline Intelligence & Reliability

## Task Reference

- Tasks: 0062-0076 (15 tasks)
- Epic: EP09 -- Pipeline Intelligence & Reliability
- Branch: `feat/0068-fix-circuit-breaker-agent-tracking`

---

## Summary

Complete implementation of EP09 across all 5 lanes (A-E). The epic adds autonomous pipeline stage advancement, decision engine maturity (per-agent circuit breaker, timeouts, retry limits, outcome tracking), spawn reliability (abstraction layer + retry queue), observability (metrics, stage events, indexed pipeline state), and Telegram experience improvements (per-persona bots, decision approval commands).

---

## Decisions

| Decision | Rationale |
|----------|-----------|
| Use `before_tool_call` hook for agentId injection (0068) | Follows origin-injection pattern; SDK provides ctx.agentId in hooks but not in tool execute |
| Cron-based timeout enforcement (0069, 0063) | Simpler than reactive approach; matches existing MonitoringCron pattern with `.unref()` timers |
| `pipeline_stage` column via ALTER TABLE (0073) | Efficient indexed queries for stage-based pipeline status; degrades gracefully if migration hasn't run |
| Spawn retry queue in SQLite (0066) | Persistent across restarts; dead-letter alerting prevents silent failures |
| Stage events in event_log (0074) | Reuses existing audit infrastructure; structured payloads enable future dashboards |

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/agent-id-injection.ts` | Created | Before-tool-call hook injecting agentId into decision_evaluate |
| `src/tools/decision-engine.ts` | Modified | Per-agent circuit breaker, blocker maxRetries, outcome tracking, outcome column |
| `src/schemas/decision.schema.ts` | Modified | Added optional agentId field |
| `src/services/decision-timeout-cron.ts` | Created | Cron sweep for stalled escalated decisions |
| `src/services/stage-timeout-cron.ts` | Created | Cron sweep for pipeline stage timeouts |
| `src/services/spawn-service.ts` | Created | Spawn abstraction with retry queue and dead-letter handling |
| `src/tools/pipeline.ts` | Modified | Exported constants, added syncPipelineStageColumn |
| `src/tools/pipeline-advance.ts` | Created | pipeline.advance + pipeline.metrics tools (stage advancement, retry limits, design skip, metrics) |
| `src/tools/index.ts` | Modified | Added orchestratorConfig to ToolDeps, registered 3 new tools |
| `src/config/plugin-config.ts` | Modified | Added resolveOrchestratorConfig |
| `src/persistence/migrations.ts` | Modified | Added migrations 003 (pipeline_stage column) and 004 (spawn_queue table) |
| `src/index.ts` | Modified | Wired agent-id-injection hook, decision/stage timeout crons, orchestratorConfig |
| `openclaw.docker.json` | Modified | Expanded agentAccounts for per-persona bots |
| `extensions/telegram-notifier/src/index.ts` | Modified | Added /approve, /reject, /decisions commands |
| `test/hooks/agent-id-injection.test.ts` | Created | 5 tests for hook |
| `test/services/decision-timeout-cron.test.ts` | Created | 6 tests for timeout sweep |
| `test/tools/decision-engine.test.ts` | Modified | Added per-agent circuit breaker, blocker maxRetries, fallback tests |

---

## Tests

| Suite | Tests | Passed | Coverage |
|-------|-------|--------|----------|
| product-team | 617 | 617 | - |
| quality-gate | all | all | - |
| typecheck | clean | clean | - |
| lint | clean | clean | - |

---

## Checklist

- [x] All 15 EP09 tasks implemented
- [x] All ACs verified (tests, typecheck, lint)
- [x] Quality gates passed
- [x] Files changed section complete
- [x] Roadmap updated to DONE
