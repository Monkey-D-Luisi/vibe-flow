# Agent Communication

Sequence diagram showing inter-agent messaging, spawn mechanism, and decision
escalation patterns.

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant A1 as Agent A (sender)
    participant GW as OpenClaw Gateway
    participant A2 as Agent B (receiver)
    participant DE as Decision Engine
    participant TG as Telegram
    participant HU as Human

    Note over O,A2: Direct Inter-Agent Messaging
    A1->>GW: team.message(to: "agent-b", body: {...})
    GW->>A2: Route message to recipient
    A2-->>GW: team.reply(messageId, response)
    GW-->>A1: Deliver reply

    Note over O,A2: Agent Spawn (Pipeline Stage Handoff)
    O->>GW: spawn(agentId: "qa", task: {...})
    GW->>GW: Apply tool policies for qa role
    GW->>A2: Start agent session with task context
    A2->>A2: Execute stage work
    A2->>O: pipeline.advance(stageResult)

    Note over DE,HU: Decision Escalation
    A1->>DE: decision.evaluate(type, context)
    alt Auto-resolve
        DE-->>A1: Decision: approved (auto)
    else Escalate
        DE->>TG: Send escalation with inline buttons
        TG->>HU: [Approve] [Reject]
        HU->>TG: Tap [Approve]
        TG->>DE: Callback: approved
        DE-->>A1: Decision: approved (human)
    else Pause
        DE->>TG: Pipeline paused - awaiting approval
        DE->>O: Halt pipeline
        HU->>TG: /approve decision-id
        TG->>DE: Resume
        DE->>O: Continue pipeline
    end

    Note over A1,TG: Broadcast Notifications
    O->>TG: Stage transition notification
    O->>TG: Quality gate results
    O->>TG: Budget alerts
```

**What this shows:** Agents communicate through three patterns: (1) direct
messaging via `team.message`/`team.reply` through the gateway, (2) agent
spawn for pipeline stage handoffs where the orchestrator starts a new agent
session, and (3) decision escalation where the decision engine routes
decisions to auto-resolve, escalate via Telegram, or pause the pipeline
for human approval.
