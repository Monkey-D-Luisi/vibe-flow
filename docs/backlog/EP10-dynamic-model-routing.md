# EP10 -- Dynamic Model Routing

> Status: DONE
> Dependencies: EP09
> Phase: 10 (Adaptive Intelligence)
> Target: March 2026

## Motivation

The model-router extension exists with a commented-out `before_model_resolve` hook
(see `extensions/model-router/src/index.ts`). Static routing via `agents.list[].model`
is active, but every agent always uses its configured primary model regardless of task
complexity, remaining budget, or provider health. With limited token budget and
copilot-proxy free-tier fallbacks available, dynamic routing is a survival feature.

**Current state:**
- Provider health endpoint: `/api/providers/health` (live)
- Static model config: `agents.list[].model` with `{ primary, fallbacks }` (live)
- Auth profiles: token, OAuth, copilot-proxy (live)
- Dynamic routing hook: `before_model_resolve` (commented out, reserved)

**Target state:**
- Every LLM request evaluates complexity, budget, and provider health before routing.
- Simple tasks (docs, commit messages, label sync) use free/cheap models automatically.
- Complex tasks (architecture, security review, code generation) use premium models.
- Provider outages trigger automatic failover within 30 seconds.
- Budget exhaustion triggers graceful downgrade, not pipeline failure.

## Task Breakdown

### 10A: Scoring & Health (parallel)

#### Task 0079: Task Complexity Scoring Engine

**Scope:** Create a scoring function that evaluates task complexity from available
metadata and produces a numeric score (0-100) used by the model resolver.

**Inputs (all available from existing TaskRecord + pipeline metadata):**
- Task scope (`minor` | `major` | `critical`)
- Pipeline stage (`IDEA` vs `IMPLEMENTATION` vs `CODE_REVIEW`)
- Agent role (PM/PO tasks are typically simpler than architecture/backend)
- Historical stage duration for this task type
- Number of files changed (if available from prior stages)
- Step type (`llm-task` complexity varies by schema)

**Scoring algorithm (rule-based, not ML):**

```
Base score by scope:    minor=20, major=50, critical=80
Stage modifier:         IDEA/ROADMAP/REFINEMENT=−10, IMPLEMENTATION/REVIEW=+15, QA=+5
Role modifier:          PM/PO=−10, designer=0, backend/frontend=+10, tech-lead=+15
Historical adjustment:  if avg_duration > 2x median for this stage → +10
```

**Output:** `ComplexityScore { score: number, tier: 'low' | 'medium' | 'high', factors: Factor[] }`

**Files to create/modify:**
- `extensions/model-router/src/complexity-scorer.ts` (new)
- `extensions/model-router/test/complexity-scorer.test.ts` (new)

**Acceptance criteria:**
- Score function is pure (no side effects, no DB access)
- All scoring factors are configurable via plugin config
- >= 90% test coverage with edge cases (missing metadata, unknown stage)
- Score is deterministic for the same inputs

---

#### Task 0080: Provider Health Integration for Routing

**Scope:** Extend the existing `/api/providers/health` endpoint to produce a
machine-readable health status per provider and expose it to the model resolver
via an in-memory cache with configurable TTL.

**Current state:** The health endpoint pings providers and returns human-readable
status. It does not cache results or expose them programmatically to other modules.

**Deliverables:**
- `ProviderHealthCache` class with configurable TTL (default 60s)
- Background health check loop (configurable interval, default 120s)
- Health status enum: `HEALTHY | DEGRADED | DOWN`
- Latency tracking per provider (rolling average over last 10 checks)
- Event emission on status change (for alerting integration)

**Files to create/modify:**
- `extensions/model-router/src/provider-health-cache.ts` (new)
- `extensions/model-router/src/provider-health-cache.test.ts` (new)
- `extensions/model-router/src/provider-health.ts` (modify: add cache integration)

**Acceptance criteria:**
- Cache returns last-known-good status when provider is unreachable
- TTL expiry triggers async refresh (stale-while-revalidate pattern)
- Status change emits event via `api.emit()` for downstream consumers
- >= 90% test coverage including TTL expiry and status transitions

---

### 10B: Resolver Implementation (sequential after 10A)

#### Task 0081: Dynamic Model Resolver Hook

**Scope:** Implement the `before_model_resolve` hook that reads complexity score
and provider health to select the optimal model for each LLM request.

**Resolution algorithm:**

```
1. Compute complexity score (Task 0079)
2. Read provider health cache (Task 0080)
3. Read budget remaining (EP11, or skip if not yet available)
4. Apply routing rules:
   - If complexity.tier == 'low' AND copilot-proxy is healthy → use free model
   - If complexity.tier == 'high' → use primary model (opus/gpt-5.3)
   - If primary provider is DOWN → use first healthy fallback
   - If budget remaining < 20% → downgrade one tier
5. Return resolved model ID
```

**Fallback behavior:** If the hook throws or times out (> 500ms), fall through
to static routing. The hook must never block pipeline execution.

**Files to create/modify:**
- `extensions/model-router/src/model-resolver.ts` (new)
- `extensions/model-router/src/model-resolver.test.ts` (new)
- `extensions/model-router/src/index.ts` (modify: activate hook)

**Acceptance criteria:**
- Hook activates only if `config.dynamicRouting.enabled` is true
- Resolver completes in < 100ms for 99th percentile
- Fallback to static routing on any error
- Resolution decision logged to structured log with correlation ID
- >= 90% test coverage including timeout and error fallback paths

---

#### Task 0082: Cost-Aware Model Tier Downgrade

**Scope:** Integrate with the budget tracking system (EP11, or existing event-log
cost data) to automatically downgrade model tier when budget consumption crosses
configurable thresholds.

**Tier definitions:**

| Tier | Models | Trigger |
|------|--------|---------|
| Premium | claude-opus, gpt-5.3 | budget > 50% remaining |
| Standard | claude-sonnet, gpt-4.1 | budget 20-50% remaining |
| Economy | copilot-proxy models | budget < 20% remaining |

**Behavior:**
- Downgrade is per-request, not permanent. If budget is replenished, tier upgrades.
- High-complexity tasks (score > 70) resist downgrade by one tier (economy floor).
- `/budget` Telegram command shows current tier allocation.

**Files to create/modify:**
- `extensions/model-router/src/cost-aware-router.ts` (new)
- `extensions/model-router/src/cost-aware-router.test.ts` (new)
- `extensions/model-router/src/model-resolver.ts` (modify: integrate cost tier)

**Acceptance criteria:**
- Tier boundaries configurable via plugin config
- High-complexity override prevents critical tasks from using economy tier
- Downgrade decision logged with budget snapshot
- >= 90% test coverage

---

### 10C: Fallback Resolution (sequential after 10B)

#### Task 0083: Fallback Chain with Copilot-Proxy Resolution

**Scope:** Implement ordered fallback chain resolution that tries each configured
fallback model in order, with special handling for copilot-proxy (GitHub Copilot
free-tier) as the ultimate fallback.

**Fallback chain logic:**

```
1. Try resolved model from 10B
2. If provider health == DOWN for resolved model:
   a. Try each fallback in agents.list[agentId].model.fallbacks order
   b. Skip fallbacks whose provider is DOWN
   c. If all named fallbacks exhausted → try copilot-proxy
3. If copilot-proxy is also DOWN → fail with structured error
4. Log the full resolution chain (attempted → selected) for debugging
```

**Copilot-proxy specifics:**
- Uses `auth-profiles.json` copilot-proxy entry for authentication
- Model capabilities may differ (no function calling in some cases)
- Resolver annotates the request with `{ fallbackLevel: 'copilot-proxy' }`
  so downstream can adjust expectations (e.g., simpler prompts)

**Files to create/modify:**
- `extensions/model-router/src/fallback-chain.ts` (new)
- `extensions/model-router/src/fallback-chain.test.ts` (new)
- `extensions/model-router/src/model-resolver.ts` (modify: integrate fallback chain)

**Acceptance criteria:**
- Full fallback chain documented in resolution log
- Copilot-proxy fallback works with existing auth-profiles config
- Capability annotations propagated to downstream consumers
- Failover completes in < 30s total (including retries)
- >= 90% test coverage including all-providers-down scenario

## Definition of Done

- [ ] All 5 tasks completed with >= 90% test coverage each
- [ ] `before_model_resolve` hook is active and routing dynamically
- [ ] Provider failover completes in < 30s
- [ ] Copilot-proxy fallback works as economy-tier last resort
- [ ] Cost-aware downgrade activates at configured budget thresholds
- [ ] All routing decisions logged with structured correlation IDs
- [ ] `pnpm test && pnpm lint && pnpm typecheck` passes
- [ ] Integration test: pipeline completes with primary provider mocked as DOWN
