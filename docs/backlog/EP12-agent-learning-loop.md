# EP12 -- Agent Learning Loop

> Status: PENDING
> Dependencies: EP10, EP11
> Phase: 10 (Adaptive Intelligence)
> Target: April 2026

## Motivation

EP09 task 0071 added decision outcome tracking: every auto-resolved decision is
tagged with `success`, `overridden`, or `failed` based on task completion. This
data is being collected but never read. EP12 closes the feedback loop — reading
outcome history to improve future routing, escalation, and template selection.

This is explicitly **rule-based pattern detection**, not machine learning. The
patterns are simple: "if decision X was overridden 3 times, stop auto-resolving
and escalate instead." No training, no models, no data pipelines.

**Current state:**
- Decision outcome tracking: every decision has `outcome` field (live, EP09)
- Circuit breaker per agent: tracks consecutive failures (live, EP09)
- Per-stage metrics: duration, token cost, retry count (live, EP09)
- Model routing: always static (live, to be dynamic in EP10)
- No pattern detection, no feedback loop, no learning

**Target state:**
- System detects when auto-decisions are consistently overridden and adapts.
- Agent × model × task-type performance scoring informs routing decisions.
- Historical output patterns reduce redundant work (pre-loaded templates).
- Feedback flows back into EP10's model resolver for continuous optimization.

## Task Breakdown

### 10A: Pattern Detection (parallel)

#### Task 0089: Decision Outcome Pattern Analyzer

**Scope:** Build an analysis engine that reads decision outcome history from the
event log and detects actionable patterns.

**Pattern types:**

| Pattern | Detection Rule | Action |
|---------|---------------|--------|
| Escalation candidate | Decision category X auto-resolved then overridden >= 3 times in last 10 decisions | Change policy to `escalate` for this category + agent combo |
| Auto-resolution candidate | Decision category X always escalated but human always approves with same answer | Change policy to `auto` with the common answer |
| Failure cluster | Agent Y's decisions fail >= 50% in stage Z | Alert, suggest model upgrade for agent Y in stage Z |
| Timeout pattern | Decision category X consistently times out | Increase timeout or change to `pause` policy |

**Analysis cadence:**
- After every pipeline completion (all stages done)
- On-demand via new tool `decision_patterns` (read-only)

**Data source:** Event log entries with `type: 'decision_*'` and `outcome` field.

**Output:**

```typescript
interface PatternReport {
  analyzedDecisions: number;
  timeRange: { from: string; to: string };
  patterns: Pattern[];
  recommendations: Recommendation[];
}

interface Pattern {
  type: 'escalation_candidate' | 'auto_candidate' | 'failure_cluster' | 'timeout_pattern';
  agentId: string;
  category: string;
  confidence: number;  // 0-1
  evidence: { decisionId: string; outcome: string }[];
}

interface Recommendation {
  patternType: string;
  action: 'change_policy' | 'adjust_timeout' | 'upgrade_model' | 'alert_human';
  details: Record<string, unknown>;
  confidence: number;
}
```

**Files to create/modify:**
- `extensions/product-team/src/orchestrator/decision-pattern-analyzer.ts` (new)
- `extensions/product-team/src/tools/decision-patterns.ts` (new: read-only tool)
- Tests for all new files

**Acceptance criteria:**
- Analyzer processes last N decisions (configurable, default 100)
- Confidence threshold required before recommendation (default >= 0.7)
- Patterns are idempotent (re-analysis produces same results)
- New tool `decision_patterns` registered and documented
- >= 90% test coverage with synthetic decision history

---

#### Task 0090: Adaptive Escalation Policy Engine

**Scope:** Automatically adjust the decision engine's escalation policies based
on patterns detected by task 0089.

**Policy adjustment rules:**

```
IF pattern.type == 'escalation_candidate' AND confidence >= 0.8:
  → Set decision policy for (category, agentId) to 'escalate'
  → Log policy change with evidence trail
  → Notify via Telegram: "Auto-escalating {category} decisions for {agent} based on {N} overrides"

IF pattern.type == 'auto_candidate' AND confidence >= 0.9:
  → Set decision policy for (category, agentId) to 'auto'
  → Include the common answer as default
  → Log policy change with evidence trail
  → Notify via Telegram: "Auto-resolving {category} decisions for {agent} based on {N} consistent approvals"
```

**Safety constraints:**
- Policy changes are logged as events (full audit trail)
- Maximum one policy change per category per analysis cycle (no oscillation)
- Human can override any adaptive policy via Telegram `/decisions override`
- Dampening: if a policy was changed in the last 5 pipeline runs, skip re-analysis

**Files to create/modify:**
- `extensions/product-team/src/orchestrator/adaptive-escalation.ts` (new)
- `extensions/product-team/src/tools/decision-engine.ts` (modify: read adaptive policies)
- Tests for all new files

**Acceptance criteria:**
- Policy changes apply to future decisions only (not retroactive)
- Dampening prevents oscillation between auto and escalate
- All policy changes logged with evidence and confidence score
- Human override via Telegram takes precedence
- >= 90% test coverage with oscillation prevention scenarios

---

### 10B: Performance Scoring (sequential after 10A)

#### Task 0091: Agent-Model Performance Scorer

**Scope:** Score the effectiveness of each agent × model combination across
different task types, using metrics already collected in EP09.

**Scoring dimensions:**

| Dimension | Data Source | Weight |
|-----------|------------|--------|
| Success rate | Task final status (done vs failed/cancelled) | 40% |
| Quality score | Quality gate results at stage transitions | 25% |
| Token efficiency | Tokens consumed vs stage median | 20% |
| Duration efficiency | Time spent vs stage median | 15% |

**Score computation:**

```typescript
interface AgentModelScore {
  agentId: string;
  modelId: string;
  taskType: string;        // pipeline stage or task scope
  sampleSize: number;
  score: number;           // 0-100 composite
  dimensions: {
    successRate: number;   // 0-100
    qualityScore: number;  // 0-100
    tokenEfficiency: number; // 0-100 (100 = median, <100 = above median consumption)
    durationEfficiency: number; // 0-100
  };
  trend: 'improving' | 'stable' | 'degrading';
  lastUpdated: string;
}
```

**Routing integration (feeds EP10):**
- Expose `getBestModel(agentId, taskType): ModelRecommendation`
- EP10's model resolver calls this to bias routing toward proven combinations
- If no historical data → return null (fall through to default routing)

**Files to create/modify:**
- `extensions/product-team/src/orchestrator/agent-model-scorer.ts` (new)
- `extensions/model-router/src/scoring-integration.ts` (new: query scorer)
- Tests for all new files

**Acceptance criteria:**
- Scores computed from real event log data
- Minimum sample size required before scoring (default 5 completions)
- Trend detection uses last 3 scores vs previous 3
- Integration with EP10 model resolver is optional (feature flag)
- >= 90% test coverage

---

#### Task 0092: Dynamic Template Pre-Loading

**Scope:** Detect when agents consistently produce similar output structures for
the same task type and pre-load those structures as prompt templates to reduce
token consumption.

**Template detection:**

```
1. For each (agentId, stage, schema) combination:
   a. Collect last N successful outputs from event log
   b. Extract structural skeleton (keys, types, but not values)
   c. If >= 80% of outputs share the same skeleton → create template
2. Template = structural skeleton + common boilerplate sections
3. Pre-load template as system prompt prefix: "Based on prior work, start with this structure: ..."
```

**Template lifecycle:**
- Templates stored in SQLite (new table: `output_templates`)
- Template expires after 20 pipeline runs without use
- Template versioned: if output pattern shifts, template updates
- Agent can override template by producing different structure (no hard constraint)

**Files to create/modify:**
- `extensions/product-team/src/orchestrator/template-detector.ts` (new)
- `extensions/product-team/src/persistence/template-repo.ts` (new)
- `extensions/product-team/src/persistence/migrations/` (add template table)
- Tests for all new files

**Acceptance criteria:**
- Template detection is conservative (80% structural match threshold)
- Templates reduce token consumption measurably (logged in metrics)
- Agent output is not constrained by template (it's a suggestion, not a constraint)
- Template expiry prevents stale patterns
- >= 90% test coverage

---

### 10C: Feedback Loop (sequential after 10B)

#### Task 0093: Routing Feedback Loop Integration

**Scope:** Wire the performance scorer (task 0091) into EP10's model resolver
as a feedback signal, creating a closed loop: routing → execution → scoring →
improved routing.

**Integration architecture:**

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ Task starts  │ ──→ │ Model Router │ ──→ │ LLM Request │
│              │     │ (EP10)       │     │             │
└─────────────┘     └──────┬───────┘     └──────┬──────┘
                           │                     │
                    queries scores          produces metrics
                           │                     │
                    ┌──────┴───────┐     ┌──────┴──────┐
                    │ Performance  │ ←── │ Event Log   │
                    │ Scorer       │     │ (EP09)      │
                    │ (Task 0091)  │     │             │
                    └──────────────┘     └─────────────┘
```

**Resolver enhancement:**

```
Current (EP10): complexity + health + budget → model
With feedback:  complexity + health + budget + performance_score → model

If scorer recommends a different model than default routing:
  - If scorer confidence > 0.7 AND sample_size >= 5 → use scorer recommendation
  - Else → use default routing
  - Log both recommendations for future scoring
```

**Files to create/modify:**
- `extensions/model-router/src/model-resolver.ts` (modify: add scoring query)
- `extensions/model-router/src/scoring-integration.ts` (modify: full integration)
- Tests for modifications

**Acceptance criteria:**
- Scoring feedback improves routing over time (measurable in logs)
- Low-confidence scores do not override default routing
- Feedback loop does not create oscillation (dampening built in)
- All routing decisions log both default and scored recommendations
- >= 90% test coverage

## Definition of Done

- [ ] All 5 tasks completed with >= 90% test coverage each
- [ ] Decision patterns detected and reported via `decision_patterns` tool
- [ ] Escalation policies adapt based on outcome history
- [ ] Agent × model performance scores computed from real metrics
- [ ] Templates pre-loaded for recurring output patterns
- [ ] Routing feedback loop active (scorer influences model selection)
- [ ] No feedback oscillation (dampening verified in tests)
- [ ] `pnpm test && pnpm lint && pnpm typecheck` passes
