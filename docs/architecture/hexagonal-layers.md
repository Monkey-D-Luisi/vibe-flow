# Hexagonal Layers

Component diagram showing the product-team extension's hexagonal (ports and
adapters) architecture with strict inward dependency flow.

```mermaid
graph TB
    subgraph L5["Layer 5: GitHub (outermost)"]
        GHC["gh-client<br/>GitHub CLI wrapper"]
        BS["branch-service<br/>Branch creation"]
        PS["pr-service<br/>PR create/update"]
        LS["label-sync<br/>PR label management"]
        IK["idempotency-keys<br/>Duplicate prevention"]
    end

    subgraph L4["Layer 4: Tools"]
        TC["task-create"]
        TG2["task-get"]
        TS["task-search"]
        TU["task-update"]
        TT["task-transition"]
        VB["vcs-branch-create"]
        VP["vcs-pr-create"]
        PS2["pipeline-start"]
        PA["pipeline-advance"]
        QG["quality-gate"]
        DV["decision-evaluate"]
        TM["team-message"]
    end

    subgraph L3["Layer 3: Orchestrator"]
        SM["state-machine<br/>Transition guards"]
        SR["step-runner<br/>Workflow execution"]
        EL["event-logger<br/>Append-only events"]
        LM["lease-manager<br/>Exclusive ownership"]
        PO["pipeline-orchestrator<br/>Stage advancement"]
        DN["decision-engine<br/>Auto / escalate / pause"]
        BM["budget-manager<br/>Cost enforcement"]
    end

    subgraph L2["Layer 2: Persistence"]
        TR["task-repository<br/>CRUD operations"]
        ER["event-repository<br/>Event log queries"]
        DR["decision-repository<br/>Decision log"]
        MG["migrations<br/>Schema versioning"]
        DB[("SQLite<br/>WAL mode, FK on")]
    end

    subgraph L1["Layer 1: Domain (innermost)"]
        TST["task-status<br/>Status enum + rules"]
        TRC["task-record<br/>Domain model"]
        ERR["errors<br/>Domain exceptions"]
        TYP["types<br/>Shared type defs"]
        POL["policies<br/>Decision policy defs"]
    end

    L4 --> L3
    L3 --> L2
    L2 --> L1
    L5 --> L3
    L2 --> DB

    style L5 fill:#f5f5f5,stroke:#616161
    style L4 fill:#e3f2fd,stroke:#1565c0
    style L3 fill:#e8f5e9,stroke:#2e7d32
    style L2 fill:#f3e5f5,stroke:#6a1b9a
    style L1 fill:#fff3e0,stroke:#e65100
```

**What this shows:** The product-team extension follows hexagonal architecture
with 5 layers where dependencies flow strictly inward. The Domain layer
(innermost) has zero external dependencies — pure types and business rules.
Persistence wraps SQLite access behind repository interfaces. The Orchestrator
contains the state machine, pipeline logic, and decision engine. Tools are thin
MCP adapters that validate input and delegate to the orchestrator. GitHub
(outermost) is isolated for easy mocking and disabling.
