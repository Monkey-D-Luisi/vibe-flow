# EP09 -- Pipeline Intelligence & Reliability

| Field       | Value                                                    |
|-------------|----------------------------------------------------------|
| Epic        | EP09                                                     |
| Status      | PENDING                                                  |
| Priority    | P0                                                       |
| Phase       | 9 -- Pipeline Intelligence & Reliability                 |
| Target      | Q2-Q3 2026                                               |
| Depends on  | EP08 (Autonomous Product Team)                           |
| Blocks      | None                                                     |

## Goal

Close the autonomy gap. EP08 deployed the full team (8 agents, messaging, decisions,
pipeline tracking) but the pipeline is passive — it tracks stages, it doesn't drive
them. EP09 makes the system self-driving: automatic stage advancement, enforced
guardrails, failure recovery with alerting, and a decision feedback loop that learns
from outcomes.

After EP09, the pipeline should be able to take an `/idea` from Telegram through to a
merged PR with zero human intervention on the happy path, and with intelligent
escalation + retry on the failure path.

## Context

### What EP08 delivered (and where it stopped)

EP08 built the infrastructure for autonomous operation:
- 8 agents with per-agent model routing and tool allow-lists
- Inter-agent messaging via `team_message` / `team_reply` with auto-spawn hooks
- Decision engine with 6 categories and configurable policies
- Pipeline orchestrator with 10 stages (IDEA → DONE) and stage owners
- Telegram integration for human oversight

But several critical mechanisms were implemented as **configuration only** — the
values exist in `openclaw.docker.json` but no code reads or enforces them:

| Config field | File | Enforced? |
|---|---|---|
| `orchestrator.stageTimeouts` | openclaw.docker.json:141-149 | No |
| `orchestrator.maxRetriesPerStage` | openclaw.docker.json:139 | No |
| `orchestrator.skipDesignForNonUITasks` | openclaw.docker.json:140 | No |
| `decisionEngine.timeoutMs` | openclaw.docker.json:130 | No |
| `decisionEngine.humanApprovalTimeout` | openclaw.docker.json:131 | No |
| `decisionEngine.policies[blocker].maxRetries` | openclaw.docker.json:158 | No |

Additionally, the auto-spawn mechanism depends on minified SDK internals (`clientMod.t`,
`clientMod.kt`, `clientMod.Xt`) that will break silently on any SDK update.

### Findings from codebase analysis (2026-03-04)

1. **Pipeline is CRUD, not an orchestrator.** `pipeline.start/status/retry/skip` are
   tracking tools. No code drives tasks from one stage to the next.
2. **Spawn failures are silently dropped.** `fireAgentViaGatewayWs` errors are logged
   as warnings with no retry queue or dead-letter mechanism.
3. **Decision engine circuit breaker uses hardcoded `'calling-agent'`** instead of the
   actual agent ID, making per-agent limiting impossible.
4. **No per-stage metrics.** Stage duration, cost, retries, and quality results are not
   tracked. The `event_log` captures tool-level events but no stage-level aggregation.
5. **6 of 8 agents share the PM bot identity in Telegram.** Users cannot distinguish
   messages from po, back-1, front-1, qa, or devops.
6. **Pipeline state lives in metadata JSON column** with no SQL indexes on stage,
   making efficient stage-based queries impossible.
7. **No decision outcome tracking.** Decisions are logged but never analyzed for whether
   auto-decisions led to good or bad task outcomes.

---

## Execution Lanes

### Lane A: Pipeline Autonomy (the orchestrator loop)

Make the pipeline actually drive tasks forward automatically.

#### 9A.1 Automatic Stage Advancement

**Problem:** Stage transitions require explicit agent tool calls. There is no loop that
checks "task X finished stage Y, advance to stage Y+1 and spawn the owner."

**Solution:** Implement a `pipeline.advance` mechanism triggered by:
- `after_tool_call` hook on `workflow_step_run` (when a step completes)
- `after_tool_call` hook on `task_transition` (when the FSM advances)
- Cron-based sweep for stalled tasks

The advancement logic reads the stage sequence from the orchestrator config, resolves
the next stage owner, updates pipeline metadata, and spawns the next agent.

**Key design decision:** Should advancement be synchronous (inside the tool call
transaction) or asynchronous (via event + cron)? Synchronous is simpler but couples
FSM transitions to pipeline stages. Asynchronous is cleaner but adds latency.

#### 9A.2 Stage Timeout Enforcement

**Problem:** `stageTimeouts` in config (ROADMAP: 5min, IMPLEMENTATION: 30min, etc.)
are never enforced. A stuck task sits forever.

**Solution:** A cron job (or `before_tool_call` check) that:
1. Queries all in-flight pipeline tasks
2. Checks if the current stage has exceeded its timeout
3. Escalates: sends an urgent `team_message` to the stage owner, then to tech-lead
4. After a second timeout, auto-retries or marks the stage as failed

#### 9A.3 Retry Limit Enforcement

**Problem:** `maxRetriesPerStage: 1` exists in config but `pipeline.retry` never
checks it. The global `retryCount` doesn't distinguish between stages.

**Solution:**
- Track retries per-stage in pipeline metadata (e.g., `stages.IMPLEMENTATION.retries`)
- `pipeline.retry` checks the per-stage count against the config limit
- On limit exceeded, escalate to tech-lead with decision request

#### 9A.4 Conditional Design Skip

**Problem:** `skipDesignForNonUITasks: true` exists in config but no code reads it.

**Solution:** When the pipeline advances from DECOMPOSITION to the next stage, check
if the task metadata indicates a non-UI task. If so, auto-skip DESIGN and advance
directly to IMPLEMENTATION, recording the skip reason in metadata.

---

### Lane B: Spawn Reliability

Eliminate silent message/agent loss.

#### 9B.1 Spawn Retry Queue

**Problem:** When `fireAgentViaGatewayWs()` fails, the message is silently lost.

**Solution:** Implement a SQLite-backed spawn queue:
1. Before spawning, insert a record: `{ targetAgent, toolCall, status: 'pending', createdAt }`
2. Spawn the agent
3. On successful WS connection acknowledgment, mark `status: 'delivered'`
4. A cron sweep re-attempts `pending` records older than 30 seconds
5. After N retries, mark `status: 'dead_letter'` and alert via Telegram

#### 9B.2 Spawn Abstraction Layer

**Problem:** The raw WS spawn script accesses minified SDK internals (`clientMod.t`,
`clientMod.kt`, `clientMod.Xt`). Any SDK update breaks inter-agent communication.

**Solution:** Create a `SpawnService` abstraction that:
1. Encapsulates the WS connection logic
2. Resolves SDK symbols via exported names (not minified internals)
3. Falls back to the `openclaw agent` CLI if WS fails
4. Provides a clean API: `spawnService.fire(targetAgent, context)` that returns
   a delivery confirmation promise
5. Is independently testable with WS mocks

---

### Lane C: Decision Engine Maturity

Fix known bugs and add learning capability.

#### 9C.1 Fix Circuit Breaker Agent Tracking

**Problem:** Agent ID is hardcoded to `'calling-agent'` in `decision-engine.ts:102,117,183`.
The circuit breaker cannot distinguish between different agents.

**Solution:** Pass the actual `agentId` from the tool call context into the decision
engine. The circuit breaker should count decisions per-agent-per-task.

**Risk:** Changing the agent_id column values is a data migration. New code must handle
both old (`'calling-agent'`) and new (real agent ID) records gracefully.

#### 9C.2 Enforce Decision Timeouts

**Problem:** `timeoutMs` and `humanApprovalTimeout` in config are never read.

**Solution:**
- For `pause` decisions (human approval): start a timer. If no response arrives within
  `humanApprovalTimeout`, auto-escalate to tech-lead.
- For `escalate` decisions: if the target agent doesn't respond within `timeoutMs`,
  re-escalate to PM.
- Implementation: cron sweep on `agent_decisions` table, checking `createdAt + timeout`.

#### 9C.3 Enforce maxRetries for Blocker Retry

**Problem:** The `retry` action in the blocker policy defines `maxRetries: 2` but the
code never checks it. It always picks the recommendation and returns.

**Solution:** Track retry attempts per decision category per task in `agent_decisions`.
When count exceeds `maxRetries`, force escalation instead of retrying.

#### 9C.4 Decision Outcome Tracking

**Problem:** Decisions are logged but never analyzed. The engine cannot learn from past
outcomes.

**Solution:**
1. When a task reaches `done`, evaluate all decisions made during its lifecycle
2. Tag each decision with `outcome: 'success'` (task completed) or `outcome: 'overridden'`
   (a later decision reversed it) or `outcome: 'failed'` (task was restarted after this
   decision)
3. Periodically aggregate: "auto decisions in category X have Y% success rate"
4. If success rate drops below threshold, switch category policy from `auto` to `escalate`
5. Expose via `decision.log` with optional `includeOutcomes: true` parameter

---

### Lane D: Observability & Metrics

Provide the visibility needed to understand and improve system performance.

#### 9D.1 Per-Stage Metrics Collection

**Problem:** No structured metrics per pipeline stage. Cannot answer "how long does
IMPLEMENTATION take on average?" or "which stage has the highest retry rate?"

**Solution:** Add a `pipeline_stages` table (or structured metadata) that records:
- `taskId`, `stage`, `startedAt`, `completedAt`, `durationMs`
- `agentId` (who executed it), `model` (which model was used)
- `tokenCost` (input + output tokens for all tool calls in this stage)
- `retries` (count for this specific stage)
- `qualityGateResult` (if applicable)

Expose via a new `pipeline.metrics` tool for agents and via Telegram `/metrics` command
for humans.

#### 9D.2 Pipeline State Indexing

**Problem:** Pipeline state lives in `TaskRecord.metadata` (JSON column). No efficient
way to query "all tasks at IMPLEMENTATION stage" or "average time in QA."

**Solution:**
- Add a `pipeline_stage` column to the `tasks` table (or create a `pipeline_state` table)
- Update `pipeline.start`, `pipeline.retry`, and stage advancement to maintain this column
- Add an index on `pipeline_stage` for efficient queries
- Migration handles backfill from existing metadata

#### 9D.3 Structured Stage Transition Events

**Problem:** The event log captures task-level transitions but not pipeline-stage-level
transitions. Cannot reconstruct the timeline of stage changes.

**Solution:** Emit `pipeline.stage.entered` and `pipeline.stage.completed` events to the
event_log, with stage name, agent, model, and duration. These events enable:
- Stage-level Telegram notifications ("Task X entered QA, assigned to qa agent")
- Historical analysis via `workflow.events.query(eventType: 'pipeline.stage.*')`
- Per-stage duration dashboards

---

### Lane E: Telegram Experience

Improve human oversight quality.

#### 9E.1 Per-Persona Bot Expansion

**Problem:** 6 of 8 agents share the PM bot (`@AiTeam_ProductManager_bot`). Humans
cannot distinguish messages from po, back-1, front-1, qa, or devops.

**Solution:** Register additional Telegram bots via BotFather:
- `@AiTeam_ProductOwner_bot` for po
- `@AiTeam_Backend_bot` for back-1
- `@AiTeam_Frontend_bot` for front-1
- `@AiTeam_QA_bot` for qa
- `@AiTeam_DevOps_bot` for devops

Update `agentAccounts` in `openclaw.docker.json` and the telegram-notifier's bot
initialization to handle 8 Grammy instances.

**Trade-off:** 8 bot instances consume 8x the Telegram API connections. Telegram rate
limits (30 msg/sec per bot) should not be an issue, but connection management complexity
increases. Consider a shared connection pool.

#### 9E.2 Telegram Decision Approval

**Problem:** When the decision engine pauses for human approval (`budget` category),
there is no mechanism for the human to approve/reject via Telegram.

**Solution:** When a `pause` decision is created:
1. Post to Telegram: "Decision required: [question]. Reply /approve or /reject [id]"
2. Add Telegram command handlers for `/approve <id>` and `/reject <id>`
3. Update the decision record and resume the pipeline

---

## Task Breakdown

### Phase 9A: Pipeline Autonomy
- Task 0062: Automatic Pipeline Stage Advancement -- PENDING (EP09, 9A)
- Task 0063: Stage Timeout Enforcement -- PENDING (EP09, 9A)
- Task 0064: Per-Stage Retry Limit Enforcement -- PENDING (EP09, 9A)
- Task 0065: Conditional Design Skip for Non-UI Tasks -- PENDING (EP09, 9A)

### Phase 9B: Spawn Reliability
- Task 0066: Spawn Retry Queue with Dead-Letter Alerting -- PENDING (EP09, 9B)
- Task 0067: Spawn Abstraction Layer (decouple from SDK internals) -- PENDING (EP09, 9B)

### Phase 9C: Decision Engine Maturity
- Task 0068: Fix Circuit Breaker Per-Agent Tracking -- PENDING (EP09, 9C)
- Task 0069: Enforce Decision Timeouts -- PENDING (EP09, 9C)
- Task 0070: Enforce Blocker maxRetries Policy -- PENDING (EP09, 9C)
- Task 0071: Decision Outcome Tracking and Feedback Loop -- PENDING (EP09, 9C)

### Phase 9D: Observability & Metrics
- Task 0072: Per-Stage Metrics Collection -- PENDING (EP09, 9D)
- Task 0073: Pipeline State Indexing (DB column + migration) -- PENDING (EP09, 9D)
- Task 0074: Structured Stage Transition Events -- PENDING (EP09, 9D)

### Phase 9E: Telegram Experience
- Task 0075: Per-Persona Bot Expansion (8 bots) -- PENDING (EP09, 9E)
- Task 0076: Telegram Decision Approval Commands -- PENDING (EP09, 9E)

## Dependency Graph

```
9A.1 (stage advancement) ← 9B.1 (spawn retry — advancement spawns agents)
9A.2 (timeouts) ← 9A.1 (timeouts trigger advancement or escalation)
9A.3 (retry limits) ← 9A.1 (retry logic is part of advancement)
9A.4 (design skip) ← 9A.1 (skip is a special case of advancement)

9B.2 (spawn abstraction) ← 9B.1 (retry queue uses the abstraction)

9C.1 (agent tracking fix) — independent, can start immediately
9C.2 (decision timeouts) — independent, can start immediately
9C.3 (maxRetries enforcement) — independent, can start immediately
9C.4 (outcome tracking) ← 9A.1 (needs completed tasks to measure outcomes)

9D.1 (per-stage metrics) ← 9A.1 (metrics are collected during advancement)
9D.2 (state indexing) — independent, can start immediately (DB migration)
9D.3 (stage events) ← 9A.1 (events emitted during advancement)

9E.1 (bot expansion) — independent, can start immediately
9E.2 (decision approval) ← 9C.2 (approval resolves decision timeouts)
```

**Critical path:** 9B.2 → 9B.1 → 9A.1 → 9A.2/9A.3/9A.4 → 9D.1/9D.3 → 9C.4

**Recommended execution order:**
1. Start with independent tasks in parallel: 9C.1 (0068), 9C.2 (0069), 9C.3 (0070), 9D.2 (0073), 9E.1 (0075)
2. Then: 9B.2 (0067, spawn abstraction) → 9B.1 (0066, retry queue)
3. Then: 9A.1 (0062, core stage advancement) — this is the linchpin
4. Then: 9A.2 (0063), 9A.3 (0064), 9A.4 (0065) — advancement variations
5. Then: 9D.1 (0072), 9D.3 (0074) — metrics depend on advancement events
6. Finally: 9C.4 (0071, outcome tracking), 9E.2 (0076, approval UX)

## Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Automatic advancement creates runaway loops | HIGH | MEDIUM | Per-task max advancement count; circuit breaker on consecutive failures; human-in-the-loop escalation |
| Spawn abstraction breaks existing messaging | HIGH | LOW | Feature-flag the new spawn path; A/B between old and new; comprehensive spawn tests |
| Decision outcome tracking assigns wrong causality | MEDIUM | MEDIUM | Conservative tagging (only `success` for `done` tasks, `unknown` otherwise); human can override |
| 8 Telegram bots hit rate limits | LOW | LOW | Shared message queue with per-bot rate limiting; batch non-urgent messages |
| Stage timeout values are too aggressive | MEDIUM | HIGH | Start with generous timeouts (2x current config); tune from collected metrics |
| DB migration for pipeline_stage column | LOW | LOW | Backwards-compatible migration; new column is nullable with backfill |

## Success Criteria

1. A task created via `pipeline.start` advances through all 10 stages automatically
   without any agent explicitly calling a stage-advance tool
2. Stage timeouts trigger escalation within the configured window (±10%)
3. Spawn failures are retried at least once; dead-letter messages appear in Telegram
4. Decision circuit breaker correctly counts per-agent, not globally
5. Decision timeouts trigger escalation for both `pause` and `escalate` policies
6. Per-stage metrics are queryable via `pipeline.metrics` tool
7. All 8 agents have distinct bot identities in Telegram
8. Human can approve/reject decisions via Telegram commands
9. `pnpm test` passes with new E2E scenarios covering advancement, timeout, retry,
   spawn failure, and decision timeout paths
10. No regression: all 906 existing tests continue to pass

## References

- [EP08 Backlog](EP08-autonomous-product-team.md) — predecessor epic
- [Error Recovery Patterns](../error-recovery.md) — existing recovery guide
- [Extension Integration Patterns](../extension-integration.md) — topology
- [API Reference](../api-reference.md) — complete tool reference
- [Product Team Plugin Report](../reports/product-team-plugin.md) — architecture deep-dive
