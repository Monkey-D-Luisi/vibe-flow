# Budget Flow

Flowchart showing budget enforcement, model tier downgrade, and alerting.

```mermaid
flowchart TD
    REQ([LLM Request]) --> CHECK{Budget<br/>Check}

    CHECK -->|within budget| ROUTE[Route to<br/>Assigned Model]
    CHECK -->|warning threshold| WARN[Log Budget Warning]
    CHECK -->|hard limit reached| BLOCK([Request Blocked<br/>Pipeline Paused])

    WARN --> DOWN{Cost-Aware<br/>Routing}
    DOWN -->|above 80%| DOWNGRADE[Downgrade Model Tier<br/>e.g., opus → haiku]
    DOWN -->|below 80%| ROUTE

    ROUTE --> LLM[Send to LLM Provider]
    DOWNGRADE --> LLM

    LLM --> RESP[Response Received]
    RESP --> TRACK[Track Token<br/>Consumption]

    TRACK --> UPDATE[Update Budget<br/>Counters]

    UPDATE --> PER_PIPE[Per-Pipeline<br/>Budget]
    UPDATE --> PER_AGT[Per-Agent<br/>Budget]

    PER_PIPE --> FORECAST{Forecast<br/>Check}
    PER_AGT --> FORECAST

    FORECAST -->|on track| OK([Continue])
    FORECAST -->|overspend risk| ALERT[Telegram<br/>Budget Alert]
    ALERT --> ADJUST[Auto-Adjust<br/>Routing Tiers]
    ADJUST --> OK

    BLOCK --> NOTIFY[Telegram<br/>Budget Exhausted]
    NOTIFY --> HUMAN{Human Action}
    HUMAN -->|increase budget| RESUME([Resume])
    HUMAN -->|abort| ABORT([Abort Pipeline])

    subgraph Visibility["Telegram /budget Dashboard"]
        DASH["Pipeline budget remaining<br/>Per-agent consumption<br/>Forecast to completion<br/>Model tier assignments"]
    end

    UPDATE -.-> DASH

    style REQ fill:#e3f2fd,stroke:#1565c0
    style OK fill:#e8f5e9,stroke:#2e7d32
    style BLOCK fill:#ffebee,stroke:#c62828
    style ABORT fill:#ffebee,stroke:#c62828
    style Visibility fill:#fff3e0,stroke:#e65100
```

**What this shows:** Every LLM request passes through budget checks. If budget
is within limits, the request routes normally. At the warning threshold (80%),
the cost-aware router automatically downgrades the model tier (e.g., from
claude-3-opus to claude-3-haiku). At the hard limit, the pipeline pauses and
alerts the human operator via Telegram. Token consumption is tracked per-pipeline
and per-agent, with forecasting that triggers proactive alerts when overspend
is likely. The `/budget` Telegram command provides real-time visibility into
all budget metrics.
