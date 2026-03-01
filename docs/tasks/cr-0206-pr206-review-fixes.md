# CR-0206 — PR #206 Review Fixes

| Field   | Value                                               |
|---------|-----------------------------------------------------|
| Task    | cr-0206                                             |
| PR      | #206 — feat(ep08-8c): inter-agent messaging, decision engine, and pipeline tools |
| Status  | IN PROGRESS                                         |

## Findings

### MUST_FIX

| # | File | Issue |
|---|------|-------|
| MF-1 | `tools/team-messaging.ts` | `team.inbox` missing `to_agent` filter — returns all messages, not per-recipient |
| MF-2 | `tools/decision-engine.ts` | Circuit-breaker path returns without inserting audit record and exposes no `decisionId` |
| MF-3 | `tools/pipeline.ts` | `pipeline.skip` computes next stage from input stage, allowing callers to jump to unrelated stages |

### SHOULD_FIX

| # | File | Issue |
|---|------|-------|
| SF-1 | `tools/pipeline.ts` | `pipeline.retry` accepts arbitrary stage strings with no validation |
| SF-2 | `tools/pipeline.ts` | `STAGE_OWNERS` typed `Record<string,string>` — loses exhaustiveness checking |
| SF-3 | `tools/decision-engine.ts` | Unsafe cast of `policyCfg` to `Record<string, DecisionPolicy>` |
| SF-4 | `tools/decision-engine.ts` | Unsafe `as { cnt: number }` DB cast |
| SF-5 | `tools/pipeline.ts` | Unsafe `as number` for `retryCount` metadata field |
| SF-6 | `src/index.ts` | `agentConfig` filter only validates `id`, not `name` |
| SF-7 | `src/index.ts` | Log message label missing new tool categories |
| SF-8 | `schemas/team-messaging.schema.ts` | `team.inbox` needs `agentId` to enforce per-recipient filtering |
| SF-9 | `schemas/team-messaging.schema.ts` | `team.message` missing `from` agent parameter |
| SF-10 | `test/tools/team-messaging.test.ts` | No cross-agent inbox isolation test |
| SF-11 | `test/tools/decision-engine.test.ts` | Circuit-breaker test missing `decisionId` and audit-record assertions |

## Changes

- `schemas/team-messaging.schema.ts` — add required `agentId` to `TeamInboxParams`; add optional `from` to `TeamMessageParams`; add optional `fromAgent` to `TeamAssignParams`
- `tools/team-messaging.ts` — fix `team.inbox` WHERE clause; use `input.from` in `team.message`; use `input.fromAgent` in `team.assign`; explicit columns in `team.reply`
- `tools/decision-engine.ts` — insert audit record in circuit-breaker path; type-guard `policyCfg`; type-guard DB `cnt` row
- `tools/pipeline.ts` — `STAGE_OWNERS` → `Record<PipelineStage,string>`; validate stage param in `pipeline.retry`; validate stage vs current in `pipeline.skip`; safe `retryCount` cast
- `src/index.ts` — update `agentConfig` filter to validate `name`; update log message label
- `test/tools/team-messaging.test.ts` — update inbox tests to pass `agentId`; add isolation test
- `test/tools/decision-engine.test.ts` — strengthen circuit-breaker test with `decisionId`/row assertions
