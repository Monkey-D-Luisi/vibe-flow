# Quality Gates

Flowchart showing the quality gate evaluation pipeline used at stage
transitions.

```mermaid
flowchart TD
    TRIGGER([Stage Transition<br/>Requested]) --> COLLECT[Collect Gate<br/>Configuration]

    COLLECT --> SCOPE{Task<br/>Scope?}
    SCOPE -->|MAJOR| MAJOR_TH["Thresholds:<br/>Coverage ≥ 80%<br/>Lint errors = 0<br/>TS errors = 0<br/>Complexity ≤ 5.0"]
    SCOPE -->|MINOR| MINOR_TH["Thresholds:<br/>Coverage ≥ 70%<br/>Lint errors = 0<br/>TS errors = 0<br/>Complexity ≤ 5.0"]

    MAJOR_TH --> EVAL
    MINOR_TH --> EVAL

    subgraph EVAL["Gate Evaluation"]
        direction TB
        T1["🧪 Tests<br/>pnpm test"]
        T2["📊 Coverage<br/>Parse lcov/json"]
        T3["🔍 Lint<br/>pnpm lint"]
        T4["📐 Complexity<br/>AST or regex analysis"]
        T5["✅ TypeCheck<br/>pnpm typecheck"]
    end

    EVAL --> AGGREGATE[Aggregate<br/>Results]

    AGGREGATE --> VERDICT{All Gates<br/>Pass?}

    VERDICT -->|yes| PASS[Gate: PASS]
    VERDICT -->|no| VIOLATIONS[List Violations]

    PASS --> LOG_PASS[Log to Event Log<br/>type: quality_gate]
    LOG_PASS --> ADVANCE([Advance Pipeline<br/>Stage])

    VIOLATIONS --> SEVERITY{Blocking<br/>Violations?}
    SEVERITY -->|yes| BLOCK[Gate: FAIL]
    SEVERITY -->|no| WARN_PASS[Gate: PASS<br/>with warnings]

    BLOCK --> LOG_FAIL[Log to Event Log<br/>type: quality_gate]
    LOG_FAIL --> DECIDE{Decision<br/>Engine}
    DECIDE -->|auto: retry| RETRY([Retry Stage])
    DECIDE -->|escalate| ESCALATE([Escalate to Human])

    WARN_PASS --> LOG_WARN[Log to Event Log<br/>with warning details]
    LOG_WARN --> ADVANCE

    subgraph Tools["Two Quality Tool Sets"]
        direction LR
        QT["quality_* tools<br/>(product-team)<br/>AST-based, task-aware<br/>Higher accuracy"]
        QG["qgate_* tools<br/>(quality-gate)<br/>Regex-based, stateless<br/>Faster execution"]
    end

    style TRIGGER fill:#e3f2fd,stroke:#1565c0
    style ADVANCE fill:#e8f5e9,stroke:#2e7d32
    style RETRY fill:#fff3e0,stroke:#e65100
    style ESCALATE fill:#ffebee,stroke:#c62828
    style Tools fill:#f3e5f5,stroke:#6a1b9a
```

**What this shows:** When a pipeline stage transition is requested, the system
evaluates quality gates against scope-dependent thresholds (MAJOR tasks require
80% coverage, MINOR tasks require 70%). Five checks run: tests, coverage, lint,
complexity, and type checking. If all pass, the pipeline advances. Blocking
violations trigger the decision engine (auto-retry or human escalation).
Non-blocking violations generate warnings but allow advancement. Two separate
tool sets exist: `quality_*` (AST-based, task-aware) for pipeline enforcement
and `qgate_*` (regex-based, stateless) for fast CLI scans.
