# Decision Engine

Flowchart showing the decision engine's auto/escalate/pause paths with
circuit breaker and timeout handling.

```mermaid
flowchart TD
    START([Decision Request]) --> EVAL{Evaluate<br/>Policy Type}

    EVAL -->|auto| AUTO[Apply Auto-Rule]
    EVAL -->|escalate| ESC[Route to Escalation Target]
    EVAL -->|pause| PAUSE[Halt Pipeline]

    AUTO --> CHECK_CB{Circuit Breaker<br/>Check}
    CHECK_CB -->|healthy| EXECUTE[Execute Auto-Decision]
    CHECK_CB -->|tripped| ESC

    EXECUTE --> LOG_AUTO[Log Decision<br/>outcome: auto-resolved]
    LOG_AUTO --> CONTINUE([Continue Pipeline])

    ESC --> NOTIFY[Send Telegram<br/>with Inline Buttons]
    NOTIFY --> WAIT{Await<br/>Response}

    WAIT -->|approved| LOG_ESC_OK[Log Decision<br/>outcome: human-approved]
    WAIT -->|rejected| LOG_ESC_REJ[Log Decision<br/>outcome: human-rejected]
    WAIT -->|timeout| TIMEOUT[Apply Default Action]

    LOG_ESC_OK --> CONTINUE
    LOG_ESC_REJ --> RETRY{Retry<br/>Available?}
    RETRY -->|yes| REQUEUE[Re-queue with<br/>adjusted context]
    RETRY -->|no| FAIL([Pipeline Failed])
    REQUEUE --> EVAL

    TIMEOUT --> LOG_TIMEOUT[Log Decision<br/>outcome: timeout-default]
    LOG_TIMEOUT --> CONTINUE

    PAUSE --> NOTIFY_PAUSE[Send Telegram<br/>Pipeline Paused alert]
    NOTIFY_PAUSE --> AWAIT_HUMAN{Await<br/>Human Action}
    AWAIT_HUMAN -->|/approve| RESUME[Resume Pipeline]
    AWAIT_HUMAN -->|/reject| ABORT([Abort Pipeline])
    RESUME --> LOG_PAUSE[Log Decision<br/>outcome: pause-resolved]
    LOG_PAUSE --> CONTINUE

    subgraph Learning["Learning Loop (EP12)"]
        LOG_AUTO --> PATTERN[Pattern Analyzer]
        LOG_ESC_OK --> PATTERN
        LOG_ESC_REJ --> PATTERN
        LOG_TIMEOUT --> PATTERN
        PATTERN --> ADAPT{Override Rate<br/>> Threshold?}
        ADAPT -->|yes| TIGHTEN[Tighten Policy<br/>auto → escalate]
        ADAPT -->|no| RELAX_CHECK{Success Rate<br/>> Threshold?}
        RELAX_CHECK -->|yes| RELAX[Relax Policy<br/>escalate → auto]
        RELAX_CHECK -->|no| KEEP[Keep Current Policy]
    end

    style START fill:#e3f2fd,stroke:#1565c0
    style CONTINUE fill:#e8f5e9,stroke:#2e7d32
    style FAIL fill:#ffebee,stroke:#c62828
    style ABORT fill:#ffebee,stroke:#c62828
    style Learning fill:#fff3e0,stroke:#e65100
```

**What this shows:** When a decision is requested, the engine evaluates the
policy type. **Auto** decisions execute immediately (unless the circuit breaker
is tripped, which escalates instead). **Escalate** decisions notify via Telegram
with approve/reject buttons — timeouts apply a default action. **Pause** decisions
halt the pipeline until explicit human approval. All outcomes are logged and fed
to the learning loop (EP12), which adjusts policies based on override and success
rates.
