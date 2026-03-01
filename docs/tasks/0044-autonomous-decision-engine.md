# Task 0044 -- Autonomous Decision Engine

| Field        | Value                                                |
|--------------|------------------------------------------------------|
| Task         | 0044                                                 |
| Epic         | EP08 — Autonomous Product Team                       |
| Phase        | 8C — Autonomous Orchestration                        |
| Status       | DONE                                                 |
| Dependencies | 0038, 0043 (Agent roster + messaging)                |
| Blocks       | 0042 (Orchestrator uses decision engine)             |

## Goal

Build the decision engine that enables agents to make autonomous choices when
facing ambiguity — without blocking the pipeline to ask the human. Configurable
escalation policies determine when to auto-decide vs escalate to Tech Lead vs
notify the human.

## Context

In autonomous mode, agents will encounter decisions that aren't fully specified:
- Which library to use for a new feature?
- How to handle a failing test — fix it, skip it, or report it?
- Whether a design meets acceptance criteria?
- How to prioritize two conflicting requirements?

The decision engine provides a framework for agents to evaluate options and
make consistent, auditable decisions.

## Deliverables

### D1: Decision Framework

Define decision categories with default policies:

| Category | Examples | Default Policy |
|----------|---------|---------------|
| **Technical** | Library choice, API design, schema format | Agent decides autonomously, log reasoning |
| **Scope** | Feature inclusion/exclusion, MVP vs full | Escalate to Tech Lead |
| **Quality** | Skip flaky test, accept lower coverage | Escalate to Tech Lead, notify Telegram |
| **Conflict** | Contradicting requirements, design vs spec | Escalate to PO, notify Telegram |
| **Budget** | Task exceeding token budget | Auto-pause, notify Telegram |
| **Blocker** | External service down, missing dependency | Retry, then notify Telegram |

### D2: Decision Tool

#### `decision.evaluate`
- **Input**: `{ category: string, question: string, options: Array<{ id, description, pros, cons }>, taskRef?: string }`
- **Output**: `{ decision: string, reasoning: string, escalated: boolean, approver?: string }`
- The agent formulates the decision, the engine applies the policy:
  - If policy = "auto": return the agent's recommendation as the decision
  - If policy = "escalate": create inter-agent message to the appropriate escalation target, return `escalated: true`
  - If policy = "human": forward to Telegram, return `escalated: true`

#### `decision.log`
- **Input**: `{ taskRef: string }`
- **Output**: `{ decisions: Array<{ category, question, decision, reasoning, decidedBy, timestamp }> }`
- Audit trail of all decisions made for a task

### D3: Escalation Configuration

```jsonc
{
  "decisions": {
    "policies": {
      "technical": { "action": "auto", "notify": false },
      "scope": { "action": "escalate", "target": "tech-lead", "notify": true },
      "quality": { "action": "escalate", "target": "tech-lead", "notify": true },
      "conflict": { "action": "escalate", "target": "po", "notify": true },
      "budget": { "action": "pause", "notify": true },
      "blocker": { "action": "retry", "maxRetries": 2, "notify": true }
    },
    "timeoutMs": 300000,
    "humanApprovalTimeout": 3600000
  }
}
```

### D4: Circuit Breaker

Prevent infinite decision loops:
- Max 5 decisions per agent per task before mandatory escalation
- Max 3 escalations per task before human notification
- If human doesn't respond within `humanApprovalTimeout`, auto-decide with
  the safest option (most conservative)

### D5: Decision Persistence

Store decisions in the event log with structured metadata:

```json
{
  "type": "decision",
  "taskId": "...",
  "agentId": "back-1",
  "category": "technical",
  "question": "Which HTTP client library to use?",
  "options": [...],
  "decision": "option-a",
  "reasoning": "Better TypeScript types, smaller bundle, active maintenance",
  "escalated": false,
  "timestamp": "..."
}
```

## Acceptance Criteria

- [x] `decision.evaluate` returns autonomous decisions for "auto" policy
- [x] `decision.evaluate` escalates to correct target for "escalate" policy
- [ ] `decision.evaluate` notifies Telegram for policies with `notify: true`
- [x] `decision.log` returns all decisions for a task
- [x] Circuit breaker prevents infinite decision loops
- [ ] Escalation timeout falls back to auto-decide
- [x] All decisions persisted in event log
- [x] Policies are configurable per category
- [ ] Human can approve/reject via Telegram `/approve` and `/reject` commands

## Testing Plan

1. Unit tests: policy evaluation logic for each category
2. Unit tests: circuit breaker thresholds
3. Integration test: auto-decision flow (no escalation)
4. Integration test: escalation flow (message to Tech Lead)
5. Integration test: human notification flow (Telegram)
6. Integration test: timeout fallback to auto-decide

## Technical Notes

- The decision engine is a library, not a standalone service. It's called by
  agents via the `decision.evaluate` tool and by the orchestrator when ambiguity
  is detected.
- Keep decisions lightweight — the agent provides options and reasoning, the
  engine just applies policy. Don't try to have the engine "think" independently.
- Decision audit trail is critical for understanding agent behavior post-hoc.
